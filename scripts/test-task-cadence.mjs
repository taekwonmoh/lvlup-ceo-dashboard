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

// ── Proof of work. Legacy records (no proofV) keep the old score. ──
const taskBonusComplete = grab('taskBonusComplete');
const taskRecord = grab('taskRecord');
const proofFieldsOk = grab('proofFieldsOk');
const taskBurstIds = grab('taskBurstIds');
const completeTask = grab('completeTask');
const completeTaskWithNotes = grab('completeTaskWithNotes');
const completeTaskCount = grab('completeTaskCount');
const proofSaveStructured = grab('proofSaveStructured');
const FD_QUESTIONS_SCORED_BEFORE = grab('FD_QUESTIONS_SCORED_BEFORE');

vm.runInContext(`
  const __els = {};
  function __blankEl(){
    const el = { style:{}, innerHTML:'', textContent:'', value:'', className:'', id:'' };
    el.focus = function(){};
    el.addEventListener = function(){};
    el.appendChild = function(){};
    el.setAttribute = function(){};
    el.querySelectorAll = function(){ return []; };
    el.classList = { add(){}, remove(){}, toggle(){} };
    return el;
  }
  document.getElementById = function(id){ return __els[id] || __blankEl(); };
  document.__els = __els;
  document.__blankEl = __blankEl;
`, sandbox);
function setEl(id, value) {
  vm.runInContext(
    'document.__els[' + JSON.stringify(id) + '] = { value: ' + JSON.stringify(value) + ', style: {}, focus() {} };',
    sandbox
  );
}
function clearEls() {
  vm.runInContext('document.__els = {}; document.getElementById = function(id){ return document.__els[id] || document.__blankEl(); };', sandbox);
}

function scoreBoth(empId, dateKey, dd) {
  const tasks = dailyTasksForDate(empId, dateKey);
  let oldDone = 0, newDone = 0;
  tasks.forEach(t => {
    if (taskDone(dd, t.id)) oldDone++;
    if (taskBonusComplete(t, taskRecord(dd, t.id))) newDone++;
  });
  return { oldDone, newDone, total: tasks.length };
}

['bryanG', 'ash', 'joeyZ', 'tarikM', 'mirandaS', 'sueK', 'andyR', 'marioS', 'erikaD'].forEach(emp => {
  WEEK.forEach(day => {
    const tasks = dailyTasksForDate(emp, day);
    const dd = {};
    tasks.forEach(t => { dd[t.id] = { ts: 1 }; });
    const s = scoreBoth(emp, day, dd);
    check(s.oldDone === s.total && s.newDone === s.oldDone, emp + ' ' + day + ' legacy checkmarks still score the same');
  });
});

const joeyMon = '2026-10-05';
const joeyOld = {};
dailyTasksForDate('joeyZ', joeyMon).forEach(t => { joeyOld[t.id] = { ts: 1 }; });
delete joeyOld.closing;
joeyOld.eos = { ts: 1 };
const joeyAlias = scoreBoth('joeyZ', joeyMon, joeyOld);
check(taskDone(joeyOld, 'closing') && joeyAlias.oldDone === joeyAlias.newDone && joeyAlias.newDone === joeyAlias.total, 'eos alias still completes closing and the day still scores the same');

const rosters = dailyTasksForDate('ash', '2026-11-16').find(t => t.id === 'rosters');
check(taskBonusComplete(rosters, { ts: 1 }), 'a pre-proof roster check still counts');
check(!taskBonusComplete(rosters, { ts: 2, proofV: 1, notes: '   ' }), 'a new roster check with a blank note does not count');
check(taskBonusComplete(rosters, { ts: 3, proofV: 1, notes: 'Tigers 7, Kids 11. No new / no trials' }), 'roster notes count');

