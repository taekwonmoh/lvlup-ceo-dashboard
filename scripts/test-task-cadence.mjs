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

const DOW = { '2026-11-09': 1, '2026-11-10': 2, '2026-11-11': 3, '2026-11-12': 4, '2026-11-13': 5, '2026-11-14': 6, '2026-11-15': 0 };
// Open after Monday: Tue–Thu everyone, Fri Waunakee only, Sat everyone except DeForest.
const FD_BATH_DAYS = { sueK: [2, 3, 4, 5, 6], andyR: [2, 3, 4, 6], marioS: [2, 3, 4, 6], erikaD: [2, 3, 4] };

SEATS.forEach(emp => {
  const weekly = weeklyTasksFor(emp, WEEK_KEY);
  check(!has(weekly, 'ph_bathroom'), emp + ' weekly list has no bathroom photo');
  check(!has(weeklyTasksFor(emp, getTaskWeekKey(NEXT_WEEK)), 'ph_bathroom'), emp + ' next week has no bathroom photo');
  check(!has(weekly, 'ph_floor'), emp + ' weekly list does not include the training-floor photo');
});

INSTRUCTORS.forEach(emp => {
  WEEK.forEach(day => {
    const daily = dailyTasksForDate(emp, day);
    const due = DOW[day] === 1;
    check(countId(daily, 'ph_bathroom') === (due ? 1 : 0), emp + ' ' + day + (due ? ' has Monday bathroom' : ' has no bathroom'));
    if (DOW[day] !== 0) check(has(daily, 'ph_floor'), emp + ' ' + day + ' still has the daily floor photo');
    const bath = (EMP_DAILY_LOOKUP(emp) || []).find(t => t.id === 'ph_bathroom');
    check(bath && JSON.stringify(bath.days) === '[1]', emp + ' bathroom days are Monday only');
  });
});

function EMP_DAILY_LOOKUP(emp) {
  return grab('getDailyTasks')(emp);
}

// Joey's other floor chores keep their old weekday filters.
check(has(dailyTasksForDate('joeyZ', '2026-11-09'), 'j_wetmop'), 'Joey wet-mop stays on Monday');
check(!has(dailyTasksForDate('joeyZ', '2026-11-11'), 'j_wetmop'), 'Joey wet-mop is not due Wednesday');
check(has(dailyTasksForDate('joeyZ', '2026-11-12'), 'j_greenmachine'), 'Joey green machine stays on Thursday');
check(!has(dailyTasksForDate('joeyZ', '2026-11-14'), 'j_spray'), 'Joey spray mop stays off Saturday');
check(has(dailyTasksForDate('joeyZ', '2026-11-13'), 'ph_floor'), 'Joey training-floor photo stays on Friday');

FRONTDESK.forEach(emp => {
  const template = grab('getDailyTasks')(emp).find(t => t.id === 'ph_bathroom');
  check(template && JSON.stringify(template.days) === JSON.stringify(FD_BATH_DAYS[emp]), emp + ' bathroom days match open days after Monday');
  WEEK.forEach(day => {
    const daily = dailyTasksForDate(emp, day);
    const due = FD_BATH_DAYS[emp].indexOf(DOW[day]) >= 0;
    check(countId(daily, 'ph_bathroom') === (due ? 1 : 0), emp + ' ' + day + (due ? ' has bathroom photo' : ' does not count bathroom'));
    check(!has(daily, 'ph_floor'), emp + ' ' + day + ' has no training-floor photo');
    const lobby = daily.find(t => t.id === 'fd_lobby');
    if (DOW[day] !== 0) check(lobby && (lobby.subs || []).some(s => s.indexOf('bathrooms') >= 0), emp + ' ' + day + ' still tidies bathrooms');
  });
});

function dailyScore(empId, dateKey, doneIds) {
  const tasks = dailyTasksForDate(empId, dateKey);
  const dd = {};
  doneIds.forEach(id => { dd[id] = { ts: 1 }; });
  let done = 0;
  tasks.forEach(t => { if (taskDone(dd, t.id)) done++; });
  return { done, total: tasks.length, hasBath: tasks.some(t => t.id === 'ph_bathroom') };
}
INSTRUCTORS.forEach(emp => {
  WEEK.forEach(day => {
    const listed = ids(dailyTasksForDate(emp, day));
    const full = dailyScore(emp, day, listed);
    check(full.total > 0 && full.done === full.total, emp + ' ' + day + ' completing the listed tasks is 100%');
    const withoutBath = dailyScore(emp, day, listed.filter(id => id !== 'ph_bathroom'));
    if (DOW[day] === 1) check(withoutBath.done === withoutBath.total - 1, emp + ' Monday misses bathroom when it is not done');
    else check(withoutBath.done === withoutBath.total && !withoutBath.hasBath, emp + ' ' + day + ' does not miss bathroom');
  });
});
const ashWedOnlyBath = dailyScore('ash', '2026-11-11', ['ph_bathroom', 'bathrooms']);
check(ashWedOnlyBath.done === 0 && !ashWedOnlyBath.hasBath, 'Ash Wednesday does not treat a bathroom record as a due task');
const ashMonOnlyBath = dailyScore('ash', '2026-11-09', ['ph_bathroom']);
check(ashMonOnlyBath.hasBath && ashMonOnlyBath.done === 1, 'Ash Monday counts one bathroom completion');

state.tasksLoc = 'ash';
state.tasksDate = '2026-11-09';
state.tasksData.ash = { weekly: {} };
state.tasksData.ash.weekly[WEEK_KEY] = {};
const guard = weeklyRequiredStatus('ash', WEEK_KEY);
check(!guard.missing.some(t => t.id === 'ph_bathroom'), 'week sign-off does not require the Monday bathroom photo');
check(guard.missing.every(t => t.id !== 'ph_floor'), 'sign-off does not require the daily floor photo');

