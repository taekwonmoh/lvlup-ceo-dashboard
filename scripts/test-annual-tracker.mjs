/**
 * Annual Tracker earned-revenue checks.
 * Loads the real functions from index.html (no network) and, when the
 * Nov 6 2026 Firebase dumps are on disk, checks those figures too.
 *
 *   node scripts/test-annual-tracker.mjs
 */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPlannerBaseline } from './push_gymdesk_data.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const start = html.indexOf('<script>\n/*  -  -  Core Values');
const end = html.lastIndexOf('</script>');
if (start < 0 || end < start) {
  console.error('Could not find the dashboard script in index.html');
  process.exit(1);
}
const source = html.slice(start + '<script>\n'.length, end);

function makeRef() {
  const r = {
    on() { return r; },
    off() { return r; },
    once() { return r; },
    set() { return Promise.resolve(); },
    update() { return Promise.resolve(); },
    orderByChild() { return r; },
    orderByKey() { return r; },
    limitToLast() { return r; },
    limitToFirst() { return r; },
    equalTo() { return r; },
    child() { return makeRef(); },
  };
  return r;
}
function authFn() {
  return {
    onAuthStateChanged() {},
    signOut() { return Promise.resolve(); },
    signInWithPopup() { return Promise.resolve(); },
  };
}
authFn.GoogleAuthProvider = function GoogleAuthProvider() {
  this.setCustomParameters = function () {};
};
const documentStub = {
  getElementById() { return { innerHTML: '', className: '', textContent: '', style: {}, _chart: null }; },
  createElement() { return { textContent: '', innerHTML: '', style: {}, appendChild() {}, setAttribute() {}, getContext() { return {}; } }; },
  addEventListener() {},
  documentElement: { style: {} },
  body: { appendChild() {} },
};
const sandbox = {
  console,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  Promise,
  Date,
  Math,
  Number,
  String,
  Boolean,
  Object,
  Array,
  JSON,
  parseFloat,
  parseInt,
  isNaN,
  isFinite,
  encodeURIComponent,
  decodeURIComponent,
  RegExp,
  Error,
  Map,
  Set,
  WeakMap,
  Symbol,
  Intl,
  URL,
  fetch() { return new Promise(() => {}); },
  document: documentStub,
  navigator: { userAgent: 'annual-tracker-test' },
  location: { hash: '' },
  localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
  sessionStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
  firebase: {
    initializeApp() {},
    database() { return { ref: makeRef }; },
    storage() { return {}; },
    auth: authFn,
  },
  Chart: function Chart() { this.destroy = function () {}; },
  Sortable: { create() {} },
  L: { map() { return { setView() { return this; }, remove() {} }; } },
  addEventListener() {},
  removeEventListener() {},
};
sandbox.window = sandbox;
sandbox.self = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
try {
  vm.runInContext(source, sandbox, { filename: 'index.html' });
} catch (e) {
  console.error('Dashboard script failed to load:\n' + (e && e.stack || e));
  process.exit(1);
}

function grab(name) {
  const value = vm.runInContext(name, sandbox);
  if (value == null) throw new Error('Dashboard did not define ' + name);
  return value;
}
const state = grab('state');
const dashAuth = grab('dashAuth');
const goalTrackerModel = grab('goalTrackerModel');
const renderGoalsPage = grab('renderGoalsPage');
const planBilling = grab('planBilling');
const renderFinancialsPage = grab('renderFinancialsPage');

let failed = 0;
let passed = 0;
function check(cond, msg) {
  if (cond) { passed++; return; }
  failed++;
  console.error('FAIL: ' + msg);
}
function near(a, b, eps) {
  return Math.abs(Number(a) - Number(b)) <= (eps == null ? 0.02 : eps);
}

const NOW = new Date(2026, 10, 6, 12, 0, 0); // Friday Nov 6, 2026, local noon
const MONTHS = ['january','february','march','april','may','june','july','august','september','october','november','december'];
const LOCS = ['waunakee','eastmad','verona','deforest','goninjaW','goninjaV'];
const GD_KEY = {
  waunakee: 'waunakee', eastmad: 'east_madison', verona: 'verona',
  deforest: 'deforest', goninjaW: 'go_ninja_waunakee', goninjaV: 'go_ninja_verona'
};

function resetState() {
  state.goalAsOf = NOW;
  state.goalEditActuals = false;
  state.goalsTab = 'annual';
  state.goals = {};
  state.gymdesk = null;
  state.gymdeskErr = null;
  state.plannerBaseline = null;
  state.plannerBaselineErr = null;
  state.scorecardDaily = {};
  state.financials = {};
  state.kpis = {};
  state.kpisAll = {};
  state.goalsLoc = 'waunakee';
  state.goalsMonth = '2026-11';
  state.goalsData = {};
  dashAuth.canFinance = false;
  dashAuth.allowed = true;
  dashAuth.ready = true;
}

function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }

function rowEarned(row) {
  if (!row || typeof row !== 'object') return null;
  if (row.memberships == null && row.sales_pos == null && row.total == null) return null;
  if (row.is_partial === true) return round2(Number(row.memberships) + Number(row.sales_pos));
  if (row.total != null) return round2(Number(row.total));
  return round2(Number(row.memberships || 0) + Number(row.sales_pos || 0) + Number(row.pending || 0));
}

function finGross(loc, idx) {
  const row = ((state.financials[loc] || {})[MONTHS[idx]]) || {};
  const ty = parseFloat(row.grossTY);
  const alt = parseFloat(row.grossRevenue);
  if (Number.isFinite(ty) && ty > 0) return ty;
  if (Number.isFinite(alt) && alt > 0) return alt;
  return 0;
}

// Independent of goalTrackerModel: gymdesk earned when a row exists, else financials.
function oracleMonth(idx) {
  const mk = '2026-' + String(idx + 1).padStart(2, '0');
  let sum = 0;
  let any = false;
  LOCS.forEach(loc => {
    const locs = state.gymdesk && state.gymdesk.franchise_revenue_2026 && state.gymdesk.franchise_revenue_2026.locations;
    const row = locs && locs[GD_KEY[loc]] && locs[GD_KEY[loc]].months && locs[GD_KEY[loc]].months[mk];
    const earned = rowEarned(row);
    if (earned != null) { sum += earned; any = true; return; }
    const legacy = finGross(loc, idx);
    if (legacy > 0) { sum += legacy; any = true; }
  });
  return { sum: round2(sum), any };
}

function heroChunk(html) {
  const a = html.split('goal-hero-stats')[1] || '';
  return a.split('goal-grid')[0] || '';
}
function monthChunk(html, idx) {
  const marker = 'data-goal-month="' + idx + '"';
  const at = html.indexOf(marker);
  if (at < 0) return '';
  const next = html.indexOf('data-goal-month="', at + marker.length);
  return html.slice(at, next < 0 ? at + 800 : next);
}

function applyFinancials(table) {
  const out = {};
  Object.entries(table).forEach(([loc, months]) => {
    out[loc] = {};
    Object.entries(months).forEach(([m, row]) => {
      out[loc][m] = { grossTY: row.grossTY, grossRevenue: row.grossRevenue, goal: row.goal };
    });
  });
  state.financials = out;
}

function gymdeskFromMonthly(monthly, asOf) {
  const locations = {};
  Object.entries(monthly).forEach(([key, months]) => {
    if (!months || typeof months !== 'object') return;
    const node = { months: {} };
    Object.entries(months).forEach(([mk, row]) => {
      if (!/^\d{4}-\d{2}$/.test(mk) || !row || typeof row !== 'object') return;
      if (row.total == null && row.memberships == null) return;
      node.months[mk] = row;
    });
    if (Object.keys(node.months).length) locations[key] = node;
  });
  return { as_of: asOf || '2026-11-05T22:20:00-06:00', franchise_revenue_2026: { locations } };
}

function baselineFromGymdesk(g) {
  const locs = g.franchise_revenue_2026.locations;
  return buildPlannerBaseline({
    as_of: g.as_of,
    groups: { all_in: Object.keys(locs).filter(k => k !== 'all_locations') },
    franchise_revenue_2026: { locations: locs }
  });
}

function legacyBaseline(full) {
  const out = {};
  Object.entries(full).forEach(([loc, months]) => {
    out[loc] = {};
    Object.entries(months).forEach(([mk, row]) => {
      out[loc][mk] = { expected_billing: row.expected_billing, paying_members: row.paying_members, as_of: row.as_of };
    });
  });
  return out;
}

// --- Synthetic: partial month excludes pending, closed month keeps total, override wins ---
resetState();
state.financials = {
  waunakee: { september: { grossTY: 100, goal: 1000 }, november: { grossTY: 50, goal: 3000 }, october: { goal: 2000 } },
  eastmad: { september: { goal: 0 }, november: { goal: 0 }, october: { goal: 0 } },
};
state.gymdesk = gymdeskFromMonthly({
  waunakee: {
    '2026-09': { is_partial: false, memberships: 80, sales_pos: 15, pending: 5, total: 100, paying_members: 1 },
    '2026-10': { is_partial: false, memberships: 200, sales_pos: 20, pending: 0, total: 220, paying_members: 1 },
    '2026-11': { is_partial: true, memberships: 40, sales_pos: 5, pending: 70, total: 115, paying_members: 1 },
  }
});
{
  const model = goalTrackerModel(NOW);
  check(near(model.monthData[8].actual, 100), 'closed September uses total 100, not a stale path');
  check(near(model.monthData[9].actual, 220), 'closed October uses gymdesk total');
  check(near(model.monthData[10].actual, 45), 'November earned is memberships + sales (45), not total 115');
  check(model.curPaceKnown === true, 'November with collected revenue is this month');
  check(model.curPaceLabel.indexOf('This Month vs Goal to Date') === 0, 'in-progress label names goal to date: ' + model.curPaceLabel);
  check(near(model.proGoal, 3000 * 6 / 30), 'November goal prorated to day 6 of 30');
  check(near(model.curPace, 45 - 3000 * 6 / 30), 'this month pace is collected minus prorated goal');
  const html = renderGoalsPage();
  check(html.indexOf('Actual: $45.00') >= 0, 'November actual renders collected dollars');
  check(html.indexOf('$115.00') < 0, 'pending-inclusive total is not shown as earned');
  check(html.indexOf('nightly EOS') < 0, 'helper text no longer cites the retired EOS feed');
  check(html.indexOf('GymDesk sync') >= 0, 'helper text names the GymDesk sync');
}

// Override replaces the company total; the placeholder keeps the computed figure.
resetState();
state.financials = { waunakee: { september: { grossTY: 10, goal: 100 } } };
state.gymdesk = gymdeskFromMonthly({
  waunakee: { '2026-09': { is_partial: false, memberships: 80, sales_pos: 20, pending: 0, total: 100, paying_members: 1 } }
});
state.goals = { vacationOverride: { september: 250 } };
state.goalEditActuals = true;
{
  const model = goalTrackerModel(NOW);
  check(near(model.monthData[8].actual, 250), 'vacationOverride wins over GymDesk');
  check(near(model.monthData[8].autoActual, 100), 'auto figure stays the GymDesk total');
  check(model.monthData[8].overridden === true, 'month is marked adjusted');
  const html = renderGoalsPage();
  check(html.indexOf('placeholder="auto 100"') >= 0, 'adjust-actuals placeholder shows the computed total');
  check(html.indexOf('value="250"') >= 0, 'override value stays in the input');
}

// A real $0 collected month is this month, not last month's deficit.
resetState();
state.financials = {
  waunakee: { september: { grossTY: 500, goal: 1000 }, november: { goal: 3000 } },
};
state.gymdesk = gymdeskFromMonthly({
  waunakee: {
    '2026-09': { is_partial: false, memberships: 400, sales_pos: 100, pending: 0, total: 500, paying_members: 1 },
    '2026-11': { is_partial: true, memberships: 0, sales_pos: 0, pending: 80, total: 80, paying_members: 1 },
  }
});
{
  const model = goalTrackerModel(NOW);
  check(model.monthData[10].known === true && near(model.monthData[10].actual, 0), 'explicit $0 collected is known');
  check(model.curPaceKnown === true, 'zero collected still belongs to this month');
  check(near(model.curPace, 0 - 3000 * 6 / 30), 'zero collected vs prorated goal, not September');
  check(!near(model.curPace, 500 - 1000), 'this month is not September’s full-month pace');
  const hero = heroChunk(renderGoalsPage());
  check(hero.indexOf('This Month vs Goal to Date') >= 0, 'zero-collected month keeps the to-date label');
  check(hero.indexOf('-$500.00') < 0, 'September deficit is not the This Month hero number');
}

// No current-month figure: do not relabel an older month as this month.
resetState();
state.financials = {
  waunakee: { september: { grossTY: 400, goal: 1000 }, october: { goal: 2000 }, november: { goal: 3000 } },
};
{
  const model = goalTrackerModel(NOW);
  check(model.monthData[8].known === true, 'September financials still count when GymDesk has no row');
  check(model.monthData[9].known === false && model.monthData[10].known === false, 'empty later months are unknown');
  check(model.curPaceKnown === false, 'missing November is not a pace number');
  check(model.curPaceLabel === 'This Month vs Goal · no actuals yet', 'label says actuals are not in: ' + model.curPaceLabel);
  check(model.cumPaceLabel === 'Cumulative Pace through Sep', 'cumulative names the month it runs through: ' + model.cumPaceLabel);
  check(near(model.cumPace, model.monthData[8].ahead), 'cumulative pace matches September’s full-month YTD');
  const hero = heroChunk(renderGoalsPage());
  const thisMonthAt = hero.indexOf('This Month vs Goal');
  const thisMonthNum = (hero.slice(0, thisMonthAt).match(/goal-stat-num[^>]*>([^<]*)</g) || []).pop() || '';
  check(hero.indexOf('no actuals yet') >= 0, 'hero renders the no-actuals label');
  check(thisMonthNum.indexOf('—') >= 0, 'This Month stat is a dash, not September’s pace (' + thisMonthNum + ')');
  check(hero.indexOf('Cumulative Pace through Sep') >= 0, 'hero names the cumulative month');
}

// Nightly scorecard still fills gaps, and does not outrank a GymDesk row.
resetState();
state.financials = { waunakee: { april: { grossTY: 10, goal: 100 }, september: { grossTY: 10, goal: 100 } } };
state.scorecardDaily = { waunakee: { '2026-04': { '12': { monthlyRevenue: 80 } }, '2026-09': { '20': { monthlyRevenue: 999 } } } };
{
  const gap = goalTrackerModel(NOW);
  check(near(gap.monthData[3].actual, 80), 'scorecardDaily is used when GymDesk has no April row');
  state.gymdesk = gymdeskFromMonthly({
    waunakee: { '2026-09': { is_partial: false, memberships: 40, sales_pos: 10, pending: 0, total: 50, paying_members: 1 } }
  });
  const withGd = goalTrackerModel(NOW);
  check(near(withGd.monthData[8].actual, 50), 'GymDesk replaces a higher stale scorecard number');
}

// Monthly Plan still bills memberships + sales + pending. Financials keeps grossTY.
resetState();
state.plannerBaseline = {
  waunakee: { '2026-11': { expected_billing: 115, collected: 45, pending: 70, is_partial: true, paying_members: 4, as_of: '2026-11-05T22:20:00-06:00' } }
};
{
  const bill = planBilling('waunakee', '2026-11', {});
  check(bill.mode === 'baseline' && near(bill.n, 115), 'Monthly Plan keeps expected billing including pending, got ' + JSON.stringify(bill));
  state.plannerBaseline = null;
  dashAuth.canFinance = true;
  state.gymdesk = gymdeskFromMonthly({
    waunakee: { '2026-11': { is_partial: true, memberships: 40, sales_pos: 5, pending: 70, total: 115, paying_members: 4 } }
  });
  const fallback = planBilling('waunakee', '2026-11', {});
  check(fallback.mode === 'gymdesk' && near(fallback.n, 115), 'GymDesk fallback for the planner still includes pending, got ' + JSON.stringify(fallback));
  const saved = planBilling('waunakee', '2026-11', { totalMonthlyRevenue: 12 });
  check(saved.mode === 'saved' && near(saved.n, 12), 'a saved planner number is not replaced');
}
resetState();
state.financials = { waunakee: { september: { grossTY: 59501.63, goal: 85000 }, november: { goal: 136000 } } };
state.gymdesk = gymdeskFromMonthly({
  waunakee: { '2026-09': { is_partial: false, memberships: 74757.18, sales_pos: 6706.33, pending: 0, total: 81463.51, paying_members: 327 } }
});
{
  const finHtml = renderFinancialsPage();
  check(finHtml.indexOf('value="59501.63"') >= 0, 'Financials September gross stays the typed grossTY');
  check(finHtml.indexOf('value="81463.51"') < 0, 'Financials does not swap in the GymDesk September total');
}

// Push script: collected excludes pending only on a partial month.
{
  const built = buildPlannerBaseline({
    as_of: '2026-11-05T22:20:00-06:00',
    groups: { all_in: ['waunakee', 'go_ninja_waunakee'] },
    franchise_revenue_2026: {
      locations: {
        waunakee: {
          months: {
            '2026-08': { paying_members: 2, memberships: 10, sales_pos: 2, pending: 0.5, total: 12.5, per_member: 6, is_partial: false },
            '2026-11': { paying_members: 2, memberships: 4, sales_pos: 1, pending: 3, total: 8, per_member: 4, is_partial: true },
          }
        },
        go_ninja_waunakee: { months: {} }
      }
    }
  });
  const aug = built.waunakee['2026-08'];
  const nov = built.waunakee['2026-11'];
  check(near(aug.expected_billing, 12.5) && near(aug.collected, 12.5) && aug.is_partial === false, 'closed baseline collected is the franchise total');
  check(near(nov.expected_billing, 8) && near(nov.collected, 5) && near(nov.pending, 3) && nov.is_partial === true, 'partial baseline collected drops pending');
  check(built.goninjaW && built.goninjaW['2026-11'] == null, 'Go Ninja maps to goninjaW');
}

// Live dumps from Nov 6, 2026, when this environment has them.
const dumpPaths = [
  '/home/ubuntu/.cursor/projects/agent-repos-lvlup-ceo-dashboard/uploads/fb-more_c9f1.json',
  '/home/ubuntu/.cursor/projects/agent-repos-lvlup-ceo-dashboard/uploads/fin-table_4702.json',
];
if (dumpPaths.every(p => fs.existsSync(p))) {
  const fb = JSON.parse(fs.readFileSync(dumpPaths[0], 'utf8'));
  const fin = JSON.parse(fs.readFileSync(dumpPaths[1], 'utf8'));
  resetState();
  applyFinancials(fin.table);
  state.gymdesk = gymdeskFromMonthly(fb.gymdeskMonthly, fb.financeGymdeskMeta && fb.financeGymdeskMeta.as_of);
  const fullBase = baselineFromGymdesk(state.gymdesk);
  state.plannerBaseline = legacyBaseline(fullBase); // finance path must prefer gymdesk over legacy expected_billing

  const model = goalTrackerModel(NOW);
  for (let m = 0; m < 11; m++) {
    const expect = oracleMonth(m);
    check(expect.any === model.monthData[m].known, MONTHS[m] + ' known flag, oracle ' + expect.any + ' model ' + model.monthData[m].known);
    if (expect.any) check(near(model.monthData[m].actual, expect.sum), MONTHS[m] + ' actual ' + model.monthData[m].actual + ' expected ' + expect.sum);
  }
  check(near(model.monthData[0].actual, 163511.31), 'January stays the financials total');
  check(near(model.monthData[7].actual, 164616.42), 'August closed GymDesk total, including residual pending');
  check(near(model.monthData[8].actual, 183741.81), 'September uses closed GymDesk revenue');
  check(near(model.monthData[8].pace, 4351.81), 'September is $4,351.81 ahead of goal');
  check(near(model.monthData[9].actual, 196243.74), 'October uses closed GymDesk revenue');
  check(near(model.monthData[10].actual, 86642.03), 'November earned is collected MTD');
  check(!near(model.monthData[10].actual, 128517.78), 'November does not count pending scheduled billing');
  check(near(model.proGoal, 253000 * 6 / 30), 'November goal to date is 6/30 of $253,000');
  check(near(model.curPace, 86642.03 - 253000 * 6 / 30), 'This Month vs Goal to Date');
  check(model.monthsLeft === 2, 'November has 2 months left, got ' + model.monthsLeft);
  check(model.latestWithData === 10, 'YTD runs through November');

  let ytd = 0;
  for (let m = 0; m <= 10; m++) ytd = round2(ytd + model.monthData[m].actual);
  check(near(model.ytdActual, ytd), 'YTD earned sums Jan–Nov collected');
  check(near(model.remaining, Math.max(1986100 - ytd, 0)), 'remaining to unlock the vacation');
  check(model.pct === Math.min(Math.round(ytd / 1986100 * 100), 100), 'goal complete percent');
  const goalsThroughOct = model.monthData.slice(0, 10).reduce((s, md) => s + md.planned, 0);
  const cum = ytd - (goalsThroughOct + 253000 * 6 / 30);
  check(near(model.cumPace, cum), 'cumulative pace uses full goals through October plus November’s prorated goal');
  check(near(model.monthData[10].displayAhead, model.cumPace), 'November card YTD matches the hero cumulative pace');

  const html = renderGoalsPage();
  const nov = monthChunk(html, 10);
  const sep = monthChunk(html, 8);
  const oct = monthChunk(html, 9);
  check(sep.indexOf('Actual: $183,741.81') >= 0, 'September card shows GymDesk actual');
  check(sep.indexOf('$127,427.82') < 0, 'September card drops the stale financials entry');
  check(oct.indexOf('Actual: $196,243.74') >= 0, 'October card shows the closed actual');
  check(oct.indexOf('>—<') < 0 && oct.indexOf('>—<') < 0, 'October is not an empty dash');
  check(nov.indexOf('Actual: $86,642.03') >= 0, 'November card shows collected MTD');
  check(nov.indexOf('Goal to date: $50,600.00') >= 0, 'November card shows the prorated goal');
  check(html.indexOf('$128,517.78') < 0, 'pending-inclusive November total is not rendered as earned');
  const hero = heroChunk(html);
  check(hero.indexOf('This Month vs Goal to Date (day 6 of 30)') >= 0, 'hero names this month to date');
  check(hero.indexOf('-$51,962.18') < 0, 'hero does not show September’s deficit as this month');
  check(hero.indexOf('+$36,042.03') >= 0, 'hero this-month pace is collected minus goal to date');
  check(hero.indexOf('Cumulative Pace</div>') >= 0, 'cumulative label stays Cumulative Pace when November is in progress');

  // Same earned figures for a director login once the baseline stores collected.
  state.gymdesk = null;
  dashAuth.canFinance = false;
  state.plannerBaseline = fullBase;
  const staff = goalTrackerModel(NOW);
  for (let m = 7; m <= 10; m++) {
    check(near(staff.monthData[m].actual, model.monthData[m].actual), 'staff baseline matches finance GymDesk for ' + MONTHS[m] + ' (' + staff.monthData[m].actual + ' vs ' + model.monthData[m].actual + ')');
  }
  check(staff.curPaceKnown === true && near(staff.curPace, model.curPace), 'staff This Month vs Goal matches');

  // Baseline written before collected/is_partial existed: closed months work, in-progress expected_billing does not.
  state.plannerBaseline = legacyBaseline(fullBase);
  const legacy = goalTrackerModel(NOW);
  check(near(legacy.monthData[8].actual, 183741.81), 'legacy baseline still supplies closed September');
  check(near(legacy.monthData[9].actual, 196243.74), 'legacy baseline still supplies closed October');
  check(legacy.monthData[10].known === false && legacy.monthData[10].pendingOnly === true, 'legacy in-progress expected billing is not earned');
  check(legacy.curPaceKnown === false, 'legacy November does not invent a this-month pace');
  const legacyHtml = renderGoalsPage();
  check(monthChunk(legacyHtml, 10).indexOf('Scheduled billing is not counted as earned') >= 0, 'November explains why collected is missing on this login');
  check(heroChunk(legacyHtml).indexOf('no actuals yet') >= 0, 'legacy hero does not call October or September “this month”');
  check(legacyHtml.indexOf('$128,517.78') < 0, 'legacy tracker does not present pending-inclusive billing as earned');
  check(legacy.cumPaceLabel === 'Cumulative Pace through Oct', 'cumulative names October when November is not earned yet');

  // Screenshot inputs: manual Apr–Jul overrides, no GymDesk. Hero must not reuse September.
  resetState();
  applyFinancials(fin.table);
  state.goals = { vacationOverride: { april: 176643.17, may: 158366.82, june: 158366.82, july: 155080.31 } };
  const shot = goalTrackerModel(NOW);
  check(near(shot.monthData[3].actual, 176643.17) && shot.monthData[3].overridden, 'April override preserved');
  check(near(shot.monthData[8].actual, 127427.82), 'without GymDesk, September stays the financials entry');
  check(near(shot.monthData[8].ahead, 31363.29), 'screenshot cumulative through September');
  check(shot.curPaceKnown === false, 'screenshot case does not treat September as this month');
  const shotHero = heroChunk(renderGoalsPage());
  check(shotHero.indexOf('-$51,962.18') < 0, 'screenshot hero no longer labels September’s deficit as This Month vs Goal');
  check(shotHero.indexOf('Cumulative Pace through Sep') >= 0, 'screenshot cumulative is labeled through Sep');
  check(renderGoalsPage().indexOf('✎ adjusted') >= 0, 'adjusted marker still renders');

  const previewDir = '/opt/cursor/artifacts';
  try {
    resetState();
    applyFinancials(fin.table);
    state.gymdesk = gymdeskFromMonthly(fb.gymdeskMonthly, fb.financeGymdeskMeta && fb.financeGymdeskMeta.as_of);
    state.plannerBaseline = fullBase;
    dashAuth.canFinance = true;
    const page = renderGoalsPage();
    const doc = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Annual Tracker harness</title><style>'
      + ':root{--green:#22c55e;--red:#ef4444;--gray-400:#9ca3af;--gray-500:#6b7280;--gray-600:#4b5563;--gray-700:#374151;--primary:#1a1a2e;--blue:#0f3460;--card:#fff;--gray-50:#f9fafb;--gray-100:#f3f4f6;--green-light:#dcfce7;}'
      + 'body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;background:#f0f2f5;margin:0;padding:24px;}'
      + '.section{background:#fff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,.1);max-width:1100px;margin:0 auto;}'
      + '.goal-hero{display:flex;gap:20px;padding:24px;align-items:center;flex-wrap:wrap;}.goal-hero-main{flex:1;min-width:280px;}'
      + '.goal-hero-title{font-size:1.1rem;font-weight:700;color:#1a1a2e;margin-bottom:2px;}.goal-hero-sub{font-size:13px;color:#6b7280;margin-bottom:12px;}'
      + '.goal-hero-amount{font-size:2.2rem;font-weight:800;color:#1a1a2e;line-height:1;}.goal-hero-target{font-size:13px;color:#6b7280;margin-top:4px;}'
      + '.goal-progress-wrap{position:relative;background:#e5e7eb;border-radius:999px;height:18px;overflow:hidden;}.goal-progress-fill{height:100%;background:linear-gradient(90deg,#0f3460,#22c55e);}'
      + '.goal-progress-label{position:absolute;right:8px;top:0;font-size:11px;font-weight:700;line-height:18px;color:#111;}'
      + '.goal-hero-stats{display:flex;gap:16px;flex-wrap:wrap;}.goal-stat{background:#fff;border:1px solid #f3f4f6;border-radius:10px;padding:14px 18px;text-align:center;min-width:110px;}'
      + '.goal-stat-num{font-size:1.3rem;font-weight:800;}.goal-stat-label{font-size:11px;color:#6b7280;margin-top:2px;}'
      + '.goal-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;padding:20px;}'
      + '.goal-month{background:#f9fafb;border-radius:10px;padding:14px;text-align:center;}.goal-month.has-value{background:#dcfce7;}.goal-month.is-current{border:2px solid #0f3460;}'
      + '.goal-month .month-label{font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:#6b7280;margin-bottom:6px;}'
      + '</style></head><body><div style="max-width:1100px;margin:0 auto 12px;font-weight:800;">Growth · Goals · Annual Tracker · harness (Nov 6, 2026 fixture)</div>'
      + page + '</body></html>';
    fs.mkdirSync('/tmp', { recursive: true });
    fs.writeFileSync('/tmp/annual-tracker-harness.html', doc);
    if (fs.existsSync(previewDir) || true) {
      try { fs.mkdirSync(previewDir, { recursive: true }); fs.writeFileSync(path.join(previewDir, 'annual-tracker-harness.html'), doc); } catch (e) { /* artifacts dir is optional */ }
    }
  } catch (e) {
    check(false, 'writing the harness failed: ' + e.message);
  }
} else {
  console.log('Live Firebase dumps not on disk; skipped the Nov 6 snapshot checks.');
}

if (failed) {
  console.error(failed + ' failed, ' + passed + ' passed');
  process.exit(1);
}
console.log(passed + ' checks passed');
