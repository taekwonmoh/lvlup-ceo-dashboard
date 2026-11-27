import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { createServer } from 'node:http';
import { signToken } from '../src/auth.ts';
import { migrate } from '../src/migrate.ts';
import { createApp } from '../src/server.ts';
import { bootstrapDatabase, grantCrmApp } from './bootstrap.ts';

const URL = 'postgres://crm:crm@127.0.0.1:5432/crm_wave_two_test';
const SECRET = 'dev-only-secret';
process.env.CRM_TOKEN_SECRET = SECRET;
process.env.AUTHORIZENET_MODE = 'sandbox';
process.env.BILLING_CHARGES_ENABLED = '0';
process.env.AUTOMATION_DELIVERY_ENABLED = '0';
process.env.PUSH_DELIVERY_ENABLED = '0';
process.env.WEBHOOK_DELIVERY_ENABLED = '0';
process.env.QBO_ENABLED = '0';

const root = dirname(fileURLToPath(import.meta.url));
let pool: pg.Pool;
let base = '';
let close: () => Promise<void>;

function token(role: 'admin' | 'staff' | 'guardian', extra: Record<string, unknown> = {}) {
  return signToken({
    role,
    email: role + '@example.test',
    locationIds: ['waunakee', 'verona'],
    familyIds: [],
    memberId: null,
    canFinance: role === 'admin',
    ...extra,
  }, SECRET);
}

