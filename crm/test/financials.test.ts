import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import {
  CHARGES, FAILURE_ALLOWANCE_RATE, MEMBERSHIPS, MOVEMENTS, PAST_DUE,
  cardExpiresBefore, countsAsCollected, financialReport, financialsSummary,
  holdCovers, membershipDrafts, monthlyEquivalentCents, netBilling, schoolsInScope,
  scopeAllowed, stillExpectedDrafts, toCsv,
} from '../src/financials.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const htmlPath = join(root, '..', 'index.html');

test('monthly equivalent normalizes 4-week, monthly, and prepaid plans', () => {
  assert.equal(monthlyEquivalentCents(22400, 'every_4_weeks'), 24267);
  assert.equal(monthlyEquivalentCents(7500, 'every_4_weeks'), 8125);
  assert.equal(monthlyEquivalentCents(4500, 'every_4_weeks'), 4875);
  assert.equal(monthlyEquivalentCents(11900, 'monthly'), 11900);
  assert.equal(monthlyEquivalentCents(291200, 'prepaid_term', 12), 24267);
  const hayden = MEMBERSHIPS.find(member => member.id === 'hayden');
  assert.ok(hayden);
  assert.equal(hayden.discountPct, 30);
  assert.equal(hayden.amountCents, 15680);
  assert.equal(monthlyEquivalentCents(hayden.amountCents, hayden.cadence), 16987);
  assert.notEqual(monthlyEquivalentCents(hayden.listCents, hayden.cadence), 16987);
});

test('a 4-week plan can draft twice in November, and a hold skips the covered date', () => {
  const quinn = MEMBERSHIPS.find(member => member.id === 'quinn');
  const emerson = MEMBERSHIPS.find(member => member.id === 'emerson');
  assert.ok(quinn && emerson);
  assert.deepEqual(membershipDrafts(quinn, '2026-11-01', '2026-11-30').map(row => row.on), ['2026-11-02', '2026-11-30']);
  assert.equal(holdCovers(emerson, '2026-11-18'), true);
  assert.equal(membershipDrafts(emerson, '2026-11-01', '2026-11-30').length, 0);
  assert.deepEqual(membershipDrafts(emerson, '2026-12-01', '2026-12-31').map(row => row.on), ['2026-12-16']);
});

test('net billing is gain minus loss and holds stay out of both', () => {
  const net = netBilling(MOVEMENTS);
  assert.equal(net.gainCents, 129947);
  assert.equal(net.lossCents, 29142);
  assert.equal(net.netCents, 100805);
  assert.equal(net.holdCents, 24267);
  assert.equal(net.netCents, net.gainCents - net.lossCents);
});

