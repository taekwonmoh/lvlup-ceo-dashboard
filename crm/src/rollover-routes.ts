/**
 * Staff and family routes for prepaid rollover, tuition credits, and referrals.
 * Draft invoices are stored. No charge is submitted and no message is sent.
 */
import { randomBytes } from 'node:crypto';
import type { Actor } from './auth.ts';
import { CrmError } from './errors.ts';
import { asDay, chicagoToday } from './dates.ts';
import { platformRoleOf, type PlatformRole } from './scope.ts';
import { isLocationId, matchingWorkflows, planEnrollment, type AutomationWorkflow, type LocationAutomationSettings } from './automations.ts';
import { netTuitionCents } from './shadow-billing.ts';
import { billingDecision } from './holds.ts';
import {
  applyTuitionCredits,
  firstRolloverOn,
  isRolloverDraftDate,
  normalizeRolloverCadence,
  periodEndFor,
  tuitionInvoiceLines,
  type CreditLot,
  type RolloverCadence,
} from './rollover.ts';

export type Db = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }>;
  release?: () => void;
};

type PoolLike = Db & { connect: () => Promise<Db> };

const CREDIT_REASONS = new Set(['manual_staff', 'referral_reward', 'promo', 'refund_credit', 'adjustment']);
const TRIGGERS = new Set(['first_paid_membership', 'trial_converted']);
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function dayOrNull(value: unknown) {
  if (value == null || value === '') return null;
  const day = asDay(value);
  if (!day) throw new CrmError(400, 'bad_date', 'Use a YYYY-MM-DD date.');
  return day;
}

function cents(value: unknown, label: string) {
  const n = Number(value);
  if (!Number.isInteger(n)) throw new CrmError(400, 'bad_amount', label + ' must be whole cents.');
  return n;
}

async function withTx<T>(pool: PoolLike, fn: (client: Db) => Promise<T>) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const out = await fn(client);
    await client.query('commit');
    return out;
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release?.();
  }
}

async function familyLocations(db: Db, familyId: string) {
  const rows = await db.query(
    `select location_id from members where family_id = $1
     union select location_id from memberships where family_id = $1
     union select location_id from tuition_credits where family_id = $1
     union select location_id from referral_codes where family_id = $1`,
    [familyId],
  );
  return rows.rows.map(row => String(row.location_id));
}

function assertFamilyRead(actor: Actor, role: PlatformRole, familyId: string, locations: string[]) {
  if (role === 'family') {
    if (!actor.familyIds.includes(familyId)) throw new CrmError(404, 'not_found', 'Not found.');
    return;
  }
  if (role === 'owner') return;
  if (!locations.length || !locations.some(id => actor.locationIds.includes(id))) {
    throw new CrmError(404, 'not_found', 'Not found.');
  }
}

function assertStaffSchool(actor: Actor, role: PlatformRole, locationId: string) {
  if (role === 'family') throw new CrmError(404, 'not_found', 'Not found.');
  if (!isLocationId(locationId)) throw new CrmError(400, 'bad_location', 'Unknown school.');
  if (role !== 'owner' && !actor.locationIds.includes(locationId)) {
    throw new CrmError(404, 'not_found', 'Not found.');
  }
}

async function staffId(db: Db, email: string) {
  const row = await db.query(`select id from staff_users where lower(email) = lower($1) limit 1`, [email]);
  return row.rows[0]?.id || null;
}

export async function creditBalance(db: Db, familyId: string, on: string) {
  const row = await db.query(
    `select coalesce(sum(remaining_cents), 0)::int as cents
     from tuition_credits
     where family_id = $1 and voided = false and remaining_cents > 0
       and (expires_on is null or expires_on >= $2::date)`,
    [familyId, on],
  );
  return row.rows[0].cents as number;
}

async function listCredits(db: Db, familyId: string) {
  const rows = await db.query(
    `select id, member_id, location_id, amount_cents, remaining_cents, reason,
            to_char(expires_on, 'YYYY-MM-DD') as expires_on,
            issued_by, voided, created_at
     from tuition_credits
     where family_id = $1
     order by expires_on nulls last, created_at, id`,
    [familyId],
  );
  return rows.rows.map(row => ({
    id: row.id,
    memberId: row.member_id,
    locationId: row.location_id,
    amountCents: row.amount_cents,
    remainingCents: row.remaining_cents,
    reason: row.reason,
    expiresOn: row.expires_on,
    issuedBy: row.issued_by,
    voided: row.voided,
    createdAt: row.created_at,
  }));
}

async function insertCredit(client: Db, input: {
  familyId: string;
  memberId: string | null;
  locationId: string;
  amountCents: number;
  reason: string;
  expiresOn: string | null;
  issuedBy: string | null;
  actorEmail: string | null;
  note: string | null;
}) {
  if (input.amountCents <= 0) throw new CrmError(400, 'bad_amount', 'Credit amount must be greater than zero.');
  if (!CREDIT_REASONS.has(input.reason)) throw new CrmError(400, 'bad_reason', 'Unknown credit reason.');
  if (input.memberId) {
    const member = await client.query(
      `select id from members where id = $1 and family_id = $2`,
      [input.memberId, input.familyId],
    );
    if (!member.rowCount) throw new CrmError(404, 'not_found', 'Not found.');
  }
  const saved = await client.query(
    `insert into tuition_credits
       (family_id, member_id, location_id, amount_cents, remaining_cents, reason, expires_on, issued_by, note)
     values ($1, $2, $3, $4, $4, $5, $6, $7, $8)
     returning id, remaining_cents`,
    [
      input.familyId, input.memberId, input.locationId, input.amountCents, input.reason,
      input.expiresOn, input.issuedBy, input.note,
    ],
  );
  await client.query(
    `insert into tuition_credit_events
       (credit_id, family_id, action, amount_cents, remaining_cents, actor_email, note)
     values ($1, $2, 'issued', $3, $3, $4, $5)`,
    [saved.rows[0].id, input.familyId, input.amountCents, input.actorEmail, input.note],
  );
  await client.query(
    `insert into ledger_entries
       (occurred_on, family_id, member_id, location_id, source_type, source_id, amount_cents, shadow, memo)
     values ($1, $2, $3, $4, $5, $6, $7, false, $8)`,
    [
      chicagoToday(),
      input.familyId,
      input.memberId,
      input.locationId,
      input.reason === 'referral_reward' ? 'referral_reward' : 'tuition_credit',
      saved.rows[0].id,
      input.amountCents,
      `issued ${input.amountCents} cents ${input.reason}`,
    ],
  );
  return saved.rows[0].id as string;
}

