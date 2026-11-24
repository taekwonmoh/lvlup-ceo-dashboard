/** Mock executive home. Counts are fixtures. They are not live GymDesk or scorecard numbers,
 *  and the revenue goals are round sandbox figures, not the staff-dashboard goals.
 */

import { activeCycle } from './cycles.ts';

export const HOME_SCHOOLS = ['waunakee', 'eastmad', 'verona', 'deforest', 'goninjaW', 'goninjaV'] as const;
export type HomeSchool = typeof HOME_SCHOOLS[number];
export type HomeScope = 'all' | 'lvlup' | 'goninja' | HomeSchool;

type Fill = { filled: number; capacity: number };

export type SchoolSnapshot = {
  brand: 'lvlup' | 'goninja';
  name: string;
  active: number;
  gained: number;
  lost: number;
  collectedCents: number;
  scheduledCents: number;
  overdueCents: number;
  goalCents: number;
  payingMembers: number;
  leads: number;
  trialsBooked: number;
  trialsShown: number;
  day1Closes: number;
  attendance: number[];
  checkinsToday: number;
  holdsPending: number;
  cancelsPending: number;
  atRisk14: number;
  out21: number;
  onb90: number;
  tasksDone: number;
  tasksTotal: number;
  academy?: number;
  ninja?: Fill;
  camps?: Fill;
  afterSchool?: Fill | null;
  parties?: number;
};

export const HOME_FIXTURE: Record<HomeSchool, SchoolSnapshot> = {
  waunakee: {
    brand: 'lvlup', name: 'Waunakee',
    active: 140, gained: 7, lost: 3,
    collectedCents: 2400000, scheduledCents: 800000, overdueCents: 45000,
    goalCents: 3200000, payingMembers: 120,
    leads: 12, trialsBooked: 8, trialsShown: 6, day1Closes: 3,
    attendance: [22, 24, 18, 26, 0, 14, 16], checkinsToday: 18,
    holdsPending: 1, cancelsPending: 0,
    atRisk14: 4, out21: 2, onb90: 3, tasksDone: 6, tasksTotal: 8,
  },
  eastmad: {
    brand: 'lvlup', name: 'East Madison',
    active: 90, gained: 4, lost: 2,
    collectedCents: 1600000, scheduledCents: 500000, overdueCents: 20000,
    goalCents: 2100000, payingMembers: 80,
    leads: 8, trialsBooked: 5, trialsShown: 4, day1Closes: 2,
    attendance: [14, 16, 12, 15, 0, 8, 9], checkinsToday: 11,
    holdsPending: 0, cancelsPending: 1,
    atRisk14: 2, out21: 1, onb90: 2, tasksDone: 5, tasksTotal: 8,
  },
  verona: {
    brand: 'lvlup', name: 'Verona',
    active: 110, gained: 5, lost: 3,
    collectedCents: 1900000, scheduledCents: 600000, overdueCents: 30000,
    goalCents: 2500000, payingMembers: 100,
    leads: 9, trialsBooked: 6, trialsShown: 5, day1Closes: 2,
    attendance: [16, 18, 15, 19, 0, 10, 11], checkinsToday: 13,
    holdsPending: 1, cancelsPending: 1,
    atRisk14: 3, out21: 1, onb90: 2, tasksDone: 7, tasksTotal: 8,
  },
  deforest: {
    brand: 'lvlup', name: 'DeForest',
    active: 70, gained: 2, lost: 4,
    collectedCents: 900000, scheduledCents: 300000, overdueCents: 55000,
    goalCents: 1400000, payingMembers: 60,
    leads: 5, trialsBooked: 3, trialsShown: 2, day1Closes: 1,
    attendance: [10, 12, 9, 11, 0, 0, 0], checkinsToday: 8,
    holdsPending: 1, cancelsPending: 0,
    atRisk14: 3, out21: 2, onb90: 1, tasksDone: 4, tasksTotal: 8,
  },
  goninjaW: {
    brand: 'goninja', name: 'Go Ninja Waunakee',
    active: 48, gained: 3, lost: 1,
    collectedCents: 420000, scheduledCents: 80000, overdueCents: 15000,
    goalCents: 600000, payingMembers: 40,
    leads: 6, trialsBooked: 4, trialsShown: 3, day1Closes: 2,
    attendance: [8, 9, 7, 10, 0, 6, 5], checkinsToday: 7,
    holdsPending: 0, cancelsPending: 0,
    atRisk14: 1, out21: 1, onb90: 2, tasksDone: 3, tasksTotal: 5,
    academy: 48, ninja: { filled: 41, capacity: 50 }, camps: { filled: 16, capacity: 25 },
    afterSchool: { filled: 20, capacity: 22 }, parties: 6,
  },
  goninjaV: {
    brand: 'goninja', name: 'Go Ninja Verona',
    active: 36, gained: 2, lost: 1,
    collectedCents: 300000, scheduledCents: 70000, overdueCents: 10000,
    goalCents: 450000, payingMembers: 30,
    leads: 4, trialsBooked: 2, trialsShown: 2, day1Closes: 1,
    attendance: [6, 7, 5, 8, 0, 4, 4], checkinsToday: 5,
    holdsPending: 0, cancelsPending: 1,
    atRisk14: 1, out21: 0, onb90: 1, tasksDone: 3, tasksTotal: 5,
    academy: 36, ninja: { filled: 28, capacity: 38 }, camps: { filled: 11, capacity: 20 },
    afterSchool: null, parties: 3,
  },
};

