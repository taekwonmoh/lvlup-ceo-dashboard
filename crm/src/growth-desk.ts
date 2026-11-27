/**
 * Category fee pass-through, lead pipeline, smart lists, reviews,
 * referrals, and the owner question bar.
 * Sample families only. Nothing is sent or charged.
 * Pro Shop never passes a processing fee. Belt tests stay at $0.
 */
import { assertStaff, type Actor } from './auth.ts';
import { findCardPayload } from './charge-gate.ts';
import { CrmError } from './errors.ts';
import { HOME_FIXTURE, HOME_SCHOOLS } from './home.ts';
import type { SqlPool } from './query.ts';

export type FeeSchedule = {
  cardBps: number;
  cardFixedCents: number;
  achMode: 'percent' | 'flat';
  achBps: number;
  achFlatCents: number;
  tuition: boolean;
  events: boolean;
  parties: boolean;
};

export const DEFAULT_FEE_SCHEDULE: FeeSchedule = {
  cardBps: 290,
  cardFixedCents: 30,
  achMode: 'percent',
  achBps: 80,
  achFlatCents: 0,
  tuition: true,
  events: false,
  parties: false,
};

export type FeeGroup = 'tuition' | 'proshop' | 'events' | 'parties' | 'belt_test' | 'other';

export function feeGroup(categoryId: string): FeeGroup {
  if (categoryId === 'tuition' || categoryId === 'gn_classes' || categoryId === 'gn_after_school' || categoryId === 'private_lessons') return 'tuition';
  if (categoryId === 'retail' || categoryId === 'gn_retail') return 'proshop';
  if (categoryId === 'events' || categoryId === 'gn_events' || categoryId === 'tournaments' || categoryId === 'gn_summer_camp') return 'events';
  if (categoryId === 'lvlup_parties' || categoryId === 'gn_parties') return 'parties';
  if (categoryId === 'belt_test') return 'belt_test';
  return 'other';
}

export function cleanFeeSchedule(input: Partial<FeeSchedule> | null | undefined): FeeSchedule {
  const base = { ...DEFAULT_FEE_SCHEDULE, ...(input || {}) };
  const bps = (value: number) => Math.min(10000, Math.max(0, Math.round(Number(value) || 0)));
  const cents = (value: number) => Math.max(0, Math.round(Number(value) || 0));
  return {
    cardBps: bps(base.cardBps),
    cardFixedCents: cents(base.cardFixedCents),
    achMode: base.achMode === 'flat' ? 'flat' : 'percent',
    achBps: bps(base.achBps),
    achFlatCents: cents(base.achFlatCents),
    tuition: base.tuition !== false,
    events: base.events === true,
    parties: base.parties === true,
  };
}

export function policyFeeCents(line: { categoryId: string; grossCents: number; creditCents?: number; method?: string }, schedule: FeeSchedule): number {
  const captured = Math.max(0, line.grossCents - (line.creditCents || 0));
  if (captured <= 0) return 0;
  const group = feeGroup(line.categoryId);
  if (group === 'proshop' || group === 'belt_test' || group === 'other') return 0;
  const method = line.method === 'ach' ? 'ach' : line.method === 'card' ? 'card' : 'other';
  if (method === 'other') return 0;
  const on = group === 'tuition' ? schedule.tuition : group === 'events' ? schedule.events : schedule.parties;
  if (!on) return 0;
  if (method === 'ach') {
    if (schedule.achMode === 'flat') return schedule.achFlatCents;
    return Math.round(captured * schedule.achBps / 10000);
  }
  return Math.round(captured * schedule.cardBps / 10000) + schedule.cardFixedCents;
}

