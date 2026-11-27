import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { createServer } from 'node:http';
import { signToken } from '../src/auth.ts';
import { migrate } from '../src/migrate.ts';
import { createApp } from '../src/server.ts';
import { bootstrapDatabase, grantCrmApp } from './bootstrap.ts';

const URL = 'postgres://crm:crm@127.0.0.1:5432/crm_platform_test';
const SECRET = 'dev-only-secret';
process.env.CRM_TOKEN_SECRET = SECRET;
process.env.AUTHORIZENET_MODE = 'sandbox';
process.env.BILLING_CHARGES_ENABLED = '0';

let pool: pg.Pool;
let base = '';
let close: () => Promise<void>;

function token(role: 'admin' | 'staff' | 'guardian', extra: Record<string, unknown> = {}) {
  return signToken({
    role,
    email: role + '@example.test',
    locationIds: ['waunakee'],
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
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

before(async () => {
  bootstrapDatabase('crm_platform_test');
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

test('import, shadow billing, journey, booking, geofence, party, and trial conversion', async () => {
  const admin = token('admin', { locationIds: ['waunakee', 'verona', 'eastmad', 'goninjaW'] });
  const imported = await api('POST', '/v1/imports/gymdesk-staging', admin);
  assert.equal(imported.status, 200, JSON.stringify(imported.json));
  assert.equal(imported.json.members, 6);
  assert.equal(imported.json.familiesCollapsed, 1);
  assert.equal(imported.json.childLinksKept, 6);
  assert.equal(imported.json.waivers, 1);

  const shadow = await api('POST', '/v1/billing/shadow', admin, { on: '2027-01-04', merchantLocationId: 'waunakee' });
  assert.equal(shadow.status, 200, JSON.stringify(shadow.json));
  assert.equal(shadow.json.submitted, false);
  assert.equal(shadow.json.matched.length, 2);
  assert.equal(shadow.json.doubleChargeRisk.length, 2);

  const desk = token('staff', { platformRole: 'front_desk', locationIds: ['waunakee'], canFinance: false });
  const hidden = await api('GET', '/v1/roster?locationId=verona', desk);
  assert.equal(hidden.status, 404);

  const roster = await api('GET', '/v1/roster?locationId=waunakee', admin);
  const casey = roster.json.members.find((m: { firstName: string }) => m.firstName === 'Casey');
  const journey = await api('GET', '/v1/members/' + casey.id + '/journey', admin);
  assert.equal(journey.json.next.name, 'Baeoh the Tiger');
  assert.equal(journey.json.current.name, 'Orange');
  const pathways = await api('GET', '/v1/pathways', admin);
  const owner = pathways.json.pathways.find((p: { code: string }) => p.code === 'school_owner');
  assert.equal(owner.needs_signoff, true);

  const familyId = casey.family_id || casey.familyId;
  const avery = roster.json.members.find((m: { firstName: string }) => m.firstName === 'Avery');
  const switcher = await api('GET', '/v1/families/' + (avery.family_id || avery.familyId) + '/switcher', admin);
  assert.equal(switcher.json.members.length, 2);

  await pool.query(
    `update locations set latitude = 43.010000, longitude = -89.010000, geofence_radius_m = 120 where id = 'waunakee'`,
  );
  const starts = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const ends = new Date(Date.now() + 55 * 60 * 1000).toISOString();
  const session = await pool.query(
    `insert into class_sessions (location_id, title, starts_at, ends_at, capacity, waitlist_capacity, status, program)
     values ('waunakee', 'Fixture class', $1, $2, 1, 2, 'scheduled', 'taekwondo') returning id`,
    [starts, ends],
  );
  const sibling = await pool.query(`select id, family_id from members where first_name = 'Avery'`);
  const other = await pool.query(
    `select id from members where family_id = $1 and first_name = 'Blake'`,
    [sibling.rows[0].family_id],
  );
  await pool.query(`update families set geofence_checkin_opt_in = true where id = $1`, [sibling.rows[0].family_id]);
  await pool.query(`update members set geofence_checkin_opt_in = true where family_id = $1`, [sibling.rows[0].family_id]);
  const guardian = token('guardian', { familyIds: [sibling.rows[0].family_id], platformRole: 'family' });
  const booked = await api('POST', '/v1/sessions/' + session.rows[0].id + '/bookings', guardian, {
    memberIds: [sibling.rows[0].id, other.rows[0].id],
  });
  assert.equal(booked.status, 201, JSON.stringify(booked.json));
  assert.equal(booked.json.bookings.filter((b: { status: string }) => b.status === 'booked').length, 1);
  assert.equal(booked.json.bookings.filter((b: { status: string }) => b.status === 'waitlist').length, 1);
  const bookedId = booked.json.bookings.find((b: { status: string }) => b.status === 'booked').id;
  const cancelled = await api('POST', '/v1/bookings/' + bookedId + '/cancel', guardian);
  assert.equal(cancelled.json.cancelled, true);
  assert.ok(cancelled.json.promotedBookingId);

  const again = await api('POST', '/v1/sessions/' + session.rows[0].id + '/bookings', guardian, { memberId: sibling.rows[0].id });
  const check = await api('POST', '/v1/check-ins/geofence', guardian, {
    familyId: sibling.rows[0].family_id,
    locationId: 'waunakee',
    latitude: 43.01,
    longitude: -89.01,
  });
  assert.equal(check.status, 200, JSON.stringify(check.json));
  assert.equal(check.json.coordinateStored, false);
  assert.ok(check.json.checkedIn.length >= 1);
  const second = await api('POST', '/v1/check-ins/geofence', guardian, {
    familyId: sibling.rows[0].family_id,
    locationId: 'waunakee',
    latitude: 43.01,
    longitude: -89.01,
  });
  assert.ok(second.json.skipped.some((row: { reason: string }) => row.reason === 'duplicate'));
  const far = await api('POST', '/v1/check-ins/geofence', guardian, {
    familyId: sibling.rows[0].family_id,
    locationId: 'waunakee',
    latitude: 44.2,
    longitude: -89.01,
  });
  assert.equal(far.status, 422);
  assert.equal(again.status === 201 || again.status === 409, true);

  const pkg = await pool.query(
    `insert into party_packages (location_id, name, duration_min, price_cents, deposit_cents)
     values ('goninjaW', 'Fixture Party', 90, 25000, 5000) returning id`,
  );
  const slot = await pool.query(
    `insert into party_slots (location_id, starts_at, ends_at)
     values ('goninjaW', '2027-03-01T18:00:00Z', '2027-03-01T19:30:00Z') returning id`,
  );
  const party = await api('POST', '/v1/public/goninja/bookings', undefined, {
    slotId: slot.rows[0].id,
    packageId: pkg.rows[0].id,
    hostName: 'Riley Sample',
    hostEmail: 'riley.sample@example.test',
    childName: 'Quinn Sample',
    childAge: '6',
    guestCount: 8,
  });
  assert.equal(party.status, 201, JSON.stringify(party.json));
  assert.equal(party.json.charged, false);
  const taken = await api('POST', '/v1/public/goninja/bookings', undefined, {
    slotId: slot.rows[0].id,
    packageId: pkg.rows[0].id,
    hostName: 'Riley Sample',
    hostEmail: 'riley.sample@example.test',
    childName: 'Quinn Sample',
    childAge: '6',
    guestCount: 8,
  });
  assert.equal(taken.status, 409);
  const pay = await api('POST', '/v1/public/goninja/bookings/' + party.json.bookingId + '/payment', undefined, {
    accessKey: party.json.accessKey,
    pay: 'deposit',
    opaqueData: { dataDescriptor: 'COMMON.ACCEPT.INAPP.PAYMENT', dataValue: 'fixture-opaque-token' },
  });
  assert.equal(pay.json.submitted, false);
  assert.equal(pay.json.charged, false);
  const phone = await api('POST', '/v1/public/goninja/bookings', undefined, { phone: '555' });
  assert.equal(phone.status, 400);

  const trialSession = await pool.query(
    `insert into class_sessions (location_id, title, starts_at, ends_at, capacity, status, trial_open, age_min, age_max)
     values ('waunakee', 'Fixture trial', $1, $2, 8, 'scheduled', true, 5, 7) returning id`,
    [new Date(Date.now() + 2 * 86400000).toISOString(), new Date(Date.now() + 2 * 86400000 + 3600000).toISOString()],
  );
  const trial = await api('POST', '/v1/public/trials', undefined, {
    sessionId: trialSession.rows[0].id,
    guardianName: 'Jordan Sample',
    email: 'jordan.sample@example.test',
    childName: 'Parker Sample',
    childAge: '6',
    source: 'website',
    utm: { source: 'fixture' },
    waiver: { version: 'fixture-2026-09', signerName: 'Jordan Sample', signature: 'Jordan Sample', signedOn: '2026-11-01' },
  });
  assert.equal(trial.status, 201, JSON.stringify(trial.json));
  assert.equal(trial.json.accountRequired, false);
  const lead = token('staff', { platformRole: 'school_lead', locationIds: ['waunakee'] });
  const converted = await api('POST', '/v1/leads/' + trial.json.leadId + '/convert', lead);
  assert.equal(converted.status, 200, JSON.stringify(converted.json));
  const timeline = await api('GET', '/v1/families/' + converted.json.familyId + '/timeline', admin);
  assert.ok(timeline.json.events.length >= 1);
  const statement = await api('GET', '/v1/families/' + converted.json.familyId + '/statements?year=2026', admin);
  assert.equal(statement.json.delivery, 'not_sent');

  const dunning = await api('POST', '/v1/billing/dunning/preview', admin, { on: '2027-01-04' });
  assert.equal(dunning.json.sent, false);
  const autos = await api('POST', '/v1/automations/run', admin);
  assert.equal(autos.json.sent, false);
  const qbo = await api('POST', '/v1/qbo/preview', admin, { locationId: 'waunakee', on: '2027-01-04', amountCents: 4000 });
  assert.equal(qbo.json.submitted, false);

  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(`select crm_private.set_actor('family', '', $1)`, [sibling.rows[0].family_id]);
    await client.query('set role crm_app');
    const cross = await client.query('select count(*)::int as n from crm_private.identity_crosswalk');
    assert.equal(cross.rows[0].n, 0);
    await client.query('reset role');
    await client.query('rollback');
  } finally {
    client.release();
  }
});
