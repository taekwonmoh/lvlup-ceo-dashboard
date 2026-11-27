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

const proofKindOf = grab('proofKindOf');
const taskForProof = grab('taskForProof');
const rosters = dailyTasksForDate('ash', '2026-11-16').find(t => t.id === 'rosters');
check(proofKindOf(rosters) === 'check', 'rosters is a plain checkoff');
check(taskBonusComplete(rosters, { ts: 1 }), 'a pre-proof roster check still counts');
check(taskBonusComplete(rosters, { ts: 2, proofV: 1 }), 'a roster checkoff counts with one click and no note');
check(taskBonusComplete(rosters, { ts: 3, proofV: 1, notes: '   ' }), 'a blank roster note does not block the checkoff');

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

state.tasksLoc = 'ash';
state.tasksDate = '2026-11-16';
state._proofNow = '2026-11-16T18:00:00Z';
state.tasksData.ash = state.tasksData.ash || {};
state.tasksData.ash.weekly = {};
sandbox.__writes.length = 0;
['schedule', 'dots', 'lifelinks', 'bday_report', 'events_promote'].forEach(id => completeTask('weekly', id));
const checkWeek = getTaskWeekKey('2026-11-16');
const checkLive = (state.tasksData.ash.weekly || {})[checkWeek] || {};
check(['schedule', 'dots', 'lifelinks', 'bday_report', 'events_promote'].every(id => checkLive[id] && checkLive[id].proofV === 1 && !checkLive[id].burst && taskBonusComplete(weeklyTasksFor('ash', checkWeek).find(t => t.id === id), checkLive[id])), 'five checkoffs inside 60 seconds are not flagged and each one counts');
check(sandbox.__writes.every(w => String(w.path).indexOf('/burst') < 0 && String(w.path).indexOf('needsReview') < 0), 'checkoff clicks do not write a burst flag');

state.tasksData.ash.cycle_checklist = {};
const commitTask = grab('commitTask');
['cc_upgrades', 'cc_w3_attn', 'cc_w5_attn', 'cc_bday'].forEach(id => commitTask('cycle_checklist', id, { ts: Date.now(), proofV: 1, notes: 'Sam\nRiley' }));
const cycleKey = grab('getCycleChecklistKey')();
const cycleLive = state.tasksData.ash.cycle_checklist[cycleKey];
check(['cc_upgrades', 'cc_w3_attn', 'cc_w5_attn', 'cc_bday'].every(id => cycleLive[id] && cycleLive[id].burst), 'four proof saves inside 60 seconds are still flagged');
check(!taskBonusComplete(grab('getCycleChecklist')('ash').find(t => t.id === 'cc_upgrades'), cycleLive.cc_upgrades), 'an unconfirmed proof burst does not count');
cycleLive.cc_upgrades.burstOk = true;
check(taskBonusComplete(grab('getCycleChecklist')('ash').find(t => t.id === 'cc_upgrades'), cycleLive.cc_upgrades), 'confirming one burst item counts that item');
check(sandbox.__writes.every(w => String(w.path).indexOf('tasks/emp/') >= 0), 'burst writes stay on task paths');
state.tasksData.joeyZ = state.tasksData.joeyZ || { daily: {} };
state.tasksData.joeyZ.daily = state.tasksData.joeyZ.daily || {};
state.tasksData.joeyZ.daily['2026-11-16'] = state.tasksData.joeyZ.daily['2026-11-16'] || {};
state.tasksLoc = 'joeyZ';
state._proofNow = null;

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
state._proofNow = '2026-11-17T18:00:00Z';
if (!state.tasksData.sueK) state.tasksData.sueK = {};
state.tasksData.sueK.daily = { '2026-11-17': {} };
const beforeClick = sandbox.__writes.length;
completeTask('daily', 'fd_messages');
const clickWrite = sandbox.__writes[sandbox.__writes.length - 1];
const inboxTask = dailyTasksForDate('sueK', '2026-11-17').find(t => t.id === 'fd_messages');
check(sandbox.__writes.length > beforeClick && clickWrite.val && clickWrite.val.proofV === 1 && !clickWrite.val.notes, 'one click completes the inbox checkoff');
check(taskBonusComplete(inboxTask, clickWrite.val), 'the inbox checkoff counts toward the bonus');
const followTask = dailyTasksForDate('sueK', '2026-11-17').find(t => t.id === 'fd_followups');
completeTask('daily', 'fd_followups');
const followRec = state.tasksData.sueK.daily['2026-11-17'].fd_followups;
check(followRec && followRec.proofV === 1 && !followRec.notes && !followRec.burst && taskBonusComplete(followTask, followRec), 'follow-ups complete with one click and an empty note does not block them');
completeTaskWithNotes('daily', 'fd_followups', 'Nguyen family — call about a belt');
const followNoted = state.tasksData.sueK.daily['2026-11-17'].fd_followups;
check(followNoted && followNoted.notes === 'Nguyen family — call about a belt' && taskBonusComplete(followTask, followNoted), 'an optional follow-up note saves and the task stays complete');
const lobby = dailyTasksForDate('sueK', '2026-11-17').find(t => t.id === 'fd_lobby');
check(!taskBonusComplete(lobby, { ts: 1, proofV: 1 }), 'the lobby photo still requires a photo');
check(taskBonusComplete(lobby, { ts: 1, proofV: 1, photos: ['http://example.test/lobby.jpg'] }), 'a lobby photo completes the reset');
const closingKept = dailyTasksForDate('ash', '2026-11-16').find(t => t.id === 'closing');
check(!taskBonusComplete(closingKept, { ts: 1, proofV: 1, notes: 'all set' }), 'closing still needs trials and enrollments');
check(taskBonusComplete(closingKept, { ts: 1, proofV: 1, trials: 0, enrollments: 0 }), 'closing counts when both numbers are saved, including zero');
const gnClose = dailyTasksForDate('mirandaS', '2026-11-16').find(t => t.id === 'closing');
check(proofKindOf(gnClose) === 'photo' && taskBonusComplete(gnClose, { ts: 1, proofV: 1, photos: ['u'] }) && !taskBonusComplete(gnClose, { ts: 1, proofV: 1, notes: 'All clear' }), 'Go Ninja closing keeps the photo and the note is optional');
const gnWeek = grab('getCycleTasks')('mirandaS');
const gnAnnounce = taskForProof('cycle', gnWeek[1].tasks.find(t => t.id === 'w1a1'));
const gnSign = taskForProof('cycle', gnWeek[2].tasks.find(t => t.id === 'w2a1'));
const gnClean = taskForProof('cycle', gnWeek[1].tasks.find(t => t.id === 'w1c1'));
check(proofKindOf(gnAnnounce) === 'check' && proofKindOf(gnSign) === 'check', 'Go Ninja cycle rows that used to guess a note are explicit checkoffs');
const gnCleanIds = ['w1c1', 'w2c1', 'w3c1', 'w4c1', 'w5c1', 'w6c1', 'w7c1'];
check(gnCleanIds.every(id => {
  let task = null;
  Object.keys(gnWeek).forEach(w => {
    const found = (gnWeek[w].tasks || []).find(t => t.id === id);
    if (found) task = taskForProof('cycle', found);
  });
  return proofKindOf(task) === 'check' && taskBonusComplete(task, { ts: 1, proofV: 1 }) && !/photo|snap|note required/i.test(task.text || '');
}), 'Go Ninja deep-clean rows are one-click checkoffs and do not ask for a photo');
check(proofKindOf(gnClean) === 'check', 'w1c1 no longer turns the word clean into a photo');
const gnReset = taskForProof('cycle', gnWeek[8].tasks.find(t => t.id === 'w8c1'));
check(proofKindOf(gnReset) === 'check', 'the week-8 facility reset stays a checkoff');
const lvlupClean = taskForProof('cycle', grab('getCycleTasks')('ash')[1].tasks.find(t => t.id === 'w1c1'));
check(proofKindOf(lvlupClean) === 'photo', 'LVLUP cycle cleaning rows still ask for a photo');

