/**
 * Monthly attrition and customer acquisition cost.
 * Counts and spend in the demo book are synthetic. No member names,
 * ATA numbers, or GymDesk ids. Money is integer cents.
 * Attrition = cancellations ÷ starting active members.
 * Blended CAC = all marketing spend ÷ all new enrolled students.
 * Paid-only CAC uses Google Ads and Meta / Facebook Ads only.
 */

export const GROWTH_AS_OF = '2026-11-27';
export const GOAL_PCT = 3;
export const GROWTH_MONTHS = ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11'] as const;
export type GrowthMonth = typeof GROWTH_MONTHS[number];

export const GROWTH_SCHOOLS = [
  { id: 'waunakee', name: 'LVLUP Waunakee', brand: 'lvlup' as const, tuitionCents: 21000, avgTenureMonths: 18 },
  { id: 'eastmad', name: 'LVLUP East Madison', brand: 'lvlup' as const, tuitionCents: 18000, avgTenureMonths: 14 },
  { id: 'verona', name: 'LVLUP Verona', brand: 'lvlup' as const, tuitionCents: 20000, avgTenureMonths: 16 },
  { id: 'deforest', name: 'LVLUP DeForest', brand: 'lvlup' as const, tuitionCents: 16500, avgTenureMonths: 9 },
  { id: 'goninjaW', name: 'Go Ninja Waunakee', brand: 'goninja' as const, tuitionCents: 5000, avgTenureMonths: 11 },
  { id: 'goninjaV', name: 'Go Ninja Verona', brand: 'goninja' as const, tuitionCents: 5000, avgTenureMonths: 8 },
] as const;

export type SchoolId = typeof GROWTH_SCHOOLS[number]['id'];
export type GrowthScope = 'all' | 'lvlup' | 'goninja' | SchoolId;

export const CHANNELS = [
  { id: 'google', name: 'Google Ads', paid: true },
  { id: 'meta', name: 'Meta / Facebook Ads', paid: true },
  { id: 'referrals', name: 'Referrals', paid: false },
  { id: 'events', name: 'Events / Walk-ins', paid: false },
  { id: 'website', name: 'Website / Organic', paid: false },
] as const;
export type ChannelId = typeof CHANNELS[number]['id'];

export const REASONS = [
  { id: 'schedule', name: 'Schedule' },
  { id: 'moving', name: 'Moving' },
  { id: 'cost', name: 'Cost' },
  { id: 'lost_interest', name: 'Lost Interest' },
  { id: 'medical', name: 'Medical' },
  { id: 'other', name: 'Other' },
] as const;
export type ReasonId = typeof REASONS[number]['id'];

export const TENURES = [
  { id: 'under3', name: '<3 mo' },
  { id: 'm3to6', name: '3–6 mo' },
  { id: 'm6to12', name: '6–12 mo' },
  { id: 'm12plus', name: '12+ mo' },
] as const;
export type TenureId = typeof TENURES[number]['id'];

export type ChannelStat = { leads: number; trials: number; enrolled: number; spendCents: number };
export type ReasonCounts = Record<ReasonId, number>;
export type TenureCounts = Record<TenureId, number>;

export type GrowthCell = {
  locationId: SchoolId;
  month: string;
  startingActive: number;
  newEnrollments: number;
  cancellations: number;
  reasons: ReasonCounts;
  tenure: TenureCounts;
  channels: Record<ChannelId, ChannelStat>;
  tuitionCents?: number;
  avgTenureMonths?: number;
};

export type SpendOverride = {
  locationId: string;
  month: string;
  channel: string;
  amountCents: number;
};

export type SnapshotInput = {
  locationId: string;
  month: string;
  startingActive: number;
  newEnrollments: number;
  cancellations: number;
  reasons: ReasonCounts;
  tenure: TenureCounts;
  channels: Record<ChannelId, { leads: number; trials: number; enrolled: number }>;
  tuitionCents?: number;
  avgTenureMonths?: number;
};

export class GrowthInputError extends Error {}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

type NovemberSeed = {
  id: SchoolId;
  start: number;
  reasons: ReasonCounts;
  tenure: TenureCounts;
  channels: Record<ChannelId, ChannelStat>;
};

