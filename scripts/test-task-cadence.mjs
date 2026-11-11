/**
 * Bathroom photo is weekly. Training-floor photo stays daily.
 * Loads the dashboard script with Firebase stubbed. No network and no writes.
 *
 *   node scripts/test-task-cadence.mjs
 */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const start = html.indexOf('<script>\n/*  -  -  Core Values');
const end = html.lastIndexOf('</script>');
if (start < 0 || end < start) {
  console.error('Could not find the dashboard script in index.html');
  process.exit(1);
}
const source = html.slice(start + '<script>\n'.length, end);

function htmlEscape(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
function makeRef() {
  const r = {
    on() { return r; },
    off() { return r; },
    once() { return Promise.resolve({ val() { return null; } }); },
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
function makeEl() {
  const el = { style: {}, className: '', id: '' };
  let text = '';
  Object.defineProperty(el, 'textContent', {
    get() { return text; },
    set(v) { text = v == null ? '' : String(v); },
  });
  Object.defineProperty(el, 'innerHTML', {
    get() { return htmlEscape(text); },
    set(v) { text = v == null ? '' : String(v); },
  });
  el.appendChild = function () {};
  el.setAttribute = function () {};
  el.addEventListener = function () {};
  el.getContext = function () { return {}; };
  el.focus = function () {};
  return el;
}
const documentStub = {
  getElementById() { return makeEl(); },
  createElement() { return makeEl(); },
  querySelectorAll() { return []; },
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
  navigator: { userAgent: 'task-cadence-test' },
  location: { hash: '', hostname: 'staff.lvlupma.com', search: '' },
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
  requestAnimationFrame(fn) { return fn && 0; },
  confirm() { return false; },
  __writes: [],
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
vm.runInContext(`
  const _fbSet = fbSet;
  fbSet = function(path, val) {
    __writes.push({ path: path, val: val });
    return _fbSet(path, val);
  };
`, sandbox);

function grab(name) {
  const value = vm.runInContext(name, sandbox);
  if (typeof value === 'undefined') throw new Error('Dashboard did not define ' + name);
  return value;
}

const state = grab('state');
const dashAuth = grab('dashAuth');
const dailyTasksForDate = grab('dailyTasksForDate');
const weeklyTasksFor = grab('weeklyTasksFor');
const getTaskWeekKey = grab('getTaskWeekKey');
const taskDone = grab('taskDone');
const weeklyRequiredStatus = grab('weeklyRequiredStatus');
const taskPathFor = grab('taskPathFor');
const renderTasksPage = grab('renderTasksPage');
const loadHistoryDate = grab('loadHistoryDate');
const loadHistoryWeekly = grab('loadHistoryWeekly');

let failed = 0;
let passed = 0;
function check(cond, msg) {
  if (cond) { passed++; return; }
  failed++;
  console.error('FAIL: ' + msg);
}

const INSTRUCTORS = ['bryanG', 'ash', 'joeyZ', 'tarikM', 'mirandaS'];
const FRONTDESK = ['sueK', 'andyR', 'marioS', 'erikaD'];
const SEATS = INSTRUCTORS.concat(FRONTDESK);
// Mon Nov 9 2026 through Sun Nov 15 2026. Wednesday is the day Ash reported the task.
const WEEK = ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15'];
const WEEK_KEY = getTaskWeekKey('2026-11-09');
const NEXT_WEEK = '2026-11-16';

check(WEEK.every(d => getTaskWeekKey(d) === WEEK_KEY), 'Mon–Sun share one task week key');
check(getTaskWeekKey(NEXT_WEEK) !== WEEK_KEY, 'the next Monday is a new week');

function ids(list) { return list.map(t => t.id); }
function has(list, id) { return list.some(t => t.id === id); }
function countId(list, id) { return list.filter(t => t.id === id).length; }

SEATS.forEach(emp => {
  WEEK.forEach(day => {
    const daily = dailyTasksForDate(emp, day);
    check(!has(daily, 'ph_bathroom'), emp + ' ' + day + ' daily list has no bathroom photo');
    check(countId(daily, 'ph_bathroom') === 0, emp + ' ' + day + ' does not repeat bathroom');
  });
  const weekly = weeklyTasksFor(emp, WEEK_KEY);
  const next = weeklyTasksFor(emp, getTaskWeekKey(NEXT_WEEK));
  check(countId(weekly, 'ph_bathroom') === 1, emp + ' weekly list has bathroom once');
  check(countId(next, 'ph_bathroom') === 1, emp + ' next week has bathroom once');
  check(!has(weekly, 'ph_floor'), emp + ' weekly list does not include the training-floor photo');
  const bath = weekly.find(t => t.id === 'ph_bathroom');
  check(bath && bath.photo === true && !bath.days, emp + ' bathroom photo has no weekday filter');
  check(bath && String(bath.text).indexOf('Once this week') >= 0, emp + ' bathroom copy says once this week');
});

INSTRUCTORS.forEach(emp => {
  WEEK.forEach(day => {
    const dow = new Date(day + 'T12:00:00').getDay();
    if (dow === 0) return;
    const daily = dailyTasksForDate(emp, day);
    check(has(daily, 'ph_floor'), emp + ' ' + day + ' still has the daily floor photo');
  });
});

// Joey's other floor chores keep their old weekday filters.
check(has(dailyTasksForDate('joeyZ', '2026-11-09'), 'j_wetmop'), 'Joey wet-mop stays on Monday');
check(!has(dailyTasksForDate('joeyZ', '2026-11-11'), 'j_wetmop'), 'Joey wet-mop is not due Wednesday');
check(has(dailyTasksForDate('joeyZ', '2026-11-12'), 'j_greenmachine'), 'Joey green machine stays on Thursday');
check(!has(dailyTasksForDate('joeyZ', '2026-11-14'), 'j_spray'), 'Joey spray mop stays off Saturday');
check(has(dailyTasksForDate('joeyZ', '2026-11-13'), 'ph_floor'), 'Joey training-floor photo stays on Friday');

// Front desk still tidies bathrooms every open day, without a daily photo task.
['2026-11-10', '2026-11-11', '2026-11-12', '2026-11-14'].forEach(day => {
  const daily = dailyTasksForDate('sueK', day);
  const lobby = daily.find(t => t.id === 'fd_lobby');
  check(lobby && (lobby.subs || []).some(s => s.indexOf('bathrooms') >= 0), 'front desk ' + day + ' still tidies bathrooms');
  check(!has(daily, 'ph_floor'), 'front desk ' + day + ' has no training-floor photo');
});

// Completing every daily task is 100% without a bathroom photo. A stored daily
// bathroom photo does not create a miss on the other days, because it is not due.
function dailyScore(empId, dateKey, doneIds) {
  const tasks = dailyTasksForDate(empId, dateKey);
  const dd = {};
  doneIds.forEach(id => { dd[id] = { ts: 1 }; });
  let done = 0;
  tasks.forEach(t => { if (taskDone(dd, t.id)) done++; });
  return { done, total: tasks.length };
}
WEEK.forEach(day => {
  const all = ids(dailyTasksForDate('ash', day));
  const full = dailyScore('ash', day, all);
  check(full.total > 0 && full.done === full.total, 'Ash ' + day + ' daily score ignores bathroom');
  const onlyOld = dailyScore('ash', day, ['ph_bathroom', 'bathrooms']);
  check(onlyOld.done === 0, 'Ash ' + day + ' old bathroom completion is not a daily task');
});

function weeklyScore(empId, weekKey, doneIds) {
  const tasks = weeklyTasksFor(empId, weekKey);
  const dd = {};
  doneIds.forEach(id => { dd[id] = { ts: 1, photos: ['https://example.test/bath.jpg'] }; });
  let done = 0;
  tasks.forEach(t => { if (dd[t.id]) done++; });
  return { done, total: tasks.length, missing: tasks.filter(t => !dd[t.id]).map(t => t.id) };
}
const openWeek = weeklyScore('ash', WEEK_KEY, []);
check(openWeek.missing.indexOf('ph_bathroom') >= 0, 'an open week lists bathroom once');
check(openWeek.missing.filter(id => id === 'ph_bathroom').length === 1, 'bathroom is not missed six extra times');
const closed = weeklyScore('ash', WEEK_KEY, ['ph_bathroom']);
check(closed.done === 1 && closed.missing.indexOf('ph_bathroom') < 0, 'one weekly completion clears bathroom');

state.tasksLoc = 'ash';
state.tasksDate = '2026-11-11';
state.tasksData.ash = { weekly: {} };
state.tasksData.ash.weekly[WEEK_KEY] = {};
let guard = weeklyRequiredStatus('ash', WEEK_KEY);
check(guard.missing.some(t => t.id === 'ph_bathroom'), 'week sign-off still requires the bathroom photo');
state.tasksData.ash.weekly[WEEK_KEY] = { ph_bathroom: { ts: 1, photos: ['https://example.test/bath.jpg'] } };
guard = weeklyRequiredStatus('ash', WEEK_KEY);
check(!guard.missing.some(t => t.id === 'ph_bathroom'), 'a weekly bathroom photo satisfies sign-off');
check(guard.missing.every(t => t.id !== 'ph_floor'), 'sign-off does not require the daily floor photo');

const pathInfo = taskPathFor('weekly');
check(pathInfo.sPath === 'weekly' && pathInfo.sKey === WEEK_KEY, 'weekly completion path uses the week key');
check(pathInfo.base.indexOf('/daily/') < 0, 'weekly bathroom completion is not stored on a day');

dashAuth.ready = true;
dashAuth.allowed = true;
dashAuth.isAdmin = false;
dashAuth.dashRole = 'lead';
dashAuth.empId = 'ash';
dashAuth.name = 'Fixture Lead';
dashAuth.user = { email: 'fixture-lead@example.test', emailVerified: true };

function section(html, title) {
  const parts = String(html).split('<div class="task-section">').slice(1);
  return parts.find(p => p.indexOf(title) >= 0) || '';
}
function sheet(empId, dateKey) {
  state.tasksLoc = empId;
  state.tasksDate = dateKey;
  state.tasksTab = 'sheets';
  return renderTasksPage();
}

const wed = sheet('ash', '2026-11-11');
const wedDaily = section(wed, 'Daily Checklist');
const wedWeekly = section(wed, 'Weekly Recurring');
check(wedDaily.indexOf('data-task-id="ph_floor"') >= 0, 'Wednesday daily sheet shows the training floor');
check(wedDaily.indexOf('Training Floor') >= 0, 'Wednesday daily sheet names the training floor');
check(wedDaily.indexOf('data-task-id="ph_bathroom"') < 0, 'Wednesday daily sheet hides the bathroom photo');
check(wedWeekly.indexOf('data-task-id="ph_bathroom"') >= 0, 'Wednesday weekly sheet shows the bathroom photo');
check(wedWeekly.indexOf('Once this week') >= 0, 'Wednesday weekly sheet says once this week');
check(wedWeekly.indexOf('data-task-id="ph_floor"') < 0, 'Wednesday weekly sheet hides the training floor');
check((wed.match(/data-task-id="ph_bathroom"/g) || []).length === 1, 'Ash Wednesday sheet lists bathroom once');

const mon = sheet('ash', '2026-11-09');
const monDaily = section(mon, 'Daily Checklist');
const monWeekly = section(mon, 'Weekly Recurring');
check(monDaily.indexOf('data-task-id="ph_bathroom"') < 0, 'Monday daily sheet no longer shows bathroom');
check(monDaily.indexOf('data-task-id="ph_floor"') >= 0, 'Monday daily sheet still shows the training floor');
check(monWeekly.indexOf('data-task-id="ph_bathroom"') >= 0, 'Monday weekly sheet shows bathroom');

const sun = sheet('ash', '2026-11-15');
check(sun.indexOf('Closed on Sundays') >= 0, 'Sunday still skips the daily checklist');
check((sun.match(/data-task-id="ph_bathroom"/g) || []).length === 1, 'Sunday keeps the one weekly bathroom task');
check(sun.indexOf('data-task-id="ph_floor"') < 0, 'Sunday does not add a floor photo to the weekly sheet');

const desk = sheet('sueK', '2026-11-11');
const deskDaily = section(desk, 'Daily Responsibilities');
const deskWeekly = section(desk, 'Weekly Responsibilities');
check(deskDaily.indexOf('data-task-id="ph_bathroom"') < 0, 'front desk Wednesday is not a daily bathroom photo');
check(deskDaily.indexOf('Check and refresh customer bathrooms') >= 0, 'front desk Wednesday still tidies bathrooms');
check(deskWeekly.indexOf('data-task-id="ph_bathroom"') >= 0, 'front desk weekly sheet has the bathroom photo');
check(desk.indexOf('data-task-id="ph_floor"') < 0, 'front desk sheet has no training-floor photo');

const tarikMon = sheet('tarikM', '2026-11-09');
const tarikFri = sheet('tarikM', '2026-11-13');
check(section(tarikMon, 'Daily Checklist').indexOf('data-task-id="ph_bathroom"') < 0, 'Tarik Monday bathroom is not daily');
check(section(tarikFri, 'Daily Checklist').indexOf('data-task-id="ph_bathroom"') < 0, 'Tarik Friday bathroom is not a second daily photo');
check((tarikMon.match(/data-task-id="ph_bathroom"/g) || []).length === 1, 'Tarik has one weekly bathroom photo, not Mon+Fri');
check(section(tarikMon, 'Daily Checklist').indexOf('data-task-id="ph_floor"') >= 0, 'Tarik Monday training floor stays daily');

loadHistoryDate('ash', '2026-11-11');
loadHistoryWeekly('ash', WEEK_KEY);
await new Promise(r => setTimeout(r, 30));
const hist = state.historyData['ash|2026-11-11'];
const expectedDaily = dailyTasksForDate('ash', '2026-11-11').length;
check(hist && hist.total === expectedDaily && expectedDaily > 0, 'history daily total excludes bathroom');
check(!dailyTasksForDate('ash', '2026-11-11').some(t => t.id === 'ph_bathroom'), 'history source list excludes bathroom');
const histWeek = state.historyWeekly['ash|' + WEEK_KEY];
const expectedWeekly = weeklyTasksFor('ash', WEEK_KEY).length;
check(histWeek && histWeek.total === expectedWeekly, 'history weekly total includes bathroom once');
check(sandbox.__writes.length === 0, 'cadence test did not write');

if (failed) {
  console.error(failed + ' failed, ' + passed + ' passed');
  process.exit(1);
}
console.log(passed + ' passed');

const previewDir = process.argv.includes('--preview') ? process.argv[process.argv.indexOf('--preview') + 1] : '';
if (previewDir) {
  fs.mkdirSync(previewDir, { recursive: true });
  const styles = [];
  const styleRe = /<style>([\s\S]*?)<\/style>/g;
  let styleMatch;
  while ((styleMatch = styleRe.exec(html))) styles.push(styleMatch[1]);
  const page = (title, body) => `<!doctype html>
<html><head><meta charset="utf-8"><title>${title}</title>
<style>${styles.join('\n')}
body{background:#f4f6fb;margin:0}
.preview-wrap{max-width:880px;margin:0 auto;padding:20px 16px 32px}
.preview-banner{background:#fffbeb;border:1px solid #fde68a;color:#92400e;border-radius:10px;padding:10px 14px;font:600 13px/1.45 system-ui,sans-serif;margin-bottom:14px}
</style></head><body>
<div class="preview-wrap">
<div class="preview-banner">${title}. Local render of the task sheet with mock data. Not connected to Firebase.</div>
<div data-sheet="1">${body}</div>
</div>
<script>
document.querySelectorAll('[data-sheet]').forEach(root => {
  root.querySelectorAll('.bonus-tracker').forEach(el => el.remove());
  root.querySelectorAll('.task-section').forEach(sec => {
    const label = (sec.querySelector('h3') || {}).textContent || '';
    if (label.indexOf('Daily') < 0 && label.indexOf('Weekly') < 0) sec.remove();
  });
});
</script>
</body></html>`;
  state.tasksData.ash = {};
  const wedOpen = sheet('ash', '2026-11-11');
  const monOpen = sheet('ash', '2026-11-09');
  fs.writeFileSync(path.join(previewDir, 'ash-wednesday.html'), page(
    'E. Madison (Ash) — Wednesday, November 11, 2026',
    wedOpen
  ));
  fs.writeFileSync(path.join(previewDir, 'ash-monday.html'), page(
    'E. Madison (Ash) — Monday, November 9, 2026',
    monOpen
  ));
  console.log('Wrote previews to ' + previewDir);
}
