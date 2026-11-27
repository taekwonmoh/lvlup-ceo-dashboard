/**
 * Pre-test sign-up pace and post-cycle participation.
 * Counts are sandbox figures. Belt testing is included with tuition.
 */
import { CrmError } from './errors.ts';

export const TEST_SCHOOLS = [
  { id: 'waunakee', name: 'LVLUP Waunakee', active: 140 },
  { id: 'verona', name: 'LVLUP Verona', active: 110 },
  { id: 'eastmad', name: 'LVLUP East Madison', active: 90 },
  { id: 'deforest', name: 'LVLUP DeForest', active: 70 },
  { id: 'goninjaW', name: 'Go Ninja Waunakee', active: 48 },
  { id: 'goninjaV', name: 'Go Ninja Verona', active: 36 },
] as const;

export type TestSchoolId = typeof TEST_SCHOOLS[number]['id'];
export type WeekKey = 'w4' | 'w3' | 'w2' | 'w1' | 'test';

export const SIGNUP_WEEKS: Array<{ id: WeekKey; title: string }> = [
  { id: 'w4', title: '4 weeks out' },
  { id: 'w3', title: '3 weeks out' },
  { id: 'w2', title: '2 weeks out' },
  { id: 'w1', title: '1 week out' },
  { id: 'test', title: 'Test week' },
];

const SIGNED: Record<TestSchoolId, Record<WeekKey, number>> = {
  waunakee: { w4: 28, w3: 42, w2: 63, w1: 84, test: 98 },
  verona: { w4: 18, w3: 30, w2: 48, w1: 66, test: 77 },
  eastmad: { w4: 12, w3: 22, w2: 36, w1: 49, test: 58 },
  deforest: { w4: 8, w3: 14, w2: 21, w1: 28, test: 35 },
  goninjaW: { w4: 14, w3: 18, w2: 24, w1: 29, test: 34 },
  goninjaV: { w4: 6, w3: 10, w2: 14, w1: 18, test: 22 },
};

export const UPCOMING_CYCLE = { id: '2026-c6', name: 'Cycle 6', testOn: '2026-12-14', status: 'upcoming' as const };

export const COMPLETED_CYCLES = [
  {
    id: '2026-c5', name: 'Cycle 5', testOn: '2026-10-19',
    tested: { waunakee: 91, verona: 70, eastmad: 52, deforest: 31, goninjaW: 30, goninjaV: 19 } as Record<TestSchoolId, number>,
  },
  {
    id: '2026-c4', name: 'Cycle 4', testOn: '2026-08-17',
    tested: { waunakee: 84, verona: 64, eastmad: 48, deforest: 28, goninjaW: 26, goninjaV: 16 } as Record<TestSchoolId, number>,
  },
  {
    id: '2026-c3', name: 'Cycle 3', testOn: '2026-06-15',
    tested: { waunakee: 78, verona: 60, eastmad: 44, deforest: 25, goninjaW: 22, goninjaV: 14 } as Record<TestSchoolId, number>,
  },
];

export function percent(part: number, whole: number) {
  if (!whole) return 0;
  return Math.round((part / whole) * 100);
}

function daysBetween(from: string, to: string) {
  const a = Date.parse(from + 'T00:00:00Z');
  const b = Date.parse(to + 'T00:00:00Z');
  return Math.round((b - a) / 86400000);
}

export function checkpointFor(asOf: string, testOn: string): WeekKey {
  const days = daysBetween(asOf, testOn);
  if (days <= 0) return 'test';
  if (days <= 7) return 'w1';
  if (days <= 14) return 'w2';
  if (days <= 21) return 'w3';
  return 'w4';
}

function schoolRow(id: TestSchoolId, signed: number) {
  const school = TEST_SCHOOLS.find(row => row.id === id)!;
  const count = Math.min(school.active, Math.max(0, signed));
  return {
    locationId: school.id,
    name: school.name,
    active: school.active,
    count,
    percent: percent(count, school.active),
  };
}

