import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { signToken } from '../src/auth.ts';
import {
  answerQuestion, cleanFeeSchedule, DEFAULT_FEE_SCHEDULE, feePreview, feeRollup, pipelineBoard, policyFeeCents, upcomingBirthdays,
} from '../src/growth-desk.ts';
import { buildQuickbooksExport, QBO_AS_OF, QBO_SANDBOX_LINES } from '../src/qbo-export.ts';
import { handleWorkerRequest, type CrmWorkerEnv } from '../worker/src/app.ts';

const root = dirname(fileURLToPath(import.meta.url));
const SECRET = 'growth-test-secret';

await import(new URL('../ui/growth-desk.js', import.meta.url).href);
const ui = (globalThis as unknown as { CrmGrowth: {
  feePreview: (schedule: typeof DEFAULT_FEE_SCHEDULE) => { cardTuitionFeeCents: number; cardShopFeeCents: number; beltTestPassedCents: number };
  answerQuestion: (q: string, asOf: string) => { title: string; rows: string[] };
  birthdays: (asOf: string) => Array<{ name: string }>;
  policyFeeCents: typeof policyFeeCents;
} }).CrmGrowth;

function token(role: 'staff' | 'guardian') {
  return signToken({
    role, email: role + '@example.test', locationIds: ['waunakee'], familyIds: [], memberId: null, canFinance: false,
  }, SECRET);
}

function flags(): CrmWorkerEnv {
  return { AUTHORIZENET_MODE: 'sandbox', BILLING_CHARGES_ENABLED: '0', CRM_ALLOW_LOCAL_TOKENS: '1', CRM_TOKEN_SECRET: SECRET };
}

async function call(path: string, init: { method?: string; token?: string; body?: unknown } = {}) {
  const res = await handleWorkerRequest(new Request('https://crm.test' + path, {
    method: init.method || 'GET',
    headers: { ...(init.token ? { authorization: 'Bearer ' + init.token } : {}), 'content-type': 'application/json' },
    body: init.body == null ? undefined : JSON.stringify(init.body),
  }), flags(), undefined, { pool: null });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : {}, text };
}

test('tuition can pass a card fee and pro shop never does', () => {
  const preview = feePreview(DEFAULT_FEE_SCHEDULE);
  assert.equal(preview.cardShopFeeCents, 0);
  assert.equal(preview.achShopFeeCents, 0);
  assert.equal(preview.beltTestPassedCents, 0);
  assert.equal(preview.beltTestFeeCents, 0);
  assert.ok(preview.cardTuitionFeeCents > preview.achTuitionFeeCents);
  assert.equal(preview.cardTuitionFeeCents, policyFeeCents({ categoryId: 'tuition', grossCents: 20900, method: 'card' }, DEFAULT_FEE_SCHEDULE));
  assert.equal(ui.feePreview(DEFAULT_FEE_SCHEDULE).cardShopFeeCents, 0);
  assert.equal(ui.policyFeeCents({ categoryId: 'retail', grossCents: 4500, method: 'card' }, { ...DEFAULT_FEE_SCHEDULE, tuition: true }), 0);
  const forced = cleanFeeSchedule({ ...DEFAULT_FEE_SCHEDULE, events: true, parties: true });
  assert.equal(policyFeeCents({ categoryId: 'retail', grossCents: 8900, method: 'card' }, forced), 0);
  assert.equal(policyFeeCents({ categoryId: 'belt_test', grossCents: 10000, method: 'card' }, forced), 0);
  assert.ok(policyFeeCents({ categoryId: 'lvlup_parties', grossCents: 21900, method: 'card' }, forced) > 0);
  assert.equal(policyFeeCents({ categoryId: 'lvlup_parties', grossCents: 21900, method: 'card' }, DEFAULT_FEE_SCHEDULE), 0);
});

