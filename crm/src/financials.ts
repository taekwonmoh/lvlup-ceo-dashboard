/**
 * Spark-style financials for the CRM preview.
 * Fixture math only. No Firebase, GymDesk, Supabase, or Authorize.net calls.
 * Money is integer cents. Names are the sandbox Sample roster.
 *
 * Open-month ledger is November 2026, as of 2026-11-24.
 * Other months on the charts are stored snapshots (see docs/crm/FINANCIALS.md).
 */

import { draftDates, type Cadence } from './billing.ts';

export const FIN_AS_OF = '2026-11-24';
export const FIN_SCHOOLS = ['waunakee', 'eastmad', 'verona', 'deforest', 'goninjaW', 'goninjaV'] as const;
export type FinSchool = typeof FIN_SCHOOLS[number];
export type FinScope = 'all' | 'lvlup' | 'goninja' | FinSchool;
export type FinPeriod = 'month' | 'last' | 'ytd' | 'custom';
export type FinCompare = 'none' | 'prev_month' | 'prev_year';
export type FinCategory = 'tuition' | 'events' | 'camps' | 'parties' | 'proshop' | 'testing' | 'other';

/** Sandbox assumption for Q5. Applied only to still-expected dollars. */
export const FAILURE_ALLOWANCE_RATE = 0.04;

export const SCHOOL_META: Record<FinSchool, {
  name: string;
  brand: 'lvlup' | 'goninja';
  goalCents: number;
  merchant: 'waunakee' | 'verona' | 'eastmad';
}> = {
  waunakee: { name: 'Waunakee', brand: 'lvlup', goalCents: 120000, merchant: 'waunakee' },
  eastmad: { name: 'East Madison', brand: 'lvlup', goalCents: 80000, merchant: 'eastmad' },
  verona: { name: 'Verona', brand: 'lvlup', goalCents: 70000, merchant: 'verona' },
  deforest: { name: 'DeForest', brand: 'lvlup', goalCents: 60000, merchant: 'waunakee' },
  goninjaW: { name: 'Go Ninja Waunakee', brand: 'goninja', goalCents: 36000, merchant: 'waunakee' },
  goninjaV: { name: 'Go Ninja Verona', brand: 'goninja', goalCents: 20000, merchant: 'verona' },
};

export const MERCHANT_META: Record<string, { name: string; schools: FinSchool[] }> = {
  waunakee: { name: 'Waunakee account', schools: ['waunakee', 'deforest', 'goninjaW'] },
  verona: { name: 'Verona account', schools: ['verona', 'goninjaV'] },
  eastmad: { name: 'East Madison account', schools: ['eastmad'] },
};

const MOVEMENT_GOALS: Record<FinSchool, { neu: number; upgrade: number; renewal: number; hold: number; cancel: number }> = {
  waunakee: { neu: 2, upgrade: 1, renewal: 2, hold: 1, cancel: 1 },
  eastmad: { neu: 1, upgrade: 1, renewal: 1, hold: 1, cancel: 1 },
  verona: { neu: 1, upgrade: 1, renewal: 1, hold: 1, cancel: 1 },
  deforest: { neu: 1, upgrade: 0, renewal: 1, hold: 1, cancel: 1 },
  goninjaW: { neu: 1, upgrade: 0, renewal: 1, hold: 0, cancel: 0 },
  goninjaV: { neu: 1, upgrade: 0, renewal: 1, hold: 0, cancel: 0 },
};

export type Membership = {
  id: string;
  name: string;
  locationId: FinSchool;
  plan: string;
  program: string;
  cadence: Cadence;
  /** Snapshotted price after any family discount. This is what billing uses. */
  amountCents: number;
  listCents: number;
  discountPct: number;
  status: 'active' | 'past_due' | 'hold' | 'cancelled' | 'trial' | 'comp';
  startedOn: string;
  endedOn?: string;
  holdStart?: string;
  holdEnd?: string;
  anchor: string;
  prepaidMonths?: number;
  cardLast4: string;
  /** YYYY-MM. Empty when no card is on file. */
  cardExp: string;
  method: 'card' | 'cash' | 'check';
};

export type Charge = {
  id: string;
  membershipId?: string;
  name: string;
  locationId: FinSchool;
  on: string;
  amountCents: number;
  taxCents: number;
  method: 'card' | 'cash' | 'check';
  status: 'captured' | 'settled' | 'refund' | 'declined';
  category: FinCategory;
  program: string;
  plan: string;
  authStatus: string;
  firstCharge?: boolean;
};

export type MovementKind = 'new_day1' | 'new_later' | 'upgrade' | 'renewal' | 'hold' | 'cancel' | 'downgrade';

export type Movement = {
  id: string;
  membershipId: string;
  name: string;
  locationId: FinSchool;
  kind: MovementKind;
  plan: string;
  cadence: Cadence;
  chargedCents: number;
  /** Signed monthly-equivalent cents. Holds stay out of gain and loss. */
  monthlyCents: number;
  on: string;
  frequency: string;
};

export type PastDue = {
  id: string;
  membershipId: string;
  name: string;
  locationId: FinSchool;
  plan: string;
  attempts: number;
  lastAttempt: string;
  declineReason: string;
  overdueCents: number;
  last4: string;
  method: string;
  nextRetry: string | null;
  dueOn: string;
};

export type ScheduledOther = {
  id: string;
  name: string;
  locationId: FinSchool;
  on: string;
  amountCents: number;
  label: string;
  pastDue: boolean;
};

export type Attempt = {
  id: string;
  name: string;
  locationId: FinSchool;
  on: string;
  amountCents: number;
  status: 'approved' | 'declined';
  reason: string;
  plan: string;
};

const M = (
  id: string, name: string, locationId: FinSchool, plan: string, program: string, cadence: Cadence,
  amountCents: number, listCents: number, discountPct: number, status: Membership['status'],
  startedOn: string, anchor: string, cardLast4: string, cardExp: string, method: Membership['method'],
  extra: Partial<Membership> = {},
): Membership => ({
  id, name, locationId, plan, program, cadence, amountCents, listCents, discountPct, status,
  startedOn, anchor, cardLast4, cardExp, method, prepaidMonths: extra.prepaidMonths, ...extra,
});

