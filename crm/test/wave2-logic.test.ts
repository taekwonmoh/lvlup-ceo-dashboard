import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scheduleRange } from '../src/class-calendar.ts';
import {
  attendanceCountsFor,
  classCountForProgram,
  programsCredited,
  sessionSeatCapacity,
} from '../src/eligibility.ts';
import { noShowDue, remainingCredits, rollSessionCredits } from '../src/schedule-booking.ts';
import {
  billingStart,
  cardExpiryState,
  equalShares,
  groupByIncomeCategory,
  processingFeeCents,
  resolveShares,
  upcomingPayments,
} from '../src/billing-wave2.ts';
import { buildNewMemberStaffAlert, unknownMergeTags } from '../src/templates.ts';
import { guardedPriceChange } from '../src/billing.ts';

test('one attendance counts for every program and capacity stays on the session', () => {
  const programs = programsCredited(['taekwondo', 'taekwondo', 'leadership', '']);
  assert.deepEqual(programs, ['taekwondo', 'leadership']);
  assert.equal(attendanceCountsFor(programs, 'leadership'), true);
  assert.equal(attendanceCountsFor(programs, 'goninja'), false);
  const rows = [{ programs }, { programs: ['taekwondo'] }];
  assert.equal(classCountForProgram(rows, 'taekwondo'), 2);
  assert.equal(classCountForProgram(rows, 'leadership'), 1);
  assert.equal(sessionSeatCapacity(12), 12);
});

test('schedule windows are stable', () => {
  assert.deepEqual(scheduleRange('day', '2026-11-27'), { from: '2026-11-27', to: '2026-11-27' });
  assert.deepEqual(scheduleRange('week', '2026-11-27'), { from: '2026-11-23', to: '2026-11-29' });
  assert.deepEqual(scheduleRange('month', '2026-11-27'), { from: '2026-11-01', to: '2026-11-30' });
  assert.deepEqual(scheduleRange('list', '2026-11-27'), { from: '2026-11-27', to: '2026-12-24' });
});

test('no-show release stays off when grace is unset', () => {
  const start = new Date('2026-11-27T15:00:00Z');
  const later = new Date('2026-11-27T15:20:00Z');
  assert.equal(noShowDue(start, null, later), false);
  assert.equal(noShowDue(start, 15, new Date('2026-11-27T15:14:00Z')), false);
  assert.equal(noShowDue(start, 15, later), true);
});

test('session credits roll up to the cap and stay separate from a null cap', () => {
  assert.equal(remainingCredits({ granted: 8, used: 3, rolledIn: 2, expired: 1 }), 6);
  assert.deepEqual(rollSessionCredits({ unused: 5, rolloverCap: 2 }), { rolledIn: 2, expired: 3 });
  assert.deepEqual(rollSessionCredits({ unused: 5, rolloverCap: null }), { rolledIn: 5, expired: 0 });
});

test('first check-in moves the shadow anchor and upcoming edits can be skipped', () => {
  assert.deepEqual(billingStart({
    startedOn: '2026-11-01',
    anchorOn: '2026-11-01',
    enabled: true,
    firstCheckinOn: null,
  }), { anchor: '2026-11-01', waiting: true });
  assert.deepEqual(billingStart({
    startedOn: '2026-11-01',
    anchorOn: '2026-11-01',
    enabled: true,
    firstCheckinOn: '2026-11-20',
  }), { anchor: '2026-11-20', waiting: false });
  const base = {
    anchor: '2026-11-02',
    cadence: 'every_4_weeks' as const,
    asOf: '2026-11-02',
    count: 2,
    amountCents: 6000,
    overrides: [],
  };
  assert.deepEqual(upcomingPayments(base).map(row => row.dueOn), ['2026-11-02', '2026-11-30']);
  const skipped = upcomingPayments({
    ...base,
    overrides: [{ dueOn: '2026-11-02', newAmountCents: null, newDueOn: null, skip: true, undoneAt: null, id: 'ov' }],
  });
  assert.equal(skipped[0].skip, true);
  assert.equal(skipped[0].amountCents, 0);
  const undone = upcomingPayments({
    ...base,
    overrides: [{ dueOn: '2026-11-02', newAmountCents: 100, newDueOn: null, skip: false, undoneAt: '2026-11-03T00:00:00Z', id: 'ov' }],
  });
  assert.equal(undone[0].amountCents, 6000);
  assert.equal(upcomingPayments({ ...base, waiting: true }).length, 0);
});

test('processing fees stay at zero until pass-through is on', () => {
  const fees = { amountCents: 10000, method: 'card' as const, cardFeeBps: 250, cardFeeFixedCents: 30, achFeeCents: 75, passThrough: false };
  assert.equal(processingFeeCents(fees), 0);
  assert.equal(processingFeeCents({ ...fees, passThrough: true }), 280);
  assert.equal(processingFeeCents({ ...fees, passThrough: true, method: 'ach' }), 75);
});

test('card filters compare expiry with asOf', () => {
  assert.equal(cardExpiryState(10, 2026, '2026-11-15'), 'expired');
  assert.equal(cardExpiryState(11, 2026, '2026-11-15'), 'soon');
  assert.equal(cardExpiryState(2, 2027, '2026-11-15'), 'ok');
  assert.equal(cardExpiryState(null, null, '2026-11-15'), 'unknown');
});

test('sold-by shares split evenly and income lines group by category', () => {
  assert.deepEqual(equalShares(3), [3334, 3333, 3333]);
  assert.equal(equalShares(3).reduce((sum, n) => sum + n, 0), 10000);
  assert.deepEqual(resolveShares([{ shareBps: 5000 }, {}]), [5000, 5000]);
  const groups = groupByIncomeCategory([
    { categoryName: 'Tuition', accountCode: 'TUITION', amountCents: 1000 },
    { categoryName: 'Tuition', accountCode: 'TUITION', amountCents: 500 },
    { categoryName: 'Events', accountCode: 'EVENTS', amountCents: 200 },
  ]);
  assert.equal(groups[1].amountCents, 1500);
  assert.equal(groups[0].categoryName, 'Events');
});

test('templates reject unknown merge tags and the staff alert is not sent', () => {
  assert.deepEqual(unknownMergeTags('Hello {{first_name}}'), []);
  assert.deepEqual(unknownMergeTags('Hello {{rank}}'), ['rank']);
  const alert = buildNewMemberStaffAlert({
    memberName: 'Riley Sample',
    program: 'taekwondo',
    plan: '4-week',
    firstBillOn: '2026-12-01',
    last4: '0000',
    source: 'staff',
    soldBy: 'Alex Sample',
    schoolName: 'Waunakee',
  });
  assert.equal(alert.status, 'not_sent');
  assert.match(alert.body, /4-week/);
  assert.match(alert.body, /0000/);
  assert.match(alert.body, /Alex Sample/);
  assert.equal(alert.body.includes('tel:'), false);
  assert.throws(() => guardedPriceChange({ currentAmountCents: 100, proposedAmountCents: 100, snapshot: null }));
});
