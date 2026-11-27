/**
 * Wave 2 schedule and booking.
 * No-show release records an audit row and a dry-run event. It does not send.
 * Session credits here are class visits, separate from prepaid renewal rollover.
 */
import type { Actor } from './auth.ts';
import { CrmError } from './errors.ts';
import { assertStaff, canSeeLocation } from './auth.ts';
import { addDays, addMonths, billingAnchor, cadenceForPlan, type Cadence } from './billing.ts';
import { SCHEDULE_VIEWS, scheduleRange, type ScheduleView } from './class-calendar.ts';
import { asDay, chicagoToday } from './dates.ts';
import { attendanceCountsFor, programsCredited, sessionSeatCapacity } from './eligibility.ts';
import { isLocationId } from './automations.ts';
import { fireDryRun } from './automation-run.ts';
import { assertUuid, rethrowDb, withTx, type Sql, type SqlPool } from './query.ts';

export { attendanceCountsFor, programsCredited, sessionSeatCapacity, scheduleRange, SCHEDULE_VIEWS };
export type { ScheduleView };

export function noShowDue(startsAt: Date, graceMin: number | null, asOf: Date): boolean {
  if (graceMin == null || !Number.isFinite(graceMin) || graceMin < 0) return false;
  return asOf.getTime() >= startsAt.getTime() + graceMin * 60_000;
}

export function remainingCredits(row: { granted: number; used: number; rolledIn: number; expired: number }): number {
  return row.granted + row.rolledIn - row.used - row.expired;
}

/** Unused visits roll forward. A null cap means there is no ceiling. */
export function rollSessionCredits(input: { unused: number; rolloverCap: number | null }): { rolledIn: number; expired: number } {
  const unused = Math.max(0, input.unused);
  if (input.rolloverCap == null) return { rolledIn: unused, expired: 0 };
  const rolledIn = Math.min(unused, Math.max(0, input.rolloverCap));
  return { rolledIn, expired: unused - rolledIn };
}

