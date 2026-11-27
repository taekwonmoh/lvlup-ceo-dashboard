/**
 * CRM /v1 dispatcher shared by the Node server and the Cloudflare Worker.
 * SQL and validators stay in crm/src. This file only routes.
 */
import type pg from 'pg';
import { verifyToken, assertStaff, assertFinance, canSeeFamily, canSeeLocation, type Actor } from '../../src/auth.ts';
import { CrmError } from '../../src/errors.ts';
import type { CimProfile, LeadRow, MemberRow } from '../../src/gymdesk.ts';
import { buildChargeProfileRequest, buildGetCustomerProfileRequest, getCustomerProfile, submitCharge, type SandboxProfile } from '../../src/authorize.ts';
import { curriculumForRank, vimeoPlayerUrl } from '../../src/curriculum.ts';
import { activeCycle } from '../../src/cycles.ts';
import { financialReport, financialsSummary, scopeAllowed, schoolsInScope } from '../../src/financials.ts';
import { handleQuickbooksHttp } from '../../src/qbo-export-routes.ts';
import { homeSummary, previewPaymentRetry } from '../../src/home.ts';
import { quoteBooking, type PromoCode } from '../../src/pricing.ts';
import { PROGRAMS, ranksForProgram, resolveRank } from '../../src/ranks.ts';
import {
  getFamily, getMember, importMembers, importSchedule, importTasks, latestImport,
  listMembers, listShifts, listTasks, loadCatalog, loadRedemptions, recordRedemptions, savePromo,
} from '../../src/store.ts';
import type { FirebaseTaskExport } from '../../src/tasks.ts';
import type { ScheduleExport } from '../../src/schedule.ts';
import { handlePlatform, isAuthedPlatformPath, isPublicPlatformPath } from '../../src/platform-api.ts';
import type { StagingHold, StagingWaiver } from '../../src/import-job.ts';
import { handleWave1, isPublicWave1Path, isStaffWave1Path } from '../../src/wave1-routes.ts';
import { handleWave2, isStaffWave2Path, quoteProcessingFee } from '../../src/wave2-routes.ts';
import { handleProShop, isProShopPath, isPublicProShopPath } from '../../src/pro-shop.ts';
import { handleSandboxOtp, handleSandboxSession } from '../../src/sandbox-auth.ts';
import { handleDesk } from '../../src/desk.ts';
import { handleStudio } from '../../src/studio-ops.ts';
import { handleGrowth } from '../../src/growth-desk.ts';
import type { SqlPool } from '../../src/query.ts';
import { clientMessage } from './redact.ts';

export type DispatchResult = { status: number; body: unknown; text?: string; contentType?: string };

export type CrmRuntimeEnv = {
  AUTHORIZENET_MODE?: string;
  AUTHORIZENET_LIVE?: string;
  BILLING_CHARGES_ENABLED?: string;
  BILLING_CHARGE_SINK?: string;
  QBO_ENABLED?: string;
  QBO_SYNC_ENABLED?: string;
  AUTOMATION_DELIVERY_ENABLED?: string;
  PUSH_DELIVERY_ENABLED?: string;
  WEBHOOK_DELIVERY_ENABLED?: string;
  WATCHLIST_WEBHOOK_SECRET?: string;
  CRM_ALLOW_LOCAL_TOKENS?: string;
  CRM_TOKEN_SECRET?: string;
  FIREBASE_PROJECT_ID?: string;
};

export type CrmLoaders = {
  loadFixtures: () => Promise<{ members: MemberRow[]; profiles: CimProfile[]; leads: LeadRow[] }>;
  loadPlatformFixtures: () => Promise<{
    membersCsv: string;
    paymentsCsv: string;
    profiles: CimProfile[];
    holds: StagingHold[];
    waivers: StagingWaiver[];
  }>;
  loadTasks: () => Promise<FirebaseTaskExport>;
  loadSchedule: () => Promise<ScheduleExport>;
};

const DATABASE_UNCONFIGURED = 'database_unconfigured';

function unavailable(name: string): never {
  throw new CrmError(503, 'fixtures_unavailable', name + ' is not available on this host.');
}

