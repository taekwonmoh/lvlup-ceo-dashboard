import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { signToken } from '../src/auth.ts';
import {
  ownerPulse, quizBoard, retentionQueue, scoreAttempt, testingBoard, qrBoard,
} from '../src/studio-ops.ts';
import { handleWorkerRequest, type CrmWorkerEnv } from '../worker/src/app.ts';

const root = dirname(fileURLToPath(import.meta.url));
const SECRET = 'studio-test-secret';
const AS_OF = '2026-11-27';

await import(new URL('../ui/studio-ops.js', import.meta.url).href);
await import(new URL('../ui/qr.js', import.meta.url).href);
const ui = (globalThis as unknown as { CrmStudio: {
  ownerPulse: typeof ownerPulse;
  retentionQueue: typeof retentionQueue;
  testingBoard: typeof testingBoard;
  qrBoard: typeof qrBoard;
  quizBoard: typeof quizBoard;
  scoreAttempt: typeof scoreAttempt;
} }).CrmStudio;
const qr = (globalThis as unknown as { CrmQr: { matrix: (text: string) => number[][]; svg: (text: string, label?: string) => string } }).CrmQr;

function token(role: 'admin' | 'staff' | 'guardian') {
  return signToken({
    role,
    email: role + '@example.test',
    locationIds: ['waunakee', 'eastmad', 'verona', 'deforest', 'goninjaW', 'goninjaV'],
    familyIds: [],
    memberId: null,
    canFinance: role === 'admin',
  }, SECRET);
}

function flags(): CrmWorkerEnv {
  return {
    AUTHORIZENET_MODE: 'sandbox',
    BILLING_CHARGES_ENABLED: '0',
    CRM_ALLOW_LOCAL_TOKENS: '1',
    CRM_TOKEN_SECRET: SECRET,
    AUTOMATION_DELIVERY_ENABLED: '0',
  };
}

async function call(path: string, init: { method?: string; token?: string; body?: unknown; pool?: pg.Pool | null } = {}) {
  const res = await handleWorkerRequest(new Request('https://crm.test' + path, {
    method: init.method || 'GET',
    headers: {
      ...(init.token ? { authorization: 'Bearer ' + init.token } : {}),
      'content-type': 'application/json',
    },
    body: init.body == null ? undefined : JSON.stringify(init.body),
  }), flags(), undefined, { pool: init.pool === undefined ? null : init.pool });
  const text = await res.text();
  let json: any = {};
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  return { status: res.status, json, text };
}

test('demo studio model matches the worker model', () => {
  assert.deepEqual(ui.ownerPulse(AS_OF, {}), ownerPulse(AS_OF));
  assert.deepEqual(ui.retentionQueue(AS_OF, {}), retentionQueue(AS_OF));
  assert.deepEqual(ui.testingBoard(AS_OF, {}), testingBoard(AS_OF));
  assert.deepEqual(ui.qrBoard('goninjaW'), qrBoard('goninjaW'));
  assert.deepEqual(ui.quizBoard([], []), quizBoard());
  assert.deepEqual(ui.scoreAttempt('white-korean', [1, 2, 0], []), scoreAttempt('white-korean', [1, 2, 0]));
});

test('owner pulse covers all six academies without a belt-test fee', () => {
  const pulse = ownerPulse(AS_OF);
  assert.deepEqual(pulse.schools.map(school => school.locationId), ['waunakee', 'verona', 'eastmad', 'deforest', 'goninjaW', 'goninjaV']);
  assert.equal(pulse.charges, false);
  assert.equal(pulse.sends, false);
  assert.equal(pulse.beltTestFeeCents, 0);
  assert.equal(pulse.feeModel, 'included_2027');
  for (const school of pulse.schools) {
    assert.equal(school.beltTestFeeCents, 0);
    assert.ok(school.activeMembers > 0);
    assert.equal(school.readyToTest, 1);
  }
  assert.equal(JSON.stringify(pulse).includes('$100'), false);
  assert.equal(JSON.stringify(pulse).includes('tel:'), false);
});

test('miss-you queue groups 21, 14, and 7 day students', () => {
  const queue = retentionQueue(AS_OF);
  const ids = (band: string) => queue.groups.find(group => group.id === band)!.schools.flatMap(school => school.people.map(person => person.id)).sort();
  assert.deepEqual(ids('21'), ['noah', 'quinn', 'rowan']);
  assert.deepEqual(ids('14'), ['avery', 'finley', 'jamie', 'reese']);
  assert.deepEqual(ids('7'), ['drew', 'elliot', 'parker']);
  assert.equal(queue.total, 10);
  const snoozed = retentionQueue(AS_OF, { rowan: { status: 'snoozed', snoozeUntil: '2026-12-04' }, quinn: { status: 'resolved' } });
  const urgent = snoozed.groups.find(group => group.id === '21')!.schools.flatMap(school => school.people.map(person => person.id));
  assert.deepEqual(urgent, ['noah']);
});

test('testing readiness is included with tuition at $0', () => {
  const board = testingBoard(AS_OF);
  const ids = (band: string) => board.bands.find(row => row.id === band)!.people.map(person => person.id).sort();
  assert.deepEqual(ids('ready'), ['blake', 'harper', 'hayden', 'morgan', 'robin', 'taylor']);
  assert.deepEqual(ids('almost'), ['cameron', 'quinn', 'reese', 'riley']);
  for (const band of board.bands) {
    for (const person of band.people) {
      assert.equal(person.beltTestFeeCents, 0);
      assert.equal(person.feeModel, 'included_2027');
      assert.equal(person.feeLabel, 'Included with tuition');
    }
  }
  const failed = scoreAttempt('ninja-safety', [0, 0, 0]);
  assert.equal(failed.passed, false);
  assert.equal(failed.scorePct, 33);
  assert.equal(failed.sent, false);
});

