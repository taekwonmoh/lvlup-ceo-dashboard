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

  const ranks = await pool.query(`select program_code, count(*)::int as n from ranks group by 1`);
  const byProgram = Object.fromEntries(ranks.rows.map((row: { program_code: string; n: number }) => [row.program_code, row.n]));
  assert.equal(byProgram.mini_tiger, 18);
  assert.equal(byProgram.tiger, 18);
  assert.equal(byProgram.songahm, 25);
  assert.equal(byProgram.legacy, 9);
  assert.equal(byProgram.ata_instructor, 4);
  assert.equal(byProgram.goninja, 8);
  assert.equal(byProgram.mpk, 21);
  const alias = await pool.query('select count(*)::int as n from rank_aliases');
  assert.ok(alias.rows[0].n > 100);
  const cycles = await pool.query(`select theme, test_on::text as test_on from curriculum_cycles where start_on = '2026-10-19'`);
  assert.equal(cycles.rows[0].theme, 'Honesty');
  assert.equal(String(cycles.rows[0].test_on).slice(0, 10), '2026-12-12');

  const home = await api('GET', '/v1/home/summary?scope=all&asOf=2026-11-24', admin);
  assert.equal(home.status, 200);
  assert.equal(home.json.members.active, 494);
  assert.equal(home.json.cycle.theme, 'Honesty');
  assert.equal(home.json.cycle.week, 6);
  const gn = await api('GET', '/v1/home/summary?scope=goninja', admin);
  assert.equal(gn.json.brand, 'goninja');
  assert.equal(gn.json.goninja.academyStudents, 84);
  assert.equal(gn.json.goninja.afterSchoolFillPct, 90.9);
  const one = await api('GET', '/v1/home/summary?scope=waunakee', admin);
  assert.equal(one.json.goninja, null);
  assert.equal(one.json.members.attritionOnTrack, true);
  const deniedHome = await api('GET', '/v1/home/summary?scope=all', memberTok);
  assert.equal(deniedHome.status, 403);

  const mini = await api('GET', '/v1/curriculum?program=mini_tiger&rank=White&asOf=2026-11-24', admin);
  const tiger = await api('GET', '/v1/curriculum?program=tiger&rank=White&asOf=2026-11-24', admin);
  const belt = await api('GET', '/v1/curriculum?program=songahm&rank=Yellow&asOf=2026-11-24', admin);
  assert.equal(mini.json.curriculumLevel, 'mini_tigers');
  assert.equal(tiger.json.curriculumLevel, 'tigers');
  assert.equal(belt.json.curriculumLevel, 'beginners');
  assert.notEqual(mini.json.rank.canonicalId, tiger.json.rank.canonicalId);
  assert.equal(mini.json.sections[0].sample, true);
  const resolved = await api('GET', '/v1/ranks/resolve?program=tiger&name=Tiger%20Ara%20Belt', admin);
  assert.equal(resolved.json.rank.canonicalId, 'tiger.ara');
  const retry = await api('POST', '/v1/payments/retry-preview', admin, { invoiceId: 'inv_casey' });
  assert.equal(retry.json.submitted, false);
  assert.equal(retry.json.sandbox, true);

  const books = await api('GET', '/v1/financials/summary?scope=all&period=month&asOf=2026-11-24', admin);
  assert.equal(books.status, 200);
  assert.equal(books.json.fixture, true);
  assert.equal(books.json.live, false);
  assert.equal(books.json.tiles.collected.cents, 279130);
  assert.equal(books.json.tiles.stillExpected.cents, 70700);
  assert.equal(books.json.tiles.mrr.cents, 341711);
  const financeStaff = token('staff', { locationIds: ['waunakee'], canFinance: true });
  const ownSchool = await api('GET', '/v1/financials/summary?scope=waunakee', financeStaff);
  assert.equal(ownSchool.status, 200);
  assert.equal(ownSchool.json.schools.length, 1);
  const allDenied = await api('GET', '/v1/financials/summary?scope=all', financeStaff);
  assert.equal(allDenied.status, 403);
  const otherSchool = await api('GET', '/v1/financials/summary?scope=verona', financeStaff);
  assert.equal(otherSchool.status, 403);
  const noFinanceBooks = await api('GET', '/v1/financials/summary?scope=waunakee', desk);
  assert.equal(noFinanceBooks.status, 403);
  const unknown = await api('GET', '/v1/financials/summary?scope=eastmadison', admin);
  assert.equal(unknown.status, 404);
  const forecast = await api('GET', '/v1/financials/reports/forecast?scope=all&from=2026-11-24&through=2026-11-30', admin);
  assert.equal(forecast.status, 200);
  assert.equal(forecast.json.totalCents, 70700);
  const missingReport = await api('GET', '/v1/financials/reports/nope?scope=all', admin);
  assert.equal(missingReport.status, 404);
});
