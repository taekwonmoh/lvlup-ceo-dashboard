import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { quoteBooking, type PromoCode } from '../src/pricing.ts';
import { billingDecision, earliestCompletion, HOLD_FEE_OFF } from '../src/holds.ts';
import { testingEligibility } from '../src/eligibility.ts';
import { matchCimProfiles, parseAttendanceCsv, parseMembersCsv } from '../src/gymdesk.ts';
import { authorizeMode, buildChargeProfileRequest, getCustomerProfile, submitCharge } from '../src/authorize.ts';
import { completionsFromFirebase, taskDueOnDate } from '../src/tasks.ts';
import { scheduledMinutes, shiftOnApprovedTimeOff, shiftsFromFirebase } from '../src/schedule.ts';
import { CrmError } from '../src/errors.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const clinic: PromoCode = {
  code: 'CLINIC10',
  discountType: 'percent',
  percentOff: 10,
  audience: 'all',
  stacks: true,
  active: true,
  startsOn: '2026-01-01',
  endsOn: '2026-12-31',
  scopes: [{ scopeType: 'event_type', eventType: 'clinic' }],
};
const freeWeek: PromoCode = {
  code: 'FREEWEEK',
  discountType: 'free',
  audience: 'new_customers',
  stacks: false,
  active: true,
  maxRedemptions: 1,
  scopes: [{ scopeType: 'all' }],
};
const memberOnly: PromoCode = {
  code: 'MEMBER5',
  discountType: 'fixed',
  amountOffCents: 500,
  audience: 'members',
  stacks: true,
  active: true,
  maxPerFamily: 1,
  scopes: [{ scopeType: 'brand', brand: 'lvlup' }],
};

const base = {
  listPriceCents: 5000,
  on: '2026-11-21',
  locationId: 'waunakee',
  brand: 'lvlup',
  eventType: 'clinic',
  buyer: 'member' as const,
  familyId: 'fam',
  memberId: 'mem',
  redemptions: [],
};

test('percent, fixed, and free codes', () => {
  const ten = quoteBooking({ ...base, codes: ['clinic10'], catalog: [clinic] });
  assert.equal(ten.dueCents, 4500);
  const off = quoteBooking({
    ...base, codes: ['MEMBER5'], catalog: [memberOnly], buyer: 'member',
  });
  assert.equal(off.dueCents, 4500);
  const free = quoteBooking({
    ...base, codes: ['FREEWEEK'], catalog: [freeWeek], buyer: 'new_customer',
  });
  assert.equal(free.dueCents, 0);
});

test('scope, dates, audience, limits, and stacking', () => {
  assert.throws(() => quoteBooking({
    ...base, eventType: 'party', codes: ['CLINIC10'], catalog: [clinic],
  }), /does not apply/);
  assert.throws(() => quoteBooking({
    ...base, on: '2027-01-01', codes: ['CLINIC10'], catalog: [clinic],
  }), /expired/);
  assert.throws(() => quoteBooking({
    ...base, buyer: 'lead', codes: ['MEMBER5'], catalog: [memberOnly],
  }), /current members/);
  assert.throws(() => quoteBooking({
    ...base, buyer: 'member', codes: ['FREEWEEK'], catalog: [freeWeek],
  }), /new customers/);
  assert.throws(() => quoteBooking({
    ...base, codes: ['FREEWEEK'], catalog: [freeWeek], buyer: 'new_customer',
    redemptions: [{ code: 'FREEWEEK' }],
  }), /used up/);
  assert.throws(() => quoteBooking({
    ...base, codes: ['MEMBER5'], catalog: [memberOnly],
    redemptions: [{ code: 'MEMBER5', familyId: 'fam' }],
  }), /this family/);
  assert.throws(() => quoteBooking({
    ...base, codes: ['CLINIC10', 'FREEWEEK'], catalog: [clinic, freeWeek], buyer: 'new_customer',
  }), /cannot be combined/);
  const stacked = quoteBooking({
    ...base, codes: ['CLINIC10', 'MEMBER5'], catalog: [clinic, memberOnly],
  });
  assert.equal(stacked.dueCents, 4000);
  assert.equal(stacked.applied.length, 2);
});