const stoplight = dailyTasksForDate('ash', '2026-11-16').find(t => t.id === 'stoplight');
check(taskBonusComplete(stoplight, { ts: 1, count: 2 }), 'an old stoplight count of 2 still counts');
check(!taskBonusComplete(stoplight, { ts: 2, proofV: 1, count: 2, notes: '2' }), 'a new manual count does not complete stoplight');
check(taskBonusComplete(stoplight, { ts: 3, proofV: 1, auto: true, count: 2, notes: 'Bonnie Templeton (Postcard·ASH), Maria Kanteh (Postcard·ASH)' }), 'two named Students-page logs complete stoplight');
check(!proofFieldsOk(stoplight, { proofV: 1, auto: true, count: 1, notes: 'Bonnie Templeton (Postcard·ASH)' }), 'one named log is not enough');

check(FD_QUESTIONS_SCORED_BEFORE === '2026-11-16', 'front desk question task drops on Nov 16');
check(has(dailyTasksForDate('sueK', '2026-11-10'), 'fd_questions'), 'Nov 10 still scores the old front-desk question task');
check(!has(dailyTasksForDate('sueK', '2026-11-17'), 'fd_questions'), 'Nov 17 does not score fd_questions');
const oldSue = ['fd_messages', 'fd_followups', 'fd_notify_msk', 'fd_questions', 'fd_retail', 'fd_gear', 'fd_lobby', 'ph_bathroom', 'fd_next_shift'];
check(JSON.stringify(ids(dailyTasksForDate('sueK', '2026-11-10'))) === JSON.stringify(oldSue), 'Nov 10 front-desk ids match the pre-proof list');
const sueDd = {};
oldSue.forEach(id => { sueDd[id] = { ts: 1 }; });
check(oldSue.every(id => taskDone(sueDd, id)), 'stored fd_questions records still read as done');

check(JSON.stringify(taskBurstIds([
  { id: 'a', ts: 0 }, { id: 'b', ts: 1000 }, { id: 'c', ts: 2000 }, { id: 'p', ts: 3000, photo: true }
])) === '[]', 'three checks plus a photo do not burst');
const burst4 = taskBurstIds([
  { id: 'a', ts: 0 }, { id: 'b', ts: 1000 }, { id: 'c', ts: 2000 }, { id: 'd', ts: 3000 }, { id: 'p', ts: 2500, photo: true }
]);
check(burst4.length === 4 && burst4.indexOf('p') < 0, 'four non-photo checks inside 60 seconds are flagged and the photo is not');
check(taskBurstIds([
  { id: 'a', ts: 0 }, { id: 'b', ts: 1000 }, { id: 'c', ts: 2000 }, { id: 'd', ts: 60001 }
]).length === 0, 'a check just outside 60 seconds does not join the burst');

const burstTask = { id: 'j_spray', text: 'Spray' };
check(!taskBonusComplete(burstTask, { ts: 1, proofV: 1, burst: true }), 'an unconfirmed burst does not count toward the bonus');
check(taskBonusComplete(burstTask, { ts: 1, proofV: 1, burst: true, burstOk: true }), 'a manager confirm puts the task back in the bonus');
check(taskBonusComplete(burstTask, { ts: 1, burst: true }), 'a legacy record is not retroactively removed by a burst flag');

state.tasksLoc = 'joeyZ';
state.tasksDate = '2026-11-16';
state.tasksData.joeyZ = { daily: { '2026-11-16': {} } };
sandbox.__writes.length = 0;
['c1', 'c2', 'c3', 'c4'].forEach(id => completeTask('daily', id));
const burstWrites = sandbox.__writes.filter(w => String(w.path).indexOf('/daily/2026-11-16/') >= 0);
check(burstWrites.length >= 4, 'burst test wrote only through the local stub');
check(sandbox.__writes.every(w => String(w.path).indexOf('tasks/emp/') === 0 || String(w.path).indexOf('tasks/emp/') > 0), 'burst writes stay on task paths');
const live = state.tasksData.joeyZ.daily['2026-11-16'];
check(['c1', 'c2', 'c3', 'c4'].every(id => live[id] && live[id].burst && !taskBonusComplete({ id }, live[id])), 'four rapid checks are marked needs-review in memory');
live.c1.burstOk = true;
check(taskBonusComplete({ id: 'c1' }, live.c1), 'confirming one burst item counts that item');