async function loadLots(client: Db, familyId: string): Promise<CreditLot[]> {
  const rows = await client.query(
    `select id, remaining_cents, to_char(expires_on, 'YYYY-MM-DD') as expires_on, created_at
     from tuition_credits
     where family_id = $1 and voided = false and remaining_cents > 0
     for update`,
    [familyId],
  );
  return rows.rows.map(row => ({
    id: row.id,
    remainingCents: row.remaining_cents,
    expiresOn: row.expires_on,
    createdAt: new Date(row.created_at).toISOString(),
  }));
}

function codeToken() {
  const bytes = randomBytes(8);
  let out = '';
  for (let i = 0; i < 8; i += 1) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}

export async function attributeReferral(client: Db, input: {
  code: string;
  leadId: string;
  locationId: string;
  stage: 'lead' | 'trial_booked';
}) {
  const code = String(input.code || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{6,16}$/.test(code)) throw new CrmError(422, 'unknown_referral_code', 'That referral code was not found.');
  const found = await client.query(
    `select id, family_id, member_id, location_id from referral_codes where code = $1 and active`,
    [code],
  );
  if (!found.rowCount) throw new CrmError(422, 'unknown_referral_code', 'That referral code was not found.');
  const row = found.rows[0];
  const existing = await client.query(`select id, status from referrals where referred_lead_id = $1`, [input.leadId]);
  if (existing.rowCount) return { id: existing.rows[0].id as string, status: existing.rows[0].status as string };
  const saved = await client.query(
    `insert into referrals
       (referral_code_id, referrer_family_id, referrer_member_id, referred_lead_id, location_id, status)
     values ($1, $2, $3, $4, $5, $6)
     returning id, status`,
    [row.id, row.family_id, row.member_id, input.leadId, input.locationId, input.stage],
  );
  return { id: saved.rows[0].id as string, status: saved.rows[0].status as string };
}

async function loadRule(client: Db, locationId: string) {
  const loc = await client.query(`select brand::text as brand from locations where id = $1`, [locationId]);
  const brand = loc.rows[0]?.brand || null;
  const rule = await client.query(
    `select id, location_id, referrer_credit_cents, new_family_credit_cents, trigger_condition
     from referral_program_rules
     where active and (location_id = $1 or (location_id is null and brand::text = $2))
     order by location_id nulls last
     limit 1`,
    [locationId, brand],
  );
  return rule.rows[0] || null;
}

async function enrollThanks(client: Db, input: {
  referralId: string;
  locationId: string;
  familyId: string;
  memberId: string | null;
  guardianName: string;
}) {
  const already = await client.query(
    `select thanks_enrollment_id from referrals where id = $1`,
    [input.referralId],
  );
  if (already.rows[0]?.thanks_enrollment_id) {
    return { enrollmentId: already.rows[0].thanks_enrollment_id as string, sent: false, dryRun: true };
  }
  const settingsRow = await client.query(
    `select s.location_id, s.review_url, s.programs, s.toggles, l.brand::text as brand, l.name
     from location_automation_settings s
     join locations l on l.id = s.location_id
     where s.location_id = $1`,
    [input.locationId],
  );
  if (!settingsRow.rowCount) return { enrollmentId: null, sent: false, dryRun: true };
  const found = settingsRow.rows[0];
  const settings: LocationAutomationSettings = {
    locationId: found.location_id,
    brand: found.brand === 'goninja' ? 'goninja' : 'lvlup',
    locationName: found.name,
    reviewUrl: found.review_url,
    programs: found.programs || {},
    toggles: found.toggles || {},
  };
  const workflows = await client.query(
    `select id, code, category, brand, name, trigger_type, trigger_rules, exit_conditions
     from automation_workflows where code = 'ret_referral_thanks'`,
  );
  if (!workflows.rowCount) return { enrollmentId: null, sent: false, dryRun: true };
  const steps = await client.query(
    `select step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key
     from automation_steps where workflow_id = $1 order by sort_order`,
    [workflows.rows[0].id],
  );
  const workflow: AutomationWorkflow = {
    code: workflows.rows[0].code,
    category: workflows.rows[0].category,
    brand: workflows.rows[0].brand,
    name: workflows.rows[0].name,
    trigger: workflows.rows[0].trigger_type,
    rules: workflows.rows[0].trigger_rules || {},
    exits: workflows.rows[0].exit_conditions || [],
    steps: steps.rows.map(step => ({
      stepKey: step.step_key,
      stepType: step.step_type,
      sortOrder: step.sort_order,
      config: step.config || {},
      nextStepKey: step.next_step_key,
      branchYesKey: step.branch_yes_key,
      branchNoKey: step.branch_no_key,
    })),
  };
  const event = {
    trigger: 'manual',
    locationId: input.locationId,
    reason: 'referral_thanks',
    facts: {},
  };
  if (!matchingWorkflows([workflow], event, settings).length) {
    return { enrollmentId: null, sent: false, dryRun: true };
  }
  const plan = planEnrollment(workflow, event, settings, {
    guardian_name: input.guardianName,
    location_name: settings.locationName,
    member_id: input.memberId || '',
  }, {});
  const enrollment = await client.query(
    `insert into automation_enrollments
       (workflow_id, location_id, family_id, member_id, status, exit_reason, context)
     values ($1, $2, $3, $4, $5, $6, $7::jsonb)
     returning id`,
    [
      workflows.rows[0].id,
      input.locationId,
      input.familyId,
      input.memberId,
      plan.status,
      plan.exitReason,
      JSON.stringify({ tags: plan.tags, trigger: 'manual', reason: 'referral_thanks', referralId: input.referralId, sent: false }),
    ],
  );
  const stepIds = await client.query(
    `select id, step_key from automation_steps where workflow_id = $1`,
    [workflows.rows[0].id],
  );
  const ids = new Map(stepIds.rows.map(step => [step.step_key, step.id]));
  for (const step of plan.steps) {
    await client.query(
      `insert into automation_step_runs (enrollment_id, step_id, status, rendered)
       values ($1, $2, 'dry_run', $3::jsonb)`,
      [enrollment.rows[0].id, ids.get(step.stepKey), JSON.stringify({ ...step.rendered, sent: false, dryRun: true })],
    );
  }
  await client.query(
    `update referrals set thanks_enrollment_id = $2, updated_at = now() where id = $1 and thanks_enrollment_id is null`,
    [input.referralId, enrollment.rows[0].id],
  );
  return { enrollmentId: enrollment.rows[0].id as string, sent: false, dryRun: true, code: 'ret_referral_thanks' };
}

