import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { verifyToken, assertStaff, assertFinance, canSeeFamily, canSeeLocation, type Actor } from './auth.ts';
import { CrmError } from './errors.ts';
import { migrate } from './migrate.ts';
import { parseMembersCsv, type CimProfile, type LeadRow } from './gymdesk.ts';
import { buildChargeProfileRequest, buildGetCustomerProfileRequest, getCustomerProfile, submitCharge, type SandboxProfile } from './authorize.ts';
import { curriculumForRank, vimeoPlayerUrl } from './curriculum.ts';
import { activeCycle } from './cycles.ts';
import { financialReport, financialsSummary, scopeAllowed, schoolsInScope } from './financials.ts';
import { homeSummary, previewPaymentRetry } from './home.ts';
import { quoteBooking, type PromoCode } from './pricing.ts';
import { PROGRAMS, ranksForProgram, resolveRank } from './ranks.ts';
import {
  getFamily, getMember, importMembers, importSchedule, importTasks, latestImport,
  listMembers, listShifts, listTasks, loadCatalog, loadRedemptions, recordRedemptions, savePromo,
} from './store.ts';
import type { FirebaseTaskExport } from './tasks.ts';
import type { ScheduleExport } from './schedule.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SECRET = process.env.CRM_TOKEN_SECRET || 'dev-only-secret';

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

function actorFrom(req: IncomingMessage): Actor {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  return verifyToken(token, SECRET);
}

function memberView(row: Record<string, unknown>, actor: Actor) {
  const base = {
    id: row.id,
    familyId: row.family_id,
    locationId: row.location_id,
    firstName: row.first_name,
    lastName: row.last_name,
    status: row.status,
    planName: row.plan_name || null,
  };
  if (actor.role === 'member') return base;
  return {
    ...base,
    gymdeskMemberId: row.gymdesk_member_id || null,
    biller: row.biller || null,
    membershipStatus: row.membership_status || null,
    membershipId: row.membership_id || null,
    nextBillOn: row.next_bill_on || null,
    paidThroughOn: row.paid_through_on || null,
    amountCents: actor.role === 'guardian' || actor.role === 'admin' || actor.canFinance ? row.amount_cents || null : null,
    interval: row.interval || null,
  };
}

async function loadFixtures() {
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
}

