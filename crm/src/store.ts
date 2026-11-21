import type pg from 'pg';
import { matchCimProfiles, locationIdFromName, type CimProfile, type LeadRow, type MemberRow } from './gymdesk.ts';
import { completionsFromFirebase, type FirebaseTaskExport, type TaskDef } from './tasks.ts';
import { punchesFromFirebase, shiftsFromFirebase, timeOffFromFirebase, type ScheduleExport } from './schedule.ts';
import type { PromoCode } from './pricing.ts';

export async function importMembers(pool: pg.Pool, members: MemberRow[], profiles: CimProfile[], leads: LeadRow[]) {
  const active = members.filter(m => m.status === 'active');
  const located = active.map(m => ({ ...m, locationId: locationIdFromName(m.locationName) }))
    .filter(m => m.locationId);
  const report = matchCimProfiles(located.map(m => ({ memberId: m.memberId, locationId: m.locationId })), profiles);
  const client = await pool.connect();
  try {
    await client.query('begin');
    const familyByEmail = new Map<string, string>();
    for (const m of located) {
      let familyId = familyByEmail.get(m.email);
      if (!familyId) {
        const existing = await client.query('select id from guardians where email = $1', [m.email]);
        if (existing.rowCount) {
          const link = await client.query(
            `select family_id from guardian_families where guardian_id = $1 and role = 'payer' limit 1`,
            [existing.rows[0].id]);
          familyId = link.rows[0]?.family_id;
        }
        if (!familyId) {
          const fam = await client.query('insert into families (display_name) values ($1) returning id', [m.lastName]);
          familyId = fam.rows[0].id;
          const g = await client.query(
            `insert into guardians (email, first_name, last_name) values ($1, $2, $3)
             on conflict (email) do update set first_name = excluded.first_name returning id`,
            [m.email, m.firstName, m.lastName]);
          await client.query(
            `insert into guardian_families (family_id, guardian_id, role) values ($1, $2, 'payer')
             on conflict do nothing`,
            [familyId, g.rows[0].id]);
        }
        familyByEmail.set(m.email, familyId!);
      }
      const member = await client.query(
        `insert into members (family_id, location_id, first_name, last_name, status, firebase_student_key)
         values ($1, $2, $3, $4, 'active', $5)
         on conflict (firebase_student_key) do update set first_name = excluded.first_name
         returning id`,
        [familyId, m.locationId, m.firstName, m.lastName, 'gymdesk_' + m.memberId]);
      const memberUuid = member.rows[0].id;
      await client.query(
        `insert into external_ids (entity_type, entity_id, system, value)
         values ('member', $1, 'gymdesk', $2)
         on conflict (system, entity_type, value) do nothing`,
        [memberUuid, m.memberId]);
      let plan = await client.query(
        `select id from plans where location_id = $1 and name = $2 limit 1`,
        [m.locationId, m.plan]);
      if (!plan.rowCount) {
        const interval = /mini/i.test(m.plan) ? 'monthly' : 'every_4_weeks';
        plan = await client.query(
          `insert into plans (location_id, name, program, amount_cents, interval)
           values ($1, $2, $3, $4, $5) returning id`,
          [m.locationId, m.plan, /mini/i.test(m.plan) ? 'mini_tigers' : 'taekwondo', m.amountCents, interval]);
      }
      const existingMs = await client.query(
        `select id from memberships where location_id = $1 and gymdesk_member_id = $2`,
        [m.locationId, m.memberId]);
      let membershipId = existingMs.rows[0]?.id;
      if (!membershipId) {
        const ms = await client.query(
          `insert into memberships (family_id, location_id, plan_id, status, biller, started_on, anchor_on, gymdesk_member_id)
           values ($1, $2, $3, 'active', 'gymdesk', $4, $4, $5) returning id`,
          [familyId, m.locationId, plan.rows[0].id, m.joined || '2026-01-01', m.memberId]);
        membershipId = ms.rows[0].id;
      }
      await client.query(
        `insert into membership_members (membership_id, member_id) values ($1, $2) on conflict do nothing`,
        [membershipId, memberUuid]);
      const hit = report.matched.find(x => x.memberId === m.memberId && x.paymentProfileId);
      if (hit) {
        let merchant = await client.query('select id from merchant_accounts where location_id = $1', [m.locationId]);
        if (!merchant.rowCount) {
          merchant = await client.query(
            `insert into merchant_accounts (location_id, label, environment, live_billing_enabled)
             values ($1, $2, 'sandbox', false) returning id`,
            [m.locationId, m.locationId + ' sandbox']);
        }
        await client.query(
          `insert into payment_profiles
             (location_id, family_id, customer_profile_id, payment_profile_id, brand, last4, is_default, environment)
           values ($1, $2, $3, $4, $5, $6, true, 'sandbox')
           on conflict (location_id, customer_profile_id, payment_profile_id) do nothing`,
          [m.locationId, familyId, hit.customerProfileId, hit.paymentProfileId, hit.brand, hit.last4]);
      }
    }
    for (const lead of leads) {
      await client.query(
        `insert into leads (location_id, guardian_name, phone, email, child_name, child_age, source)
         select $1, $2, $3, $4, $5, $6, $7
         where not exists (
           select 1 from leads where email = $4 and child_name = $5 and location_id = $1
         )`,
        [lead.locationId, lead.guardianName, lead.phone, lead.email, lead.childName, lead.childAge, lead.source]);
    }
    const summary = {
      members: located.length,
      matched: report.matched.filter(m => m.hasPaymentMethod).length,
      memberWithoutProfile: report.memberWithoutProfile,
      profileWithoutMember: report.profileWithoutMember,
      profileWithoutPaymentMethod: report.profileWithoutPaymentMethod,
      leads: leads.length,
    };
    await client.query(
      `insert into import_runs (source, status, summary, finished_at) values ('gymdesk-fixture', 'ok', $1, now())`,
      [JSON.stringify(summary)]);
    await client.query('commit');
    return summary;
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }
}

