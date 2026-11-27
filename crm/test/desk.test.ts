import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { signToken } from '../src/auth.ts';
import { DESK_TASKS, deskSheet, payPeriod, phaseProgress } from '../src/desk.ts';
import { sandboxPreviewCode } from '../src/sandbox-auth.ts';
import { handleWorkerRequest, type CrmWorkerEnv } from '../worker/src/app.ts';

const SECRET = 'desk-test-secret';

function token(role: 'admin' | 'staff' | 'guardian', extra: Record<string, unknown> = {}) {
  return signToken({
    role,
    email: role + '@example.test',
    locationIds: ['waunakee', 'eastmad', 'verona', 'deforest', 'goninjaW', 'goninjaV'],
    familyIds: role === 'guardian' ? ['fam'] : [],
    memberId: null,
    canFinance: role === 'admin',
    platformRole: role === 'guardian' ? 'family' : 'front_desk',
    ...extra,
  }, SECRET);
}

function flags(extra: Partial<CrmWorkerEnv> = {}): CrmWorkerEnv {
  return {
    AUTHORIZENET_MODE: 'sandbox',
    BILLING_CHARGES_ENABLED: '0',
    QBO_ENABLED: '0',
    AUTOMATION_DELIVERY_ENABLED: '0',
    PUSH_DELIVERY_ENABLED: '0',
    WEBHOOK_DELIVERY_ENABLED: '0',
    CRM_ALLOW_LOCAL_TOKENS: '1',
    CRM_TOKEN_SECRET: SECRET,
    ...extra,
  };
}

async function call(path: string, env: CrmWorkerEnv, init: { method?: string; token?: string; body?: unknown } = {}) {
  const res = await handleWorkerRequest(new Request('https://crm.test' + path, {
    method: init.method || 'GET',
    headers: {
      ...(init.token ? { authorization: 'Bearer ' + init.token } : {}),
      'content-type': 'application/json',
    },
    body: init.body == null ? undefined : JSON.stringify(init.body),
  }), env, undefined, { pool: null });
  const text = await res.text();
  let json: any = {};
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  return { status: res.status, json, text };
}

test('each school has opening, mid-shift, and closing sheets', () => {
  const sheet = deskSheet('goninjaV');
  assert.equal(sheet.charges, false);
  assert.equal(sheet.qbo, '0');
  assert.deepEqual(sheet.phases.map(phase => phase.title), ['Opening', 'Mid-Shift', 'Closing']);
  for (const phase of sheet.phases) {
    assert.equal(sheet.tasks.filter(task => task.phase === phase.id).length, 6);
  }
  const opening = sheet.tasks.filter(task => task.phase === 'opening').map(task => task.id);
  const progress = phaseProgress(sheet.tasks, opening.slice(0, 4));
  assert.equal(progress[0].label, '4 of 6 complete');
  assert.equal(progress[1].label, '0 of 6 complete');
  assert.throws(() => deskSheet('eastmadison'), /Pick a school/);
});

test('pay period splits the month and payroll csv stays a dry run', () => {
  assert.deepEqual(payPeriod('2026-11-27'), { start: '2026-11-16', end: '2026-11-30' });
  assert.deepEqual(payPeriod('2026-11-03'), { start: '2026-11-01', end: '2026-11-15' });
  const js = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../ui/staff.js'), 'utf8');
  for (const task of DESK_TASKS) assert.ok(js.includes(task.title), task.title);
});