clearEls();
const beforeBlank = sandbox.__writes.length;
setEl('notes_weekly_ad_invites', '   ');
completeTaskWithNotes('weekly', 'ad_invites');
check(sandbox.__writes.length === beforeBlank, 'blank AD invite names do not save');
setEl('notes_weekly_ad_invites', 'Sam');
completeTaskWithNotes('weekly', 'ad_invites');
check(sandbox.__writes.length === beforeBlank, 'one name does not satisfy the two-name invite');
setEl('notes_weekly_ad_invites', 'Sam\nRiley');
completeTaskWithNotes('weekly', 'ad_invites');
const inviteWrite = sandbox.__writes[sandbox.__writes.length - 1];
check(inviteWrite && inviteWrite.val && inviteWrite.val.proofV === 1 && inviteWrite.val.notes.indexOf('Riley') >= 0, 'two names save as proof');

const beforeCount = sandbox.__writes.length;
setEl('count_daily_stoplight', '2');
completeTaskCount('daily', 'stoplight');
check(sandbox.__writes.length === beforeCount, 'the stoplight number box cannot complete the task');

state.tasksLoc = 'sueK';
state.tasksDate = '2026-11-17';
if (!state.tasksData.sueK) state.tasksData.sueK = {};
setEl('notes_daily_fd_messages', '');
const beforeNone = sandbox.__writes.length;
grab('proofUseNone')('daily', 'fd_messages');
const noneWrite = sandbox.__writes[sandbox.__writes.length - 1];
check(sandbox.__writes.length > beforeNone && noneWrite.val && noneWrite.val.none && noneWrite.val.notes === 'None today', 'None today completes the inbox task');

state.tasksLoc = 'ash';
state.tasksDate = '2026-11-16';
if (!state.tasksData.ash) state.tasksData.ash = {};
function bookEl(i, key, value) { setEl('pf_cycle_checklist_cc_bday_book_' + i + '_' + key, value); }
bookEl(0, 'child', 'Ava'); bookEl(0, 'family', 'Nguyen'); bookEl(0, 'date', '2026-12-05');
bookEl(1, 'child', ''); bookEl(1, 'family', ''); bookEl(1, 'date', '');
const beforeParty = sandbox.__writes.length;
proofSaveStructured('cycle_checklist', 'cc_bday');
check(sandbox.__writes.length === beforeParty, 'one party does not complete the two-party cycle task');
bookEl(1, 'child', 'Leo'); bookEl(1, 'family', 'Patel'); bookEl(1, 'date', '2026-12-12');
proofSaveStructured('cycle_checklist', 'cc_bday');
const partyWrite = sandbox.__writes[sandbox.__writes.length - 1];
check(partyWrite && partyWrite.val && partyWrite.val.bookings && partyWrite.val.bookings.length === 2, 'two named parties with dates complete Book a party');

const monProof = sheet('ash', '2026-11-16');
check(monProof.indexOf('How many today') < 0, 'the stoplight sheet has no manual count box');
check(monProof.indexOf('Students page') >= 0, 'stoplight tells staff to use the Students page');
check(monProof.indexOf('data-proof-form="note"') >= 0, 'roster proof field is on the sheet');
check(monProof.indexOf('Invite birthday families') >= 0, 'weekly birthday task was renamed');
check(monProof.indexOf('data-proof-form="invites"') >= 0, 'birthday invite fields are on the sheet');
check(monProof.indexOf('Book a party') >= 0 && monProof.indexOf('Ava') >= 0, 'a saved party booking shows the child name');
const bryanProof = sheet('bryanG', '2026-11-16');
check(bryanProof.indexOf('data-proof-form="bookings"') >= 0, 'cycle party booking fields are on the sheet');
check(monProof.indexOf('data-task-id="ph_bathroom"') >= 0, 'Monday bathroom photo is still on the lead sheet');
check(monProof.indexOf('data-task-id="ph_floor"') >= 0, 'training floor photo is still daily');