export async function listMembers(pool: pg.Pool, locationId?: string) {
  const params: string[] = [];
  let where = '';
  if (locationId) { params.push(locationId); where = 'where m.location_id = $1'; }
  const res = await pool.query(
    `select m.id, m.family_id, m.location_id, m.first_name, m.last_name, m.status,
            ms.gymdesk_member_id, ms.biller, ms.status as membership_status,
            p.name as plan_name
     from members m
     left join membership_members mm on mm.member_id = m.id
     left join memberships ms on ms.id = mm.membership_id
     left join plans p on p.id = ms.plan_id
     ${where}
     order by m.last_name, m.first_name`,
    params);
  return res.rows;
}

export async function getMember(pool: pg.Pool, id: string) {
  const res = await pool.query(
    `select m.id, m.family_id, m.location_id, m.first_name, m.last_name, m.status,
            ms.id as membership_id, ms.gymdesk_member_id, ms.biller, ms.status as membership_status,
            ms.next_bill_on, ms.paid_through_on, p.name as plan_name, p.amount_cents, p.interval
     from members m
     left join membership_members mm on mm.member_id = m.id
     left join memberships ms on ms.id = mm.membership_id
     left join plans p on p.id = ms.plan_id
     where m.id = $1`,
    [id]);
  return res.rows[0] || null;
}

export async function getFamily(pool: pg.Pool, id: string) {
  const fam = await pool.query('select id, display_name from families where id = $1', [id]);
  if (!fam.rowCount) return null;
  const guardians = await pool.query(
    `select g.id, g.email, g.first_name, g.last_name, gf.role
     from guardian_families gf join guardians g on g.id = gf.guardian_id
     where gf.family_id = $1`, [id]);
  const members = await pool.query(
    `select id, location_id, first_name, last_name, status from members where family_id = $1 order by first_name`,
    [id]);
  return { ...fam.rows[0], guardians: guardians.rows, members: members.rows };
}

export async function latestImport(pool: pg.Pool) {
  const res = await pool.query(
    `select id, source, status, summary, started_at from import_runs order by started_at desc limit 1`);
  return res.rows[0] || null;
}

