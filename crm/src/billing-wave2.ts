/**
 * Wave 2 billing preview: first check-in, upcoming edits, sold-by, fees, categories.
 * Nothing in this file submits a charge or a QuickBooks document.
 */
import type { Actor } from './auth.ts';
import { assertFinance, assertStaff, canSeeLocation } from './auth.ts';
import {
  addMonths, billingAnchor, cadenceForPlan, draftDates, guardedPriceChange, type Cadence,
} from './billing.ts';
import { asDay, chicagoToday } from './dates.ts';
import { CrmError } from './errors.ts';
import { toCsv } from './financials.ts';
import { isLocationId } from './automations.ts';
import { assertUuid, rethrowDb, withTx, type Sql, type SqlPool } from './query.ts';

export type CardState = 'unknown' | 'ok' | 'expired' | 'soon';

export function cardExpiryState(expMonth: number | null, expYear: number | null, asOf: string): CardState {
  if (!expMonth || !expYear || expMonth < 1 || expMonth > 12) return 'unknown';
  const [year, month, day] = asOf.split('-').map(Number);
  const expires = new Date(Date.UTC(expYear, expMonth, 0));
  const on = new Date(Date.UTC(year, month - 1, day));
  if (on > expires) return 'expired';
  const soonThrough = new Date(Date.UTC(year, month + 1, 0));
  if (expires <= soonThrough) return 'soon';
  return 'ok';
}

export function billingStart(input: {
  startedOn: string;
  anchorOn?: string | null;
  enabled: boolean;
  firstCheckinOn?: string | null;
}): { anchor: string; waiting: boolean } {
  if (!input.enabled) return { anchor: billingAnchor(input.startedOn, input.anchorOn), waiting: false };
  if (!input.firstCheckinOn || input.firstCheckinOn < input.startedOn) {
    return { anchor: input.startedOn, waiting: true };
  }
  return { anchor: input.firstCheckinOn, waiting: false };
}

export type PaymentOverride = {
  id?: string;
  dueOn: string;
  newAmountCents: number | null;
  newDueOn: string | null;
  skip: boolean;
  undoneAt: string | null;
};

export function upcomingPayments(input: {
  anchor: string;
  cadence: Cadence;
  asOf: string;
  count: number;
  endsOn?: string | null;
  amountCents: number;
  overrides: PaymentOverride[];
  waiting?: boolean;
}): Array<{ dueOn: string; originalDueOn: string; amountCents: number; skip: boolean; overrideId: string | null }> {
  if (input.waiting || input.cadence === 'prepaid_term') return [];
  const count = Math.min(24, Math.max(1, input.count));
  const horizon = addMonths(input.asOf, 36);
  let dates = draftDates({ anchor: input.anchor, cadence: input.cadence, from: input.asOf, through: horizon });
  if (dates[0] !== input.anchor && input.anchor >= input.asOf) dates = [input.anchor, ...dates];
  dates = [...new Set(dates)].sort();
  if (input.endsOn) dates = dates.filter(date => date <= input.endsOn!);
  const active = input.overrides.filter(row => !row.undoneAt);
  const byDue = new Map(active.map(row => [row.dueOn, row]));
  const out = [];
  for (const due of dates) {
    if (out.length >= count) break;
    const over = byDue.get(due);
    if (over?.skip) {
      out.push({ dueOn: due, originalDueOn: due, amountCents: 0, skip: true, overrideId: over.id || null });
      continue;
    }
    out.push({
      dueOn: over?.newDueOn || due,
      originalDueOn: due,
      amountCents: over?.newAmountCents ?? input.amountCents,
      skip: false,
      overrideId: over?.id || null,
    });
  }
  return out;
}

export function processingFeeCents(input: {
  amountCents: number;
  method: 'card' | 'ach';
  cardFeeBps: number;
  cardFeeFixedCents: number;
  achFeeCents: number;
  passThrough: boolean;
}): number {
  if (!input.passThrough) return 0;
  if (input.method === 'ach') return Math.max(0, Math.round(input.achFeeCents));
  const bps = Math.min(10000, Math.max(0, input.cardFeeBps));
  return Math.round(input.amountCents * bps / 10000) + Math.max(0, Math.round(input.cardFeeFixedCents));
}