export function feePreview(schedule: FeeSchedule) {
  const tuition = { categoryId: 'tuition', grossCents: 20900, method: 'card' as const };
  const shop = { categoryId: 'retail', grossCents: 4500, method: 'card' as const };
  const party = { categoryId: 'lvlup_parties', grossCents: 21900, method: 'card' as const };
  const belt = { categoryId: 'belt_test', grossCents: 0, method: 'card' as const };
  return {
    charges: false as const,
    sends: false as const,
    proshopLocked: true as const,
    beltTestFeeCents: 0 as const,
    feeModel: 'included_2027' as const,
    schedule,
    tuitionCents: 20900,
    shopCents: 4500,
    partyCents: 21900,
    cardTuitionFeeCents: policyFeeCents(tuition, schedule),
    achTuitionFeeCents: policyFeeCents({ ...tuition, method: 'ach' }, schedule),
    cardShopFeeCents: policyFeeCents(shop, schedule),
    achShopFeeCents: policyFeeCents({ ...shop, method: 'ach' }, schedule),
    cardPartyFeeCents: policyFeeCents(party, schedule),
    beltTestPassedCents: policyFeeCents(belt, schedule),
  };
}

export type FeeLine = { categoryId: string; grossCents: number; creditCents?: number; method?: string };

export function feeRollup(lines: FeeLine[], schedule: FeeSchedule) {
  const groups: FeeGroup[] = ['tuition', 'proshop', 'events', 'parties', 'belt_test'];
  return {
    charges: false as const,
    schedule,
    groups: groups.map(group => {
      const rows = lines.filter(line => feeGroup(line.categoryId) === group);
      const grossCents = rows.reduce((sum, line) => sum + line.grossCents, 0);
      const feeCents = rows.reduce((sum, line) => sum + policyFeeCents(line, schedule), 0);
      return { group, count: rows.length, grossCents, feeCents, passed: group === 'tuition' ? schedule.tuition : group === 'events' ? schedule.events : group === 'parties' ? schedule.parties : false };
    }),
  };
}

export type Stage = 'new' | 'booked' | 'showed' | 'noshow' | 'enrolled';

export type LeadCard = {
  id: string;
  first: string;
  last: string;
  school: string;
  schoolName: string;
  source: string;
  stage: Stage;
  since: string;
  program: string;
};

export const PIPELINE: LeadCard[] = [
  { id: 'casey', first: 'Casey', last: 'Sample', school: 'waunakee', schoolName: 'LVLUP Waunakee', source: 'Website', stage: 'new', since: '2026-11-25', program: 'Taekwondo' },
  { id: 'indigo', first: 'Indigo', last: 'Sample', school: 'verona', schoolName: 'LVLUP Verona', source: 'Facebook', stage: 'new', since: '2026-11-16', program: 'Taekwondo' },
  { id: 'sage', first: 'Sage', last: 'Sample', school: 'eastmad', schoolName: 'LVLUP East Madison', source: 'Google', stage: 'booked', since: '2026-11-26', program: 'Taekwondo' },
  { id: 'logan', first: 'Logan', last: 'Sample', school: 'deforest', schoolName: 'LVLUP DeForest', source: 'Walk-in', stage: 'showed', since: '2026-11-22', program: 'Taekwondo' },
  { id: 'skyler', first: 'Skyler', last: 'Sample', school: 'goninjaV', schoolName: 'Go Ninja Verona', source: 'Website', stage: 'noshow', since: '2026-11-12', program: 'Go Ninja' },
  { id: 'perry', first: 'Perry', last: 'Sample', school: 'goninjaW', schoolName: 'Go Ninja Waunakee', source: 'Referral', stage: 'enrolled', since: '2026-11-20', program: 'Go Ninja' },
];

export const STAGES: Array<{ id: Stage; title: string }> = [
  { id: 'new', title: 'New Lead' },
  { id: 'booked', title: 'Trial Booked' },
  { id: 'showed', title: 'Showed' },
  { id: 'noshow', title: 'No-Show' },
  { id: 'enrolled', title: 'Enrolled' },
];

function daysBetween(from: string, to: string) {
  const a = Date.parse(from + 'T00:00:00Z');
  const b = Date.parse(to + 'T00:00:00Z');
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86400000);
}

