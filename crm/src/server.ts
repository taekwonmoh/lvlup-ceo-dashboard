import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { parseMembersCsv, type CimProfile, type LeadRow } from './gymdesk.ts';
import { migrate } from './migrate.ts';
import type { FirebaseTaskExport } from './tasks.ts';
import type { ScheduleExport } from './schedule.ts';
import { dispatchCrm, type CrmLoaders } from '../worker/src/routes.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export type App = {
  pool: pg.Pool;
  handle: (req: IncomingMessage, res: ServerResponse) => Promise<void>;
};

function readBody(req: IncomingMessage) {
  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function send(res: ServerResponse, status: number, body: unknown) {
  const raw = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(raw);
}

function nodeAllowsLocalTokens() {
  const flag = process.env.CRM_ALLOW_LOCAL_TOKENS;
  if (flag == null || flag === '') return true;
  return flag === '1';
}

function loaders(): CrmLoaders {
  return {
    async loadFixtures() {
      const [membersCsv, cimRaw, leadsRaw] = await Promise.all([
        readFile(join(root, 'fixtures/gymdesk-members.csv'), 'utf8'),
        readFile(join(root, 'fixtures/cim-profiles.json'), 'utf8'),
        readFile(join(root, 'fixtures/gymdesk-leads.json'), 'utf8'),
      ]);
      return {
        members: parseMembersCsv(membersCsv),
        profiles: (JSON.parse(cimRaw) as { profiles: CimProfile[] }).profiles,
        leads: (JSON.parse(leadsRaw) as { leads: LeadRow[] }).leads,
      };
    },
    async loadPlatformFixtures() {
      const [membersCsv, paymentsCsv, cimRaw, holdsRaw, waiversRaw] = await Promise.all([
        readFile(join(root, 'fixtures/platform/members.csv'), 'utf8'),
        readFile(join(root, 'fixtures/platform/payments.csv'), 'utf8'),
        readFile(join(root, 'fixtures/platform/cim-profiles.json'), 'utf8'),
        readFile(join(root, 'fixtures/platform/holds.json'), 'utf8'),
        readFile(join(root, 'fixtures/platform/waivers.json'), 'utf8'),
      ]);
      const cim = JSON.parse(cimRaw) as { profiles: CimProfile[] };
      const holds = JSON.parse(holdsRaw) as { holds: { memberId: string; startOn: string; endOn: string; reason: string }[] };
      const waivers = JSON.parse(waiversRaw) as { waivers: { memberId: string; version: string; signedOn: string }[] };
      return { membersCsv, paymentsCsv, profiles: cim.profiles, holds: holds.holds, waivers: waivers.waivers };
    },
    async loadTasks() {
      const raw = await readFile(join(root, 'fixtures/firebase-tasks.json'), 'utf8');
      return JSON.parse(raw) as FirebaseTaskExport;
    },
    async loadSchedule() {
      const raw = await readFile(join(root, 'fixtures/firebase-schedule.json'), 'utf8');
      return JSON.parse(raw) as ScheduleExport;
    },
  };
}

const fixtureLoaders = loaders();

export function createApp(pool: pg.Pool): App {
  async function handle(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url || '/', 'http://localhost');
    const result = await dispatchCrm({
      method: req.method || 'GET',
      url,
      authorization: String(req.headers.authorization || ''),
      readBody: () => readBody(req),
      pool,
      env: process.env,
      tokenSecret: process.env.CRM_TOKEN_SECRET || 'dev-only-secret',
      allowLocalTokens: nodeAllowsLocalTokens(),
      loaders: fixtureLoaders,
    });
    send(res, result.status, result.body);
  }
  return { pool, handle };
}

export async function start(port = 0) {
  const pool = new pg.Pool({ connectionString: process.env.CRM_DATABASE_URL });
  await migrate(pool);
  const app = createApp(pool);
  const server = createServer((req, res) => { app.handle(req, res).catch(err => { console.error(err); res.statusCode = 500; res.end(); }); });
  await new Promise<void>(resolve => server.listen(port, '127.0.0.1', () => resolve()));
  const addr = server.address();
  const got = typeof addr === 'object' && addr ? addr.port : port;
  return {
    url: 'http://127.0.0.1:' + got,
    pool,
    close: () => new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve())).then(() => pool.end()),
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  start(Number(process.env.PORT || 8787)).then(s => {
    console.log('CRM API ' + s.url + ' (sandbox, charges disabled)');
  });
}