const getMonthlyTasks = grab('getMonthlyTasks');
const getCycleChecklist = grab('getCycleChecklist');
const burstSkip = grab('burstSkip');
const proofUseNone = grab('proofUseNone');
const saveOptionalTaskNote = grab('saveOptionalTaskNote');
function taskBy(list, id) { return (list || []).find(t => t.id === id); }
function kindOf(task) { return proofKindOf(task); }

const mDay = '2026-11-16';
const mDaily = dailyTasksForDate('mirandaS', mDay);
check(kindOf(taskBy(mDaily, 'opening')) === 'photo' && !taskBonusComplete(taskBy(mDaily, 'opening'), { ts: 1, proofV: 1 }), 'Miranda’s open still needs a photo');
check(kindOf(taskBy(mDaily, 'ph_bathroom')) === 'photo', 'Miranda’s Monday bathroom photo stays');
check(kindOf(taskBy(mDaily, 'ph_floor')) === 'check' && taskBonusComplete(taskBy(mDaily, 'ph_floor'), { ts: 1, proofV: 1 }) && !/photo|snap/i.test(taskBy(mDaily, 'ph_floor').text), 'Miranda’s gym floor counts on click and does not ask for a photo');
const mWeekTasks = weeklyTasksFor('mirandaS', getTaskWeekKey(mDay));
check(kindOf(taskBy(mWeekTasks, 'm_mop_mats')) === 'photo' && kindOf(taskBy(mWeekTasks, 'm_party_reset')) === 'photo', 'Miranda still photographs mats and the party reset');
check(kindOf(taskBy(mWeekTasks, 'm_party_cleanup')) === 'photoOrNone', 'party breakdown stays a photo or no-party choice');
check(kindOf(taskBy(mWeekTasks, 'ph_station')) === 'check' && kindOf(taskBy(mWeekTasks, 'ph_signage')) === 'check', 'Miranda’s station and signage are checkoffs');
check(kindOf(taskBy(mWeekTasks, 'cc_content')) === 'posts', 'Miranda still uploads 3 pieces of content');
check(!/photo|snap/i.test(taskBy(mWeekTasks, 'ph_station').text + taskBy(mWeekTasks, 'ph_signage').text), 'Miranda’s simplified weekly rows do not ask for a photo');
const partyTask = taskBy(mWeekTasks, 'm_party_cleanup');
check(taskBonusComplete(partyTask, { ts: 1, proofV: 1, photos: ['u'] }), 'a party photo completes the breakdown without a note');
check(!taskBonusComplete(partyTask, { ts: 1, proofV: 1, notes: 'wiped the tables' }), 'a note alone does not complete the party breakdown');
check(taskBonusComplete(partyTask, { ts: 1, proofV: 1, none: true, notes: 'No party this week' }), 'No party this week completes the breakdown');
check(taskBonusComplete(partyTask, { ts: 1, proofV: 1, photos: ['u'], notes: 'confetti in the rug' }), 'an optional party note does not block the photo');
const nonePayload = { ts: Date.now(), proofV: 1, none: true, notes: 'No party this week' };
check(burstSkip(partyTask, nonePayload) === true, 'No party this week does not count toward burst review');
check(burstSkip(partyTask, { ts: 1, proofV: 1, notes: 'tables wiped' }) === true, 'an optional party note does not count toward burst review');
check(burstSkip(partyTask, { ts: 1, proofV: 1, photos: ['u'] }) === true, 'the party photo does not count toward burst review');

state.tasksLoc = 'mirandaS';
state.tasksDate = mDay;
state._proofNow = '2026-11-16T18:00:00Z';
if (!state.tasksData.mirandaS) state.tasksData.mirandaS = {};
state.tasksData.mirandaS.daily = state.tasksData.mirandaS.daily || {};
state.tasksData.mirandaS.weekly = state.tasksData.mirandaS.weekly || {};
const partyWeek = getTaskWeekKey(mDay);
const beforeMiranda = sandbox.__writes.length;
completeTask('daily', 'ph_floor');
completeTask('weekly', 'ph_station');
completeTask('weekly', 'ph_signage');
proofUseNone('weekly', 'm_party_cleanup');
const mLiveDay = state.tasksData.mirandaS.daily[mDay];
const mLiveWeek = state.tasksData.mirandaS.weekly[partyWeek];
check(mLiveDay.ph_floor && mLiveDay.ph_floor.proofV === 1 && !mLiveDay.ph_floor.burst && taskBonusComplete(taskBy(mDaily, 'ph_floor'), mLiveDay.ph_floor), 'Miranda’s floor click counts and is not flagged');
check(mLiveWeek.ph_station && mLiveWeek.ph_signage && !mLiveWeek.ph_station.burst && !mLiveWeek.ph_signage.burst, 'Miranda’s station and signage clicks are not flagged');
check(mLiveWeek.m_party_cleanup && mLiveWeek.m_party_cleanup.none && !mLiveWeek.m_party_cleanup.burst && taskBonusComplete(partyTask, mLiveWeek.m_party_cleanup), 'saving No party this week counts and is not flagged');
check(sandbox.__writes.slice(beforeMiranda).every(w => String(w.path).indexOf('/burst') < 0 && String(w.path).indexOf('needsReview') < 0), 'Miranda’s checkoffs and No party this week do not write a burst flag');
setEl('notes_weekly_m_party_cleanup', 'tables wiped');
saveOptionalTaskNote('weekly', 'm_party_cleanup', { explicit: true });
check(mLiveWeek.m_party_cleanup.notes === 'tables wiped' && mLiveWeek.m_party_cleanup.none && !mLiveWeek.m_party_cleanup.burst && taskBonusComplete(partyTask, mLiveWeek.m_party_cleanup), 'a party note can be saved later and the task stays complete');