const ATTENDANCE_DATES = ['2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22', '2026-11-23', '2026-11-24'];

export type QueuePerson = {
  id: string;
  name: string;
  locationId: HomeSchool;
  program: string;
  rank: string;
  amountCents?: number;
  dueOn?: string;
  sessions?: number;
  sessionsRequired?: number;
};

export const OVERDUE_QUEUE: QueuePerson[] = [
  { id: 'inv_casey', name: 'Casey Sample', locationId: 'waunakee', program: 'mini_tiger', rank: 'Orange', amountCents: 11900, dueOn: '2026-11-02' },
  { id: 'inv_quinn', name: 'Quinn Sample', locationId: 'deforest', program: 'songahm', rank: 'Camo - Decided', amountCents: 19900, dueOn: '2026-11-09' },
  { id: 'inv_morgan', name: 'Morgan Sample', locationId: 'goninjaV', program: 'goninja', rank: 'Ranger', amountCents: 5000, dueOn: '2026-11-12' },
];

export const PROMOTION_QUEUE: QueuePerson[] = [
  { id: 'blake', name: 'Blake Sample', locationId: 'verona', program: 'tiger', rank: 'Ara the Turtle', sessions: 12, sessionsRequired: 12 },
  { id: 'casey', name: 'Casey Sample', locationId: 'waunakee', program: 'mini_tiger', rank: 'Orange', sessions: 6, sessionsRequired: 6 },
  { id: 'jordan', name: 'Jordan Sample', locationId: 'eastmad', program: 'songahm', rank: 'Green - Decided', sessions: 12, sessionsRequired: 12 },
  { id: 'skyler', name: 'Skyler Sample', locationId: 'verona', program: 'songahm', rank: 'Red / Black', sessions: 36, sessionsRequired: 36 },
  { id: 'riley', name: 'Riley Sample', locationId: 'goninjaW', program: 'goninja', rank: 'Recruit', sessions: 8, sessionsRequired: 8 },
];

export const BIRTHDAY_QUEUE = [
  { id: 'avery', name: 'Avery Sample', locationId: 'waunakee' as HomeSchool, turns: 9, on: '2026-11-28' },
  { id: 'blake', name: 'Blake Sample', locationId: 'verona' as HomeSchool, turns: 7, on: '2026-12-02' },
  { id: 'riley', name: 'Riley Sample', locationId: 'goninjaW' as HomeSchool, turns: 8, on: '2026-12-06' },
];

export const UPCOMING_EVENTS = [
  { id: 'belt', title: 'Cycle 6 belt test', locationId: 'waunakee' as HomeSchool, when: 'Sat Dec 12', kind: 'belt_test' },
  { id: 'clinic', title: 'Sparring clinic', locationId: 'verona' as HomeSchool, when: 'Sat Nov 28', kind: 'clinic' },
  { id: 'party', title: 'Birthday party', locationId: 'goninjaW' as HomeSchool, when: 'Sat Nov 28', kind: 'party' },
  { id: 'camp', title: 'Holiday camp', locationId: 'eastmad' as HomeSchool, when: 'Mon Dec 21', kind: 'camp' },
];

const SCHEDULE: Record<string, Array<{ time: string; title: string; instructor: string; booked: number; capacity: number }>> = {
  lvlup: [
    { time: '2:00p', title: 'Mini Tigers', instructor: 'Cat', booked: 9, capacity: 12 },
    { time: '3:00p', title: 'Tigers', instructor: 'Cat', booked: 14, capacity: 18 },
    { time: '4:00p', title: 'Beginners', instructor: 'Tarik', booked: 18, capacity: 24 },
    { time: '5:00p', title: 'Intermediate', instructor: 'Tarik', booked: 12, capacity: 20 },
    { time: '6:00p', title: 'Advanced / Black Belt', instructor: 'Tarik', booked: 9, capacity: 16 },
  ],
  goninja: [
    { time: '3:30p', title: 'Ninja class', instructor: 'Miranda', booked: 12, capacity: 16 },
    { time: '4:30p', title: 'Movement Academy', instructor: 'Miranda', booked: 10, capacity: 14 },
    { time: '5:30p', title: 'After school', instructor: 'Miranda', booked: 8, capacity: 12 },
  ],
};