async function api(method: string, path: string, tok?: string, body?: unknown) {
  const res = await fetch(base + path, {
    method,
    headers: {
      ...(tok ? { authorization: 'Bearer ' + tok } : {}),
      'content-type': 'application/json',
    },
    body: body == null ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = {};
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  return { status: res.status, json, text, type: res.headers.get('content-type') || '' };
}

async function seedMember(name: string, location = 'waunakee') {
  const family = await pool.query(`insert into families (display_name) values ($1) returning id`, [name + ' home']);
  const member = await pool.query(
    `insert into members (family_id, location_id, first_name, last_name, status)
     values ($1, $2, $3, 'Sample', 'active') returning id`,
    [family.rows[0].id, location, name],
  );
  const plan = await pool.query(
    `insert into plans (location_id, name, program, amount_cents, interval)
     values ($1, '4-week', 'taekwondo', 6000, 'every_4_weeks') returning id`,
    [location],
  );
  const membership = await pool.query(
    `insert into memberships (family_id, location_id, plan_id, status, biller, started_on, anchor_on)
     values ($1, $2, $3, 'active', 'gymdesk', '2026-11-27', '2026-11-27') returning id`,
    [family.rows[0].id, location, plan.rows[0].id],
  );
  await pool.query(
    `insert into membership_members (membership_id, member_id) values ($1, $2)`,
    [membership.rows[0].id, member.rows[0].id],
  );
  return {
    familyId: family.rows[0].id as string,
    memberId: member.rows[0].id as string,
    planId: plan.rows[0].id as string,
    membershipId: membership.rows[0].id as string,
  };
}

async function sessionAt(location: string, starts: string, capacity = 2) {
  const startsAt = new Date(starts);
  const endsAt = new Date(startsAt.getTime() + 45 * 60 * 1000);
  const row = await pool.query(
    `insert into class_sessions (location_id, title, starts_at, ends_at, capacity, waitlist_capacity, status, program)
     values ($1, 'Sample class', $2, $3, $4, 2, 'scheduled', 'taekwondo') returning id`,
    [location, startsAt.toISOString(), endsAt.toISOString(), capacity],
  );
  await pool.query(
    `insert into class_session_programs (session_id, program_code) values ($1, 'taekwondo'), ($1, 'leadership')`,
    [row.rows[0].id],
  );
  return row.rows[0].id as string;
}

before(async () => {
  bootstrapDatabase('crm_wave_two_test');
  pool = new pg.Pool({ connectionString: URL });
  await migrate(pool);
  grantCrmApp();
  const app = createApp(pool);
  const server = createServer((req, res) => { void app.handle(req, res); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', () => resolve()));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  base = 'http://127.0.0.1:' + port;
  close = () => new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
});

after(async () => {
  if (close) await close();
  if (pool) await pool.end();
});

test('schedule, booking, open mat, kiosk, and no-show release', async () => {
  const admin = token('admin');
  const home = await seedMember('Riley');
  const lead = await pool.query(
    `insert into leads (location_id, guardian_name, source, pipeline_status)
     values ('waunakee', 'Jordan Sample', 'fixture', 'new') returning id`,
  );
  const starts = new Date(Date.now() + 20 * 60 * 1000).toISOString();
  const sessionId = await sessionAt('waunakee', starts, 2);
  const option = await api('POST', '/v1/booking-options', admin, {
    sessionId, kind: 'trial', priceCents: 0, capacity: 2,
  });
  assert.equal(option.status, 201, JSON.stringify(option.json));
  assert.equal(option.json.charged, false);

  const booked = await api('POST', '/v1/bookings', admin, { sessionId, memberIds: [home.memberId], leadIds: [lead.rows[0].id] });
  assert.equal(booked.status, 201, JSON.stringify(booked.json));
  assert.equal(booked.json.sent, false);
  const pipeline = await pool.query(`select pipeline_status from leads where id = $1`, [lead.rows[0].id]);
  assert.equal(pipeline.rows[0].pipeline_status, 'trial_booked');

  const listed = await api('GET', '/v1/bookings?sessionId=' + sessionId + '&program=leadership&status=booked', admin);
  assert.equal(listed.status, 200, JSON.stringify(listed.json));
  assert.equal(listed.json.bookings.length, 2);

  const duplicate = await api('POST', '/v1/sessions/' + sessionId + '/duplicate', admin, { startsAt: '2026-12-01T20:00:00Z' });
  assert.equal(duplicate.status, 201, JSON.stringify(duplicate.json));
  assert.deepEqual(duplicate.json.programs.sort(), ['leadership', 'taekwondo']);
  assert.equal(duplicate.json.bookingOptions, 1);
  assert.equal(duplicate.json.bookings, 0);

  const day = await api('GET', '/v1/schedule?view=day&date=2026-12-01&locationId=waunakee&program=leadership', admin);
  assert.equal(day.status, 200, JSON.stringify(day.json));
  assert.equal(day.json.from, '2026-12-01');
  assert.ok(day.json.sessions.some((row: { id: string; programs: string[]; capacity: number }) => row.id === duplicate.json.id && row.programs.includes('leadership') && row.capacity === 2));

  await pool.query(
    `insert into staff_users (email, name, dash_role) values ('admin@example.test', 'Alex Sample', 'admin')`,
  );
  const prefs = await api('PATCH', '/v1/me/prefs', admin, { default_schedule_location: 'waunakee', default_view: 'week' });
  assert.equal(prefs.status, 200, JSON.stringify(prefs.json));
  assert.equal(prefs.json.default_view, 'week');
  const read = await api('GET', '/v1/me/prefs', admin);
  assert.equal(read.json.default_schedule_location, 'waunakee');

  const open = await api('POST', '/v1/attendance', admin, {
    memberId: home.memberId, locationId: 'waunakee', attendedOn: '2026-11-27', programCode: 'taekwondo',
  });
  assert.equal(open.status, 201, JSON.stringify(open.json));
  assert.equal(open.json.sessionId, null);
  assert.equal(open.json.source, 'open_mat');
  const checkIn = await pool.query(`select session_id, source from check_ins where id = $1`, [open.json.id]);
  assert.equal(checkIn.rows[0].session_id, null);
  assert.equal(checkIn.rows[0].source, 'open_mat');

  const other = await seedMember('Avery');
  const kioskSession = await sessionAt('waunakee', new Date(Date.now() + 10 * 60 * 1000).toISOString(), 4);
  await pool.query(
    `insert into bookings (session_id, kind, member_id, status) values ($1, 'member', $2, 'booked')`,
    [kioskSession, other.memberId],
  );
  const kiosk = await api('POST', '/v1/kiosk-sessions', admin, {
    locationId: 'waunakee',
    sessionId: kioskSession,
    deviceLabel: 'Front desk',
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  });
  assert.equal(kiosk.status, 201, JSON.stringify(kiosk.json));
  const family = token('guardian', { familyIds: [other.familyId], platformRole: 'family' });
  const checked = await api('POST', '/v1/check-ins/family', family, {
    familyId: other.familyId, locationId: 'waunakee', source: 'kiosk',
  });
  assert.equal(checked.status, 200, JSON.stringify(checked.json));
  assert.equal(checked.json.sessionId, kioskSession);
  assert.equal(checked.json.checkedIn.length, 1);

  const stranger = await seedMember('Blake');
  const missed = await api('POST', '/v1/check-ins/family', token('guardian', { familyIds: [stranger.familyId], platformRole: 'family' }), {
    familyId: stranger.familyId, locationId: 'waunakee', source: 'kiosk',
  });
  assert.equal(missed.status, 200, JSON.stringify(missed.json));
  assert.equal(missed.json.alert, true);
  assert.equal(missed.json.failed[0].reason, 'not_booked');

  const past = await sessionAt('waunakee', new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), 1);
  const waiting = await seedMember('Casey');
  const held = await pool.query(
    `insert into bookings (session_id, kind, member_id, status) values ($1, 'member', $2, 'booked') returning id`,
    [past, home.memberId],
  );
  const wait = await pool.query(
    `insert into bookings (session_id, kind, member_id, status, created_at)
     values ($1, 'member', $2, 'waitlist', now() + interval '1 second') returning id`,
    [past, waiting.memberId],
  );
  await pool.query(`update locations set no_show_grace_min = null where id = 'waunakee'`);
  const off = await api('POST', '/v1/jobs/release-no-shows', admin, { asOf: new Date().toISOString() });
  assert.equal(off.json.released, 0);
  await pool.query(`update locations set no_show_grace_min = 15 where id = 'waunakee'`);
  const released = await api('POST', '/v1/jobs/release-no-shows', admin, { asOf: new Date().toISOString() });
  assert.equal(released.status, 200, JSON.stringify(released.json));
  assert.equal(released.json.dryRun, true);
  assert.equal(released.json.sent, false);
  assert.ok(released.json.released >= 1);
  const after = await pool.query(`select status from bookings where id = $1`, [held.rows[0].id]);
  const promoted = await pool.query(`select status from bookings where id = $1`, [wait.rows[0].id]);
  assert.equal(after.rows[0].status, 'released');
  assert.equal(promoted.rows[0].status, 'booked');
  const audit = await pool.query(`select count(*)::int as n from audit_log where action = 'booking_released' and entity_id = $1`, [held.rows[0].id]);
  const event = await pool.query(`select dry_run, name from dry_run_events where entity_id = $1`, [held.rows[0].id]);
  assert.equal(audit.rows[0].n, 1);
  assert.equal(event.rows[0].name, 'booking_no_show');
  assert.equal(event.rows[0].dry_run, true);
});

test('billing preview, sold-by, credits, fees, and categories stay dry-run', async () => {
  const admin = token('admin');
  const desk = token('staff', { canFinance: false, email: 'desk@example.test' });
  const home = await seedMember('Drew');
  await pool.query(`update memberships set billing_starts_on_first_checkin = true where id = $1`, [home.membershipId]);
  const waiting = await api('GET', '/v1/memberships/' + home.membershipId + '/upcoming?asOf=2026-11-27', admin);
  assert.equal(waiting.status, 200, JSON.stringify(waiting.json));
  assert.equal(waiting.json.waiting, true);
  assert.equal(waiting.json.charged, false);
  assert.equal(waiting.json.payments.length, 0);
  await pool.query(
    `insert into attendance (member_id, location_id, attended_on, status, source)
     values ($1, 'waunakee', '2026-11-28', 'present', 'open_mat')`,
    [home.memberId],
  );
  await pool.query(
    `update memberships set first_checkin_at = '2026-11-28T18:00:00Z' where id = $1`,
    [home.membershipId],
  );
  const live = await api('GET', '/v1/memberships/' + home.membershipId + '/upcoming?asOf=2026-11-28&count=2', admin);
  assert.equal(live.json.waiting, false);
  assert.equal(live.json.anchor, '2026-11-28');
  assert.equal(live.json.payments[0].originalDueOn, '2026-11-28');

  const snapshot = { at: '2026-11-27T12:00:00Z', rows: [{ dueOn: '2026-11-28', amountCents: 6000 }] };
  const missing = await api('POST', '/v1/memberships/' + home.membershipId + '/upcoming/2026-11-28/override', admin, { skip: true });
  assert.equal(missing.status, 422);
  assert.equal(missing.json.error.code, 'snapshot_required');
  const override = await api('POST', '/v1/memberships/' + home.membershipId + '/upcoming/2026-11-28/override', admin, { snapshot, newAmountCents: 4500, reason: 'Preview only' });
  assert.equal(override.status, 201, JSON.stringify(override.json));
  assert.equal(override.json.charged, false);
  const undone = await api('POST', '/v1/payment-overrides/' + override.json.id + '/undo', admin);
  assert.equal(undone.json.undone, true);

  const profile = await pool.query(
    `insert into payment_profiles (location_id, family_id, customer_profile_id, payment_profile_id, last4, exp_month, exp_year)
     values ('waunakee', $1, 'cust-sample', 'pay-sample', '0000', 10, 2026) returning id`,
    [home.familyId],
  );
  const patched = await api('PATCH', '/v1/memberships/' + home.membershipId, admin, {
    snapshot, ends_on: '2027-02-01', payment_profile_id: profile.rows[0].id,
  });
  assert.equal(patched.status, 200, JSON.stringify(patched.json));
  assert.equal(patched.json.endsOn, '2027-02-01');
  assert.equal(patched.json.charged, false);

  const seller = await pool.query(
    `insert into staff_users (email, name, dash_role) values ('seller@example.test', 'Alex Sample', 'lead') returning id`,
  );
  const credits = await api('POST', '/v1/sale-credits', admin, {
    membershipId: home.membershipId,
    staff: [{ staffId: seller.rows[0].id }],
  });
  assert.equal(credits.status, 201, JSON.stringify(credits.json));
  assert.equal(credits.json.credits[0].shareBps, 10000);
  const sold = await api('GET', '/v1/members?soldBy=' + seller.rows[0].id, admin);
  assert.ok(sold.json.members.some((row: { id: string }) => row.id === home.memberId));
  const expired = await api('GET', '/v1/members?cardExpired=true&asOf=2026-11-27&locationId=waunakee', admin);
  assert.ok(expired.json.members.some((row: { id: string }) => row.id === home.memberId));
  const csv = await api('GET', '/v1/members.csv?soldBy=' + seller.rows[0].id, admin);
  assert.match(csv.type, /text\/csv/);
  assert.match(csv.text, /Drew/);
  assert.equal(csv.text.includes('tel:'), false);
  assert.equal(csv.text.toLowerCase().includes('gymdesk'), false);

  await pool.query(`update plans set sessions_per_period = 1, rollover_cap = 0 where id = $1`, [home.planId]);
  const creditSession = await sessionAt('waunakee', '2026-12-02T20:00:00Z', 4);
  const first = await api('POST', '/v1/bookings', admin, { sessionId: creditSession, memberIds: [home.memberId] });
  assert.equal(first.status, 201, JSON.stringify(first.json));
  const secondSession = await sessionAt('waunakee', '2026-12-03T20:00:00Z', 4);
  const second = await api('POST', '/v1/bookings', admin, { sessionId: secondSession, memberIds: [home.memberId] });
  assert.equal(second.status, 409);
  assert.equal(second.json.error.code, 'session_credits');

  const away = await sessionAt('verona', '2026-12-04T20:00:00Z', 4);
  const blocked = await api('POST', '/v1/bookings', admin, { sessionId: away, memberIds: [home.memberId] });
  assert.equal(blocked.status, 403);
  assert.equal(blocked.json.error.code, 'no_location_access');
  const access = await api('PUT', '/v1/memberships/' + home.membershipId + '/location-access', admin, { locationIds: ['verona'] });
  assert.deepEqual(access.json.locationIds, ['verona']);
  const stillShort = await api('POST', '/v1/bookings', admin, { sessionId: away, memberIds: [home.memberId] });
  assert.equal(stillShort.status, 409);
  assert.equal(stillShort.json.error.code, 'session_credits');

  await pool.query(`update plans set sessions_per_period = null where id = $1`, [home.planId]);
  const allowedAfter = await api('POST', '/v1/bookings', admin, { sessionId: away, memberIds: [home.memberId] });
  assert.equal(allowedAfter.status, 201, JSON.stringify(allowedAfter.json));

  await pool.query(
    `insert into merchant_accounts (location_id, label, card_fee_bps, card_fee_fixed_cents, ach_fee_cents, pass_through)
     values ('waunakee', 'Waunakee sandbox', 250, 30, 0, false)`,
  );
  const quiet = await api('POST', '/v1/quotes', admin, {
    listPriceCents: 10000, on: '2026-11-27', locationId: 'waunakee', brand: 'lvlup', buyer: 'member', codes: [],
  });
  assert.equal(quiet.json.processingFeeCents, 0);
  assert.equal(quiet.json.dueCents, 10000);
  await pool.query(`update merchant_accounts set pass_through = true where location_id = 'waunakee'`);
  const fee = await api('POST', '/v1/quotes', admin, {
    listPriceCents: 10000, on: '2026-11-27', locationId: 'waunakee', brand: 'lvlup', buyer: 'member', codes: [],
  });
  assert.equal(fee.json.processingFeeCents, 280);
  assert.equal(fee.json.dueCents, 10280);
  const preview = await api('POST', '/v1/charges/preview', admin, {
    customerProfileId: 'cust-sample', paymentProfileId: 'pay-sample', amountCents: 10000, invoiceNumber: 'draft', locationId: 'waunakee',
  });
  assert.equal(preview.json.submitted, false);
  assert.equal(preview.json.processingFeeCents, 280);
  await pool.query(`update merchant_accounts set pass_through = false where location_id = 'waunakee'`);

  const category = await pool.query(`select id from income_categories where name = 'Tuition'`);
  await pool.query(`update plans set income_category_id = $2 where id = $1`, [home.planId, category.rows[0].id]);
  const invoice = await pool.query(
    `insert into invoices (membership_id, location_id, family_id, status, total_cents)
     values ($1, 'waunakee', $2, 'draft', 6000) returning id`,
    [home.membershipId, home.familyId],
  );
  await pool.query(
    `insert into invoice_lines (invoice_id, kind, description, amount_cents, income_category_id)
     values ($1, 'tuition', 'Tuition preview', 6000, $2)`,
    [invoice.rows[0].id, category.rows[0].id],
  );
  const report = await api('GET', '/v1/reports/income.csv?locationId=waunakee', admin);
  assert.match(report.type, /text\/csv/);
  assert.match(report.text, /Tuition/);
  assert.match(report.text, /60\.00/);
  const grouped = await api('POST', '/v1/qbo/category-preview', admin, {
    companyId: 'moh',
    on: '2026-11-27',
    lines: [
      { category: 'Tuition', accountCode: 'TUITION', amountCents: 6000 },
      { category: 'Tuition', accountCode: 'TUITION', amountCents: 1000 },
    ],
  });
  assert.equal(grouped.status, 200, JSON.stringify(grouped.json));
  assert.equal(grouped.json.submitted, false);
  assert.equal(grouped.json.groups[0].amountCents, 7000);
  assert.equal(grouped.json.journal.submitted, false);

  const bad = await api('POST', '/v1/templates', admin, {
    locationId: 'waunakee', code: 'hello_note', channel: 'email', subject: 'Hello', body: 'Hi {{rank}}',
  });
  assert.equal(bad.status, 400);
  assert.equal(bad.json.error.code, 'bad_merge_tag');
  const saved = await api('POST', '/v1/templates', admin, {
    locationId: 'waunakee', code: 'hello_note', channel: 'email', subject: 'Hello', body: 'Hi {{first_name}}',
  });
  assert.equal(saved.status, 201, JSON.stringify(saved.json));
  assert.equal(saved.json.sent, false);
  const sentRows = await pool.query(`select count(*)::int as n from communication_log where template_code = 'hello_note'`);
  assert.equal(sentRows.rows[0].n, 0);

  const denied = await api('PUT', '/v1/settings/system-emails', desk, {
    locationId: 'waunakee', settings: [{ code: 'class_reminder', enabled: false }],
  });
  assert.equal(denied.status, 403);
  const toggled = await api('PUT', '/v1/settings/system-emails', admin, {
    locationId: 'waunakee', settings: [{ code: 'class_reminder', enabled: false }],
  });
  assert.equal(toggled.status, 200, JSON.stringify(toggled.json));
  assert.equal(toggled.json.emails.find((row: { code: string }) => row.code === 'class_reminder').enabled, false);

  const alert = await api('POST', '/v1/memberships/' + home.membershipId + '/staff-alert', admin, { source: 'staff' });
  assert.equal(alert.status, 201, JSON.stringify(alert.json));
  assert.equal(alert.json.status, 'not_sent');
  assert.equal(alert.json.sent, false);
  assert.match(alert.json.body, /0000/);
  assert.match(alert.json.body, /Alex Sample/);
  assert.equal(JSON.stringify(alert.json).includes('tel:'), false);
  const log = await pool.query(
    `select status, channel from communication_log where template_code = 'new_member_staff_alert' and family_id = $1`,
    [home.familyId],
  );
  assert.equal(log.rows[0].status, 'not_sent');

  const tables = [
    'class_session_programs', 'class_template_programs', 'session_booking_options', 'kiosk_sessions', 'dry_run_events',
    'scheduled_payment_overrides', 'sale_credits', 'session_credit_ledger', 'membership_location_access', 'income_categories',
    'message_templates', 'system_emails', 'location_system_email_settings',
  ];
  const rls = await pool.query(
    `select c.relname
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity = false
       and c.relname = any($1::text[])`,
    [tables],
  );
  assert.deepEqual(rls.rows, []);
  const policies = await pool.query(
    `select tablename, count(*)::int as n
     from pg_policies
     where schemaname = 'public' and tablename = any($1::text[]) and 'crm_app' = any (roles)
     group by tablename`,
    [tables],
  );
  assert.equal(policies.rowCount, tables.length);

  const wrangler = readFileSync(join(root, '../worker/wrangler.jsonc'), 'utf8');
  for (const flag of ['BILLING_CHARGES_ENABLED', 'QBO_ENABLED', 'AUTOMATION_DELIVERY_ENABLED', 'PUSH_DELIVERY_ENABLED', 'WEBHOOK_DELIVERY_ENABLED']) {
    assert.match(wrangler, new RegExp('"' + flag + '": "0"'));
  }
  assert.match(wrangler, /"AUTHORIZENET_MODE": "sandbox"/);
  assert.equal(wrangler.includes('api.lvlupma.com'), true);
  assert.equal(/"routes"\s*:/.test(wrangler), false);
});