export const MEMBERSHIPS: Membership[] = [
  M('avery', 'Avery Sample', 'waunakee', 'Standard', 'Taekwondo', 'every_4_weeks', 22400, 22400, 0, 'active', '2024-06-03', '2026-11-03', '1111', '2027-08', 'card'),
  M('rowan', 'Rowan Sample', 'waunakee', 'Standard', 'Taekwondo', 'every_4_weeks', 22400, 22400, 0, 'active', '2023-02-14', '2026-11-06', '7777', '2028-01', 'card'),
  M('parker', 'Parker Sample', 'waunakee', 'Mini-Tigers', 'Mini Tigers', 'monthly', 11900, 11900, 0, 'active', '2026-02-05', '2026-11-05', '1212', '2027-06', 'card'),
  M('hayden', 'Hayden Sample', 'waunakee', 'Standard', 'Taekwondo', 'every_4_weeks', 15680, 22400, 30, 'active', '2025-09-06', '2026-11-06', '1313', '2027-03', 'card'),
  M('reese', 'Reese Sample', 'waunakee', 'Grandfathered', 'Taekwondo', 'monthly', 17900, 17900, 0, 'active', '2019-04-28', '2026-10-28', '1414', '2027-11', 'card'),
  M('drew', 'Drew Sample', 'waunakee', 'Leadership', 'Leadership', 'every_4_weeks', 29900, 29900, 0, 'active', '2026-11-10', '2026-11-10', '1515', '2028-02', 'card'),
  M('emerson', 'Emerson Sample', 'waunakee', 'Standard', 'Taekwondo', 'every_4_weeks', 22400, 22400, 0, 'hold', '2024-01-18', '2026-10-21', '1616', '2027-09', 'card', { holdStart: '2026-11-01', holdEnd: '2026-12-15' }),
  M('finley', 'Finley Sample', 'waunakee', 'Standard', 'Taekwondo', 'every_4_weeks', 22400, 22400, 0, 'cancelled', '2022-08-08', '2022-08-08', '1717', '2026-12', 'card', { endedOn: '2026-11-08' }),
  M('harper', 'Harper Sample', 'waunakee', 'Standard', 'Taekwondo', 'every_4_weeks', 17900, 22400, 0, 'active', '2023-11-12', '2026-11-26', '1818', '2027-04', 'card'),
  M('casey', 'Casey Sample', 'waunakee', 'Mini-Tigers', 'Mini Tigers', 'monthly', 11900, 11900, 0, 'past_due', '2025-11-02', '2026-10-02', '', '2026-11', 'card'),
  M('noah', 'Noah Sample', 'eastmad', 'Prepaid Year', 'Taekwondo', 'prepaid_term', 291200, 291200, 0, 'active', '2026-01-15', '2026-01-15', '1919', '2027-09', 'card', { prepaidMonths: 12 }),
  M('jordan', 'Jordan Sample', 'eastmad', 'Leadership', 'Leadership', 'every_4_weeks', 29900, 29900, 0, 'active', '2024-03-04', '2026-11-04', '3333', '2027-07', 'card'),
  M('blake', 'Blake Sample', 'verona', 'Tigers', 'Tigers', 'every_4_weeks', 20900, 20900, 0, 'active', '2025-04-07', '2026-11-07', '2222', '2027-12', 'card'),
  M('skyler', 'Skyler Sample', 'verona', 'BB Club', 'Black Belt', 'every_4_weeks', 22400, 22400, 0, 'active', '2021-09-09', '2026-11-09', '6666', '2026-11', 'card'),
  M('sage', 'Sage Sample', 'verona', 'Standard', 'Taekwondo', 'every_4_weeks', 10450, 20900, 50, 'active', '2026-11-09', '2026-11-09', '2323', '2027-10', 'card'),
  M('remy', 'Remy Sample', 'verona', 'Standard', 'Taekwondo', 'every_4_weeks', 0, 0, 0, 'comp', '2024-05-01', '2024-05-01', '', '', 'card'),
  M('quinn', 'Quinn Sample', 'deforest', 'Standard', 'Taekwondo', 'every_4_weeks', 19900, 19900, 0, 'past_due', '2025-06-02', '2026-11-02', '4444', '2027-04', 'card'),
  M('logan', 'Logan Sample', 'deforest', 'Standard', 'Taekwondo', 'every_4_weeks', 19900, 19900, 0, 'active', '2024-11-11', '2026-11-11', '2525', '2028-03', 'card'),
  M('riley', 'Riley Sample', 'goninjaW', 'Movement Academy', 'Movement Academy', 'every_4_weeks', 0, 0, 0, 'trial', '2026-11-21', '2026-11-21', '', '', 'card'),
  M('cameron', 'Cameron Sample', 'goninjaW', 'Movement Academy', 'Movement Academy', 'every_4_weeks', 8900, 8900, 0, 'active', '2025-08-04', '2026-11-04', '2626', '2027-08', 'card'),
  M('morgan', 'Morgan Sample', 'goninjaV', 'Movement Academy', 'Movement Academy', 'every_4_weeks', 5000, 5000, 0, 'past_due', '2026-03-12', '2026-10-15', '5555', '2027-01', 'card'),
  M('taylor', 'Taylor Sample', 'goninjaV', 'Movement Academy', 'Movement Academy', 'every_4_weeks', 8900, 8900, 0, 'active', '2026-11-08', '2026-11-08', '2727', '2028-06', 'card'),
];

function ch(row: Omit<Charge, 'taxCents' | 'authStatus' | 'method' | 'status' | 'category' | 'program' | 'plan'> & Partial<Charge>): Charge {
  const status = row.status || 'captured';
  return {
    taxCents: 0,
    method: 'card',
    category: 'tuition',
    program: 'Taekwondo',
    plan: 'Standard',
    ...row,
    status,
    authStatus: row.authStatus || (status === 'declined' ? 'declined' : status === 'refund' ? 'refund' : status === 'settled' ? 'settled' : 'captured'),
  };
}

export const CHARGES: Charge[] = [
  ch({ id: 'ch_avery', membershipId: 'avery', name: 'Avery Sample', locationId: 'waunakee', on: '2026-11-03', amountCents: 22400 }),
  ch({ id: 'ch_rowan', membershipId: 'rowan', name: 'Rowan Sample', locationId: 'waunakee', on: '2026-11-06', amountCents: 22400 }),
  ch({ id: 'ch_parker', membershipId: 'parker', name: 'Parker Sample', locationId: 'waunakee', on: '2026-11-05', amountCents: 11900, plan: 'Mini-Tigers', program: 'Mini Tigers' }),
  ch({ id: 'ch_hayden', membershipId: 'hayden', name: 'Hayden Sample', locationId: 'waunakee', on: '2026-11-06', amountCents: 15680 }),
  ch({ id: 'ch_drew', membershipId: 'drew', name: 'Drew Sample', locationId: 'waunakee', on: '2026-11-10', amountCents: 29900, plan: 'Leadership', program: 'Leadership', firstCharge: true }),
  ch({ id: 'ch_shop', name: 'Avery Sample', locationId: 'waunakee', on: '2026-11-12', amountCents: 4500, taxCents: 248, method: 'cash', status: 'settled', category: 'proshop', program: 'Pro Shop', plan: 'Retail', authStatus: 'cash' }),
  ch({ id: 'ch_refund', name: 'Avery Sample', locationId: 'waunakee', on: '2026-11-18', amountCents: -2000, taxCents: -110, status: 'refund', category: 'proshop', program: 'Pro Shop', plan: 'Retail' }),
  ch({ id: 'ch_jordan', membershipId: 'jordan', name: 'Jordan Sample', locationId: 'eastmad', on: '2026-11-04', amountCents: 22400 }),
  ch({ id: 'ch_jordan_up', membershipId: 'jordan', name: 'Jordan Sample', locationId: 'eastmad', on: '2026-11-12', amountCents: 7500, plan: 'Leadership', program: 'Leadership' }),
  ch({ id: 'ch_camp', name: 'Jordan Sample', locationId: 'eastmad', on: '2026-11-15', amountCents: 12000, category: 'camps', program: 'Camp', plan: 'Holiday camp' }),
  ch({ id: 'ch_today', name: 'Alex Sample', locationId: 'eastmad', on: '2026-11-24', amountCents: 3500, method: 'cash', status: 'settled', category: 'other', program: 'Drop-in', plan: 'Drop-in', authStatus: 'cash' }),
  ch({ id: 'ch_blake', membershipId: 'blake', name: 'Blake Sample', locationId: 'verona', on: '2026-11-07', amountCents: 20900, plan: 'Tigers', program: 'Tigers' }),
  ch({ id: 'ch_skyler', membershipId: 'skyler', name: 'Skyler Sample', locationId: 'verona', on: '2026-11-09', amountCents: 22400, plan: 'BB Club', program: 'Black Belt' }),
  ch({ id: 'ch_sage', membershipId: 'sage', name: 'Sage Sample', locationId: 'verona', on: '2026-11-09', amountCents: 10450, firstCharge: true }),
  ch({ id: 'ch_clinic', name: 'Blake Sample', locationId: 'verona', on: '2026-11-20', amountCents: 8000, category: 'events', program: 'Clinic', plan: 'Sparring clinic' }),
  ch({ id: 'ch_logan', membershipId: 'logan', name: 'Logan Sample', locationId: 'deforest', on: '2026-11-11', amountCents: 19900 }),
  ch({ id: 'ch_test', name: 'Logan Sample', locationId: 'deforest', on: '2026-11-14', amountCents: 4500, category: 'testing', program: 'Testing', plan: 'Belt test' }),
  ch({ id: 'ch_cameron', membershipId: 'cameron', name: 'Cameron Sample', locationId: 'goninjaW', on: '2026-11-04', amountCents: 8900, plan: 'Movement Academy', program: 'Movement Academy' }),
  ch({ id: 'ch_party', name: 'Cameron Sample', locationId: 'goninjaW', on: '2026-11-21', amountCents: 25000, category: 'parties', program: 'Party', plan: 'Birthday party' }),
  ch({ id: 'ch_taylor', membershipId: 'taylor', name: 'Taylor Sample', locationId: 'goninjaV', on: '2026-11-08', amountCents: 8900, plan: 'Movement Academy', program: 'Movement Academy' }),
  ch({ id: 'ch_quinn_dec', membershipId: 'quinn', name: 'Quinn Sample', locationId: 'deforest', on: '2026-11-02', amountCents: 19900, status: 'declined' }),
  ch({ id: 'ch_casey_dec', membershipId: 'casey', name: 'Casey Sample', locationId: 'waunakee', on: '2026-11-02', amountCents: 11900, status: 'declined', plan: 'Mini-Tigers', program: 'Mini Tigers' }),
  ch({ id: 'ch_morgan_dec', membershipId: 'morgan', name: 'Morgan Sample', locationId: 'goninjaV', on: '2026-11-12', amountCents: 5000, status: 'declined', plan: 'Movement Academy', program: 'Movement Academy' }),
  ch({ id: 'ch_oct_avery', membershipId: 'avery', name: 'Avery Sample', locationId: 'waunakee', on: '2026-10-06', amountCents: 22400 }),
  ch({ id: 'ch_oct_blake', membershipId: 'blake', name: 'Blake Sample', locationId: 'verona', on: '2026-10-10', amountCents: 20900, plan: 'Tigers', program: 'Tigers' }),
  ch({ id: 'ch_oct_tourney', name: 'Skyler Sample', locationId: 'verona', on: '2026-10-17', amountCents: 6000, status: 'settled', category: 'events', program: 'Tournament', plan: 'Fall tournament', authStatus: 'settled' }),
];