export function pipelineBoard(asOf: string, moves: Record<string, { stage: Stage; since: string }> = {}) {
  const cards = PIPELINE.map(card => {
    const move = moves[card.id];
    const stage = move?.stage || card.stage;
    const since = move?.since || card.since;
    const days = Math.max(0, daysBetween(since, asOf));
    return { ...card, stage, since, daysInStage: days, stalled: stage !== 'enrolled' && days >= 7 };
  });
  return {
    asOf,
    charges: false as const,
    sends: false as const,
    stages: STAGES.map(stage => ({ ...stage, cards: cards.filter(card => card.stage === stage.id) })),
  };
}

export type RosterPerson = {
  id: string;
  first: string;
  last: string;
  role: 'student' | 'lead';
  school: string;
  program: string;
  rank: string;
  source: string;
  tag: string;
  streak: 'active' | 'miss14';
  birthday: string;
  enrolledOn: string | null;
};

export const ROSTER: RosterPerson[] = [
  { id: 'riley', first: 'Riley', last: 'Sample', role: 'student', school: 'waunakee', program: 'Taekwondo', rank: 'Yellow', source: 'Referral', tag: 'Active', streak: 'active', birthday: '11-30', enrolledOn: '2026-06-01' },
  { id: 'morgan', first: 'Morgan', last: 'Sample', role: 'student', school: 'waunakee', program: 'Taekwondo', rank: 'Yellow', source: 'Website', tag: 'Active', streak: 'active', birthday: '03-02', enrolledOn: '2026-08-15' },
  { id: 'rowan', first: 'Rowan', last: 'Sample', role: 'student', school: 'waunakee', program: 'Taekwondo', rank: 'Camo', source: 'Walk-in', tag: 'Active', streak: 'miss14', birthday: '12-09', enrolledOn: '2026-04-01' },
  { id: 'harper', first: 'Harper', last: 'Sample', role: 'student', school: 'eastmad', program: 'Taekwondo', rank: 'Green', source: 'Google', tag: 'Active', streak: 'active', birthday: '12-06', enrolledOn: '2026-01-10' },
  { id: 'finley', first: 'Finley', last: 'Sample', role: 'student', school: 'eastmad', program: 'Taekwondo', rank: 'White', source: 'Facebook', tag: 'Active', streak: 'miss14', birthday: '01-14', enrolledOn: '2026-10-20' },
  { id: 'blake', first: 'Blake', last: 'Sample', role: 'student', school: 'verona', program: 'Taekwondo', rank: 'Red', source: 'Website', tag: 'Active', streak: 'active', birthday: '07-04', enrolledOn: '2025-09-01' },
  { id: 'quinn', first: 'Quinn', last: 'Sample', role: 'student', school: 'deforest', program: 'Taekwondo', rank: 'Green', source: 'Referral', tag: 'Active', streak: 'miss14', birthday: '12-11', enrolledOn: '2026-02-02' },
  { id: 'avery', first: 'Avery', last: 'Sample', role: 'student', school: 'goninjaW', program: 'Go Ninja', rank: 'White', source: 'Website', tag: 'Active', streak: 'miss14', birthday: '12-04', enrolledOn: '2026-09-01' },
  { id: 'robin', first: 'Robin', last: 'Sample', role: 'student', school: 'goninjaW', program: 'Go Ninja', rank: 'Yellow', source: 'Walk-in', tag: 'Active', streak: 'active', birthday: '05-20', enrolledOn: '2026-09-01' },
  { id: 'taylor', first: 'Taylor', last: 'Sample', role: 'student', school: 'goninjaV', program: 'Go Ninja', rank: 'Orange', source: 'Google', tag: 'Active', streak: 'active', birthday: '08-18', enrolledOn: '2026-03-03' },
  { id: 'casey', first: 'Casey', last: 'Sample', role: 'lead', school: 'waunakee', program: 'Taekwondo', rank: 'New', source: 'Website', tag: 'Trial', streak: 'active', birthday: '04-04', enrolledOn: null },
  { id: 'indigo', first: 'Indigo', last: 'Sample', role: 'lead', school: 'verona', program: 'Taekwondo', rank: 'New', source: 'Facebook', tag: 'Trial', streak: 'active', birthday: '09-09', enrolledOn: null },
  { id: 'skyler', first: 'Skyler', last: 'Sample', role: 'lead', school: 'goninjaV', program: 'Go Ninja', rank: 'New', source: 'Website', tag: 'No-show', streak: 'miss14', birthday: '06-06', enrolledOn: null },
];