const keptDaily = ['opening', 'ph_bathroom', 'closing'];
keptDaily.forEach(id => {
  const bryan = taskBy(dailyTasksForDate('bryanG', mDay), id);
  const ash = taskBy(dailyTasksForDate('ash', mDay), id);
  const tarik = taskBy(dailyTasksForDate('tarikM', mDay), id);
  const joey = taskBy(dailyTasksForDate('joeyZ', mDay), id);
  check(kindOf(bryan) === kindOf(ash) && kindOf(bryan) !== 'check', 'Bryan keeps proof on ' + id);
  check(kindOf(ash) === kindOf(tarik) && kindOf(ash) === kindOf(joey), id + ' is unchanged for Ash, Tarik, and Joey');
});
const bClose = taskBy(dailyTasksForDate('bryanG', mDay), 'closing');
check(!/floor photo/i.test(bClose.text) && !taskBonusComplete(bClose, { ts: 1, proofV: 1 }) && taskBonusComplete(bClose, { ts: 1, proofV: 1, trials: 1, enrollments: 0 }), 'Bryan’s closing is still the scorecard and does not mention a floor photo');
check(/floor photo/i.test(taskBy(dailyTasksForDate('ash', mDay), 'closing').text), 'Ash’s closing still points at the floor photo');
const bStop = taskBy(dailyTasksForDate('bryanG', mDay), 'stoplight');
const bFloor = taskBy(dailyTasksForDate('bryanG', mDay), 'ph_floor');
check(!bStop.autoOnly && kindOf(bStop) === 'check' && taskBonusComplete(bStop, { ts: 2, proofV: 1 }), 'Bryan’s stoplight counts on click with no Students-page log');
check(kindOf(bFloor) === 'check' && !/photo|snap/i.test(bFloor.text) && taskBonusComplete(bFloor, { ts: 1, proofV: 1 }), 'Bryan’s training floor counts on click');
['ash', 'tarikM', 'joeyZ'].forEach(emp => {
  const stop = taskBy(dailyTasksForDate(emp, mDay), 'stoplight');
  const floor = taskBy(dailyTasksForDate(emp, mDay), 'ph_floor');
  check(!!stop.autoOnly && kindOf(stop) === 'stoplight' && !taskBonusComplete(stop, { ts: 2, proofV: 1, count: 2, notes: '2' }), emp + ' stoplight still requires named Students-page logs');
  check(kindOf(floor) === 'photo' && !taskBonusComplete(floor, { ts: 1, proofV: 1 }) && taskBonusComplete(floor, { ts: 1, proofV: 1, photos: ['u'] }), emp + ' training-floor photo is unchanged');
});
check(kindOf(taskBy(dailyTasksForDate('joeyZ', '2026-11-09'), 'j_wetmop')) === 'linked', 'Joey’s wet-mop still depends on the floor photo');
check(kindOf(taskBy(dailyTasksForDate('joeyZ', '2026-11-13'), 'j_spray')) === 'linked', 'Joey’s spray-mop still depends on the floor photo');

const dustOn = getTaskWeekKey('2026-11-09');
const dustOff = getTaskWeekKey('2026-11-16');
const bDust = taskBy(weeklyTasksFor('bryanG', dustOn), 'dust_displays');
const aDust = taskBy(weeklyTasksFor('ash', dustOn), 'dust_displays');
check(bDust && bDust.every === 8 && kindOf(bDust) === 'check' && !/photo|snap/i.test(bDust.text) && taskBonusComplete(bDust, { ts: 1, proofV: 1 }), 'Bryan dusts on the same weeks without a photo');
check(aDust && kindOf(aDust) === 'photo' && /snap a photo/.test(aDust.text), 'Ash still photographs display dusting');
check(!weeklyTasksFor('bryanG', dustOff).some(t => t.id === 'dust_displays') && !weeklyTasksFor('joeyZ', dustOff).some(t => t.id === 'dust_displays') && !weeklyTasksFor('tarikM', dustOff).some(t => t.id === 'dust_displays'), 'dusting stays off the off-weeks');
['ph_announce', 'ph_station', 'ph_signage', 'ad_invites', 'mia_report', 'new_checkin'].forEach(id => {
  const bryan = taskBy(weeklyTasksFor('bryanG', dustOn), id);
  check(kindOf(bryan) === 'check' && taskBonusComplete(bryan, { ts: 1, proofV: 1 }) && !/snap a photo|names are still required|one-line note/i.test(bryan.text), 'Bryan weekly ' + id + ' counts on click');
  ['ash', 'joeyZ', 'tarikM'].forEach(emp => {
    const task = taskBy(weeklyTasksFor(emp, dustOn), id);
    check(kindOf(task) !== 'check', emp + ' keeps proof on weekly ' + id);
  });
});
check(kindOf(taskBy(weeklyTasksFor('bryanG', dustOn), 'mop_mats')) === 'photo' && kindOf(taskBy(weeklyTasksFor('ash', dustOn), 'mop_mats')) === 'photo', 'mat photos stay for Bryan and Ash');
check(kindOf(taskBy(weeklyTasksFor('bryanG', dustOn), 'cc_content')) === 'posts', 'Bryan still uploads 3 pieces of content');
const tarikAnn = taskBy(weeklyTasksFor('tarikM', dustOn), 'ph_announce');
const bryanAnn = taskBy(weeklyTasksFor('bryanG', dustOn), 'ph_announce');
check(/whiteboard/.test(tarikAnn.text) && /photo/.test(tarikAnn.text) && kindOf(tarikAnn) === 'photo', 'Tarik still photographs the whiteboard');
check(/mirror/.test(bryanAnn.text) && !/photo|snap/i.test(bryanAnn.text), 'Bryan refreshes the mirror without a photo');
check(kindOf(taskBy(getMonthlyTasks('bryanG'), 'lm_sanitize')) === 'check' && taskBonusComplete(taskBy(getMonthlyTasks('bryanG'), 'lm_sanitize'), { ts: 1, proofV: 1 }), 'Bryan’s deep sanitize counts on click');
['ash', 'joeyZ', 'tarikM'].forEach(emp => {
  check(kindOf(taskBy(getMonthlyTasks(emp), 'lm_sanitize')) === 'photo', emp + ' still photographs the deep sanitize');
});
['cc_w1_outreach', 'cc_w3_attn', 'cc_w5_attn', 'cc_bday', 'cc_upgrades'].forEach(id => {
  const bryan = taskBy(getCycleChecklist('bryanG'), id);
  check(kindOf(bryan) === 'check' && !bryan.autoOnly && taskBonusComplete(bryan, { ts: 1, proofV: 1 }), 'Bryan cycle ' + id + ' counts on click');
  ['ash', 'joeyZ', 'tarikM'].forEach(emp => {
    const task = taskBy(getCycleChecklist(emp), id);
    check(kindOf(task) !== 'check' && task.proof && task.proof.kind !== 'check', emp + ' keeps proof on cycle ' + id);
  });
});
check(!!taskBy(getCycleChecklist('ash'), 'cc_w1_outreach').autoOnly && !taskBy(getCycleChecklist('bryanG'), 'cc_w1_outreach').autoOnly, 'only Bryan can check cycle outreach off by hand');