const deskNew = sheet('sueK', '2026-11-17');
check(deskNew.indexOf('data-task-id="fd_questions"') < 0, 'front desk sheet no longer lists the question checkbox');
check(deskNew.indexOf('None today') >= 0, 'front desk message task offers None today');
check(deskNew.indexOf('data-task-id="ph_bathroom"') >= 0, 'Tuesday front desk still has the bathroom photo');
check(deskNew.indexOf('Check and refresh customer bathrooms') >= 0, 'lobby tidying still mentions bathrooms');
check(deskNew.indexOf('data-task-id="fd_lobby"') >= 0, 'lobby reset is still a task');

state.tasksLoc = 'joeyZ';
state.tasksDate = '2026-11-16';
state.tasksData.joeyZ.daily['2026-11-16'].j_spray = { ts: Date.now(), proofV: 1, burst: true, notes: '' };
const reviewSheet = sheet('joeyZ', '2026-11-16');
check(reviewSheet.indexOf('data-needs-review="1"') >= 0, 'a burst task renders the needs-review state');
check(reviewSheet.indexOf('Needs review') >= 0, 'needs-review is labeled on the task');

state.tasksTab = 'history';
state.historyFocus = { empId: 'joeyZ', dateKey: '2026-11-16' };
state.historyData['joeyZ|2026-11-16'] = {
  done: 1,
  total: 2,
  dayOff: false,
  needsReview: true,
  items: [
    { id: 'stoplight', text: 'Reach 2 students on the stoplight', verified: true, rec: { ts: 1, proofV: 1, auto: true, count: 2, notes: 'Bonnie Templeton (Postcard·ASH), Maria Kanteh (Postcard·ASH)' } },
    { id: 'j_spray', text: 'Spray-mop the floor', verified: false, rec: { ts: 2, proofV: 1, burst: true } },
  ],
};
const proofView = renderTasksPage();
check(proofView.indexOf('data-manager-proof="1"') >= 0, 'history shows the manager proof panel');
check(proofView.indexOf('Auto from Students') >= 0, 'manager proof shows the Students-page source');
check(proofView.indexOf('data-day-needs-review="1"') >= 0, 'manager proof shows the needs-review day');
check(proofView.indexOf('Bonnie Templeton') >= 0, 'manager proof shows the named outreach');
state.tasksTab = 'sheets';
state.historyFocus = null;

const taskBackfillGate = grab('taskBackfillGate');
const taskClockDecision = grab('taskClockDecision');
const photoReuseHit = grab('photoReuseHit');
const applyJoeyFloorLinks = grab('applyJoeyFloorLinks');
const maybeAutoCompleteTasks = grab('maybeAutoCompleteTasks');
const clockGateOn = grab('clockGateOn');

state.tasksLoc = 'joeyZ';
state.tasksDate = '2026-11-15';
state._proofNow = '2026-11-16T16:00:00Z'; // 10:00 AM Central
check(taskBackfillGate('daily', new Date(state._proofNow)).allow === true, 'yesterday is still open at 10:00 AM Central');
check(taskBackfillGate('daily', new Date(state._proofNow)).nextDay === true, 'a next-morning save is flagged');
state._proofNow = '2026-11-16T18:00:00Z'; // 12:00 PM Central
const late = taskBackfillGate('daily', new Date(state._proofNow));
check(late.allow === false && late.late === true, 'after 11:00 AM Central a non-admin cannot backfill yesterday');
dashAuth.isAdmin = true;
check(taskBackfillGate('daily', new Date(state._proofNow)).allow === true, 'an admin can backfill after 11:00 AM');
dashAuth.isAdmin = false;
state.tasksDate = '2026-11-14';
check(taskBackfillGate('daily', new Date('2026-11-16T16:00:00Z')).allow === false, 'two days back is admin-only');
state.tasksDate = '2026-11-16';
state._proofNow = null;
check(taskBackfillGate('weekly', new Date('2026-11-16T18:00:00Z')).allow === true, 'weekly tasks are not on the backfill clock');

