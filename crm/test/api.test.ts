import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import pg from 'pg';
import { signToken } from '../src/auth.ts';
import { migrate } from '../src/migrate.ts';
import { createApp } from '../src/server.ts';
import { createServer } from 'node:http';

const SECRET = 'dev-only-secret';
const URL = process.env.CRM_DATABASE_URL || 'postgres://crm:crm@127.0.0.1:5432/crm_test';
process.env.CRM_DATABASE_URL = URL;
process.env.CRM_TOKEN_SECRET = SECRET;
process.env.AUTHORIZENET_MODE = 'sandbox';

let pool: pg.Pool;
let base = '';
let close: () => Promise<void>;

function token(role: 'admin' | 'staff' | 'guardian' | 'member', extra: Record<string, unknown> = {}) {
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

async function api(method: string, path: string, tok: string, body?: unknown) {
  const res = await fetch(base + path, {
    method,
    headers: {
      authorization: 'Bearer ' + tok,
      'content-type': 'application/json',
    },
    body: body == null ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

before(async () => {
  execFileSync('sudo', ['-u', 'postgres', 'psql', '-v', 'ON_ERROR_STOP=1', '-c', `
    DO $$ BEGIN
      CREATE ROLE crm LOGIN PASSWORD 'crm';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `], { stdio: 'pipe' });
  execFileSync('sudo', ['-u', 'postgres', 'psql', '-v', 'ON_ERROR_STOP=1', '-d', 'postgres', '-c', `
    SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'crm_test' AND pid <> pg_backend_pid();
  `], { stdio: 'pipe' });
  execFileSync('sudo', ['-u', 'postgres', 'psql', '-v', 'ON_ERROR_STOP=1', '-d', 'postgres', '-c',
    'DROP DATABASE IF EXISTS crm_test;'], { stdio: 'pipe' });
  execFileSync('sudo', ['-u', 'postgres', 'psql', '-v', 'ON_ERROR_STOP=1', '-d', 'postgres', '-c',
    'CREATE DATABASE crm_test OWNER crm;'], { stdio: 'pipe' });
  pool = new pg.Pool({ connectionString: URL });
  await migrate(pool);
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

test('staff import, family scope, quotes, and schedule adapters', async () => {
  const admin = token('admin', { locationIds: ['waunakee', 'verona', 'eastmad'] });
  const imported = await api('POST', '/v1/imports/gymdesk', admin);
  assert.equal(imported.status, 200);
  assert.equal(imported.json.members, 3);
  assert.equal(imported.json.matched, 2);
  assert.deepEqual(imported.json.profileWithoutMember, ['900000099']);

  const status = await api('GET', '/v1/imports/status', admin);
  assert.equal(status.json.import.source, 'gymdesk-fixture');

  const list = await api('GET', '/v1/members?locationId=verona', admin);
  assert.equal(list.json.members.length, 1);
  assert.equal(list.json.members[0].firstName, 'Blake');
  const familyId = list.json.members[0].familyId;

  const guardian = token('guardian', { familyIds: [familyId], locationIds: [] });
  const own = await api('GET', '/v1/families/' + familyId, guardian);
  assert.equal(own.status, 200);
  assert.equal(own.json.members.length, 2);

  const waunakee = await api('GET', '/v1/members?locationId=waunakee', admin);
  const otherFamily = waunakee.json.members.find((m: { familyId: string }) => m.familyId !== familyId).familyId;
  const denied = await api('GET', '/v1/families/' + otherFamily, guardian);
  assert.equal(denied.status, 404);

  const desk = token('staff', { locationIds: ['waunakee'], canFinance: false });
  const veronaHidden = await api('GET', '/v1/members?locationId=verona', desk);
  assert.equal(veronaHidden.json.members.length, 0);

  const code = await api('POST', '/v1/promo-codes', admin, {
    code: 'CLINIC10',
    discountType: 'percent',
    percentOff: 10,
    audience: 'all',
    stacks: false,
    active: true,
    scopes: [{ scopeType: 'event_type', eventType: 'clinic' }],
  });
  assert.equal(code.status, 201);
  const quote = await api('POST', '/v1/quotes', guardian, {
    listPriceCents: 5000,
    on: '2026-11-21',
    locationId: 'waunakee',
    brand: 'lvlup',
    eventType: 'clinic',
    buyer: 'member',
    familyId,
    codes: ['CLINIC10'],
  });
  assert.equal(quote.status, 200);
  assert.equal(quote.json.dueCents, 4500);

  const redeemed = await api('POST', '/v1/promo-redemptions', admin, {
    listPriceCents: 5000,
    on: '2026-11-21',
    locationId: 'waunakee',
    brand: 'lvlup',
    eventType: 'clinic',
    buyer: 'member',
    familyId,
    codes: ['CLINIC10'],
  });
  assert.equal(redeemed.status, 201);

  const lookup = await api('POST', '/v1/payment-profiles/lookup', admin, { customerProfileId: '900000001' });
  assert.equal(lookup.status, 200);
  assert.equal(lookup.json.profile.merchantCustomerId, '10000001');
  assert.equal(JSON.stringify(lookup.json).includes('411111'), false);

  const preview = await api('POST', '/v1/charges/preview', admin, {
    customerProfileId: '900000001',
    paymentProfileId: '800000001',
    amountCents: 22400,
    invoiceNumber: 'inv_demo',
  });
  assert.equal(preview.json.submitted, false);
  assert.equal(preview.json.request.createTransactionRequest.transactionRequest.amount, '224.00');

  const noFinance = await api('POST', '/v1/charges/preview', desk, {
    customerProfileId: '900000001',
    paymentProfileId: '800000001',
    amountCents: 100,
    invoiceNumber: 'x',
  });
  assert.equal(noFinance.status, 403);

  const tasks = await api('POST', '/v1/tasks/import', admin);
  assert.equal(tasks.json.imported, 3);
  const taskList = await api('GET', '/v1/tasks?staff=tc_ash', admin);
  assert.equal(taskList.json.completions.length, 3);

  const sched = await api('POST', '/v1/staff-schedule/import', admin);
  assert.equal(sched.json.scheduledMinutes, 420);
  const shifts = await api('GET', '/v1/staff-schedule?staff=tc_ash', admin);
  assert.equal(shifts.json.shifts.length, 2);
  assert.equal(shifts.json.shifts[0].location_id, 'eastmad');

  const memberTok = token('member', { familyIds: [familyId], memberId: list.json.members[0].id });
  const self = await api('GET', '/v1/members/' + list.json.members[0].id, memberTok);
  assert.equal(self.status, 200);
  assert.equal(self.json.gymdeskMemberId, undefined);
  const tasksDenied = await api('GET', '/v1/tasks', memberTok);
  assert.equal(tasksDenied.status, 403);
});
