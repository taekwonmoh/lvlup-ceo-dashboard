import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import type pg from 'pg';
import { signToken } from '../src/auth.ts';
import {
  GOAL_PCT,
  answerGrowthQuestion,
  applySnapshots,
  attritionCsv,
  attritionPct,
  attritionReport,
  auditCells,
  cacCents,
  cacCsv,
  cacReport,
  cellsWithSpend,
  demoCells,
  parseSpendInput,
  pulseReport,
  retentionPct,
} from '../src/growth.ts';
import { resetGrowthMemory } from '../src/growth-routes.ts';
import { handleWorkerRequest, type CrmWorkerEnv } from '../worker/src/app.ts';

const root = dirname(fileURLToPath(import.meta.url));
const SECRET = 'test-only-secret';

function token(role: 'admin' | 'staff' | 'member', extra: Record<string, unknown> = {}) {
  return signToken({
    role,
    email: role + '@example.test',
    locationIds: ['waunakee', 'goninjaW'],
    familyIds: [],
    memberId: null,
    canFinance: role === 'admin',
    ...extra,
  }, SECRET);
}

function flags(): CrmWorkerEnv {
  return {
    AUTHORIZENET_MODE: 'sandbox',
    BILLING_CHARGES_ENABLED: '0',
    CRM_ALLOW_LOCAL_TOKENS: '1',
    CRM_TOKEN_SECRET: SECRET,
  };
}

function stubPool(query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number | null }>): pg.Pool {
  return { query, connect: async () => { throw new Error('connect unused'); } } as unknown as pg.Pool;
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
  return { status: res.status, json, text, type: res.headers.get('content-type') };
}

function memoryPool() {
  const spend: Array<Record<string, unknown>> = [];
  return stubPool(async (sql: string, params?: unknown[]) => {
    const text = String(sql);
    if (text.includes('insert into crm_marketing_spend')) {
      const [locationId, month, channel, amountCents] = params || [];
      const row = { location_id: locationId, month_key: month, channel, amount_cents: amountCents };
      const index = spend.findIndex(item => item.location_id === locationId && item.month_key === month && item.channel === channel);
      if (index >= 0) spend[index] = row;
      else spend.push(row);
      return { rows: [row], rowCount: 1 };
    }
    if (text.includes('from crm_marketing_spend')) return { rows: spend.slice(), rowCount: spend.length };
    if (text.includes('from crm_attrition_snapshots')) return { rows: [], rowCount: 0 };
    return { rows: [], rowCount: 0 };
  });
}

test('attrition is cancellations divided by starting active members', () => {
  assert.equal(auditCells(demoCells()).length, 0);
  assert.equal(attritionPct(3, 136), 2.2);
  assert.equal(retentionPct(2.2), 97.8);
  assert.equal(attritionPct(1, 0), null);
  assert.equal(cacCents(100, 0), null);
  assert.equal(GOAL_PCT, 3);

  const all = attritionReport('all', '2026-11');
  assert.equal(all.summary.startingActive, 482);
  assert.equal(all.summary.newEnrollments, 28);
  assert.equal(all.summary.cancellations, 17);
  assert.equal(all.summary.attritionPct, 3.5);
  assert.equal(all.summary.retentionPct, 96.5);
  assert.equal(all.summary.netGrowth, 11);
  assert.equal(all.summary.onTrack, false);
  assert.equal(all.bySchool.length, 6);
  assert.equal(all.trend.length, 6);
  assert.ok((all.trend[0].attritionPct || 0) > (all.trend[5].attritionPct || 0));

  const waunakee = all.bySchool.find(row => row.id === 'waunakee');
  assert.equal(waunakee?.attritionPct, 2.2);
  assert.equal(waunakee?.netGrowth, 4);
  assert.equal(waunakee?.onTrack, true);
  const forest = all.bySchool.find(row => row.id === 'deforest');
  assert.equal(forest?.name, 'LVLUP DeForest');
  assert.equal(forest?.attritionPct, 6.9);
  assert.equal(forest?.earlyDrop, true);
  assert.equal(forest?.reasons.find(row => row.id === 'cost')?.count, 2);
  assert.equal(forest?.reasons.find(row => row.id === 'lost_interest')?.count, 2);
  assert.equal(forest?.tenure.find(row => row.id === 'under3')?.count, 3);
  for (const school of all.bySchool) {
    assert.equal(school.reasons.reduce((sum, row) => sum + row.count, 0), school.cancellations);
    assert.equal(school.tenure.reduce((sum, row) => sum + row.count, 0), school.cancellations);
  }

  const csv = attritionCsv('all', '2026-11');
  assert.match(csv.split('\n')[0], /School,Month,Starting active/);
  assert.match(csv, /LVLUP DeForest,2026-11/);
  assert.match(csv, /<3 mo/);
});