const staleCopy = ['Tigers 7', 'first names', 'note the holes', 'Replaced N', 'Names of students who received', 'Event names and which classes', 'names still open', 'Three short post ideas', 'List the family names'];
const copyTasks = []
  .concat(taskBy(dailyTasksForDate('ash', mDay), 'rosters'))
  .concat(['schedule', 'dots', 'lifelinks', 'events_promote', 'lead_audit', 'social_plan'].map(id => taskBy(weeklyTasksFor('joeyZ', dustOn), id)))
  .concat(taskBy(getMonthlyTasks('tarikM'), 'lm_reviews'));
check(staleCopy.every(phrase => copyTasks.every(t => t.text.indexOf(phrase) < 0)), 'checkoff copy no longer asks for names, counts, or notes');
check(copyTasks.every(t => kindOf(t) === 'check'), 'those rows are still one-click checkoffs');
check(taskBy(weeklyTasksFor('ash', dustOn), 'lead_audit').text === taskBy(weeklyTasksFor('bryanG', dustOn), 'lead_audit').text, 'the shared lead-audit checkoff uses the same wording');

state.tasksLoc = 'bryanG';
state.tasksDate = mDay;
state._proofNow = '2026-11-16T18:00:00Z';
if (!state.tasksData.bryanG) state.tasksData.bryanG = {};
state.tasksData.bryanG.daily = state.tasksData.bryanG.daily || {};
state.tasksData.bryanG.weekly = state.tasksData.bryanG.weekly || {};
const beforeBryanClicks = sandbox.__writes.length;
['stoplight', 'ph_floor'].forEach(id => completeTask('daily', id));
['ph_announce', 'ph_station', 'ph_signage', 'ad_invites', 'mia_report', 'new_checkin'].forEach(id => completeTask('weekly', id));
const bLiveDay = state.tasksData.bryanG.daily[mDay];
const bLiveWeek = state.tasksData.bryanG.weekly[getTaskWeekKey(mDay)];
check(bLiveDay.stoplight && bLiveDay.stoplight.proofV === 1 && !bLiveDay.stoplight.notes && !bLiveDay.stoplight.burst && taskBonusComplete(bStop, bLiveDay.stoplight), 'Bryan’s stoplight click counts with an empty note');
check(bLiveDay.ph_floor && !bLiveDay.ph_floor.burst && taskBonusComplete(bFloor, bLiveDay.ph_floor), 'Bryan’s floor click counts');
check(['ph_announce', 'ph_station', 'ph_signage', 'ad_invites', 'mia_report', 'new_checkin'].every(id => bLiveWeek[id] && bLiveWeek[id].proofV === 1 && !bLiveWeek[id].burst && taskBonusComplete(taskBy(weeklyTasksFor('bryanG', getTaskWeekKey(mDay)), id), bLiveWeek[id])), 'Bryan’s simplified weekly clicks count and are not flagged');
check(sandbox.__writes.slice(beforeBryanClicks).every(w => String(w.path).indexOf('/burst') < 0 && String(w.path).indexOf('needsReview') < 0), 'Bryan’s checkoffs do not write a burst flag');
setEl('notes_weekly_ad_invites', 'Sam and Riley');
saveOptionalTaskNote('weekly', 'ad_invites', { explicit: true });
check(bLiveWeek.ad_invites.notes === 'Sam and Riley' && !bLiveWeek.ad_invites.burst && taskBonusComplete(taskBy(weeklyTasksFor('bryanG', getTaskWeekKey(mDay)), 'ad_invites'), bLiveWeek.ad_invites), 'Bryan can save an optional invite note and the task stays complete');
state.tasksLoc = 'ash';
const beforeAshStop = sandbox.__writes.length;
completeTask('daily', 'stoplight');
check(sandbox.__writes.length === beforeAshStop, 'Ash still cannot check stoplight off by hand');
delete state.tasksData.mirandaS.weekly[partyWeek].m_party_cleanup;
state.tasksCycleWeekManual = true;
state.tasksCycleWeek = 1;
const gnSheet = sheet('mirandaS', mDay);
state.tasksCycleWeekManual = false;
function kindNear(html, id) {
  const at = html.indexOf('data-task-id="' + id + '"');
  if (at < 0) return '';
  const m = html.slice(at, at + 90).match(/data-proof-kind="([^"]+)"/);
  return m ? m[1] : '';
}
check(kindNear(gnSheet, 'ph_floor') === 'check' && kindNear(gnSheet, 'opening') === 'photo' && kindNear(gnSheet, 'closing') === 'photo', 'Miranda’s sheet matches the kept and simplified daily proofs');
check(kindNear(gnSheet, 'ph_station') === 'check' && kindNear(gnSheet, 'm_mop_mats') === 'photo' && kindNear(gnSheet, 'm_party_cleanup') === 'photoOrNone', 'Miranda’s sheet matches the kept and simplified weekly proofs');
check(gnSheet.indexOf('No party this week') >= 0 && gnSheet.indexOf('data-none-option="1"') >= 0 && gnSheet.indexOf('data-optional-note="1"') >= 0, 'party breakdown offers No party this week and an optional note');
check(kindNear(gnSheet, 'w1c1') === 'check' && gnSheet.indexOf('data-task-id="w1c1"') >= 0, 'the week-1 deep clean is a checkoff on Miranda’s sheet');
state._proofNow = null;

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

