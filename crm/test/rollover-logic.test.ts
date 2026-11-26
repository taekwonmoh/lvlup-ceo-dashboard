import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyMember } from '../src/shadow-billing.ts';
import {
  addDays,
  applyTuitionCredits,
  firstRolloverOn,
  isRolloverDraftDate,
  normalizeRolloverCadence,
  tuitionInvoiceLines,
} from '../src/rollover.ts';

const base = {
  memberId: 'fixture-member',
  locationId: 'waunakee',
  status: 'active' as const,
  biller: 'lvlup' as const,
  nextBillOn: '2027-03-01',
  paidThroughOn: '2027-04-01',
  amountCents: 8000,
  discountBps: 0,
  prepaid: true,
  hold: null,
};

test('rollover cadence accepts weekly, monthly, and 4-week aliases', () => {
  assert.equal(normalizeRolloverCadence('weekly'), 'weekly');
  assert.equal(normalizeRolloverCadence('monthly'), 'monthly');
  assert.equal(normalizeRolloverCadence('every_4_weeks'), 'every_4_weeks');
  assert.equal(normalizeRolloverCadence('4_weeks'), 'every_4_weeks');
  assert.equal(normalizeRolloverCadence('4-weeks'), 'every_4_weeks');
  assert.equal(normalizeRolloverCadence('yearly'), null);
});

test('a prepaid window never drafts, and rollover starts on the paid-through date', () => {
  assert.equal(classifyMember(base, '2027-03-15').reason, 'skipped_prepaid');
  assert.equal(classifyMember({
    ...base,
    rolloverEnabled: true,
    rolloverCadence: 'monthly',
    rolloverAmountCents: 6400,
  }, '2027-03-31').reason, 'skipped_prepaid');

  const first = firstRolloverOn({ paidThroughOn: '2027-04-01', cadence: 'monthly' });
  assert.equal(first, '2027-04-01');
  const due = classifyMember({
    ...base,
    rolloverEnabled: true,
    rolloverCadence: 'monthly',
    rolloverAmountCents: 6400,
  }, '2027-04-01');
  assert.equal(due.action, 'charge');
  assert.equal(due.amountCents, 6400);
  assert.equal(due.chargeAmountCents, 6400);
  assert.equal(classifyMember({
    ...base,
    rolloverEnabled: true,
    rolloverCadence: 'monthly',
    rolloverAmountCents: 6400,
  }, '2027-04-02').reason, 'skipped_not_due');
  assert.equal(isRolloverDraftDate({ on: '2027-05-01', paidThroughOn: '2027-04-01', cadence: 'monthly' }), true);
});

test('weekly and 4-week rollover keep their step after the anchor weekday', () => {
  const weekly = firstRolloverOn({ paidThroughOn: '2027-04-01', cadence: 'weekly', anchorDay: 1 });
  assert.equal(isRolloverDraftDate({ on: weekly, paidThroughOn: '2027-04-01', cadence: 'weekly', anchorDay: 1 }), true);
  assert.equal(isRolloverDraftDate({ on: addDays(weekly, 7), paidThroughOn: '2027-04-01', cadence: 'weekly', anchorDay: 1 }), true);
  assert.equal(isRolloverDraftDate({ on: addDays(weekly, 3), paidThroughOn: '2027-04-01', cadence: 'weekly', anchorDay: 1 }), false);
  const fourth = firstRolloverOn({ paidThroughOn: '2027-04-01', cadence: 'every_4_weeks' });
  assert.equal(fourth, '2027-04-01');
  assert.equal(isRolloverDraftDate({ on: '2027-04-29', paidThroughOn: '2027-04-01', cadence: 'every_4_weeks' }), true);
  assert.equal(isRolloverDraftDate({ on: '2027-04-15', paidThroughOn: '2027-04-01', cadence: 'every_4_weeks' }), false);
  const anchored = firstRolloverOn({ paidThroughOn: '2027-04-10', cadence: 'monthly', anchorDay: 31 });
  assert.equal(anchored, '2027-04-30');
  assert.equal(isRolloverDraftDate({ on: '2027-02-28', paidThroughOn: '2027-02-10', cadence: 'monthly', anchorDay: 31 }), true);
});

test('credits apply soonest-expiration first and never below zero', () => {
  const applied = applyTuitionCredits(6000, '2027-04-15', [
    { id: 'later', remainingCents: 10000, expiresOn: null, createdAt: '2027-01-01T00:00:00.000Z' },
    { id: 'expired', remainingCents: 5000, expiresOn: '2027-04-01', createdAt: '2027-01-01T00:00:00.000Z' },
    { id: 'soon', remainingCents: 1500, expiresOn: '2027-04-20', createdAt: '2027-03-01T00:00:00.000Z' },
    { id: 'sooner-older', remainingCents: 500, expiresOn: '2027-04-20', createdAt: '2027-02-01T00:00:00.000Z' },
  ]);
  assert.deepEqual(applied.applications.map(row => row.id), ['sooner-older', 'soon', 'later']);
  assert.equal(applied.creditAppliedCents, 6000);
  assert.equal(applied.chargeAmountCents, 0);
  assert.equal(applied.applications[2].appliedCents, 4000);
  const lines = tuitionInvoiceLines('Rollover tuition', applied);
  assert.equal(lines[0].creditAppliedCents, 6000);
  assert.equal(lines[0].chargeAmountCents, 0);
  assert.equal(lines[1].amountCents, -6000);
  assert.equal(lines[1].chargeAmountCents, 0);
  const open = applyTuitionCredits(1000, '2027-04-15', [
    { id: 'expired', remainingCents: 5000, expiresOn: '2027-04-01', createdAt: '2027-01-01T00:00:00.000Z' },
  ]);
  assert.equal(open.chargeAmountCents, 1000);
  assert.equal(open.creditAppliedCents, 0);
});

test('a cancelled rollover does not draft after the prepaid window', () => {
  const line = classifyMember({
    ...base,
    rolloverEnabled: true,
    rolloverCancelled: true,
    rolloverCadence: '4_weeks',
    rolloverAmountCents: 6400,
  }, '2027-04-29');
  assert.equal(line.action, 'skip');
  assert.equal(line.reason, 'skipped_rollover_cancelled');
  assert.equal(classifyMember({
    ...base,
    rolloverEnabled: true,
    rolloverCancelled: true,
    rolloverCadence: 'monthly',
    rolloverAmountCents: 6400,
  }, '2027-03-01').reason, 'skipped_prepaid');
});