export function equalShares(count: number): number[] {
  if (!Number.isInteger(count) || count < 1) return [];
  const base = Math.floor(10000 / count);
  let remainder = 10000 - base * count;
  return Array.from({ length: count }, () => {
    const extra = remainder > 0 ? 1 : 0;
    if (remainder > 0) remainder -= 1;
    return base + extra;
  });
}

export function resolveShares(parts: Array<{ shareBps?: number | null }>): number[] {
  const stated = parts.map(part => (part.shareBps == null ? null : Number(part.shareBps)));
  if (stated.every(share => share == null)) return equalShares(parts.length);
  const given = stated.reduce((sum: number, share) => sum + (share || 0), 0);
  const open = stated.filter(share => share == null).length;
  if (stated.some(share => share != null && (!Number.isInteger(share) || share <= 0))) {
    throw new CrmError(400, 'bad_share', 'shareBps must be a positive integer.');
  }
  if (given > 10000) throw new CrmError(409, 'sale_credit_share_cap', 'Sold-by shares cannot total more than 100%.');
  const rest = 10000 - given;
  if (open === 0) return stated.map(share => share || 0);
  if (rest < open) throw new CrmError(400, 'bad_share', 'Not enough share remains for the open seats.');
  const base = Math.floor(rest / open);
  let leftover = rest - base * open;
  const filled: number[] = [];
  for (const share of stated) {
    if (share != null) filled.push(share);
    else {
      const extra = leftover > 0 ? 1 : 0;
      if (leftover > 0) leftover -= 1;
      filled.push(base + extra);
    }
  }
  return filled;
}

export function groupByIncomeCategory(lines: Array<{ categoryName: string; accountCode: string; amountCents: number }>) {
  const map = new Map<string, { categoryName: string; accountCode: string; amountCents: number }>();
  for (const line of lines) {
    const key = line.categoryName + '\0' + line.accountCode;
    const current = map.get(key) || { categoryName: line.categoryName, accountCode: line.accountCode, amountCents: 0 };
    current.amountCents += line.amountCents;
    map.set(key, current);
  }
  return [...map.values()].sort((a, b) => a.categoryName.localeCompare(b.categoryName));
}

function requireStaff(actor: Actor | null): Actor {
  if (!actor) throw new CrmError(401, 'unauthorized', 'Sign in required.');
  assertStaff(actor);
  return actor;
}

function requireSchool(actor: Actor, locationId: string) {
  if (!isLocationId(locationId)) throw new CrmError(400, 'bad_location', 'Unknown school.');
  if (!canSeeLocation(actor, locationId)) throw new CrmError(404, 'not_found', 'Not found.');
}

type MembershipBill = {
  id: string;
  familyId: string;
  locationId: string;
  startedOn: string;
  anchorOn: string;
  endsOn: string | null;
  amountCents: number;
  cadence: Cadence;
  enabled: boolean;
  firstCheckinOn: string | null;
  discountBps: number;
};

async function loadMembership(db: Sql, actor: Actor, id: string): Promise<MembershipBill> {
  const row = await db.query(
    `select ms.id, ms.family_id, ms.location_id, ms.started_on, ms.anchor_on, ms.ends_on, ms.discount_bps,
            ms.billing_starts_on_first_checkin, ms.first_checkin_at,
            p.amount_cents, p.interval, p.grandfathered, p.name, p.program::text as program, p.start_on_first_checkin
     from memberships ms
     join plans p on p.id = ms.plan_id
     where ms.id = $1`,
    [assertUuid(id)],
  );
  if (!row.rowCount) throw new CrmError(404, 'not_found', 'Not found.');
  requireSchool(actor, String(row.rows[0].location_id));
  const found = row.rows[0];
  return {
    id: String(found.id),
    familyId: String(found.family_id),
    locationId: String(found.location_id),
    startedOn: asDay(found.started_on) || '',
    anchorOn: asDay(found.anchor_on) || '',
    endsOn: asDay(found.ends_on),
    amountCents: Number(found.amount_cents),
    cadence: cadenceForPlan({
      name: found.name,
      program: found.program,
      grandfathered: found.grandfathered === true,
      interval: found.interval,
    }),
    enabled: found.billing_starts_on_first_checkin === true || found.start_on_first_checkin === true,
    firstCheckinOn: asDay(found.first_checkin_at),
    discountBps: Number(found.discount_bps || 0),
  };
}