async function rewardReferral(client: Db, input: {
  referralId: string;
  trigger: 'trial_converted' | 'first_paid_membership';
  actorEmail: string | null;
  guardianName: string;
}) {
  const locked = await client.query(
    `select * from referrals where id = $1 for update`,
    [input.referralId],
  );
  if (!locked.rowCount) return null;
  const row = locked.rows[0];
  if (row.status === 'voided' || row.status === 'rewarded' || row.reward_credit_id || row.new_family_credit_id) {
    return publicReferral(row, { sent: false, dryRun: true, enrollmentId: row.thanks_enrollment_id });
  }
  const rule = await loadRule(client, row.location_id);
  if (!rule || rule.trigger_condition !== input.trigger) return publicReferral(row, null);
  if (rule.referrer_credit_cents <= 0 && rule.new_family_credit_cents <= 0) return publicReferral(row, null);

  const issuer = input.actorEmail ? await staffId(client, input.actorEmail) : null;
  let rewardCreditId: string | null = null;
  let newFamilyCreditId: string | null = null;
  if (rule.referrer_credit_cents > 0) {
    rewardCreditId = await insertCredit(client, {
      familyId: row.referrer_family_id,
      memberId: row.referrer_member_id,
      locationId: row.location_id,
      amountCents: rule.referrer_credit_cents,
      reason: 'referral_reward',
      expiresOn: null,
      issuedBy: issuer,
      actorEmail: input.actorEmail,
      note: 'referral reward',
    });
  }
  if (rule.new_family_credit_cents > 0 && row.referred_family_id) {
    newFamilyCreditId = await insertCredit(client, {
      familyId: row.referred_family_id,
      memberId: row.referred_member_id,
      locationId: row.location_id,
      amountCents: rule.new_family_credit_cents,
      reason: 'referral_reward',
      expiresOn: null,
      issuedBy: issuer,
      actorEmail: input.actorEmail,
      note: 'new family referral credit',
    });
  }
  const thanks = await enrollThanks(client, {
    referralId: row.id,
    locationId: row.location_id,
    familyId: row.referrer_family_id,
    memberId: row.referrer_member_id,
    guardianName: input.guardianName,
  });
  const updated = await client.query(
    `update referrals
     set status = 'rewarded', reward_credit_id = $2, new_family_credit_id = $3,
         rewarded_at = now(), updated_at = now()
     where id = $1 and status <> 'rewarded' and reward_credit_id is null
     returning *`,
    [row.id, rewardCreditId, newFamilyCreditId],
  );
  return publicReferral(updated.rows[0] || row, thanks);
}

function publicReferral(row: any, thanks: { sent: boolean; dryRun: boolean; enrollmentId?: string | null; code?: string } | null) {
  return {
    id: row.id,
    status: row.status,
    locationId: row.location_id,
    referrerFamilyId: row.referrer_family_id,
    referredFamilyId: row.referred_family_id,
    referredLeadId: row.referred_lead_id,
    rewardCreditId: row.reward_credit_id,
    newFamilyCreditId: row.new_family_credit_id,
    rewardedAt: row.rewarded_at,
    thanks: thanks ? { ...thanks, sent: false, dryRun: true } : null,
  };
}

export async function advanceReferral(client: Db, input: {
  leadId: string;
  familyId: string;
  memberId: string;
  locationId: string;
  guardianName: string;
  actorEmail: string | null;
}) {
  const found = await client.query(`select id, status from referrals where referred_lead_id = $1 for update`, [input.leadId]);
  if (!found.rowCount) return null;
  if (found.rows[0].status === 'voided') return { id: found.rows[0].id, status: 'voided', thanks: null };
  if (found.rows[0].status !== 'rewarded') {
    await client.query(
      `update referrals
       set referred_family_id = $2, referred_member_id = $3, status = 'converted', updated_at = now()
       where id = $1 and status not in ('rewarded', 'voided')`,
      [found.rows[0].id, input.familyId, input.memberId],
    );
  }
  return rewardReferral(client, {
    referralId: found.rows[0].id,
    trigger: 'trial_converted',
    actorEmail: input.actorEmail,
    guardianName: input.guardianName,
  });
}

async function rewardFirstPaid(client: Db, input: {
  familyId: string;
  actorEmail: string | null;
}) {
  const rows = await client.query(
    `select r.id, coalesce(g.first_name, f.display_name, '') as guardian_name
     from referrals r
     join families f on f.id = r.referrer_family_id
     left join lateral (
       select gu.first_name from guardian_families gf
       join guardians gu on gu.id = gf.guardian_id
       where gf.family_id = r.referrer_family_id
       order by gu.created_at limit 1
     ) g on true
     where r.referred_family_id = $1 and r.status = 'converted'
     for update of r`,
    [input.familyId],
  );
  const out = [];
  for (const row of rows.rows) {
    const rewarded = await rewardReferral(client, {
      referralId: row.id,
      trigger: 'first_paid_membership',
      actorEmail: input.actorEmail,
      guardianName: row.guardian_name || '',
    });
    if (rewarded) out.push(rewarded);
  }
  return out;
}