function mv(row: Omit<Movement, 'monthlyCents' | 'frequency'> & { amountCents: number; sign: 1 | -1; frequency?: string; monthlyCents?: number }): Movement {
  const monthly = row.monthlyCents ?? row.sign * monthlyEquivalentCents(row.amountCents, row.cadence);
  return {
    id: row.id, membershipId: row.membershipId, name: row.name, locationId: row.locationId, kind: row.kind,
    plan: row.plan, cadence: row.cadence, chargedCents: row.chargedCents, on: row.on,
    monthlyCents: monthly, frequency: row.frequency || (row.cadence === 'monthly' ? 'Monthly' : 'Every 4 weeks'),
  };
}

export const MOVEMENTS: Movement[] = [
  mv({ id: 'mv_drew', membershipId: 'drew', name: 'Drew Sample', locationId: 'waunakee', kind: 'new_day1', plan: 'Leadership', cadence: 'every_4_weeks', amountCents: 29900, sign: 1, chargedCents: 29900, on: '2026-11-10' }),
  mv({ id: 'mv_sage', membershipId: 'sage', name: 'Sage Sample', locationId: 'verona', kind: 'new_later', plan: 'Standard', cadence: 'every_4_weeks', amountCents: 10450, sign: 1, chargedCents: 10450, on: '2026-11-09' }),
  mv({ id: 'mv_taylor', membershipId: 'taylor', name: 'Taylor Sample', locationId: 'goninjaV', kind: 'new_later', plan: 'Movement Academy', cadence: 'every_4_weeks', amountCents: 8900, sign: 1, chargedCents: 8900, on: '2026-11-08' }),
  mv({ id: 'mv_jordan', membershipId: 'jordan', name: 'Jordan Sample', locationId: 'eastmad', kind: 'upgrade', plan: 'Leadership', cadence: 'every_4_weeks', amountCents: 7500, sign: 1, chargedCents: 7500, on: '2026-11-12', monthlyCents: monthlyEquivalentCents(7500, 'every_4_weeks') }),
  mv({ id: 'mv_avery', membershipId: 'avery', name: 'Avery Sample', locationId: 'waunakee', kind: 'renewal', plan: 'Standard', cadence: 'every_4_weeks', amountCents: 22400, sign: 1, chargedCents: 22400, on: '2026-11-03' }),
  mv({ id: 'mv_blake', membershipId: 'blake', name: 'Blake Sample', locationId: 'verona', kind: 'renewal', plan: 'Tigers', cadence: 'every_4_weeks', amountCents: 20900, sign: 1, chargedCents: 20900, on: '2026-11-07' }),
  mv({ id: 'mv_logan', membershipId: 'logan', name: 'Logan Sample', locationId: 'deforest', kind: 'renewal', plan: 'Standard', cadence: 'every_4_weeks', amountCents: 19900, sign: 1, chargedCents: 19900, on: '2026-11-11' }),
  mv({ id: 'mv_emerson', membershipId: 'emerson', name: 'Emerson Sample', locationId: 'waunakee', kind: 'hold', plan: 'Standard', cadence: 'every_4_weeks', amountCents: 22400, sign: -1, chargedCents: 0, on: '2026-11-01' }),
  mv({ id: 'mv_finley', membershipId: 'finley', name: 'Finley Sample', locationId: 'waunakee', kind: 'cancel', plan: 'Standard', cadence: 'every_4_weeks', amountCents: 22400, sign: -1, chargedCents: 0, on: '2026-11-08' }),
  mv({ id: 'mv_harper', membershipId: 'harper', name: 'Harper Sample', locationId: 'waunakee', kind: 'downgrade', plan: 'Standard', cadence: 'every_4_weeks', amountCents: 4500, sign: -1, chargedCents: 17900, on: '2026-11-12', monthlyCents: -monthlyEquivalentCents(4500, 'every_4_weeks') }),
];

export const PAST_DUE: PastDue[] = [
  { id: 'pd_quinn', membershipId: 'quinn', name: 'Quinn Sample', locationId: 'deforest', plan: 'Standard', attempts: 3, lastAttempt: '2026-11-22', declineReason: 'Insufficient funds', overdueCents: 19900, last4: '4444', method: 'Visa', nextRetry: '2026-11-26', dueOn: '2026-11-02' },
  { id: 'pd_casey', membershipId: 'casey', name: 'Casey Sample', locationId: 'waunakee', plan: 'Mini-Tigers', attempts: 4, lastAttempt: '2026-11-16', declineReason: 'Expired card', overdueCents: 11900, last4: '', method: 'Visa', nextRetry: null, dueOn: '2026-11-02' },
  { id: 'pd_morgan', membershipId: 'morgan', name: 'Morgan Sample', locationId: 'goninjaV', plan: 'Movement Academy', attempts: 2, lastAttempt: '2026-11-23', declineReason: 'Do not honor', overdueCents: 5000, last4: '5555', method: 'Visa', nextRetry: '2026-11-27', dueOn: '2026-11-12' },
];

export const SCHEDULED_OTHER: ScheduledOther[] = [
  { id: 'oth_party', name: 'Cameron Sample', locationId: 'goninjaW', on: '2026-11-29', amountCents: 15000, label: 'Birthday party balance', pastDue: false },
  { id: 'oth_event', name: 'Parker Sample', locationId: 'waunakee', on: '2026-11-10', amountCents: 6500, label: 'Event payment plan', pastDue: true },
];

export const EXTRA_ATTEMPTS: Attempt[] = [
  { id: 'at_quinn_2', name: 'Quinn Sample', locationId: 'deforest', on: '2026-11-12', amountCents: 19900, status: 'declined', reason: 'Insufficient funds', plan: 'Standard' },
  { id: 'at_quinn_3', name: 'Quinn Sample', locationId: 'deforest', on: '2026-11-22', amountCents: 19900, status: 'declined', reason: 'Insufficient funds', plan: 'Standard' },
  { id: 'at_casey_2', name: 'Casey Sample', locationId: 'waunakee', on: '2026-11-09', amountCents: 11900, status: 'declined', reason: 'Expired card', plan: 'Mini-Tigers' },
  { id: 'at_casey_3', name: 'Casey Sample', locationId: 'waunakee', on: '2026-11-16', amountCents: 11900, status: 'declined', reason: 'Expired card', plan: 'Mini-Tigers' },
  { id: 'at_morgan_2', name: 'Morgan Sample', locationId: 'goninjaV', on: '2026-11-23', amountCents: 5000, status: 'declined', reason: 'Do not honor', plan: 'Movement Academy' },
];

export const SYNC_ERRORS: Array<{ id: string; locationId: FinSchool; message: string }> = [
  { id: 'sync_eastmad', locationId: 'eastmad', message: 'Authorize.net CIM sync error at East Madison' },
];

export const CATEGORY_LABEL: Record<FinCategory, string> = {
  tuition: 'Tuition',
  events: 'Events / Tournaments',
  camps: 'Camps',
  parties: 'Birthday Parties',
  proshop: 'Pro Shop / Retail',
  testing: 'Testing (pre-2027)',
  other: 'Other',
};