function netAmount(cents: number, discountBps: number) {
  const bps = Math.min(10000, Math.max(0, discountBps));
  return Math.round(cents * (10000 - bps) / 10000);
}

export async function listUpcoming(db: Sql, actor: Actor | null, membershipId: string, countRaw: string | null, asOfRaw?: string | null) {
  const staff = requireStaff(actor);
  const membership = await loadMembership(db, staff, membershipId);
  const asOf = asOfRaw && /^\d{4}-\d{2}-\d{2}$/.test(asOfRaw) ? asOfRaw : chicagoToday();
  const start = billingStart({
    startedOn: membership.startedOn,
    anchorOn: membership.anchorOn,
    enabled: membership.enabled,
    firstCheckinOn: membership.firstCheckinOn,
  });
  const overrides = await db.query(
    `select id, due_on, new_amount_cents, new_due_on, skip, undone_at
     from scheduled_payment_overrides where membership_id = $1`,
    [membership.id],
  );
  const payments = upcomingPayments({
    anchor: start.anchor,
    cadence: membership.cadence,
    asOf,
    count: Number(countRaw || 6) || 6,
    endsOn: membership.endsOn,
    amountCents: netAmount(membership.amountCents, membership.discountBps),
    waiting: start.waiting,
    overrides: overrides.rows.map(row => ({
      id: String(row.id),
      dueOn: asDay(row.due_on) || '',
      newAmountCents: row.new_amount_cents == null ? null : Number(row.new_amount_cents),
      newDueOn: asDay(row.new_due_on),
      skip: row.skip === true,
      undoneAt: row.undone_at ? String(row.undone_at) : null,
    })),
  });
  return {
    status: 200,
    body: {
      membershipId: membership.id,
      anchor: start.anchor,
      waiting: start.waiting,
      charged: false,
      payments,
    },
  };
}

function snapshotOf(body: Record<string, unknown>) {
  const snapshot = body.snapshot as { at?: string; rows?: unknown[] } | undefined;
  try {
    guardedPriceChange({
      currentAmountCents: 0,
      proposedAmountCents: 0,
      snapshot: snapshot && snapshot.at ? { at: String(snapshot.at), rows: snapshot.rows || [] } : null,
    });
  } catch {
    throw new CrmError(422, 'snapshot_required', 'Snapshot upcoming charges before changing a membership.');
  }
}

export async function overrideUpcoming(db: Sql, actor: Actor | null, membershipId: string, dueOn: string, body: Record<string, unknown>) {
  const staff = requireStaff(actor);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueOn)) throw new CrmError(400, 'bad_date', 'dueOn must be YYYY-MM-DD.');
  snapshotOf(body);
  const preview = await listUpcoming(db, staff, membershipId, '24');
  const payments = (preview.body as { payments: Array<{ originalDueOn: string; amountCents: number }> }).payments;
  const current = payments.find(row => row.originalDueOn === dueOn);
  if (!current) throw new CrmError(404, 'not_found', 'That draft is not on the upcoming schedule.');
  const skip = body.skip === true;
  const newAmount = body.newAmountCents == null ? null : Number(body.newAmountCents);
  const newDue = body.newDueOn == null || body.newDueOn === '' ? null : String(body.newDueOn);
  if (newAmount != null && (!Number.isInteger(newAmount) || newAmount < 0)) throw new CrmError(400, 'bad_amount', 'newAmountCents must be a non-negative integer.');
  if (newDue && !/^\d{4}-\d{2}-\d{2}$/.test(newDue)) throw new CrmError(400, 'bad_date', 'newDueOn must be YYYY-MM-DD.');
  const reason = body.reason == null ? null : String(body.reason).slice(0, 500);
  try {
    const row = await db.query(
      `insert into scheduled_payment_overrides (
         membership_id, due_on, original_amount_cents, new_amount_cents, new_due_on, skip, reason, created_by
       ) values ($1, $2::date, $3, $4, $5::date, $6, $7, $8)
       returning id, due_on, skip`,
      [assertUuid(membershipId), dueOn, current.amountCents, skip ? null : newAmount, skip ? null : newDue, skip, reason, staff.email],
    );
    await db.query(
      `insert into audit_log (actor_email, action, entity_type, entity_id, location_id)
       select $1, 'payment_override', 'membership', id, location_id from memberships where id = $2`,
      [staff.email, membershipId],
    );
    return { status: 201, body: { id: row.rows[0].id, dueOn: asDay(row.rows[0].due_on), skip: row.rows[0].skip === true, charged: false } };
  } catch (err) {
    rethrowDb(err);
  }
}