export function schoolsInScope(scope: string): HomeSchool[] {
  if (scope === 'all') return [...HOME_SCHOOLS];
  if (scope === 'lvlup') return HOME_SCHOOLS.filter(id => HOME_FIXTURE[id].brand === 'lvlup');
  if (scope === 'goninja') return HOME_SCHOOLS.filter(id => HOME_FIXTURE[id].brand === 'goninja');
  if ((HOME_SCHOOLS as readonly string[]).includes(scope)) return [scope as HomeSchool];
  throw new Error('Unknown scope ' + scope);
}

function sum(rows: SchoolSnapshot[], pick: (row: SchoolSnapshot) => number) {
  return rows.reduce((total, row) => total + pick(row), 0);
}

function pct(part: number, whole: number) {
  if (!whole) return null;
  return Math.round((part / whole) * 1000) / 10;
}

function fillPct(rows: Array<Fill | null | undefined>) {
  let filled = 0;
  let capacity = 0;
  for (const row of rows) {
    if (!row || !row.capacity) continue;
    filled += row.filled;
    capacity += row.capacity;
  }
  if (!capacity) return null;
  return Math.round((filled / capacity) * 1000) / 10;
}

export function homeSummary(scope: string, asOf = '2026-11-24') {
  const ids = schoolsInScope(scope);
  const rows = ids.map(id => HOME_FIXTURE[id]);
  const brand = scope === 'goninja' || rows.every(row => row.brand === 'goninja')
    ? 'goninja'
    : scope === 'lvlup' || rows.every(row => row.brand === 'lvlup')
      ? 'lvlup'
      : 'all';
  const active = sum(rows, row => row.active);
  const gained = sum(rows, row => row.gained);
  const lost = sum(rows, row => row.lost);
  const collectedCents = sum(rows, row => row.collectedCents);
  const payingMembers = sum(rows, row => row.payingMembers);
  const trialsShown = sum(rows, row => row.trialsShown);
  const day1Closes = sum(rows, row => row.day1Closes);
  const goalCents = sum(rows, row => row.goalCents);
  const gn = rows.filter(row => row.brand === 'goninja');
  const goninja = brand === 'lvlup' ? null : {
    academyStudents: sum(gn, row => row.academy || 0),
    ninjaClassFillPct: fillPct(gn.map(row => row.ninja)),
    campsFillPct: fillPct(gn.map(row => row.camps)),
    afterSchoolFillPct: fillPct(gn.map(row => row.afterSchool)),
    partiesBooked: sum(gn, row => row.parties || 0),
  };
  const scheduleKey = brand === 'goninja' ? 'goninja' : 'lvlup';
  const scheduleSchool = ids[0];
  return {
    scope,
    brand,
    asOf,
    schools: ids,
    cycle: activeCycle(asOf),
    members: {
      active,
      gained,
      lost,
      netChange: gained - lost,
      attritionPct: pct(lost, active),
      attritionGoalPct: 3,
      attritionOnTrack: (pct(lost, active) ?? 0) <= 3,
    },
    payments: {
      collectedCents,
      scheduledCents: sum(rows, row => row.scheduledCents),
      overdueCents: sum(rows, row => row.overdueCents),
      goalCents,
      goalPct: pct(collectedCents, goalCents),
      armCents: payingMembers ? Math.round(collectedCents / payingMembers) : null,
    },
    funnel: {
      leads: sum(rows, row => row.leads),
      trialsBooked: sum(rows, row => row.trialsBooked),
      trialsShown,
      day1Closes,
      day1ClosePct: pct(day1Closes, trialsShown),
    },
    attendance: {
      days: ATTENDANCE_DATES.map((date, i) => ({ date, count: sum(rows, row => row.attendance[i] || 0) })),
      checkinsToday: sum(rows, row => row.checkinsToday),
    },
    holds: {
      pendingHolds: sum(rows, row => row.holdsPending),
      pendingCancels: sum(rows, row => row.cancelsPending),
      pendingTotal: sum(rows, row => row.holdsPending + row.cancelsPending),
    },
    outreach: {
      atRisk14: sum(rows, row => row.atRisk14),
      out21: sum(rows, row => row.out21),
      onb90: sum(rows, row => row.onb90),
      tasksDone: sum(rows, row => row.tasksDone),
      tasksTotal: sum(rows, row => row.tasksTotal),
    },
    goninja,
    queues: {
      overdue: OVERDUE_QUEUE.filter(row => ids.includes(row.locationId)),
      promotions: PROMOTION_QUEUE.filter(row => ids.includes(row.locationId)),
      birthdays: BIRTHDAY_QUEUE.filter(row => ids.includes(row.locationId)),
      events: UPCOMING_EVENTS.filter(row => ids.includes(row.locationId)),
      schedule: SCHEDULE[scheduleKey].map(row => ({ ...row, locationId: scheduleSchool })),
    },
  };
}

export function previewPaymentRetry(invoiceId: string) {
  const row = OVERDUE_QUEUE.find(item => item.id === invoiceId) || null;
  return {
    invoiceId,
    found: !!row,
    submitted: false,
    sandbox: true,
    message: 'Sandbox preview. No charge was sent.',
  };
}