const NOVEMBER: NovemberSeed[] = [
  {
    id: 'waunakee',
    start: 136,
    reasons: { schedule: 1, moving: 1, cost: 0, lost_interest: 1, medical: 0, other: 0 },
    tenure: { under3: 0, m3to6: 1, m6to12: 1, m12plus: 1 },
    channels: {
      google: { leads: 6, trials: 4, enrolled: 2, spendCents: 180000 },
      meta: { leads: 5, trials: 3, enrolled: 2, spendCents: 140000 },
      referrals: { leads: 4, trials: 3, enrolled: 2, spendCents: 0 },
      events: { leads: 3, trials: 2, enrolled: 1, spendCents: 25000 },
      website: { leads: 2, trials: 1, enrolled: 0, spendCents: 0 },
    },
  },
  {
    id: 'eastmad',
    start: 88,
    reasons: { schedule: 1, moving: 0, cost: 1, lost_interest: 0, medical: 0, other: 0 },
    tenure: { under3: 1, m3to6: 0, m6to12: 1, m12plus: 0 },
    channels: {
      google: { leads: 4, trials: 2, enrolled: 1, spendCents: 120000 },
      meta: { leads: 3, trials: 2, enrolled: 1, spendCents: 90000 },
      referrals: { leads: 3, trials: 2, enrolled: 2, spendCents: 0 },
      events: { leads: 2, trials: 1, enrolled: 1, spendCents: 15000 },
      website: { leads: 1, trials: 1, enrolled: 0, spendCents: 0 },
    },
  },
  {
    id: 'verona',
    start: 105,
    reasons: { schedule: 2, moving: 0, cost: 1, lost_interest: 1, medical: 0, other: 0 },
    tenure: { under3: 1, m3to6: 1, m6to12: 1, m12plus: 1 },
    channels: {
      google: { leads: 5, trials: 3, enrolled: 2, spendCents: 150000 },
      meta: { leads: 4, trials: 2, enrolled: 1, spendCents: 110000 },
      referrals: { leads: 3, trials: 2, enrolled: 2, spendCents: 0 },
      events: { leads: 2, trials: 2, enrolled: 1, spendCents: 20000 },
      website: { leads: 2, trials: 1, enrolled: 0, spendCents: 0 },
    },
  },
  {
    id: 'deforest',
    start: 72,
    reasons: { schedule: 1, moving: 0, cost: 2, lost_interest: 2, medical: 0, other: 0 },
    tenure: { under3: 3, m3to6: 1, m6to12: 1, m12plus: 0 },
    channels: {
      google: { leads: 4, trials: 2, enrolled: 1, spendCents: 90000 },
      meta: { leads: 3, trials: 1, enrolled: 0, spendCents: 70000 },
      referrals: { leads: 2, trials: 1, enrolled: 1, spendCents: 0 },
      events: { leads: 2, trials: 2, enrolled: 1, spendCents: 10000 },
      website: { leads: 1, trials: 0, enrolled: 0, spendCents: 0 },
    },
  },
  {
    id: 'goninjaW',
    start: 46,
    reasons: { schedule: 0, moving: 1, cost: 0, lost_interest: 0, medical: 0, other: 0 },
    tenure: { under3: 0, m3to6: 0, m6to12: 0, m12plus: 1 },
    channels: {
      google: { leads: 3, trials: 2, enrolled: 1, spendCents: 40000 },
      meta: { leads: 2, trials: 1, enrolled: 1, spendCents: 35000 },
      referrals: { leads: 2, trials: 1, enrolled: 1, spendCents: 0 },
      events: { leads: 2, trials: 1, enrolled: 1, spendCents: 5000 },
      website: { leads: 1, trials: 1, enrolled: 0, spendCents: 0 },
    },
  },
  {
    id: 'goninjaV',
    start: 35,
    reasons: { schedule: 1, moving: 0, cost: 0, lost_interest: 1, medical: 0, other: 0 },
    tenure: { under3: 1, m3to6: 1, m6to12: 0, m12plus: 0 },
    channels: {
      google: { leads: 2, trials: 1, enrolled: 1, spendCents: 30000 },
      meta: { leads: 2, trials: 1, enrolled: 0, spendCents: 25000 },
      referrals: { leads: 1, trials: 1, enrolled: 1, spendCents: 0 },
      events: { leads: 2, trials: 1, enrolled: 1, spendCents: 0 },
      website: { leads: 1, trials: 0, enrolled: 0, spendCents: 0 },
    },
  },
];

export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function attritionPct(cancellations: number, startingActive: number): number | null {
  if (!startingActive) return null;
  return round1((cancellations / startingActive) * 100);
}

export function retentionPct(attrition: number | null): number | null {
  if (attrition == null) return null;
  return round1(100 - attrition);
}

export function cacCents(spendCents: number, newMembers: number): number | null {
  if (!newMembers) return null;
  return Math.round(spendCents / newMembers);
}

export function formatMoney(cents: number | null): string {
  if (cents == null || !Number.isFinite(cents)) return 'n/a';
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(Math.round(cents));
  const dollars = Math.floor(abs / 100).toLocaleString('en-US');
  const coins = String(abs % 100).padStart(2, '0');
  return sign + '$' + dollars + '.' + coins;
}

export function formatPct(value: number | null): string {
  if (value == null) return 'n/a';
  return value.toFixed(1) + '%';
}

export function monthLabel(month: string): string {
  const monthNo = Number(month.slice(5, 7));
  const name = MONTH_NAMES[monthNo - 1] || month;
  return name + ' ' + month.slice(0, 4);
}

export function monthShort(month: string): string {
  return monthLabel(month).slice(0, 3);
}

export function shiftMonth(month: string, delta: number): string {
  const year = Number(month.slice(0, 4));
  const monthNo = Number(month.slice(5, 7));
  const date = new Date(Date.UTC(year, monthNo - 1 + delta, 1));
  return date.getUTCFullYear() + '-' + String(date.getUTCMonth() + 1).padStart(2, '0');
}

export function schoolById(id: string) {
  return GROWTH_SCHOOLS.find(row => row.id === id) || null;
}

export function schoolsInScope(scope: string): SchoolId[] {
  if (scope === 'all') return GROWTH_SCHOOLS.map(row => row.id);
  if (scope === 'lvlup') return GROWTH_SCHOOLS.filter(row => row.brand === 'lvlup').map(row => row.id);
  if (scope === 'goninja') return GROWTH_SCHOOLS.filter(row => row.brand === 'goninja').map(row => row.id);
  if (schoolById(scope)) return [scope as SchoolId];
  throw new GrowthInputError('Unknown scope');
}