export function periodStartOn(input: {
  startedOn: string;
  anchorOn: string | null;
  cadence: Cadence;
  on: string;
}): string {
  const anchor = billingAnchor(input.startedOn, input.anchorOn);
  if (input.cadence === 'prepaid_term' || input.on <= anchor) return anchor;
  let cursor = anchor;
  let prev = anchor;
  while (cursor <= input.on) {
    prev = cursor;
    cursor = input.cadence === 'monthly' ? addMonths(cursor, 1) : addDays(cursor, 28);
  }
  return prev;
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

async function staffRow(db: Sql, email: string): Promise<string | null> {
  const row = await db.query(`select id from staff_users where lower(email) = lower($1) and active = true limit 1`, [email]);
  return row.rows[0]?.id ? String(row.rows[0].id) : null;
}

export async function familyHasLocationAccess(db: Sql, memberId: string, locationId: string): Promise<boolean> {
  const row = await db.query(
    `select exists (
       select 1 from members m where m.id = $1 and m.location_id = $2
       union all
       select 1 from members m
       join memberships ms on ms.family_id = m.family_id
       where m.id = $1 and ms.location_id = $2
       union all
       select 1 from members m
       join memberships ms on ms.family_id = m.family_id
       join membership_location_access a on a.membership_id = ms.id
       where m.id = $1 and a.location_id = $2
     ) as ok`,
    [memberId, locationId],
  );
  return row.rows[0]?.ok === true;
}

export async function activeKioskSession(db: Sql, locationId: string, now: Date): Promise<string | null> {
  const row = await db.query(
    `select session_id from kiosk_sessions
     where location_id = $1 and expires_at > $2
     order by created_at desc
     limit 1`,
    [locationId, now.toISOString()],
  );
  return row.rows[0]?.session_id ? String(row.rows[0].session_id) : null;
}

export async function noteFirstCheckin(db: Sql, memberId: string, attendedOn: string): Promise<void> {
  await db.query(
    `update memberships ms
     set first_checkin_at = ($2::date::timestamp at time zone 'America/Chicago')
     from membership_members mm, plans p
     where mm.membership_id = ms.id
       and p.id = ms.plan_id
       and mm.member_id = $1
       and ms.first_checkin_at is null
       and (ms.billing_starts_on_first_checkin or p.start_on_first_checkin)
       and ms.started_on <= $2::date`,
    [memberId, attendedOn],
  );
}

export async function consumeSessionCredit(db: Sql, memberId: string, on: string): Promise<{ counted: boolean; remaining: number | null }> {
  const plan = await db.query(
    `select ms.id as membership_id, ms.started_on, ms.anchor_on,
            p.sessions_per_period, p.rollover_cap, p.interval, p.grandfathered, p.name, p.program::text as program
     from membership_members mm
     join memberships ms on ms.id = mm.membership_id
     join plans p on p.id = ms.plan_id
     where mm.member_id = $1
       and ms.status in ('active', 'trial', 'past_due')
       and p.sessions_per_period is not null
     order by ms.started_on desc
     limit 1`,
    [memberId],
  );
  if (!plan.rowCount) return { counted: false, remaining: null };
  const found = plan.rows[0];
  const cadence = cadenceForPlan({
    name: found.name,
    program: found.program,
    grandfathered: found.grandfathered === true,
    interval: found.interval,
  });
  const period = periodStartOn({
    startedOn: asDay(found.started_on) || chicagoToday(),
    anchorOn: asDay(found.anchor_on),
    cadence,
    on,
  });
  const previous = await db.query(
    `select id, granted, used, rolled_in, expired
     from session_credit_ledger
     where membership_id = $1 and period_start < $2::date
     order by period_start desc
     limit 1`,
    [found.membership_id, period],
  );
  let rolledIn = 0;
  let expiredAdd = 0;
  let previousId: string | null = null;
  if (previous.rowCount) {
    const prev = previous.rows[0];
    previousId = String(prev.id);
    const unused = remainingCredits({
      granted: Number(prev.granted),
      used: Number(prev.used),
      rolledIn: Number(prev.rolled_in),
      expired: Number(prev.expired),
    });
    const rolled = rollSessionCredits({
      unused,
      rolloverCap: found.rollover_cap == null ? null : Number(found.rollover_cap),
    });
    rolledIn = rolled.rolledIn;
    expiredAdd = rolled.expired;
  }
  const inserted = await db.query(
    `insert into session_credit_ledger (membership_id, period_start, granted, used, rolled_in, expired)
     values ($1, $2::date, $3, 0, $4, 0)
     on conflict (membership_id, period_start) do nothing
     returning id`,
    [found.membership_id, period, Number(found.sessions_per_period), rolledIn],
  );
  if (inserted.rowCount && previousId && expiredAdd > 0) {
    await db.query(
      `update session_credit_ledger set expired = expired + $2, updated_at = now() where id = $1`,
      [previousId, expiredAdd],
    );
  }
  const ledger = await db.query(
    `select id, granted, used, rolled_in, expired
     from session_credit_ledger
     where membership_id = $1 and period_start = $2::date`,
    [found.membership_id, period],
  );
  const row = ledger.rows[0];
  const remaining = remainingCredits({
    granted: Number(row.granted),
    used: Number(row.used),
    rolledIn: Number(row.rolled_in),
    expired: Number(row.expired),
  });
  if (remaining < 1) throw new CrmError(409, 'session_credits', 'No session credits remain for this period.');
  await db.query(
    `update session_credit_ledger set used = used + 1, updated_at = now() where id = $1`,
    [row.id],
  );
  return { counted: true, remaining: remaining - 1 };
}

export async function promoteEarliestWaitlist(db: Sql, sessionId: string): Promise<{ id: string; memberId: string | null; leadId: string | null } | null> {
  const next = await db.query(
    `update bookings set status = 'booked'
     where id = (
       select id from bookings
       where session_id = $1 and status = 'waitlist'
       order by created_at, id
       limit 1
     )
     returning id, member_id, lead_id`,
    [sessionId],
  );
  if (!next.rowCount) return null;
  const row = next.rows[0];
  return {
    id: String(row.id),
    memberId: row.member_id ? String(row.member_id) : null,
    leadId: row.lead_id ? String(row.lead_id) : null,
  };
}

async function seatStatus(db: Sql, sessionId: string, capacity: number, waitlistCapacity: number): Promise<'booked' | 'waitlist'> {
  const booked = await db.query(
    `select count(*)::int as n from bookings where session_id = $1 and status = 'booked'`,
    [sessionId],
  );
  if (Number(booked.rows[0].n) < sessionSeatCapacity(capacity)) return 'booked';
  const waiting = await db.query(
    `select count(*)::int as n from bookings where session_id = $1 and status = 'waitlist'`,
    [sessionId],
  );
  if (Number(waiting.rows[0].n) >= waitlistCapacity) throw new CrmError(409, 'full', 'That class is full.');
  return 'waitlist';
}

export async function createStaffBookings(pool: SqlPool, actor: Actor | null, body: Record<string, unknown>) {
  const staff = requireStaff(actor);
  const sessionId = assertUuid(String(body.sessionId || body.session_id || ''));
  const memberIds = Array.isArray(body.memberIds) ? body.memberIds.map(id => assertUuid(String(id))) : [];
  const leadIds = Array.isArray(body.leadIds) ? body.leadIds.map(id => assertUuid(String(id))) : [];
  if (!memberIds.length && !leadIds.length) throw new CrmError(400, 'bad_booking', 'Send memberIds or leadIds.');
  try {
    return await withTx(pool, async client => {
      const session = await client.query(
        `select id, location_id, capacity, waitlist_capacity, status, starts_at from class_sessions where id = $1`,
        [sessionId],
      );
      if (!session.rowCount) throw new CrmError(404, 'not_found', 'Not found.');
      const school = String(session.rows[0].location_id);
      requireSchool(staff, school);
      if (session.rows[0].status !== 'scheduled') throw new CrmError(409, 'session_closed', 'That class is not open for booking.');
      const on = chicagoToday(new Date(session.rows[0].starts_at));
      const saved = [];
      for (const memberId of memberIds) {
        const member = await client.query(`select id, location_id from members where id = $1`, [memberId]);
        if (!member.rowCount) throw new CrmError(404, 'not_found', 'Not found.');
        if (!await familyHasLocationAccess(client, memberId, school)) {
          throw new CrmError(403, 'no_location_access', 'That membership is not valid at this school.');
        }
        const status = await seatStatus(client, sessionId, Number(session.rows[0].capacity), Number(session.rows[0].waitlist_capacity));
        if (status === 'booked') await consumeSessionCredit(client, memberId, on);
        const row = await client.query(
          `insert into bookings (session_id, kind, member_id, status) values ($1, 'member', $2, $3) returning id, status, member_id`,
          [sessionId, memberId, status],
        );
        saved.push({ id: row.rows[0].id, status: row.rows[0].status, memberId: row.rows[0].member_id, leadId: null });
      }
      for (const leadId of leadIds) {
        const lead = await client.query(`select id, location_id from leads where id = $1`, [leadId]);
        if (!lead.rowCount) throw new CrmError(404, 'not_found', 'Not found.');
        if (String(lead.rows[0].location_id) !== school) throw new CrmError(403, 'no_location_access', 'That lead is at another school.');
        const status = await seatStatus(client, sessionId, Number(session.rows[0].capacity), Number(session.rows[0].waitlist_capacity));
        const row = await client.query(
          `insert into bookings (session_id, kind, lead_id, status) values ($1, 'trial', $2, $3) returning id, status, lead_id`,
          [sessionId, leadId, status],
        );
        await client.query(`update leads set pipeline_status = 'trial_booked' where id = $1`, [leadId]);
        saved.push({ id: row.rows[0].id, status: row.rows[0].status, memberId: null, leadId: row.rows[0].lead_id });
      }
      return { status: 201, body: { bookings: saved, sent: false } };
    });
  } catch (err) {
    rethrowDb(err);
  }
}

export async function listBookings(db: Sql, actor: Actor | null, search: URLSearchParams) {
  const staff = requireStaff(actor);
  const params: unknown[] = [];
  const where = [search.get('status') ? 'true' : `b.status <> 'cancelled'`];
  const add = (sql: string, value: unknown) => {
    params.push(value);
    where.push(sql.replace('?', `$${params.length}`));
  };
  if (search.get('from')) add(`(s.starts_at at time zone 'America/Chicago')::date >= ?::date`, search.get('from'));
  if (search.get('to')) add(`(s.starts_at at time zone 'America/Chicago')::date <= ?::date`, search.get('to'));
  if (search.get('sessionId')) add('b.session_id = ?::uuid', assertUuid(search.get('sessionId') || ''));
  if (search.get('status')) add('b.status = ?', search.get('status'));
  if (search.get('program')) {
    params.push(search.get('program'), search.get('program'));
    const left = params.length - 1;
    const right = params.length;
    where.push(`(s.program = $${left} or exists (select 1 from class_session_programs cp where cp.session_id = s.id and cp.program_code = $${right}))`);
  }
  if (search.get('instructor')) add('t.instructor = ?', search.get('instructor'));
  const locationId = search.get('locationId') || '';
  if (locationId) {
    requireSchool(staff, locationId);
    add('s.location_id = ?', locationId);
  } else if (staff.role !== 'admin') {
    params.push(staff.locationIds);
    where.push(`s.location_id = any($${params.length}::text[])`);
  }
  const rows = await db.query(
    `select b.id, b.session_id, b.member_id, b.lead_id, b.kind, b.status, b.created_at,
            s.location_id, s.starts_at, s.title, s.program, t.instructor
     from bookings b
     join class_sessions s on s.id = b.session_id
     left join class_templates t on t.id = s.template_id
     where ${where.join(' and ')}
     order by s.starts_at, b.created_at
     limit 500`,
    params,
  );
  return {
    status: 200,
    body: {
      bookings: rows.rows.map(row => ({
        id: row.id,
        sessionId: row.session_id,
        memberId: row.member_id,
        leadId: row.lead_id,
        kind: row.kind,
        status: row.status,
        locationId: row.location_id,
        startsAt: row.starts_at,
        title: row.title,
        program: row.program,
        instructor: row.instructor || null,
      })),
    },
  };
}

export async function duplicateSession(pool: SqlPool, actor: Actor | null, sessionId: string, body: Record<string, unknown>) {
  const staff = requireStaff(actor);
  const startsAt = String(body.startsAt || body.starts_at || '');
  if (!Number.isFinite(Date.parse(startsAt))) throw new CrmError(400, 'bad_date', 'startsAt must be a time.');
  try {
    return await withTx(pool, async client => {
      const session = await client.query(`select * from class_sessions where id = $1`, [assertUuid(sessionId)]);
      if (!session.rowCount) throw new CrmError(404, 'not_found', 'Not found.');
      requireSchool(staff, String(session.rows[0].location_id));
      const copy = await client.query(
        `insert into class_sessions (
           template_id, location_id, title, starts_at, ends_at, capacity, status, program,
           waitlist_capacity, trial_open, age_min, age_max
         )
         select template_id, location_id, title, $2::timestamptz,
                $2::timestamptz + (ends_at - starts_at), capacity, 'scheduled', program,
                waitlist_capacity, trial_open, age_min, age_max
         from class_sessions where id = $1
         returning id`,
        [sessionId, startsAt],
      );
      const id = String(copy.rows[0].id);
      await client.query(
        `insert into class_session_programs (session_id, program_code)
         select $2, program_code from class_session_programs where session_id = $1
         on conflict do nothing`,
        [sessionId, id],
      );
      await client.query(
        `insert into session_booking_options (session_id, template_id, kind, price_cents, plan_ids, capacity, active)
         select $2, template_id, kind, price_cents, plan_ids, capacity, active
         from session_booking_options where session_id = $1`,
        [sessionId, id],
      );
      const programs = await client.query(`select program_code from class_session_programs where session_id = $1 order by 1`, [id]);
      const options = await client.query(`select count(*)::int as n from session_booking_options where session_id = $1`, [id]);
      const bookings = await client.query(`select count(*)::int as n from bookings where session_id = $1`, [id]);
      return {
        status: 201,
        body: {
          id,
          startsAt,
          programs: programs.rows.map(row => row.program_code),
          bookingOptions: Number(options.rows[0].n),
          bookings: Number(bookings.rows[0].n),
        },
      };
    });
  } catch (err) {
    rethrowDb(err);
  }
}

export async function listSchedule(db: Sql, actor: Actor | null, search: URLSearchParams) {
  const staff = requireStaff(actor);
  const view = String(search.get('view') || 'week');
  if (!(SCHEDULE_VIEWS as readonly string[]).includes(view)) throw new CrmError(400, 'bad_view', 'view must be month, week, day, or list.');
  const date = search.get('date') || chicagoToday();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new CrmError(400, 'bad_date', 'date must be YYYY-MM-DD.');
  const range = scheduleRange(view as ScheduleView, date);
  const locationId = search.get('locationId') || '';
  if (locationId) requireSchool(staff, locationId);
  const params: unknown[] = [range.from, range.to];
  let locationSql = '';
  if (locationId) {
    params.push(locationId);
    locationSql = ` and s.location_id = $${params.length}`;
  } else if (staff.role !== 'admin') {
    params.push(staff.locationIds);
    locationSql = ` and s.location_id = any($${params.length}::text[])`;
  }
  const rows = await db.query(
    `select s.id, s.location_id, s.title, s.starts_at, s.ends_at, s.capacity, s.status, s.program,
            t.instructor,
            coalesce(array_agg(distinct p.program_code) filter (where p.program_code is not null), '{}') as programs
     from class_sessions s
     left join class_templates t on t.id = s.template_id
     left join class_session_programs p on p.session_id = s.id
     where (s.starts_at at time zone 'America/Chicago')::date between $1::date and $2::date
       ${locationSql}
     group by s.id, t.instructor
     order by s.starts_at, s.title`,
    params,
  );
  const program = search.get('program') || '';
  const sessions = rows.rows
    .map(row => {
      const programs = programsCredited([...(row.programs || []), row.program].filter(Boolean).map(String));
      return {
        id: row.id,
        locationId: row.location_id,
        title: row.title,
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        capacity: sessionSeatCapacity(Number(row.capacity)),
        status: row.status,
        instructor: row.instructor || null,
        programs,
      };
    })
    .filter(row => !program || attendanceCountsFor(row.programs, program));
  return { status: 200, body: { view, from: range.from, to: range.to, sessions } };
}

const PREF_VIEWS = new Set(['month', 'week', 'day', 'list']);

export async function readPrefs(db: Sql, actor: Actor | null) {
  const staff = requireStaff(actor);
  const row = await db.query(`select ui_prefs from staff_users where lower(email) = lower($1)`, [staff.email]);
  const prefs = (row.rows[0]?.ui_prefs || {}) as Record<string, unknown>;
  return {
    status: 200,
    body: {
      default_schedule_location: prefs.default_schedule_location || null,
      default_view: prefs.default_view || null,
    },
  };
}

export async function patchPrefs(db: Sql, actor: Actor | null, body: Record<string, unknown>) {
  const staff = requireStaff(actor);
  const next: Record<string, string> = {};
  if (body.default_schedule_location != null && body.default_schedule_location !== '') {
    const locationId = String(body.default_schedule_location);
    requireSchool(staff, locationId);
    next.default_schedule_location = locationId;
  }
  if (body.default_view != null && body.default_view !== '') {
    const view = String(body.default_view);
    if (!PREF_VIEWS.has(view)) throw new CrmError(400, 'bad_view', 'default_view must be month, week, day, or list.');
    next.default_view = view;
  }
  const row = await db.query(
    `update staff_users
     set ui_prefs = ui_prefs || $2::jsonb
     where lower(email) = lower($1)
     returning ui_prefs`,
    [staff.email, JSON.stringify(next)],
  );
  if (!row.rowCount) throw new CrmError(404, 'not_found', 'Not found.');
  const prefs = row.rows[0].ui_prefs || {};
  return {
    status: 200,
    body: {
      default_schedule_location: prefs.default_schedule_location || null,
      default_view: prefs.default_view || null,
    },
  };
}

export async function saveKioskSession(db: Sql, actor: Actor | null, body: Record<string, unknown>) {
  const staff = requireStaff(actor);
  const locationId = String(body.locationId || '');
  requireSchool(staff, locationId);
  const sessionId = assertUuid(String(body.sessionId || ''));
  const session = await db.query(`select location_id from class_sessions where id = $1`, [sessionId]);
  if (!session.rowCount || String(session.rows[0].location_id) !== locationId) throw new CrmError(404, 'not_found', 'Not found.');
  const expiresAt = String(body.expiresAt || '');
  if (!Number.isFinite(Date.parse(expiresAt))) throw new CrmError(400, 'bad_date', 'expiresAt must be a time.');
  const label = body.deviceLabel == null ? null : String(body.deviceLabel).trim();
  if (label && /tel:|sms:/i.test(label)) throw new CrmError(400, 'phone_not_accepted', 'A device label cannot include a phone link.');
  const selectedBy = await staffRow(db, staff.email);
  const row = await db.query(
    `insert into kiosk_sessions (location_id, session_id, device_label, selected_by, expires_at)
     values ($1, $2, $3, $4, $5::timestamptz)
     returning id, session_id, expires_at`,
    [locationId, sessionId, label, selectedBy, expiresAt],
  );
  return { status: 201, body: { id: row.rows[0].id, sessionId: row.rows[0].session_id, expiresAt: row.rows[0].expires_at } };
}

export async function recordAttendance(pool: SqlPool, actor: Actor | null, body: Record<string, unknown>) {
  const staff = requireStaff(actor);
  const memberId = assertUuid(String(body.memberId || ''));
  const locationId = String(body.locationId || '');
  requireSchool(staff, locationId);
  const attendedOn = String(body.attendedOn || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(attendedOn)) throw new CrmError(400, 'bad_date', 'attendedOn must be YYYY-MM-DD.');
  const programCode = body.programCode ? String(body.programCode) : null;
  const sessionId = body.sessionId ? assertUuid(String(body.sessionId)) : null;
  const member = await pool.query(`select id from members where id = $1`, [memberId]);
  if (!member.rowCount) throw new CrmError(404, 'not_found', 'Not found.');
  if (!await familyHasLocationAccess(pool, memberId, locationId)) {
    throw new CrmError(403, 'no_location_access', 'That membership is not valid at this school.');
  }
  if (sessionId) {
    const session = await pool.query(`select location_id from class_sessions where id = $1`, [sessionId]);
    if (!session.rowCount || String(session.rows[0].location_id) !== locationId) throw new CrmError(404, 'not_found', 'Not found.');
  }
  const source = sessionId ? 'staff' : 'open_mat';
  try {
    const saved = await pool.query(
      `insert into attendance (session_id, member_id, location_id, attended_on, status, source, program_code)
       values ($1, $2, $3, $4::date, 'present', $5, $6)
       returning id, session_id, source`,
      [sessionId, memberId, locationId, attendedOn, source, programCode],
    );
    await noteFirstCheckin(pool, memberId, attendedOn);
    if (programCode && sessionId) {
      await pool.query(
        `insert into class_session_programs (session_id, program_code) values ($1, $2) on conflict do nothing`,
        [sessionId, programCode],
      );
    }
    return {
      status: 201,
      body: { id: saved.rows[0].id, sessionId: saved.rows[0].session_id, source: saved.rows[0].source, attendedOn },
    };
  } catch (err) {
    rethrowDb(err);
  }
}

export async function saveBookingOption(db: Sql, actor: Actor | null, body: Record<string, unknown>) {
  const staff = requireStaff(actor);
  const sessionId = body.sessionId ? assertUuid(String(body.sessionId)) : null;
  const templateId = body.templateId ? assertUuid(String(body.templateId)) : null;
  if (!sessionId && !templateId) throw new CrmError(400, 'bad_option', 'Send a sessionId or a templateId.');
  const kind = String(body.kind || '');
  if (!['member', 'trial', 'drop_in', 'paid'].includes(kind)) throw new CrmError(400, 'bad_kind', 'Unknown booking option.');
  let locationId = '';
  if (sessionId) {
    const session = await db.query(`select location_id from class_sessions where id = $1`, [sessionId]);
    if (!session.rowCount) throw new CrmError(404, 'not_found', 'Not found.');
    locationId = String(session.rows[0].location_id);
  } else if (templateId) {
    const template = await db.query(`select location_id from class_templates where id = $1`, [templateId]);
    if (!template.rowCount) throw new CrmError(404, 'not_found', 'Not found.');
    locationId = String(template.rows[0].location_id);
  }
  requireSchool(staff, locationId);
  const price = body.priceCents == null ? null : Number(body.priceCents);
  if (price != null && (!Number.isInteger(price) || price < 0)) throw new CrmError(400, 'bad_price', 'priceCents must be a non-negative integer.');
  const capacity = body.capacity == null ? null : Number(body.capacity);
  if (capacity != null && (!Number.isInteger(capacity) || capacity < 1)) throw new CrmError(400, 'bad_capacity', 'Capacity must be a positive integer.');
  const planIds = Array.isArray(body.planIds) ? body.planIds.map(id => assertUuid(String(id))) : [];
  const row = await db.query(
    `insert into session_booking_options (session_id, template_id, kind, price_cents, plan_ids, capacity, active)
     values ($1, $2, $3, $4, $5::uuid[], $6, $7)
     returning id, kind, active`,
    [sessionId, templateId, kind, price, planIds, capacity, body.active !== false],
  );
  return { status: 201, body: { id: row.rows[0].id, kind: row.rows[0].kind, active: row.rows[0].active === true, charged: false } };
}

export async function releaseNoShows(pool: SqlPool, actor: Actor | null, asOf: Date) {
  const staff = requireStaff(actor);
  if (staff.role !== 'admin' && staff.role !== 'staff') throw new CrmError(403, 'forbidden', 'Staff only.');
  return withTx(pool, async client => {
    const due = await client.query(
      `select b.id, b.session_id, b.member_id, b.lead_id, s.location_id, s.starts_at, l.no_show_grace_min
       from bookings b
       join class_sessions s on s.id = b.session_id
       join locations l on l.id = s.location_id
       where b.status = 'booked'
         and l.no_show_grace_min is not null
         and s.starts_at + (l.no_show_grace_min * interval '1 minute') <= $1::timestamptz
         and not exists (
           select 1 from attendance a
           where a.session_id = b.session_id
             and a.status = 'present'
             and (
               (b.member_id is not null and a.member_id = b.member_id)
               or (b.lead_id is not null and a.lead_id = b.lead_id)
             )
         )
       order by s.starts_at, b.created_at`,
      [asOf.toISOString()],
    );
    const released = [];
    const promoted = [];
    for (const row of due.rows) {
      if (staff.role !== 'admin' && !staff.locationIds.includes(String(row.location_id))) continue;
      if (!noShowDue(new Date(row.starts_at), Number(row.no_show_grace_min), asOf)) continue;
      await client.query(`update bookings set status = 'released' where id = $1 and status = 'booked'`, [row.id]);
      const seat = await promoteEarliestWaitlist(client, String(row.session_id));
      if (seat?.memberId) {
        await consumeSessionCredit(client, seat.memberId, chicagoToday(new Date(row.starts_at)));
      }
      await client.query(
        `insert into audit_log (actor_email, action, entity_type, entity_id, location_id)
         values ($1, 'booking_released', 'booking', $2, $3)`,
        [staff.email, row.id, row.location_id],
      );
      await client.query(
        `insert into dry_run_events (name, location_id, entity_type, entity_id, payload, dry_run)
         values ('booking_no_show', $1, 'booking', $2, $3::jsonb, true)`,
        [row.location_id, row.id, JSON.stringify({ promotedBookingId: seat?.id || null, sent: false })],
      );
      const family = row.member_id
        ? await client.query(`select family_id from members where id = $1`, [row.member_id])
        : { rows: [] as Array<{ family_id?: string }> };
      try {
        await fireDryRun(client, {
          trigger: 'booking_no_show',
          locationId: String(row.location_id),
          memberId: row.member_id,
          leadId: row.lead_id,
          familyId: family.rows[0]?.family_id || null,
          context: { full_name: 'Member' },
        });
      } catch (err) {
        if (!(err instanceof CrmError)) throw err;
      }
      released.push(String(row.id));
      if (seat) promoted.push(seat.id);
    }
    return {
      status: 200,
      body: { released: released.length, promoted, dryRun: true, sent: false, asOf: asOf.toISOString() },
    };
  });
}