type DraftResult = {
  action: 'charge' | 'skip';
  charged: false;
  submitted: false;
  reason: string;
  invoice: null | {
    id: string;
    status: string;
    periodStart: string;
    periodEnd: string | null;
    totalCents: number;
    lines: Array<{
      kind: string;
      description: string;
      amountCents: number;
      creditAppliedCents: number;
      chargeAmountCents: number | null;
    }>;
  };
  referralRewards: unknown[];
};

async function readInvoice(client: Db, invoiceId: string): Promise<DraftResult['invoice']> {
  const invoice = await client.query(
    `select id, status, to_char(period_start, 'YYYY-MM-DD') as period_start,
            to_char(period_end, 'YYYY-MM-DD') as period_end, total_cents
     from invoices where id = $1`,
    [invoiceId],
  );
  const lines = await client.query(
    `select kind, description, amount_cents, credit_applied_cents, charge_amount_cents
     from invoice_lines where invoice_id = $1 order by amount_cents desc, kind`,
    [invoiceId],
  );
  const row = invoice.rows[0];
  return {
    id: row.id,
    status: row.status,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    totalCents: row.total_cents,
    lines: lines.rows.map(line => ({
      kind: line.kind,
      description: line.description,
      amountCents: line.amount_cents,
      creditAppliedCents: line.credit_applied_cents,
      chargeAmountCents: line.charge_amount_cents,
    })),
  };
}

export async function buildMembershipDraft(client: Db, input: {
  membershipId: string;
  on: string;
  actorEmail: string | null;
}): Promise<DraftResult> {
  const locked = await client.query(
    `select ms.id, ms.family_id, ms.location_id, ms.status, ms.biller, ms.prepaid,
            to_char(ms.next_bill_on, 'YYYY-MM-DD') as next_bill_on,
            to_char(ms.paid_through_on, 'YYYY-MM-DD') as paid_through_on,
            ms.discount_bps, ms.rollover_enabled, ms.rollover_cancelled, ms.rollover_cadence,
            ms.rollover_amount_cents,
            to_char(ms.rollover_anchor_on, 'YYYY-MM-DD') as rollover_anchor_on,
            ms.rollover_anchor_day, p.amount_cents,
            h.status as hold_status, to_char(h.start_on, 'YYYY-MM-DD') as hold_start,
            to_char(h.end_on, 'YYYY-MM-DD') as hold_end
     from memberships ms
     join plans p on p.id = ms.plan_id
     left join lateral (
       select status, start_on, end_on from holds
       where membership_id = ms.id and status in ('approved', 'active')
       order by start_on desc limit 1
     ) h on true
     where ms.id = $1
     for update of ms`,
    [input.membershipId],
  );
  if (!locked.rowCount) throw new CrmError(404, 'not_found', 'Not found.');
  const ms = locked.rows[0];
  const existing = await client.query(
    `select id from invoices
     where membership_id = $1 and period_start = $2::date and status <> 'void' and shadow = false`,
    [ms.id, input.on],
  );
  if (existing.rowCount) {
    return {
      action: 'charge',
      charged: false,
      submitted: false,
      reason: 'already_drafted',
      invoice: await readInvoice(client, existing.rows[0].id),
      referralRewards: [],
    };
  }

  const cadence = normalizeRolloverCadence(ms.rollover_cadence);
  let gross = 0;
  let reason = 'skipped_not_due';
  let due = false;
  let periodEnd: string | null = null;
  let description = 'Tuition';

  if (ms.prepaid) {
    if (!ms.rollover_enabled || !cadence || !ms.paid_through_on || input.on < ms.paid_through_on) {
      reason = 'skipped_prepaid';
    } else if (ms.rollover_cancelled) {
      reason = 'skipped_rollover_cancelled';
    } else if (!isRolloverDraftDate({
      on: input.on,
      paidThroughOn: ms.paid_through_on,
      cadence,
      anchorOn: ms.rollover_anchor_on,
      anchorDay: ms.rollover_anchor_day,
    })) reason = 'skipped_not_due';
    else {
      due = true;
      reason = 'would_charge';
      description = 'Rollover tuition';
      gross = netTuitionCents(ms.rollover_amount_cents ?? ms.amount_cents, ms.discount_bps);
      periodEnd = periodEndFor(cadence, input.on);
    }
  } else {
    const decision = billingDecision({
      on: input.on,
      status: ms.status,
      biller: ms.biller,
      nextBillOn: ms.next_bill_on,
      paidThroughOn: ms.paid_through_on,
      hold: ms.hold_status ? { status: ms.hold_status, startOn: ms.hold_start, endOn: ms.hold_end } : null,
      cancelReceivedOn: null,
      holdFee: { enabled: false, monthlyAmountCents: null },
    });
    if (!decision.bill) {
      reason = decision.reason === 'already_paid' ? 'skipped_paid_through' : `skipped_${decision.reason}`;
    } else {
      due = true;
      reason = 'would_charge';
      gross = netTuitionCents(ms.amount_cents, ms.discount_bps);
      periodEnd = periodEndFor(cadence || 'every_4_weeks', input.on);
    }
  }

  if (!due) {
    return { action: 'skip', charged: false, submitted: false, reason, invoice: null, referralRewards: [] };
  }

  const lots = await loadLots(client, ms.family_id);
  const applied = applyTuitionCredits(gross, input.on, lots);
  const lines = tuitionInvoiceLines(description, applied);
  const invoice = await client.query(
    `insert into invoices (membership_id, location_id, family_id, period_start, period_end, status, shadow, total_cents)
     values ($1, $2, $3, $4, $5, 'draft', false, $6)
     returning id`,
    [ms.id, ms.location_id, ms.family_id, input.on, periodEnd, applied.chargeAmountCents],
  );
  const invoiceId = invoice.rows[0].id as string;
  for (const line of lines) {
    await client.query(
      `insert into invoice_lines
         (invoice_id, kind, description, amount_cents, credit_applied_cents, charge_amount_cents)
       values ($1, $2, $3, $4, $5, $6)`,
      [invoiceId, line.kind, line.description, line.amountCents, line.creditAppliedCents, line.chargeAmountCents],
    );
  }
  const member = await client.query(
    `select member_id from membership_members where membership_id = $1 order by member_id limit 1`,
    [ms.id],
  );
  const memberId = member.rows[0]?.member_id || null;
  await client.query(
    `insert into ledger_entries
       (occurred_on, family_id, member_id, location_id, source_type, source_id, amount_cents, shadow, memo)
     values ($1, $2, $3, $4, 'membership', $5, $6, false, $7)`,
    [
      input.on, ms.family_id, memberId, ms.location_id, invoiceId, applied.grossCents,
      `draft gross=${applied.grossCents} credit_applied=${applied.creditAppliedCents} charge=${applied.chargeAmountCents} submitted=false`,
    ],
  );
  for (const use of applied.applications) {
    const updated = await client.query(
      `update tuition_credits
       set remaining_cents = remaining_cents - $2
       where id = $1 and remaining_cents >= $2 and voided = false
       returning remaining_cents, member_id, location_id`,
      [use.id, use.appliedCents],
    );
    if (!updated.rowCount) throw new CrmError(409, 'credit_conflict', 'A tuition credit changed while the draft was built.');
    const event = await client.query(
      `insert into tuition_credit_events
         (credit_id, family_id, action, amount_cents, remaining_cents, actor_email, invoice_id, note)
       values ($1, $2, 'applied', $3, $4, $5, $6, 'applied to draft')
       returning id`,
      [use.id, ms.family_id, -use.appliedCents, updated.rows[0].remaining_cents, input.actorEmail, invoiceId],
    );
    await client.query(
      `insert into ledger_entries
         (occurred_on, family_id, member_id, location_id, source_type, source_id, amount_cents, shadow, memo)
       values ($1, $2, $3, $4, 'tuition_credit', $5, $6, false, $7)`,
      [
        input.on,
        ms.family_id,
        updated.rows[0].member_id,
        updated.rows[0].location_id,
        event.rows[0].id,
        -use.appliedCents,
        `applied ${use.appliedCents} cents to draft ${invoiceId}`,
      ],
    );
  }
  await client.query(
    `insert into audit_log (actor_email, action, entity_type, entity_id, location_id)
     values ($1, 'draft_invoice', 'invoice', $2, $3)`,
    [input.actorEmail, invoiceId, ms.location_id],
  );
  const referralRewards = applied.grossCents > 0
    ? await rewardFirstPaid(client, { familyId: ms.family_id, actorEmail: input.actorEmail })
    : [];
  return {
    action: 'charge',
    charged: false,
    submitted: false,
    reason,
    invoice: await readInvoice(client, invoiceId),
    referralRewards,
  };
}