export const REPORTS: Array<{ id: string; title: string; about: string }> = [
  { id: 'transactions', title: 'Financial Transactions', about: 'Payments in the range, all methods, split by the membership’s school. Amounts are pre-tax. Refunds are negative.' },
  { id: 'by-category', title: 'Transactions by Category', about: 'The same payments grouped by income category. Tax is not included here.' },
  { id: 'by-membership', title: 'Transactions by Membership', about: 'Tuition grouped by plan. Events, camps, parties, and pro shop stay in their own categories.' },
  { id: 'forecast', title: 'Financial Forecast Report', about: 'Scheduled drafts in the range, including a second draft when a 4-week plan lands twice. Holds that cover the draft date are left out.' },
  { id: 'gross-history', title: 'Gross Financial History', about: 'Collected by month, this year beside last year. November 2026 matches the ledger. Earlier months are stored snapshots.' },
  { id: 'refunds', title: 'Financial Refund Report', about: 'Refunds in the range. They already reduce Collected.' },
  { id: 'autocharge', title: 'Autocharge Report', about: 'Card attempts on the sandbox ledger. Approved and declined. Nothing here was sent to Authorize.net.' },
  { id: 'past-due', title: 'Past Due Memberships', about: 'Open overdue balances with attempts, the last attempt, and the decline reason.' },
  { id: 'sales-tax', title: 'Sales Tax Report', about: 'Pro shop tax only. Dashboard tiles stay pre-tax.' },
  { id: 'down-payments', title: 'Membership Down Payments', about: 'First tuition charges in the range.' },
  { id: 'credits', title: 'Account Credits Applied', about: 'Credits applied in the range. In this fixture that is the pro shop refund.' },
  { id: 'scheduled', title: 'Scheduled Payments', about: 'Event and party schedules, paid and unpaid. Separate from membership drafts.' },
  { id: 'end-of-day', title: 'End of Day', about: 'Charges on the as-of date, plus the month-to-date collected total.' },
  { id: 'items-sold', title: 'Items Sold', about: 'Pro shop lines in the range, pre-tax.' },
  { id: 'ach', title: 'ACH / EFT Status', about: 'No school in this preview takes ACH. Drafts are card, cash, or check.' },
  { id: 'stats-history', title: 'Stats History', about: 'Stored month-end snapshots. They are not recomputed from today’s ledger.' },
];

export function monthlyEquivalentCents(amountCents: number, cadence: Cadence, prepaidMonths = 1): number {
  if (cadence === 'monthly') return amountCents;
  if (cadence === 'every_4_weeks') return Math.round(amountCents * 13 / 12);
  const months = Math.max(1, prepaidMonths);
  return Math.round(amountCents / months);
}

export function schoolsInScope(scope: string): FinSchool[] {
  if (scope === 'all') return [...FIN_SCHOOLS];
  if (scope === 'lvlup') return FIN_SCHOOLS.filter(id => SCHOOL_META[id].brand === 'lvlup');
  if (scope === 'goninja') return FIN_SCHOOLS.filter(id => SCHOOL_META[id].brand === 'goninja');
  if ((FIN_SCHOOLS as readonly string[]).includes(scope)) return [scope as FinSchool];
  throw new Error('Unknown scope ' + scope);
}

export function scopeBrand(ids: FinSchool[]): 'all' | 'lvlup' | 'goninja' {
  if (ids.every(id => SCHOOL_META[id].brand === 'goninja')) return 'goninja';
  if (ids.every(id => SCHOOL_META[id].brand === 'lvlup')) return 'lvlup';
  return 'all';
}

export function goalTone(pct: number | null): 'ok' | 'warn' | 'bad' | 'none' {
  if (pct == null) return 'none';
  if (pct >= 80) return 'ok';
  if (pct >= 50) return 'warn';
  return 'bad';
}

export function pct(part: number, whole: number): number | null {
  if (!whole) return null;
  return Math.round((part / whole) * 1000) / 10;
}

export function holdCovers(member: Membership, date: string): boolean {
  if (member.status !== 'hold' || !member.holdStart || !member.holdEnd) return false;
  return date >= member.holdStart && date <= member.holdEnd;
}

export function isBillingMember(member: Membership): boolean {
  return member.status === 'active' || member.status === 'past_due';
}

export function countsAsCollected(charge: Charge): boolean {
  return charge.status === 'captured' || charge.status === 'settled' || charge.status === 'refund';
}

export function daysBetween(from: string, to: string): number {
  const ms = Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z');
  return Math.round(ms / 86400000);
}

export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function monthsBetween(from: string, to: string): number {
  const [y1, m1, d1] = from.split('-').map(Number);
  const [y2, m2, d2] = to.split('-').map(Number);
  let months = (y2 - y1) * 12 + (m2 - m1);
  if (d2 < d1) months -= 1;
  return Math.max(0, months);
}

export function cardExpiresBefore(cardExp: string, draftOn: string): boolean {
  if (!/^\d{4}-\d{2}$/.test(cardExp)) return false;
  const [y, m] = cardExp.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return last < draftOn;
}

export function nextDraftOn(member: Membership, asOf: string): string | null {
  if (member.cadence === 'prepaid_term' || member.status === 'cancelled' || member.status === 'trial' || member.status === 'comp') {
    return null;
  }
  const dates = draftDates({ anchor: member.anchor, cadence: member.cadence, from: asOf, through: addDaysIso(asOf, 370) });
  return dates.find(date => !holdCovers(member, date)) || null;
}

export type DraftRow = {
  id: string;
  membershipId: string;
  name: string;
  locationId: FinSchool;
  on: string;
  amountCents: number;
  plan: string;
  cadence: Cadence;
  frequency: string;
  kind: 'membership' | 'other';
  label: string;
};

export function membershipDrafts(member: Membership, from: string, through: string): DraftRow[] {
  if (member.status === 'cancelled' || member.status === 'trial' || member.status === 'comp' || member.cadence === 'prepaid_term') return [];
  const dates = draftDates({ anchor: member.anchor, cadence: member.cadence, from, through });
  return dates.filter(date => !holdCovers(member, date)).map(date => ({
    id: member.id + ':' + date,
    membershipId: member.id,
    name: member.name,
    locationId: member.locationId,
    on: date,
    amountCents: member.amountCents,
    plan: member.plan,
    cadence: member.cadence,
    frequency: member.cadence === 'monthly' ? 'Monthly' : member.cadence === 'every_4_weeks' ? 'Every 4 weeks' : 'Prepaid',
    kind: 'membership' as const,
    label: member.plan,
  }));
}

function settledDraftKeys(): Set<string> {
  const keys = new Set<string>();
  for (const charge of CHARGES) {
    if (!charge.membershipId) continue;
    if (charge.status !== 'captured' && charge.status !== 'settled') continue;
    keys.add(charge.membershipId + ':' + charge.on);
  }
  return keys;
}

export function stillExpectedDrafts(ids: FinSchool[], from: string, through: string): DraftRow[] {
  const settled = settledDraftKeys();
  const rows: DraftRow[] = [];
  for (const member of MEMBERSHIPS) {
    if (!ids.includes(member.locationId)) continue;
    for (const draft of membershipDrafts(member, from, through)) {
      if (settled.has(draft.id)) continue;
      rows.push(draft);
    }
  }
  for (const item of SCHEDULED_OTHER) {
    if (!ids.includes(item.locationId) || item.pastDue) continue;
    if (item.on < from || item.on > through) continue;
    rows.push({
      id: item.id, membershipId: '', name: item.name, locationId: item.locationId, on: item.on,
      amountCents: item.amountCents, plan: item.label, cadence: 'monthly', frequency: 'Scheduled',
      kind: 'other', label: item.label,
    });
  }
  return rows.sort((a, b) => a.on.localeCompare(b.on) || a.name.localeCompare(b.name));
}

export function netBilling(rows: Movement[]): { gainCents: number; lossCents: number; netCents: number; holdCents: number } {
  let gainCents = 0;
  let lossCents = 0;
  let holdCents = 0;
  for (const row of rows) {
    if (row.kind === 'hold') {
      holdCents += Math.abs(row.monthlyCents);
      continue;
    }
    if (row.monthlyCents >= 0) gainCents += row.monthlyCents;
    else lossCents += Math.abs(row.monthlyCents);
  }
  return { gainCents, lossCents, netCents: gainCents - lossCents, holdCents };
}