check(clockGateOn('joeyZ') === false, 'the clock-in gate defaults off');
state.tasksDate = '2026-11-16';
check(taskClockDecision('daily', { id: 'rosters' }, new Date('2026-11-16T20:00:00Z')).allow === true, 'with the gate off, a task does not need a punch');
state.clockGate = { deforest: true };
check(clockGateOn('joeyZ') === true, 'DeForest can turn the gate on');
const beforePunch = taskClockDecision('daily', { id: 'rosters' }, new Date('2026-11-16T20:00:00Z'));
check(beforePunch.allow === false, 'gate on and no punch blocks the task');
state.timeclock = { entries: { joeyZ: { '2026-11-16': { e1: { inAt: Date.parse('2026-11-16T15:00:00Z'), outAt: Date.parse('2026-11-16T23:00:00Z') } } } } };
check(taskClockDecision('daily', { id: 'rosters' }, new Date('2026-11-16T18:00:00Z')).allow === true, 'a task during the punch is allowed');
check(taskClockDecision('daily', { id: 'rosters' }, new Date('2026-11-16T23:10:00Z')).allow === false, 'a normal task in the 15-minute grace is blocked');
check(taskClockDecision('daily', { id: 'closing', photo: false }, new Date('2026-11-16T23:10:00Z')).allow === true, 'closing is allowed for 15 minutes after clock-out');
check(taskClockDecision('daily', { id: 'ph_floor', photo: true }, new Date('2026-11-16T23:10:00Z')).allow === true, 'a photo is allowed for 15 minutes after clock-out');
check(taskClockDecision('daily', { id: 'closing' }, new Date('2026-11-16T23:20:00Z')).allow === false, 'the grace ends at 15 minutes');
state.clockGate = {};
state.timeclock = {};

check(photoReuseHit('ph_floor', 'abc', { ph_floor: { abc: { period: '2026-11-09' } } }, '2026-11-16') === true, 'a photo hash from an earlier day is reused');
check(photoReuseHit('ph_floor', 'abc', { ph_floor: { abc: { period: '2026-11-16' } } }, '2026-11-16') === false, 'the same photo saved again today is not reused');
check(taskBonusComplete({ id: 'ph_floor', priorPhoto: true, photo: true }, { proofV: 1, photos: ['u'], reusedPhoto: true }) === false, 'a reused photo does not count until a manager confirms');
check(taskBonusComplete({ id: 'ph_floor', priorPhoto: true, photo: true }, { ts: 1, photos: ['u'] }) === true, 'an older floor photo without a hash still counts');