state._proofNow = '2026-11-18T18:00:00Z';
const monProof = sheet('ash', '2026-11-16');
check(monProof.indexOf('How many today') < 0, 'the stoplight sheet has no manual count box');
check(monProof.indexOf('Students page') >= 0, 'stoplight tells staff to use the Students page');
const rosterAt = monProof.indexOf('data-task-id="rosters"');
check(rosterAt >= 0 && monProof.slice(rosterAt, rosterAt + 80).indexOf('data-proof-kind="check"') >= 0, 'rosters is a one-click checkoff on the sheet');
const inviteAt = monProof.indexOf('data-task-id="ad_invites"');
check(inviteAt >= 0 && monProof.slice(inviteAt, inviteAt + 120).indexOf('data-proof-kind="lines"') >= 0, 'AD invites still require the two names');
check(monProof.indexOf('data-proof-form="note"') >= 0, 'a kept note task still has its proof field');
check(monProof.indexOf('counts a checkoff task when it is checked') >= 0, 'the bonus note says a checkoff counts when it is checked');
check(monProof.indexOf('Invite birthday families') >= 0, 'weekly birthday task stays on the sheet');
const bdayAt = monProof.indexOf('data-task-id="bday_report"');
check(bdayAt >= 0 && monProof.slice(bdayAt, bdayAt + 90).indexOf('data-proof-kind="check"') >= 0, 'birthday invites are a checkoff');
check(monProof.indexOf('Book a party') >= 0 && monProof.indexOf('Ava') >= 0, 'a saved party booking shows the child name');
const bryanProof = sheet('bryanG', '2026-11-16');
check(kindNear(monProof, 'cc_bday') === 'bookings' && monProof.indexOf('Ava') >= 0, 'Ash still logs two parties on Book a party');
check(bryanProof.indexOf('data-task-id="cc_bday"') >= 0 && bryanProof.indexOf('data-proof-form="bookings"') < 0, 'Bryan checks off Book a party without the booking form');
check(kindNear(monProof, 'ph_floor') === 'photo' && kindNear(monProof, 'stoplight') === 'stoplight', 'Ash’s sheet still requires the floor photo and Students-page stoplight');
check(kindNear(bryanProof, 'ph_floor') === 'check' && kindNear(bryanProof, 'stoplight') === 'check', 'Bryan’s floor and stoplight are checkoffs on the sheet');
check(kindNear(bryanProof, 'opening') === 'photo' && kindNear(bryanProof, 'closing') === 'scorecard' && kindNear(bryanProof, 'mop_mats') === 'photo', 'Bryan’s sheet keeps the open, close, and mat proofs');
function taskSlice(html, id) {
  const at = html.indexOf('data-task-id="' + id + '"');
  if (at < 0) return '';
  const next = html.indexOf('data-task-id="', at + 20);
  return html.slice(at, next < 0 ? html.length : next);
}
const bryanStop = taskSlice(bryanProof, 'stoplight');
check(bryanStop.indexOf('Students page') < 0 && bryanStop.indexOf('data-optional-note="1"') >= 0, 'Bryan’s stoplight has an optional note and no Students-page box');
check(monProof.indexOf('data-task-id="ph_bathroom"') >= 0, 'Monday bathroom photo is still on the lead sheet');
check(monProof.indexOf('data-task-id="ph_floor"') >= 0, 'training floor photo is still daily');

const deskNew = sheet('sueK', '2026-11-17');
check(deskNew.indexOf('data-task-id="fd_questions"') < 0, 'front desk sheet no longer lists the question checkbox');
const msgAt = deskNew.indexOf('data-task-id="fd_messages"');
check(msgAt >= 0 && deskNew.slice(msgAt, msgAt + 90).indexOf('data-proof-kind="check"') >= 0, 'the inbox task is a one-click checkoff');
check(deskNew.indexOf('data-optional-note="1"') >= 0, 'follow-ups and the shift handoff show an optional note');
check(deskNew.indexOf('Nguyen family — call about a belt') >= 0, 'a saved follow-up note shows on the card');
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
state.historyFocus = { empId: 'sueK', dateKey: '2026-11-17' };
state.historyData['sueK|2026-11-17'] = {
  done: 1,
  total: 1,
  dayOff: false,
  needsReview: false,
  items: [
    { id: 'fd_followups', text: 'Log follow-ups', verified: true, rec: { ts: Date.now(), proofV: 1, notes: 'Nguyen family — call about a belt' } },
  ],
};
check(renderTasksPage().indexOf('Nguyen family — call about a belt') >= 0, 'history shows the optional follow-up note');
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
state._proofNow = '2026-11-16T18:00:00Z';
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

// Weekly note fields are redrawn on every Firebase update. A typed note has to
// survive that redraw, then save when the field is left, for every instructor.
const taskFieldScope = grab('taskFieldScope');
const taskDraftValue = grab('taskDraftValue');
const captureTaskInputDrafts = grab('captureTaskInputDrafts');
const leaveTaskField = grab('leaveTaskField');
const render = grab('render');
state.taskInputDrafts = {};
state.taskSaveStatus = {};
state.tasksLoc = 'ash';
state.tasksDate = '2026-11-18';
state._proofNow = '2026-11-18T18:00:00Z';
if (!state.tasksData.ash) state.tasksData.ash = {};
state.tasksData.ash.weekly = state.tasksData.ash.weekly || {};
const ashWeekKey = getTaskWeekKey('2026-11-18');
const noteScope = taskFieldScope('notes_weekly_ad_invites');
state.taskInputDrafts.notes_weekly_ad_invites = { scope: noteScope, value: 'Sam\nRiley' };
const draftedSheet = sheet('ash', '2026-11-18');
const draftedWeekly = section(draftedSheet, 'Weekly Recurring');
check(draftedWeekly.indexOf('data-task-id="ad_invites"') >= 0 && draftedWeekly.indexOf('data-task-draft="1"') >= 0, 'Ash weekly note fields keep a draft across a redraw');
check(draftedWeekly.indexOf('Sam') >= 0 && draftedWeekly.indexOf('Riley') >= 0, 'Ash weekly invite note is still on the sheet after a redraw');
check(draftedWeekly.indexOf('data-task-id="mia_report"') >= 0 && draftedWeekly.indexOf('Booster date') >= 0, 'the booster lesson row is one of the weekly fields');
check(draftedWeekly.indexOf('data-proof-kind="check"') >= 0 && draftedWeekly.indexOf('data-task-id="events_promote"') >= 0, 'event promotion is a checkoff on the weekly sheet');
const closeScope = taskFieldScope('notes_daily_closing');
state.taskInputDrafts.notes_daily_closing = { scope: closeScope, value: 'Parent asked about testing' };
const dailyDraft = section(sheet('ash', '2026-11-18'), 'Daily Checklist');
check(dailyDraft.indexOf('Parent asked about testing') >= 0 && dailyDraft.indexOf('data-task-id="closing"') >= 0, 'the closing optional note uses the same draft so a redraw does not clear it');

state.tasksLoc = 'bryanG';
state.tasksDate = '2026-11-18';
if (!state.tasksData.bryanG) state.tasksData.bryanG = {};
const bryanScope = taskFieldScope('notes_weekly_ad_invites');
state.taskInputDrafts.notes_weekly_ad_invites = { scope: bryanScope, value: 'Sam\nRiley' };
const bryanDraft = section(sheet('bryanG', '2026-11-18'), 'Weekly Recurring');
check(bryanDraft.indexOf('Sam') >= 0 && bryanDraft.indexOf('Riley') >= 0, 'another instructor’s weekly note survives the same redraw');

