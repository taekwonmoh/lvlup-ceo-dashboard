/**
 * Platform HTTP routes. Charging, QuickBooks, and messages stay dry-run.
 * Public guest routes do not require a token and do not collect phone numbers.
 */
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Actor } from './auth.ts';
import { canApproveHolds, platformRoleOf } from './scope.ts';
import { CrmError } from './errors.ts';
import { asDay, chicagoToday } from './dates.ts';
import { findCardPayload, prepareCharge, type ChargeEnv } from './charge-gate.ts';
import { compareShadowDay, type ShadowMember } from './shadow-billing.ts';
import { merchantAccountFor } from './billing.ts';
import { importStaging, parsePayments, parseStagingMembers, type StagingHold, type StagingWaiver } from './import-job.ts';
import type { CimProfile } from './gymdesk.ts';
import { pathAhead } from './journey.ts';
import { dunningSchedule } from './dunning.ts';
import { isAtRisk } from './at-risk.ts';
import { insideGeofence, sessionInCheckinWindow } from './geofence.ts';
import { assertQboOffline, companyForSchool, instructorBill } from './qbo.ts';
import { payoutReport, type PayRule, type TaughtLesson } from './payouts.ts';
import { curriculumForRank, vimeoPlayerUrl } from './curriculum.ts';
import { handleComms } from './comms-routes.ts';
import { advanceReferral, attributeReferral, creditBalance, handleRolloverRoutes } from './rollover-routes.ts';

export type Db = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }>;
  release?: () => void;
};

export type PoolLike = Db & { connect: () => Promise<Db> };

export type PlatformEnv = ChargeEnv & { QBO_ENABLED?: string };

const PUBLIC = new Set(['packages', 'slots', 'bookings', 'trials']);

export function isPublicPlatformPath(parts: string[]) {
  return parts[0] === 'v1' && parts[1] === 'public';
}

export function isAuthedPlatformPath(parts: string[]) {
  if (parts[0] !== 'v1') return false;
  const head = parts[1];
  if (['roster', 'memberships', 'holds', 'billing', 'ledger', 'payouts', 'qbo', 'private-lessons', 'retail', 'check-ins', 'sessions', 'events', 'parties', 'leads', 'pathways', 'promotions', 'reports', 'automations', 'devices', 'documents', 'messages', 'locations'].includes(head)) {
    return true;
  }
  if (head === 'imports' && parts[2] === 'gymdesk-staging') return true;
  if (head === 'payment-profiles' && parts[2] === 'accept') return true;
  if (head === 'families' && (parts[3] === 'switcher' || parts[3] === 'timeline' || parts[3] === 'statements' || parts[3] === 'geofence-opt-in' || parts[3] === 'credits')) return true;
  if (head === 'referrals') return true;
  if (head === 'members' && ['journey', 'resources', 'eligibility', 'geofence-opt-in', 'documents', 'timeline'].includes(parts[3] || '')) return true;
  if (head === 'bookings' && parts[3] === 'cancel') return true;
  return false;
}

function rejectPhone(body: unknown) {
  if (!body || typeof body !== 'object') return;
  const walk = (value: unknown) => {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (/phone|mobile|sms|tel/i.test(key)) {
        throw new CrmError(400, 'phone_not_accepted', 'This form does not collect phone numbers.');
      }
      walk(child);
    }
  };
  walk(body);
}

function hashKey(key: string) {
  return createHash('sha256').update(key).digest('hex');
}

function keysMatch(stored: string, given: string) {
  const a = Buffer.from(stored);
  const b = Buffer.from(hashKey(given));
  return a.length === b.length && timingSafeEqual(a, b);
}

