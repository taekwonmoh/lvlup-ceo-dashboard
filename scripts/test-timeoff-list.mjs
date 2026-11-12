/**
 * Time-off request list. Approved rows are hidden from the Schedule list
 * until Show approved is on. Records stay in memory; rendering does not write.
 *
 *   node scripts/test-timeoff-list.mjs
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
  document: {
    getElementById() { return makeEl(); },
    createElement() { return makeEl(); },
    addEventListener() {},
    documentElement: { style: {} },
    body: { appendChild() {} },
  },
  navigator: { userAgent: 'timeoff-list-test' },
  location: { hash: '', hostname: '', search: '', origin: 'http://localhost', pathname: '/index.html' },
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
  requestAnimationFrame() { return 0; },
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
const renderTcTimeoff = grab('renderTcTimeoff');
const renderTcPto = grab('renderTcPto');
const renderTcSchedule = grab('renderTcSchedule');
const renderOpsPage = grab('renderOpsPage');
const tcPendingTimeoffCount = grab('tcPendingTimeoffCount');
const tcToggleShowApproved = grab('tcToggleShowApproved');
const tcTimeoffDecision = grab('tcTimeoffDecision');
const tcSchedDays = grab('tcSchedDays');
const tcDateKey = grab('tcDateKey');

let failed = 0;
let passed = 0;
function check(cond, msg) {
  if (cond) { passed++; return; }
  failed++;
  console.error('FAIL: ' + msg);
}
function idsIn(html, bucket) {
  const re = new RegExp('data-timeoff-bucket="' + bucket + '"[^>]*data-timeoff-id="([^"]+)"|data-timeoff-id="([^"]+)"[^>]*data-timeoff-bucket="' + bucket + '"', 'g');
  const out = [];
  let m;
  while ((m = re.exec(html))) out.push(m[1] || m[2]);
  return out;
}

function asRole(role) {
  sandbox.location.hash = '';
  dashAuth.ready = true;
  dashAuth.allowed = true;
  dashAuth.isAdmin = role === 'admin';
  dashAuth.dashRole = role;
  dashAuth.name = 'Fixture ' + role;
  dashAuth.user = { email: 'fixture-' + role + '@example.test', emailVerified: true };
}

const timeoff = {
  to_pending: { empId: 'tf_jordan', start: '2026-11-24', end: '2026-11-25', days: 2, type: 'unpaid', note: 'family trip', status: 'pending', reqAt: 500 },
  to_denied: { empId: 'tf_sam', start: '2026-12-01', end: '2026-12-01', days: 1, type: 'pto', note: 'tournament', status: 'denied', reqAt: 400 },
  to_approved_wedding: { empId: 'tf_riley', start: '2026-11-18', end: '2026-11-20', days: 3, type: 'pto', note: 'wedding', status: 'approved', reqAt: 300, ptoLogged: 'p_wedding' },
  to_approved_appt: { empId: 'tf_avery', start: '2026-10-06', end: '2026-10-06', days: 1, type: 'unpaid', note: 'appointment', status: 'approved', reqAt: 100 },
  to_nostatus: { empId: 'tf_quinn', start: '2026-11-28', end: '2026-11-28', days: 1, type: 'unpaid', note: 'no status field', reqAt: 200 },
  to_wait: { empId: 'tf_morgan', start: '2026-12-08', end: '2026-12-08', days: 1, type: 'unpaid', note: 'coverage check', status: 'waitlist', reqAt: 150 },
};
const savedTimeoff = JSON.stringify(timeoff);
state.tcShowApproved = false;
state.tcLoaded = true;
state.activeSection = 'accountability';
state.timeclock = {
  staff: {
    tf_jordan: { name: 'Jordan Lee', loc: 'waunakee' },
    tf_sam: { name: 'Sam Ortiz', loc: 'verona', fullTime: true, ptoDays: 10 },
    tf_riley: { name: 'Riley Chen', loc: 'eastmad', fullTime: true, ptoDays: 15 },
    tf_avery: { name: 'Avery Brooks', loc: 'deforest' },
    tf_quinn: { name: 'Quinn Patel', loc: 'goninjaW' },
    tf_morgan: { name: 'Morgan Hale', loc: 'waunakee' },
  },
  timeoff,
  pto: {
    tf_riley: { p_wedding: { date: '2026-11-18', days: 3, note: 'Approved time off (2026-11-18→2026-11-20)', fromRequest: 'to_approved_wedding' } },
  },
  schedule: {},
};
const weekDay = tcDateKey(tcSchedDays()[1]);
state.timeclock.schedule.tf_riley = {};
state.timeclock.schedule.tf_riley[weekDay] = { s1: { start: '15:00', end: '20:00', loc: 'eastmad', role: 'Instructor' } };

asRole('lead');
sandbox.__writes.length = 0;
const hidden = renderTcTimeoff();
check(sandbox.__writes.length === 0, 'rendering the list does not write');
check(JSON.stringify(state.timeclock.timeoff) === savedTimeoff, 'rendering does not change stored requests');
check(hidden.indexOf('data-timeoff-show-approved="0"') >= 0, 'approved section starts hidden');
check(hidden.indexOf('data-timeoff-list="approved"') < 0, 'approved block is not in the default list');
check(hidden.indexOf('data-timeoff-status="approved"') < 0, 'no approved row is rendered by default');
check(hidden.indexOf('wedding') < 0 && hidden.indexOf('Riley Chen') < 0, 'approved wedding request is not in the default list');
check(hidden.indexOf('appointment') < 0 && hidden.indexOf('Avery Brooks') < 0, 'approved appointment request is not in the default list');
check(hidden.indexOf('Jordan Lee') >= 0 && hidden.indexOf('family trip') >= 0, 'pending request stays visible');
check(hidden.indexOf('Quinn Patel') >= 0, 'a request with no status still shows as pending');
check(hidden.indexOf('Sam Ortiz') >= 0 && hidden.indexOf('✗ Denied') >= 0, 'denied request stays visible');
check(hidden.indexOf('Morgan Hale') >= 0 && hidden.indexOf('waitlist') >= 0, 'a non-approved unresolved status stays visible');
check(hidden.indexOf('Show approved (2)') >= 0, 'toggle names how many approved requests are hidden');
check(hidden.indexOf('data-timeoff-pending="2"') >= 0, 'pending badge counts pending rows only');
check(tcPendingTimeoffCount() === 2, 'schedule badge count ignores approved and denied');
const openIds = idsIn(hidden, 'open');
check(openIds.indexOf('to_approved_wedding') < 0 && openIds.indexOf('to_approved_appt') < 0, 'open list ids exclude approved');
check(openIds.indexOf('to_pending') >= 0 && openIds.indexOf('to_denied') >= 0 && openIds.indexOf('to_nostatus') >= 0 && openIds.indexOf('to_wait') >= 0, 'open list keeps pending, denied, blank, and other statuses');
check(openIds.indexOf('to_pending') < openIds.indexOf('to_denied'), 'requests that still need a decision stay above denied');

tcToggleShowApproved();
check(state.tcShowApproved === true, 'toggle turns the approved lookback on');
const shown = renderTcTimeoff();
check(sandbox.__writes.length === 0, 'opening approved history does not write');
check(JSON.stringify(state.timeclock.timeoff) === savedTimeoff, 'opening approved history does not change stored requests');
check(shown.indexOf('data-timeoff-list="approved"') >= 0, 'approved block renders when asked');
check(shown.indexOf('Hide approved') >= 0, 'toggle switches to hide');
check(shown.indexOf('Still saved for payroll and history') >= 0, 'approved section says the records are kept');
const shownOpen = shown.split('data-timeoff-list="approved"')[0];
check(shownOpen.indexOf('wedding') < 0 && shownOpen.indexOf('Riley Chen') < 0, 'approved rows are not mixed into the open list');
check(idsIn(shown, 'approved').join(',') === 'to_approved_wedding,to_approved_appt', 'approved history is newest first');
check(shown.indexOf('✓ Approved') >= 0 && shown.indexOf('wedding') >= 0 && shown.indexOf('appointment') >= 0, 'approved details are readable once opened');

tcToggleShowApproved();
check(state.tcShowApproved === false, 'toggle hides approved history again');
const rehidden = renderTcTimeoff();
check(rehidden.indexOf('data-timeoff-status="approved"') < 0, 'approved rows disappear again');

asRole('frontdesk');
const desk = renderTcTimeoff();
check(desk.indexOf('Jordan Lee') >= 0 && desk.indexOf('>Pending<') >= 0, 'front desk still sees pending requests');
check(desk.indexOf('>Approve<') < 0 && desk.indexOf('>Deny<') < 0, 'front desk cannot approve from the list');
check(desk.indexOf('wedding') < 0, 'front desk default list also hides approved');
check(desk.indexOf('Show approved (2)') >= 0, 'front desk can still look back');

asRole('ops');
const pto = renderTcPto();
check(pto.indexOf('Riley Chen') >= 0 && pto.indexOf('Approved time off') >= 0, 'PTO balance still lists the days logged from the approved request');
check(pto.indexOf('3d') >= 0, 'logged PTO days still show');
const sched = renderTcSchedule();
check(sched.indexOf('Riley Chen') >= 0 && sched.indexOf('3p') >= 0 && sched.indexOf('8p') >= 0, 'master schedule still shows a shift for someone with approved time off');
const ops = renderOpsPage();
check(ops.indexOf('2 time-off requests awaiting approval') >= 0, 'Ops schedule tab badge still counts only pending');

state.timeclock.timeoff = { to_approved_wedding: JSON.parse(savedTimeoff).to_approved_wedding };
state.tcShowApproved = false;
const onlyApproved = renderTcTimeoff();
check(onlyApproved.indexOf('data-timeoff-empty="open"') >= 0, 'a list of only approved requests says there is nothing open');
check(onlyApproved.indexOf('Nothing is deleted') >= 0, 'that empty state says the records are kept');
check(onlyApproved.indexOf('Riley Chen') < 0 && onlyApproved.indexOf('Show approved (1)') >= 0, 'the only approved request stays hidden behind the toggle');
state.timeclock.timeoff = JSON.parse(savedTimeoff);
state.tcShowApproved = false;

asRole('lead');
sandbox.__writes.length = 0;
tcTimeoffDecision('to_pending', 'approved');
const paths = sandbox.__writes.map(w => w.path + '=' + w.val);
check(sandbox.__writes.some(w => w.path === 'timeclock/timeoff/to_pending/status' && w.val === 'approved'), 'approve still writes status=approved');
check(sandbox.__writes.some(w => w.path === 'timeclock/timeoff/to_pending/decidedAt' && typeof w.val === 'number'), 'approve still writes decidedAt');
check(!sandbox.__writes.some(w => w.path === 'timeclock/timeoff/to_pending' && w.val == null), 'approve does not delete the request');
check(state.timeclock.timeoff.to_pending.status === 'pending', 'the in-memory record is unchanged until the database listener returns');
check(paths.filter(p => p.indexOf('timeclock/pto/') === 0).length === 0, 'unpaid approval does not log PTO');

state.timeclock.timeoff.to_pending.status = 'approved';
state.timeclock.timeoff.to_pending.decidedAt = 1;
state.tcShowApproved = false;
const afterApprove = renderTcTimeoff();
check(afterApprove.indexOf('Jordan Lee') < 0, 'once status is approved the row leaves the default list');
check(afterApprove.indexOf('data-timeoff-pending="1"') >= 0, 'pending badge drops the request that was just approved');
check(JSON.stringify(state.timeclock.timeoff.to_approved_wedding) === JSON.stringify(JSON.parse(savedTimeoff).to_approved_wedding), 'older approved records stay intact');

if (failed) {
  console.error(failed + ' failed, ' + passed + ' passed');
  process.exit(1);
}
console.log(passed + ' passed');