state.tasksLoc = 'ash';
state.tasksDate = '2026-11-18';
const typing = {
  id: 'notes_weekly_ad_invites',
  value: 'Sam\nRiley',
  tagName: 'TEXTAREA',
  style: {},
  selectionStart: 4,
  selectionEnd: 4,
  getAttribute(name) {
    if (name === 'data-task-draft') return '1';
    if (name === 'data-task-section') return 'weekly';
    if (name === 'data-task-id') return 'ad_invites';
    if (name === 'data-task-scope') return taskFieldScope('notes_weekly_ad_invites');
    return null;
  },
  focus() { sandbox.document.activeElement = typing; },
  setSelectionRange() {},
  setAttribute() {},
};
sandbox.document.activeElement = typing;
sandbox.document.__app = sandbox.document.__blankEl();
sandbox.document.__app.innerHTML = 'MARKER';
const prevGet = sandbox.document.getElementById;
sandbox.document.getElementById = function (id) {
  if (id === 'app') return sandbox.document.__app;
  if (id === typing.id) return typing;
  return prevGet(id);
};
const prevQuery = sandbox.document.querySelectorAll;
sandbox.document.querySelectorAll = function (sel) {
  if (sel === '[data-task-draft]') return [typing];
  return [];
};
const writesBeforeReplay = sandbox.__writes.length;
render();
check(sandbox.document.__app.innerHTML === 'MARKER', 'a live update does not redraw the page while a weekly note is focused');
check(typing.value === 'Sam\nRiley', 'the focused weekly note is not cleared by that update');
check(taskDraftValue('notes_weekly_ad_invites') === 'Sam\nRiley', 'the focused note is stored before the redraw is skipped');
check(sandbox.__writes.length === writesBeforeReplay, 'skipping the redraw does not write the unfinished note');
sandbox.document.activeElement = null;
const writesBeforeLeave = sandbox.__writes.length;
leaveTaskField(typing);
const leadWrite = sandbox.__writes.slice(writesBeforeLeave).filter(w => String(w.path).indexOf('/weekly/') >= 0 && String(w.path).indexOf('ad_invites') >= 0).pop();
check(leadWrite && leadWrite.val && leadWrite.val.notes === 'Sam\nRiley' && leadWrite.val.proofV === 1, 'leaving the weekly note saves it');
check(String(leadWrite.path).indexOf('tasks/emp/ash/weekly/' + ashWeekKey + '/ad_invites') >= 0, 'Ash’s weekly note saves on her seat for this week');
const savedSheet = section(sheet('ash', '2026-11-18'), 'Weekly Recurring');
check(savedSheet.indexOf('data-proof-saved="1"') >= 0 && savedSheet.indexOf('Riley') >= 0 && savedSheet.indexOf('data-proof-status="saved"') >= 0, 'the saved weekly note stays visible after the next redraw');

grab('undoTask')('weekly', 'ad_invites');
typing.value = 'Only Sam';
const beforeShort = sandbox.__writes.length;
completeTaskWithNotes('weekly', 'ad_invites');
check(sandbox.__writes.length === beforeShort, 'one name still does not save the two-name weekly invite');
check((state.taskSaveStatus || {})['weekly|ad_invites'] && state.taskSaveStatus['weekly|ad_invites'].kind === 'error', 'a weekly note that fails validation shows an error');
state.taskInputDrafts.notes_weekly_ad_invites = { scope: taskFieldScope('notes_weekly_ad_invites'), value: 'Only Sam' };
check(section(sheet('ash', '2026-11-18'), 'Weekly Recurring').indexOf('Only Sam') >= 0, 'the rejected weekly note is still in the field');

function rowEl(id, value) {
  const el = { id: id, value: value, style: {}, tagName: 'INPUT', focus() {}, setAttribute() {}, getAttribute() { return null; } };
  sandbox.document.__els[id] = el;
  return el;
}
rowEl('pf_weekly_mia_report_0_name', 'Maya Chen');
rowEl('pf_weekly_mia_report_0_date', '2026-11-20');
state.proofRows = state.proofRows || {};
state.proofRows.mia_report = 1;
const beforeBooster = sandbox.__writes.length;
proofSaveStructured('weekly', 'mia_report');
const boosterWrite = sandbox.__writes.slice(beforeBooster).filter(w => String(w.path).indexOf('mia_report') >= 0).pop();
check(boosterWrite && boosterWrite.val && boosterWrite.val.rows && boosterWrite.val.rows[0].name === 'Maya Chen' && boosterWrite.val.rows[0].date === '2026-11-20', 'a booster lesson name and date save');
check(section(sheet('ash', '2026-11-18'), 'Weekly Recurring').indexOf('Maya Chen') >= 0, 'the saved booster lesson is shown after a redraw');

state.taskInputDrafts = {};
state.taskSaveStatus = {};
state._proofNow = null;
sandbox.document.activeElement = null;
sandbox.document.getElementById = prevGet;
sandbox.document.querySelectorAll = prevQuery;

// Optional follow-up note: a live refresh must not drop what is being typed, and
// leaving the box must send that text. A day snapshot that does not contain the
// write yet must not erase it, and a rejected write must say so. Rosters is a
// checkoff now, so this coverage sits on the front-desk optional note.
const applyTaskSnap = grab('applyTaskSnap');
const taskFieldKey = grab('taskFieldKey');
const rememberTaskDraft = grab('rememberTaskDraft');
const undoTask = grab('undoTask');
vm.runInContext('__fbSetRestore = fbSet;', sandbox);
state.tasksLoc = 'sueK';
state.tasksDate = '2026-11-18';
state._proofNow = '2026-11-18T18:00:00Z';
state.taskInputDrafts = {};
state.taskSaveStatus = {};
state.taskPendingWrites = {};
if (!state.tasksData.sueK) state.tasksData.sueK = {};
state.tasksData.sueK.daily = state.tasksData.sueK.daily || {};
state.tasksData.sueK.daily['2026-11-18'] = { fd_messages: { ts: 1, proofV: 1 } };
const roster = {
  id: 'notes_daily_fd_followups',
  value: 'Nguyen family — call about a belt',
  tagName: 'INPUT',
  style: {},
  selectionStart: 8,
  selectionEnd: 8,
  getAttribute(name) {
    if (name === 'data-task-draft') return '1';
    if (name === 'data-task-section') return 'daily';
    if (name === 'data-task-id') return 'fd_followups';
    if (name === 'data-task-scope') return taskFieldScope('notes_daily_fd_followups');
    return null;
  },
  focus() { sandbox.document.activeElement = roster; },
  setSelectionRange(a, b) { roster.selectionStart = a; roster.selectionEnd = b; },
  setAttribute() {},
};
sandbox.document.activeElement = roster;
sandbox.document.__app = sandbox.document.__blankEl();
sandbox.document.__app.innerHTML = 'DAILY-MARKER';
const rosterPrevGet = sandbox.document.getElementById;
sandbox.document.getElementById = function (id) {
  if (id === 'app') return sandbox.document.__app;
  if (id === roster.id) return roster;
  return rosterPrevGet(id);
};
const rosterPrevQuery = sandbox.document.querySelectorAll;
sandbox.document.querySelectorAll = function (sel) {
  if (sel === '[data-task-draft]') return [roster];
  return [];
};
const writesBeforeRoster = sandbox.__writes.length;
render();
check(sandbox.document.__app.innerHTML === 'DAILY-MARKER', 'a live update does not redraw the daily checklist while a proof box is focused');
check(roster.value === 'Nguyen family — call about a belt', 'the focused follow-up note is not cleared by that update');
check(taskDraftValue('notes_daily_fd_followups') === 'Nguyen family — call about a belt', 'the follow-up note is stored before the redraw is skipped');
check(sandbox.__writes.length === writesBeforeRoster, 'skipping the daily redraw does not write the unfinished note');
applyTaskSnap('sueK', 'daily', '2026-11-18', { fd_messages: { ts: 2, proofV: 1 } });
render();
check(roster.value === 'Nguyen family — call about a belt' && sandbox.document.activeElement === roster, 'a day snapshot during typing leaves the follow-up text and focus alone');