export async function undoOverride(db: Sql, actor: Actor | null, id: string) {
  const staff = requireStaff(actor);
  const row = await db.query(
    `update scheduled_payment_overrides o
     set undone_at = now(), undone_by = $2
     from memberships ms
     where o.id = $1 and o.undone_at is null and ms.id = o.membership_id
     returning o.id, ms.location_id`,
    [assertUuid(id), staff.email],
  );
  if (!row.rowCount) throw new CrmError(404, 'not_found', 'Not found.');
  requireSchool(staff, String(row.rows[0].location_id));
  return { status: 200, body: { id: row.rows[0].id, undone: true, charged: false } };
}

export async function patchMembership(db: Sql, actor: Actor | null, id: string, body: Record<string, unknown>) {
  const staff = requireStaff(actor);
  const membership = await loadMembership(db, staff, id);
  snapshotOf(body);
  guardedPriceChange({
    currentAmountCents: membership.amountCents,
    proposedAmountCents: membership.amountCents,
    snapshot: body.snapshot as { at: string; rows: unknown[] },
  });
  const sets: string[] = [];
  const params: unknown[] = [];
  if (body.started_on != null || body.startedOn != null) {
    const started = String(body.startedOn || body.started_on);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(started)) throw new CrmError(400, 'bad_date', 'started_on must be YYYY-MM-DD.');
    params.push(started);
    sets.push(`started_on = $${params.length}::date`);
    params.push(started);
    sets.push(`anchor_on = $${params.length}::date`);
  }
  if (body.ends_on != null || body.endsOn != null) {
    const ends = body.endsOn === null || body.ends_on === null || body.endsOn === '' || body.ends_on === ''
      ? null
      : String(body.endsOn || body.ends_on);
    if (ends && !/^\d{4}-\d{2}-\d{2}$/.test(ends)) throw new CrmError(400, 'bad_date', 'ends_on must be YYYY-MM-DD.');
    params.push(ends);
    sets.push(`ends_on = $${params.length}::date`);
  }
  if (body.payment_profile_id != null || body.paymentProfileId != null) {
    const profileId = String(body.paymentProfileId || body.payment_profile_id);
    const profile = await db.query(
      `select id from payment_profiles where id = $1 and family_id = $2`,
      [assertUuid(profileId), membership.familyId],
    );
    if (!profile.rowCount) throw new CrmError(404, 'not_found', 'Not found.');
    params.push(profileId);
    sets.push(`payment_profile_id = $${params.length}::uuid`);
  }
  if (!sets.length) throw new CrmError(400, 'bad_patch', 'Send started_on, ends_on, or payment_profile_id.');
  params.push(membership.id);
  const saved = await db.query(
    `update memberships set ${sets.join(', ')} where id = $${params.length}::uuid
     returning id, started_on, ends_on, payment_profile_id`,
    params,
  );
  await db.query(
    `insert into audit_log (actor_email, action, entity_type, entity_id, location_id)
     values ($1, 'membership_dates', 'membership', $2, $3)`,
    [staff.email, membership.id, membership.locationId],
  );
  const row = saved.rows[0];
  return {
    status: 200,
    body: {
      id: row.id,
      startedOn: asDay(row.started_on),
      endsOn: asDay(row.ends_on),
      paymentProfileId: row.payment_profile_id,
      charged: false,
    },
  };
}

