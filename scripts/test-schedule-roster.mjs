/**
 * East Madison can assign Tarik before he has a shift there.
 * Scheduler labels add a known surname and leave every other name alone.
 * Local fixtures only. No network and no Firebase writes.
 *
 *   node scripts/test-schedule-roster.mjs
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
    querySelectorAll() { return []; },
    addEventListener() {},
    documentElement: { style: {} },
    body: { appendChild() {} },
  },
  navigator: { userAgent: 'schedule-roster-test' },
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
const renderTcSchedule = grab('renderTcSchedule');
const renderTcTeamSchedule = grab('renderTcTeamSchedule');
const renderTcTimeoffModal = grab('renderTcTimeoffModal');
const renderTcTimeoff = grab('renderTcTimeoff');
const renderTcShiftModal = grab('renderTcShiftModal');
const tcShiftOpen = grab('tcShiftOpen');
const tcShiftSave = grab('tcShiftSave');
const tcStaffLabel = grab('tcStaffLabel');
const tcSchedStaff = grab('tcSchedStaff');
const tcClockStaff = grab('tcClockStaff');
const tcSchedulableAt = grab('tcSchedulableAt');
const tcDateKey = grab('tcDateKey');
const tcSchedDays = grab('tcSchedDays');
const TASK_EMPLOYEES = grab('TASK_EMPLOYEES');
const EMP_DAILY = grab('EMP_DAILY');

let failed = 0;
let passed = 0;
function check(cond, msg) {
  if (cond) { passed++; return; }
  failed++;
  console.error('FAIL: ' + msg);
}

dashAuth.ready = true;
dashAuth.allowed = true;
dashAuth.isAdmin = true;
dashAuth.dashRole = 'admin';
dashAuth.user = { email: 'fixture-admin@example.test', emailVerified: true };
state.tcLoaded = true;
state.tcWeekOffset = 0;
state.schedLoc = 'eastmad';
state.timeclock = {
  staff: {
    tc_tarik: { name: 'Tarik Murrell', loc: 'waunakee', email: 'tmurrell.lvlupma@gmail.com', fullTime: true },
    tc_bryan: { name: 'Bryan', loc: 'verona', email: 'bgoad.lvlupma@gmail.com', fullTime: true },
    tc_ash: { name: 'Ash', loc: 'eastmad', email: 'amouille.lvlupma@gmail.com', schedAll: true, fullTime: true },
    tc_joey: { name: 'Joey', loc: 'deforest', email: 'jz.lvlupma@gmail.com', schedAll: true, fullTime: true },
    tc_miranda: { name: 'Miranda', loc: 'goninjaW', email: 'msmith.lvlupma@gmail.com', fullTime: true },
    tc_andy: { name: 'Andy Roszkowski', loc: 'eastmad', email: 'andy.roszkowski@gmail.com' },
    tc_erika: { name: 'Erika', loc: 'deforest', email: 'applezgirl69@gmail.com' },
    tc_mario: { name: 'Mario', loc: 'verona', email: 'mariosanchez566@gmail.com' },
    tc_msk: { name: 'Ms K', loc: 'waunakee', email: 'msk.lvlupma@gmail.com' },
    tc_cat: { name: 'Cat', loc: 'verona', email: 'ctrevino.lvlupma@gmail.com' },
    tc_muq58dnhkazw: { name: 'Abigail', loc: 'waunakee', email: 'ahoefling7@gmail.com' },
    tc_meredith: { name: 'Meredith Fitz', loc: 'goninjaV' },
    tc_mvvjbiq88fhd: { name: 'Meredith', loc: null, email: '' },
    tc_mike: { name: 'Mike Moh', loc: 'waunakee', schedAll: true },
  },
  schedule: {},
  schedulePublished: {},
};

const savedStaff = JSON.stringify(state.timeclock.staff);
const tarikSeat = TASK_EMPLOYEES.find(e => e.id === 'tarikM');
check(tarikSeat && tarikSeat.loc === 'waunakee', 'Tarik task seat stays Waunakee');
check(Array.isArray(EMP_DAILY.tarikM) && EMP_DAILY.tarikM.some(t => t.id === 'ph_bathroom'), 'Tarik daily checklist is unchanged');
check(tcStaffLabel(state.timeclock.staff.tc_tarik, 'tc_tarik') === 'Tarik Murrell', 'stored full name is not doubled');
check(tcStaffLabel(state.timeclock.staff.tc_bryan, 'tc_bryan') === 'Bryan Goad', 'Bryan shows as Bryan Goad');
check(tcStaffLabel(state.timeclock.staff.tc_joey, 'tc_joey') === 'Joey Zaworski', 'Joey shows as Joey Zaworski');
check(tcStaffLabel(state.timeclock.staff.tc_miranda, 'tc_miranda') === 'Miranda Smith', 'Miranda shows as Miranda Smith');
check(tcStaffLabel(state.timeclock.staff.tc_andy, 'tc_andy') === 'Andy Roszkowski', 'Andy keeps the stored last name');
check(tcStaffLabel(state.timeclock.staff.tc_ash, 'tc_ash') === 'Ash Mouille', 'Ash shows as Ash Mouille');
check(tcStaffLabel(state.timeclock.staff.tc_erika, 'tc_erika') === 'Erika Weiss', 'Erika shows as Erika Weiss');
check(tcStaffLabel(state.timeclock.staff.tc_mario, 'tc_mario') === 'Mario Sanchez', 'Mario shows as Mario Sanchez');
check(tcStaffLabel(state.timeclock.staff.tc_cat, 'tc_cat') === 'Cat Trevino', 'Cat shows as Cat Trevino');
check(tcStaffLabel(state.timeclock.staff.tc_msk, 'tc_msk') === 'Sue Kondratowicz', 'Ms K shows as Sue Kondratowicz');
check(tcStaffLabel(state.timeclock.staff.tc_muq58dnhkazw, 'tc_muq58dnhkazw') === 'Abigail Hoefling', 'Abigail shows as Abigail Hoefling');
const sueSeat = TASK_EMPLOYEES.find(e => e.id === 'sueK');
check(sueSeat && sueSeat.id === 'sueK', 'sueK task id is unchanged');
check(grab('DASH_KNOWN_SEATS')['ahoefling7@gmail.com'].empId === 'sueK', 'Abigail’s login still opens Sue’s checklist');
check(tcClockStaff().some(s => s.id === 'tc_muq58dnhkazw'), 'Abigail still punches the clock');
check(tcSchedStaff().some(s => s.id === 'tc_muq58dnhkazw'), 'Abigail is on the scheduler roster');
check(!tcSchedStaff().some(s => s.id === 'tc_mvvjbiq88fhd'), 'the location-less Meredith is off the scheduler roster');
check(tcSchedStaff().some(s => s.id === 'tc_meredith'), 'Meredith Fitz stays on the scheduler roster');
check(tcSchedulableAt({ id: 'tc_tarik', name: 'Tarik Murrell', loc: 'waunakee' }, 'eastmad'), 'Tarik is schedulable at East Madison');
check(!tcSchedulableAt({ id: 'tc_tarik', name: 'Tarik Murrell', loc: 'waunakee' }, 'verona'), 'Tarik is not auto-added to Verona');
check(!tcSchedulableAt({ id: 'tc_bryan', name: 'Bryan', loc: 'verona' }, 'eastmad'), 'Bryan is not auto-added to East Madison');

sandbox.__writes.length = 0;
state.schedLoc = 'eastmad';
const east = renderTcSchedule();
check(sandbox.__writes.length === 0, 'rendering the master schedule does not write');
check(JSON.stringify(state.timeclock.staff) === savedStaff, 'rendering does not change staff records');
check(east.indexOf('Tarik Murrell') >= 0, 'East Madison grid lists Tarik Murrell');
check(east.indexOf("tcShiftOpen('tc_tarik'") >= 0, 'East Madison grid can add a shift for Tarik');
check(east.indexOf('Bryan Goad') < 0, 'Bryan is not on East Madison with no shift there');
check(east.indexOf('Ash Mouille') >= 0, 'Ash Mouille still appears on East Madison via schedAll');
check(east.indexOf('Abigail') < 0, 'Abigail is not on East Madison without a shift there');
check(east.indexOf('Joey Zaworski') >= 0, 'Joey Zaworski still appears on East Madison via schedAll');
check(east.indexOf('Miranda Smith') < 0, 'Miranda is not on the East Madison chip');
check(east.indexOf('Andy Roszkowski') < 0, 'Andy is not on East Madison until he has a shift there');
check(east.indexOf('Roszkowski Roszkowski') < 0, 'a stored last name is not repeated');

state.schedLoc = 'verona';
const verona = renderTcSchedule();
check(verona.indexOf('Tarik Murrell') < 0, 'Tarik is not on the Verona chip');
check(verona.indexOf('Bryan Goad') < 0, 'Bryan is not on Verona until he has a shift there');
check(verona.indexOf('Joey Zaworski') >= 0, 'schedAll still covers every LVLUP chip');

state.schedLoc = 'waunakee';
const wau = renderTcSchedule();
check(wau.indexOf('Tarik Murrell') < 0, 'home school alone does not put Tarik on the Waunakee chip');
check(wau.indexOf('Abigail') < 0, 'Abigail’s stored home school does not put her on LVLUP Waunakee');
check(wau.indexOf('Mike Moh') >= 0, 'Waunakee still lists an all-LVLUP floater');

state.schedLoc = 'goninjaW';
const gn = renderTcSchedule();
check(gn.indexOf('Tarik Murrell') < 0, 'Tarik is not on a Go Ninja chip');
check(gn.indexOf('Joey Zaworski') < 0, 'an all-LVLUP floater is not on Go Ninja');
check(gn.indexOf('Abigail Hoefling') >= 0, 'Go Ninja Waunakee lists Abigail Hoefling');
check(gn.indexOf("tcShiftOpen('tc_muq58dnhkazw'") >= 0, 'Go Ninja Waunakee can add a shift for Abigail');
state.schedLoc = 'goninjaV';
const gnv = renderTcSchedule();
check(gnv.indexOf('Abigail') < 0, 'Abigail is not auto-added to Go Ninja Verona');

state.schedLoc = 'all';
const all = renderTcSchedule();
check(all.indexOf('Tarik Murrell') >= 0, 'All locations still lists Tarik');
check(all.indexOf('Bryan Goad') >= 0, 'All locations shows Bryan Goad');
check(all.indexOf('Miranda Smith') >= 0, 'All locations shows Miranda Smith');
check(all.indexOf('Mario Sanchez') >= 0, 'All locations shows Mario Sanchez');
check(all.indexOf('Cat Trevino') >= 0, 'All locations shows Cat Trevino');
check(all.indexOf('Erika Weiss') >= 0, 'All locations shows Erika Weiss');
check(all.indexOf('Sue Kondratowicz') >= 0, 'All locations shows Sue Kondratowicz');
check(all.indexOf('Ms K') < 0, 'Ms K is not listed under that label');
check((all.match(/data-staff="tc_msk"/g) || []).length === 7, 'Sue Kondratowicz is one schedule row');
check(all.indexOf('Meredith Fitz') >= 0, 'Meredith Fitz is on the schedule');
check((all.match(/data-staff="tc_muq58dnhkazw"/g) || []).length === 7, 'Abigail has one schedule row');
check(all.indexOf('Abigail Hoefling') >= 0, 'All locations shows Abigail Hoefling');
check(all.indexOf('data-staff="tc_mvvjbiq88fhd"') < 0, 'the duplicate Meredith has no schedule row');

const days = tcSchedDays();
const monday = tcDateKey(days[0]);
const tuesday = tcDateKey(days[1]);
state.timeclock.schedule.tc_bryan = {};
state.timeclock.schedule.tc_bryan[tuesday] = { s1: { start: '16:00', end: '20:00', loc: 'eastmad', role: 'Instructor' } };
state.schedLoc = 'eastmad';
const eastWithBryan = renderTcSchedule();
check(eastWithBryan.indexOf('Bryan Goad') >= 0, 'a Bryan shift at East Madison puts him on that chip');
check(eastWithBryan.indexOf('Tarik Murrell') >= 0, 'Tarik stays on East Madison next to someone who has a shift');
check(eastWithBryan.indexOf('Abigail') < 0, 'Abigail stays off East Madison while she has no shift there');
state.timeclock.schedule.tc_muq58dnhkazw = {};
state.timeclock.schedule.tc_muq58dnhkazw[tuesday] = { s1: { start: '16:00', end: '18:00', loc: 'eastmad', role: 'Coach' } };
const eastWithAb = renderTcSchedule();
check(eastWithAb.indexOf('Abigail Hoefling') >= 0, 'an East Madison shift puts Abigail on that LVLUP chip');
delete state.timeclock.schedule.tc_muq58dnhkazw;

state.tcTimeoffReq = { empId: '', ctx: 'dash', start: tuesday, end: tuesday, type: 'unpaid', note: '' };
const picker = renderTcTimeoffModal();
check(picker.indexOf('Bryan Goad') >= 0, 'time-off staff picker shows Bryan Goad');
check(picker.indexOf('Tarik Murrell') >= 0, 'time-off staff picker shows Tarik Murrell');
check(picker.indexOf('>Ash Mouille</option>') >= 0, 'time-off staff picker shows Ash Mouille');
check(picker.indexOf('>Mario Sanchez</option>') >= 0, 'time-off picker shows Mario Sanchez');
check(picker.indexOf('>Sue Kondratowicz</option>') >= 0, 'time-off picker shows Sue Kondratowicz');
check(picker.indexOf('>Abigail Hoefling</option>') >= 0, 'time-off picker lists Abigail Hoefling');
check(picker.indexOf('>Meredith</option>') < 0, 'time-off picker does not list the bare Meredith duplicate');
check(picker.indexOf('Meredith Fitz') >= 0, 'time-off picker lists Meredith Fitz');

state.tcShiftEdit = { staffId: 'tc_bryan', dateKey: tuesday, sid: '', start: '16:00', end: '20:00', loc: 'eastmad', role: '' };
const shift = renderTcShiftModal();
check(shift.indexOf('Bryan Goad') >= 0, 'shift editor titles the person Bryan Goad');
state.tcShiftEdit = null;

state.tcTeamLoc = 'eastmad';
state.timeclock.schedulePublished[monday] = {
  publishedAt: Date.now(),
  snap: {
    tc_bryan: [tuesday + '|16:00|20:00|eastmad|Instructor'],
    tc_tarik: [tuesday + '|15:00|19:00|waunakee|Lead'],
  },
};
const posted = renderTcTeamSchedule();
check(posted.indexOf('Bryan Goad') >= 0, 'posted East Madison schedule shows Bryan Goad');
check(posted.indexOf('Tarik Murrell') < 0, 'posted East Madison schedule stays limited to posted shifts there');
check(posted.indexOf('Abigail') < 0, 'posted East Madison schedule does not list Abigail without a shift there');
state.tcTeamLoc = 'goninjaW';
const postedGn = renderTcTeamSchedule();
check(postedGn.indexOf('Abigail Hoefling') >= 0, 'posted Go Ninja Waunakee lists Abigail before she has a shift');
state.tcTeamLoc = 'all';
const postedAll = renderTcTeamSchedule();
check(postedAll.indexOf('Tarik Murrell') >= 0, 'posted all-locations schedule shows Tarik Murrell');
check(postedAll.indexOf('Murrell Murrell') < 0, 'posted schedule does not double Tarik’s last name');
state.timeclock.schedulePublished[monday].snap.tc_muq58dnhkazw = [tuesday + '|09:00|13:00|waunakee|Front Desk'];
state.timeclock.schedulePublished[monday].snap.tc_mvvjbiq88fhd = [tuesday + '|10:00|14:00|goninjaV|Coach'];
state.timeclock.schedulePublished[monday].snap.tc_meredith = [tuesday + '|10:00|14:00|goninjaV|Coach'];
const postedHidden = renderTcTeamSchedule();
check(postedHidden.indexOf('Meredith Fitz') >= 0, 'posted schedule shows Meredith Fitz');
check(postedHidden.indexOf('Abigail Hoefling') >= 0, 'posted all-locations schedule shows Abigail Hoefling');
check((postedHidden.split('Meredith').length - 1) === (postedHidden.split('Meredith Fitz').length - 1), 'posted schedule does not add the duplicate Meredith');
state.timeclock.timeoff = { to_ab: { empId: 'tc_muq58dnhkazw', start: tuesday, end: tuesday, days: 1, type: 'unpaid', note: 'kept', status: 'pending', reqAt: 1 } };
const history = renderTcTimeoff();
check(history.indexOf('Abigail Hoefling') >= 0 && history.indexOf('kept') >= 0, 'an existing time-off request still names Abigail');
check(sandbox.__writes.length === 0, 'hiding people and labeling names does not write');

state.timeclock.staff.tc_ash.ptoDays = 15;
state.timeclock.pto = {};
sandbox.__writes.length = 0;
tcShiftOpen('tc_ash', '2026-11-16', '', 'eastmad');
const addShift = renderTcShiftModal();
check(addShift.indexOf('data-shift-mode="shift"') >= 0, 'add box opens on Shift');
check(addShift.indexOf('data-shift-tab="timeoff"') >= 0, 'a scheduler can switch the add box to Time off');
check(addShift.indexOf('Ash Mouille') >= 0, 'add box names Ash Mouille');
check(addShift.indexOf('>Location<') >= 0 || addShift.indexOf('>Location') >= 0, 'shift mode still asks for a location');
state.tcShiftEdit.mode = 'timeoff';
const addOff = renderTcShiftModal();
check(addOff.indexOf('data-shift-mode="timeoff"') >= 0, 'time-off mode is marked on the modal');
check(addOff.indexOf('Add time off') >= 0, 'the title switches to Add time off');
check(addOff.indexOf('value="2026-11-16"') >= 0, 'time off defaults to the clicked day');
check(addOff.indexOf('Paid (PTO)') >= 0 && addOff.indexOf('Unpaid') >= 0, 'a full-timer can choose paid or unpaid');
check(addOff.indexOf('1 week') >= 0, 'the range can cover more than one day');
check(addOff.indexOf('>Location<') < 0, 'time-off mode does not ask for a shift location');
check(sandbox.__writes.length === 0, 'opening the modal does not write');
tcShiftSave();
const offWrite = sandbox.__writes.filter(w => String(w.path).indexOf('timeclock/timeoff/') === 0);
const ptoWrite = sandbox.__writes.filter(w => String(w.path).indexOf('timeclock/pto/tc_ash/') === 0);
check(offWrite.length === 1, 'saving time off writes one time-off record');
check(offWrite[0] && offWrite[0].val.status === 'approved' && offWrite[0].val.reqVia === 'schedule', 'a manager entry is stored approved');
check(offWrite[0] && offWrite[0].val.type === 'pto' && offWrite[0].val.days === 1 && offWrite[0].val.start === '2026-11-16' && offWrite[0].val.end === '2026-11-16', 'paid time off uses the clicked day');
check(offWrite[0] && offWrite[0].val.empId === 'tc_ash' && offWrite[0].val.ptoLogged, 'the request points at its PTO row');
check(ptoWrite.length === 1 && ptoWrite[0].val.days === 1 && ptoWrite[0].val.date === '2026-11-16' && ptoWrite[0].val.note === 'Approved time off', 'PTO is logged the same way Approve logs it');
check(ptoWrite[0] && offWrite[0] && ptoWrite[0].val.fromRequest === offWrite[0].path.split('/').pop() && ptoWrite[0].path.endsWith('/' + offWrite[0].val.ptoLogged), 'the PTO row names the time-off record');
check(state.tcShowApproved === true, 'the time-off card opens the approved list');

sandbox.__writes.length = 0;
state.tcShiftEdit = { staffId: 'tc_ash', dateKey: '2026-11-16', sid: '', mode: 'timeoff', offStart: '2026-11-16', offEnd: '2026-11-18', offType: 'unpaid', offNote: 'family trip', start: '16:00', end: '19:00', loc: 'eastmad', role: '' };
tcShiftSave();
const unpaid = sandbox.__writes.filter(w => String(w.path).indexOf('timeclock/timeoff/') === 0);
const unpaidPto = sandbox.__writes.filter(w => String(w.path).indexOf('timeclock/pto/') === 0);
check(unpaid.length === 1 && unpaid[0].val.type === 'unpaid' && unpaid[0].val.days === 3 && unpaid[0].val.note === 'family trip' && unpaid[0].val.status === 'approved', 'a longer unpaid range is one approved request');
check(unpaidPto.length === 0, 'unpaid time off does not touch the PTO balance');

sandbox.__writes.length = 0;
state.tcShiftEdit = { staffId: 'tc_andy', dateKey: '2026-11-16', sid: '', mode: 'timeoff', offStart: '2026-11-16', offEnd: '2026-11-16', offType: 'pto', offNote: '', start: '16:00', end: '19:00', loc: 'eastmad', role: '' };
tcShiftSave();
const hourly = sandbox.__writes.find(w => String(w.path).indexOf('timeclock/timeoff/') === 0);
check(hourly && hourly.val.type === 'unpaid' && !hourly.val.ptoLogged, 'hourly staff stay unpaid even if Paid was selected');

state.tcShiftEdit = { staffId: 'tc_ash', dateKey: '2026-11-16', sid: 's_existing', mode: 'timeoff', offStart: '2026-11-16', offEnd: '2026-11-16', offType: 'pto', offNote: '', start: '16:00', end: '19:00', loc: 'eastmad', role: 'Lead' };
const editModal = renderTcShiftModal();
check(editModal.indexOf('Edit shift') >= 0 && editModal.indexOf('data-shift-tab="timeoff"') < 0, 'editing a shift does not offer the time-off switch');

dashAuth.isAdmin = false;
dashAuth.dashRole = 'frontdesk';
state.tcShiftEdit = { staffId: 'tc_ash', dateKey: '2026-11-16', sid: '', mode: 'shift', offStart: '2026-11-16', offEnd: '2026-11-16', offType: 'pto', offNote: '', start: '16:00', end: '19:00', loc: 'eastmad', role: '' };
const deskModal = renderTcShiftModal();
check(deskModal.indexOf('data-shift-tab="timeoff"') < 0, 'front desk does not see the time-off switch');
sandbox.__writes.length = 0;
state.tcShiftEdit.mode = 'timeoff';
tcShiftSave();
check(sandbox.__writes.length === 0, 'front desk cannot file time off from the shift box');
dashAuth.isAdmin = true;
dashAuth.dashRole = 'admin';
state.tcShiftEdit = null;

if (process.argv.includes('--modal')) {
  dashAuth.isAdmin = true;
  dashAuth.dashRole = 'admin';
  state.timeclock.staff.tc_ash.ptoDays = 15;
  state.timeclock.pto = { tc_ash: {} };
  state.tcShiftEdit = { staffId: 'tc_ash', dateKey: '2026-11-16', sid: '', mode: 'timeoff', offStart: '2026-11-16', offEnd: '2026-11-16', offType: 'pto', offNote: '', start: '16:00', end: '19:00', loc: 'eastmad', role: '' };
  const modal = renderTcShiftModal();
  const out = process.argv[process.argv.indexOf('--modal') + 1] || '/tmp/add-timeoff-modal.html';
  fs.writeFileSync(out, `<!doctype html><html><head><meta charset="utf-8"><title>Add time off</title>
<style>body{margin:0;background:#e8edf5;font-family:system-ui,Segoe UI,sans-serif;}</style>
</head><body>${modal}</body></html>`);
  console.log('wrote ' + out);
}

if (process.argv.includes('--html')) {
  const locArg = process.argv.includes('--loc') ? process.argv[process.argv.indexOf('--loc') + 1] : 'goninjaW';
  state.schedLoc = locArg;
  state.tcShiftEdit = null;
  state.tcTimeoffReq = null;
  state.timeclock.schedulePublished = {};
  const wed = tcDateKey(tcSchedDays()[2]);
  state.timeclock.schedule.tc_miranda = {};
  state.timeclock.schedule.tc_miranda[wed] = { s1: { start: '15:00', end: '19:00', loc: 'goninjaW', role: 'Lead' } };
  const page = renderTcSchedule();
  const out = process.argv[process.argv.indexOf('--html') + 1] || '/tmp/eastmad-schedule.html';
  const doc = `<!doctype html><html><head><meta charset="utf-8"><title>Go Ninja Waunakee schedule</title>
<style>
  :root { --card:#fff; --shadow:0 1px 3px rgba(0,0,0,.08); --gray-50:#f8fafc; --gray-100:#f1f5f9; --gray-200:#e2e8f0; --gray-500:#64748b; }
  body { margin:0; background:#eef2f7; font-family:system-ui,Segoe UI,sans-serif; color:#1a1a2e; }
  .wrap { max-width:1100px; margin:24px auto; }
  .section { background:#fff; border-radius:12px; box-shadow:0 1px 3px rgba(0,0,0,.08); margin-bottom:20px; overflow:hidden; }
  .section-header { padding:16px 20px; border-bottom:1px solid #f1f5f9; display:flex; justify-content:space-between; align-items:center; }
  .section-header h2 { font-size:15px; font-weight:700; margin:0; }
  .sc-table { width:100%; border-collapse:collapse; font-size:13px; }
  .sc-table th { background:#f8fafc; padding:10px 12px; text-align:left; font-weight:600; font-size:11px; text-transform:uppercase; letter-spacing:.3px; color:#64748b; border-bottom:2px solid #e2e8f0; }
  .sc-table td { padding:8px 12px; border-bottom:1px solid #f1f5f9; }
  .sc-mobile { display:none; }
</style></head><body><div class="wrap">${page}</div></body></html>`;
  fs.writeFileSync(out, doc);
  console.log('wrote ' + out);
}

console.log(passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