test('CAC splits blended spend from paid ads and prices the channel funnel', () => {
  const all = cacReport('all', '2026-11');
  assert.equal(all.summary.spendCents, 1155000);
  assert.equal(all.summary.newMembers, 28);
  assert.equal(all.summary.blendedCacCents, 41250);
  assert.equal(all.summary.paidSpendCents, 1080000);
  assert.equal(all.summary.paidNewMembers, 13);
  assert.equal(all.summary.paidCacCents, 83077);
  assert.equal(all.summary.avgTuitionCents, 15768);
  assert.equal(all.summary.ltvCents, 236125);
  assert.equal(all.summary.ltvCacRatio, 5.7);
  assert.equal(all.summary.paybackMonths, 2.6);
  assert.equal(all.channels.find(row => row.id === 'referrals')?.spendCents, 0);
  assert.equal(all.channels.find(row => row.id === 'website')?.spendCents, 0);
  assert.equal(all.channels.find(row => row.id === 'events')?.paid, false);
  assert.equal(all.channels.find(row => row.id === 'google')?.paid, true);

  const waunakee = cacReport('waunakee', '2026-11');
  assert.equal(waunakee.summary.blendedCacCents, 49286);
  assert.equal(waunakee.summary.paidCacCents, 80000);
  assert.equal(waunakee.channels.find(row => row.id === 'google')?.cacCents, 90000);

  const cleared = cellsWithSpend([
    { locationId: 'waunakee', month: '2026-11', channel: 'google', amountCents: 0 },
    { locationId: 'waunakee', month: '2026-11', channel: 'meta', amountCents: 0 },
  ]);
  const after = cacReport('waunakee', '2026-11', cleared);
  assert.equal(after.summary.paidSpendCents, 0);
  assert.equal(after.summary.paidCacCents, 0);
  assert.equal(after.summary.blendedCacCents, Math.round(25000 / 7));

  const pulse = pulseReport('all', '2026-11');
  assert.equal(pulse.rollup.attritionPct, 3.5);
  assert.equal(pulse.rollup.blendedCacCents, 41250);
  assert.equal(pulse.schools.length, 6);
  assert.equal(pulse.schools.find(row => row.id === 'goninjaV')?.name, 'Go Ninja Verona');

  const csv = cacCsv('all', '2026-11');
  assert.match(csv, /School,Month,Channel,Spend,Leads,Trials,New members,Cost per lead,Cost per trial,CAC/);
  assert.match(csv, /Google Ads,1800.00/);
  assert.equal(csv.includes('$0 belt'), false);

  assert.throws(() => parseSpendInput({ locationId: 'waunakee', month: '2026-11', channel: 'google', amountDollars: '-5' }), /dollar amount/);
  const parsed = parseSpendInput({ rows: [{ locationId: 'eastmad', month: '2026-11', channel: 'meta', amountDollars: '90.50' }] });
  assert.equal(parsed[0].amountCents, 9050);
});

test('a saved snapshot replaces counts and keeps the edited spend', () => {
  const base = demoCells();
  const next = applySnapshots(base, [{
    locationId: 'deforest',
    month: '2026-11',
    startingActive: 80,
    newEnrollments: 4,
    cancellations: 2,
    reasons: { schedule: 0, moving: 0, cost: 1, lost_interest: 1, medical: 0, other: 0 },
    tenure: { under3: 2, m3to6: 0, m6to12: 0, m12plus: 0 },
    channels: {
      google: { leads: 3, trials: 2, enrolled: 2 },
      meta: { leads: 2, trials: 1, enrolled: 1 },
      referrals: { leads: 1, trials: 1, enrolled: 1 },
      events: { leads: 1, trials: 0, enrolled: 0 },
      website: { leads: 1, trials: 0, enrolled: 0 },
    },
    tuitionCents: 16500,
  }]);
  const report = attritionReport('deforest', '2026-11', next);
  assert.equal(report.summary.attritionPct, 2.5);
  assert.equal(report.summary.netGrowth, 2);
  const cac = cacReport('deforest', '2026-11', next);
  assert.equal(cac.summary.newMembers, 4);
  assert.ok((cac.summary.spendCents || 0) > 0);
});