const MEMBER_STATUSES = new Set(['trial', 'active', 'hold', 'cancelled', 'inactive']);

export async function filteredMembers(db: Sql, actor: Actor | null, search: URLSearchParams, asCsv: boolean) {
  const staff = requireStaff(actor);
  const params: unknown[] = [];
  const where = ['true'];
  const add = (sql: string, value: unknown) => {
    params.push(value);
    where.push(sql.replace('?', `$${params.length}`));
  };
  const locationId = search.get('locationId') || '';
  if (locationId) {
    requireSchool(staff, locationId);
    add('m.location_id = ?', locationId);
  } else if (staff.role !== 'admin') {
    params.push(staff.locationIds);
    where.push(`m.location_id = any($${params.length}::text[])`);
  }
  if (search.get('status')) {
    const status = search.get('status') || '';
    if (!MEMBER_STATUSES.has(status)) throw new CrmError(400, 'bad_status', 'Unknown member status.');
    add('m.status = ?::member_status', status);
  }
  if (search.get('startedFrom')) add(`exists (select 1 from membership_members mm join memberships ms on ms.id = mm.membership_id where mm.member_id = m.id and ms.started_on >= ?::date)`, search.get('startedFrom'));
  if (search.get('startedTo')) add(`exists (select 1 from membership_members mm join memberships ms on ms.id = mm.membership_id where mm.member_id = m.id and ms.started_on <= ?::date)`, search.get('startedTo'));
  if (search.get('soldBy')) {
    add(`exists (
      select 1 from membership_members mm
      join sale_credits sc on sc.membership_id = mm.membership_id
      where mm.member_id = m.id and sc.staff_id = ?::uuid
    )`, assertUuid(search.get('soldBy') || ''));
  }
  if (search.get('tag')) {
    const tag = search.get('tag') || '';
    params.push(tag, tag);
    const a = params.length - 1;
    const b = params.length;
    where.push(`exists (
      select 1 from entity_tags et
      join tags t on t.id = et.tag_id
      where et.member_id = m.id and (t.id::text = $${a} or lower(t.name) = lower($${b}))
    )`);
  }
  if (search.get('customStatus')) {
    const custom = search.get('customStatus') || '';
    params.push(custom, custom);
    const a = params.length - 1;
    const b = params.length;
    where.push(`exists (
      select 1 from custom_statuses cs
      where cs.id = m.custom_status_id and (cs.id::text = $${a} or lower(cs.name) = lower($${b}))
    )`);
  }
  const asOf = search.get('asOf') || chicagoToday();
  const card = search.get('cardExpired');
  if (card === 'true' || card === 'soon') {
    params.push(asOf);
    const mark = `$${params.length}`;
    const endExpr = `(make_date(pp.exp_year::int, pp.exp_month::int, 1) + interval '1 month' - interval '1 day')::date`;
    const compare = card === 'true'
      ? `${endExpr} < ${mark}::date`
      : `${endExpr} >= ${mark}::date and ${endExpr} <= (date_trunc('month', ${mark}::date) + interval '2 month' - interval '1 day')::date`;
    where.push(`exists (
      select 1 from payment_profiles pp
      where pp.family_id = m.family_id and pp.exp_month is not null and pp.exp_year is not null and ${compare}
    )`);
  }
  const rows = await db.query(
    `select m.id, m.family_id, m.location_id, m.first_name, m.last_name, m.status,
            cs.name as custom_status,
            (select min(ms.started_on) from membership_members mm join memberships ms on ms.id = mm.membership_id where mm.member_id = m.id) as started_on
     from members m
     left join custom_statuses cs on cs.id = m.custom_status_id
     where ${where.join(' and ')}
     order by m.last_name, m.first_name
     limit 500`,
    params,
  );
  const members = rows.rows.map(row => ({
    id: row.id,
    familyId: row.family_id,
    locationId: row.location_id,
    firstName: row.first_name,
    lastName: row.last_name,
    status: row.status,
    customStatus: row.custom_status,
    startedOn: asDay(row.started_on),
  }));
  if (!asCsv) return { status: 200, body: { members } };
  const csv = toCsv(
    ['id', 'first_name', 'last_name', 'status', 'location_id', 'started_on', 'custom_status'],
    members.map(row => [row.id, row.firstName, row.lastName, row.status, row.locationId, row.startedOn || '', row.customStatus || '']),
  );
  return { status: 200, body: { csv }, text: csv, contentType: 'text/csv; charset=utf-8' };
}

