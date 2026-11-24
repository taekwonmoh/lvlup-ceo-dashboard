/** Six 8-week cycles. One calendar for the home dashboard and the curriculum view.
 *  Cycle 5 starts 2026-08-24 (Self-Esteem) and cycle 6 starts 2026-10-19 (Honesty),
 *  matching the members-site schedule. Earlier 2026 cycles step back by 56 days.
 *  Cycle 1's theme is Discipline, the mat-chat theme the members picker does not list.
 */

export type Cycle = {
  cycleNo: number;
  theme: string;
  motto: string;
  startOn: string;
  testOn: string;
};

export type ActiveCycle = Cycle & {
  week: number;
  weeksInCycle: 8;
  daysUntilTest: number;
  weeksRemaining: number;
};

const THEMES: Array<Pick<Cycle, 'cycleNo' | 'theme' | 'motto'>> = [
  { cycleNo: 1, theme: 'Discipline', motto: 'Do the right thing even when it is hard.' },
  { cycleNo: 2, theme: 'Belief', motto: 'Believe you can, then train like it.' },
  { cycleNo: 3, theme: 'Communication', motto: 'Say it clearly and listen all the way.' },
  { cycleNo: 4, theme: 'Respect', motto: 'Respect yourself, your partners, and the school.' },
  { cycleNo: 5, theme: 'Self-Esteem', motto: 'Know your worth and keep growing.' },
  { cycleNo: 6, theme: 'Honesty', motto: 'Tell the truth and own the work.' },
];

export function addDays(iso: string, days: number) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string) {
  const a = Date.parse(from + 'T00:00:00Z');
  const b = Date.parse(to + 'T00:00:00Z');
  return Math.round((b - a) / 86400000);
}

/** Belt test is the Saturday of week 8, 54 days after the Monday the cycle starts. */
function cycleYear(year: number): Cycle[] {
  let start = `${year}-01-12`;
  if (year === 2026) start = '2026-01-12';
  if (year === 2027) start = '2026-12-14';
  return THEMES.map((theme, i) => {
    const startOn = addDays(start, i * 56);
    return { ...theme, startOn, testOn: addDays(startOn, 54) };
  });
}

export const CYCLES: Cycle[] = [...cycleYear(2026), ...cycleYear(2027)];

export function activeCycle(asOf = '2026-11-24'): ActiveCycle {
  const sorted = [...CYCLES].sort((a, b) => a.startOn.localeCompare(b.startOn));
  let current = sorted[0];
  for (const cycle of sorted) {
    if (cycle.startOn <= asOf) current = cycle;
  }
  const elapsed = Math.max(0, daysBetween(current.startOn, asOf));
  const week = Math.min(8, Math.floor(elapsed / 7) + 1);
  const daysUntilTest = daysBetween(asOf, current.testOn);
  return {
    ...current,
    week,
    weeksInCycle: 8,
    daysUntilTest,
    weeksRemaining: Math.max(0, 8 - week + 1),
  };
}
