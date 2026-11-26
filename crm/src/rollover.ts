/**
 * Prepaid rollover dates and tuition-credit application.
 * Nothing in this file submits a charge.
 */

export type RolloverCadence = 'monthly' | 'weekly' | 'every_4_weeks';

export type CreditLot = {
  id: string;
  remainingCents: number;
  expiresOn: string | null;
  createdAt: string;
};

export type CreditApplication = {
  id: string;
  appliedCents: number;
  remainingCents: number;
};

export type AppliedCredits = {
  grossCents: number;
  creditAppliedCents: number;
  chargeAmountCents: number;
  applications: CreditApplication[];
};

export type TuitionLine = {
  kind: 'tuition' | 'refund_credit';
  description: string;
  amountCents: number;
  creditAppliedCents: number;
  chargeAmountCents: number;
};

const CADENCE = new Set<RolloverCadence>(['monthly', 'weekly', 'every_4_weeks']);

export function normalizeRolloverCadence(value: unknown): RolloverCadence | null {
  const raw = String(value || '').trim().toLowerCase().replace(/-/g, '_');
  if (raw === '4_weeks') return 'every_4_weeks';
  if (CADENCE.has(raw as RolloverCadence)) return raw as RolloverCadence;
  return null;
}

export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function addMonths(isoDate: string, months: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate();
  const day = Math.min(d, last);
  return dt.toISOString().slice(0, 8) + String(day).padStart(2, '0');
}

function parts(isoDate: string) {
  const [y, m, d] = isoDate.split('-').map(Number);
  return { y, m, d };
}

function lastDay(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function iso(year: number, month: number, day: number) {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Monday is 1, Sunday is 7. */
export function weekdayMon1(isoDate: string) {
  const { y, m, d } = parts(isoDate);
  const js = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return js === 0 ? 7 : js;
}

export function daysBetween(from: string, to: string) {
  const a = Date.parse(from + 'T00:00:00Z');
  const b = Date.parse(to + 'T00:00:00Z');
  return Math.round((b - a) / 86400000);
}

function monthlyOnOrAfter(floor: string, anchorDay: number): string {
  const p = parts(floor);
  const here = iso(p.y, p.m, Math.min(anchorDay, lastDay(p.y, p.m)));
  if (here >= floor) return here;
  const next = addMonths(iso(p.y, p.m, 1), 1);
  const n = parts(next);
  return iso(n.y, n.m, Math.min(anchorDay, lastDay(n.y, n.m)));
}

export type RolloverWhen = {
  paidThroughOn: string;
  cadence: RolloverCadence;
  anchorOn?: string | null;
  anchorDay?: number | null;
};

/** First recurring draft on or after the prepaid paid-through date. */
export function firstRolloverOn(input: RolloverWhen): string {
  const floor = input.paidThroughOn;
  const anchor = input.anchorOn && /^\d{4}-\d{2}-\d{2}$/.test(input.anchorOn) && input.anchorOn > floor
    ? input.anchorOn
    : floor;
  if (input.cadence === 'monthly') {
    const dom = input.anchorDay && input.anchorDay >= 1 && input.anchorDay <= 31
      ? input.anchorDay
      : parts(anchor).d;
    return monthlyOnOrAfter(anchor, dom);
  }
  const step = input.cadence === 'weekly' ? 7 : 28;
  let cursor = input.anchorOn && /^\d{4}-\d{2}-\d{2}$/.test(input.anchorOn) ? input.anchorOn : floor;
  const weekday = input.anchorDay;
  if (weekday && weekday >= 1 && weekday <= 7) {
    cursor = addDays(cursor, (weekday - weekdayMon1(cursor) + 7) % 7);
  }
  while (cursor < floor) cursor = addDays(cursor, step);
  return cursor;
}

/** True when `on` is a rollover draft and is not inside the prepaid window. */
export function isRolloverDraftDate(input: RolloverWhen & { on: string }): boolean {
  if (!input.paidThroughOn || input.on < input.paidThroughOn) return false;
  const first = firstRolloverOn(input);
  if (input.on < first) return false;
  if (input.cadence === 'monthly') {
    const dom = input.anchorDay && input.anchorDay >= 1 && input.anchorDay <= 31
      ? input.anchorDay
      : parts(first).d;
    const p = parts(input.on);
    return p.d === Math.min(dom, lastDay(p.y, p.m));
  }
  const step = input.cadence === 'weekly' ? 7 : 28;
  return daysBetween(first, input.on) % step === 0;
}

/** Inclusive last day of the period that starts on `start`. */
export function periodEndFor(cadence: RolloverCadence, start: string): string {
  if (cadence === 'weekly') return addDays(start, 6);
  if (cadence === 'every_4_weeks') return addDays(start, 27);
  return addDays(addMonths(start, 1), -1);
}

/**
 * Soonest expiration first, then oldest grant.
 * A lot with no expiration sorts after dated lots.
 * The charge never goes below zero.
 */
export function applyTuitionCredits(grossCents: number, on: string, lots: CreditLot[]): AppliedCredits {
  const gross = Math.max(0, Math.round(Number(grossCents) || 0));
  const open = lots
    .filter(lot => lot.remainingCents > 0 && (!lot.expiresOn || lot.expiresOn >= on))
    .slice()
    .sort((a, b) => {
      const ae = a.expiresOn || '9999-12-31';
      const be = b.expiresOn || '9999-12-31';
      if (ae !== be) return ae < be ? -1 : 1;
      if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
      return a.id < b.id ? -1 : 1;
    });
  let left = gross;
  const applications: CreditApplication[] = [];
  for (const lot of open) {
    if (left <= 0) break;
    const take = Math.min(lot.remainingCents, left);
    if (take <= 0) continue;
    applications.push({ id: lot.id, appliedCents: take, remainingCents: lot.remainingCents - take });
    left -= take;
  }
  return {
    grossCents: gross,
    creditAppliedCents: gross - left,
    chargeAmountCents: left,
    applications,
  };
}

export function tuitionInvoiceLines(description: string, applied: AppliedCredits): TuitionLine[] {
  const lines: TuitionLine[] = [{
    kind: 'tuition',
    description,
    amountCents: applied.grossCents,
    creditAppliedCents: applied.creditAppliedCents,
    chargeAmountCents: applied.chargeAmountCents,
  }];
  if (applied.creditAppliedCents > 0) {
    lines.push({
      kind: 'refund_credit',
      description: 'Tuition credit',
      amountCents: -applied.creditAppliedCents,
      creditAppliedCents: applied.creditAppliedCents,
      chargeAmountCents: 0,
    });
  }
  return lines;
}