const pathInfo = taskPathFor('daily');
check(pathInfo.sPath === 'daily' && pathInfo.sKey === '2026-11-09', 'Monday bathroom completion is stored on that day');
check(pathInfo.base.indexOf('/weekly/') < 0, 'bathroom completion is not stored on the week key');

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
check(wedWeekly.indexOf('data-task-id="ph_bathroom"') < 0, 'Wednesday weekly sheet hides the bathroom photo');
check(wedWeekly.indexOf('data-task-id="ph_floor"') < 0, 'Wednesday weekly sheet hides the training floor');
check((wed.match(/data-task-id="ph_bathroom"/g) || []).length === 0, 'Ash Wednesday sheet does not list bathroom');

const mon = sheet('ash', '2026-11-09');
const monDaily = section(mon, 'Daily Checklist');
const monWeekly = section(mon, 'Weekly Recurring');
check(monDaily.indexOf('data-task-id="ph_bathroom"') >= 0, 'Monday daily sheet shows bathroom');
check(monDaily.indexOf('data-task-id="ph_floor"') >= 0, 'Monday daily sheet still shows the training floor');
check(monWeekly.indexOf('data-task-id="ph_bathroom"') < 0, 'Monday weekly sheet does not show bathroom');
check((mon.match(/data-task-id="ph_bathroom"/g) || []).length === 1, 'Ash Monday lists bathroom once');

const sun = sheet('ash', '2026-11-15');
check(sun.indexOf('Closed on Sundays') >= 0, 'Sunday still skips the daily checklist');
check((sun.match(/data-task-id="ph_bathroom"/g) || []).length === 0, 'Sunday does not show a bathroom photo');
check(sun.indexOf('data-task-id="ph_floor"') < 0, 'Sunday does not add a floor photo to the weekly sheet');

const desk = sheet('sueK', '2026-11-10');
const deskDaily = section(desk, 'Daily Responsibilities');
const deskWeekly = section(desk, 'Weekly Responsibilities');
check(deskDaily.indexOf('data-task-id="ph_bathroom"') >= 0, 'Waunakee front desk Tuesday shows the bathroom photo');
check(deskDaily.indexOf('Check and refresh customer bathrooms') >= 0, 'front desk Tuesday still tidies bathrooms');
check(deskWeekly.indexOf('data-task-id="ph_bathroom"') < 0, 'front desk weekly sheet has no bathroom photo');
check(desk.indexOf('data-task-id="ph_floor"') < 0, 'front desk sheet has no training-floor photo');

const deskMon = sheet('sueK', '2026-11-09');
check(section(deskMon, 'Daily Responsibilities').indexOf('data-task-id="ph_bathroom"') < 0, 'front desk Monday leaves the photo to the lead');

const tarikMon = sheet('tarikM', '2026-11-09');
const tarikFri = sheet('tarikM', '2026-11-13');
check(section(tarikMon, 'Daily Checklist').indexOf('data-task-id="ph_bathroom"') >= 0, 'Tarik Monday bathroom is on the daily list');
check(section(tarikFri, 'Daily Checklist').indexOf('data-task-id="ph_bathroom"') < 0, 'Tarik Friday bathroom is gone');
check((tarikFri.match(/data-task-id="ph_bathroom"/g) || []).length === 0, 'Tarik Friday sheet has no bathroom photo');
check(section(tarikMon, 'Daily Checklist').indexOf('data-task-id="ph_floor"') >= 0, 'Tarik Monday training floor stays daily');
check(section(tarikFri, 'Daily Checklist').indexOf('data-task-id="ph_floor"') >= 0, 'Tarik Friday training floor stays daily');

loadHistoryDate('ash', '2026-11-11');
loadHistoryDate('ash', '2026-11-09');
loadHistoryWeekly('ash', WEEK_KEY);
await new Promise(r => setTimeout(r, 30));
const histWed = state.historyData['ash|2026-11-11'];
check(histWed && histWed.total === dailyTasksForDate('ash', '2026-11-11').length, 'Wednesday history total excludes bathroom');
check(!dailyTasksForDate('ash', '2026-11-11').some(t => t.id === 'ph_bathroom'), 'Wednesday history source list excludes bathroom');
const histMon = state.historyData['ash|2026-11-09'];
check(histMon && histMon.total === dailyTasksForDate('ash', '2026-11-09').length, 'Monday history total includes bathroom');
check(dailyTasksForDate('ash', '2026-11-09').some(t => t.id === 'ph_bathroom'), 'Monday history source list includes bathroom');
const histWeek = state.historyWeekly['ash|' + WEEK_KEY];
check(histWeek && histWeek.total === weeklyTasksFor('ash', WEEK_KEY).length, 'weekly history total does not add bathroom');
check(!weeklyTasksFor('ash', WEEK_KEY).some(t => t.id === 'ph_bathroom'), 'weekly history source excludes bathroom');
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
  state.tasksData.sueK = {};
  fs.writeFileSync(path.join(previewDir, 'ash-wednesday.html'), page(
    'E. Madison (Ash) — Wednesday, November 11, 2026',
    sheet('ash', '2026-11-11')
  ));
  fs.writeFileSync(path.join(previewDir, 'ash-monday.html'), page(
    'E. Madison (Ash) — Monday, November 9, 2026',
    sheet('ash', '2026-11-09')
  ));
  fs.writeFileSync(path.join(previewDir, 'sue-tuesday.html'), page(
    'Waunakee (Front Desk) — Tuesday, November 10, 2026',
    sheet('sueK', '2026-11-10')
  ));
  console.log('Wrote previews to ' + previewDir);
}
