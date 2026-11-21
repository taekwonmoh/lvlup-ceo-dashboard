/**
 * Billing rules Mike set in November 2026.
 * Mini-Tigers and grandfathered plans bill monthly.
 * Every other plan bills every 4 weeks (13 drafts a year).
 * The anchor defaults to the membership start date and can be overridden.
 * No charge is sent from this file.
 */

export type Cadence = 'monthly' | 'every_4_weeks' | 'prepaid_term';

export type PlanCadenceInput = {
  name?: string;
  program?: string;
  grandfathered?: boolean;
  interval?: string | null;
};

const MINI = /mini[-\s]?tiger/i;

export function cadenceForPlan(plan: PlanCadenceInput): Cadence {
  if (plan.interval === 'prepaid_term') return 'prepaid_term';
  if (plan.grandfathered) return 'monthly';
  const label = `${plan.name || ''} ${plan.program || ''}`;
  if (MINI.test(label) || /grandfather/i.test(label)) return 'monthly';
  if (plan.interval === 'monthly' || plan.interval === 'every_4_weeks') return plan.interval;
  return 'every_4_weeks';
}

/** Prepaid year length. 13 drafts for a 4-week plan, 12 for a monthly plan. */
export function prepaidPaymentCount(cadence: Cadence): number {
  if (cadence === 'monthly') return 12;
  if (cadence === 'every_4_weeks') return 13;
  return 1;
}

/** Anchor is the membership start unless someone set a different date. */
export function billingAnchor(startedOn: string, anchorOn?: string | null): string {
  return anchorOn && /^\d{4}-\d{2}-\d{2}$/.test(anchorOn) ? anchorOn : startedOn;
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate();
  const day = Math.min(d, last);
  return dt.toISOString().slice(0, 8) + String(day).padStart(2, '0');
}

/** Draft dates in [from, through], inclusive. A 4-week plan can land twice in one calendar month. */
export function draftDates(input: {
  anchor: string;
  cadence: Cadence;
  from: string;
  through: string;
}): string[] {
  if (input.cadence === 'prepaid_term') return [];
  const out: string[] = [];
  if (input.cadence === 'every_4_weeks') {
    let cursor = input.anchor;
    while (cursor < input.from) cursor = addDays(cursor, 28);
    while (cursor <= input.through) {
      out.push(cursor);
      cursor = addDays(cursor, 28);
    }
    return out;
  }
  let cursor = input.anchor;
  while (cursor < input.from) cursor = addMonths(cursor, 1);
  while (cursor <= input.through) {
    out.push(cursor);
    cursor = addMonths(cursor, 1);
  }
  return out;
}

export function monthsWithTwoDrafts(dates: string[]): string[] {
  const counts = new Map<string, number>();
  for (const d of dates) {
    const key = d.slice(0, 7);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()].filter(([, n]) => n >= 2).map(([k]) => k);
}

/**
 * Where a school's tuition is drafted.
 * DeForest uses Waunakee's merchant.
 * Go Ninja Waunakee uses Waunakee. Go Ninja Verona uses Verona.
 * The brand on the member record does not change.
 */
export const MERCHANT_ROUTES: Record<string, string> = {
  waunakee: 'waunakee',
  eastmad: 'eastmad',
  verona: 'verona',
  deforest: 'waunakee',
  goninjaW: 'waunakee',
  goninjaV: 'verona',
};

export function merchantAccountFor(locationId: string): { locationId: string; merchantLocationId: string; shared: boolean } {
  const merchantLocationId = MERCHANT_ROUTES[locationId];
  if (!merchantLocationId) {
    throw new Error('No merchant route for ' + locationId);
  }
  return { locationId, merchantLocationId, shared: merchantLocationId !== locationId };
}

export type FamilyMember = {
  id: string;
  locationId: string;
  startedOn: string;
  status: 'active' | 'hold' | 'cancelled' | 'past_due' | 'trial' | 'inactive';
  currentAmountCents: number;
};

/** 3rd paying member and beyond. A hold or a cancellation drops them out of the count. */
export const FAMILY_DISCOUNT_PERCENT: Record<string, number> = {
  waunakee: 30,
  verona: 50,
  eastmad: 50,
  deforest: 50,
};

function countsTowardFamily(status: FamilyMember['status']) {
  return status === 'active' || status === 'past_due';
}

export type DiscountPreview = {
  id: string;
  currentAmountCents: number;
  proposedAmountCents: number;
  percentOff: number;
  /** The stored price is not changed by this preview. */
  priceUnchanged: true;
};

export function familyDiscountPreview(members: FamilyMember[]): DiscountPreview[] {
  const paying = members
    .filter(m => countsTowardFamily(m.status))
    .slice()
    .sort((a, b) => a.startedOn.localeCompare(b.startedOn) || a.id.localeCompare(b.id));
  return members.map(m => {
    const place = paying.findIndex(p => p.id === m.id);
    const rate = FAMILY_DISCOUNT_PERCENT[m.locationId];
    const eligible = place >= 2 && rate != null;
    const proposed = eligible
      ? Math.round(m.currentAmountCents * (100 - rate) / 100)
      : m.currentAmountCents;
    return {
      id: m.id,
      currentAmountCents: m.currentAmountCents,
      proposedAmountCents: proposed,
      percentOff: eligible ? rate : 0,
      priceUnchanged: true,
    };
  });
}

/** A price write is refused until the upcoming schedule has been snapshotted. */
export function guardedPriceChange(input: {
  currentAmountCents: number;
  proposedAmountCents: number;
  snapshot: { at: string; rows: unknown[] } | null;
}): { amountCents: number; previousCents: number } {
  if (!input.snapshot || !input.snapshot.at || !Array.isArray(input.snapshot.rows)) {
    throw new Error('Snapshot upcoming charges before changing a price');
  }
  return { amountCents: input.proposedAmountCents, previousCents: input.currentAmountCents };
}