export function scopeName(scope: string): string {
  if (scope === 'all') return 'All schools';
  if (scope === 'lvlup') return 'LVLUP';
  if (scope === 'goninja') return 'Go Ninja';
  return schoolById(scope)?.name || scope;
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function apportion(total: number, weights: number[]): number[] {
  const safe = weights.map(value => Math.max(0, Math.round(value)));
  if (!safe.length) return [];
  if (total <= 0) return safe.map(() => 0);
  const weightSum = sum(safe);
  if (!weightSum) {
    const out = safe.map(() => 0);
    for (let i = 0; i < total; i += 1) out[i % out.length] += 1;
    return out;
  }
  const raw = safe.map(value => (total * value) / weightSum);
  const base = raw.map(value => Math.floor(value));
  let left = total - sum(base);
  const order = raw
    .map((value, index) => ({ index, frac: value - Math.floor(value) }))
    .sort((a, b) => b.frac - a.frac || a.index - b.index);
  let cursor = 0;
  while (left > 0) {
    base[order[cursor % order.length].index] += 1;
    left -= 1;
    cursor += 1;
  }
  return base;
}

function blankChannels(): Record<ChannelId, ChannelStat> {
  return {
    google: { leads: 0, trials: 0, enrolled: 0, spendCents: 0 },
    meta: { leads: 0, trials: 0, enrolled: 0, spendCents: 0 },
    referrals: { leads: 0, trials: 0, enrolled: 0, spendCents: 0 },
    events: { leads: 0, trials: 0, enrolled: 0, spendCents: 0 },
    website: { leads: 0, trials: 0, enrolled: 0, spendCents: 0 },
  };
}

function cloneCell(cell: GrowthCell): GrowthCell {
  return {
    locationId: cell.locationId,
    month: cell.month,
    startingActive: cell.startingActive,
    newEnrollments: cell.newEnrollments,
    cancellations: cell.cancellations,
    reasons: { ...cell.reasons },
    tenure: { ...cell.tenure },
    channels: {
      google: { ...cell.channels.google },
      meta: { ...cell.channels.meta },
      referrals: { ...cell.channels.referrals },
      events: { ...cell.channels.events },
      website: { ...cell.channels.website },
    },
    tuitionCents: cell.tuitionCents,
    avgTenureMonths: cell.avgTenureMonths,
  };
}

function cellFromSeed(seed: NovemberSeed, month: string): GrowthCell {
  const enrolled = sum(CHANNELS.map(channel => seed.channels[channel.id].enrolled));
  const cancellations = sum(REASONS.map(reason => seed.reasons[reason.id]));
  return {
    locationId: seed.id,
    month,
    startingActive: seed.start,
    newEnrollments: enrolled,
    cancellations,
    reasons: { ...seed.reasons },
    tenure: { ...seed.tenure },
    channels: {
      google: { ...seed.channels.google },
      meta: { ...seed.channels.meta },
      referrals: { ...seed.channels.referrals },
      events: { ...seed.channels.events },
      website: { ...seed.channels.website },
    },
  };
}

function deriveCell(base: GrowthCell, monthsAgo: number): GrowthCell {
  if (monthsAgo <= 0) return cloneCell(base);
  const startingActive = Math.max(12, Math.round(base.startingActive * (1 - 0.012 * monthsAgo)));
  const cancellations = Math.min(
    Math.max(0, startingActive - 1),
    Math.max(0, Math.round(base.cancellations * (1 + 0.1 * monthsAgo))),
  );
  const gained = Math.max(0, Math.round(base.newEnrollments * (monthsAgo % 2 === 0 ? 0.92 : 1)));
  const reasonWeights = REASONS.map(reason => base.reasons[reason.id]);
  const tenureWeights = TENURES.map(bucket => base.tenure[bucket.id]);
  const reasonParts = apportion(cancellations, reasonWeights);
  const tenureParts = apportion(cancellations, tenureWeights);
  const enrolledParts = apportion(gained, CHANNELS.map(channel => base.channels[channel.id].enrolled));
  const reasons = {} as ReasonCounts;
  const tenure = {} as TenureCounts;
  REASONS.forEach((reason, index) => { reasons[reason.id] = reasonParts[index]; });
  TENURES.forEach((bucket, index) => { tenure[bucket.id] = tenureParts[index]; });
  const channels = blankChannels();
  const scale = monthsAgo % 2 === 0 ? 1.08 : 0.95;
  CHANNELS.forEach((channel, index) => {
    const enrolled = enrolledParts[index];
    const source = base.channels[channel.id];
    const leads = Math.max(enrolled, Math.round(source.leads * scale));
    const trials = Math.max(enrolled, Math.min(leads, Math.round(source.trials * scale)));
    const spendCents = source.spendCents === 0 ? 0 : Math.max(0, Math.round(source.spendCents * (1 + 0.03 * monthsAgo)));
    channels[channel.id] = { leads, trials, enrolled, spendCents };
  });
  return {
    locationId: base.locationId,
    month: base.month,
    startingActive,
    newEnrollments: sum(enrolledParts),
    cancellations,
    reasons,
    tenure,
    channels,
  };
}

function buildBaseCells(): GrowthCell[] {
  const november = NOVEMBER.map(seed => cellFromSeed(seed, '2026-11'));
  const cells: GrowthCell[] = [];
  for (const month of GROWTH_MONTHS) {
    const ago = GROWTH_MONTHS.indexOf('2026-11') - GROWTH_MONTHS.indexOf(month);
    for (const cell of november) {
      const derived = deriveCell(cell, ago);
      derived.month = month;
      cells.push(derived);
    }
  }
  const problems = auditCells(cells);
  if (problems.length) throw new Error(problems.join('; '));
  return cells;
}

const BASE_CELLS = buildBaseCells();

export function auditCells(cells: GrowthCell[]): string[] {
  const problems: string[] = [];
  for (const cell of cells) {
    const where = cell.locationId + ' ' + cell.month;
    const reasonSum = sum(REASONS.map(reason => cell.reasons[reason.id] || 0));
    const tenureSum = sum(TENURES.map(bucket => cell.tenure[bucket.id] || 0));
    const enrolled = sum(CHANNELS.map(channel => cell.channels[channel.id].enrolled));
    if (reasonSum !== cell.cancellations) problems.push(where + ' reasons');
    if (tenureSum !== cell.cancellations) problems.push(where + ' tenure');
    if (enrolled !== cell.newEnrollments) problems.push(where + ' enrolled');
    if (cell.cancellations > cell.startingActive) problems.push(where + ' cancels exceed start');
    for (const channel of CHANNELS) {
      const stat = cell.channels[channel.id];
      if (stat.leads < stat.trials || stat.trials < stat.enrolled || stat.enrolled < 0 || stat.spendCents < 0) {
        problems.push(where + ' ' + channel.id + ' funnel');
      }
    }
  }
  return problems;
}

export function demoCells(): GrowthCell[] {
  return BASE_CELLS.map(cloneCell);
}

export function cellsWithSpend(overrides: SpendOverride[] = [], cells: GrowthCell[] = demoCells()): GrowthCell[] {
  const next = cells.map(cloneCell);
  for (const row of overrides) {
    const cell = next.find(item => item.locationId === row.locationId && item.month === row.month);
    const channel = CHANNELS.find(item => item.id === row.channel);
    if (!cell || !channel) continue;
    if (!Number.isInteger(row.amountCents) || row.amountCents < 0) continue;
    cell.channels[channel.id].spendCents = row.amountCents;
  }
  return next;
}

export function applySnapshots(cells: GrowthCell[], snapshots: SnapshotInput[]): GrowthCell[] {
  const next = cells.map(cloneCell);
  for (const snap of snapshots) {
    const cell = next.find(item => item.locationId === snap.locationId && item.month === snap.month);
    if (!cell || !schoolById(snap.locationId)) continue;
    const reasons = {} as ReasonCounts;
    const tenure = {} as TenureCounts;
    let reasonsOk = true;
    for (const reason of REASONS) {
      const value = Number(snap.reasons?.[reason.id]);
      if (!Number.isInteger(value) || value < 0) reasonsOk = false;
      reasons[reason.id] = value;
    }
    let tenureOk = true;
    for (const bucket of TENURES) {
      const value = Number(snap.tenure?.[bucket.id]);
      if (!Number.isInteger(value) || value < 0) tenureOk = false;
      tenure[bucket.id] = value;
    }
    if (!reasonsOk || !tenureOk) continue;
    if (sum(Object.values(reasons)) !== snap.cancellations) continue;
    if (sum(Object.values(tenure)) !== snap.cancellations) continue;
    if (snap.cancellations > snap.startingActive || snap.startingActive < 0 || snap.newEnrollments < 0) continue;
    const channels = blankChannels();
    let enrolled = 0;
    let funnelOk = true;
    for (const channel of CHANNELS) {
      const source = snap.channels?.[channel.id];
      const leads = Number(source?.leads);
      const trials = Number(source?.trials);
      const joined = Number(source?.enrolled);
      if (!Number.isInteger(leads) || !Number.isInteger(trials) || !Number.isInteger(joined)) funnelOk = false;
      if (leads < trials || trials < joined || joined < 0) funnelOk = false;
      channels[channel.id] = {
        leads, trials, enrolled: joined, spendCents: cell.channels[channel.id].spendCents,
      };
      enrolled += joined;
    }
    if (!funnelOk || enrolled !== snap.newEnrollments) continue;
    cell.startingActive = snap.startingActive;
    cell.newEnrollments = snap.newEnrollments;
    cell.cancellations = snap.cancellations;
    cell.reasons = reasons;
    cell.tenure = tenure;
    cell.channels = channels;
    if (snap.tuitionCents != null && Number.isInteger(snap.tuitionCents) && snap.tuitionCents >= 0) {
      cell.tuitionCents = snap.tuitionCents;
    }
    if (snap.avgTenureMonths != null && Number.isFinite(Number(snap.avgTenureMonths)) && Number(snap.avgTenureMonths) >= 0) {
      cell.avgTenureMonths = Number(snap.avgTenureMonths);
    }
  }
  return next;
}

function assertMonth(month: string) {
  if (!(GROWTH_MONTHS as readonly string[]).includes(month)) throw new GrowthInputError('Unknown month');
}

function tuitionOf(cell: GrowthCell) {
  if (cell.tuitionCents != null) return cell.tuitionCents;
  return schoolById(cell.locationId)?.tuitionCents || 0;
}

function tenureMonthsOf(cell: GrowthCell) {
  if (cell.avgTenureMonths != null) return cell.avgTenureMonths;
  return schoolById(cell.locationId)?.avgTenureMonths || 0;
}

function idsFor(scope: string, cells: GrowthCell[]): { ids: SchoolId[]; partial: boolean } {
  const wanted = schoolsInScope(scope);
  const available = new Set(cells.map(cell => cell.locationId));
  if (wanted.length === 1 && !available.has(wanted[0])) throw new GrowthInputError('Unknown scope');
  const ids = wanted.filter(id => available.has(id));
  if (!ids.length) throw new GrowthInputError('Unknown scope');
  return { ids, partial: ids.length !== wanted.length };
}

function monthCells(cells: GrowthCell[], month: string, ids: SchoolId[]) {
  return ids.map(id => cells.find(cell => cell.locationId === id && cell.month === month)).filter((cell): cell is GrowthCell => !!cell);
}

export type CountRow = { id: string; name: string; count: number };

function countRows<T extends { id: string; name: string }>(catalog: readonly T[], pick: (id: T['id']) => number): CountRow[] {
  return catalog.map(row => ({ id: row.id, name: row.name, count: pick(row.id) }));
}

export type SchoolMovement = {
  id: string;
  name: string;
  brand: 'lvlup' | 'goninja';
  startingActive: number;
  newEnrollments: number;
  cancellations: number;
  attritionPct: number | null;
  retentionPct: number | null;
  netGrowth: number;
  onTrack: boolean;
  earlyDrop: boolean;
  reasons: CountRow[];
  tenure: CountRow[];
};

function movementOf(cell: GrowthCell): SchoolMovement {
  const school = schoolById(cell.locationId)!;
  const attrition = attritionPct(cell.cancellations, cell.startingActive);
  const under3 = cell.tenure.under3 || 0;
  const otherTenure = Math.max(...TENURES.filter(bucket => bucket.id !== 'under3').map(bucket => cell.tenure[bucket.id] || 0));
  const earlyDrop = cell.cancellations > 0 && under3 / cell.cancellations >= 0.4 && under3 > otherTenure;
  return {
    id: cell.locationId,
    name: school.name,
    brand: school.brand,
    startingActive: cell.startingActive,
    newEnrollments: cell.newEnrollments,
    cancellations: cell.cancellations,
    attritionPct: attrition,
    retentionPct: retentionPct(attrition),
    netGrowth: cell.newEnrollments - cell.cancellations,
    onTrack: attrition == null ? true : attrition <= GOAL_PCT,
    earlyDrop,
    reasons: countRows(REASONS, id => cell.reasons[id] || 0),
    tenure: countRows(TENURES, id => cell.tenure[id] || 0),
  };
}

function combineMovement(rows: SchoolMovement[], id: string, name: string, brand: SchoolMovement['brand'] | 'all'): SchoolMovement {
  const startingActive = sum(rows.map(row => row.startingActive));
  const newEnrollments = sum(rows.map(row => row.newEnrollments));
  const cancellations = sum(rows.map(row => row.cancellations));
  const attrition = attritionPct(cancellations, startingActive);
  const reasons = countRows(REASONS, reasonId => sum(rows.map(row => row.reasons.find(item => item.id === reasonId)?.count || 0)));
  const tenure = countRows(TENURES, bucketId => sum(rows.map(row => row.tenure.find(item => item.id === bucketId)?.count || 0)));
  const under3 = tenure.find(row => row.id === 'under3')?.count || 0;
  return {
    id: id as SchoolId,
    name,
    brand: brand === 'all' ? 'lvlup' : brand,
    startingActive,
    newEnrollments,
    cancellations,
    attritionPct: attrition,
    retentionPct: retentionPct(attrition),
    netGrowth: newEnrollments - cancellations,
    onTrack: attrition == null ? true : attrition <= GOAL_PCT,
    earlyDrop: cancellations > 0 && under3 / cancellations >= 0.4,
    reasons,
    tenure,
  };
}

export type AttritionReport = {
  scope: string;
  scopeLabel: string;
  month: string;
  monthLabel: string;
  partial: boolean;
  goalPct: number;
  summary: SchoolMovement;
  bySchool: SchoolMovement[];
  trend: Array<{ month: string; label: string; short: string; attritionPct: number | null; retentionPct: number | null; netGrowth: number; cancellations: number; newEnrollments: number; startingActive: number }>;
  reasons: CountRow[];
  tenure: CountRow[];
};

export function attritionReport(scope: string, month: string, cells: GrowthCell[] = demoCells()): AttritionReport {
  assertMonth(month);
  const { ids, partial } = idsFor(scope, cells);
  const rows = monthCells(cells, month, ids).map(movementOf);
  const label = groupLabel(ids, scope, partial);
  const summary = combineMovement(rows, scope, label === 'all 6 schools' ? 'All schools' : label, scope === 'goninja' ? 'goninja' : scope === 'all' ? 'all' : rows[0]?.brand || 'lvlup');
  summary.name = label === 'all 6 schools' ? 'All schools' : label;
  const trend = GROWTH_MONTHS.map(key => {
    const trendRows = monthCells(cells, key, ids).map(movementOf);
    const combined = combineMovement(trendRows, scope, scopeName(scope), 'lvlup');
    return {
      month: key,
      label: monthLabel(key),
      short: monthShort(key),
      attritionPct: combined.attritionPct,
      retentionPct: combined.retentionPct,
      netGrowth: combined.netGrowth,
      cancellations: combined.cancellations,
      newEnrollments: combined.newEnrollments,
      startingActive: combined.startingActive,
    };
  });
  return {
    scope,
    scopeLabel: label,
    month,
    monthLabel: monthLabel(month),
    partial,
    goalPct: GOAL_PCT,
    summary,
    bySchool: rows,
    trend,
    reasons: summary.reasons,
    tenure: summary.tenure,
  };
}

export type ChannelEconomics = {
  id: string;
  name: string;
  paid: boolean;
  spendCents: number;
  leads: number;
  trials: number;
  newMembers: number;
  costPerLeadCents: number | null;
  costPerTrialCents: number | null;
  cacCents: number | null;
};

function channelEconomics(id: ChannelId, stats: ChannelStat[]): ChannelEconomics {
  const meta = CHANNELS.find(channel => channel.id === id)!;
  const spendCents = sum(stats.map(row => row.spendCents));
  const leads = sum(stats.map(row => row.leads));
  const trials = sum(stats.map(row => row.trials));
  const newMembers = sum(stats.map(row => row.enrolled));
  return {
    id,
    name: meta.name,
    paid: meta.paid,
    spendCents,
    leads,
    trials,
    newMembers,
    costPerLeadCents: cacCents(spendCents, leads),
    costPerTrialCents: cacCents(spendCents, trials),
    cacCents: cacCents(spendCents, newMembers),
  };
}

export type UnitEconomics = {
  spendCents: number;
  leads: number;
  trials: number;
  newMembers: number;
  blendedCacCents: number | null;
  paidSpendCents: number;
  paidNewMembers: number;
  paidCacCents: number | null;
  avgTuitionCents: number | null;
  ltvCents: number | null;
  ltvCacRatio: number | null;
  paybackMonths: number | null;
};

function weighted(rows: GrowthCell[], valueOf: (row: GrowthCell) => number): number | null {
  const byNew = sum(rows.map(row => row.newEnrollments));
  if (byNew) return Math.round(sum(rows.map(row => row.newEnrollments * valueOf(row))) / byNew);
  const byStart = sum(rows.map(row => row.startingActive));
  if (!byStart) return null;
  return Math.round(sum(rows.map(row => row.startingActive * valueOf(row))) / byStart);
}

function unitEconomics(rows: GrowthCell[]): UnitEconomics {
  const stats = CHANNELS.map(channel => channelEconomics(channel.id, rows.map(row => row.channels[channel.id])));
  const spendCents = sum(stats.map(row => row.spendCents));
  const leads = sum(stats.map(row => row.leads));
  const trials = sum(stats.map(row => row.trials));
  const newMembers = sum(stats.map(row => row.newMembers));
  const paid = stats.filter(row => row.paid);
  const paidSpendCents = sum(paid.map(row => row.spendCents));
  const paidNewMembers = sum(paid.map(row => row.newMembers));
  const blended = cacCents(spendCents, newMembers);
  const avgTuitionCents = weighted(rows, tuitionOf);
  const ltvCents = weighted(rows, row => tuitionOf(row) * tenureMonthsOf(row));
  return {
    spendCents,
    leads,
    trials,
    newMembers,
    blendedCacCents: blended,
    paidSpendCents,
    paidNewMembers,
    paidCacCents: cacCents(paidSpendCents, paidNewMembers),
    avgTuitionCents,
    ltvCents,
    ltvCacRatio: blended && ltvCents != null ? round1(ltvCents / blended) : null,
    paybackMonths: blended && avgTuitionCents ? round1(blended / avgTuitionCents) : null,
  };
}

export type SchoolCac = UnitEconomics & {
  id: string;
  name: string;
  brand: 'lvlup' | 'goninja' | 'all';
  channels: ChannelEconomics[];
};

export type CacReport = {
  scope: string;
  scopeLabel: string;
  month: string;
  monthLabel: string;
  partial: boolean;
  summary: SchoolCac;
  bySchool: SchoolCac[];
  channels: ChannelEconomics[];
};

function schoolCac(rows: GrowthCell[], id: string, name: string, brand: SchoolCac['brand']): SchoolCac {
  return {
    id,
    name,
    brand,
    ...unitEconomics(rows),
    channels: CHANNELS.map(channel => channelEconomics(channel.id, rows.map(row => row.channels[channel.id]))),
  };
}

export function cacReport(scope: string, month: string, cells: GrowthCell[] = demoCells()): CacReport {
  assertMonth(month);
  const { ids, partial } = idsFor(scope, cells);
  const rows = monthCells(cells, month, ids);
  const bySchool = ids.map(id => {
    const school = schoolById(id)!;
    return schoolCac(rows.filter(row => row.locationId === id), id, school.name, school.brand);
  });
  const label = groupLabel(ids, scope, partial);
  const summary = schoolCac(rows, scope, label === 'all 6 schools' ? 'All schools' : label, scope === 'all' ? 'all' : scope === 'goninja' ? 'goninja' : scope === 'lvlup' ? 'lvlup' : bySchool[0]?.brand || 'lvlup');
  return {
    scope,
    scopeLabel: label,
    month,
    monthLabel: monthLabel(month),
    partial,
    summary,
    bySchool,
    channels: summary.channels,
  };
}

export type PulseCard = {
  id: string;
  name: string;
  brand: 'lvlup' | 'goninja' | 'all';
  attritionPct: number | null;
  retentionPct: number | null;
  netGrowth: number;
  blendedCacCents: number | null;
  onTrack: boolean;
  earlyDrop: boolean;
  startingActive: number;
  cancellations: number;
  newEnrollments: number;
};

export type PulseReport = {
  scope: string;
  scopeLabel: string;
  month: string;
  monthLabel: string;
  partial: boolean;
  goalPct: number;
  rollup: PulseCard;
  schools: PulseCard[];
};

export function pulseReport(scope: string, month: string, cells: GrowthCell[] = demoCells()): PulseReport {
  const attrition = attritionReport(scope, month, cells);
  const cac = cacReport(scope, month, cells);
  const card = (movement: SchoolMovement, money: SchoolCac, brand: PulseCard['brand']): PulseCard => ({
    id: movement.id,
    name: movement.name,
    brand,
    attritionPct: movement.attritionPct,
    retentionPct: movement.retentionPct,
    netGrowth: movement.netGrowth,
    blendedCacCents: money.blendedCacCents,
    onTrack: movement.onTrack,
    earlyDrop: movement.earlyDrop,
    startingActive: movement.startingActive,
    cancellations: movement.cancellations,
    newEnrollments: movement.newEnrollments,
  });
  return {
    scope,
    scopeLabel: attrition.scopeLabel,
    month,
    monthLabel: attrition.monthLabel,
    partial: attrition.partial,
    goalPct: GOAL_PCT,
    rollup: card(attrition.summary, cac.summary, scope === 'goninja' ? 'goninja' : scope === 'lvlup' ? 'lvlup' : scope === 'all' ? 'all' : attrition.bySchool[0]?.brand || 'lvlup'),
    schools: attrition.bySchool.map(row => card(row, cac.bySchool.find(item => item.id === row.id) || cac.summary, row.brand)),
  };
}

function csvEscape(value: string | number | null | undefined) {
  const text = value == null ? '' : String(value);
  if (/[",\n]/.test(text)) return '"' + text.replace(/"/g, '""') + '"';
  return text;
}

function dollars(cents: number | null) {
  if (cents == null) return '';
  return (cents / 100).toFixed(2);
}

export function attritionCsv(scope: string, month: string, cells: GrowthCell[] = demoCells()): string {
  const report = attritionReport(scope, month, cells);
  const header = ['School', 'Month', 'Starting active', 'New enrollments', 'Cancellations', 'Attrition %', 'Net member growth', 'Retention %']
    .concat(REASONS.map(reason => reason.name))
    .concat(TENURES.map(bucket => bucket.name));
  const line = (row: SchoolMovement) => [
    row.name,
    report.month,
    row.startingActive,
    row.newEnrollments,
    row.cancellations,
    row.attritionPct == null ? '' : row.attritionPct.toFixed(1),
    row.netGrowth,
    row.retentionPct == null ? '' : row.retentionPct.toFixed(1),
    ...row.reasons.map(item => item.count),
    ...row.tenure.map(item => item.count),
  ].map(csvEscape).join(',');
  return [header.join(','), ...report.bySchool.map(line), line(report.summary)].join('\n') + '\n';
}

export function cacCsv(scope: string, month: string, cells: GrowthCell[] = demoCells()): string {
  const report = cacReport(scope, month, cells);
  const header = ['School', 'Month', 'Channel', 'Spend', 'Leads', 'Trials', 'New members', 'Cost per lead', 'Cost per trial', 'CAC'];
  const lines: string[] = [header.join(',')];
  const push = (school: string, channel: ChannelEconomics) => {
    lines.push([
      school,
      report.month,
      channel.name,
      dollars(channel.spendCents),
      channel.leads,
      channel.trials,
      channel.newMembers,
      dollars(channel.costPerLeadCents),
      dollars(channel.costPerTrialCents),
      dollars(channel.cacCents),
    ].map(csvEscape).join(','));
  };
  for (const school of report.bySchool) {
    for (const channel of school.channels) push(school.name, channel);
  }
  for (const channel of report.channels) push(report.summary.name, channel);
  return lines.join('\n') + '\n';
}

function groupLabel(ids: SchoolId[], scope: string, partial: boolean) {
  if (!partial && scope === 'all') return 'all 6 schools';
  if (!partial && scope === 'lvlup') return 'LVLUP';
  if (!partial && scope === 'goninja') return 'Go Ninja';
  if (ids.length === 1) return schoolById(ids[0])?.name || ids[0];
  return ids.map(id => schoolById(id)?.name || id).join(', ');
}

const ASK_SCHOOLS: Array<[string, string]> = [
  ['go ninja verona', 'goninjaV'],
  ['goninja verona', 'goninjaV'],
  ['go ninja waunakee', 'goninjaW'],
  ['goninja waunakee', 'goninjaW'],
  ['east madison', 'eastmad'],
  ['east mad', 'eastmad'],
  ['deforest', 'deforest'],
  ['verona', 'verona'],
  ['waunakee', 'waunakee'],
  ['go ninja', 'goninja'],
  ['lvlup', 'lvlup'],
  ['level up', 'lvlup'],
  ['all school', 'all'],
  ['company', 'all'],
  ['combined', 'all'],
];

export function scopeFromQuestion(question: string): string {
  const text = question.toLowerCase();
  for (const [needle, scope] of ASK_SCHOOLS) {
    if (text.includes(needle)) return scope;
  }
  return '';
}

export function monthFromQuestion(question: string, asOf = GROWTH_AS_OF): string | null {
  const text = question.toLowerCase();
  const current = asOf.slice(0, 7);
  if (text.includes('last month')) return shiftMonth(current, -1);
  if (text.includes('this month')) return current;
  const iso = text.match(/\b(20\d{2})-(0[1-9]|1[0-2])\b/);
  if (iso) return iso[1] + '-' + iso[2];
  const names: Array<[string, number]> = [
    ['january', 1], ['february', 2], ['march', 3], ['april', 4], ['may', 5], ['june', 6],
    ['july', 7], ['august', 8], ['september', 9], ['october', 10], ['november', 11], ['december', 12],
  ];
  for (const [name, index] of names) {
    if (text.includes(name)) {
      const year = text.match(/\b(20\d{2})\b/);
      return (year ? year[1] : current.slice(0, 4)) + '-' + String(index).padStart(2, '0');
    }
  }
  return null;
}

function topCounts(rows: CountRow[], limit = 3) {
  return rows.filter(row => row.count > 0).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, limit);
}

function signed(value: number) {
  return value > 0 ? '+' + value : String(value);
}

export function answerGrowthQuestion(question: string, opts: { scope?: string; month?: string; asOf?: string; cells?: GrowthCell[] } = {}) {
  const asked = String(question || '').trim().slice(0, 500);
  const text = asked.toLowerCase();
  const asOf = opts.asOf || GROWTH_AS_OF;
  const namedScope = scopeFromQuestion(asked);
  const scope = namedScope || opts.scope || 'all';
  const namedMonth = monthFromQuestion(asked, asOf);
  const month = namedMonth || opts.month || asOf.slice(0, 7);
  const cells = opts.cells || demoCells();
  if (!(GROWTH_MONTHS as readonly string[]).includes(month)) {
    return {
      question: asked,
      answer: 'This preview covers June 2026 through November 2026. Ask about one of those months.',
      month,
      scope,
      topic: 'help',
    };
  }
  let reportScope = scope;
  try { schoolsInScope(reportScope); }
  catch { reportScope = 'all'; }
  const attrition = attritionReport(reportScope, month, cells);
  const cac = cacReport(reportScope, month, cells);
  const where = attrition.scopeLabel;
  const when = attrition.monthLabel;
  const wantsCac = /cac|acquisition|ad spend|channel|cost per/.test(text);
  const wantsWhy = /why|reason|leaving|left|cancel reason/.test(text);
  const wantsTenure = /tenure|early|how long|under 3|3 month/.test(text);
  const wantsUnit = /ltv|payback|tuition|unit economic/.test(text);
  const wantsNet = /net/.test(text) && /growth|member|enroll/.test(text);
  const wantsRetention = /retention/.test(text);
  const wantsHighest = /highest|worst|which school|who has/.test(text);
  const wantsAttrition = /attrition|churn/.test(text) || (/cancel/.test(text) && !wantsWhy);

  const parts: string[] = [];
  let topic = 'help';
  const wantsHelp = !asked || (/what can you|help me ask/.test(text) && !wantsCac && !wantsAttrition);
  if (wantsHelp) {
    topic = 'help';
    parts.push('Ask about attrition, retention, net member growth, why students left, tenure, CAC by school and channel, or LTV. For example: What was our attrition rate last month?');
  } else {
    if (wantsHighest && !wantsCac) {
      topic = 'attrition';
      const ranked = attrition.bySchool.slice().sort((a, b) => (b.attritionPct ?? -1) - (a.attritionPct ?? -1));
      const top = ranked[0];
      const tied = ranked.filter(row => row.attritionPct === top?.attritionPct);
      const names = tied.map(row => row.name).join(' and ');
      parts.push(names + ' ' + (tied.length > 1 ? 'have' : 'has') + ' the highest attrition in ' + when + ' at ' + formatPct(top?.attritionPct ?? null) + '.');
      if (top?.earlyDrop) parts.push('Most of those students had been enrolled under 3 months.');
    }
    if (wantsAttrition && !wantsHighest) {
      topic = 'attrition';
      const row = attrition.summary;
      parts.push(when + ' attrition across ' + where + ' was ' + formatPct(row.attritionPct) + '. That is cancellations divided by starting active members. ' + row.cancellations + ' canceled and ' + row.startingActive + ' were active at the start of the month.');
      parts.push('Retention was ' + formatPct(row.retentionPct) + '. Net member growth was ' + signed(row.netGrowth) + ' (' + row.newEnrollments + ' new enrollments minus ' + row.cancellations + ' cancellations).');
      parts.push(row.onTrack ? 'That is at or under the 3% goal.' : 'That is above the 3% goal.');
    }
    if (wantsRetention && !wantsAttrition) {
      topic = 'retention';
      parts.push(when + ' retention across ' + where + ' was ' + formatPct(attrition.summary.retentionPct) + '. Retention is 100% minus attrition.');
    }
    if (wantsNet) {
      topic = topic === 'help' ? 'growth' : topic;
      const row = attrition.summary;
      parts.push('Net member growth in ' + when + ' across ' + where + ' was ' + signed(row.netGrowth) + ' (' + row.newEnrollments + ' new enrollments minus ' + row.cancellations + ' cancellations).');
    }
    if (wantsWhy || wantsTenure) {
      topic = 'reasons';
      const reasons = topCounts(attrition.reasons, 6);
      const reasonText = reasons.length ? reasons.map(row => row.name + ' (' + row.count + ')').join(', ') : 'none recorded';
      parts.push('In ' + when + ', ' + attrition.summary.cancellations + ' students canceled across ' + where + '. Reasons: ' + reasonText + '.');
      const tenure = topCounts(attrition.tenure, 4);
      parts.push('Tenure of those cancellations: ' + tenure.map(row => row.name + ' (' + row.count + ')').join(', ') + '.');
      const early = attrition.bySchool.filter(row => row.earlyDrop).map(row => row.name);
      if (early.length) parts.push('Early-drop pattern at ' + early.join(', ') + ', where at least 40% of cancellations had been enrolled under 3 months.');
    }
    if (wantsCac) {
      topic = 'cac';
      const summary = cac.summary;
      parts.push(when + ' blended CAC across ' + where + ' is ' + formatMoney(summary.blendedCacCents) + '. That is total marketing spend of ' + formatMoney(summary.spendCents) + ' divided by ' + summary.newMembers + ' new enrolled students.');
      parts.push('Paid-only CAC (Google Ads and Meta / Facebook Ads) is ' + formatMoney(summary.paidCacCents) + '.');
      const schoolBits = cac.bySchool.map(row => row.name + ' ' + formatMoney(row.blendedCacCents));
      parts.push('By school: ' + schoolBits.join('; ') + '.');
      const channelBits = cac.channels.map(row => row.name + ' ' + formatMoney(row.cacCents) + ' (' + formatMoney(row.spendCents) + ' spend, ' + row.newMembers + ' new)');
      parts.push('By channel: ' + channelBits.join('; ') + '.');
    }
    if (wantsUnit) {
      topic = 'unit';
      const summary = cac.summary;
      parts.push('Across ' + where + ' in ' + when + ', average monthly tuition is ' + formatMoney(summary.avgTuitionCents) + ' and LTV is ' + formatMoney(summary.ltvCents) + '.');
      parts.push('The LTV to CAC ratio is ' + (summary.ltvCacRatio == null ? 'n/a' : summary.ltvCacRatio.toFixed(1) + ' to 1') + '. CAC payback is ' + (summary.paybackMonths == null ? 'n/a' : summary.paybackMonths.toFixed(1) + ' months') + '.');
      parts.push('LTV is average monthly tuition times average length of stay. Payback is blended CAC divided by that tuition.');
    }
  }
  if (!parts.length) {
    topic = 'help';
    parts.push('Ask about attrition, retention, net member growth, why students left, tenure, CAC by school and channel, or LTV. For example: What is our CAC by school and channel?');
  }
  return {
    question: asked,
    answer: parts.join(' '),
    month,
    scope: reportScope,
    topic,
  };
}

export function parseSpendInput(body: unknown): SpendOverride[] {
  const record = body && typeof body === 'object' ? body as Record<string, unknown> : {};
  const rawRows = Array.isArray(body) ? body : Array.isArray(record.rows) ? record.rows : [record];
  if (!rawRows.length || (rawRows.length === 1 && !rawRows[0])) throw new GrowthInputError('Add at least one spend row.');
  if (rawRows.length > 60) throw new GrowthInputError('Too many spend rows.');
  return rawRows.map(row => {
    const item = row && typeof row === 'object' ? row as Record<string, unknown> : {};
    const locationId = String(item.locationId || '');
    const month = String(item.month || item.monthKey || '');
    const channel = String(item.channel || '');
    if (!schoolById(locationId)) throw new GrowthInputError('Choose a school.');
    if (!/^[0-9]{4}-(0[1-9]|1[0-2])$/.test(month)) throw new GrowthInputError('Choose a month.');
    const year = Number(month.slice(0, 4));
    if (year < 2024 || year > 2030) throw new GrowthInputError('Choose a month between 2024 and 2030.');
    if (!CHANNELS.some(itemChannel => itemChannel.id === channel)) throw new GrowthInputError('Choose a channel.');
    let cents: number;
    if (item.amountCents != null && item.amountCents !== '') {
      cents = Number(item.amountCents);
      if (!Number.isInteger(cents)) throw new GrowthInputError('Enter spend in cents as a whole number.');
    } else if (item.amountDollars != null) {
      const text = String(item.amountDollars).trim().replace(/[$,]/g, '');
      if (!text) cents = 0;
      else {
        if (!/^\d+(\.\d{1,2})?$/.test(text)) throw new GrowthInputError('Enter a dollar amount from 0 to 250000.');
        cents = Math.round(Number(text) * 100);
      }
    } else {
      throw new GrowthInputError('Enter a dollar amount from 0 to 250000.');
    }
    if (cents < 0 || cents > 25000000) throw new GrowthInputError('Enter a dollar amount from 0 to 250000.');
    return { locationId, month, channel, amountCents: cents };
  });
}

export function summaryPayload(cells: GrowthCell[], extra: { fixture: boolean; database: boolean }) {
  return {
    fixture: extra.fixture,
    database: extra.database,
    live: false,
    charged: false,
    asOf: GROWTH_AS_OF,
    goalPct: GOAL_PCT,
    months: [...GROWTH_MONTHS],
    schools: GROWTH_SCHOOLS.map(row => ({
      id: row.id, name: row.name, brand: row.brand, tuitionCents: row.tuitionCents, avgTenureMonths: row.avgTenureMonths,
    })),
    channels: CHANNELS.map(row => ({ id: row.id, name: row.name, paid: row.paid })),
    cells,
  };
}