state.tasksLoc = 'joeyZ';
state.tasksDate = '2026-11-16';
state.tasksData.joeyZ = { daily: { '2026-11-16': { ph_floor: { ts: 1, proofV: 1, photos: ['https://example.test/floor.jpg'] } } } };
setEl('phflag_j_spray', '');
setEl('phflag_j_wetmop', '');
sandbox.document.__els.phflag_j_spray.checked = true;
sandbox.document.__els.phflag_j_wetmop.checked = true;
const beforeMop = sandbox.__writes.length;
applyJoeyFloorLinks();
const mopDay = state.tasksData.joeyZ.daily['2026-11-16'];
check(mopDay.j_spray && mopDay.j_spray.via === 'ph_floor' && mopDay.j_wetmop && mopDay.j_wetmop.via === 'ph_floor', 'Joey’s mop rows complete from the floor photo');
check(sandbox.__writes.length > beforeMop, 'mop links write through the local stub');
const beforeSpray = sandbox.__writes.length;
completeTask('daily', 'j_spray');
check(sandbox.__writes.length === beforeSpray, 'spray-mop cannot be checked without the floor photo');
const joeySheet = sheet('joeyZ', '2026-11-16');
check(joeySheet.indexOf('data-floor-mop="1"') >= 0, 'Joey’s floor photo asks which mop it covers');
check(joeySheet.indexOf('data-linked-task="1"') >= 0, 'the mop rows point at the floor photo');
check(has(dailyTasksForDate('joeyZ', '2026-11-14'), 'j_wetmop') === false, 'wet-mop is still Monday only');
check(!has(dailyTasksForDate('joeyZ', '2026-11-14'), 'j_spray'), 'spray-mop stays off Saturday');

state.tasksLoc = 'ash';
state.tasksDate = '2026-11-16';
state.inventory = { inv1: { name: 'Paper towels', location: 'eastmad', createdAt: Date.parse('2026-11-16T18:00:00Z') } };
state.invLoaded = true;
state.tcLoaded = true;
state.timeclock = {
  staff: { ash: { loc: 'eastmad' } },
  timeoff: { t1: { empId: 'ash', status: 'approved' } },
  schedulePublished: { '2026-11-23': { publishedAt: Date.parse('2026-11-16T18:00:00Z'), snap: {} } },
};
if (!state.tasksData.ash) state.tasksData.ash = {};
maybeAutoCompleteTasks();
const ashWeek = (state.tasksData.ash.weekly || {})[getTaskWeekKey('2026-11-16')] || {};
check(ashWeek.supplies && ashWeek.supplies.auto && ashWeek.supplies.notes.indexOf('Paper towels') >= 0, 'a restock logged this week completes supplies');
check(ashWeek.pto_review && ashWeek.pto_review.auto && ashWeek.pto_review.notes === 'No pending requests', 'no pending time-off completes the review');
check(ashWeek.post_schedule && ashWeek.post_schedule.auto, 'publishing next week completes the schedule task');
state.inventory = {};
state.timeclock = {};
state.tcLoaded = false;
state.tasksData.ash.weekly[getTaskWeekKey('2026-11-16')].supplies = { ts: 1 };
const kept = sandbox.__writes.length;
maybeAutoCompleteTasks();
check(state.tasksData.ash.weekly[getTaskWeekKey('2026-11-16')].supplies.ts === 1 && !state.tasksData.ash.weekly[getTaskWeekKey('2026-11-16')].supplies.auto, 'a legacy supplies check is not replaced');
check(sandbox.__writes.length === kept, 'auto-complete does not rewrite a legacy record');

const GARBAGE = 'Take out all LVLUP garbage daily: lobby, hallway, and main training floor.';
const THIS_WEEK = getTaskWeekKey('2026-11-17');
check(THIS_WEEK === '2026-W47', 'Nov 17 2026 is week 2026-W47');
const tarikThis = weeklyTasksFor('tarikM', THIS_WEEK);
const garbage = tarikThis.find(t => t.id === 'lvlup_garbage');
const mopAt = tarikThis.findIndex(t => t.id === 'mop_mats');
check(garbage && garbage.text === GARBAGE, 'Tarik weekly list includes the daily garbage run');
check(garbage && !garbage.every && !garbage.days, 'the weekly list has no daily frequency to set');
check(mopAt >= 0 && tarikThis[mopAt + 1] && tarikThis[mopAt + 1].id === 'lvlup_garbage', 'garbage sits with the other floor chores');
check(!has(weeklyTasksFor('tarikM', WEEK_KEY), 'lvlup_garbage'), 'the week of Nov 9 does not gain the garbage task');
['bryanG', 'ash', 'joeyZ', 'mirandaS', 'sueK'].forEach(emp => {
  check(!has(weeklyTasksFor(emp, THIS_WEEK), 'lvlup_garbage'), emp + ' does not get Tarik’s garbage task');
});
const tarikSheet = sheet('tarikM', '2026-11-17');
check(section(tarikSheet, 'Weekly Recurring').indexOf('data-task-id="lvlup_garbage"') >= 0, 'Tarik weekly sheet shows the garbage task');
check(section(tarikSheet, 'Weekly Recurring').indexOf('Take out all LVLUP garbage daily') >= 0, 'Tarik weekly sheet uses the garbage wording');
check(section(tarikSheet, 'Daily Checklist').indexOf('lvlup_garbage') < 0, 'garbage stays off Tarik’s daily checklist');
check(section(sheet('tarikM', '2026-11-09'), 'Weekly Recurring').indexOf('lvlup_garbage') < 0, 'Tarik’s prior week hides the garbage task');