// Blur can report an empty box after the letters were already stored.
roster.value = '';
const writesBeforeEmptyBlur = sandbox.__writes.length;
leaveTaskField(roster);
const emptyBlurWrite = sandbox.__writes.slice(writesBeforeEmptyBlur).filter(w => String(w.path).indexOf('/fd_followups') >= 0).pop();
check(emptyBlurWrite && emptyBlurWrite.val && emptyBlurWrite.val.notes === 'Nguyen family — call about a belt' && emptyBlurWrite.val.proofV === 1, 'leaving the follow-up box saves the typed text when the blur value is empty');
check(String(emptyBlurWrite.path) === 'tasks/emp/sueK/daily/2026-11-18/fd_followups', 'the follow-up note is saved on today\'s daily record');

// Hold the write open the way Firebase does, then deliver an older day snapshot.
undoTask('daily', 'fd_followups');
state.tasksData.sueK.daily['2026-11-18'] = { fd_messages: { ts: 1, proofV: 1 } };
state.taskPendingWrites = {};
state.taskInputDrafts = {};
state.taskSaveStatus = {};
roster.value = 'Patel family — gear question';
sandbox.document.__els.notes_daily_fd_followups = roster;
let releaseSave;
const held = new Promise(function (resolve) { releaseSave = resolve; });
const fbSetNow = grab('fbSet');
vm.runInContext('fbSet = function(path, val){ __writes.push({path:path, val:val}); return __held; };', sandbox);
sandbox.__held = { then(ok) { held.then(ok); } };
const writesBeforeEnter = sandbox.__writes.length;
const enterEvent = { key: 'Enter', defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
taskFieldKey(enterEvent, roster);
const enterWrite = sandbox.__writes.slice(writesBeforeEnter).filter(w => String(w.path).indexOf('/fd_followups') >= 0).pop();
check(enterEvent.defaultPrevented, 'Enter in a follow-up box does not submit the page');
check(enterWrite && enterWrite.val && enterWrite.val.notes === 'Patel family — gear question', 'Enter saves the optional follow-up note');
applyTaskSnap('sueK', 'daily', '2026-11-18', { fd_messages: { ts: 3, proofV: 1 } });
const heldRec = state.tasksData.sueK.daily['2026-11-18'].fd_followups;
check(heldRec && heldRec.notes === 'Patel family — gear question' && heldRec.proofV === 1, 'a day snapshot without the new note does not drop it');
const heldSheet = section(sheet('sueK', '2026-11-18'), 'Daily Responsibilities');
check(heldSheet.indexOf('data-proof-saved="1"') >= 0 && heldSheet.indexOf('Patel family — gear question') >= 0 && heldSheet.indexOf('data-proof-status="saved"') >= 0, 'the follow-up card stays saved, with the typed text, after that snapshot');
check(heldSheet.indexOf('Saved ·') >= 0, 'the saved follow-up note shows a timestamp');
releaseSave();
await held;
vm.runInContext('fbSet = __fbSetRestore;', sandbox);

// Rejected write: the text stays on the card and the error is visible.
state.taskPendingWrites = {};
state.taskSaveStatus = {};
undoTask('daily', 'fd_followups');
state.tasksData.sueK.daily['2026-11-18'] = {};
roster.value = 'Teens 4';
state.taskInputDrafts = {};
rememberTaskDraft(roster);
vm.runInContext('fbSet = function(){ return { then: function(ok, bad){ Promise.resolve().then(function(){ bad(new Error("permission_denied")); }); } }; };', sandbox);
const writesBeforeReject = sandbox.__writes.length;
completeTaskWithNotes('daily', 'fd_followups', 'Teens 4');
await Promise.resolve();
check(sandbox.__writes.length === writesBeforeReject, 'a rejected follow-up save does not count as a stored write');
check(state.taskSaveStatus['daily|fd_followups'] && state.taskSaveStatus['daily|fd_followups'].kind === 'error' && /could not save/i.test(state.taskSaveStatus['daily|fd_followups'].text), 'a rejected follow-up save shows an error');
const rejectedSheet = section(sheet('sueK', '2026-11-18'), 'Daily Responsibilities');
check(rejectedSheet.indexOf('Teens 4') >= 0 && rejectedSheet.indexOf('data-proof-saved="1"') < 0, 'the rejected follow-up text stays in the box');
vm.runInContext('fbSet = __fbSetRestore;', sandbox);
sandbox.document.getElementById = prevGet;
sandbox.document.querySelectorAll = prevQuery;
sandbox.document.activeElement = null;
state.taskPendingWrites = {};
state._proofNow = null;

// Ash, Wed Nov 25 2026: Capture Content stays open when the photos live only on
// the Content tab. A week snapshot can omit cc_content. East Madison uploads
// are stored under her email or the school name, and a late Central evening
// falls on the next UTC date. Completion is computed from those records.
const contentWeekFromTime = grab('contentWeekFromTime');
const contentCanonLoc = grab('contentCanonLoc');
const taskPostsFilled = grab('taskPostsFilled');
const taskSheetDone = grab('taskSheetDone');
const mergedContentUploads = grab('mergedContentUploads');
const contentWeek = getTaskWeekKey('2026-11-25');
const contentTask = weeklyTasksFor('ash', contentWeek).find(t => t.id === 'cc_content');
const ashEvening = Date.parse('2026-11-26T02:14:00Z');
const sundayNight = Date.parse('2026-11-30T02:14:00Z');
function contentPhoto(id, extra) {
  return Object.assign({
    url: 'https://example.test/content/' + id + '.jpg',
    type: 'image',
    status: 'uploaded',
    at: ashEvening,
    caption: 'East Madison class',
  }, extra || {});
}
function contentSet(make) {
  const bag = {};
  [1, 2, 3].forEach(n => { bag['cs_ash_' + n] = make(n); });
  state.contentSubmissions = bag;
}
check(contentWeek === '2026-W48', 'Nov 25 2026 is task week 2026-W48');
check(contentWeekFromTime(ashEvening) === contentWeek, 'Wed 8:14pm CT stays in this task week');
check(contentWeekFromTime(sundayNight) === contentWeek, 'Sun 8:14pm CT stays in this task week, not Monday UTC');
check(contentCanonLoc('East Madison') === 'eastmad' && contentCanonLoc('eastmadison') === 'eastmad' && contentCanonLoc('east_madison') === 'eastmad', 'East Madison school names map to eastmad');

state.tasksLoc = 'ash';
state.tasksDate = '2026-11-25';
state.tasksData.ash = { weekly: { [contentWeek]: {} } };
contentSet(n => contentPhoto(n, { uploaderId: 'ash', empId: 'ash', school: 'eastmad', brand: 'LVLUP', week: contentWeek }));
check(taskPostsFilled(contentTask, null) === 3, 'three Content-tab uploads count with no checklist row');
check(taskSheetDone('weekly', contentTask, null) && taskBonusComplete(contentTask, null), 'the task checks off from those uploads');
check(!weeklyRequiredStatus('ash', contentWeek).missing.some(t => t.id === 'cc_content'), 'week sign-off counts Capture Content from the uploads');
let contentSheet = sheet('ash', '2026-11-25');
check(contentSheet.indexOf('class="task-item done" data-task-id="cc_content"') >= 0, 'the Capture Content row is marked done');
check(contentSheet.indexOf('task-check checked') >= 0 && contentSheet.indexOf('3/3 uploaded') >= 0, 'the check and the 3/3 count are green');
check(contentSheet.indexOf('data-upload-count="3"') >= 0, 'the Content tab count is 3');

applyTaskSnap('ash', 'weekly', contentWeek, { schedule: { ts: 1, proofV: 1 } });
check(!((state.tasksData.ash.weekly[contentWeek] || {}).cc_content), 'a week snapshot can omit the content row');
check(taskSheetDone('weekly', contentTask, null) && !weeklyRequiredStatus('ash', contentWeek).missing.some(t => t.id === 'cc_content'), 'the snapshot does not uncheck content that is already uploaded');

contentSet(n => contentPhoto(n, { uploaderId: 'amouille.lvlupma@gmail.com', school: 'eastmad' }));
state.tasksData.ash.weekly[contentWeek] = {};
check(taskSheetDone('weekly', contentTask, null) && mergedContentUploads('bryanG', contentWeek, {}).filter(r => r._thisWeek).length === 0, 'Ash’s email counts for her and not for Verona');

contentSet(n => contentPhoto(n, { school: 'East Madison', brand: 'LVLUP', status: 'Uploaded' }));
check(taskSheetDone('weekly', contentTask, null), 'East Madison uploads with Uploaded status complete Ash’s task');
check(mergedContentUploads('bryanG', contentWeek, {}).filter(r => r._thisWeek).length === 0, 'those East Madison uploads stay off Bryan’s sheet');

contentSet(n => contentPhoto(n, { uploaderId: 'bein', school: 'eastmadison' }));
check(taskPostsFilled(contentTask, null) === 3, 'Ash’s scorecard id bein still counts');

contentSet(n => contentPhoto(n, { uploaderId: 'ash', school: 'eastmad', at: sundayNight }));
check(taskSheetDone('weekly', contentTask, null, { empId: 'ash', weekKey: contentWeek }), 'a Sunday night CT upload still completes this week');
check(!taskSheetDone('weekly', contentTask, null, { empId: 'ash', weekKey: getTaskWeekKey('2026-11-30') }), 'that Sunday night upload does not complete the next week');

state.contentSubmissions = {
  cs_one: contentPhoto(1, { uploaderId: 'ash', school: 'eastmad', week: contentWeek }),
  cs_two: contentPhoto(2, { uploaderId: 'ash', school: 'eastmad', week: contentWeek }),
};
check(!taskSheetDone('weekly', contentTask, null) && weeklyRequiredStatus('ash', contentWeek).missing.some(t => t.id === 'cc_content'), 'two uploads leave Capture Content open');

state.contentSubmissions.cs_bad = contentPhoto(3, { uploaderId: 'ash', school: 'eastmad', week: contentWeek, status: 'rejected' });
check(!taskSheetDone('weekly', contentTask, null), 'a rejected upload does not fill the third spot');

state.contentSubmissions = {
  cs_ninja: contentPhoto(1, { uploaderId: 'mirandaS', school: 'goninjaW', brand: 'GO NINJA', week: contentWeek }),
  cs_ninja2: contentPhoto(2, { uploaderId: 'mirandaS', school: 'goninjaW', brand: 'GO NINJA', week: contentWeek }),
  cs_ninja3: contentPhoto(3, { uploaderId: 'mirandaS', school: 'goninjaW', brand: 'GO NINJA', week: contentWeek }),
};
check(!taskSheetDone('weekly', contentTask, null), 'Go Ninja uploads do not complete the LVLUP task');

state.contentSubmissions = {};
state.tasksData.ash.weekly[contentWeek] = { cc_content: { ts: 1 } };
check(taskBonusComplete(contentTask, { ts: 1 }) && !taskSheetDone('weekly', contentTask, { ts: 1 }), 'an old content row with no uploads still counts in bonus history and stays unchecked on the sheet');
state.contentSubmissions = {};

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
  state._proofNow = '2026-11-17T18:00:00Z';
  state.taskSaveStatus = {};
  state.taskInputDrafts = {};
  state.tasksData.sueK = { daily: { '2026-11-17': {
    fd_messages: { ts: Date.now() - 60000, proofV: 1 },
    fd_followups: { ts: Date.now() - 30000, proofV: 1, notes: 'Nguyen family — call about a belt' },
    fd_gear: { ts: Date.now() - 20000, proofV: 1 },
  } } };
  fs.writeFileSync(path.join(previewDir, 'proof-frontdesk.html'), page(
    'Waunakee front desk — Tuesday, November 17, 2026 — checkoffs and optional notes',
    sheet('sueK', '2026-11-17')
  ));
  state._proofNow = null;
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