export function createApp(pool: pg.Pool): App {
  const env = process.env;
  async function handle(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url || '/', 'http://localhost');
    try {
      if (req.method === 'GET' && url.pathname === '/v1/health') {
        send(res, 200, { ok: true, charges: false, mode: 'sandbox' });
        return;
      }
      const actor = actorFrom(req);
      const parts = url.pathname.split('/').filter(Boolean);

      if (req.method === 'GET' && url.pathname === '/v1/me') {
        send(res, 200, actor);
        return;
      }

      if (req.method === 'POST' && url.pathname === '/v1/imports/gymdesk') {
        assertStaff(actor);
        const fx = await loadFixtures();
        const summary = await importMembers(pool, fx.members, fx.profiles, fx.leads);
        send(res, 200, summary);
        return;
      }
      if (req.method === 'GET' && url.pathname === '/v1/imports/status') {
        assertStaff(actor);
        send(res, 200, { import: await latestImport(pool) });
        return;
      }

      if (req.method === 'GET' && url.pathname === '/v1/members') {
        const locationId = url.searchParams.get('locationId') || '';
        if (actor.role === 'guardian' || actor.role === 'member') {
          const rows = [];
          for (const familyId of actor.familyIds) {
            const fam = await getFamily(pool, familyId);
            for (const m of fam?.members || []) {
              const full = await getMember(pool, m.id);
              if (full && (!actor.memberId || actor.role !== 'member' || full.id === actor.memberId)) rows.push(full);
            }
          }
          send(res, 200, { members: rows.map(r => memberView(r, actor)) });
          return;
        }
        assertStaff(actor);
        if (locationId && !canSeeLocation(actor, locationId)) {
          send(res, 200, { members: [] });
          return;
        }
        const rows = await listMembers(pool, locationId || undefined);
        const visible = actor.role === 'admin' ? rows : rows.filter(r => canSeeLocation(actor, r.location_id));
        send(res, 200, { members: visible.map(r => memberView(r, actor)) });
        return;
      }

      if (req.method === 'GET' && parts[0] === 'v1' && parts[1] === 'members' && parts[2]) {
        const row = await getMember(pool, parts[2]);
        if (!row) { send(res, 404, { error: { code: 'not_found', message: 'Not found.' } }); return; }
        if (!canSeeFamily(actor, row.family_id) && !canSeeLocation(actor, row.location_id)) {
          send(res, 404, { error: { code: 'not_found', message: 'Not found.' } });
          return;
        }
        if (actor.role === 'member' && actor.memberId !== row.id) {
          send(res, 404, { error: { code: 'not_found', message: 'Not found.' } });
          return;
        }
        send(res, 200, memberView(row, actor));
        return;
      }

      if (req.method === 'GET' && parts[0] === 'v1' && parts[1] === 'families' && parts[2]) {
        if (!canSeeFamily(actor, parts[2])) {
          send(res, 404, { error: { code: 'not_found', message: 'Not found.' } });
          return;
        }
        const fam = await getFamily(pool, parts[2]);
        if (!fam) { send(res, 404, { error: { code: 'not_found', message: 'Not found.' } }); return; }
        const members = actor.role === 'member'
          ? fam.members.filter((m: { id: string }) => m.id === actor.memberId)
          : fam.members;
        send(res, 200, {
          id: fam.id,
          displayName: fam.display_name,
          guardians: fam.guardians.map((g: { id: string; email: string; role: string }) => ({
            id: g.id, email: g.email, role: g.role,
          })),
          members,
        });
        return;
      }

      if (req.method === 'POST' && url.pathname === '/v1/quotes') {
        const body = JSON.parse(await readBody(req) || '{}');
        const catalog = await loadCatalog(pool);
        const redemptions = await loadRedemptions(pool);
        const quote = quoteBooking({
          listPriceCents: body.listPriceCents,
          on: body.on,
          locationId: body.locationId,
          brand: body.brand,
          eventType: body.eventType || null,
          eventId: body.eventId || null,
          sessionId: body.sessionId || null,
          buyer: body.buyer,
          familyId: body.familyId || null,
          memberId: body.memberId || null,
          codes: body.codes || [],
          catalog,
          redemptions,
        });
        send(res, 200, quote);
        return;
      }

      if (req.method === 'POST' && url.pathname === '/v1/promo-codes') {
        assertStaff(actor);
        const body = JSON.parse(await readBody(req) || '{}') as PromoCode;
        if (!body.code || !body.discountType) throw new CrmError(400, 'bad_code', 'code and discountType are required');
        const id = await savePromo(pool, body);
        send(res, 201, { id, code: body.code.toUpperCase() });
        return;
      }

      if (req.method === 'POST' && url.pathname === '/v1/promo-redemptions') {
        assertStaff(actor);
        const body = JSON.parse(await readBody(req) || '{}');
        const catalog = await loadCatalog(pool);
        const redemptions = await loadRedemptions(pool);
        const quote = quoteBooking({ ...body, catalog, redemptions });
        await recordRedemptions(pool, quote.applied.map(a => ({
          code: a.code,
          familyId: body.familyId || null,
          memberId: body.memberId || null,
          bookingId: body.bookingId || null,
          chargeId: body.chargeId || null,
          discountCents: a.discountCents,
        })));
        send(res, 201, quote);
        return;
      }

      if (req.method === 'POST' && url.pathname === '/v1/payment-profiles/lookup') {
        assertStaff(actor);
        const body = JSON.parse(await readBody(req) || '{}');
        const fx = await loadFixtures();
        const sandbox: SandboxProfile[] = fx.profiles.filter(p => p.paymentProfileId).map(p => ({
          customerProfileId: p.customerProfileId,
          merchantCustomerId: p.merchantCustomerId,
          paymentProfiles: [{ customerPaymentProfileId: p.paymentProfileId!, brand: p.brand || '', last4: p.last4 || '' }],
        }));
        const shape = buildGetCustomerProfileRequest({
          apiLoginId: 'sandbox-login',
          customerProfileId: body.customerProfileId,
        });
        const profile = getCustomerProfile(env, sandbox, body.customerProfileId);
        send(res, 200, { request: shape, profile });
        return;
      }

      if (req.method === 'POST' && url.pathname === '/v1/charges/preview') {
        const body = JSON.parse(await readBody(req) || '{}');
        if (actor.role !== 'admin' && !actor.canFinance) throw new CrmError(403, 'forbidden', 'Finance access required.');
        const request = buildChargeProfileRequest({
          apiLoginId: 'sandbox-login',
          customerProfileId: body.customerProfileId,
          paymentProfileId: body.paymentProfileId,
          amountCents: body.amountCents,
          invoiceNumber: body.invoiceNumber,
        });
        try { submitCharge(); }
        catch (err) {
          if (err instanceof CrmError && err.code === 'charges_disabled') {
            send(res, 200, { submitted: false, request });
            return;
          }
          throw err;
        }
        return;
      }

      if (req.method === 'POST' && url.pathname === '/v1/tasks/import') {
        assertStaff(actor);
        const raw = await readFile(join(root, 'fixtures/firebase-tasks.json'), 'utf8');
        const n = await importTasks(pool, JSON.parse(raw) as FirebaseTaskExport);
        send(res, 200, { imported: n });
        return;
      }
      if (req.method === 'GET' && url.pathname === '/v1/tasks') {
        assertStaff(actor);
        send(res, 200, { completions: await listTasks(pool, url.searchParams.get('staff') || undefined) });
        return;
      }

      if (req.method === 'POST' && url.pathname === '/v1/staff-schedule/import') {
        assertStaff(actor);
        const raw = await readFile(join(root, 'fixtures/firebase-schedule.json'), 'utf8');
        const summary = await importSchedule(pool, JSON.parse(raw) as ScheduleExport);
        send(res, 200, summary);
        return;
      }
      if (req.method === 'GET' && url.pathname === '/v1/ranks') {
        assertStaff(actor);
        const program = url.searchParams.get('program') || '';
        send(res, 200, {
          programs: PROGRAMS,
          ranks: program ? ranksForProgram(program) : ranksForProgram('songahm').concat(ranksForProgram('tiger'), ranksForProgram('mini_tiger'), ranksForProgram('goninja'), ranksForProgram('legacy'), ranksForProgram('ata_instructor'), ranksForProgram('mpk')),
        });
        return;
      }
      if (req.method === 'GET' && url.pathname === '/v1/ranks/resolve') {
        assertStaff(actor);
        const resolved = resolveRank(url.searchParams.get('program') || '', url.searchParams.get('name') || '');
        if (!resolved) { send(res, 404, { error: { code: 'not_found', message: 'No matching rank in that program.' } }); return; }
        send(res, 200, resolved);
        return;
      }
      if (req.method === 'GET' && url.pathname === '/v1/cycles/active') {
        assertStaff(actor);
        send(res, 200, activeCycle(url.searchParams.get('asOf') || '2026-11-24'));
        return;
      }
      if (req.method === 'GET' && url.pathname === '/v1/curriculum') {
        assertStaff(actor);
        const overlays = (url.searchParams.get('overlays') || '').split(',').map(s => s.trim()).filter(Boolean);
        const found = curriculumForRank({
          program: url.searchParams.get('program') || '',
          rank: url.searchParams.get('rank') || '',
          asOf: url.searchParams.get('asOf') || '2026-11-24',
          locationId: url.searchParams.get('locationId'),
          overlays: overlays as Array<'legacy' | 'competition' | 'xma' | 'go_ninja'>,
        });
        if (!found) { send(res, 404, { error: { code: 'not_found', message: 'No curriculum for that program and rank.' } }); return; }
        send(res, 200, {
          ...found,
          sections: found.sections.map(section => ({
            ...section,
            lessons: section.lessons.map(lesson => ({
              ...lesson,
              playerUrl: lesson.vimeoId ? vimeoPlayerUrl(lesson.vimeoId) : null,
            })),
          })),
        });
        return;
      }
      if (req.method === 'GET' && url.pathname === '/v1/home/summary') {
        assertStaff(actor);
        try {
          send(res, 200, homeSummary(url.searchParams.get('scope') || 'all', url.searchParams.get('asOf') || '2026-11-24'));
        } catch (err) {
          send(res, 404, { error: { code: 'not_found', message: err instanceof Error ? err.message : 'Unknown scope.' } });
        }
        return;
      }
      if (req.method === 'GET' && (url.pathname === '/v1/financials/summary' || (parts[0] === 'v1' && parts[1] === 'financials' && parts[2] === 'reports' && parts[3]))) {
        assertFinance(actor);
        const scope = url.searchParams.get('scope') || 'all';
        try { schoolsInScope(scope); }
        catch (err) {
          send(res, 404, { error: { code: 'not_found', message: err instanceof Error ? err.message : 'Unknown scope.' } });
          return;
        }
        if (!scopeAllowed(actor, scope)) throw new CrmError(403, 'forbidden', 'That scope is outside your schools.');
        const query = {
          scope,
          period: (url.searchParams.get('period') || 'month') as 'month' | 'last' | 'ytd' | 'custom',
          asOf: url.searchParams.get('asOf') || '2026-11-24',
          compare: (url.searchParams.get('compare') || 'prev_month') as 'none' | 'prev_month' | 'prev_year',
          from: url.searchParams.get('from') || undefined,
          through: url.searchParams.get('through') || undefined,
        };
        try {
          if (parts[2] === 'reports') {
            send(res, 200, financialReport(parts[3], query));
          } else {
            send(res, 200, financialsSummary(query));
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unknown report.';
          const missing = /Unknown report/.test(message);
          send(res, missing ? 404 : 500, { error: { code: missing ? 'not_found' : 'error', message } });
        }
        return;
      }
      if (req.method === 'POST' && url.pathname === '/v1/payments/retry-preview') {
        assertStaff(actor);
        const body = JSON.parse(await readBody(req) || '{}');
        send(res, 200, previewPaymentRetry(String(body.invoiceId || '')));
        return;
      }

      if (req.method === 'GET' && url.pathname === '/v1/staff-schedule') {
        assertStaff(actor);
        const shifts = await listShifts(pool, url.searchParams.get('staff') || undefined);
        const minutes = shifts.reduce((s, sh) => {
          const [shH, shM] = String(sh.start_local).slice(0, 5).split(':').map(Number);
          const [eh, em] = String(sh.end_local).slice(0, 5).split(':').map(Number);
          return s + ((eh * 60 + em) - (shH * 60 + shM));
        }, 0);
        send(res, 200, { shifts, scheduledMinutes: minutes });
        return;
      }

      send(res, 404, { error: { code: 'not_found', message: 'Not found.' } });
    } catch (err) {
      if (err instanceof CrmError) {
        send(res, err.status, { error: { code: err.code, message: err.message } });
        return;
      }
      const message = err instanceof Error ? err.message : 'error';
      const status = /unknown code|does not apply|cannot be combined|used up|expired|not active|current members|new customers/i.test(message) ? 422 : 500;
      if (status === 500) console.error(err);
      send(res, status, { error: { code: status === 422 ? 'invalid_code' : 'error', message } });
    }
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