const SUE_CLEAN = [
  ['fd_dust_proshop', 'Dust the pro shop'],
  ['fd_lobby_floors', 'Maintain the lobby and hallway floors'],
  ['fd_lobby_windows', 'Clean the lobby windows'],
];
const sueToday = dailyTasksForDate('sueK', '2026-11-17');
const sueIds = ids(sueToday);
SUE_CLEAN.forEach(([id, text]) => {
  const row = sueToday.find(t => t.id === id);
  check(row && row.text === text, 'Waunakee front desk daily includes ' + text);
});
check(sueIds.indexOf('ph_bathroom') >= 0 && sueIds.indexOf('fd_dust_proshop') === sueIds.indexOf('ph_bathroom') + 1, 'cleaning tasks follow the bathroom photo');
check(sueIds.indexOf('fd_lobby_windows') + 1 === sueIds.indexOf('fd_next_shift'), 'cleaning tasks come before the handoff');
check(!has(dailyTasksForDate('sueK', '2026-11-10'), 'fd_dust_proshop'), 'Nov 10 Waunakee front desk list leaves the new cleaning tasks off');
['andyR', 'marioS', 'erikaD', 'tarikM'].forEach(emp => {
  SUE_CLEAN.forEach(([id]) => {
    check(!has(dailyTasksForDate(emp, '2026-11-17'), id), emp + ' does not get ' + id);
  });
});
const sueCleanSheet = sheet('sueK', '2026-11-17');
const sueCleanDaily = section(sueCleanSheet, 'Daily Responsibilities');
SUE_CLEAN.forEach(([id, text]) => {
  check(sueCleanDaily.indexOf('data-task-id="' + id + '"') >= 0 && sueCleanDaily.indexOf(text) >= 0, 'Waunakee daily sheet shows ' + text);
});
check(section(sueCleanSheet, 'Weekly Responsibilities').indexOf('fd_dust_proshop') < 0, 'cleaning tasks stay off the weekly front desk list');

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
  const page = (title, body, keepAll) => `<!doctype html>
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
${keepAll ? '' : `<script>
document.querySelectorAll('[data-sheet]').forEach(root => {
  root.querySelectorAll('.bonus-tracker').forEach(el => el.remove());
  root.querySelectorAll('.task-section').forEach(sec => {
    const label = (sec.querySelector('h3') || {}).textContent || '';
    if (label.indexOf('Daily') < 0 && label.indexOf('Weekly') < 0) sec.remove();
  });
});
</script>`}
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

  state.tasksData.bryanG = {};
  fs.writeFileSync(path.join(previewDir, 'proof-fields.html'), page(
    'Verona (Bryan) — Monday, November 16, 2026 — proof fields',
    sheet('bryanG', '2026-11-16'),
    true
  ));
  state.tasksData.sueK = {};
  fs.writeFileSync(path.join(previewDir, 'proof-frontdesk.html'), page(
    'Waunakee front desk — Tuesday, November 17, 2026 — None today',
    sheet('sueK', '2026-11-17')
  ));
  state.tasksData.tarikM = {};
  fs.writeFileSync(path.join(previewDir, 'tarik-garbage.html'), page(
    'Waunakee (Tarik) — Tuesday, November 17, 2026 — weekly garbage',
    sheet('tarikM', '2026-11-17')
  ));
  state.tasksData.sueK = {};
  fs.writeFileSync(path.join(previewDir, 'sue-cleaning.html'), page(
    'Waunakee (Front Desk) — Tuesday, November 17, 2026 — daily cleaning',
    sheet('sueK', '2026-11-17')
  ));

  state.tasksLoc = 'joeyZ';
  state.tasksDate = '2026-11-16';
  state.tasksData.joeyZ = { daily: { '2026-11-16': {
    rosters: { ts: Date.now(), proofV: 1, burst: true, notes: 'Tigers 8, Kids 12. No new / no trials' },
    j_wetmop: { ts: Date.now(), proofV: 1, burst: true },
    j_spray: { ts: Date.now(), proofV: 1, burst: true },
    closing: { ts: Date.now(), proofV: 1, burst: true, trials: 1, enrollments: 0, notes: 'Parent asked about testing.' },
  } } };
  fs.writeFileSync(path.join(previewDir, 'needs-review.html'), page(
    'DeForest (Joey) — Monday, November 16, 2026 — needs review',
    sheet('joeyZ', '2026-11-16')
  ));
  dashAuth.isAdmin = true;
  state.tasksTab = 'sheets';
  state.clockGate = {};
  state.tasksData.joeyZ = { daily: { '2026-11-16': {} } };
  fs.writeFileSync(path.join(previewDir, 'joey-floor.html'), page(
    'DeForest (Joey) — floor photo covers the mop, clock-in gate off',
    sheet('joeyZ', '2026-11-16'),
    true
  ));
  dashAuth.isAdmin = false;

  state.tasksTab = 'history';
  state.historyFocus = { empId: 'joeyZ', dateKey: '2026-11-16' };
  state.historyWeekOff = 0;
  state.historyData['joeyZ|2026-11-16'] = {
    done: 1,
    total: 8,
    dayOff: false,
    needsReview: true,
    items: [
      { id: 'opening', text: 'Open the school', verified: true, rec: { ts: Date.now() - 3600000, proofV: 1, photos: ['data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect fill="#dbeafe" width="80" height="80"/><text x="8" y="44" font-size="12" fill="#1e3a8a">station</text></svg>')] } },
      { id: 'stoplight', text: 'Reach 2 students on the stoplight', verified: true, rec: { ts: Date.now() - 3500000, proofV: 1, auto: true, count: 2, notes: 'Bonnie Templeton (Postcard·JZ), Maria Kanteh (Loom·JZ)' } },
      { id: 'rosters', text: 'Check today rosters', verified: false, rec: { ts: Date.now() - 8000, proofV: 1, burst: true, notes: 'Tigers 8, Kids 12. No new / no trials' } },
      { id: 'j_wetmop', text: 'Wet-mop the floor (Monday)', verified: false, rec: { ts: Date.now() - 5000, proofV: 1, burst: true } },
      { id: 'j_spray', text: 'Spray-mop the floor', verified: false, rec: { ts: Date.now() - 2000, proofV: 1, burst: true } },
      { id: 'closing', text: 'Close the school', verified: false, rec: { ts: Date.now(), proofV: 1, burst: true, trials: 1, enrollments: 0, notes: 'Parent asked about testing.' } },
    ],
  };
  const historyHtml = renderTasksPage();
  fs.writeFileSync(path.join(previewDir, 'manager-proof.html'), page(
    'Tasks history — manager proof view (mock)',
    historyHtml,
    true
  ));
  state.tasksTab = 'sheets';
  state.historyFocus = null;
  console.log('Wrote previews to ' + previewDir);
}
