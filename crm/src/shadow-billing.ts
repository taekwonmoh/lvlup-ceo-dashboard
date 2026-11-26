/**
 * Shadow billing. Builds the invoices a date would charge and compares
 * them to a GymDesk payments export. Never submits a charge.
 */
import { billingDecision, type HoldFeePolicy } from './holds.ts';
import { merchantAccountFor } from './billing.ts';
import { applyTuitionCredits, isRolloverDraftDate, normalizeRolloverCadence, type CreditLot } from './rollover.ts';

export const HOLD_FEE_OFF: HoldFeePolicy = { enabled: false, monthlyAmountCents: null };

export function netTuitionCents(amountCents: number, discountBps: number) {
  const bps = Math.min(10000, Math.max(0, discountBps || 0));
  return Math.round(amountCents * (10000 - bps) / 10000);
}

export type ShadowMember = {
  memberId: string;
  locationId: string;
  status: 'active' | 'hold' | 'pending_cancel' | 'cancelled' | 'past_due' | 'trial';
  biller: 'gymdesk' | 'lvlup';
  nextBillOn: string | null;
  paidThroughOn: string | null;
  amountCents: number;
  discountBps: number;
  prepaid: boolean;
  hold: { status: string; startOn: string; endOn: string } | null;
  rolloverEnabled?: boolean;
  rolloverCancelled?: boolean;
  rolloverCadence?: string | null;
  rolloverAmountCents?: number | null;
  rolloverAnchorOn?: string | null;
  rolloverAnchorDay?: number | null;
  credits?: CreditLot[];
};

export type ShadowLine = {
  memberId: string;
  locationId: string;
  merchantLocationId: string;
  amountCents: number;
  grossCents?: number;
  creditAppliedCents?: number;
  chargeAmountCents?: number;
  reason: string;
  action: 'charge' | 'skip';
};

function lineBase(member: ShadowMember, merchantLocationId: string, amountCents: number, reason: string, action: 'charge' | 'skip', extra: Partial<ShadowLine> = {}): ShadowLine {
  return { memberId: member.memberId, locationId: member.locationId, merchantLocationId, amountCents, reason, action, ...extra };
}

export function classifyMember(member: ShadowMember, on: string): ShadowLine {
  const merchantLocationId = merchantAccountFor(member.locationId).merchantLocationId;
  const amountCents = netTuitionCents(member.amountCents, member.discountBps);
  const credits = member.credits || [];
  if (member.prepaid) {
    const cadence = normalizeRolloverCadence(member.rolloverCadence);
    if (!member.rolloverEnabled || !cadence || !member.paidThroughOn || on < member.paidThroughOn) {
      return lineBase(member, merchantLocationId, amountCents, 'skipped_prepaid', 'skip');
    }
    if (member.rolloverCancelled) {
      return lineBase(member, merchantLocationId, amountCents, 'skipped_rollover_cancelled', 'skip');
    }
    if (!isRolloverDraftDate({
      on,
      paidThroughOn: member.paidThroughOn,
      cadence,
      anchorOn: member.rolloverAnchorOn,
      anchorDay: member.rolloverAnchorDay,
    })) {
      return lineBase(member, merchantLocationId, amountCents, 'skipped_not_due', 'skip');
    }
    const gross = netTuitionCents(member.rolloverAmountCents ?? member.amountCents, member.discountBps);
    const applied = applyTuitionCredits(gross, on, credits);
    return lineBase(member, merchantLocationId, applied.chargeAmountCents, 'would_charge', 'charge', {
      grossCents: applied.grossCents,
      creditAppliedCents: applied.creditAppliedCents,
      chargeAmountCents: applied.chargeAmountCents,
    });
  }
  const decision = billingDecision({
    on,
    status: member.status,
    biller: 'lvlup',
    nextBillOn: member.nextBillOn,
    paidThroughOn: member.paidThroughOn,
    hold: member.hold,
    cancelReceivedOn: null,
    holdFee: HOLD_FEE_OFF,
  });
  if (!decision.bill) {
    const reason = decision.reason === 'on_hold'
      ? 'skipped_hold'
      : decision.reason === 'already_paid'
        ? 'skipped_paid_through'
        : decision.reason === 'not_due'
          ? 'skipped_not_due'
          : `skipped_${decision.reason}`;
    return lineBase(member, merchantLocationId, amountCents, reason, 'skip');
  }
  const applied = applyTuitionCredits(amountCents, on, credits);
  return lineBase(member, merchantLocationId, applied.chargeAmountCents, 'would_charge', 'charge', {
    grossCents: applied.grossCents,
    creditAppliedCents: applied.creditAppliedCents,
    chargeAmountCents: applied.chargeAmountCents,
  });
}

export type GymdeskPayment = {
  memberId: string;
  on: string;
  amountCents: number;
  status: string;
  locationId: string;
};

export type ShadowReport = {
  on: string;
  merchantLocationId: string;
  assumedBiller: 'lvlup';
  matched: { memberId: string; amountCents: number }[];
  amountMismatch: { memberId: string; ourCents: number; gymdeskCents: number }[];
  wouldOnly: { memberId: string; amountCents: number }[];
  gymdeskOnly: { memberId: string; amountCents: number; ourReason: string | null }[];
  skipped: { memberId: string; reason: string; amountCents: number }[];
  doubleChargeRisk: { memberId: string; amountCents: number; ourReason: string | null }[];
};

export function compareShadowDay(input: {
  on: string;
  merchantLocationId: string;
  members: ShadowMember[];
  payments: GymdeskPayment[];
}): ShadowReport {
  const lines = input.members
    .map(m => classifyMember(m, input.on))
    .filter(line => line.merchantLocationId === input.merchantLocationId);
  const charges = new Map(lines.filter(l => l.action === 'charge').map(l => [l.memberId, l]));
  const skips = new Map(lines.filter(l => l.action === 'skip').map(l => [l.memberId, l]));
  const payments = input.payments.filter(p =>
    p.on === input.on
    && p.status === 'approved'
    && merchantAccountFor(p.locationId).merchantLocationId === input.merchantLocationId);
  const matched: ShadowReport['matched'] = [];
  const amountMismatch: ShadowReport['amountMismatch'] = [];
  const wouldOnly: ShadowReport['wouldOnly'] = [];
  const gymdeskOnly: ShadowReport['gymdeskOnly'] = [];
  const seen = new Set<string>();
  for (const pay of payments) {
    seen.add(pay.memberId);
    const charge = charges.get(pay.memberId);
    const skip = skips.get(pay.memberId);
    if (charge && charge.amountCents === pay.amountCents) {
      matched.push({ memberId: pay.memberId, amountCents: pay.amountCents });
    } else if (charge) {
      amountMismatch.push({ memberId: pay.memberId, ourCents: charge.amountCents, gymdeskCents: pay.amountCents });
    } else {
      gymdeskOnly.push({
        memberId: pay.memberId,
        amountCents: pay.amountCents,
        ourReason: skip ? skip.reason : 'not_in_roster',
      });
    }
  }
  for (const charge of charges.values()) {
    if (!seen.has(charge.memberId)) wouldOnly.push({ memberId: charge.memberId, amountCents: charge.amountCents });
  }
  return {
    on: input.on,
    merchantLocationId: input.merchantLocationId,
    assumedBiller: 'lvlup',
    matched,
    amountMismatch,
    wouldOnly,
    gymdeskOnly,
    skipped: lines.filter(l => l.action === 'skip').map(l => ({
      memberId: l.memberId,
      reason: l.reason,
      amountCents: l.amountCents,
    })),
    doubleChargeRisk: gymdeskOnly,
  };
}
