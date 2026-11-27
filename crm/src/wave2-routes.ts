/**
 * Wave 2 HTTP paths. dispatchCrm calls this before the older routes.
 * Charges, QuickBooks, and message delivery stay off.
 */
import type { Actor } from './auth.ts';
import { assertQboOffline, journalEntry } from './qbo.ts';
import {
  feeForLocation,
  filteredMembers,
  groupByIncomeCategory,
  incomeCsv,
  listUpcoming,
  overrideUpcoming,
  patchMembership,
  patchSaleCredit,
  replaceLocationAccess,
  replaceSaleCredits,
  undoOverride,
} from './billing-wave2.ts';
import {
  createStaffBookings,
  duplicateSession,
  listBookings,
  listSchedule,
  patchPrefs,
  readPrefs,
  recordAttendance,
  releaseNoShows,
  saveBookingOption,
  saveKioskSession,
} from './schedule-booking.ts';
import {
  attachTemplate,
  createTemplate,
  listSystemEmails,
  listTemplates,
  newMemberStaffAlert,
  patchTemplate,
  putSystemEmails,
} from './templates.ts';
import type { SqlPool } from './query.ts';

export type Wave2Env = { AUTOMATION_DELIVERY_ENABLED?: string; QBO_ENABLED?: string };

const MEMBER_FILTERS = ['startedFrom', 'startedTo', 'cardExpired', 'soldBy', 'status', 'customStatus'];

export function isStaffWave2Path(method: string, parts: string[], search: URLSearchParams): boolean {
  if (parts[0] !== 'v1') return false;
  const head = parts[1];
  if (head === 'attendance' && method === 'POST' && parts.length === 2) return true;
  if (head === 'bookings' && parts.length === 2 && (method === 'GET' || method === 'POST')) return true;
  if (head === 'sessions' && method === 'POST' && parts[3] === 'duplicate') return true;
  if (head === 'schedule' && method === 'GET' && parts.length === 2) return true;
  if (head === 'me' && parts[2] === 'prefs' && (method === 'GET' || method === 'PATCH')) return true;
  if (head === 'memberships' && parts[3] === 'upcoming') return method === 'GET' || method === 'POST';
  if (head === 'memberships' && method === 'PATCH' && parts.length === 3) return true;
  if (head === 'memberships' && method === 'POST' && parts[3] === 'staff-alert') return true;
  if (head === 'memberships' && parts[3] === 'location-access' && method === 'PUT') return true;
  if (head === 'payment-overrides' && method === 'POST' && parts[3] === 'undo') return true;
  if (head === 'members.csv' && method === 'GET') return true;
  if (head === 'members' && method === 'GET' && parts.length === 2 && MEMBER_FILTERS.some(key => search.has(key))) return true;
  if (head === 'templates' && (method === 'GET' || method === 'POST' || method === 'PATCH')) return true;
  if (head === 'settings' && parts[2] === 'system-emails' && (method === 'GET' || method === 'PUT')) return true;
  if (head === 'kiosk-sessions' && method === 'POST' && parts.length === 2) return true;
  if (head === 'jobs' && parts[2] === 'release-no-shows' && method === 'POST') return true;
  if (head === 'sale-credits' && (method === 'POST' || method === 'PATCH')) return true;
  if (head === 'reports' && parts[2] === 'income.csv' && method === 'GET') return true;
  if (head === 'qbo' && parts[2] === 'category-preview' && method === 'POST') return true;
  if (head === 'booking-options' && method === 'POST' && parts.length === 2) return true;
  if (head === 'automation-steps' && method === 'PATCH' && parts.length === 3) return true;
  return false;
}

