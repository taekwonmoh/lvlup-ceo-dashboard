/** Hold and cancel rules the billing job will enforce. No money moves here. */

export const NOTICE_DAYS = 30;

export type HoldFeePolicy = {
  enabled: boolean;
  monthlyAmountCents: number | null;
};

export const HOLD_FEE_OFF: HoldFeePolicy = { enabled: false, monthlyAmountCents: null };

export function addDays(iso: string, days: number) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function earliestCompletion(receivedOn: string) {
  return addDays(receivedOn, NOTICE_DAYS);
}

export type BillDecision = {
  bill: boolean;
  reason: string;
  holdFeeCents: number;
};

/** Whether a draft should run on `on` for this membership. */
export function billingDecision(input: {
  on: string;
  status: 'active' | 'hold' | 'pending_cancel' | 'cancelled' | 'past_due' | 'trial';
  biller: 'gymdesk' | 'lvlup';
  nextBillOn: string | null;
  paidThroughOn: string | null;
  hold: { status: string; startOn: string; endOn: string } | null;
  cancelReceivedOn: string | null;
  holdFee: HoldFeePolicy;
}): BillDecision {
  if (input.biller !== 'lvlup') return { bill: false, reason: 'still_on_gymdesk', holdFeeCents: 0 };
  if (input.status === 'cancelled') return { bill: false, reason: 'cancelled', holdFeeCents: 0 };
  if (input.status === 'trial') return { bill: false, reason: 'trial', holdFeeCents: 0 };
  if (!input.nextBillOn || input.on < input.nextBillOn) {
    return { bill: false, reason: 'not_due', holdFeeCents: 0 };
  }
  if (input.paidThroughOn && input.nextBillOn <= input.paidThroughOn) {
    return { bill: false, reason: 'already_paid', holdFeeCents: 0 };
  }
  const hold = input.hold;
  const onHold = !!(hold && (hold.status === 'approved' || hold.status === 'active')
    && input.on >= hold.startOn && input.on <= hold.endOn);
  if (onHold || input.status === 'hold') {
    const fee = input.holdFee.enabled && input.holdFee.monthlyAmountCents
      ? input.holdFee.monthlyAmountCents : 0;
    return { bill: false, reason: 'on_hold', holdFeeCents: fee };
  }
  if (input.cancelReceivedOn) {
    const end = earliestCompletion(input.cancelReceivedOn);
    if (input.nextBillOn >= end) return { bill: false, reason: 'notice_complete', holdFeeCents: 0 };
  }
  return { bill: true, reason: 'due', holdFeeCents: 0 };
}
