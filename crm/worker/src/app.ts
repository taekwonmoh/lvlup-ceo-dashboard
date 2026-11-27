/**
 * Worker fetch adapter. Builds a pg pool from Hyperdrive or DATABASE_URL and
 * dispatches the shared CRM routes. Connection strings stay in this module.
 */
import type pg from 'pg';
import { createCrmPool, probePool, resolveDatabase, type DbStatus } from './db.ts';
import { sanitizeJson, secretValues } from './redact.ts';
import { dispatchCrm, unconfiguredPool, type CrmLoaders, type CrmRuntimeEnv } from './routes.ts';

export type CrmWorkerEnv = CrmRuntimeEnv & {
  DATABASE_URL?: string;
  HYPERDRIVE?: { connectionString?: string } | null;
};

export type WorkerContext = {
  waitUntil?: (promise: Promise<unknown>) => void;
};

export type WorkerDeps = {
  pool?: pg.Pool | null;
  loaders?: CrmLoaders;
  createPool?: (connectionString: string) => pg.Pool;
  probe?: (pool: pg.Pool) => Promise<boolean>;
};

const MAX_BODY = 1_000_000;

function previewOrigin(origin: string) {
  return origin === 'https://staff.lvlupma.com' || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('origin') || '';
  if (!previewOrigin(origin)) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET, POST, PATCH, PUT, OPTIONS',
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-max-age': '600',
    vary: 'Origin',
  };
}

function withCors(response: Response, request: Request) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders(request))) headers.set(key, value);
  return new Response(response.body, { status: response.status, headers });
}

function json(status: number, body: unknown, secrets: string[]) {
  return Response.json(sanitizeJson(body, secrets), {
    status,
    headers: { 'cache-control': 'no-store' },
  });
}

function handlerEnv(env: CrmWorkerEnv): CrmRuntimeEnv {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (typeof value !== 'string') continue;
    if (key === 'DATABASE_URL') continue;
    if (/postgres(?:ql)?:\/\//i.test(value)) continue;
    out[key] = value;
  }
  return out;
}

export function healthBody(env: CrmWorkerEnv, db: DbStatus) {
  const mode = (env.AUTHORIZENET_MODE || 'sandbox').toLowerCase();
  return {
    ok: true,
    charges: false,
    qbo: false,
    qboSync: false,
    sandbox: mode !== 'live',
    dryRun: true,
    mode: env.AUTHORIZENET_MODE || 'sandbox',
    billingFlag: env.BILLING_CHARGES_ENABLED || '0',
    qboFlag: env.QBO_ENABLED || '0',
    qboSyncFlag: env.QBO_SYNC_ENABLED || '0',
    automationDelivery: '0',
    pushDelivery: '0',
    webhookDelivery: '0',
    configuredAutomationDelivery: env.AUTOMATION_DELIVERY_ENABLED || '0',
    configuredPushDelivery: env.PUSH_DELIVERY_ENABLED || '0',
    configuredWebhookDelivery: env.WEBHOOK_DELIVERY_ENABLED || '0',
    intendedHost: 'api.lvlupma.com',
    db,
  };
}

async function closePool(pool: pg.Pool, ctx?: WorkerContext) {
  if (typeof pool.end !== 'function') return;
  const done = Promise.resolve(pool.end()).catch(() => undefined);
  if (ctx?.waitUntil) ctx.waitUntil(done);
  else await done;
}

export async function handleWorkerRequest(request: Request, env: CrmWorkerEnv, ctx?: WorkerContext, deps: WorkerDeps = {}): Promise<Response> {
  const secrets = secretValues(env);
  const url = new URL(request.url);
  const source = resolveDatabase(env);
  let pool: pg.Pool;
  let owns = false;
  if (deps.pool) {
    pool = deps.pool;
  } else if (source.connectionString) {
    try {
      pool = (deps.createPool || createCrmPool)(source.connectionString);
      owns = true;
    } catch {
      pool = unconfiguredPool();
    }
  } else {
    pool = unconfiguredPool();
  }

  try {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }
    if (request.method === 'GET' && url.pathname === '/v1/health') {
      let connected = false;
      if (source.via !== 'none') {
        try {
          connected = await (deps.probe || probePool)(pool);
        } catch {
          connected = false;
        }
        if (!connected) console.error(JSON.stringify({ event: 'db_probe_failed', connected: false }));
      }
      const db: DbStatus = { configured: source.via !== 'none', via: source.via, connected };
      return withCors(json(200, healthBody(env, db), secrets), request);
    }

    let cached: string | null = null;
    const readBody = async () => {
      if (cached == null) {
        cached = await request.text();
        if (cached.length > MAX_BODY) {
          const err = new Error('Request body is too large.') as Error & { code?: string };
          err.code = 'body_too_large';
          throw err;
        }
      }
      return cached;
    };
    const allowLocalTokens = env.CRM_ALLOW_LOCAL_TOKENS === '1';
    const result = await dispatchCrm({
      method: request.method,
      url,
      authorization: request.headers.get('authorization') || '',
      readBody,
      pool,
      env: handlerEnv(env),
      tokenSecret: allowLocalTokens ? (env.CRM_TOKEN_SECRET || '') : '',
      allowLocalTokens,
      loaders: deps.loaders,
      redact: true,
      secrets,
    });
    if (result.text != null) {
      return withCors(new Response(result.text, {
        status: result.status,
        headers: { 'content-type': result.contentType || 'text/csv; charset=utf-8', 'cache-control': 'no-store' },
      }), request);
    }
    return withCors(json(result.status, result.body, secrets), request);
  } finally {
    if (owns) await closePool(pool, ctx);
  }
}