test('lobby QR codes are scannable and do not encode a phone number', () => {
  const board = qrBoard('eastmad');
  assert.deepEqual(board.codes.map(code => code.payload), [
    'LVLUP:TRIAL:EASTMAD:DEMO',
    'LVLUP:CHECKIN:EASTMAD:DEMO',
    'LVLUP:CHECKOUT:EASTMAD:DEMO',
  ]);
  for (const code of board.codes) {
    assert.equal(code.charged, false);
    assert.equal(code.payload.includes('tel:'), false);
    const modules = qr.matrix(code.payload);
    assert.equal(modules.length, 25);
    assert.equal(modules[0][0], 1);
    assert.equal(modules[0][24], 1);
    assert.equal(modules[24][0], 1);
    const svg = qr.svg(code.payload, code.title);
    assert.equal(svg.includes('<svg'), true);
    assert.equal(svg.includes('tel:'), false);
    assert.equal(svg.includes('script'), false);
    let decoded: string | null = null;
    try {
      const quiet = 4;
      const scale = 6;
      const size = (modules.length + quiet * 2) * scale;
      const rows: string[] = [];
      for (let y = 0; y < size; y++) {
        let row = '';
        for (let x = 0; x < size; x++) {
          const mx = Math.floor(x / scale) - quiet;
          const my = Math.floor(y / scale) - quiet;
          const dark = mx >= 0 && my >= 0 && mx < modules.length && my < modules.length && modules[my][mx];
          row += dark ? '0 0 0 ' : '255 255 255 ';
        }
        rows.push(row.trim());
      }
      const file = '/tmp/lvlup-qr-' + code.kind + '.ppm';
      writeFileSync(file, 'P3\n' + size + ' ' + size + '\n255\n' + rows.join('\n') + '\n');
      decoded = execFileSync('zbarimg', ['--quiet', '--raw', file], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch {
      decoded = null;
    }
    if (decoded != null) assert.equal(decoded, code.payload);
  }
});

test('studio routes stay staff-only and never send or charge', async () => {
  const anon = await call('/v1/studio/pulse?asOf=' + AS_OF);
  assert.equal(anon.status, 401);
  const family = await call('/v1/studio/pulse?asOf=' + AS_OF, { token: token('guardian') });
  assert.equal(family.status, 403);

  const pulse = await call('/v1/studio/pulse?asOf=' + AS_OF, { token: token('staff') });
  assert.equal(pulse.status, 200);
  assert.equal(pulse.json.schools.length, 6);
  assert.equal(pulse.json.charges, false);
  assert.equal(pulse.json.beltTestFeeCents, 0);
  assert.equal(pulse.text.includes('$100'), false);
  assert.equal(pulse.text.includes('tel:'), false);

  const overview = await call('/v1/studio/overview?asOf=' + AS_OF + '&locationId=verona', { token: token('admin') });
  assert.equal(overview.status, 200);
  assert.equal(overview.json.qr.locationId, 'verona');
  assert.equal(overview.json.testing.feeModel, 'included_2027');

  const draft = await call('/v1/studio/outreach', {
    method: 'POST',
    token: token('staff'),
    body: { personKey: 'parker', channel: 'sms', asOf: AS_OF },
  });
  assert.equal(draft.status, 201);
  assert.equal(draft.json.sent, false);
  assert.equal(draft.json.charges, false);
  assert.equal(draft.json.persisted, false);
  assert.match(draft.json.body, /We miss you/);
  assert.equal(draft.text.includes('tel:'), false);

  const phone = await call('/v1/studio/outreach', {
    method: 'POST',
    token: token('staff'),
    body: { personKey: 'parker', channel: 'sms', phone: '5550000000' },
  });
  assert.equal(phone.status, 400);

  const invite = await call('/v1/studio/testing', {
    method: 'POST',
    token: token('staff'),
    body: { personKey: 'morgan', action: 'invite', asOf: AS_OF },
  });
  assert.equal(invite.status, 201);
  assert.equal(invite.json.beltTestFeeCents, 0);
  assert.equal(invite.json.sent, false);
  assert.match(invite.json.body, /included with tuition/i);

  const scan = await call('/v1/studio/qr/scan', {
    method: 'POST',
    token: token('staff'),
    body: { payload: 'LVLUP:CHECKOUT:GNW:DEMO' },
  });
  assert.equal(scan.status, 201);
  assert.equal(scan.json.kind, 'checkout');
  assert.equal(scan.json.charged, false);
  assert.match(scan.json.message, /Nothing was charged/);
});

test('studio migration keeps sends, charges, and belt-test fees off', () => {
  const sql = readFileSync(join(root, '../migrations/016_studio_ops.sql'), 'utf8');
  assert.match(sql, /sent boolean not null default false/);
  assert.match(sql, /check \(sent = false\)/);
  assert.match(sql, /check \(charged = false\)/);
  assert.match(sql, /check \(belt_test_fee_cents = 0\)/);
  assert.match(sql, /included_2027/);
  assert.equal(sql.includes('tel:'), true);
  assert.equal(/\$100/.test(sql), false);
  assert.equal(readFileSync(join(root, '../supabase/migrations/20261127000016_studio_ops.sql'), 'utf8'), sql);
});