export async function upsertTaskDefs(pool: pg.Pool, defs: TaskDef[]) {
  for (const d of defs) {
    await pool.query(
      `insert into task_definitions (id, cadence, title, seat_id, location_id, days, proof_kind, links_member)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       on conflict (id) do update set title = excluded.title, days = excluded.days`,
      [d.id, d.cadence, d.title, d.seatId || null, d.locationId || null, d.days || null, d.proofKind || null, !!d.linksMember]);
  }
}

export async function importTasks(pool: pg.Pool, exp: FirebaseTaskExport) {
  const rows = completionsFromFirebase(exp);
  for (const row of rows) {
    await upsertTaskDefs(pool, [{
      id: row.taskId, cadence: row.cadence, title: row.taskId, seatId: exp.empId, locationId: row.locationId,
    }]);
    await pool.query(
      `insert into task_completions
         (task_id, clock_staff_id, location_id, period_key, cadence, member_id, status, proof, firebase_path, completed_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       on conflict (task_id, clock_staff_id, period_key) do update
         set proof = excluded.proof, status = excluded.status`,
      [row.taskId, row.clockStaffId, row.locationId, row.periodKey, row.cadence, row.memberId,
        row.status, JSON.stringify(row.proof), row.firebasePath, row.completedAt]);
  }
  return rows.length;
}

export async function listTasks(pool: pg.Pool, clockStaffId?: string) {
  const params: string[] = [];
  let where = '';
  if (clockStaffId) { params.push(clockStaffId); where = 'where clock_staff_id = $1'; }
  const res = await pool.query(
    `select task_id, clock_staff_id, location_id, period_key, cadence, member_id, status, firebase_path
     from task_completions ${where} order by period_key, task_id`, params);
  return res.rows;
}

export async function importSchedule(pool: pg.Pool, exp: ScheduleExport) {
  const shifts = shiftsFromFirebase(exp);
  for (const sh of shifts) {
    await pool.query(
      `insert into staff_shifts
         (clock_staff_id, location_id, shift_date, start_local, end_local, role, firebase_shift_id)
       values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (clock_staff_id, shift_date, firebase_shift_id) do update
         set start_local = excluded.start_local, end_local = excluded.end_local, location_id = excluded.location_id`,
      [sh.clockStaffId, sh.locationId, sh.shiftDate, sh.startLocal, sh.endLocal, sh.role, sh.firebaseShiftId]);
  }
  for (const t of timeOffFromFirebase(exp)) {
    await pool.query(
      `insert into staff_time_off (clock_staff_id, start_on, end_on, kind, status, note, firebase_id)
       values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (firebase_id) do update set status = excluded.status`,
      [t.clockStaffId, t.startOn, t.endOn, t.kind, t.status, t.note, t.firebaseId]);
  }
  for (const p of punchesFromFirebase(exp)) {
    await pool.query(
      `insert into time_punches
         (clock_staff_id, location_id, punch_date, in_at, out_at, source, firebase_entry_id)
       values ($1, $2, $3, $4, $5, 'import', $6)
       on conflict (clock_staff_id, punch_date, firebase_entry_id) do update
         set in_at = excluded.in_at, out_at = excluded.out_at`,
      [p.clockStaffId, p.locationId, p.punchDate, p.inAt, p.outAt, p.firebaseEntryId]);
  }
  for (const [week, rec] of Object.entries(exp.published || {})) {
    await pool.query(
      `insert into schedule_publications (week_key, published_at, label)
       values ($1, $2, $3)
       on conflict (week_key) do update set published_at = excluded.published_at`,
      [week, new Date(rec.publishedAt).toISOString(), rec.label || null]);
  }
  return { shifts: shifts.length, scheduledMinutes: shifts.reduce((s, sh) => s + sh.minutes, 0) };
}