function staffSchool(actor: Actor, locationId: string) {
  const role = platformRoleOf(actor);
  if (role === 'family') throw new CrmError(404, 'not_found', 'Not found.');
  if (role !== 'owner' && !actor.locationIds.includes(locationId)) {
    throw new CrmError(404, 'not_found', 'Not found.');
  }
  return role;
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

export async function handlePlatform(input: {
  method: string;
  parts: string[];
  search: URLSearchParams;
  actor: Actor | null;
  body: unknown;
  pool: PoolLike;
  env: PlatformEnv;
  loadStaging?: () => Promise<{
    membersCsv: string;
    paymentsCsv: string;
    profiles: CimProfile[];
    holds: StagingHold[];
    waivers: StagingWaiver[];
  }>;
  now?: Date;
}): Promise<{ status: number; body: unknown } | null> {
  const { method, parts, search, pool, env } = input;
  const actor = input.actor;
  const now = input.now || new Date();
  rejectPhone(input.body);
  if (findCardPayload(input.body)) {
    throw new CrmError(400, 'card_not_allowed', 'Card numbers are not accepted.');
  }

  if (isPublicPlatformPath(parts)) return publicRoutes(input);

  if (!isAuthedPlatformPath(parts)) return null;
  if (!actor) throw new CrmError(401, 'unauthorized', 'Sign in required.');
  const role = platformRoleOf(actor);
  const body = (input.body || {}) as Record<string, any>;

  const rolloverHit = await handleRolloverRoutes({ method, parts, search, actor, body, pool });
  if (rolloverHit) return rolloverHit;

  if (method === 'GET' && parts[1] === 'pathways') {
    const pathways = await pool.query(`select code, title, needs_signoff, note from career_pathways order by code`);
    const milestones = await pool.query(`select * from career_milestones order by pathway_code, sort_order`);
    const titles = await pool.query(`select * from career_title_map order by proposed_title`);
    return { status: 200, body: { pathways: pathways.rows, milestones: milestones.rows, proposedTitles: titles.rows } };
  }

  if (method === 'GET' && parts[1] === 'roster') {
    const locationId = search.get('locationId') || '';
    staffSchool(actor, locationId);
    const rows = await pool.query(
      `select m.id, m.first_name, m.last_name, m.family_id, m.location_id, m.status,
              r.name as rank_name, r.canonical_id
       from members m
       left join lateral (
         select rk.name, rk.canonical_id
         from member_rank_events e join ranks rk on rk.id = e.rank_id
         where e.member_id = m.id order by e.awarded_on desc limit 1
       ) r on true
       where m.location_id = $1 order by m.last_name, m.first_name`,
      [locationId],
    );
    const members = rows.rows.map(row => ({
      id: row.id,
      firstName: row.first_name,
      lastName: row.last_name,
      familyId: row.family_id,
      locationId: row.location_id,
      status: row.status,
      rankName: row.rank_name,
      canonicalId: role === 'coach' ? undefined : row.canonical_id,
    }));
    return { status: 200, body: { members } };
  }

  if (method === 'GET' && parts[1] === 'members' && parts[3] === 'journey') {
    const member = await pool.query(`select id, family_id, location_id from members where id = $1`, [parts[2]]);
    if (!member.rowCount) throw new CrmError(404, 'not_found', 'Not found.');
    const row = member.rows[0];
    if (role === 'family' && !actor.familyIds.includes(row.family_id)) throw new CrmError(404, 'not_found', 'Not found.');
    if (role !== 'family' && role !== 'owner' && !actor.locationIds.includes(row.location_id)) {
      throw new CrmError(404, 'not_found', 'Not found.');
    }
    const rank = await pool.query(
      `select rk.canonical_id from member_rank_events e join ranks rk on rk.id = e.rank_id
       where e.member_id = $1 order by e.awarded_on desc limit 1`,
      [parts[2]],
    );
    const ahead = pathAhead(rank.rows[0]?.canonical_id || null);
    const switcher = await pool.query(
      `select id, first_name, last_name, location_id from members where family_id = $1 order by first_name`,
      [row.family_id],
    );
    return { status: 200, body: { ...ahead, switcher: switcher.rows } };
  }

  if (method === 'GET' && parts[1] === 'members' && parts[3] === 'resources') {
    const member = await pool.query(`select id, family_id from members where id = $1`, [parts[2]]);
    if (!member.rowCount) throw new CrmError(404, 'not_found', 'Not found.');
    if (role === 'family' && !actor.familyIds.includes(member.rows[0].family_id)) throw new CrmError(404, 'not_found', 'Not found.');
    const rank = await pool.query(
      `select rk.name, p.code as program from member_rank_events e
       join ranks rk on rk.id = e.rank_id join rank_programs p on p.code = rk.program_code
       where e.member_id = $1 order by e.awarded_on desc limit 1`,
      [parts[2]],
    );
    if (!rank.rowCount) return { status: 200, body: { lessons: [], pushSent: false } };
    const found = curriculumForRank({ program: rank.rows[0].program, rank: rank.rows[0].name, asOf: chicagoToday(now) });
    const lessons = (found?.sections || []).flatMap(section => section.lessons.map(lesson => ({
      title: lesson.title,
      playerUrl: lesson.vimeoId ? vimeoPlayerUrl(lesson.vimeoId) : null,
    })));
    return { status: 200, body: { lessons, pushSent: false } };
  }

  if (method === 'POST' && parts[1] === 'devices') {
    if (role !== 'family' && role !== 'owner') throw new CrmError(403, 'forbidden', 'Family only.');
    const guardian = await pool.query(`select id from guardians where email = $1`, [actor.email]);
    if (!guardian.rowCount) throw new CrmError(404, 'not_found', 'Not found.');
    await pool.query(
      `insert into device_tokens (guardian_id, platform, token) values ($1, $2, $3)
       on conflict (platform, token) do nothing`,
      [guardian.rows[0].id, body.platform, body.token],
    );
    await pool.query(
      `insert into notification_preferences (guardian_id, rank_updates, class_reminders, billing, marketing)
       values ($1, $2, $3, $4, false)
       on conflict (guardian_id) do update set rank_updates = excluded.rank_updates`,
      [guardian.rows[0].id, !!body.rankUpdates, !!body.classReminders, !!body.billing],
    );
    return { status: 201, body: { registered: true, pushSent: false } };
  }

  if (method === 'POST' && parts[1] === 'promotions' && parts[2] === 'bulk') {
    if (role !== 'owner' && role !== 'school_lead') throw new CrmError(403, 'forbidden', 'School lead only.');
    const created = [];
    for (const item of body.promotions || []) {
      const rank = await pool.query(`select id from ranks where canonical_id = $1`, [item.canonicalId]);
      if (!rank.rowCount) throw new CrmError(404, 'not_found', 'Not found.');
      await pool.query(
        `insert into member_rank_events (member_id, rank_id, awarded_on, source) values ($1, $2, $3, 'testing')`,
        [item.memberId, rank.rows[0].id, item.awardedOn || chicagoToday(now)],
      );
      const job = await pool.query(
        `insert into certificate_jobs (member_id, rank_id, status) values ($1, $2, 'not_generated') returning id, status`,
        [item.memberId, rank.rows[0].id],
      );
      created.push({ memberId: item.memberId, certificate: job.rows[0], pdf: null });
    }
    return { status: 201, body: { promotions: created, pdfGenerated: false } };
  }

  if (method === 'POST' && parts[1] === 'sessions' && parts[3] === 'bookings') {
    const session = await pool.query(`select * from class_sessions where id = $1`, [parts[2]]);
    if (!session.rowCount) throw new CrmError(404, 'not_found', 'Not found.');
    const memberIds: string[] = body.memberIds || (body.memberId ? [body.memberId] : []);
    const results = [];
    for (const memberId of memberIds) {
      const member = await pool.query(`select id, family_id, location_id from members where id = $1`, [memberId]);
      if (!member.rowCount) throw new CrmError(404, 'not_found', 'Not found.');
      if (role === 'family' && !actor.familyIds.includes(member.rows[0].family_id)) throw new CrmError(404, 'not_found', 'Not found.');
      if ((role as string) === 'member' && actor.memberId !== memberId) throw new CrmError(404, 'not_found', 'Not found.');
      const booked = await pool.query(
        `select count(*)::int as n from bookings where session_id = $1 and status = 'booked'`,
        [parts[2]],
      );
      const waiting = await pool.query(
        `select count(*)::int as n from bookings where session_id = $1 and status = 'waitlist'`,
        [parts[2]],
      );
      let status = 'booked';
      if (booked.rows[0].n >= session.rows[0].capacity) {
        if (waiting.rows[0].n >= session.rows[0].waitlist_capacity) {
          throw new CrmError(409, 'full', 'That class is full.');
        }
        status = 'waitlist';
      }
      const saved = await pool.query(
        `insert into bookings (session_id, kind, member_id, status) values ($1, 'member', $2, $3) returning id, status`,
        [parts[2], memberId, status],
      );
      results.push(saved.rows[0]);
    }
    return { status: 201, body: { bookings: results } };
  }

  if (method === 'POST' && parts[1] === 'bookings' && parts[3] === 'cancel') {
    const booking = await pool.query(
      `select b.id, b.status, b.session_id, b.member_id, m.family_id
       from bookings b join members m on m.id = b.member_id where b.id = $1`,
      [parts[2]],
    );
    if (!booking.rowCount) throw new CrmError(404, 'not_found', 'Not found.');
    if (role === 'family' && !actor.familyIds.includes(booking.rows[0].family_id)) throw new CrmError(404, 'not_found', 'Not found.');
    const wasBooked = booking.rows[0].status === 'booked';
    await pool.query(`update bookings set status = 'cancelled' where id = $1`, [parts[2]]);
    let promoted = null;
    if (wasBooked) {
      const next = await pool.query(
        `update bookings set status = 'booked'
         where id = (
           select id from bookings where session_id = $1 and status = 'waitlist'
           order by created_at, id limit 1
         ) returning id`,
        [booking.rows[0].session_id],
      );
      promoted = next.rows[0]?.id || null;
    }
    return { status: 200, body: { cancelled: true, promotedBookingId: promoted } };
  }

  if (method === 'POST' && parts[1] === 'check-ins' && parts[2] === 'geofence') {
    if (role !== 'family' || !actor.familyIds.includes(body.familyId)) throw new CrmError(404, 'not_found', 'Not found.');
    return { status: 200, body: await checkInFamily(pool, {
      familyId: body.familyId,
      locationId: body.locationId,
      source: 'geofence_auto',
      latitude: body.latitude,
      longitude: body.longitude,
      now,
      requireGeofence: true,
    }) };
  }

  if (method === 'POST' && parts[1] === 'check-ins' && parts[2] === 'family') {
    if (!['qr_scan', 'kiosk', 'manual'].includes(body.source)) throw new CrmError(400, 'bad_source', 'Unknown check-in source.');
    if (role === 'family' && !actor.familyIds.includes(body.familyId)) throw new CrmError(404, 'not_found', 'Not found.');
    if (role !== 'family') staffSchool(actor, body.locationId);
    return { status: 200, body: await checkInFamily(pool, {
      familyId: body.familyId,
      locationId: body.locationId,
      source: body.source,
      latitude: body.latitude,
      longitude: body.longitude,
      now,
      requireGeofence: false,
    }) };
  }

  if (method === 'POST' && parts[1] === 'members' && parts[3] === 'geofence-opt-in') {
    const member = await pool.query(`select family_id from members where id = $1`, [parts[2]]);
    if (!member.rowCount) throw new CrmError(404, 'not_found', 'Not found.');
    if (role === 'family' && !actor.familyIds.includes(member.rows[0].family_id)) throw new CrmError(404, 'not_found', 'Not found.');
    await pool.query(`update members set geofence_checkin_opt_in = $2 where id = $1`, [parts[2], !!body.enabled]);
    return { status: 200, body: { enabled: !!body.enabled } };
  }

  if (method === 'POST' && parts[1] === 'families' && parts[3] === 'geofence-opt-in') {
    if (role === 'family' && !actor.familyIds.includes(parts[2])) throw new CrmError(404, 'not_found', 'Not found.');
    await pool.query(`update families set geofence_checkin_opt_in = $2 where id = $1`, [parts[2], !!body.enabled]);
    return { status: 200, body: { enabled: !!body.enabled } };
  }

  if (method === 'POST' && parts[1] === 'imports' && parts[2] === 'gymdesk-staging') {
    if (role === 'family' || role === 'coach') throw new CrmError(403, 'forbidden', 'Staff only.');
    if (!input.loadStaging) throw new CrmError(403, 'import_local_only', 'Staging import reads fixture files from the job.');
    const fx = await input.loadStaging();
    const summary = await withTx(pool, client => importStaging(client, {
      members: parseStagingMembers(fx.membersCsv),
      profiles: fx.profiles,
      holds: fx.holds,
      waivers: fx.waivers,
    }));
    return { status: 200, body: summary };
  }

  if (method === 'POST' && parts[1] === 'billing' && parts[2] === 'shadow') {
    if (role !== 'owner' && !actor.canFinance) throw new CrmError(403, 'forbidden', 'Finance access required.');
    if (!input.loadStaging) throw new CrmError(403, 'forbidden', 'Shadow compare uses the fixture payments file.');
    const fx = await input.loadStaging();
    const payments = parsePayments(fx.paymentsCsv);
    const rows = await pool.query(
      `select ms.gymdesk_member_id, ms.family_id, ms.location_id, ms.status, ms.biller, ms.next_bill_on, ms.paid_through_on,
              ms.discount_bps, ms.prepaid, ms.rollover_enabled, ms.rollover_cancelled, ms.rollover_cadence,
              ms.rollover_amount_cents, ms.rollover_anchor_on, ms.rollover_anchor_day,
              p.amount_cents, h.status as hold_status, h.start_on, h.end_on
       from memberships ms
       join plans p on p.id = ms.plan_id
       left join lateral (
         select status, start_on, end_on from holds
         where membership_id = ms.id and status in ('approved', 'active')
         order by start_on desc limit 1
       ) h on true
       where ms.gymdesk_member_id is not null`,
    );
    const creditRows = await pool.query(
      `select id, family_id, remaining_cents, expires_on, created_at
       from tuition_credits where voided = false and remaining_cents > 0`,
    );
    const creditsByFamily = new Map<string, ShadowMember['credits']>();
    for (const credit of creditRows.rows) {
      const list = creditsByFamily.get(credit.family_id) || [];
      list.push({
        id: credit.id,
        remainingCents: credit.remaining_cents,
        expiresOn: asDay(credit.expires_on),
        createdAt: new Date(credit.created_at).toISOString(),
      });
      creditsByFamily.set(credit.family_id, list);
    }
    const members: ShadowMember[] = rows.rows.map(row => ({
      memberId: row.gymdesk_member_id,
      locationId: row.location_id,
      status: row.status,
      biller: row.biller,
      nextBillOn: asDay(row.next_bill_on),
      paidThroughOn: asDay(row.paid_through_on),
      amountCents: row.amount_cents,
      discountBps: row.discount_bps,
      prepaid: row.prepaid,
      rolloverEnabled: row.rollover_enabled,
      rolloverCancelled: row.rollover_cancelled,
      rolloverCadence: row.rollover_cadence,
      rolloverAmountCents: row.rollover_amount_cents,
      rolloverAnchorOn: asDay(row.rollover_anchor_on),
      rolloverAnchorDay: row.rollover_anchor_day,
      credits: creditsByFamily.get(row.family_id) || [],
      hold: row.hold_status ? { status: row.hold_status, startOn: asDay(row.start_on) || '', endOn: asDay(row.end_on) || '' } : null,
    }));
    const report = compareShadowDay({ on: body.on, merchantLocationId: body.merchantLocationId, members, payments });
    await pool.query(
      `insert into billing_shadow_runs (merchant_location_id, run_on, summary) values ($1, $2, $3::jsonb)
       on conflict (merchant_location_id, run_on) do update set summary = excluded.summary`,
      [body.merchantLocationId, body.on, JSON.stringify(report)],
    );
    return { status: 200, body: { ...report, submitted: false } };
  }

  if (method === 'POST' && parts[1] === 'billing' && parts[2] === 'dunning' && parts[3] === 'preview') {
    if (role !== 'owner' && !actor.canFinance) throw new CrmError(403, 'forbidden', 'Finance access required.');
    const schedule = dunningSchedule(body.on || chicagoToday(now));
    return { status: 200, body: { sent: false, attempts: schedule } };
  }

  if (method === 'GET' && parts[1] === 'families' && parts[3] === 'statements') {
    if (role === 'family' && !actor.familyIds.includes(parts[2])) throw new CrmError(404, 'not_found', 'Not found.');
    const year = search.get('year') || '2026';
    const rows = await pool.query(
      `select to_char(occurred_on, 'YYYY-MM') as month,
              coalesce(sum(case
                when source_type in ('tuition_credit', 'referral_reward') and amount_cents > 0 then 0
                else amount_cents
              end), 0)::int as cents
       from ledger_entries where family_id = $1 and shadow = false and occurred_on >= $2 and occurred_on < $3
       group by 1 order by 1`,
      [parts[2], `${year}-01-01`, `${Number(year) + 1}-01-01`],
    );
    const total = rows.rows.reduce((sum, row) => sum + row.cents, 0);
    const balance = await creditBalance(pool, parts[2], chicagoToday(now));
    return { status: 200, body: { year: Number(year), months: rows.rows, totalCents: total, creditBalanceCents: balance, delivery: 'not_sent' } };
  }

  if (method === 'GET' && parts[1] === 'families' && parts[3] === 'timeline') {
    if (role === 'family' && !actor.familyIds.includes(parts[2])) throw new CrmError(404, 'not_found', 'Not found.');
    const events = await loadFamilyTimeline(pool, parts[2]);
    return { status: 200, body: { events: events.rows } };
  }

  if (method === 'GET' && parts[1] === 'members' && parts[3] === 'timeline') {
    const member = await pool.query(`select id, family_id, location_id from members where id = $1`, [parts[2]]);
    if (!member.rowCount) throw new CrmError(404, 'not_found', 'Not found.');
    if (role === 'family' && !actor.familyIds.includes(member.rows[0].family_id)) throw new CrmError(404, 'not_found', 'Not found.');
    if (role !== 'family' && role !== 'owner' && !actor.locationIds.includes(member.rows[0].location_id)) {
      throw new CrmError(404, 'not_found', 'Not found.');
    }
    const events = await loadFamilyTimeline(pool, member.rows[0].family_id);
    const rows = events.rows.filter(row => !row.member_id || row.member_id === member.rows[0].id);
    return { status: 200, body: { events: rows } };
  }

  if (method === 'GET' && parts[1] === 'families' && parts[3] === 'switcher') {
    if (role === 'family' && !actor.familyIds.includes(parts[2])) throw new CrmError(404, 'not_found', 'Not found.');
    const rows = await pool.query(
      `select id, first_name, last_name, location_id from members where family_id = $1 order by first_name`,
      [parts[2]],
    );
    return { status: 200, body: { familyId: parts[2], members: rows.rows } };
  }

  if (method === 'POST' && parts[1] === 'automations' && parts[2] === 'run') {
    if (role !== 'owner') throw new CrmError(403, 'forbidden', 'Owner only.');
    const rules = await pool.query(`select code from automation_rules where dry_run = true and enabled = false`);
    for (const rule of rules.rows) {
      await pool.query(
        `insert into communication_log (rule_code, channel, status, template_code) values ($1, 'email', 'dry_run', $1)`,
        [rule.code],
      );
    }
    return { status: 200, body: { sent: false, logged: rules.rowCount } };
  }

  if (method === 'POST' && parts[1] === 'qbo' && parts[2] === 'preview') {
    if (role !== 'owner' && !actor.canFinance) throw new CrmError(403, 'forbidden', 'Finance access required.');
    assertQboOffline(env);
    const company = companyForSchool(body.locationId || 'waunakee');
    const doc = instructorBill({
      companyId: company.id,
      txnDate: body.on || chicagoToday(now),
      vendorName: body.vendorName || 'Instructor Sample',
      amountCents: body.amountCents || 1000,
      expenseAccount: 'FIX-5000',
      payableAccount: 'FIX-2000',
      className: body.locationId || 'waunakee',
      description: 'Fixture private-lesson share',
    });
    await pool.query(
      `insert into qbo_export_previews (company_id, kind, period_start, period_end, payload, submitted)
       values ($1, 'bill', $2, $2, $3::jsonb, false)`,
      [company.id, body.on || chicagoToday(now), JSON.stringify(doc.payload)],
    );
    return { status: 200, body: doc };
  }

  if (method === 'POST' && parts[1] === 'payment-profiles' && parts[2] === 'accept') {
    if (role !== 'owner' && role !== 'family' && role !== 'front_desk' && role !== 'school_lead') {
      throw new CrmError(403, 'forbidden', 'Not allowed.');
    }
    return {
      status: 200,
      body: { stored: false, charged: false, mode: 'sandbox', reason: 'profile_create_disabled' },
    };
  }

  if (method === 'GET' && parts[1] === 'reports' && parts[2] === 'retention') {
    if (role === 'family' || role === 'coach') throw new CrmError(403, 'forbidden', 'Staff only.');
    const locationId = search.get('locationId') || '';
    if (locationId) staffSchool(actor, locationId);
    const trials = await pool.query(
      `select count(*)::int as n from leads where ($1 = '' or location_id = $1) and pipeline_status in ('trial_booked', 'trial_attended', 'converted')`,
      [locationId],
    );
    const converted = await pool.query(
      `select count(*)::int as n from leads where ($1 = '' or location_id = $1) and pipeline_status = 'converted'`,
      [locationId],
    );
    return {
      status: 200,
      body: {
        trials: trials.rows[0].n,
        converted: converted.rows[0].n,
        conversionRate: trials.rows[0].n ? converted.rows[0].n / trials.rows[0].n : 0,
        atRiskRule: 'recent <= half of a baseline of at least 4 classes',
      },
    };
  }

  if (method === 'GET' && parts[1] === 'parties') {
    const locationId = search.get('locationId') || '';
    staffSchool(actor, locationId);
    const rows = await pool.query(
      `select b.id, b.host_name, b.host_email, b.child_name, b.payment_status, b.charged, b.status,
              p.name as package_name, s.starts_at
       from party_bookings b
       join party_packages p on p.id = b.package_id
       join party_slots s on s.id = b.slot_id
       where b.location_id = $1 and b.status = 'booked'
       order by s.starts_at`,
      [locationId],
    );
    return { status: 200, body: { parties: rows.rows } };
  }

  if (method === 'POST' && parts[1] === 'leads' && parts[3] === 'convert') {
    if (role !== 'owner' && role !== 'school_lead' && role !== 'front_desk') throw new CrmError(403, 'forbidden', 'Staff only.');
    const lead = await pool.query(`select * from leads where id = $1`, [parts[2]]);
    if (!lead.rowCount) throw new CrmError(404, 'not_found', 'Not found.');
    const row = lead.rows[0];
    staffSchool(actor, row.location_id);
    const result = await withTx(pool, async client => convertLead(client, row, body, actor.email));
    return { status: 200, body: result };
  }

  if (method === 'GET' && parts[1] === 'reports' && parts[2] === 'at-risk') {
    if (role === 'family') throw new CrmError(403, 'forbidden', 'Staff only.');
    return { status: 200, body: { flagged: isAtRisk({ recent: Number(search.get('recent') || 0), baseline: Number(search.get('baseline') || 0) }) } };
  }

  if (method === 'POST' && parts[1] === 'holds' && parts[3] === 'decision') {
    if (!canApproveHolds(role)) throw new CrmError(403, 'forbidden', 'School lead approval required.');
    const hold = await pool.query(
      `select h.id, ms.location_id from holds h join memberships ms on ms.id = h.membership_id where h.id = $1`,
      [parts[2]],
    );
    if (!hold.rowCount) throw new CrmError(404, 'not_found', 'Not found.');
    if (role !== 'owner' && !actor.locationIds.includes(hold.rows[0].location_id)) throw new CrmError(404, 'not_found', 'Not found.');
    const status = body.decision === 'denied' ? 'denied' : 'approved';
    await pool.query(`update holds set status = $2 where id = $1`, [parts[2], status]);
    await pool.query(
      `insert into audit_log (actor_email, action, entity_type, entity_id, location_id) values ($1, $2, 'hold', $3, $4)`,
      [actor.email, status, parts[2], hold.rows[0].location_id],
    );
    return { status: 200, body: { status } };
  }

  if (method === 'POST' && parts[1] === 'charges' && parts[2] === 'attempt') {
    const result = prepareCharge(env, body);
    return { status: 200, body: result };
  }

  const comms = await handleComms({ method, parts, search, actor, body, pool, env });
  if (comms) return comms;

  return null;
}

async function loadFamilyTimeline(pool: PoolLike, familyId: string) {
  return pool.query(
    `select 'attendance' as kind, a.attended_on as on, a.source as label, a.member_id::text as member_id
     from attendance a join members m on m.id = a.member_id where m.family_id = $1
     union all
     select 'rank', e.awarded_on, rk.name, e.member_id::text
     from member_rank_events e
     join members m on m.id = e.member_id join ranks rk on rk.id = e.rank_id where m.family_id = $1
     union all
     select 'ledger', l.occurred_on, l.source_type, l.member_id::text
     from ledger_entries l
     where l.family_id = $1 and l.shadow = false
     union all
     select 'lead', ld.created_at::date, ld.pipeline_status, null
     from leads ld
     join attributions at on at.lead_id = ld.id where at.family_id = $1
     union all
     select 'message', msg.created_at::date, left(msg.body, 140), t.member_id::text
     from messages msg
     join message_threads t on t.id = msg.thread_id
     where t.family_id = $1
     union all
     select 'automation', r.created_at::date, w.code, e.member_id::text
     from automation_step_runs r
     join automation_enrollments e on e.id = r.enrollment_id
     join automation_workflows w on w.id = e.workflow_id
     where e.family_id = $1
     order by 2, 1`,
    [familyId],
  );
}

async function publicRoutes(input: {
  method: string;
  parts: string[];
  search: URLSearchParams;
  body: unknown;
  pool: PoolLike;
}): Promise<{ status: number; body: unknown }> {
  const { method, parts, search, pool } = input;
  const body = (input.body || {}) as Record<string, any>;
  if (method === 'GET' && parts[2] === 'goninja' && parts[3] === 'packages') {
    const locationId = search.get('locationId') || '';
    if (locationId !== 'goninjaW' && locationId !== 'goninjaV') throw new CrmError(404, 'not_found', 'Not found.');
    const packages = await pool.query(`select id, name, duration_min, price_cents, deposit_cents from party_packages where location_id = $1 and active`, [locationId]);
    const addons = await pool.query(`select id, name, price_cents from party_addons where location_id = $1 and active`, [locationId]);
    return { status: 200, body: { packages: packages.rows, addons: addons.rows } };
  }
  if (method === 'GET' && parts[2] === 'goninja' && parts[3] === 'slots') {
    const locationId = search.get('locationId') || '';
    const slots = await pool.query(
      `select s.id, s.starts_at, s.ends_at
       from party_slots s
       where s.location_id = $1 and s.status = 'open'
         and not exists (select 1 from party_bookings b where b.slot_id = s.id and b.status <> 'cancelled')
       order by s.starts_at`,
      [locationId],
    );
    return { status: 200, body: { slots: slots.rows } };
  }
  if (method === 'POST' && parts[2] === 'goninja' && parts[3] === 'bookings' && !parts[4]) {
    const accessKey = randomUUID();
    try {
      const saved = await withTx(pool, async client => {
        const slot = await client.query(`select id, location_id from party_slots where id = $1 and status = 'open' for update`, [body.slotId]);
        if (!slot.rowCount) throw new CrmError(404, 'not_found', 'Not found.');
        const taken = await client.query(`select 1 from party_bookings where slot_id = $1 and status <> 'cancelled'`, [body.slotId]);
        if (taken.rowCount) throw new CrmError(409, 'slot_taken', 'That party time is already booked.');
        const lead = await client.query(
          `insert into leads (location_id, guardian_name, email, child_name, child_age, source, status, pipeline_status, utm)
           values ($1, $2, $3, $4, $5, 'goninja_party', 'new', 'new', $6::jsonb) returning id`,
          [slot.rows[0].location_id, body.hostName, String(body.hostEmail || '').toLowerCase(), body.childName, String(body.childAge), JSON.stringify(body.utm || {})],
        );
        const booking = await client.query(
          `insert into party_bookings
             (slot_id, package_id, location_id, lead_id, host_name, host_email, child_name, child_age, guest_count, access_key_hash)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning id`,
          [body.slotId, body.packageId, slot.rows[0].location_id, lead.rows[0].id, body.hostName, String(body.hostEmail).toLowerCase(), body.childName, String(body.childAge), body.guestCount || 1, hashKey(accessKey)],
        );
        for (const addonId of body.addonIds || []) {
          await client.query(`insert into party_booking_addons (booking_id, addon_id) values ($1, $2)`, [booking.rows[0].id, addonId]);
        }
        await client.query(
          `insert into attributions (lead_id, location_id, source_type, source_id) values ($1, $2, 'party', $3)`,
          [lead.rows[0].id, slot.rows[0].location_id, booking.rows[0].id],
        );
        await client.query(
          `insert into parties (location_id, lead_id, party_on, package_name, headcount)
           select $1, $2, (s.starts_at at time zone 'America/Chicago')::date, p.name, $3
           from party_slots s, party_packages p where s.id = $4 and p.id = $5`,
          [slot.rows[0].location_id, lead.rows[0].id, body.guestCount || 1, body.slotId, body.packageId],
        );
        return booking.rows[0].id as string;
      });
      return { status: 201, body: { bookingId: saved, accessKey, charged: false, paymentStatus: 'unpaid' } };
    } catch (err) {
      if (err && typeof err === 'object' && (err as { code?: string }).code === '23505') {
        throw new CrmError(409, 'slot_taken', 'That party time is already booked.');
      }
      throw err;
    }
  }
  if (method === 'POST' && parts[2] === 'goninja' && parts[5] === 'payment') {
    const booking = await pool.query(`select access_key_hash, payment_status from party_bookings where id = $1`, [parts[4]]);
    if (!booking.rowCount || !keysMatch(booking.rows[0].access_key_hash, body.accessKey || '')) {
      throw new CrmError(404, 'not_found', 'Not found.');
    }
    const opaque = body.opaqueData?.dataValue || '';
    if (!body.opaqueData?.dataDescriptor || String(opaque).length < 8) {
      throw new CrmError(400, 'bad_token', 'An Accept.js token is required.');
    }
    const intent = body.pay === 'full' ? 'full_intent' : 'deposit_intent';
    await pool.query(`update party_bookings set payment_status = $2 where id = $1`, [parts[4], intent]);
    return { status: 200, body: { submitted: false, charged: false, paymentStatus: intent } };
  }
  if (method === 'GET' && parts[2] === 'trials') {
    const age = Number(search.get('age') || 0);
    const locationId = search.get('locationId') || '';
    const rows = await pool.query(
      `select id, title, starts_at, capacity, age_min, age_max from class_sessions
       where location_id = $1 and trial_open and status = 'scheduled'
         and (age_min is null or age_min <= $2) and (age_max is null or age_max >= $2)
         and starts_at > now()
       order by starts_at`,
      [locationId, age],
    );
    return { status: 200, body: { sessions: rows.rows } };
  }
  if (method === 'POST' && parts[2] === 'trials') {
    const age = Number(String(body.childAge).replace(/[^0-9].*$/, ''));
    const session = await pool.query(
      `select id, location_id, age_min, age_max, capacity from class_sessions where id = $1 and trial_open`,
      [body.sessionId],
    );
    if (!session.rowCount) throw new CrmError(404, 'not_found', 'Not found.');
    const row = session.rows[0];
    if ((row.age_min != null && age < row.age_min) || (row.age_max != null && age > row.age_max)) {
      throw new CrmError(422, 'age', 'That class is for a different age group.');
    }
    const saved = await withTx(pool, async client => {
      const lead = await client.query(
        `insert into leads (location_id, guardian_name, email, child_name, child_age, source, status, pipeline_status, utm)
         values ($1, $2, $3, $4, $5, $6, 'booked', 'trial_booked', $7::jsonb) returning id`,
        [row.location_id, body.guardianName, String(body.email || '').toLowerCase(), body.childName, String(body.childAge), body.source || 'website', JSON.stringify(body.utm || {})],
      );
      const booking = await client.query(
        `insert into bookings (session_id, kind, lead_id, status) values ($1, 'trial', $2, 'booked') returning id`,
        [row.id, lead.rows[0].id],
      );
      if (body.waiver?.version && body.waiver?.signerName) {
        await client.query(
          `insert into lead_waivers (lead_id, waiver_version, signer_name, signed_on, minor) values ($1, $2, $3, $4, true)`,
          [lead.rows[0].id, body.waiver.version, body.waiver.signerName, body.waiver.signedOn || chicagoToday()],
        );
      }
      await client.query(
        `insert into attributions (lead_id, location_id, source_type, source_id) values ($1, $2, 'trial', $3)`,
        [lead.rows[0].id, row.location_id, booking.rows[0].id],
      );
      let referral = null;
      const referralCode = body.referralCode || body.referral_code;
      if (referralCode) {
        referral = await attributeReferral(client, {
          code: String(referralCode),
          leadId: lead.rows[0].id,
          locationId: row.location_id,
          stage: 'trial_booked',
        });
      }
      return { leadId: lead.rows[0].id, bookingId: booking.rows[0].id, referral };
    });
    return { status: 201, body: { leadId: saved.leadId, bookingId: saved.bookingId, referral: saved.referral, accountRequired: false } };
  }
  throw new CrmError(404, 'not_found', 'Not found.');
}

async function convertLead(client: Db, lead: any, body: Record<string, any> = {}, actorEmail: string | null = null) {
  let guardian = await client.query(`select id from guardians where email = $1`, [lead.email]);
  if (!guardian.rowCount) {
    guardian = await client.query(
      `insert into guardians (email, first_name, last_name) values ($1, $2, $3) returning id`,
      [lead.email, lead.guardian_name, lead.guardian_name],
    );
  }
  const family = await client.query(`insert into families (display_name) values ($1) returning id`, [lead.child_name]);
  await client.query(
    `insert into guardian_families (family_id, guardian_id, role) values ($1, $2, 'payer') on conflict do nothing`,
    [family.rows[0].id, guardian.rows[0].id],
  );
  const member = await client.query(
    `insert into members (family_id, location_id, first_name, last_name, status, prospect_age)
     values ($1, $2, $3, $4, 'trial', $5) returning id`,
    [family.rows[0].id, lead.location_id, lead.child_name, lead.guardian_name, lead.child_age],
  );
  let plan = await client.query(`select id from plans where location_id = $1 and name = 'Trial' limit 1`, [lead.location_id]);
  if (!plan.rowCount) {
    plan = await client.query(
      `insert into plans (location_id, name, program, amount_cents, interval) values ($1, 'Trial', 'taekwondo', 0, 'prepaid_term') returning id`,
      [lead.location_id],
    );
  }
  const today = chicagoToday();
  const membership = await client.query(
    `insert into memberships (family_id, location_id, plan_id, status, biller, started_on, anchor_on)
     values ($1, $2, $3, 'trial', 'gymdesk', $4, $4) returning id`,
    [family.rows[0].id, lead.location_id, plan.rows[0].id, today],
  );
  await client.query(
    `insert into membership_members (membership_id, member_id) values ($1, $2)`,
    [membership.rows[0].id, member.rows[0].id],
  );
  const waivers = await client.query(`select * from lead_waivers where lead_id = $1`, [lead.id]);
  for (const waiver of waivers.rows) {
    await client.query(
      `insert into waivers (family_id, member_id, location_id, waiver_version, signed_on, minor)
       values ($1, $2, $3, $4, $5, true)`,
      [family.rows[0].id, member.rows[0].id, lead.location_id, waiver.waiver_version, waiver.signed_on],
    );
    await client.query(
      `insert into member_documents (family_id, member_id, kind, title, signed_on, minor)
       values ($1, $2, 'waiver', $3, $4, true)`,
      [family.rows[0].id, member.rows[0].id, waiver.waiver_version, waiver.signed_on],
    );
  }
  await client.query(
    `update attributions set family_id = $2, member_id = $3 where lead_id = $1`,
    [lead.id, family.rows[0].id, member.rows[0].id],
  );
  await client.query(`update leads set pipeline_status = 'converted', status = 'enrolled' where id = $1`, [lead.id]);
  await client.query(
    `insert into ledger_entries (occurred_on, family_id, member_id, location_id, source_type, source_id, amount_cents, memo)
     values ($1, $2, $3, $4, 'membership', $5, 0, 'trial conversion')`,
    [today, family.rows[0].id, member.rows[0].id, lead.location_id, membership.rows[0].id],
  );
  const referralCode = body.referralCode || body.referral_code;
  if (referralCode) {
    await attributeReferral(client, {
      code: String(referralCode),
      leadId: lead.id,
      locationId: lead.location_id,
      stage: 'lead',
    });
  }
  const referral = await advanceReferral(client, {
    leadId: lead.id,
    familyId: family.rows[0].id,
    memberId: member.rows[0].id,
    locationId: lead.location_id,
    guardianName: lead.guardian_name || '',
    actorEmail,
  });
  return { familyId: family.rows[0].id, memberId: member.rows[0].id, leadId: lead.id, referral };
}

async function checkInFamily(pool: PoolLike, input: {
  familyId: string;
  locationId: string;
  source: string;
  latitude?: number;
  longitude?: number;
  now: Date;
  requireGeofence: boolean;
}) {
  const family = await pool.query(`select geofence_checkin_opt_in from families where id = $1`, [input.familyId]);
  if (!family.rowCount) throw new CrmError(404, 'not_found', 'Not found.');
  const school = await pool.query(
    `select latitude, longitude, geofence_radius_m, checkin_minutes_before, checkin_minutes_after from locations where id = $1`,
    [input.locationId],
  );
  if (!school.rowCount) throw new CrmError(404, 'not_found', 'Not found.');
  if (input.requireGeofence) {
    if (!family.rows[0].geofence_checkin_opt_in) throw new CrmError(403, 'geofence_opt_out', 'Geofence check-in is off for this family.');
    const loc = school.rows[0];
    if (loc.latitude == null || loc.longitude == null || loc.geofence_radius_m == null) {
      throw new CrmError(409, 'geofence_not_configured', 'This school has no geofence yet.');
    }
    const fence = insideGeofence({
      latitude: Number(input.latitude),
      longitude: Number(input.longitude),
      schoolLatitude: Number(loc.latitude),
      schoolLongitude: Number(loc.longitude),
      radiusM: loc.geofence_radius_m,
    });
    if (!fence.inside) throw new CrmError(422, 'outside_geofence', 'Outside the school geofence.');
  }
  const window = school.rows[0];
  const bookings = await pool.query(
    `select b.id as booking_id, b.member_id, m.geofence_checkin_opt_in, s.id as session_id, s.starts_at
     from bookings b
     join members m on m.id = b.member_id
     join class_sessions s on s.id = b.session_id
     where m.family_id = $1 and s.location_id = $2 and b.status = 'booked' and b.kind = 'member' and s.status = 'scheduled'`,
    [input.familyId, input.locationId],
  );
  const checkedIn = [];
  const skipped = [];
  for (const booking of bookings.rows) {
    const starts = new Date(booking.starts_at).getTime();
    const open = sessionInCheckinWindow({
      nowMs: input.now.getTime(),
      startsAtMs: starts,
      beforeMin: window.checkin_minutes_before,
      afterMin: window.checkin_minutes_after,
    });
    if (!open) { skipped.push({ memberId: booking.member_id, reason: 'outside_window' }); continue; }
    if (input.requireGeofence && !booking.geofence_checkin_opt_in) {
      skipped.push({ memberId: booking.member_id, reason: 'opted_out' });
      continue;
    }
    const existing = await pool.query(
      `select id from attendance where member_id = $1 and session_id = $2`,
      [booking.member_id, booking.session_id],
    );
    if (existing.rowCount) { skipped.push({ memberId: booking.member_id, reason: 'duplicate' }); continue; }
    await pool.query(
      `insert into attendance (session_id, member_id, location_id, attended_on, status, source)
       values ($1, $2, $3, $4, 'present', $5)`,
      [booking.session_id, booking.member_id, input.locationId, chicagoToday(input.now), input.source],
    );
    checkedIn.push({ memberId: booking.member_id, sessionId: booking.session_id, source: input.source });
  }
  return { checkedIn, skipped, coordinateStored: false };
}

export async function shadowMembersFromRows(rows: any[]): Promise<ShadowMember[]> {
  return rows;
}

export { companyForSchool, merchantAccountFor, payoutReport };
export type { PayRule, TaughtLesson };