function referralView(row: any, audience: 'family' | 'staff') {
  const base = {
    id: row.id,
    status: row.status,
    code: row.code,
    createdAt: row.created_at,
    rewardedAt: row.rewarded_at,
    youAre: row.you_are,
  };
  if (audience === 'family') return base;
  return {
    ...base,
    locationId: row.location_id,
    referrerFamilyId: row.referrer_family_id,
    referredFamilyId: row.referred_family_id,
    referredLeadId: row.referred_lead_id,
    rewardCreditId: row.reward_credit_id,
    newFamilyCreditId: row.new_family_credit_id,
  };
}

export async function handleRolloverRoutes(input: {
  method: string;
  parts: string[];
  search: URLSearchParams;
  actor: Actor;
  body: Record<string, any>;
  pool: PoolLike;
}): Promise<{ status: number; body: unknown } | null> {
  const { method, parts, search, actor, body, pool } = input;
  const role = platformRoleOf(actor);
  const today = chicagoToday();

  if (parts[1] === 'families' && parts[3] === 'credits' && isUuid(parts[2] || '')) {
    const familyId = parts[2];
    const locations = await familyLocations(pool, familyId);
    const family = await pool.query(`select id from families where id = $1`, [familyId]);
    if (!family.rowCount) throw new CrmError(404, 'not_found', 'Not found.');
    assertFamilyRead(actor, role, familyId, locations);

    if (method === 'GET') {
      const credits = await listCredits(pool, familyId);
      return {
        status: 200,
        body: { familyId, balanceCents: await creditBalance(pool, familyId, today), credits, charged: false },
      };
    }
    if (method === 'POST') {
      if (role === 'family' || role === 'coach') throw new CrmError(403, 'forbidden', 'Staff only.');
      const locationId = String(body.locationId || locations[0] || '');
      assertStaffSchool(actor, role, locationId);
      if (locations.length && !locations.includes(locationId)) throw new CrmError(404, 'not_found', 'Not found.');
      const action = body.action === 'adjust' ? 'adjust' : 'issue';
      const saved = await withTx(pool, async client => {
        const issuer = await staffId(client, actor.email);
        if (action === 'adjust') {
          if (!isUuid(String(body.creditId || ''))) throw new CrmError(400, 'bad_credit', 'creditId is required.');
          const delta = cents(body.amountCents, 'amountCents');
          if (delta === 0) throw new CrmError(400, 'bad_amount', 'An adjustment needs a non-zero cent delta.');
          const current = await client.query(
            `select * from tuition_credits where id = $1 and family_id = $2 for update`,
            [body.creditId, familyId],
          );
          if (!current.rowCount) throw new CrmError(404, 'not_found', 'Not found.');
          const nextRemaining = current.rows[0].remaining_cents + delta;
          if (nextRemaining < 0) throw new CrmError(422, 'below_zero', 'A credit cannot go below zero.');
          const nextAmount = delta > 0 ? current.rows[0].amount_cents + delta : current.rows[0].amount_cents;
          if (nextRemaining > nextAmount) throw new CrmError(422, 'below_zero', 'A credit cannot go below zero.');
          await client.query(
            `update tuition_credits set remaining_cents = $2, amount_cents = $3 where id = $1`,
            [body.creditId, nextRemaining, nextAmount],
          );
          await client.query(
            `insert into tuition_credit_events
               (credit_id, family_id, action, amount_cents, remaining_cents, actor_email, note)
             values ($1, $2, 'adjusted', $3, $4, $5, $6)`,
            [body.creditId, familyId, delta, nextRemaining, actor.email, body.note || null],
          );
          await client.query(
            `insert into audit_log (actor_email, action, entity_type, entity_id, location_id)
             values ($1, 'tuition_credit_adjusted', 'tuition_credit', $2, $3)`,
            [actor.email, body.creditId, locationId],
          );
          return { creditId: body.creditId, remainingCents: nextRemaining };
        }
        const amount = cents(body.amountCents, 'amountCents');
        const reason = String(body.reason || 'manual_staff');
        const creditId = await insertCredit(client, {
          familyId,
          memberId: body.memberId || null,
          locationId,
          amountCents: amount,
          reason,
          expiresOn: dayOrNull(body.expiresOn),
          issuedBy: issuer,
          actorEmail: actor.email,
          note: body.note ? String(body.note).slice(0, 500) : null,
        });
        await client.query(
          `insert into audit_log (actor_email, action, entity_type, entity_id, location_id)
           values ($1, 'tuition_credit_issued', 'tuition_credit', $2, $3)`,
          [actor.email, creditId, locationId],
        );
        return { creditId, remainingCents: amount };
      });
      return {
        status: 201,
        body: {
          ...saved,
          balanceCents: await creditBalance(pool, familyId, today),
          charged: false,
        },
      };
    }
  }

  if (parts[1] === 'memberships' && parts[3] === 'rollover' && isUuid(parts[2] || '')) {
    const membership = await pool.query(
      `select id, family_id, location_id, prepaid,
              rollover_enabled, rollover_cancelled, rollover_cadence, rollover_plan_id,
              rollover_amount_cents, rollover_anchor_day,
              to_char(rollover_anchor_on, 'YYYY-MM-DD') as rollover_anchor_on,
              to_char(paid_through_on, 'YYYY-MM-DD') as paid_through_on
       from memberships where id = $1`,
      [parts[2]],
    );
    if (!membership.rowCount) throw new CrmError(404, 'not_found', 'Not found.');
    const row = membership.rows[0];
    if (role === 'family') {
      if (!actor.familyIds.includes(row.family_id)) throw new CrmError(404, 'not_found', 'Not found.');
      if (method !== 'GET') throw new CrmError(403, 'forbidden', 'Staff only.');
    } else {
      assertStaffSchool(actor, role, row.location_id);
    }
    if (method === 'GET') {
      const cadence = normalizeRolloverCadence(row.rollover_cadence);
      const next = row.prepaid && row.rollover_enabled && !row.rollover_cancelled && cadence && row.paid_through_on
        ? firstRolloverOn({
          paidThroughOn: row.paid_through_on,
          cadence,
          anchorOn: row.rollover_anchor_on,
          anchorDay: row.rollover_anchor_day,
        })
        : null;
      return {
        status: 200,
        body: {
          membershipId: row.id,
          prepaid: row.prepaid,
          enabled: row.rollover_enabled,
          cancelled: row.rollover_cancelled,
          cadence: row.rollover_cadence,
          planId: row.rollover_plan_id,
          amountCents: row.rollover_amount_cents,
          anchorDay: row.rollover_anchor_day,
          anchorOn: row.rollover_anchor_on,
          paidThroughDate: row.paid_through_on,
          nextDraftOn: next,
          charged: false,
        },
      };
    }
    if (method === 'POST') {
      if (!row.prepaid) throw new CrmError(422, 'not_prepaid', 'Rollover is configured on a prepaid membership.');
      const cancel = body.cancel === true;
      const enabled = cancel ? true : body.enabled !== false;
      const cadence = normalizeRolloverCadence(body.cadence || row.rollover_cadence);
      if (enabled && !cadence) throw new CrmError(400, 'bad_cadence', 'Cadence must be monthly, weekly, or every_4_weeks.');
      const amount = body.amountCents == null ? row.rollover_amount_cents : cents(body.amountCents, 'amountCents');
      if (enabled && (amount == null || amount < 0)) throw new CrmError(400, 'bad_amount', 'amountCents is required.');
      const anchorDay = body.anchorDay == null || body.anchorDay === ''
        ? (body.anchorDay === null ? null : row.rollover_anchor_day)
        : cents(body.anchorDay, 'anchorDay');
      if (anchorDay != null && (anchorDay < 1 || anchorDay > 31)) {
        throw new CrmError(400, 'bad_anchor', 'anchorDay must be from 1 to 31.');
      }
      if ((cadence === 'weekly' || cadence === 'every_4_weeks') && anchorDay != null && anchorDay > 7) {
        throw new CrmError(400, 'bad_anchor', 'A weekly or 4-week anchor day is 1 (Monday) through 7 (Sunday).');
      }
      if (cancel && !cadence) throw new CrmError(422, 'not_configured', 'There is no rollover to cancel.');
      const anchorOn = body.anchorOn === undefined ? row.rollover_anchor_on : dayOrNull(body.anchorOn);
      let planId = body.planId === undefined ? row.rollover_plan_id : body.planId;
      if (planId) {
        if (!isUuid(String(planId))) throw new CrmError(400, 'bad_plan', 'Unknown plan.');
        const plan = await pool.query(
          `select id from plans where id = $1 and location_id = $2`,
          [planId, row.location_id],
        );
        if (!plan.rowCount) throw new CrmError(404, 'not_found', 'Not found.');
      } else planId = null;
      const storedCadence: RolloverCadence | null = cadence;
      await withTx(pool, async client => {
        await client.query(
          `update memberships
           set rollover_enabled = $2, rollover_cancelled = $3, rollover_cadence = $4,
               rollover_plan_id = $5, rollover_amount_cents = $6, rollover_anchor_day = $7,
               rollover_anchor_on = $8
           where id = $1`,
          [row.id, enabled, cancel, storedCadence, planId, amount, anchorDay, anchorOn],
        );
        if (storedCadence) {
          await client.query(
            `insert into billing_schedules
               (membership_id, cadence, plan_id, amount_cents, anchor_day, anchor_on, starts_on, cancelled)
             values ($1, $2, $3, $4, $5, $6, $7, $8)
             on conflict (membership_id) do update
               set cadence = excluded.cadence, plan_id = excluded.plan_id, amount_cents = excluded.amount_cents,
                   anchor_day = excluded.anchor_day, anchor_on = excluded.anchor_on, starts_on = excluded.starts_on,
                   cancelled = excluded.cancelled, updated_at = now()`,
            [row.id, storedCadence, planId, amount ?? 0, anchorDay, anchorOn, row.paid_through_on, cancel || !enabled],
          );
        }
        await client.query(
          `insert into audit_log (actor_email, action, entity_type, entity_id, location_id)
           values ($1, 'rollover_configured', 'membership', $2, $3)`,
          [actor.email, row.id, row.location_id],
        );
      });
      return {
        status: 200,
        body: {
          membershipId: row.id,
          enabled,
          cancelled: cancel,
          cadence: storedCadence,
          planId,
          amountCents: amount,
          anchorDay,
          anchorOn,
          paidThroughDate: row.paid_through_on,
          charged: false,
          submitted: false,
        },
      };
    }
  }

  if (parts[1] === 'billing' && parts[2] === 'drafts' && method === 'POST') {
    if (role === 'family' || role === 'coach') throw new CrmError(403, 'forbidden', 'Staff only.');
    if (!isUuid(String(body.membershipId || ''))) throw new CrmError(400, 'bad_membership', 'membershipId is required.');
    const on = dayOrNull(body.on) || today;
    const membership = await pool.query(`select location_id, family_id from memberships where id = $1`, [body.membershipId]);
    if (!membership.rowCount) throw new CrmError(404, 'not_found', 'Not found.');
    assertStaffSchool(actor, role, membership.rows[0].location_id);
    const draft = await withTx(pool, client => buildMembershipDraft(client, {
      membershipId: body.membershipId,
      on,
      actorEmail: actor.email,
    }));
    return { status: 200, body: draft };
  }

  if (parts[1] === 'referrals' && parts[2] === 'rules') {
    if (role === 'family') throw new CrmError(404, 'not_found', 'Not found.');
    if (method === 'GET') {
      const locationId = search.get('locationId') || '';
      if (locationId) assertStaffSchool(actor, role, locationId);
      const rows = await pool.query(
        `select id, location_id, brand::text as brand, referrer_credit_cents, new_family_credit_cents,
                trigger_condition, active
         from referral_program_rules
         where ($1 = '' or location_id = $1 or (location_id is null and brand::text = (
           select brand::text from locations where id = $1
         )))
         order by location_id nulls last`,
        [locationId],
      );
      const visible = role === 'owner'
        ? rows.rows
        : rows.rows.filter(row => !row.location_id || actor.locationIds.includes(row.location_id));
      return { status: 200, body: { rules: visible, charged: false } };
    }
    if (method === 'POST') {
      if (role !== 'owner' && role !== 'school_lead' && role !== 'ops') {
        throw new CrmError(403, 'forbidden', 'School lead access required.');
      }
      const locationId = body.locationId ? String(body.locationId) : null;
      if (locationId) assertStaffSchool(actor, role, locationId);
      else if (role !== 'owner') throw new CrmError(403, 'forbidden', 'A brand-wide rule is owner only.');
      const trigger = String(body.triggerCondition || '');
      if (!TRIGGERS.has(trigger)) throw new CrmError(400, 'bad_trigger', 'Trigger must be first_paid_membership or trial_converted.');
      const referrer = cents(body.referrerCreditCents ?? 0, 'referrerCreditCents');
      const newbie = cents(body.newFamilyCreditCents ?? 0, 'newFamilyCreditCents');
      if (referrer < 0 || newbie < 0) throw new CrmError(400, 'bad_amount', 'Credit amounts cannot be negative.');
      const brand = locationId
        ? (await pool.query(`select brand::text as brand from locations where id = $1`, [locationId])).rows[0].brand
        : String(body.brand || '');
      if (!locationId && brand !== 'lvlup' && brand !== 'goninja') {
        throw new CrmError(400, 'bad_brand', 'Brand must be lvlup or goninja.');
      }
      const saved = locationId
        ? await pool.query(
          `insert into referral_program_rules
             (location_id, brand, referrer_credit_cents, new_family_credit_cents, trigger_condition, active)
           values ($1, $2::brand_code, $3, $4, $5, true)
           on conflict (location_id) where location_id is not null
           do update set referrer_credit_cents = excluded.referrer_credit_cents,
                         new_family_credit_cents = excluded.new_family_credit_cents,
                         trigger_condition = excluded.trigger_condition,
                         brand = excluded.brand,
                         active = true
           returning id, location_id, referrer_credit_cents, new_family_credit_cents, trigger_condition`,
          [locationId, brand, referrer, newbie, trigger],
        )
        : await pool.query(
          `insert into referral_program_rules
             (location_id, brand, referrer_credit_cents, new_family_credit_cents, trigger_condition, active)
           values (null, $1::brand_code, $2, $3, $4, true)
           on conflict (brand) where location_id is null and brand is not null
           do update set referrer_credit_cents = excluded.referrer_credit_cents,
                         new_family_credit_cents = excluded.new_family_credit_cents,
                         trigger_condition = excluded.trigger_condition,
                         active = true
           returning id, location_id, referrer_credit_cents, new_family_credit_cents, trigger_condition`,
          [brand, referrer, newbie, trigger],
        );
      return { status: 200, body: { rule: saved.rows[0], charged: false, sent: false } };
    }
  }

  if (parts[1] === 'referrals' && parts[2] === 'codes') {
    if (method === 'GET') {
      const familyId = search.get('familyId') || (role === 'family' ? actor.familyIds[0] : '');
      if (!isUuid(familyId)) throw new CrmError(400, 'bad_family', 'familyId is required.');
      const locations = await familyLocations(pool, familyId);
      assertFamilyRead(actor, role, familyId, locations);
      const rows = await pool.query(
        `select id, code, family_id, member_id, location_id, active, created_at
         from referral_codes where family_id = $1 and active order by created_at`,
        [familyId],
      );
      return {
        status: 200,
        body: {
          codes: rows.rows.map(row => ({
            id: row.id,
            code: row.code,
            familyId: row.family_id,
            memberId: row.member_id,
            locationId: row.location_id,
            sharePath: '/v1/public/trials',
          })),
        },
      };
    }
    if (method === 'POST') {
      const familyId = String(body.familyId || (role === 'family' ? actor.familyIds[0] : ''));
      if (!isUuid(familyId)) throw new CrmError(400, 'bad_family', 'familyId is required.');
      const locations = await familyLocations(pool, familyId);
      if (role === 'family') {
        if (!actor.familyIds.includes(familyId)) throw new CrmError(404, 'not_found', 'Not found.');
      } else if (role === 'coach') {
        throw new CrmError(403, 'forbidden', 'Staff only.');
      }
      const memberId = body.memberId || null;
      if (memberId && !isUuid(String(memberId))) throw new CrmError(400, 'bad_member', 'Unknown member.');
      let locationId = String(body.locationId || locations[0] || '');
      if (role === 'family') locationId = locations[0] || '';
      assertStaffSchool(actor, role === 'family' ? 'owner' : role, locationId);
      if (role === 'family' && !locations.includes(locationId)) throw new CrmError(404, 'not_found', 'Not found.');
      if (role !== 'family' && role !== 'owner' && !actor.locationIds.includes(locationId)) {
        throw new CrmError(404, 'not_found', 'Not found.');
      }
      if (locations.length && !locations.includes(locationId)) throw new CrmError(404, 'not_found', 'Not found.');
      if (memberId) {
        const member = await pool.query(
          `select id from members where id = $1 and family_id = $2 and location_id = $3`,
          [memberId, familyId, locationId],
        );
        if (!member.rowCount) throw new CrmError(404, 'not_found', 'Not found.');
      }
      const existing = await pool.query(
        `select id, code, family_id, member_id, location_id
         from referral_codes
         where family_id = $1 and active and member_id is not distinct from $2::uuid`,
        [familyId, memberId],
      );
      if (existing.rowCount) {
        const row = existing.rows[0];
        return {
          status: 200,
          body: { id: row.id, code: row.code, familyId: row.family_id, memberId: row.member_id, locationId: row.location_id, sharePath: '/v1/public/trials' },
        };
      }
      let saved: any = null;
      for (let attempt = 0; attempt < 5 && !saved; attempt += 1) {
        try {
          const inserted = await pool.query(
            `insert into referral_codes (code, family_id, member_id, location_id)
             values ($1, $2, $3, $4)
             returning id, code, family_id, member_id, location_id`,
            [codeToken(), familyId, memberId, locationId],
          );
          saved = inserted.rows[0];
        } catch (err) {
          if (!(err && typeof err === 'object' && (err as { code?: string }).code === '23505')) throw err;
        }
      }
      if (!saved) throw new CrmError(409, 'code_conflict', 'Could not mint a referral code.');
      return {
        status: 201,
        body: {
          id: saved.id,
          code: saved.code,
          familyId: saved.family_id,
          memberId: saved.member_id,
          locationId: saved.location_id,
          sharePath: '/v1/public/trials',
        },
      };
    }
  }

  if (parts[1] === 'referrals' && !parts[2] && method === 'GET') {
    const familyId = search.get('familyId') || (role === 'family' ? actor.familyIds[0] : '');
    if (role === 'family') {
      if (!isUuid(familyId)) throw new CrmError(400, 'bad_family', 'familyId is required.');
      if (!actor.familyIds.includes(familyId)) throw new CrmError(404, 'not_found', 'Not found.');
    } else if (search.get('locationId')) {
      assertStaffSchool(actor, role, search.get('locationId') || '');
    } else if (role !== 'owner') {
      throw new CrmError(400, 'bad_location', 'locationId is required.');
    }
    const familyParam = isUuid(familyId) ? familyId : null;
    const rows = await pool.query(
      `select r.id, r.status, r.location_id, r.referrer_family_id, r.referred_family_id, r.referred_lead_id,
              r.reward_credit_id, r.new_family_credit_id, r.rewarded_at, r.created_at, c.code,
              case
                when $1::uuid is not null and r.referrer_family_id = $1::uuid then 'referrer'
                when $1::uuid is not null and r.referred_family_id = $1::uuid then 'referred'
                else 'staff'
              end as you_are
       from referrals r
       join referral_codes c on c.id = r.referral_code_id
       where ($1::uuid is null or r.referrer_family_id = $1::uuid or r.referred_family_id = $1::uuid)
         and ($2 = '' or r.location_id = $2)
       order by r.created_at`,
      [familyParam, search.get('locationId') || ''],
    );
    const audience = role === 'family' ? 'family' : 'staff';
    const visible = audience === 'staff' && role !== 'owner'
      ? rows.rows.filter(row => actor.locationIds.includes(row.location_id))
      : rows.rows;
    return { status: 200, body: { referrals: visible.map(row => referralView(row, audience)), sent: false } };
  }

  if (parts[1] === 'referrals' && isUuid(parts[2] || '') && method === 'POST' && body.status === 'voided') {
    if (role === 'family' || role === 'coach') throw new CrmError(403, 'forbidden', 'Staff only.');
    const found = await pool.query(`select id, location_id, status from referrals where id = $1`, [parts[2]]);
    if (!found.rowCount) throw new CrmError(404, 'not_found', 'Not found.');
    assertStaffSchool(actor, role, found.rows[0].location_id);
    if (found.rows[0].status === 'rewarded') throw new CrmError(409, 'already_rewarded', 'A rewarded referral stays on the ledger.');
    await pool.query(`update referrals set status = 'voided', updated_at = now() where id = $1`, [parts[2]]);
    return { status: 200, body: { id: parts[2], status: 'voided', sent: false } };
  }

  return null;
}