export async function handleWave2(input: {
  method: string;
  parts: string[];
  search: URLSearchParams;
  actor: Actor | null;
  body: Record<string, unknown>;
  pool: SqlPool;
  env: Wave2Env;
}): Promise<{ status: number; body: unknown; text?: string; contentType?: string }> {
  const { method, parts, search, actor, body, pool, env } = input;
  if (parts[1] === 'attendance' && method === 'POST') return recordAttendance(pool, actor, body);
  if (parts[1] === 'bookings' && method === 'GET') return listBookings(pool, actor, search);
  if (parts[1] === 'bookings' && method === 'POST') return createStaffBookings(pool, actor, body);
  if (parts[1] === 'sessions' && method === 'POST' && parts[3] === 'duplicate') {
    return duplicateSession(pool, actor, parts[2], body);
  }
  if (parts[1] === 'schedule' && method === 'GET') return listSchedule(pool, actor, search);
  if (parts[1] === 'me' && parts[2] === 'prefs' && method === 'GET') return readPrefs(pool, actor);
  if (parts[1] === 'me' && parts[2] === 'prefs' && method === 'PATCH') return patchPrefs(pool, actor, body);
  if (parts[1] === 'memberships' && parts[3] === 'upcoming' && method === 'GET') {
    return listUpcoming(pool, actor, parts[2], search.get('count'), search.get('asOf'));
  }
  if (parts[1] === 'memberships' && parts[3] === 'upcoming' && method === 'POST' && parts[5] === 'override') {
    return overrideUpcoming(pool, actor, parts[2], parts[4], body);
  }
  if (parts[1] === 'memberships' && method === 'PATCH') return patchMembership(pool, actor, parts[2], body);
  if (parts[1] === 'memberships' && method === 'POST' && parts[3] === 'staff-alert') {
    return newMemberStaffAlert(pool, actor, parts[2], body, env);
  }
  if (parts[1] === 'memberships' && method === 'PUT' && parts[3] === 'location-access') {
    return replaceLocationAccess(pool, actor, parts[2], body);
  }
  if (parts[1] === 'payment-overrides' && method === 'POST') return undoOverride(pool, actor, parts[2]);
  if (parts[1] === 'members.csv' && method === 'GET') return filteredMembers(pool, actor, search, true);
  if (parts[1] === 'members' && method === 'GET') return filteredMembers(pool, actor, search, false);
  if (parts[1] === 'templates' && method === 'GET' && !parts[2]) return listTemplates(pool, actor, search);
  if (parts[1] === 'templates' && method === 'POST' && !parts[2]) return createTemplate(pool, actor, body);
  if (parts[1] === 'templates' && method === 'PATCH' && parts[2]) return patchTemplate(pool, actor, parts[2], body);
  if (parts[1] === 'settings' && parts[2] === 'system-emails' && method === 'GET') return listSystemEmails(pool, actor, search);
  if (parts[1] === 'settings' && parts[2] === 'system-emails' && method === 'PUT') return putSystemEmails(pool, actor, body);
  if (parts[1] === 'kiosk-sessions' && method === 'POST') return saveKioskSession(pool, actor, body);
  if (parts[1] === 'jobs' && parts[2] === 'release-no-shows') {
    const asOf = body.asOf ? new Date(String(body.asOf)) : new Date();
    if (Number.isNaN(asOf.getTime())) return { status: 400, body: { error: { code: 'bad_date', message: 'asOf must be a time.' } } };
    return releaseNoShows(pool, actor, asOf);
  }
  if (parts[1] === 'sale-credits' && method === 'POST' && !parts[2]) return replaceSaleCredits(pool, actor, body);
  if (parts[1] === 'sale-credits' && method === 'PATCH' && parts[2]) return patchSaleCredit(pool, actor, parts[2], body);
  if (parts[1] === 'reports' && parts[2] === 'income.csv') return incomeCsv(pool, actor, search);
  if (parts[1] === 'booking-options' && method === 'POST') return saveBookingOption(pool, actor, body);
  if (parts[1] === 'automation-steps' && method === 'PATCH') return attachTemplate(pool, actor, parts[2], body);
  if (parts[1] === 'qbo' && parts[2] === 'category-preview' && method === 'POST') {
    assertQboOffline(env);
    const lines = Array.isArray(body.lines) ? body.lines as Array<Record<string, unknown>> : [];
    const groups = groupByIncomeCategory(lines.map(line => ({
      categoryName: String(line.category || 'Uncategorized'),
      accountCode: String(line.accountCode || 'OTHER'),
      amountCents: Number(line.amountCents || 0),
    })));
    const total = groups.reduce((sum, line) => sum + line.amountCents, 0);
    const doc = total > 0
      ? journalEntry({
        companyId: String(body.companyId || 'moh'),
        txnDate: String(body.on || '2026-11-27'),
        privateNote: 'Income by category. Not submitted.',
        lines: [
          ...groups.map(line => ({
            amountCents: line.amountCents,
            postingType: 'Credit' as const,
            accountCode: line.accountCode,
            description: line.categoryName,
          })),
          { amountCents: total, postingType: 'Debit' as const, accountCode: 'UNDEPOSITED', description: 'Preview clearing' },
        ],
      })
      : null;
    return { status: 200, body: { submitted: false, groups, journal: doc } };
  }
  return { status: 404, body: { error: { code: 'not_found', message: 'Not found.' } } };
}

export async function quoteProcessingFee(pool: SqlPool, locationId: string, amountCents: number, method: unknown): Promise<number> {
  return feeForLocation(pool, locationId, amountCents, method === 'ach' ? 'ach' : 'card');
}