test('notice, holds, and already-paid drafts', () => {
  assert.equal(earliestCompletion('2026-11-07'), '2026-12-07');
  const due = billingDecision({
    on: '2026-11-21', status: 'active', biller: 'lvlup', nextBillOn: '2026-11-21',
    paidThroughOn: '2026-11-20', hold: null, cancelReceivedOn: null, holdFee: HOLD_FEE_OFF,
  });
  assert.equal(due.bill, true);
  const paid = billingDecision({
    ...{
      on: '2026-11-21', status: 'active' as const, biller: 'lvlup' as const, nextBillOn: '2026-11-21',
      paidThroughOn: '2026-11-21', hold: null, cancelReceivedOn: null, holdFee: HOLD_FEE_OFF,
    },
  });
  assert.equal(paid.reason, 'already_paid');
  const gym = billingDecision({
    on: '2026-11-21', status: 'active', biller: 'gymdesk', nextBillOn: '2026-11-21',
    paidThroughOn: null, hold: null, cancelReceivedOn: null, holdFee: HOLD_FEE_OFF,
  });
  assert.equal(gym.reason, 'still_on_gymdesk');
  const held = billingDecision({
    on: '2026-11-21', status: 'active', biller: 'lvlup', nextBillOn: '2026-11-21',
    paidThroughOn: null,
    hold: { status: 'approved', startOn: '2026-11-01', endOn: '2026-11-30' },
    cancelReceivedOn: null,
    holdFee: { enabled: false, monthlyAmountCents: 1500 },
  });
  assert.equal(held.bill, false);
  assert.equal(held.holdFeeCents, 0);
  const duringNotice = billingDecision({
    on: '2026-11-21', status: 'pending_cancel', biller: 'lvlup', nextBillOn: '2026-11-21',
    paidThroughOn: null, hold: null, cancelReceivedOn: '2026-11-07', holdFee: HOLD_FEE_OFF,
  });
  assert.equal(duringNotice.bill, true);
  const afterNotice = billingDecision({
    on: '2026-12-07', status: 'pending_cancel', biller: 'lvlup', nextBillOn: '2026-12-07',
    paidThroughOn: null, hold: null, cancelReceivedOn: '2026-11-07', holdFee: HOLD_FEE_OFF,
  });
  assert.equal(afterNotice.reason, 'notice_complete');
});

test('belt testing eligibility needs classes, time, and sign-off', () => {
  const rule = { minClasses: 8, minDaysInRank: 60, requiresInstructorSignoff: true };
  const short = testingEligibility({
    rule, classesAttended: 6, rankAwardedOn: '2026-11-01', asOf: '2026-11-21', signedOff: true,
  });
  assert.equal(short.eligible, false);
  assert.deepEqual(short.reasons, ['classes', 'time_in_rank']);
  const ready = testingEligibility({
    rule, classesAttended: 8, rankAwardedOn: '2026-09-01', asOf: '2026-11-21', signedOff: false,
  });
  assert.deepEqual(ready.reasons, ['signoff']);
  const yes = testingEligibility({
    rule, classesAttended: 8, rankAwardedOn: '2026-09-01', asOf: '2026-11-21', signedOff: true,
  });
  assert.equal(yes.eligible, true);
});