test('the open month reconciles collected, expected, past due, and projected', () => {
  const summary = financialsSummary({ scope: 'all', period: 'month', compare: 'prev_month' });
  assert.equal(summary.fixture, true);
  assert.equal(summary.live, false);
  assert.equal(summary.tiles.collected.cents, 279130);
  assert.equal(summary.tiles.collected.todayCents, 3500);
  assert.equal(summary.tiles.collected.goalPct, 72.3);
  assert.equal(summary.tiles.collected.tone, 'warn');
  const named = CHARGES.filter(charge => charge.on.startsWith('2026-11') && countsAsCollected(charge));
  assert.equal(named.reduce((total, charge) => total + charge.amountCents, 0), 279130);
  const tax = named.reduce((total, charge) => total + charge.taxCents, 0);
  assert.equal(tax, 138);
  assert.equal(summary.tiles.collected.cents + tax !== summary.tiles.collected.cents, true);

  assert.equal(summary.tiles.stillExpected.cents, 70700);
  assert.deepEqual(summary.tiles.stillExpected.rows.map(row => row.on), ['2026-11-26', '2026-11-28', '2026-11-29', '2026-11-30']);
  assert.equal(summary.tiles.stillExpected.rows.some(row => row.name === 'Quinn Sample' && row.on === '2026-11-30'), true);
  assert.equal(summary.tiles.stillExpected.rows.some(row => row.name === 'Emerson Sample'), false);
  assert.equal(summary.tiles.stillExpected.cents === summary.tiles.pastDue.membershipCents, false);

  assert.equal(summary.tiles.pastDue.membershipCents, 36800);
  assert.equal(summary.tiles.pastDue.otherCents, 6500);
  assert.equal(summary.tiles.pastDue.cents, 43300);
  assert.equal(summary.tiles.pastDue.families, 4);
  assert.equal(summary.tiles.pastDue.retryScheduled, 2);
  assert.equal(summary.tiles.pastDue.cardExpiring, 2);
  assert.equal(summary.tiles.pastDue.oldestDays, 22);
  assert.equal(summary.tiles.projected.allowanceCents, Math.round(70700 * FAILURE_ALLOWANCE_RATE));
  assert.equal(summary.tiles.projected.cents, 279130 + 70700 - summary.tiles.projected.allowanceCents);
  assert.equal(summary.tiles.netBilling.netCents, 100805);

  assert.equal(summary.tiles.paying.count, 18);
  assert.equal(summary.tiles.mrr.cents, 341711);
  assert.equal(summary.tiles.arm.cents, 18984);
  assert.equal(summary.tiles.stay.months, 24.9);
  assert.equal(summary.tiles.stay.cohort, 19);
  assert.equal(summary.movement.attritionPct, 5.3);
  assert.equal(summary.movement.attritionOnTrack, false);
  assert.equal(summary.schools.reduce((total, row) => total + row.collectedCents, 0), 279130);
  assert.equal(summary.schools.reduce((total, row) => total + row.pastDueCents, 0), 43300);
  assert.equal(summary.merchants.reduce((total, row) => total + row.collectedCents, 0), 279130);
  const waunakeeAccount = summary.merchants.find(row => row.id === 'waunakee');
  assert.deepEqual(waunakeeAccount?.schools, ['Waunakee', 'DeForest', 'Go Ninja Waunakee']);
  assert.equal(waunakeeAccount?.collectedCents, 104780 + 24400 + 33900);

  const november = summary.series.mrrTrend.find(row => row.key === '2026-11');
  assert.equal(november?.collectedCents, 279130);
  assert.equal(november?.mrrCents, 341711);
  assert.equal(summary.series.mrrTrend.length, 12);
  assert.equal(cardExpiresBefore('2026-11', '2026-12-02'), true);
  assert.equal(cardExpiresBefore('2027-08', '2026-12-01'), false);
});

test('scope, period, and compare stay inside the fixture', () => {
  const goninja = financialsSummary({ scope: 'goninja' });
  assert.equal(goninja.brand, 'goninja');
  assert.equal(goninja.tiles.collected.cents, 42800);
  assert.equal(goninja.alerts.some(alert => alert.id === 'sync_eastmad'), false);
  const lvlup = financialsSummary({ scope: 'lvlup' });
  assert.equal(lvlup.tiles.collected.cents, 236330);
  assert.equal(lvlup.alerts.some(alert => alert.id === 'sync_eastmad'), true);
  const one = financialsSummary({ scope: 'verona' });
  assert.equal(one.schools.length, 1);
  assert.equal(one.tiles.pastDue.cents, 0);
  assert.throws(() => schoolsInScope('eastmadison'), /Unknown scope/);

  const last = financialsSummary({ scope: 'all', period: 'last' });
  assert.equal(last.period.label, 'October 2026');
  assert.notEqual(last.tiles.collected.cents, 279130);
  assert.equal(last.tiles.stillExpected.cents, 0);
  const ytd = financialsSummary({ scope: 'all', period: 'ytd' });
  const months = ytd.series.yoy.reduce((total, row) => total + row.thisYearCents, 0);
  assert.equal(ytd.tiles.collected.cents, months);
  const custom = financialsSummary({ scope: 'all', period: 'custom', from: '2026-11-01', through: '2026-11-10' });
  assert.ok(custom.tiles.collected.cents < 279130);
  assert.ok(custom.tiles.collected.cents > 0);

  const month = financialsSummary({ scope: 'all', compare: 'prev_month' });
  assert.equal(month.compareLabel, 'October 2026');
  assert.equal(typeof month.deltas.collectedCents, 'number');
  const year = financialsSummary({ scope: 'waunakee', compare: 'prev_year' });
  assert.equal(year.compareLabel, 'November 2025');
});