export type ListFilters = {
  role?: 'student' | 'lead' | 'any';
  rank?: string;
  program?: string;
  school?: string;
  source?: string;
  tag?: string;
  streak?: 'active' | 'miss14' | 'any';
};

export function runSmartList(filters: ListFilters) {
  return ROSTER.filter(person => {
    if (filters.role && filters.role !== 'any' && person.role !== filters.role) return false;
    if (filters.rank && person.rank !== filters.rank) return false;
    if (filters.program && person.program !== filters.program) return false;
    if (filters.school && person.school !== filters.school) return false;
    if (filters.source && person.source !== filters.source) return false;
    if (filters.tag && person.tag !== filters.tag) return false;
    if (filters.streak && filters.streak !== 'any' && person.streak !== filters.streak) return false;
    return true;
  });
}

export const SAVED_LISTS = [
  { id: 'yellow-lvlup', name: 'Yellow belts', filters: { role: 'student' as const, rank: 'Yellow', program: 'Taekwondo' } },
  { id: 'miss-14', name: 'Missed 14 days', filters: { role: 'student' as const, streak: 'miss14' as const } },
  { id: 'web-trials', name: 'Website trials', filters: { role: 'lead' as const, source: 'Website' } },
];

export type ReviewRow = {
  id: string;
  personId: string;
  name: string;
  school: string;
  schoolName: string;
  rule: 'enrolled_30' | 'first_test' | 'party';
  ruleLabel: string;
  status: 'pending' | 'asked' | 'posted';
};

export const REVIEWS: ReviewRow[] = [
  { id: 'rev-harper', personId: 'harper', name: 'Harper Sample', school: 'eastmad', schoolName: 'LVLUP East Madison', rule: 'enrolled_30', ruleLabel: '30 days enrolled', status: 'pending' },
  { id: 'rev-morgan', personId: 'morgan', name: 'Morgan Sample', school: 'waunakee', schoolName: 'LVLUP Waunakee', rule: 'first_test', ruleLabel: 'First belt test', status: 'asked' },
  { id: 'rev-avery', personId: 'avery', name: 'Avery Sample', school: 'goninjaW', schoolName: 'Go Ninja Waunakee', rule: 'party', ruleLabel: 'Birthday party', status: 'posted' },
];

export const REFERRALS = [
  { id: 'ref-jordan', referrer: 'Jordan Sample', friend: 'Riley Sample', school: 'waunakee', schoolName: 'LVLUP Waunakee', perk: 'Buddy pass', status: 'earned' },
  { id: 'ref-harper', referrer: 'Harper Sample', friend: 'Finley Sample', school: 'eastmad', schoolName: 'LVLUP East Madison', perk: 'Class credit', status: 'used' },
  { id: 'ref-robin', referrer: 'Robin Sample', friend: 'Perry Sample', school: 'goninjaW', schoolName: 'Go Ninja Waunakee', perk: 'Buddy pass', status: 'earned' },
];

export function upcomingBirthdays(asOf: string, withinDays = 14) {
  const start = Date.parse(asOf + 'T00:00:00Z');
  return ROSTER.filter(person => person.role === 'student').map(person => {
    const [month, day] = person.birthday.split('-').map(Number);
    const year = Number(asOf.slice(0, 4));
    let when = Date.UTC(year, month - 1, day);
    if (when < start) when = Date.UTC(year + 1, month - 1, day);
    const days = Math.round((when - start) / 86400000);
    return { id: person.id, name: person.first + ' ' + person.last, school: person.school, program: person.program, days, on: new Date(when).toISOString().slice(0, 10) };
  }).filter(row => row.days >= 0 && row.days <= withinDays).sort((a, b) => a.days - b.days);
}

