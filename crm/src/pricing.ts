/** Booking price after promo codes. Pure. Does not charge. */

export type DiscountType = 'percent' | 'fixed' | 'free';
export type Audience = 'all' | 'members' | 'new_customers';
export type BuyerKind = 'member' | 'new_customer' | 'lead';

export type PromoScope = {
  scopeType: 'all' | 'brand' | 'location' | 'event_type' | 'event' | 'session';
  brand?: string | null;
  locationId?: string | null;
  eventType?: string | null;
  eventId?: string | null;
  sessionId?: string | null;
};

export type PromoCode = {
  code: string;
  discountType: DiscountType;
  percentOff?: number | null;
  amountOffCents?: number | null;
  startsOn?: string | null;
  endsOn?: string | null;
  maxRedemptions?: number | null;
  maxPerFamily?: number | null;
  maxPerMember?: number | null;
  audience: Audience;
  stacks: boolean;
  active: boolean;
  scopes: PromoScope[];
};

export type Redemption = {
  code: string;
  familyId?: string | null;
  memberId?: string | null;
};

export type QuoteInput = {
  listPriceCents: number;
  on: string;
  locationId: string;
  brand: string;
  eventType?: string | null;
  eventId?: string | null;
  sessionId?: string | null;
  buyer: BuyerKind;
  familyId?: string | null;
  memberId?: string | null;
  codes: string[];
  catalog: PromoCode[];
  redemptions: Redemption[];
};

export type AppliedCode = {
  code: string;
  discountCents: number;
  priceAfterCents: number;
};

export type Quote = {
  listPriceCents: number;
  discountCents: number;
  dueCents: number;
  applied: AppliedCode[];
};

function norm(code: string) {
  return String(code || '').trim().toUpperCase();
}

function scopeMatches(scope: PromoScope, input: QuoteInput) {
  if (scope.scopeType === 'all') return true;
  if (scope.scopeType === 'brand') return scope.brand === input.brand;
  if (scope.scopeType === 'location') return scope.locationId === input.locationId;
  if (scope.scopeType === 'event_type') return !!input.eventType && scope.eventType === input.eventType;
  if (scope.scopeType === 'event') return !!input.eventId && scope.eventId === input.eventId;
  if (scope.scopeType === 'session') return !!input.sessionId && scope.sessionId === input.sessionId;
  return false;
}

function codeAppliesToBooking(code: PromoCode, input: QuoteInput) {
  if (!code.scopes.length) return true;
  return code.scopes.some(s => scopeMatches(s, input));
}

function countUses(redemptions: Redemption[], code: string, pred: (r: Redemption) => boolean) {
  const key = norm(code);
  return redemptions.filter(r => norm(r.code) === key && pred(r)).length;
}

export function quoteBooking(input: QuoteInput): Quote {
  if (!Number.isInteger(input.listPriceCents) || input.listPriceCents < 0) {
    throw new Error('listPriceCents must be a non-negative integer');
  }
  const wanted = input.codes.map(norm).filter(Boolean);
  if (!wanted.length) {
    return { listPriceCents: input.listPriceCents, discountCents: 0, dueCents: input.listPriceCents, applied: [] };
  }
  const unique = new Set(wanted);
  if (unique.size !== wanted.length) throw new Error('A code can be entered once');

  const found: PromoCode[] = [];
  for (const raw of wanted) {
    const code = input.catalog.find(c => norm(c.code) === raw);
    if (!code || !code.active) throw new Error('Unknown code ' + raw);
    if (code.startsOn && input.on < code.startsOn) throw new Error(raw + ' is not active yet');
    if (code.endsOn && input.on > code.endsOn) throw new Error(raw + ' has expired');
    if (!codeAppliesToBooking(code, input)) throw new Error(raw + ' does not apply to this booking');
    if (code.audience === 'members' && input.buyer !== 'member') {
      throw new Error(raw + ' is for current members');
    }
    if (code.audience === 'new_customers' && input.buyer !== 'new_customer') {
      throw new Error(raw + ' is for new customers');
    }
    const total = countUses(input.redemptions, raw, () => true);
    if (code.maxRedemptions != null && total >= code.maxRedemptions) {
      throw new Error(raw + ' has been used up');
    }
    if (code.maxPerFamily != null && input.familyId) {
      const n = countUses(input.redemptions, raw, r => r.familyId === input.familyId);
      if (n >= code.maxPerFamily) throw new Error(raw + ' is already used for this family');
    }
    if (code.maxPerMember != null && input.memberId) {
      const n = countUses(input.redemptions, raw, r => r.memberId === input.memberId);
      if (n >= code.maxPerMember) throw new Error(raw + ' is already used for this member');
    }
    found.push(code);
  }
  if (found.length > 1 && found.some(c => !c.stacks)) {
    throw new Error('Those codes cannot be combined');
  }

  let price = input.listPriceCents;
  const applied: AppliedCode[] = [];
  const ordered = [
    ...found.filter(c => c.discountType === 'percent'),
    ...found.filter(c => c.discountType === 'fixed'),
    ...found.filter(c => c.discountType === 'free'),
  ];
  for (const code of ordered) {
    let discount = 0;
    if (code.discountType === 'percent') {
      discount = Math.round(price * (Number(code.percentOff) / 100));
    } else if (code.discountType === 'fixed') {
      discount = Math.min(price, code.amountOffCents || 0);
    } else {
      discount = price;
    }
    price -= discount;
    applied.push({ code: norm(code.code), discountCents: discount, priceAfterCents: price });
  }
  const discountCents = input.listPriceCents - price;
  return { listPriceCents: input.listPriceCents, discountCents, dueCents: price, applied };
}