export async function listShifts(pool: pg.Pool, clockStaffId?: string) {
  const params: string[] = [];
  let where = '';
  if (clockStaffId) { params.push(clockStaffId); where = 'where clock_staff_id = $1'; }
  const res = await pool.query(
    `select clock_staff_id, location_id, shift_date, start_local, end_local, role, class_session_id
     from staff_shifts ${where} order by shift_date`, params);
  return res.rows;
}

export async function savePromo(pool: pg.Pool, code: PromoCode) {
  const res = await pool.query(
    `insert into promo_codes
       (code, discount_type, percent_off, amount_off_cents, starts_on, ends_on,
        max_redemptions, max_per_family, max_per_member, audience, stacks, active)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     on conflict (code) do update set
       discount_type = excluded.discount_type,
       percent_off = excluded.percent_off,
       amount_off_cents = excluded.amount_off_cents,
       starts_on = excluded.starts_on,
       ends_on = excluded.ends_on,
       max_redemptions = excluded.max_redemptions,
       max_per_family = excluded.max_per_family,
       max_per_member = excluded.max_per_member,
       audience = excluded.audience,
       stacks = excluded.stacks,
       active = excluded.active
     returning id`,
    [code.code.toUpperCase(), code.discountType, code.percentOff ?? null, code.amountOffCents ?? null,
      code.startsOn ?? null, code.endsOn ?? null, code.maxRedemptions ?? null, code.maxPerFamily ?? null,
      code.maxPerMember ?? null, code.audience, code.stacks, code.active]);
  const id = res.rows[0].id;
  await pool.query('delete from promo_code_scopes where promo_code_id = $1', [id]);
  for (const s of code.scopes) {
    await pool.query(
      `insert into promo_code_scopes
         (promo_code_id, scope_type, brand, location_id, event_type, event_id, session_id)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [id, s.scopeType, s.brand || null, s.locationId || null, s.eventType || null, s.eventId || null, s.sessionId || null]);
  }
  return id;
}

function isoDay(v: unknown) {
  if (!v) return null;
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
  }
  return String(v).slice(0, 10);
}

export async function loadCatalog(pool: pg.Pool): Promise<PromoCode[]> {
  const codes = await pool.query('select * from promo_codes where active = true');
  const scopes = await pool.query('select * from promo_code_scopes');
  return codes.rows.map(row => ({
    code: row.code,
    discountType: row.discount_type,
    percentOff: row.percent_off == null ? null : Number(row.percent_off),
    amountOffCents: row.amount_off_cents,
    startsOn: isoDay(row.starts_on),
    endsOn: isoDay(row.ends_on),
    maxRedemptions: row.max_redemptions,
    maxPerFamily: row.max_per_family,
    maxPerMember: row.max_per_member,
    audience: row.audience,
    stacks: row.stacks,
    active: row.active,
    scopes: scopes.rows.filter(s => s.promo_code_id === row.id).map(s => ({
      scopeType: s.scope_type,
      brand: s.brand,
      locationId: s.location_id,
      eventType: s.event_type,
      eventId: s.event_id,
      sessionId: s.session_id,
    })),
  }));
}

export async function loadRedemptions(pool: pg.Pool) {
  const res = await pool.query(
    `select c.code, r.family_id, r.member_id
     from promo_redemptions r join promo_codes c on c.id = r.promo_code_id`);
  return res.rows.map(r => ({ code: r.code as string, familyId: r.family_id as string | null, memberId: r.member_id as string | null }));
}

export async function recordRedemptions(pool: pg.Pool, rows: {
  code: string; familyId?: string | null; memberId?: string | null; bookingId?: string | null;
  chargeId?: string | null; discountCents: number;
}[]) {
  for (const row of rows) {
    const code = await pool.query('select id from promo_codes where code = $1', [row.code.toUpperCase()]);
    if (!code.rowCount) continue;
    await pool.query(
      `insert into promo_redemptions (promo_code_id, booking_id, charge_id, family_id, member_id, discount_cents)
       values ($1, $2, $3, $4, $5, $6)`,
      [code.rows[0].id, row.bookingId || null, row.chargeId || null, row.familyId || null, row.memberId || null, row.discountCents]);
  }
}