test('reports total the rows they show and csv escapes commas', () => {
  const forecast = financialReport('forecast', { scope: 'all', from: '2026-11-24', through: '2026-11-30' });
  assert.equal(forecast.columns[0], 'Date');
  assert.equal(forecast.rows.some(row => row[1] === 'Quinn Sample' && row[0] === '2026-11-30'), true);
  assert.equal(forecast.totalCents, 70700);
  const tax = financialReport('sales-tax', { scope: 'all', period: 'month' });
  assert.equal(tax.totalCents, 138);
  const refunds = financialReport('refunds', { scope: 'all', period: 'month' });
  assert.equal(refunds.totalCents, -2000);
  const ach = financialReport('ach', { scope: 'all' });
  assert.match(ach.rows[0][1], /No ACH/);
  const past = financialReport('past-due', { scope: 'deforest' });
  assert.equal(past.rows.length, 1);
  assert.equal(past.rows[0][0], 'Quinn Sample');
  assert.equal(past.rows[0][5], 'Insufficient funds');
  assert.throws(() => financialReport('nope'), /Unknown report/);
  const csv = toCsv(['Name', 'Note'], [['Quinn Sample', 'a "quoted", note']]);
  assert.equal(csv, 'Name,Note\nQuinn Sample,"a ""quoted"", note"\n');
  assert.equal(PAST_DUE.every(row => !/^\+?\d{10,}/.test(row.last4)), true);
});

test('all-schools rollup is admin only and a school lead stays on their school', () => {
  assert.equal(scopeAllowed({ role: 'admin' }, 'all'), true);
  assert.equal(scopeAllowed({ role: 'staff', locationIds: ['waunakee'] }, 'all'), false);
  assert.equal(scopeAllowed({ role: 'staff', locationIds: ['waunakee'] }, 'lvlup'), false);
  assert.equal(scopeAllowed({ role: 'staff', locationIds: ['waunakee'] }, 'waunakee'), true);
  assert.equal(scopeAllowed({ role: 'staff', locationIds: ['waunakee'] }, 'verona'), false);
});

test('the preview keeps Financials behind finance access and the CRM query flag', async () => {
  const html = await readFile(htmlPath, 'utf8');
  assert.match(html, /function crmCanFinance\(\)/);
  assert.match(html, /crmOpenFinancials/);
  assert.match(html, /Open Financials/);
  assert.match(html, /FINANCIALS_BUNDLE_START/);
  assert.match(html, /FINANCIALS_BUNDLE_END/);
  assert.match(html, /show: crmPreviewOn\(\)/);
  const bundle = html.split('FINANCIALS_BUNDLE_START')[1].split('FINANCIALS_BUNDLE_END')[0];
  const context: { LVLUPFin?: { financialsSummary: typeof financialsSummary } } = {};
  vm.runInNewContext(bundle, context);
  assert.ok(context.LVLUPFin);
  const fromBundle = context.LVLUPFin.financialsSummary({ scope: 'all', period: 'month' });
  const fromModule = financialsSummary({ scope: 'all', period: 'month' });
  assert.equal(fromBundle.tiles.collected.cents, fromModule.tiles.collected.cents);
  assert.equal(fromBundle.tiles.mrr.cents, fromModule.tiles.mrr.cents);
  assert.equal(fromBundle.tiles.netBilling.netCents, fromModule.tiles.netBilling.netCents);
  assert.equal(fromBundle.tiles.stillExpected.cents, fromModule.tiles.stillExpected.cents);
});