export async function replaceSaleCredits(pool: SqlPool, actor: Actor | null, body: Record<string, unknown>) {
  const staff = requireStaff(actor);
  const membershipId = body.membershipId ? assertUuid(String(body.membershipId)) : null;
  const retailId = body.retailPurchaseId ? assertUuid(String(body.retailPurchaseId)) : null;
  const eventId = body.eventRegistrationId ? assertUuid(String(body.eventRegistrationId)) : null;
  const pointers = [membershipId, retailId, eventId].filter(Boolean);
  if (pointers.length !== 1) throw new CrmError(400, 'bad_sale', 'Send exactly one of membershipId, retailPurchaseId, or eventRegistrationId.');
  const people = Array.isArray(body.staff) ? body.staff as Array<Record<string, unknown>> : [];
  if (!people.length) throw new CrmError(400, 'bad_sale', 'Send at least one staff share.');
  const shares = resolveShares(people.map(person => ({
    shareBps: person.shareBps == null && person.share_bps == null ? null : Number(person.shareBps ?? person.share_bps),
  })));
  try {
    return await withTx(pool, async client => {
      if (membershipId) {
        const row = await client.query(`select location_id from memberships where id = $1`, [membershipId]);
        if (!row.rowCount) throw new CrmError(404, 'not_found', 'Not found.');
        requireSchool(staff, String(row.rows[0].location_id));
        await client.query(`delete from sale_credits where membership_id = $1`, [membershipId]);
      }
      if (retailId) {
        const row = await client.query(`select location_id from retail_purchases where id = $1`, [retailId]);
        if (!row.rowCount) throw new CrmError(404, 'not_found', 'Not found.');
        requireSchool(staff, String(row.rows[0].location_id));
        await client.query(`delete from sale_credits where retail_purchase_id = $1`, [retailId]);
      }
      if (eventId) {
        const row = await client.query(
          `select e.location_id from event_registrations r join events e on e.id = r.event_id where r.id = $1`,
          [eventId],
        );
        if (!row.rowCount) throw new CrmError(404, 'not_found', 'Not found.');
        if (row.rows[0].location_id) requireSchool(staff, String(row.rows[0].location_id));
        await client.query(`delete from sale_credits where event_registration_id = $1`, [eventId]);
      }
      const saved = [];
      for (let i = 0; i < people.length; i += 1) {
        const staffId = assertUuid(String(people[i].staffId || people[i].staff_id || ''));
        const known = await client.query(`select id from staff_users where id = $1`, [staffId]);
        if (!known.rowCount) throw new CrmError(404, 'not_found', 'Not found.');
        const row = await client.query(
          `insert into sale_credits (membership_id, retail_purchase_id, event_registration_id, staff_id, share_bps, created_by)
           values ($1, $2, $3, $4, $5, $6)
           returning id, staff_id, share_bps`,
          [membershipId, retailId, eventId, staffId, shares[i], staff.email],
        );
        await client.query(
          `insert into audit_log (actor_email, action, entity_type, entity_id, location_id)
           values ($1, 'sale_credit', 'sale_credit', $2, null)`,
          [staff.email, row.rows[0].id],
        );
        saved.push({ id: row.rows[0].id, staffId: row.rows[0].staff_id, shareBps: Number(row.rows[0].share_bps) });
      }
      return { status: 201, body: { credits: saved, charged: false } };
    });
  } catch (err) {
    rethrowDb(err);
  }
}