test('Ask LVLUP answers attrition, CAC, and the highest school in plain English', () => {
  const last = answerGrowthQuestion('What was our attrition rate last month?');
  assert.equal(last.month, '2026-10');
  assert.equal(last.topic, 'attrition');
  const october = attritionReport('all', '2026-10');
  assert.match(last.answer, new RegExp(october.summary.attritionPct!.toFixed(1) + '%'));
  assert.match(last.answer, /starting active members/);

  const now = answerGrowthQuestion('What is attrition this month?');
  assert.equal(now.month, '2026-11');
  assert.match(now.answer, /3\.5%/);

  const cac = answerGrowthQuestion('What is our CAC by school and channel?');
  assert.equal(cac.topic, 'cac');
  assert.match(cac.answer, /\$412\.50/);
  assert.match(cac.answer, /LVLUP Waunakee/);
  assert.match(cac.answer, /Google Ads/);
  assert.match(cac.answer, /Go Ninja Verona/);

  const high = answerGrowthQuestion('Which school has the highest attrition?');
  assert.match(high.answer, /LVLUP DeForest/);
  assert.match(high.answer, /6\.9%/);
  assert.match(high.answer, /under 3 months/);

  const why = answerGrowthQuestion('Why are students leaving?');
  assert.match(why.answer, /Schedule/);
  assert.match(why.answer, /Lost Interest/);
  assert.match(why.answer, /<3 mo/);

  const ltv = answerGrowthQuestion('What is our LTV to CAC ratio?');
  assert.match(ltv.answer, /5\.7 to 1/);
  assert.match(ltv.answer, /2\.6 months/);

  const named = answerGrowthQuestion('What is Go Ninja Verona attrition?');
  assert.equal(named.scope, 'goninjaV');
  assert.match(named.answer, /Go Ninja Verona/);
});