test('desk routes require staff and never charge or export to QuickBooks', async () => {
  const env = flags();
  const open = await call('/v1/desk/tasks?locationId=waunakee', env);
  assert.equal(open.status, 401);

  const family = await call('/v1/desk/tasks?locationId=eastmad', env, { token: token('guardian') });
  assert.equal(family.status, 403);

  const sheet = await call('/v1/desk/tasks?locationId=verona', env, { token: token('staff') });
  assert.equal(sheet.status, 200);
  assert.equal(sheet.json.charges, false);
  assert.equal(sheet.json.qbo, '0');
  assert.equal(sheet.json.tasks.length, 18);

  const done = await call('/v1/desk/tasks', env, {
    method: 'POST',
    token: token('staff'),
    body: { action: 'complete', locationId: 'verona', taskId: 'open-door', initials: 'am' },
  });
  assert.equal(done.status, 200);
  assert.equal(done.json.done, true);
  assert.equal(done.json.initials, 'AM');
  assert.equal(done.json.charges, false);

  const extra = await call('/v1/desk/tasks', env, {
    method: 'POST',
    token: token('staff'),
    body: { action: 'add', locationId: 'deforest', phase: 'mid', title: 'Sweep the entry mat', initials: 'BG' },
  });
  assert.equal(extra.status, 201);
  assert.equal(extra.json.oneOff, true);
  assert.equal(extra.json.persisted, false);
  assert.equal(extra.json.charges, false);

  const phone = await call('/v1/desk/tasks', env, {
    method: 'POST',
    token: token('staff'),
    body: { action: 'add', locationId: 'waunakee', phase: 'opening', title: 'Call the desk', initials: 'AM', phone: '555' },
  });
  assert.equal(phone.status, 400);

  const clocked = await call('/v1/desk/clock', env, {
    method: 'POST',
    token: token('staff'),
    body: { action: 'in', locationId: 'goninjaW', initials: 'MS', at: '2026-11-27T14:00:00.000Z' },
  });
  assert.equal(clocked.status, 200);
  assert.equal(clocked.json.charges, false);
  assert.equal(clocked.json.qbo, '0');
  assert.equal(clocked.json.punch.outAt, null);

  const broke = await call('/v1/desk/clock', env, {
    method: 'POST',
    token: token('staff'),
    body: {
      action: 'break_start',
      locationId: 'goninjaW',
      initials: 'MS',
      at: '2026-11-27T16:00:00.000Z',
      punch: clocked.json.punch,
    },
  });
  assert.equal(broke.status, 200);
  assert.equal(broke.json.punch.onBreak, true);

  const back = await call('/v1/desk/clock', env, {
    method: 'POST',
    token: token('staff'),
    body: {
      action: 'break_end',
      locationId: 'goninjaW',
      initials: 'MS',
      at: '2026-11-27T16:15:00.000Z',
      punch: broke.json.punch,
    },
  });
  assert.equal(back.json.punch.onBreak, false);
  assert.equal(back.json.punch.breakMinutes, 15);

  const out = await call('/v1/desk/clock', env, {
    method: 'POST',
    token: token('staff'),
    body: {
      action: 'out',
      locationId: 'goninjaW',
      initials: 'MS',
      at: '2026-11-27T18:00:00.000Z',
      punch: back.json.punch,
    },
  });
  assert.equal(out.json.punch.outAt != null, true);
  assert.equal(out.json.minutes, 225);

  const payroll = await call('/v1/desk/payroll/preview', env, {
    method: 'POST',
    token: token('staff'),
    body: {
      locationId: 'goninjaW',
      asOf: '2026-11-27',
      rows: [{
        date: '2026-11-27',
        initials: 'MS',
        locationId: 'goninjaW',
        inAt: '2026-11-27T14:00:00.000Z',
        outAt: '2026-11-27T18:00:00.000Z',
        breakMinutes: 15,
      }],
    },
  });
  assert.equal(payroll.status, 200);
  assert.equal(payroll.json.submitted, false);
  assert.equal(payroll.json.charged, false);
  assert.equal(payroll.json.qbo, '0');
  assert.equal(payroll.json.dryRun, true);
  assert.match(payroll.json.csv, /Date,Initials,School/);
  assert.match(payroll.json.csv, /Go Ninja Waunakee/);
  assert.match(payroll.json.csv, /QuickBooks was not updated/);
  assert.equal(payroll.json.csv.includes('tel:'), false);
  assert.equal(payroll.json.rows[0].hours, '3.75');

  const blocked = await call('/v1/desk/payroll/preview', flags({ QBO_ENABLED: '1' }), {
    method: 'POST',
    token: token('staff'),
    body: { locationId: 'waunakee', asOf: '2026-11-27', rows: [] },
  });
  assert.equal(blocked.status, 403);
  assert.equal(blocked.json.error.code, 'qbo_network_disabled');
});

test('sandbox otp does not send mail and does not unlock routes unless sessions are allowed', async () => {
  const locked = flags({ CRM_ALLOW_LOCAL_TOKENS: '0' });
  const otp = await call('/v1/auth/otp', locked, { method: 'POST', body: { email: 'Riley.Sample@example.test' } });
  assert.equal(otp.status, 200);
  assert.equal(otp.json.sent, false);
  assert.equal(otp.json.delivery, '0');
  assert.equal(otp.json.charges, false);
  assert.equal(otp.json.previewCode, sandboxPreviewCode('riley.sample@example.test', SECRET));
  assert.equal(otp.json.token, undefined);

  const refused = await call('/v1/auth/session', locked, {
    method: 'POST',
    body: { email: 'riley.sample@example.test', code: otp.json.previewCode, desk: false },
  });
  assert.equal(refused.status, 403);
  assert.equal(refused.json.error.code, 'sessions_disabled');
  assert.equal(refused.json.token, undefined);

  const still = await call('/v1/members', locked, { token: token('staff') });
  assert.equal(still.status, 401);

  const session = await call('/v1/auth/session', flags(), {
    method: 'POST',
    body: { email: 'riley.sample@example.test', code: otp.json.previewCode, desk: true },
  });
  assert.equal(session.status, 200);
  assert.equal(session.json.charges, false);
  assert.equal(session.json.sent, false);
  assert.equal(session.json.delivery, '0');
  assert.equal(session.json.role, 'staff');

  const me = await call('/v1/me', flags(), { token: session.json.token });
  assert.equal(me.status, 200);
  assert.equal(me.json.email, 'riley.sample@example.test');
  assert.equal(me.json.canFinance, false);

  const family = await call('/v1/auth/session', flags(), {
    method: 'POST',
    body: { email: 'jordan.sample@example.test', code: sandboxPreviewCode('jordan.sample@example.test', SECRET) },
  });
  assert.equal(family.json.role, 'guardian');

  const bad = await call('/v1/auth/otp', flags({ AUTHORIZENET_MODE: 'live' }), {
    method: 'POST',
    body: { email: 'jordan.sample@example.test' },
  });
  assert.equal(bad.status, 403);
  assert.equal(bad.json.error.code, 'bad_mode');
});