export function priorityFeed(asOf: string, moves: Record<string, { stage: Stage; since: string }> = {}) {
  const board = pipelineBoard(asOf, moves);
  const stalled = board.stages.flatMap(stage => stage.cards).filter(card => card.stalled);
  const risk = ROSTER.filter(person => person.streak === 'miss14' && person.role === 'student').map(person => ({
    id: person.id,
    name: person.first + ' ' + person.last,
    schoolName: schoolName(person.school),
    reason: 'Attendance dropped. No check-in in 14 days.',
  }));
  const birthdays = upcomingBirthdays(asOf, 14);
  const items = [
    ...risk.slice(0, 3).map(row => ({ id: 'risk-' + row.id, kind: 'risk' as const, title: row.name + ' may quit', detail: row.reason + ' ' + row.schoolName, personId: row.id })),
    ...stalled.slice(0, 2).map(card => ({ id: 'lead-' + card.id, kind: 'lead' as const, title: card.first + ' ' + card.last + ' has not moved', detail: card.daysInStage + ' days in ' + (STAGES.find(stage => stage.id === card.stage)?.title || card.stage) + '. ' + card.schoolName, personId: card.id })),
    ...birthdays.slice(0, 2).map(row => ({ id: 'bday-' + row.id, kind: 'birthday' as const, title: row.name + ' has a birthday in ' + row.days + ' days', detail: 'Draft a buddy-pass note for ' + row.program + '. Nothing is sent.', personId: row.id })),
  ];
  return { asOf, charges: false as const, sends: false as const, items };
}

function schoolName(id: string) {
  const names: Record<string, string> = {
    waunakee: 'LVLUP Waunakee', verona: 'LVLUP Verona', eastmad: 'LVLUP East Madison',
    deforest: 'LVLUP DeForest', goninjaW: 'Go Ninja Waunakee', goninjaV: 'Go Ninja Verona',
  };
  return names[id] || id;
}

export function answerQuestion(question: string, asOf: string) {
  const q = String(question || '').toLowerCase();
  if (/risk|quit|miss/.test(q)) {
    const rows = ROSTER.filter(person => person.streak === 'miss14' && person.role === 'student');
    return { title: 'Students at risk of quitting', kind: 'list' as const, detail: 'Attendance dropped off the sample roster.', rows: rows.map(person => person.first + ' ' + person.last + ' · ' + schoolName(person.school)), charges: false as const, sends: false as const };
  }
  if (/revenue|next month|project/.test(q)) {
    const rows = HOME_SCHOOLS.map(id => {
      const school = HOME_FIXTURE[id];
      return schoolName(id) + ' · drafts ' + money(school.scheduledCents);
    });
    return { title: 'Projected revenue next month', kind: 'money' as const, detail: 'Sandbox scheduled drafts. This is not a GymDesk total.', rows, charges: false as const, sends: false as const };
  }
  if (/trial|conversion|best school/.test(q)) {
    const ranked = HOME_SCHOOLS.map(id => {
      const school = HOME_FIXTURE[id];
      const pct = school.trialsShown ? Math.round((school.day1Closes / school.trialsShown) * 100) : 0;
      return { name: schoolName(id), pct, closes: school.day1Closes, shown: school.trialsShown };
    }).sort((a, b) => b.pct - a.pct || b.closes - a.closes);
    const best = ranked[0];
    return {
      title: 'Best trial conversion',
      kind: 'school' as const,
      detail: best.name + ' closes ' + best.pct + '% of trials that show (' + best.closes + ' of ' + best.shown + ').',
      rows: ranked.map(row => row.name + ' · ' + row.pct + '%'),
      charges: false as const,
      sends: false as const,
    };
  }
  if (/birthday/.test(q)) {
    const rows = upcomingBirthdays(asOf, 14).map(row => row.name + ' · ' + row.on + ' · ' + row.days + ' days');
    return { title: 'Birthdays in the next 14 days', kind: 'list' as const, detail: 'Buddy-pass drafts stay in the CRM.', rows, charges: false as const, sends: false as const };
  }
  return { title: 'Pick a question', kind: 'empty' as const, detail: 'Ask about risk, next month revenue, trial conversion, or birthdays.', rows: [] as string[], charges: false as const, sends: false as const };
}

