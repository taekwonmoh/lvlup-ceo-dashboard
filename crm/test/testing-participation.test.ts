import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { signToken } from '../src/auth.ts';
import { cycleReport, participationCsv, signupTracker } from '../src/testing-participation.ts';
import { handleWorkerRequest, type CrmWorkerEnv } from '../worker/src/app.ts';

const root = dirname(fileURLToPath(import.meta.url));
const SECRET = 'testing-participation-secret';

await import(new URL('../ui/studio-ops.js', import.meta.url).href);
const ui = (globalThis as unknown as { CrmStudio: {
  signupBoard: (asOf: string, store?: { studio?: { signupAdds?: Record<string, number> } }) => { total: { count: number; active: number; percent: number }; current: string };
  reportCsv: (cycleId: string) => string;
} }).CrmStudio;

function token() {
  return signToken({
    role: 'staff', email: 'staff@example.test', locationIds: ['waunakee'], familyIds: [], memberId: null, canFinance: false,
  }, SECRET);
}

async function call(path: string, bearer?: string) {
  const res = await handleWorkerRequest(new Request('https://crm.test' + path, {
    headers: bearer ? { authorization: 'Bearer ' + bearer } : {},
  }), {
    AUTHORIZENET_MODE: 'sandbox', BILLING_CHARGES_ENABLED: '0', CRM_ALLOW_LOCAL_TOKENS: '1', CRM_TOKEN_SECRET: SECRET,
  } as CrmWorkerEnv, undefined, { pool: null });
  const text = await res.text();
  const csv = (res.headers.get('content-type') || '').includes('csv');
  return { status: res.status, text, csv, json: csv ? null : JSON.parse(text) };
}

test('sign-up pace is signed up over active students, with no price', () => {
  const board = signupTracker('2026-11-27');
  assert.equal(board.current, 'w3');
  assert.equal(board.includedWithTuition, true);
  assert.equal(board.total.count, 136);
  assert.equal(board.total.active, 494);
  assert.equal(board.total.percent, 28);
  const waunakee = board.schools.find(row => row.locationId === 'waunakee');
  assert.equal(waunakee && waunakee.count, 42);
  assert.equal(waunakee && waunakee.percent, 30);
  assert.equal(board.weeks.find(week => week.id === 'w2')!.open, false);
  assert.equal(board.ramp && board.ramp.points > 0, true);
  const local = ui.signupBoard('2026-11-27');
  assert.equal(local.total.percent, board.total.percent);
  assert.equal(local.current, 'w3');
  assert.equal(JSON.stringify(board).includes('$'), false);
});

test('post-cycle report is tested over the active student body', () => {
  const cycle = cycleReport('2026-c5');
  assert.equal(cycle.total.tested, 293);
  assert.equal(cycle.total.percent, 59);
  assert.equal(cycle.schools.find(row => row.locationId === 'goninjaV')!.percent, 53);
  const csv = participationCsv('2026-c5');
  assert.match(csv, /All schools,494,293,59/);
  assert.equal(csv.includes('$'), false);
  assert.equal(ui.reportCsv('2026-c5'), csv);
  const earlier = cycleReport('2026-c4');
  assert.ok(earlier.total.percent < cycle.total.percent);
});

test('participation routes are staff-only and return the sample cycles', async () => {
  assert.equal((await call('/v1/studio/testing-signup?asOf=2026-11-27')).status, 401);
  const signup = await call('/v1/studio/testing-signup?asOf=2026-11-27', token());
  assert.equal(signup.status, 200);
  assert.equal(signup.json.current, 'w3');
  assert.equal(signup.json.total.percent, 28);
  assert.equal(signup.text.includes('$'), false);
  const report = await call('/v1/studio/testing-report?cycle=2026-c5&compare=2026-c4', token());
  assert.equal(report.status, 200);
  assert.equal(report.json.primary.total.percent, 59);
  assert.equal(report.json.compare.total.percent, 54);
  const file = await call('/v1/studio/testing-report.csv?cycle=2026-c5', token());
  assert.equal(file.status, 200);
  assert.equal(file.csv, true);
  assert.match(file.text, /LVLUP Waunakee,140,91,65/);
});

test('belt testing copy does not show a dollar amount', () => {
  const studio = readFileSync(join(root, '../ui/studio-ops.js'), 'utf8');
  const testing = studio.slice(studio.indexOf('function testingHtml'), studio.indexOf('function lobbyHtml'));
  const report = studio.slice(studio.indexOf('function reportHtml'), studio.indexOf('function testingHtml'));
  assert.equal(testing.includes('$'), false);
  assert.equal(report.includes('$'), false);
  assert.match(testing, /Included with tuition/);
  const growth = readFileSync(join(root, '../ui/growth-desk.js'), 'utf8');
  const panel = growth.slice(growth.indexOf('function feePanel'), growth.indexOf('function askHtml'));
  assert.equal(panel.includes('Belt test $'), false);
  assert.equal(panel.includes('Belt Tests'), false);
  assert.match(panel, /Belt testing is included with tuition/);
  const sql = readFileSync(join(root, '../migrations/018_testing_participation.sql'), 'utf8');
  assert.equal(readFileSync(join(root, '../supabase/migrations/20261127000018_testing_participation.sql'), 'utf8'), sql);
  assert.equal(/\$\d/.test(sql), false);
});