test('growth routes serve demo figures, CSV, and spend saves', async () => {
  resetGrowthMemory();
  const admin = token('admin');
  const pool = memoryPool();
  const attrition = await call('/v1/growth/attrition?scope=all&month=2026-11', { token: admin, pool });
  assert.equal(attrition.status, 200);
  assert.equal(attrition.json.summary.attritionPct, 3.5);
  assert.equal(attrition.json.fixture, true);
  assert.equal(attrition.json.charged, false);
  assert.equal(attrition.json.bySchool.length, 6);

  const csv = await call('/v1/growth/attrition.csv?scope=all&month=2026-11', { token: admin, pool });
  assert.equal(csv.status, 200);
  assert.match(csv.type || '', /text\/csv/);
  assert.match(csv.text, /LVLUP East Madison,2026-11/);

  const channelCsv = await call('/v1/growth/cac.csv?scope=all&month=2026-11', { token: admin, pool });
  assert.match(channelCsv.text, /Meta \/ Facebook Ads/);

  const saved = await call('/v1/growth/spend', {
    method: 'PUT',
    token: admin,
    pool,
    body: { locationId: 'waunakee', month: '2026-11', channel: 'google', amountCents: 360000 },
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.json.saved, true);
  assert.equal(saved.json.database, true);
  assert.equal(saved.json.charged, false);

  const cac = await call('/v1/growth/cac?scope=waunakee&month=2026-11', { token: admin, pool });
  assert.equal(cac.json.summary.blendedCacCents, Math.round((360000 + 140000 + 25000) / 7));
  assert.equal(cac.json.channels.find((row: { id: string }) => row.id === 'google').spendCents, 360000);

  const pulse = await call('/v1/growth/pulse?scope=all&month=2026-11', { token: admin, pool });
  assert.equal(pulse.json.schools.length, 6);
  assert.equal(pulse.json.rollup.attritionPct, 3.5);

  const ask = await call('/v1/growth/ask?q=' + encodeURIComponent('What was our attrition rate last month?') + '&scope=all', { token: admin, pool });
  assert.equal(ask.status, 200);
  assert.equal(ask.json.month, '2026-10');
  assert.match(ask.json.answer, /attrition/);

  const missing = await call('/v1/growth/attrition?scope=nowhere&month=2026-11', { token: admin, pool });
  assert.equal(missing.status, 404);

  const badMonth = await call('/v1/growth/attrition?scope=all&month=2019-01', { token: admin, pool });
  assert.equal(badMonth.status, 400);

  const staff = token('staff', { locationIds: ['waunakee'] });
  const scoped = await call('/v1/growth/attrition?scope=all&month=2026-11', { token: staff, pool });
  assert.equal(scoped.status, 200);
  assert.equal(scoped.json.partial, true);
  assert.equal(scoped.json.bySchool.length, 1);
  assert.equal(scoped.json.bySchool[0].id, 'waunakee');
  const outside = await call('/v1/growth/cac?scope=verona&month=2026-11', { token: staff, pool });
  assert.equal(outside.status, 403);
  const blocked = await call('/v1/growth/spend', {
    method: 'PUT',
    token: staff,
    pool,
    body: { locationId: 'verona', month: '2026-11', channel: 'meta', amountDollars: '10' },
  });
  assert.equal(blocked.status, 403);

  const guest = await call('/v1/growth/pulse?scope=all&month=2026-11', { pool });
  assert.equal(guest.status, 401);
  const member = await call('/v1/growth/pulse?scope=all&month=2026-11', { token: token('member'), pool });
  assert.equal(member.status, 403);
});

test('spend saves on this process when the spend table is missing', async () => {
  resetGrowthMemory();
  const pool = stubPool(async () => {
    const err = new Error('undefined table') as Error & { code?: string };
    err.code = '42P01';
    throw err;
  });
  const admin = token('admin');
  const before = await call('/v1/growth/cac?scope=goninjaW&month=2026-11', { token: admin, pool });
  assert.equal(before.json.database, false);
  const saved = await call('/v1/growth/spend', {
    method: 'PUT',
    token: admin,
    pool,
    body: { rows: [{ locationId: 'goninjaW', month: '2026-11', channel: 'meta', amountDollars: '700' }] },
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.json.database, false);
  const after = await call('/v1/growth/cac?scope=goninjaW&month=2026-11', { token: admin, pool });
  assert.equal(after.json.channels.find((row: { id: string }) => row.id === 'meta').spendCents, 70000);
  resetGrowthMemory();
});

test('the migration, preview bundle, and live dashboard stay apart', () => {
  const local = readFileSync(join(root, '../migrations/016_marketing_spend_attrition.sql'), 'utf8');
  const ordered = readFileSync(join(root, '../supabase/migrations/20261127000016_marketing_spend_attrition.sql'), 'utf8');
  const wrapped = readFileSync(join(root, '../supabase/migrations/016_marketing_spend_attrition.sql'), 'utf8');
  assert.equal(ordered, local);
  assert.match(wrapped, /to_regclass\('public\.locations'\)/);
  assert.ok(wrapped.includes(local.trim()));
  assert.match(local, /crm_marketing_spend enable row level security/);
  assert.match(local, /crm_attrition_snapshots enable row level security/);
  assert.match(local, /security_invoker = true/);
  assert.match(local, /revoke all on crm_marketing_spend, crm_attrition_snapshots from anon, authenticated/);
  assert.match(local, /Aggregates only/);

  const ui = readFileSync(join(root, '../ui/growth.js'), 'utf8');
  const sandbox: { LvlupGrowth?: { cacReport: typeof cacReport } } = {};
  vm.runInNewContext(ui, sandbox);
  assert.ok(sandbox.LvlupGrowth);
  assert.equal(sandbox.LvlupGrowth.cacReport('all', '2026-11').summary.blendedCacCents, cacReport('all', '2026-11').summary.blendedCacCents);

  const staff = readFileSync(join(root, '../ui/staff.js'), 'utf8');
  const view = readFileSync(join(root, '../ui/growth-view.js'), 'utf8');
  const html = readFileSync(join(root, '../preview/staff.html'), 'utf8');
  assert.match(staff, /Attrition & CAC/);
  assert.match(staff, /\/v1\/growth\/summary/);
  assert.match(staff, /\/v1\/growth\/spend/);
  assert.match(staff, /\/v1\/growth\/ask/);
  assert.match(view, /Owner Pulse/);
  assert.match(view, /Ask LVLUP CRM/);
  assert.match(view, /Download attrition CSV/);
  assert.match(view, /Download CAC CSV/);
  assert.match(view, /Monthly ad spend/);
  assert.match(html, /growth\.js/);
  assert.match(html, /growth-view\.js/);
  const index = readFileSync(join(root, '../../index.html'), 'utf8');
  assert.equal(index.includes('/v1/growth'), false);
  assert.equal(index.includes('crm_marketing_spend'), false);
  assert.equal(index.includes('growth-view.js'), false);
});
