import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { signToken } from '../src/auth.ts';
import { handleWorkerRequest, type CrmWorkerEnv } from '../worker/src/app.ts';
import { resolveDatabase } from '../worker/src/db.ts';
import { redactText } from '../worker/src/redact.ts';

const SECRET = 'test-only-secret';
const HYPER_URL = 'postgres://crm:hyper-should-not-leak@127.0.0.1:1/crm';
const DIRECT_URL = 'postgres://crm:direct-should-not-leak@127.0.0.1:1/crm';

function token(role: 'admin' | 'staff' | 'guardian' | 'member', extra: Record<string, unknown> = {}) {
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

function stubPool(query: (sql: string) => Promise<{ rows: unknown[]; rowCount: number | null }>): pg.Pool {
  return { query, connect: async () => { throw new Error('connect unused'); } } as unknown as pg.Pool;
}

function flags(extra: Partial<CrmWorkerEnv> = {}): CrmWorkerEnv {
  return {
    AUTHORIZENET_MODE: 'sandbox',
    BILLING_CHARGES_ENABLED: '0',
    QBO_ENABLED: '0',
    AUTOMATION_DELIVERY_ENABLED: '0',
    PUSH_DELIVERY_ENABLED: '0',
    WEBHOOK_DELIVERY_ENABLED: '0',
    CRM_ALLOW_LOCAL_TOKENS: '0',
    FIREBASE_PROJECT_ID: 'lvlup-members-app',
    ...extra,
  };
}

async function call(path: string, env: CrmWorkerEnv, init: { method?: string; token?: string; body?: unknown; pool?: pg.Pool | null } = {}) {
  const res = await handleWorkerRequest(new Request('https://crm.test' + path, {
    method: init.method || 'GET',
    headers: {
      ...(init.token ? { authorization: 'Bearer ' + init.token } : {}),
      'content-type': 'application/json',
    },
    body: init.body == null ? undefined : JSON.stringify(init.body),
  }), env, undefined, { pool: init.pool === undefined ? null : init.pool });
  const text = await res.text();
  let json: any = {};
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  return { status: res.status, json, text };
}

function assertClean(text: string) {
  assert.equal(text.includes('should-not-leak'), false);
  assert.equal(/postgres(?:ql)?:\/\//i.test(text), false);
  assert.equal(text.includes(SECRET), false);
}

test('redactText removes urls and known secrets', () => {
  const cleaned = redactText('down ' + HYPER_URL + ' password=hunter2secret', [HYPER_URL]);
  assert.equal(cleaned.includes('should-not-leak'), false);
  assert.equal(cleaned.includes('hunter2secret'), false);
  assert.match(cleaned, /\[redacted\]/);
});

test('Hyperdrive wins over DATABASE_URL and health probes SELECT 1', async () => {
  assert.equal(resolveDatabase({ HYPERDRIVE: { connectionString: HYPER_URL }, DATABASE_URL: DIRECT_URL }).via, 'hyperdrive');
  assert.equal(resolveDatabase({ DATABASE_URL: DIRECT_URL }).via, 'database_url');
  assert.equal(resolveDatabase({}).via, 'none');

  let sql = '';
  const pool = stubPool(async (text: string) => {
    sql = text;
    return { rows: [{ '?column?': 1 }], rowCount: 1 } as any;
  });
  const res = await call('/v1/health', flags({
    HYPERDRIVE: { connectionString: HYPER_URL },
    DATABASE_URL: DIRECT_URL,
  }), { pool });
  assert.equal(res.status, 200);
  assert.equal(res.json.ok, true);
  assert.equal(res.json.sandbox, true);
  assert.equal(res.json.dryRun, true);
  assert.equal(res.json.charges, false);
  assert.equal(res.json.qbo, false);
  assert.equal(res.json.mode, 'sandbox');
  assert.equal(res.json.automationDelivery, '0');
  assert.equal(res.json.pushDelivery, '0');
  assert.equal(res.json.webhookDelivery, '0');
  assert.deepEqual(res.json.db, { configured: true, via: 'hyperdrive', connected: true });
  assert.equal(sql, 'SELECT 1');
  assertClean(res.text);
});

test('health reports an unreachable database without credentials', async () => {
  const pool = stubPool(async () => { throw new Error('connect ' + HYPER_URL + ' password=hunter2secret'); });
  const res = await call('/v1/health', flags({ HYPERDRIVE: { connectionString: HYPER_URL } }), { pool });
  assert.equal(res.status, 200);
  assert.deepEqual(res.json.db, { configured: true, via: 'hyperdrive', connected: false });
  assertClean(res.text);
  assert.equal(res.text.includes('hunter2secret'), false);
});

test('health with no database does not query', async () => {
  let queries = 0;
  const pool = stubPool(async () => { queries += 1; return { rows: [], rowCount: 0 } as any; });
  const res = await call('/v1/health', flags(), { pool });
  assert.equal(queries, 0);
  assert.deepEqual(res.json.db, { configured: false, via: 'none', connected: false });
  assert.equal(res.json.billingFlag, '0');
  assert.equal(res.json.configuredAutomationDelivery, '0');
});

test('local tokens stay off unless CRM_ALLOW_LOCAL_TOKENS is 1', async () => {
  const staff = token('staff');
  const denied = await call('/v1/me', flags({ CRM_TOKEN_SECRET: SECRET }), { token: staff });
  assert.equal(denied.status, 401);
  assert.equal(denied.json.error.code, 'unauthorized');
  assertClean(denied.text);

  const allowed = await call('/v1/me', flags({ CRM_ALLOW_LOCAL_TOKENS: '1', CRM_TOKEN_SECRET: SECRET }), { token: staff });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.json.email, 'staff@example.test');
  assert.equal(allowed.json.role, 'staff');
  assertClean(allowed.text);
});

test('ranks, quotes, charges, and a public platform route use the shared handlers', async () => {
  const env = flags({ CRM_ALLOW_LOCAL_TOKENS: '1', CRM_TOKEN_SECRET: SECRET });
  const staff = token('staff');
  const ranks = await call('/v1/ranks?program=songahm', env, { token: staff });
  assert.equal(ranks.status, 200);
  assert.ok(ranks.json.ranks.length > 0);
  assert.ok(ranks.json.programs.some((program: { code: string }) => program.code === 'songahm'));

  const pool = stubPool(async (sql: string) => {
    const text = String(sql);
    if (text.includes('party_packages')) {
      return { rows: [{ id: 'pkg', name: 'Party', duration_min: 60, price_cents: 2500, deposit_cents: 500 }], rowCount: 1 } as any;
    }
    if (text.includes('party_addons')) return { rows: [], rowCount: 0 } as any;
    return { rows: [], rowCount: 0 } as any;
  });
  const quote = await call('/v1/quotes', env, {
    method: 'POST',
    token: staff,
    pool,
    body: {
      listPriceCents: 5000,
      on: '2026-11-21',
      locationId: 'waunakee',
      brand: 'lvlup',
      eventType: 'clinic',
      buyer: 'member',
      codes: [],
    },
  });
  assert.equal(quote.status, 200);
  assert.equal(quote.json.dueCents, 5000);
  assert.equal(quote.json.discountCents, 0);

  const preview = await call('/v1/charges/preview', env, {
    method: 'POST',
    token: token('admin'),
    body: { customerProfileId: '1', paymentProfileId: '2', amountCents: 1000, invoiceNumber: 'draft' },
  });
  assert.equal(preview.status, 200);
  assert.equal(preview.json.submitted, false);

  const packages = await call('/v1/public/goninja/packages?locationId=goninjaW', flags(), { pool });
  assert.equal(packages.status, 200);
  assert.equal(packages.json.packages[0].name, 'Party');

  const phone = await call('/v1/public/trials', flags(), { method: 'POST', pool, body: { phone: 'not-collected' } });
  assert.equal(phone.status, 400);
  assert.equal(phone.json.error.code, 'phone_not_accepted');
});

test('a database error never echoes the connection string', async () => {
  const env = flags({
    CRM_ALLOW_LOCAL_TOKENS: '1',
    CRM_TOKEN_SECRET: SECRET,
    HYPERDRIVE: { connectionString: HYPER_URL },
  });
  const pool = stubPool(async () => { throw new Error('query failed ' + HYPER_URL); });
  const res = await call('/v1/imports/status', env, { token: token('staff'), pool });
  assert.equal(res.status, 500);
  assert.equal(res.json.error.message, 'Request failed.');
  assertClean(res.text);
});

test('routes that need Postgres report the database is unavailable', async () => {
  const res = await call('/v1/members', flags({ CRM_ALLOW_LOCAL_TOKENS: '1', CRM_TOKEN_SECRET: SECRET }), { token: token('staff') });
  assert.equal(res.status, 503);
  assert.equal(res.json.error.code, 'database_unavailable');
  assert.equal(res.json.error.code === 'not_deployed', false);
  const missing = await call('/v1/does-not-exist', flags({ CRM_ALLOW_LOCAL_TOKENS: '1', CRM_TOKEN_SECRET: SECRET }), { token: token('staff') });
  assert.equal(missing.status, 404);
  assert.equal(missing.json.error.code, 'not_found');
});

test('wrangler config binds Hyperdrive by id and keeps the sandbox defaults', () => {
  const root = dirname(fileURLToPath(import.meta.url));
  const raw = readFileSync(join(root, '../worker/wrangler.jsonc'), 'utf8');
  const stripped = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const config = JSON.parse(stripped);
  assert.equal(config.name, 'lvlup-crm-api');
  assert.equal(config.workers_dev, true);
  assert.deepEqual(config.hyperdrive, [{
    binding: 'HYPERDRIVE',
    id: 'd711e181a6bb4f869ca9ac79f69382f7',
  }]);
  assert.equal(config.routes, undefined);
  assert.equal(config.route, undefined);
  assert.equal(/"pattern"\s*:/.test(stripped), false);
  assert.equal(config.vars.AUTHORIZENET_MODE, 'sandbox');
  assert.equal(config.vars.BILLING_CHARGES_ENABLED, '0');
  assert.equal(config.vars.QBO_ENABLED, '0');
  assert.equal(config.vars.AUTOMATION_DELIVERY_ENABLED, '0');
  assert.equal(config.vars.PUSH_DELIVERY_ENABLED, '0');
  assert.equal(config.vars.WEBHOOK_DELIVERY_ENABLED, '0');
  assert.equal(config.vars.CRM_ALLOW_LOCAL_TOKENS, '0');
  assert.equal(config.vars.FIREBASE_PROJECT_ID, 'lvlup-members-app');
  assert.ok(config.compatibility_flags.includes('nodejs_compat'));
  assert.equal(/postgres(?:ql)?:\/\//i.test(raw), false);
});
