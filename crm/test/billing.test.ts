import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  billingAnchor, cadenceForPlan, draftDates, familyDiscountPreview,
  guardedPriceChange, merchantAccountFor, monthsWithTwoDrafts, prepaidPaymentCount,
} from '../src/billing.ts';
import { videosByCycleTheme } from '../src/curriculum.ts';
import { payHours, punchesFromFirebase, shiftsFromFirebase } from '../src/schedule.ts';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('mini-tigers and grandfathered plans are monthly; everything else is every 4 weeks', () => {
  assert.equal(cadenceForPlan({ name: 'Mini-Tigers' }), 'monthly');
  assert.equal(cadenceForPlan({ name: 'Grandfathered Monthly', grandfathered: true }), 'monthly');
  assert.equal(cadenceForPlan({ name: 'Grandfathered Monthly LEGACY', grandfathered: true }), 'monthly');
  assert.equal(cadenceForPlan({ name: 'Standard' }), 'every_4_weeks');
  assert.equal(cadenceForPlan({ name: 'Athlete Development' }), 'every_4_weeks');
  assert.equal(cadenceForPlan({ name: 'Tiger Leaders' }), 'every_4_weeks');
  assert.equal(cadenceForPlan({ name: 'Fitboxing 1X/week' }), 'every_4_weeks');
  assert.equal(prepaidPaymentCount('every_4_weeks'), 13);
  assert.equal(prepaidPaymentCount('monthly'), 12);
});

test('the anchor defaults to the start date and can be overridden', () => {
  assert.equal(billingAnchor('2026-03-11', null), '2026-03-11');
  assert.equal(billingAnchor('2026-03-11', '2026-04-01'), '2026-04-01');
});

test('a 4-week plan can draft twice in one calendar month', () => {
  const dates = draftDates({
    anchor: '2026-01-01',
    cadence: 'every_4_weeks',
    from: '2026-01-01',
    through: '2026-12-31',
  });
  assert.ok(dates.length >= 13);
  assert.ok(monthsWithTwoDrafts(dates).includes('2026-01'));
  const monthly = draftDates({
    anchor: '2026-03-11',
    cadence: 'monthly',
    from: '2026-03-11',
    through: '2027-02-11',
  });
  assert.deepEqual(monthly.slice(0, 3), ['2026-03-11', '2026-04-11', '2026-05-11']);
  assert.equal(monthsWithTwoDrafts(monthly).length, 0);
});

test('DeForest and both Go Ninja schools share a LVLUP merchant', () => {
  assert.equal(merchantAccountFor('deforest').merchantLocationId, 'waunakee');
  assert.equal(merchantAccountFor('goninjaW').merchantLocationId, 'waunakee');
  assert.equal(merchantAccountFor('goninjaV').merchantLocationId, 'verona');
  assert.equal(merchantAccountFor('verona').shared, false);
  assert.equal(merchantAccountFor('goninjaV').shared, true);
});

test('the third paying family member is discounted, and a hold drops them out', () => {
  const base = { status: 'active' as const, currentAmountCents: 10000 };
  const three = familyDiscountPreview([
    { ...base, id: 'a', locationId: 'waunakee', startedOn: '2024-01-01' },
    { ...base, id: 'b', locationId: 'waunakee', startedOn: '2024-06-01' },
    { ...base, id: 'c', locationId: 'waunakee', startedOn: '2025-01-01' },
  ]);
  assert.equal(three[2].proposedAmountCents, 7000);
  assert.equal(three[2].currentAmountCents, 10000);
  assert.equal(three[0].percentOff, 0);
  const verona = familyDiscountPreview([
    { ...base, id: 'a', locationId: 'verona', startedOn: '2024-01-01' },
    { ...base, id: 'b', locationId: 'verona', startedOn: '2024-02-01' },
    { ...base, id: 'c', locationId: 'eastmad', startedOn: '2024-03-01' },
  ]);
  assert.equal(verona[2].proposedAmountCents, 5000);
  const afterHold = familyDiscountPreview([
    { ...base, id: 'a', locationId: 'waunakee', startedOn: '2024-01-01' },
    { ...base, id: 'b', locationId: 'waunakee', startedOn: '2024-06-01', status: 'hold' },
    { ...base, id: 'c', locationId: 'waunakee', startedOn: '2025-01-01' },
    { ...base, id: 'd', locationId: 'waunakee', startedOn: '2025-06-01' },
  ]);
  assert.equal(afterHold.find(r => r.id === 'c')?.percentOff, 0);
  assert.equal(afterHold.find(r => r.id === 'd')?.proposedAmountCents, 7000);
});

test('a price does not change without a snapshot of the upcoming charges', () => {
  assert.throws(() => guardedPriceChange({
    currentAmountCents: 10000,
    proposedAmountCents: 7000,
    snapshot: null,
  }), /Snapshot upcoming charges/);
  const applied = guardedPriceChange({
    currentAmountCents: 10000,
    proposedAmountCents: 7000,
    snapshot: { at: '2026-11-21T12:00:00Z', rows: [{ memberId: 'c', cents: 10000 }] },
  });
  assert.equal(applied.previousCents, 10000);
  assert.equal(applied.amountCents, 7000);
});

test('pay hours come from punches, and the schedule is only a comparison', async () => {
  const raw = JSON.parse(await readFile(join(root, 'fixtures/firebase-schedule.json'), 'utf8'));
  const punches = punchesFromFirebase(raw);
  const shifts = shiftsFromFirebase(raw);
  const hours = payHours(punches, shifts);
  assert.equal(hours.source, 'punches');
  assert.equal(hours.payMinutes, 240);
  assert.equal(hours.scheduledMinutes, 420);
  assert.notEqual(hours.payMinutes, hours.scheduledMinutes);
});

test('curriculum videos group by cycle theme', () => {
  const grouped = videosByCycleTheme([
    { title: 'Form', vimeoId: 'fixture-a', cycleTheme: 'Honesty' },
    { title: 'One-step', vimeoId: 'fixture-b', cycleTheme: 'Honesty' },
    { title: 'Board break', vimeoId: 'fixture-c', cycleTheme: 'Self-Esteem' },
  ]);
  assert.equal(grouped.Honesty.length, 2);
  assert.equal(grouped['Self-Esteem'].length, 1);
});