function inScope<T extends { locationId: FinSchool }>(rows: T[], ids: FinSchool[]): T[] {
  return rows.filter(row => ids.includes(row.locationId));
}

export function ledgerCharges(ids: FinSchool[], from: string, through: string, pred: (charge: Charge) => boolean = countsAsCollected): Charge[] {
  return CHARGES.filter(charge => ids.includes(charge.locationId) && charge.on >= from && charge.on <= through && pred(charge));
}

function sumAmount(rows: Array<{ amountCents: number }>): number {
  return rows.reduce((total, row) => total + row.amountCents, 0);
}

let novCollectedCache: Record<FinSchool, number> | null = null;
let novMrrCache: Record<FinSchool, number> | null = null;
let novNetCache: Record<FinSchool, number> | null = null;
let novPastDueCache: Record<FinSchool, number> | null = null;
let novPayingCache: Record<FinSchool, number> | null = null;

function perSchool(build: (id: FinSchool) => number): Record<FinSchool, number> {
  const out = {} as Record<FinSchool, number>;
  for (const id of FIN_SCHOOLS) out[id] = build(id);
  return out;
}

function novCollectedMap(): Record<FinSchool, number> {
  if (!novCollectedCache) {
    novCollectedCache = perSchool(id => sumAmount(ledgerCharges([id], '2026-11-01', '2026-11-30')));
  }
  return novCollectedCache;
}

function mrrFor(ids: FinSchool[]): { cents: number; paying: number; rows: Membership[] } {
  const rows = MEMBERSHIPS.filter(member => ids.includes(member.locationId) && isBillingMember(member));
  const cents = rows.reduce((total, member) => total + monthlyEquivalentCents(member.amountCents, member.cadence, member.prepaidMonths), 0);
  return { cents, paying: rows.length, rows };
}

function novMrrMap(): Record<FinSchool, number> {
  if (!novMrrCache) novMrrCache = perSchool(id => mrrFor([id]).cents);
  return novMrrCache;
}

function novNetMap(): Record<FinSchool, number> {
  if (!novNetCache) novNetCache = perSchool(id => netBilling(inScope(MOVEMENTS, [id])).netCents);
  return novNetCache;
}

function novPastDueMap(): Record<FinSchool, number> {
  if (!novPastDueCache) novPastDueCache = perSchool(id => sumAmount(inScope(PAST_DUE, [id]).map(row => ({ amountCents: row.overdueCents }))));
  return novPastDueCache;
}

function novPayingMap(): Record<FinSchool, number> {
  if (!novPayingCache) novPayingCache = perSchool(id => mrrFor([id]).paying);
  return novPayingCache;
}

function monthsBack(year: number, month: number): number {
  return (2026 - year) * 12 + (11 - month);
}

/** Stored snapshot for any month other than the open ledger month. */
export function snapshotCents(locationId: FinSchool, year: number, month: number, kind: 'collected' | 'mrr' | 'net' | 'pastDue'): number {
  if (year === 2026 && month === 11) {
    if (kind === 'collected') return novCollectedMap()[locationId];
    if (kind === 'mrr') return novMrrMap()[locationId];
    if (kind === 'net') return novNetMap()[locationId];
    return novPastDueMap()[locationId];
  }
  const base = kind === 'collected' ? novCollectedMap()[locationId]
    : kind === 'mrr' ? novMrrMap()[locationId]
      : kind === 'net' ? novNetMap()[locationId]
        : novPastDueMap()[locationId];
  const back = monthsBack(year, month);
  const wobble = ((month * 17 + locationId.charCodeAt(0) + (kind === 'mrr' ? 3 : 0)) % 7 - 3) * 0.01;
  const factor = 1 - back * 0.015 + wobble;
  return Math.round(base * factor);
}

export function snapshotCount(locationId: FinSchool, year: number, month: number): number {
  const base = novPayingMap()[locationId];
  if (year === 2026 && month === 11) return base;
  const back = monthsBack(year, month);
  return Math.max(0, Math.round(base * (1 - back * 0.01)));
}

export type PeriodRange = { id: FinPeriod; from: string; through: string; label: string };

export function periodRange(period: FinPeriod, asOf = FIN_AS_OF, custom?: { from?: string; through?: string }): PeriodRange {
  if (period === 'last') return { id: 'last', from: '2026-10-01', through: '2026-10-31', label: 'October 2026' };
  if (period === 'ytd') return { id: 'ytd', from: '2026-01-01', through: asOf, label: '2026 year to date' };
  if (period === 'custom') {
    const from = custom?.from && /^\d{4}-\d{2}-\d{2}$/.test(custom.from) ? custom.from : '2026-11-01';
    const through = custom?.through && /^\d{4}-\d{2}-\d{2}$/.test(custom.through) ? custom.through : asOf;
    return { id: 'custom', from, through: through < from ? from : through, label: 'Custom range' };
  }
  return { id: 'month', from: '2026-11-01', through: '2026-11-30', label: 'November 2026' };
}

function monthKeys(from: string, through: string): Array<{ year: number; month: number; key: string }> {
  const out: Array<{ year: number; month: number; key: string }> = [];
  let year = Number(from.slice(0, 4));
  let month = Number(from.slice(5, 7));
  const endY = Number(through.slice(0, 4));
  const endM = Number(through.slice(5, 7));
  while (year < endY || (year === endY && month <= endM)) {
    out.push({ year, month, key: year + '-' + String(month).padStart(2, '0') });
    month += 1;
    if (month === 13) { month = 1; year += 1; }
  }
  return out;
}

function snapshotSum(ids: FinSchool[], year: number, month: number, kind: 'collected' | 'mrr' | 'net' | 'pastDue'): number {
  return ids.reduce((total, id) => total + snapshotCents(id, year, month, kind), 0);
}

export type FinQuery = {
  scope?: string;
  period?: FinPeriod;
  asOf?: string;
  compare?: FinCompare;
  from?: string;
  through?: string;
};

export type SchoolRow = {
  locationId: FinSchool;
  name: string;
  brand: 'lvlup' | 'goninja';
  merchant: string;
  collectedCents: number;
  goalCents: number;
  goalPct: number | null;
  tone: ReturnType<typeof goalTone>;
  stillExpectedCents: number;
  pastDueCents: number;
  mrrCents: number;
  paying: number;
  armCents: number | null;
  netBillingCents: number;
  attritionPct: number | null;
};

function emptyGoals() {
  return { neu: 0, upgrade: 0, renewal: 0, hold: 0, cancel: 0 };
}