export async function patchSaleCredit(db: Sql, actor: Actor | null, id: string, body: Record<string, unknown>) {
  const staff = requireStaff(actor);
  const share = Number(body.shareBps ?? body.share_bps);
  if (!Number.isInteger(share) || share <= 0 || share > 10000) throw new CrmError(400, 'bad_share', 'shareBps must be from 1 to 10000.');
  try {
    const row = await db.query(
      `update sale_credits set share_bps = $2, updated_at = now() where id = $1 returning id, share_bps`,
      [assertUuid(id), share],
    );
    if (!row.rowCount) throw new CrmError(404, 'not_found', 'Not found.');
    await db.query(
      `insert into audit_log (actor_email, action, entity_type, entity_id, location_id)
       values ($1, 'sale_credit_edit', 'sale_credit', $2, null)`,
      [staff.email, id],
    );
    return { status: 200, body: { id: row.rows[0].id, shareBps: Number(row.rows[0].share_bps) } };
  } catch (err) {
    rethrowDb(err);
  }
}

export async function replaceLocationAccess(db: Sql, actor: Actor | null, membershipId: string, body: Record<string, unknown>) {
  const staff = requireStaff(actor);
  const membership = await loadMembership(db, staff, membershipId);
  const locationIds = Array.isArray(body.locationIds) ? body.locationIds.map(id => String(id)) : [];
  for (const locationId of locationIds) {
    if (!isLocationId(locationId)) throw new CrmError(400, 'bad_location', 'Unknown school.');
  }
  await db.query(`delete from membership_location_access where membership_id = $1`, [membership.id]);
  for (const locationId of locationIds) {
    if (locationId === membership.locationId) continue;
    await db.query(
      `insert into membership_location_access (membership_id, location_id) values ($1, $2) on conflict do nothing`,
      [membership.id, locationId],
    );
  }
  const rows = await db.query(
    `select location_id from membership_location_access where membership_id = $1 order by 1`,
    [membership.id],
  );
  return { status: 200, body: { membershipId: membership.id, locationIds: rows.rows.map(row => row.location_id) } };
}

export async function feeForLocation(db: Sql, locationId: string, amountCents: number, method: 'card' | 'ach'): Promise<number> {
  if (!locationId) return 0;
  const row = await db.query(
    `select card_fee_bps, card_fee_fixed_cents, ach_fee_cents, pass_through
     from merchant_accounts where location_id = $1`,
    [locationId],
  );
  if (!row.rowCount) return 0;
  const found = row.rows[0];
  return processingFeeCents({
    amountCents,
    method,
    cardFeeBps: Number(found.card_fee_bps || 0),
    cardFeeFixedCents: Number(found.card_fee_fixed_cents || 0),
    achFeeCents: Number(found.ach_fee_cents || 0),
    passThrough: found.pass_through === true,
  });
}

export async function incomeCsv(db: Sql, actor: Actor | null, search: URLSearchParams) {
  const staff = requireStaff(actor);
  assertFinance(staff);
  const locationId = search.get('locationId') || '';
  if (locationId) requireSchool(staff, locationId);
  const rows = await db.query(
    `select coalesce(c.name, 'Uncategorized') as category_name,
            coalesce(c.qbo_account_code, '') as account_code,
            coalesce(sum(l.amount_cents), 0)::int as amount_cents
     from invoice_lines l
     join invoices i on i.id = l.invoice_id
     left join income_categories c on c.id = l.income_category_id
     where ($1 = '' or i.location_id = $1)
     group by 1, 2
     order by 1`,
    [locationId],
  );
  const groups = groupByIncomeCategory(rows.rows.map(row => ({
    categoryName: String(row.category_name),
    accountCode: String(row.account_code),
    amountCents: Number(row.amount_cents),
  })));
  const csv = toCsv(
    ['category', 'qbo_account_code', 'amount'],
    groups.map(row => [row.categoryName, row.accountCode, (row.amountCents / 100).toFixed(2)]),
  );
  return { status: 200, body: { groups, submitted: false, csv }, text: csv, contentType: 'text/csv; charset=utf-8' };
}