function money(cents: number) {
  return '$' + Math.round(cents / 100).toLocaleString('en-US');
}

const OFF = { charges: false as const, sends: false as const, sent: false as const };

function rejectUnsafe(body: Record<string, unknown>) {
  if (findCardPayload(body)) throw new CrmError(400, 'card_not_allowed', 'Card numbers are not accepted.');
  const walk = (value: unknown) => {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (/phone|sms|^tel$/i.test(key)) throw new CrmError(400, 'contact_not_allowed', 'This form does not take a phone number.');
      if (typeof child === 'string' && /tel:|sms:/i.test(child)) throw new CrmError(400, 'contact_not_allowed', 'This form does not take a phone number.');
      walk(child);
    }
  };
  walk(body);
}

function dbOptional(err: unknown) {
  const code = err && typeof err === 'object' ? String((err as { code?: string }).code || '') : '';
  return code === '42P01' || code === '42703' || code === 'database_unconfigured' || code === 'ECONNREFUSED' || code === '3D000';
}

async function optionalQuery(pool: SqlPool, sql: string, params: unknown[] = []) {
  try { return await pool.query(sql, params); }
  catch (err) {
    if (dbOptional(err)) return null;
    throw err;
  }
}

export async function readFeeSchedule(pool: { query: (sql: string, params?: unknown[]) => Promise<{ rows?: Array<Record<string, unknown>> }> }): Promise<FeeSchedule> {
  let res: { rows?: Array<Record<string, unknown>> } | null = null;
  try {
    res = await pool.query('select card_bps, card_fixed_cents, ach_mode, ach_bps, ach_flat_cents, tuition_on, events_on, parties_on from fee_pass_settings where id = $1', ['default']);
  } catch (err) {
    if (dbOptional(err)) return { ...DEFAULT_FEE_SCHEDULE };
    throw err;
  }
  const row = res?.rows?.[0];
  if (!row) return { ...DEFAULT_FEE_SCHEDULE };
  return cleanFeeSchedule({
    cardBps: Number(row.card_bps),
    cardFixedCents: Number(row.card_fixed_cents),
    achMode: row.ach_mode === 'flat' ? 'flat' : 'percent',
    achBps: Number(row.ach_bps),
    achFlatCents: Number(row.ach_flat_cents),
    tuition: row.tuition_on !== false,
    events: row.events_on === true,
    parties: row.parties_on === true,
  });
}

function assertDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new CrmError(400, 'bad_date', 'Use a calendar date.');
  return value;
}