export function financialsSummary(query: FinQuery = {}) {
  const asOf = query.asOf || FIN_AS_OF;
  const scope = query.scope || 'all';
  const ids = schoolsInScope(scope);
  const period = periodRange(query.period || 'month', asOf, { from: query.from, through: query.through });
  const compare = query.compare || 'prev_month';
  const namedMonth = period.id === 'month';

  const collectedRows = namedMonth || period.id === 'custom'
    ? ledgerCharges(ids, period.from, period.through)
    : [];
  let collectedCents = sumAmount(collectedRows);
  if (period.id === 'last') collectedCents = snapshotSum(ids, 2026, 10, 'collected');
  if (period.id === 'ytd') {
    collectedCents = snapshotSum(ids, 2026, 11, 'collected');
    for (let month = 1; month <= 10; month += 1) collectedCents += snapshotSum(ids, 2026, month, 'collected');
  }

  const todayCents = namedMonth ? sumAmount(ledgerCharges(ids, asOf, asOf)) : 0;
  const goalCents = ids.reduce((total, id) => total + (period.id === 'ytd' ? SCHOOL_META[id].goalCents * 11 : SCHOOL_META[id].goalCents), 0);
  const goalPct = pct(collectedCents, goalCents);

  const expectedFrom = asOf > period.from ? asOf : period.from;
  const expectedRows = expectedFrom <= period.through ? stillExpectedDrafts(ids, expectedFrom, period.through) : [];
  const stillExpectedCents = sumAmount(expectedRows);
  const pastDueRows = inScope(PAST_DUE, ids);
  const pastDueMembershipCents = pastDueRows.reduce((total, row) => total + row.overdueCents, 0);
  const pastDueOtherRows = SCHEDULED_OTHER.filter(row => ids.includes(row.locationId) && row.pastDue);
  const pastDueOtherCents = sumAmount(pastDueOtherRows);
  const oldestDays = pastDueRows.reduce((max, row) => Math.max(max, daysBetween(row.dueOn, asOf)), 0);

  const allowanceCents = Math.round(stillExpectedCents * FAILURE_ALLOWANCE_RATE);
  const projectedCents = collectedCents + stillExpectedCents - allowanceCents;

  const movementRows = (namedMonth ? MOVEMENTS : MOVEMENTS.filter(row => row.on >= period.from && row.on <= period.through))
    .filter(row => ids.includes(row.locationId));
  const movementNet = netBilling(namedMonth || period.id === 'custom' ? movementRows : []);
  let net = movementNet;
  if (period.id === 'last') {
    const netCents = snapshotSum(ids, 2026, 10, 'net');
    net = { gainCents: Math.max(0, netCents), lossCents: Math.max(0, -netCents), netCents, holdCents: 0 };
  }
  if (period.id === 'ytd') {
    let netCents = snapshotSum(ids, 2026, 11, 'net');
    for (let month = 1; month <= 10; month += 1) netCents += snapshotSum(ids, 2026, month, 'net');
    net = { gainCents: Math.max(0, netCents), lossCents: 0, netCents, holdCents: movementNet.holdCents };
  }

  const mrr = mrrFor(ids);
  const armCents = mrr.paying ? Math.round(mrr.cents / mrr.paying) : null;
  const stayCohort = MEMBERSHIPS.filter(member => ids.includes(member.locationId) && (isBillingMember(member) || member.status === 'cancelled'));
  const stayMonths = stayCohort.map(member => monthsBetween(member.startedOn, member.endedOn || asOf));
  const stayRaw = stayMonths.length ? stayMonths.reduce((total, months) => total + months, 0) / stayMonths.length : 0;
  const avgStayMonths = stayMonths.length ? Math.round(stayRaw * 10) / 10 : 0;
  const ltvCents = armCents == null ? 0 : Math.round(armCents * stayRaw);

  const goals = ids.reduce((total, id) => {
    const goal = MOVEMENT_GOALS[id];
    total.neu += goal.neu;
    total.upgrade += goal.upgrade;
    total.renewal += goal.renewal;
    total.hold += goal.hold;
    total.cancel += goal.cancel;
    return total;
  }, emptyGoals());
  const countKind = (kinds: MovementKind[]) => movementRows.filter(row => kinds.includes(row.kind)).length;
  const cancels = namedMonth ? countKind(['cancel']) : 0;
  const attritionPct = namedMonth ? pct(cancels, mrr.paying + cancels) : null;

  const expiring: Membership[] = [];
  for (const member of MEMBERSHIPS) {
    if (!ids.includes(member.locationId) || !isBillingMember(member)) continue;
    const next = nextDraftOn(member, asOf);
    if (next && cardExpiresBefore(member.cardExp, next)) expiring.push(member);
  }
  const recentDeclines = pastDueRows.filter(row => daysBetween(row.lastAttempt, asOf) <= 2 && daysBetween(row.lastAttempt, asOf) >= 0);
  const holds = MEMBERSHIPS.filter(member => ids.includes(member.locationId) && member.status === 'hold');
  const sync = SYNC_ERRORS.filter(row => ids.includes(row.locationId));

  const alerts = [
    holds.length ? { id: 'holds', tone: 'bad' as const, title: holds.length + (holds.length === 1 ? ' membership on hold, not billing' : ' memberships on hold, not billing'), filter: 'holds' } : null,
    expiring.length ? { id: 'expiring', tone: 'bad' as const, title: expiring.length + (expiring.length === 1 ? ' card expires before its next draft' : ' cards expire before their next draft'), filter: 'expiring' } : null,
    recentDeclines.length ? { id: 'declines', tone: 'bad' as const, title: recentDeclines.length + (recentDeclines.length === 1 ? ' declined draft in the last 48 hours' : ' declined drafts in the last 48 hours'), filter: 'declines' } : null,
    ...sync.map(row => ({ id: row.id, tone: 'bad' as const, title: row.message, filter: 'sync' })),
  ].filter((row): row is { id: string; tone: 'bad'; title: string; filter: string } => !!row);

  const schools: SchoolRow[] = ids.map(id => {
    const collected = period.id === 'month' || period.id === 'custom'
      ? sumAmount(ledgerCharges([id], period.from, period.through))
      : period.id === 'last'
        ? snapshotCents(id, 2026, 10, 'collected')
        : snapshotCents(id, 2026, 11, 'collected') + Array.from({ length: 10 }, (_, i) => snapshotCents(id, 2026, i + 1, 'collected')).reduce((a, b) => a + b, 0);
    const expected = expectedRows.filter(row => row.locationId === id).reduce((total, row) => total + row.amountCents, 0);
    const past = inScope(PAST_DUE, [id]).reduce((total, row) => total + row.overdueCents, 0);
    const schoolMrr = mrrFor([id]);
    const schoolNet = namedMonth || period.id === 'custom'
      ? netBilling(inScope(MOVEMENTS, [id]).filter(row => row.on >= period.from && row.on <= period.through)).netCents
      : period.id === 'last'
        ? snapshotCents(id, 2026, 10, 'net')
        : snapshotCents(id, 2026, 11, 'net') + Array.from({ length: 10 }, (_, i) => snapshotCents(id, 2026, i + 1, 'net')).reduce((a, b) => a + b, 0);
    const schoolCancels = namedMonth ? inScope(MOVEMENTS, [id]).filter(row => row.kind === 'cancel').length : 0;
    const goal = period.id === 'ytd' ? SCHOOL_META[id].goalCents * 11 : SCHOOL_META[id].goalCents;
    return {
      locationId: id,
      name: SCHOOL_META[id].name,
      brand: SCHOOL_META[id].brand,
      merchant: SCHOOL_META[id].merchant,
      collectedCents: collected,
      goalCents: goal,
      goalPct: pct(collected, goal),
      tone: goalTone(pct(collected, goal)),
      stillExpectedCents: expected,
      pastDueCents: past + pastDueOtherRows.filter(row => row.locationId === id).reduce((total, row) => total + row.amountCents, 0),
      mrrCents: schoolMrr.cents,
      paying: schoolMrr.paying,
      armCents: schoolMrr.paying ? Math.round(schoolMrr.cents / schoolMrr.paying) : null,
      netBillingCents: schoolNet,
      attritionPct: namedMonth ? pct(schoolCancels, schoolMrr.paying + schoolCancels) : null,
    };
  });

  const merchants = Object.entries(MERCHANT_META).map(([key, meta]) => {
    const rows = schools.filter(row => meta.schools.includes(row.locationId));
    if (!rows.length) return null;
    return {
      id: key,
      name: meta.name,
      schools: rows.map(row => row.name),
      collectedCents: rows.reduce((total, row) => total + row.collectedCents, 0),
      pastDueCents: rows.reduce((total, row) => total + row.pastDueCents, 0),
      mrrCents: rows.reduce((total, row) => total + row.mrrCents, 0),
    };
  }).filter((row): row is NonNullable<typeof row> => !!row);

  const batches = ledgerCharges(ids, period.id === 'last' ? period.from : '2026-11-01', period.id === 'last' ? period.through : '2026-11-30')
    .reduce<Record<string, { on: string; merchant: string; amountCents: number; count: number }>>((acc, charge) => {
      const merchant = SCHOOL_META[charge.locationId].merchant;
      const key = charge.on + '|' + merchant;
      if (!acc[key]) acc[key] = { on: charge.on, merchant, amountCents: 0, count: 0 };
      acc[key].amountCents += charge.amountCents;
      acc[key].count += 1;
      return acc;
    }, {});

  const mrrTrend = monthKeys(addDaysIso('2025-12-01', 0), '2026-11-30').map(item => ({
    key: item.key,
    mrrCents: snapshotSum(ids, item.year, item.month, 'mrr'),
    collectedCents: snapshotSum(ids, item.year, item.month, 'collected'),
  }));
  const yoy = Array.from({ length: 11 }, (_, index) => {
    const month = index + 1;
    return {
      month,
      label: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov'][index],
      thisYearCents: snapshotSum(ids, 2026, month, 'collected'),
      lastYearCents: snapshotSum(ids, 2025, month, 'collected'),
    };
  });

  const categoryMap = new Map<FinCategory, number>();
  for (const charge of (namedMonth ? ledgerCharges(ids, '2026-11-01', '2026-11-30') : collectedRows)) {
    categoryMap.set(charge.category, (categoryMap.get(charge.category) || 0) + charge.amountCents);
  }
  const categories = (Object.keys(CATEGORY_LABEL) as FinCategory[]).map(id => ({
    id, label: CATEGORY_LABEL[id], cents: categoryMap.get(id) || 0,
  })).filter(row => row.cents !== 0);

  const programMap = new Map<string, number>();
  for (const charge of ledgerCharges(ids, '2026-11-01', '2026-11-30', charge => countsAsCollected(charge) && charge.category === 'tuition')) {
    programMap.set(charge.plan, (programMap.get(charge.plan) || 0) + charge.amountCents);
  }
  const programs = [...programMap.entries()].map(([label, cents]) => ({ label, cents })).sort((a, b) => b.cents - a.cents);

  const calendarFrom = '2026-11-22';
  const calendarThrough = '2026-12-26';
  const calendarDrafts = stillExpectedDrafts(ids, calendarFrom, calendarThrough);
  const byDay = new Map<string, { on: string; cents: number; count: number }>();
  for (let cursor = calendarFrom; cursor <= calendarThrough; cursor = addDaysIso(cursor, 1)) {
    byDay.set(cursor, { on: cursor, cents: 0, count: 0 });
  }
  for (const draft of calendarDrafts) {
    const cell = byDay.get(draft.on);
    if (!cell) continue;
    cell.cents += draft.amountCents;
    cell.count += 1;
  }

  const compareTo = compare === 'none' ? null : compareTarget(period, compare);
  const compareCollected = compareTo ? snapshotSum(ids, compareTo.year, compareTo.month, 'collected') : null;
  const compareMrr = compareTo ? snapshotSum(ids, compareTo.year, compareTo.month, 'mrr') : null;
  const compareNet = compareTo ? snapshotSum(ids, compareTo.year, compareTo.month, 'net') : null;

  const history = ['2026-10', '2026-09', '2026-08', '2025-11'].map(key => {
    const year = Number(key.slice(0, 4));
    const month = Number(key.slice(5, 7));
    return {
      key,
      label: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][month - 1] + ' ' + year,
      collectedCents: snapshotSum(ids, year, month, 'collected'),
      mrrCents: snapshotSum(ids, year, month, 'mrr'),
      netBillingCents: snapshotSum(ids, year, month, 'net'),
      pastDueCents: snapshotSum(ids, year, month, 'pastDue'),
      paying: ids.reduce((total, id) => total + snapshotCount(id, year, month), 0),
    };
  });

  return {
    fixture: true,
    live: false,
    scope,
    brand: scopeBrand(ids),
    asOf,
    period,
    compare,
    compareLabel: compareTo ? compareTo.label : '',
    deltas: {
      collectedCents: compareCollected == null ? null : collectedCents - compareCollected,
      mrrCents: compareMrr == null ? null : mrr.cents - compareMrr,
      netBillingCents: compareNet == null ? null : net.netCents - compareNet,
    },
    alerts,
    tiles: {
      collected: { cents: collectedCents, todayCents, goalCents, goalPct, tone: goalTone(goalPct) },
      stillExpected: { cents: stillExpectedCents, pastDueMembershipCents, pastDueOtherCents, rows: expectedRows },
      pastDue: {
        cents: pastDueMembershipCents + pastDueOtherCents,
        membershipCents: pastDueMembershipCents,
        otherCents: pastDueOtherCents,
        families: pastDueRows.length + pastDueOtherRows.length,
        retryScheduled: pastDueRows.filter(row => row.nextRetry).length,
        cardExpiring: expiring.length,
        oldestDays,
        rows: pastDueRows,
        otherRows: pastDueOtherRows,
      },
      projected: {
        cents: projectedCents,
        collectedCents,
        expectedCents: stillExpectedCents,
        allowanceCents,
        failureRate: FAILURE_ALLOWANCE_RATE,
        goalCents,
      },
      netBilling: net,
      mrr: { cents: mrr.cents },
      arm: { cents: armCents },
      paying: { count: mrr.paying },
      stay: { months: avgStayMonths, ltvCents, cohort: stayCohort.length },
    },
    movement: {
      named: namedMonth,
      newDay1: countKind(['new_day1']),
      newLater: countKind(['new_later']),
      upgrades: countKind(['upgrade']),
      renewals: countKind(['renewal']),
      holds: countKind(['hold']),
      cancels,
      downgrades: countKind(['downgrade']),
      attritionPct,
      attritionGoalPct: 3,
      attritionOnTrack: attritionPct == null ? true : attritionPct <= 3,
      goals,
      rows: movementRows,
    },
    schools,
    merchants,
    batches: Object.values(batches).sort((a, b) => a.on.localeCompare(b.on) || a.merchant.localeCompare(b.merchant)),
    series: { mrrTrend, yoy },
    categories,
    programs,
    calendar: [...byDay.values()],
    expiring: expiring.map(member => ({
      id: member.id, name: member.name, locationId: member.locationId, plan: member.plan,
      cardExp: member.cardExp, nextDraft: nextDraftOn(member, asOf),
    })),
    holds: holds.map(member => ({
      id: member.id, name: member.name, locationId: member.locationId, plan: member.plan,
      holdStart: member.holdStart, holdEnd: member.holdEnd,
      monthlyCents: monthlyEquivalentCents(member.amountCents, member.cadence, member.prepaidMonths),
    })),
    history,
    mrrRows: mrr.rows.map(member => ({
      id: member.id, name: member.name, locationId: member.locationId, plan: member.plan, program: member.program,
      cadence: member.cadence, amountCents: member.amountCents, listCents: member.listCents, discountPct: member.discountPct,
      monthlyCents: monthlyEquivalentCents(member.amountCents, member.cadence, member.prepaidMonths),
      status: member.status,
    })),
    definitions: {
      collected: 'Successful charges captured or settled in the period, all methods, net of refunds, by the membership’s school. Pre-tax. Counted on the charge date.',
      stillExpected: 'Scheduled drafts from today through the period end that have not been captured. A 4-week plan can appear twice in one month. Holds are skipped unless the hold ends before the draft.',
      pastDue: 'Open overdue membership balances plus past-due event schedules. Not added into Still Expected or Projected.',
      projected: 'Collected plus still expected, minus a 4% sandbox decline allowance on the still-expected amount.',
      netBilling: 'Gain minus loss in monthly-equivalent recurring. Monthly plans count once. 4-week plans count as price × 13/12. Holds are separate. Downgrades are a loss.',
      mrr: 'Monthly-equivalent price of active and past-due memberships. Holds, trials, comps, and cancellations are zero.',
      arm: 'MRR divided by paying members (students, not families).',
      stay: 'Average whole months from the start date to cancel, or to today if still active. LTV is ARM times that average.',
    },
  };
}