const unavailableLoaders: CrmLoaders = {
  loadFixtures: () => unavailable('Fixture import'),
  loadPlatformFixtures: () => unavailable('Staging import'),
  loadTasks: () => unavailable('Task import'),
  loadSchedule: () => unavailable('Schedule import'),
};

export function unconfiguredPool(): pg.Pool {
  const fail = () => {
    const err = new Error('Database is unavailable.') as Error & { code?: string };
    err.code = DATABASE_UNCONFIGURED;
    return Promise.reject(err);
  };
  return { query: fail, connect: fail } as unknown as pg.Pool;
}

function isCode(err: unknown, code: string) {
  return !!err && typeof err === 'object' && (err as { code?: string }).code === code;
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

function actorFrom(authorization: string, tokenSecret: string, allowLocalTokens: boolean): Actor {
  if (!allowLocalTokens) throw new CrmError(401, 'unauthorized', 'Sign in required.');
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  return verifyToken(token, tokenSecret);
}

export async function dispatchCrm(input: {
  method: string;
  url: URL;
  authorization: string;
  readBody: () => Promise<string>;
  pool: pg.Pool;
  env: CrmRuntimeEnv;
  tokenSecret: string;
  allowLocalTokens: boolean;
  loaders?: CrmLoaders;
  redact?: boolean;
  secrets?: string[];
}): Promise<DispatchResult> {
  const { method, url, pool, env } = input;
  const loaders = input.loaders || unavailableLoaders;
  const secrets = input.secrets || [];
  const redact = input.redact === true;
  let bodyCache: Promise<string> | null = null;
  const readBody = () => {
    if (!bodyCache) bodyCache = input.readBody();
    return bodyCache;
  };
  const fail = (err: unknown) => {
    if (err instanceof CrmError) {
      return { status: err.status, body: { error: { code: err.code, message: clientMessage(err.message, secrets, redact) } } };
    }
    if (isCode(err, 'body_too_large')) {
      return { status: 413, body: { error: { code: 'body_too_large', message: 'Request body is too large.' } } };
    }
    if (isCode(err, DATABASE_UNCONFIGURED)) {
      return { status: 503, body: { error: { code: 'database_unavailable', message: 'Database is unavailable.' } } };
    }
    const raw = err instanceof Error ? err.message : 'error';
    const message = clientMessage(raw, secrets, redact);
    const status = /unknown code|does not apply|cannot be combined|used up|expired|not active|current members|new customers/i.test(message) ? 422 : 500;
    if (status === 500) {
      if (redact) console.error(JSON.stringify({ code: 'error', message }));
      else console.error(err);
    }
    return { status, body: { error: { code: status === 422 ? 'invalid_code' : 'error', message } } };
  };

  try {
    if (method === 'GET' && url.pathname === '/v1/health') {
      return {
        status: 200,
        body: {
          ok: true,
          charges: false,
          mode: 'sandbox',
          automationDelivery: '0',
          pushDelivery: '0',
          webhookDelivery: '0',
        },
      };
    }
    const parts = url.pathname.split('/').filter(Boolean);
    const readJson = async () => {
      if (method === 'GET' || method === 'HEAD') return {} as Record<string, unknown>;
      const text = await readBody() || '';
      if (!text) return {} as Record<string, unknown>;
      try { return JSON.parse(text) as Record<string, unknown>; }
      catch { throw new CrmError(400, 'bad_json', 'Send JSON.'); }
    };
    if (isPublicProShopPath(method, parts)) {
      return await handleProShop({
        method,
        parts,
        search: url.searchParams,
        actor: null,
        body: {},
        pool: pool as unknown as SqlPool,
        env,
      });
    }
    if (isPublicWave1Path(method, parts)) {
      return await handleWave1({
        method,
        parts,
        search: url.searchParams,
        actor: null,
        body: await readJson(),
        pool: pool as unknown as SqlPool,
        env,
      });
    }
    const platformCtx = async (actor: Actor | null) => {
      const raw = method === 'GET' || method === 'HEAD' ? null : JSON.parse(await readBody() || '{}');
      return handlePlatform({
        method,
        parts,
        search: url.searchParams,
        actor,
        body: raw,
        pool,
        env,
        loadStaging: () => loaders.loadPlatformFixtures(),
      });
    };
    if (isPublicPlatformPath(parts)) {
      const result = await platformCtx(null);
      if (result) return result;
    }
    if (method === 'POST' && url.pathname === '/v1/auth/otp') {
      return handleSandboxOtp(await readJson(), env, input.tokenSecret);
    }
    if (method === 'POST' && url.pathname === '/v1/auth/session') {
      return handleSandboxSession(await readJson(), env, input.tokenSecret, input.allowLocalTokens);
    }
    const actor = actorFrom(input.authorization, input.tokenSecret, input.allowLocalTokens);
    if (isProShopPath(method, parts)) {
      return await handleProShop({
        method,
        parts,
        search: url.searchParams,
        actor,
        body: await readJson(),
        pool: pool as unknown as SqlPool,
        env,
      });
    }
    if (isStaffWave2Path(method, parts, url.searchParams)) {
      return await handleWave2({
        method,
        parts,
        search: url.searchParams,
        actor,
        body: await readJson(),
        pool: pool as unknown as SqlPool,
        env,
      });
    }
    if (isStaffWave1Path(method, parts, url.searchParams)) {
      return await handleWave1({
        method,
        parts,
        search: url.searchParams,
        actor,
        body: await readJson(),
        pool: pool as unknown as SqlPool,
        env,
      });
    }
    if (isAuthedPlatformPath(parts)) {
      const result = await platformCtx(actor);
      if (result) return result;
    }

    if (method === 'GET' && url.pathname === '/v1/me') {
      return { status: 200, body: actor };
    }
    if (parts[0] === 'v1' && parts[1] === 'desk') {
      return handleDesk({
        method,
        parts,
        search: url.searchParams,
        actor,
        body: await readJson(),
        env,
      });
    }
    if (parts[0] === 'v1' && parts[1] === 'studio' && parts[2] === 'growth') {
      return await handleGrowth({
        method,
        parts,
        search: url.searchParams,
        actor,
        body: await readJson(),
        pool: pool as unknown as SqlPool,
      });
    }
    if (parts[0] === 'v1' && parts[1] === 'studio') {
      return await handleStudio({
        method,
        parts,
        search: url.searchParams,
        actor,
        body: await readJson(),
        pool: pool as unknown as SqlPool,
      });
    }

    if (method === 'POST' && url.pathname === '/v1/imports/gymdesk') {
      assertStaff(actor);
      const fx = await loaders.loadFixtures();
      const summary = await importMembers(pool, fx.members, fx.profiles, fx.leads);
      return { status: 200, body: summary };
    }
    if (method === 'GET' && url.pathname === '/v1/imports/status') {
      assertStaff(actor);
      return { status: 200, body: { import: await latestImport(pool) } };
    }

    if (method === 'GET' && url.pathname === '/v1/members') {
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
        return { status: 200, body: { members: rows.map(r => memberView(r, actor)) } };
      }
      assertStaff(actor);
      if (locationId && !canSeeLocation(actor, locationId)) {
        return { status: 200, body: { members: [] } };
      }
      const rows = await listMembers(pool, locationId || undefined);
      const visible = actor.role === 'admin' ? rows : rows.filter(r => canSeeLocation(actor, r.location_id));
      return { status: 200, body: { members: visible.map(r => memberView(r, actor)) } };
    }

    if (method === 'GET' && parts[0] === 'v1' && parts[1] === 'members' && parts[2]) {
      const row = await getMember(pool, parts[2]);
      if (!row) return { status: 404, body: { error: { code: 'not_found', message: 'Not found.' } } };
      if (!canSeeFamily(actor, row.family_id) && !canSeeLocation(actor, row.location_id)) {
        return { status: 404, body: { error: { code: 'not_found', message: 'Not found.' } } };
      }
      if (actor.role === 'member' && actor.memberId !== row.id) {
        return { status: 404, body: { error: { code: 'not_found', message: 'Not found.' } } };
      }
      return { status: 200, body: memberView(row, actor) };
    }

    if (method === 'GET' && parts[0] === 'v1' && parts[1] === 'families' && parts[2]) {
      if (!canSeeFamily(actor, parts[2])) {
        return { status: 404, body: { error: { code: 'not_found', message: 'Not found.' } } };
      }
      const fam = await getFamily(pool, parts[2]);
      if (!fam) return { status: 404, body: { error: { code: 'not_found', message: 'Not found.' } } };
      const members = actor.role === 'member'
        ? fam.members.filter((m: { id: string }) => m.id === actor.memberId)
        : fam.members;
      return {
        status: 200,
        body: {
          id: fam.id,
          displayName: fam.display_name,
          guardians: fam.guardians.map((g: { id: string; email: string; role: string }) => ({
            id: g.id, email: g.email, role: g.role,
          })),
          members,
        },
      };
    }

    if (method === 'POST' && url.pathname === '/v1/quotes') {
      const body = JSON.parse(await readBody() || '{}');
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
      const processingFeeCents = await quoteProcessingFee(
        pool as unknown as SqlPool,
        String(body.locationId || ''),
        quote.dueCents,
        body.method,
      );
      return { status: 200, body: { ...quote, processingFeeCents, dueCents: quote.dueCents + processingFeeCents } };
    }

    if (method === 'POST' && url.pathname === '/v1/promo-codes') {
      assertStaff(actor);
      const body = JSON.parse(await readBody() || '{}') as PromoCode;
      if (!body.code || !body.discountType) throw new CrmError(400, 'bad_code', 'code and discountType are required');
      const id = await savePromo(pool, body);
      return { status: 201, body: { id, code: body.code.toUpperCase() } };
    }

    if (method === 'POST' && url.pathname === '/v1/promo-redemptions') {
      assertStaff(actor);
      const body = JSON.parse(await readBody() || '{}');
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
      return { status: 201, body: quote };
    }

    if (method === 'POST' && url.pathname === '/v1/payment-profiles/lookup') {
      assertStaff(actor);
      const body = JSON.parse(await readBody() || '{}');
      const fx = await loaders.loadFixtures();
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
      return { status: 200, body: { request: shape, profile } };
    }

    if (method === 'POST' && url.pathname === '/v1/charges/preview') {
      const body = JSON.parse(await readBody() || '{}');
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
          const processingFeeCents = body.locationId
            ? await quoteProcessingFee(pool as unknown as SqlPool, String(body.locationId), Number(body.amountCents) || 0, body.method)
            : 0;
          return { status: 200, body: { submitted: false, request, processingFeeCents } };
        }
        throw err;
      }
      return { status: 500, body: { error: { code: 'error', message: 'Charge preview stopped.' } } };
    }

    if (method === 'POST' && url.pathname === '/v1/tasks/import') {
      assertStaff(actor);
      const n = await importTasks(pool, await loaders.loadTasks());
      return { status: 200, body: { imported: n } };
    }
    if (method === 'GET' && url.pathname === '/v1/tasks') {
      assertStaff(actor);
      return { status: 200, body: { completions: await listTasks(pool, url.searchParams.get('staff') || undefined) } };
    }

    if (method === 'POST' && url.pathname === '/v1/staff-schedule/import') {
      assertStaff(actor);
      const summary = await importSchedule(pool, await loaders.loadSchedule());
      return { status: 200, body: summary };
    }
    if (method === 'GET' && url.pathname === '/v1/ranks') {
      assertStaff(actor);
      const program = url.searchParams.get('program') || '';
      return {
        status: 200,
        body: {
          programs: PROGRAMS,
          ranks: program ? ranksForProgram(program) : ranksForProgram('songahm').concat(ranksForProgram('tiger'), ranksForProgram('mini_tiger'), ranksForProgram('goninja'), ranksForProgram('legacy'), ranksForProgram('ata_instructor'), ranksForProgram('mpk')),
        },
      };
    }
    if (method === 'GET' && url.pathname === '/v1/ranks/resolve') {
      assertStaff(actor);
      const resolved = resolveRank(url.searchParams.get('program') || '', url.searchParams.get('name') || '');
      if (!resolved) return { status: 404, body: { error: { code: 'not_found', message: 'No matching rank in that program.' } } };
      return { status: 200, body: resolved };
    }
    if (method === 'GET' && url.pathname === '/v1/cycles/active') {
      assertStaff(actor);
      return { status: 200, body: activeCycle(url.searchParams.get('asOf') || '2026-11-24') };
    }
    if (method === 'GET' && url.pathname === '/v1/curriculum') {
      assertStaff(actor);
      const overlays = (url.searchParams.get('overlays') || '').split(',').map(s => s.trim()).filter(Boolean);
      const found = curriculumForRank({
        program: url.searchParams.get('program') || '',
        rank: url.searchParams.get('rank') || '',
        asOf: url.searchParams.get('asOf') || '2026-11-24',
        locationId: url.searchParams.get('locationId'),
        overlays: overlays as Array<'legacy' | 'competition' | 'xma' | 'go_ninja'>,
      });
      if (!found) return { status: 404, body: { error: { code: 'not_found', message: 'No curriculum for that program and rank.' } } };
      return {
        status: 200,
        body: {
          ...found,
          sections: found.sections.map(section => ({
            ...section,
            lessons: section.lessons.map(lesson => ({
              ...lesson,
              playerUrl: lesson.vimeoId ? vimeoPlayerUrl(lesson.vimeoId) : null,
            })),
          })),
        },
      };
    }
    if (method === 'GET' && url.pathname === '/v1/home/summary') {
      assertStaff(actor);
      try {
        return { status: 200, body: homeSummary(url.searchParams.get('scope') || 'all', url.searchParams.get('asOf') || '2026-11-24') };
      } catch (err) {
        return { status: 404, body: { error: { code: 'not_found', message: err instanceof Error ? err.message : 'Unknown scope.' } } };
      }
    }
    if (parts[0] === 'v1' && parts[1] === 'financials' && (parts[2] === 'quickbooks-export' || parts[2] === 'quickbooks-categories')) {
      const qbo = await handleQuickbooksHttp({
        method,
        parts,
        search: url.searchParams,
        actor,
        body: method === 'GET' ? {} : await readJson(),
        pool,
        env,
      });
      if (qbo) return qbo;
    }
    if (method === 'GET' && (url.pathname === '/v1/financials/summary' || (parts[0] === 'v1' && parts[1] === 'financials' && parts[2] === 'reports' && parts[3]))) {
      assertFinance(actor);
      const scope = url.searchParams.get('scope') || 'all';
      try { schoolsInScope(scope); }
      catch (err) {
        return { status: 404, body: { error: { code: 'not_found', message: err instanceof Error ? err.message : 'Unknown scope.' } } };
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
        if (parts[2] === 'reports') return { status: 200, body: financialReport(parts[3], query) };
        return { status: 200, body: financialsSummary(query) };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown report.';
        const missing = /Unknown report/.test(message);
        return { status: missing ? 404 : 500, body: { error: { code: missing ? 'not_found' : 'error', message } } };
      }
    }
    if (method === 'POST' && url.pathname === '/v1/payments/retry-preview') {
      assertStaff(actor);
      const body = JSON.parse(await readBody() || '{}');
      return { status: 200, body: previewPaymentRetry(String(body.invoiceId || '')) };
    }

    if (method === 'GET' && url.pathname === '/v1/staff-schedule') {
      assertStaff(actor);
      const shifts = await listShifts(pool, url.searchParams.get('staff') || undefined);
      const minutes = shifts.reduce((s, sh) => {
        const [shH, shM] = String(sh.start_local).slice(0, 5).split(':').map(Number);
        const [eh, em] = String(sh.end_local).slice(0, 5).split(':').map(Number);
        return s + ((eh * 60 + em) - (shH * 60 + shM));
      }, 0);
      return { status: 200, body: { shifts, scheduledMinutes: minutes } };
    }

    return { status: 404, body: { error: { code: 'not_found', message: 'Not found.' } } };
  } catch (err) {
    return fail(err);
  }
}