export function gridFromRows(rows: Array<{ location_id?: string; locationId?: string; week_key?: string; weekKey?: string; signed_up?: number; signedUp?: number }>) {
  if (!rows.length) return null;
  const grid: Record<TestSchoolId, Record<WeekKey, number>> = {
    waunakee: { ...SIGNED.waunakee },
    verona: { ...SIGNED.verona },
    eastmad: { ...SIGNED.eastmad },
    deforest: { ...SIGNED.deforest },
    goninjaW: { ...SIGNED.goninjaW },
    goninjaV: { ...SIGNED.goninjaV },
  };
  let used = 0;
  for (const row of rows) {
    const id = (row.location_id || row.locationId) as TestSchoolId;
    const week = (row.week_key || row.weekKey) as WeekKey;
    if (!grid[id] || grid[id][week] == null) continue;
    grid[id][week] = Number(row.signed_up ?? row.signedUp) || 0;
    used += 1;
  }
  return used ? grid : null;
}

export function signupTracker(asOf: string, extra: Partial<Record<TestSchoolId, number>> = {}, signed: Record<TestSchoolId, Record<WeekKey, number>> = SIGNED) {
  const current = checkpointFor(asOf, UPCOMING_CYCLE.testOn);
  const currentIndex = SIGNUP_WEEKS.findIndex(week => week.id === current);
  const weeks = SIGNUP_WEEKS.map((week, index) => {
    const open = index <= currentIndex;
    const schools = TEST_SCHOOLS.map(school => {
      const base = open ? signed[school.id][week.id] : 0;
      const bonus = open && week.id === current ? (extra[school.id] || 0) : 0;
      return schoolRow(school.id, base + bonus);
    });
    const active = schools.reduce((sum, row) => sum + row.active, 0);
    const count = schools.reduce((sum, row) => sum + row.count, 0);
    return {
      id: week.id,
      title: week.title,
      open,
      current: week.id === current,
      active,
      count,
      percent: open ? percent(count, active) : 0,
      schools,
    };
  });
  const now = weeks.find(week => week.current)!;
  const previous = weeks[currentIndex - 1];
  return {
    asOf,
    cycle: UPCOMING_CYCLE,
    includedWithTuition: true as const,
    current: now.id,
    weeks,
    schools: now.schools,
    total: { active: now.active, count: now.count, percent: now.percent },
    ramp: previous ? { from: previous.percent, to: now.percent, points: now.percent - previous.percent } : null,
  };
}

export function cycleReport(cycleId: string) {
  const cycle = COMPLETED_CYCLES.find(row => row.id === cycleId);
  if (!cycle) throw new CrmError(404, 'not_found', 'That testing cycle is not in the sample set.');
  const schools = TEST_SCHOOLS.map(school => {
    const tested = cycle.tested[school.id];
    return { locationId: school.id, name: school.name, active: school.active, tested, percent: percent(tested, school.active) };
  });
  const active = schools.reduce((sum, row) => sum + row.active, 0);
  const tested = schools.reduce((sum, row) => sum + row.tested, 0);
  return {
    id: cycle.id,
    name: cycle.name,
    testOn: cycle.testOn,
    includedWithTuition: true as const,
    schools,
    total: { active, tested, percent: percent(tested, active) },
  };
}

export function participationReport(cycleId?: string, compareId?: string) {
  const primary = cycleReport(cycleId || COMPLETED_CYCLES[0].id);
  const compare = compareId && compareId !== primary.id ? cycleReport(compareId) : null;
  return {
    cycles: COMPLETED_CYCLES.map(cycle => ({ id: cycle.id, name: cycle.name, testOn: cycle.testOn })),
    primary,
    compare,
    includedWithTuition: true as const,
  };
}

function csvCell(value: string | number) {
  const text = String(value);
  if (/[",\n]/.test(text)) return '"' + text.replace(/"/g, '""') + '"';
  return text;
}

export function participationCsv(cycleId: string) {
  const report = cycleReport(cycleId);
  const lines: Array<Array<string | number>> = [[
    'Cycle', 'Test date', 'School', 'Active students', 'Tested', 'Percent',
  ]];
  for (const school of report.schools) {
    lines.push([report.name, report.testOn, school.name, school.active, school.tested, school.percent]);
  }
  lines.push([report.name, report.testOn, 'All schools', report.total.active, report.total.tested, report.total.percent]);
  return lines.map(row => row.map(csvCell).join(',')).join('\n') + '\n';
}