function compareTarget(period: PeriodRange, compare: FinCompare): { year: number; month: number; label: string } | null {
  if (compare === 'none') return null;
  const year = Number(period.from.slice(0, 4));
  const month = Number(period.from.slice(5, 7));
  if (compare === 'prev_year') {
    const label = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][month - 1] + ' ' + (year - 1);
    return { year: year - 1, month, label };
  }
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const label = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][prevMonth - 1] + ' ' + prevYear;
  return { year: prevYear, month: prevMonth, label };
}

export type ReportTable = {
  id: string;
  title: string;
  about: string;
  columns: string[];
  rows: string[][];
  totalLabel: string;
  totalCents: number | null;
};

function moneyCell(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function financialReport(id: string, query: FinQuery = {}): ReportTable {
  const found = REPORTS.find(report => report.id === id);
  if (!found) throw new Error('Unknown report ' + id);
  const summary = financialsSummary(query);
  const ids = schoolsInScope(summary.scope);
  const from = query.from || summary.period.from;
  const through = query.through || summary.period.through;
  const charges = ledgerCharges(ids, from, through, () => true).filter(charge => charge.on >= from && charge.on <= through);
  const collected = charges.filter(countsAsCollected);

  if (id === 'transactions' || id === 'end-of-day') {
    const source = id === 'end-of-day' ? collected.filter(charge => charge.on === summary.asOf) : collected;
    const rows = source.map(charge => [
      charge.on, charge.name, SCHOOL_META[charge.locationId].name, charge.plan, charge.method, charge.authStatus, moneyCell(charge.amountCents),
    ]);
    const total = sumAmount(source);
    if (id === 'end-of-day') {
      rows.push(['MTD', 'Collected in the open view', '', '', '', '', moneyCell(summary.tiles.collected.cents)]);
    }
    return {
      ...found, columns: ['Date', 'Name', 'School', 'Plan', 'Method', 'Status', 'Amount'],
      rows, totalLabel: 'TOTAL', totalCents: total,
    };
  }
  if (id === 'by-category') {
    const map = new Map<string, number>();
    for (const charge of collected) map.set(CATEGORY_LABEL[charge.category], (map.get(CATEGORY_LABEL[charge.category]) || 0) + charge.amountCents);
    const rows = [...map.entries()].map(([label, cents]) => [label, moneyCell(cents)]);
    return { ...found, columns: ['Category', 'Amount'], rows, totalLabel: 'TOTAL', totalCents: sumAmount(collected) };
  }
  if (id === 'by-membership') {
    const map = new Map<string, number>();
    const tuition = collected.filter(charge => charge.category === 'tuition');
    for (const charge of tuition) map.set(charge.plan, (map.get(charge.plan) || 0) + charge.amountCents);
    const rows = [...map.entries()].map(([label, cents]) => [label, moneyCell(cents)]);
    return { ...found, columns: ['Plan', 'Amount'], rows, totalLabel: 'TOTAL', totalCents: sumAmount(tuition) };
  }
  if (id === 'forecast') {
    const drafts = stillExpectedDrafts(ids, from, through);
    const rows = drafts.map(draft => [draft.on, draft.name, SCHOOL_META[draft.locationId].name, draft.frequency, moneyCell(draft.amountCents)]);
    return { ...found, columns: ['Date', 'Name', 'School', 'Frequency', 'Amount'], rows, totalLabel: 'TOTAL', totalCents: sumAmount(drafts) };
  }
  if (id === 'gross-history') {
    const rows = summary.series.yoy.map(item => [item.label, moneyCell(item.thisYearCents), moneyCell(item.lastYearCents), moneyCell(item.thisYearCents - item.lastYearCents)]);
    const total = summary.series.yoy.reduce((sum, item) => sum + item.thisYearCents, 0);
    return { ...found, columns: ['Month', '2026', '2025', 'Change'], rows, totalLabel: 'TOTAL 2026', totalCents: total };
  }
  if (id === 'refunds' || id === 'credits') {
    const rows = collected.filter(charge => charge.amountCents < 0).map(charge => [
      charge.on, charge.name, SCHOOL_META[charge.locationId].name, charge.plan, moneyCell(charge.amountCents),
    ]);
    const total = sumAmount(collected.filter(charge => charge.amountCents < 0));
    return { ...found, columns: ['Date', 'Name', 'School', 'Plan', 'Amount'], rows, totalLabel: 'TOTAL', totalCents: total };
  }
  if (id === 'autocharge') {
    const fromCharges: Attempt[] = charges.filter(charge => charge.method === 'card').map(charge => ({
      id: charge.id, name: charge.name, locationId: charge.locationId, on: charge.on, amountCents: charge.amountCents,
      status: charge.status === 'declined' ? 'declined' as const : 'approved' as const,
      reason: charge.status === 'declined' ? 'Declined' : '',
      plan: charge.plan,
    }));
    const extras = EXTRA_ATTEMPTS.filter(row => ids.includes(row.locationId) && row.on >= from && row.on <= through);
    const rows = [...fromCharges, ...extras]
      .sort((a, b) => a.on.localeCompare(b.on) || a.name.localeCompare(b.name))
      .map(row => [row.on, row.name, SCHOOL_META[row.locationId].name, row.plan, row.status, row.reason, moneyCell(row.amountCents)]);
    return { ...found, columns: ['Date', 'Name', 'School', 'Plan', 'Status', 'Reason', 'Amount'], rows, totalLabel: 'ATTEMPTS', totalCents: null };
  }
  if (id === 'past-due') {
    const rows = inScope(PAST_DUE, ids).map(row => [
      row.name, SCHOOL_META[row.locationId].name, row.plan, String(row.attempts), row.lastAttempt, row.declineReason,
      row.method + (row.last4 ? ' ···· ' + row.last4 : ''), row.nextRetry || '—', moneyCell(row.overdueCents),
    ]);
    return {
      ...found, columns: ['Family', 'School', 'Plan', 'Attempts', 'Last attempt', 'Decline reason', 'Method', 'Next retry', 'Overdue'],
      rows, totalLabel: 'TOTAL', totalCents: inScope(PAST_DUE, ids).reduce((total, row) => total + row.overdueCents, 0),
    };
  }
  if (id === 'sales-tax') {
    const taxed = collected.filter(charge => charge.taxCents);
    const rows = taxed.map(charge => [charge.on, charge.name, SCHOOL_META[charge.locationId].name, moneyCell(charge.amountCents), moneyCell(charge.taxCents)]);
    const total = taxed.reduce((sum, charge) => sum + charge.taxCents, 0);
    return { ...found, columns: ['Date', 'Name', 'School', 'Pre-tax', 'Tax'], rows, totalLabel: 'TAX', totalCents: total };
  }
  if (id === 'down-payments') {
    const rows = collected.filter(charge => charge.firstCharge).map(charge => [
      charge.on, charge.name, SCHOOL_META[charge.locationId].name, charge.plan, moneyCell(charge.amountCents),
    ]);
    return { ...found, columns: ['Date', 'Name', 'School', 'Plan', 'Amount'], rows, totalLabel: 'TOTAL', totalCents: sumAmount(collected.filter(charge => charge.firstCharge)) };
  }
  if (id === 'scheduled') {
    const paid = collected.filter(charge => charge.category === 'events' || charge.category === 'parties' || charge.category === 'camps');
    const unpaid = SCHEDULED_OTHER.filter(row => ids.includes(row.locationId));
    const rows = [
      ...paid.map(charge => [charge.on, charge.name, charge.plan, 'Paid', moneyCell(charge.amountCents)]),
      ...unpaid.map(row => [row.on, row.name, row.label, row.pastDue ? 'Unpaid' : 'Unpaid', moneyCell(row.amountCents)]),
    ];
    return { ...found, columns: ['Date', 'Name', 'Item', 'Status', 'Amount'], rows, totalLabel: 'UNPAID', totalCents: sumAmount(unpaid) };
  }
  if (id === 'items-sold') {
    const rows = collected.filter(charge => charge.category === 'proshop' && charge.amountCents > 0).map(charge => [
      charge.on, charge.name, SCHOOL_META[charge.locationId].name, charge.plan, moneyCell(charge.amountCents),
    ]);
    return { ...found, columns: ['Date', 'Name', 'School', 'Item', 'Amount'], rows, totalLabel: 'TOTAL', totalCents: sumAmount(collected.filter(charge => charge.category === 'proshop' && charge.amountCents > 0)) };
  }
  if (id === 'ach') {
    return { ...found, columns: ['School', 'Status'], rows: [['All schools in this preview', 'Card, cash, or check. No ACH.']], totalLabel: 'TOTAL', totalCents: 0 };
  }
  const rows = summary.history.map(row => [row.label, moneyCell(row.collectedCents), moneyCell(row.mrrCents), moneyCell(row.netBillingCents), moneyCell(row.pastDueCents), String(row.paying)]);
  return { ...found, columns: ['Month', 'Collected', 'MRR', 'Net billing', 'Past due', 'Paying'], rows, totalLabel: 'SNAPSHOTS', totalCents: null };
}

export function toCsv(columns: string[], rows: Array<Array<string | number>>): string {
  const esc = (value: string | number) => {
    const text = String(value);
    if (/[",\n]/.test(text)) return '"' + text.replace(/"/g, '""') + '"';
    return text;
  };
  return [columns, ...rows].map(row => row.map(esc).join(',')).join('\n') + '\n';
}

export function scopeAllowed(actor: { role: string; locationIds?: string[] }, scope: string): boolean {
  if (actor.role === 'admin') return true;
  if (scope === 'all' || scope === 'lvlup' || scope === 'goninja') return false;
  return !!actor.locationIds?.includes(scope);
}