test('GymDesk fixture matches CIM profiles by merchant customer id', async () => {
  const members = parseMembersCsv(await readFile(join(root, 'fixtures/gymdesk-members.csv'), 'utf8'));
  assert.equal(members.length, 4);
  const active = members.filter(m => m.status === 'active');
  const profiles = JSON.parse(await readFile(join(root, 'fixtures/cim-profiles.json'), 'utf8')).profiles;
  const located = active.map(m => ({
    memberId: m.memberId,
    locationId: m.locationName === 'Verona' ? 'verona' : 'waunakee',
  }));
  const report = matchCimProfiles(located, profiles);
  assert.equal(report.matched.filter(m => m.hasPaymentMethod).length, 2);
  assert.deepEqual(report.profileWithoutPaymentMethod, ['10000003']);
  assert.deepEqual(report.profileWithoutMember, ['900000099']);
  const checks = parseAttendanceCsv(await readFile(join(root, 'fixtures/gymdesk-attendance.csv'), 'utf8'));
  assert.equal(checks.filter(c => c.memberId === '10000001').length, 6);
});

test('Authorize.net stays on sandbox and never charges', () => {
  assert.equal(authorizeMode({}), 'sandbox');
  assert.throws(() => authorizeMode({ AUTHORIZENET_MODE: 'live' }), (err: unknown) => {
    return err instanceof CrmError && err.code === 'live_disabled';
  });
  assert.throws(() => authorizeMode({ AUTHORIZENET_MODE: 'live', AUTHORIZENET_LIVE: '1' }), (err: unknown) => {
    return err instanceof CrmError && err.code === 'live_network_disabled';
  });
  const body = buildChargeProfileRequest({
    apiLoginId: 'sandbox-login',
    customerProfileId: '900000001',
    paymentProfileId: '800000001',
    amountCents: 22400,
    invoiceNumber: 'inv_demo',
  });
  assert.equal(body.createTransactionRequest.transactionRequest.profile.customerProfileId, '900000001');
  assert.equal(body.createTransactionRequest.transactionRequest.amount, '224.00');
  assert.equal(JSON.stringify(body).includes('4111'), false);
  assert.throws(() => submitCharge(), (err: unknown) => err instanceof CrmError && err.code === 'charges_disabled');
  const profile = getCustomerProfile({}, [{
    customerProfileId: '900000001',
    merchantCustomerId: '10000001',
    paymentProfiles: [{ customerPaymentProfileId: '800000001', brand: 'Visa', last4: '1111' }],
  }], '900000001');
  assert.equal(profile.merchantCustomerId, '10000001');
  assert.equal(profile.paymentProfiles[0].last4, '1111');
});

test('the dashboard CRM tab stays behind crmPreview=1', async () => {
  const html = await readFile(join(root, '..', 'index.html'), 'utf8');
  assert.match(html, /show: crmPreviewOn\(\)/);
  assert.match(html, /s === 'crm'\) return crmPreviewOn\(\)/);
  assert.match(html, /if \(crmPreviewOn\(\) && dashLocalHost\(\)\)/);
});

test('task and schedule adapters keep the Firebase shape and do not invent hours', async () => {
  const tasks = JSON.parse(await readFile(join(root, 'fixtures/firebase-tasks.json'), 'utf8'));
  const done = completionsFromFirebase(tasks);
  assert.equal(done.length, 3);
  assert.equal(done.find(r => r.taskId === 'ph_bathroom')?.firebasePath,
    'ceo/tasks/emp/ash/daily/2026-11-16/ph_bathroom');
  assert.equal(taskDueOnDate({ id: 'spray_mats', days: [1, 2, 3, 4, 5, 6] }, '2026-11-21'), false);
  assert.equal(taskDueOnDate({ id: 'ph_bathroom', days: [1] }, '2026-11-16'), true);
  const sched = JSON.parse(await readFile(join(root, 'fixtures/firebase-schedule.json'), 'utf8'));
  const shifts = shiftsFromFirebase(sched);
  assert.equal(scheduledMinutes(shifts), 7 * 60);
  assert.equal(shiftOnApprovedTimeOff('2026-11-20', [{
    startOn: '2026-11-20', endOn: '2026-11-20', status: 'approved',
  }]), true);
  assert.equal(shiftOnApprovedTimeOff('2026-11-16', [{
    startOn: '2026-11-20', endOn: '2026-11-20', status: 'approved',
  }]), false);
});