test('category pass-through changes the QuickBooks fee column and leaves the default export alone', () => {
  const plain = buildQuickbooksExport({ entity: 'all', period: 'month', asOf: QBO_AS_OF });
  const passed = buildQuickbooksExport({ entity: 'all', period: 'month', asOf: QBO_AS_OF, feeSchedule: DEFAULT_FEE_SCHEDULE });
  assert.ok(plain.summary.feeCents > passed.summary.feeCents);
  const rollup = feeRollup(QBO_SANDBOX_LINES.filter(line => line.on.startsWith('2026-11')), DEFAULT_FEE_SCHEDULE);
  const shop = rollup.groups.find(group => group.group === 'proshop');
  const tuition = rollup.groups.find(group => group.group === 'tuition');
  assert.equal(shop && shop.feeCents, 0);
  assert.ok(tuition && tuition.feeCents > 0);
  assert.equal(passed.summary.formulaOk, true);
  assert.equal(JSON.stringify(passed).includes('tel:'), false);
});

test('pipeline, birthdays, and owner questions stay on the sample roster', () => {
  const board = pipelineBoard('2026-11-27');
  const stalled = board.stages.flatMap(stage => stage.cards).filter(card => card.stalled).map(card => card.id).sort();
  assert.deepEqual(stalled, ['indigo', 'skyler']);
  const days = upcomingBirthdays('2026-11-27', 14).map(row => row.name);
  assert.ok(days.includes('Riley Sample'));
  assert.ok(days.includes('Avery Sample'));
  const risk = answerQuestion('Which students are at risk of quitting?', '2026-11-27');
  assert.match(risk.rows.join(' '), /Rowan Sample/);
  assert.equal(ui.answerQuestion('Best trial conversion school?', '2026-11-27').title, 'Best trial conversion');
  assert.equal(ui.birthdays('2026-11-27').some(row => row.name === 'Riley Sample'), true);
  assert.equal(risk.sends, false);
});

test('growth routes stay staff-only and never send', async () => {
  assert.equal((await call('/v1/studio/growth?asOf=2026-11-27')).status, 401);
  assert.equal((await call('/v1/studio/growth?asOf=2026-11-27', { token: token('guardian') })).status, 403);
  const desk = await call('/v1/studio/growth?asOf=2026-11-27', { token: token('staff') });
  assert.equal(desk.status, 200);
  assert.equal(desk.json.fees.cardShopFeeCents, 0);
  assert.equal(desk.json.fees.beltTestFeeCents, 0);
  assert.equal(desk.json.sends, false);
  const saved = await call('/v1/studio/growth', {
    method: 'POST', token: token('staff'),
    body: { action: 'fees', schedule: { ...DEFAULT_FEE_SCHEDULE, events: true }, asOf: '2026-11-27' },
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.json.proshopOn, false);
  assert.equal(saved.json.cardShopFeeCents, 0);
  const note = await call('/v1/studio/growth', {
    method: 'POST', token: token('staff'),
    body: { action: 'birthday', personKey: 'riley', name: 'Riley Sample', asOf: '2026-11-27' },
  });
  assert.equal(note.status, 201);
  assert.equal(note.json.sent, false);
  assert.match(note.json.body, /Nothing was sent/);
  const phone = await call('/v1/studio/growth', {
    method: 'POST', token: token('staff'), body: { action: 'ask', phone: '5550000000' },
  });
  assert.equal(phone.status, 400);
});

test('growth migration locks pro shop fees, belt tests, and sends', () => {
  const sql = readFileSync(join(root, '../migrations/017_growth_desk.sql'), 'utf8');
  assert.match(sql, /check \(proshop_on = false\)/);
  assert.match(sql, /check \(belt_test_fee_cents = 0\)/);
  assert.match(sql, /check \(sent = false\)/);
  assert.match(sql, /check \(sends = false\)/);
  assert.equal(readFileSync(join(root, '../supabase/migrations/20261127000017_growth_desk.sql'), 'utf8'), sql);
});