export async function handleGrowth(input: {
  method: string;
  parts: string[];
  search: URLSearchParams;
  actor: Actor;
  body: Record<string, unknown>;
  pool: SqlPool;
}): Promise<{ status: number; body: unknown }> {
  assertStaff(input.actor);
  rejectUnsafe(input.body);
  const asOf = assertDate(input.search.get('asOf') || String(input.body.asOf || '2026-11-27'));
  const { method, body, pool } = input;

  if (method === 'GET') {
    const schedule = await readFeeSchedule(pool);
    return {
      status: 200,
      body: {
        ...OFF,
        asOf,
        fees: feePreview(schedule),
        pipeline: pipelineBoard(asOf),
        lists: SAVED_LISTS.map(list => ({ ...list, count: runSmartList(list.filters).length })),
        reviews: REVIEWS,
        referrals: REFERRALS,
        priorities: priorityFeed(asOf),
        birthdays: upcomingBirthdays(asOf, 14),
        chat: { enabled: false, sends: false, preview: 'Hi, I can book a trial. This preview does not message anyone.' },
      },
    };
  }

  if (method !== 'POST') return { status: 404, body: { error: { code: 'not_found', message: 'Not found.' } } };
  const action = String(body.action || '');

  if (action === 'fees') {
    const schedule = cleanFeeSchedule(body.schedule as Partial<FeeSchedule>);
    const saved = await optionalQuery(
      pool,
      `insert into fee_pass_settings (id, card_bps, card_fixed_cents, ach_mode, ach_bps, ach_flat_cents, tuition_on, events_on, parties_on, proshop_on, belt_test_fee_cents)
       values ('default', $1, $2, $3, $4, $5, $6, $7, $8, false, 0)
       on conflict (id) do update set card_bps = excluded.card_bps, card_fixed_cents = excluded.card_fixed_cents, ach_mode = excluded.ach_mode, ach_bps = excluded.ach_bps, ach_flat_cents = excluded.ach_flat_cents, tuition_on = excluded.tuition_on, events_on = excluded.events_on, parties_on = excluded.parties_on, proshop_on = false, belt_test_fee_cents = 0, updated_at = now()
       returning id`,
      [schedule.cardBps, schedule.cardFixedCents, schedule.achMode, schedule.achBps, schedule.achFlatCents, schedule.tuition, schedule.events, schedule.parties],
    );
    return { status: 200, body: { ...feePreview(schedule), persisted: !!saved, proshopOn: false, beltTestFeeCents: 0 } };
  }

  if (action === 'pipeline') {
    const card = PIPELINE.find(row => row.id === String(body.personKey || ''));
    const stage = String(body.stage || '');
    if (!card || !STAGES.some(row => row.id === stage)) throw new CrmError(400, 'bad_stage', 'Move the lead to a pipeline column.');
    const saved = await optionalQuery(
      pool,
      `insert into lead_pipeline (person_key, stage, source, location_id, stage_since)
       values ($1, $2, $3, $4, $5)
       on conflict (person_key) do update set stage = excluded.stage, stage_since = excluded.stage_since, updated_at = now()
       returning person_key`,
      [card.id, stage, card.source, card.school, asOf],
    );
    return { status: 200, body: { personKey: card.id, stage, since: asOf, persisted: !!saved, ...OFF } };
  }

  if (action === 'list-draft') {
    const filters = (body.filters || {}) as ListFilters;
    const people = runSmartList(filters);
    if (!people.length) throw new CrmError(400, 'empty_list', 'That list is empty.');
    return {
      status: 201,
      body: {
        count: people.length,
        body: 'Hello from the studio. This note is a draft for ' + people.length + ' sample families. Nothing was sent.',
        people: people.map(person => person.id),
        persisted: false,
        ...OFF,
      },
    };
  }

  if (action === 'review' || action === 'reactivate' || action === 'birthday' || action === 'priority') {
    const name = String(body.name || 'the family').replace(/[^\w .'-]/g, '').slice(0, 80) || 'the family';
    const text = action === 'review'
      ? 'Would you share a short review of class? This invite is a draft and was not sent.'
      : action === 'birthday'
        ? 'Happy birthday. A buddy pass is saved as a draft for ' + name + '. Nothing was sent.'
        : action === 'reactivate'
          ? 'We saved a trial spot for ' + name + '. This note is a draft and was not sent.'
          : 'Follow-up draft saved for ' + name + '. Nothing was sent.';
    const saved = await optionalQuery(
      pool,
      `insert into review_invites (person_key, rule, status) values ($1, $2, 'pending') returning id::text as id`,
      [String(body.personKey || 'sample').slice(0, 40).replace(/[^a-z0-9_]/g, '') || 'sample', action],
    );
    return { status: 201, body: { body: text, persisted: !!saved, ...OFF } };
  }

  if (action === 'chat') {
    const enabled = body.enabled === true;
    const saved = await optionalQuery(
      pool,
      `insert into chat_assistant (id, enabled) values ('website', $1)
       on conflict (id) do update set enabled = excluded.enabled, updated_at = now()
       returning enabled`,
      [enabled],
    );
    return { status: 200, body: { enabled, persisted: !!saved, sends: false, charges: false, preview: 'Hi, I can book a trial. This preview does not message anyone.' } };
  }

  if (action === 'ask') {
    return { status: 200, body: answerQuestion(String(body.question || ''), asOf) };
  }

  throw new CrmError(400, 'bad_action', 'That studio action is not available.');
}
