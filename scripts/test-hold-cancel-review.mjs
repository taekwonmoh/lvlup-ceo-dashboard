/**
 * Holds & cancellations server-review display.
 * Loads the dashboard script with Firebase stubbed. No network and no writes
 * unless a test explicitly asks crqSetStatus to record one.
 *
 *   node scripts/test-hold-cancel-review.mjs
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
const documentStub = {
  getElementById() { return makeEl(); },
  createElement() { return makeEl(); },
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
  navigator: { userAgent: 'hold-cancel-review-test' },
  location: { hash: '', hostname: '', search: '' },
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
const crqIsPending = grab('crqIsPending');
const crqReviewModel = grab('crqReviewModel');
const crqStatusNeedsManualConfirm = grab('crqStatusNeedsManualConfirm');
const crqLabeledFixtures = grab('crqLabeledFixtures');
const renderHoldCard = grab('renderHoldCard');
const renderHoldsPage = grab('renderHoldsPage');
const renderMembersPage = grab('renderMembersPage');
const renderCancellationDetails = grab('renderCancellationDetails');
const crqSetStatus = grab('crqSetStatus');
const crqLocalFixtureMode = grab('crqLocalFixtureMode');

let failed = 0;
let passed = 0;
function check(cond, msg) {
  if (cond) { passed++; return; }
  failed++;
  console.error('FAIL: ' + msg);
}

function asLead() {
  sandbox.location.hash = '';
  sandbox.location.hostname = '';
  sandbox.location.search = '';
  dashAuth.allowed = true;
  dashAuth.ready = true;
  dashAuth.isAdmin = false;
  dashAuth.dashRole = 'lead';
  dashAuth.user = { email: 'fixture-lead@example.test', emailVerified: true };
}

asLead();
check(crqLocalFixtureMode() === false, 'fixture mode stays off without localhost and the query flag');

const fixtures = crqLabeledFixtures();
Object.entries(fixtures).forEach(([id, row]) => {
  check(String(row.fixtureLabel || '').indexOf('TEST FIXTURE') === 0, id + ' is labeled as a test fixture');
  check(String(row.email || '').endsWith('@example.test'), id + ' uses an example.test address');
  check(String(row.name || '').indexOf('TEST FIXTURE') === 0, id + ' name is a fixture name');
  const saved = JSON.stringify(row);
  check(saved.indexOf('$15') < 0 && saved.indexOf('1500') < 0, id + ' does not store a fee amount');
  check(!('noticeReceiptDate' in row) && !('goodstanding' in row) && !('paymentVerification' in row) && !('serverReview' in row), id + ' does not use guessed field names');
});

const cancel = fixtures['test-fixture-cancel-notice'];
const hold = fixtures['test-fixture-hold'];
const gate = fixtures['test-fixture-gate-passed'];
const legacy = fixtures['test-fixture-legacy-pending'];
check(!('status' in cancel) && !('status' in hold) && !('status' in gate) && !('status' in legacy), 'new website records omit status');
check(fixtures['test-fixture-legacy-processed'].status === 'processed', 'existing processed record keeps status');
check(crqIsPending(cancel) === true && crqIsPending({ status: '' }) === true, 'omitted status counts pending');
check(crqIsPending(fixtures['test-fixture-legacy-processed']) === false, 'processed status is not pending');

check(cancel.notice.receivedOn === '2026-11-06', 'notice.receivedOn is the Chicago receipt date');
check(cancel.notice.earliestCompletionOn === '2026-12-06', 'notice.earliestCompletionOn is 30 calendar days later');
check(cancel.notice.holdDaysCredited === 0, 'hold days credited stay 0');
check(cancel.notice.autoComplete === false && cancel.notice.completion === 'blocked', 'notice cannot auto-complete');
check(hold.notice === null, 'a hold stores notice as null');
check(cancel.agreement.memberLinkage === 'unverified_form_identity', 'agreement linkage is unverified form identity');
check(cancel.agreement.memberId === null, 'agreement member id is null');
check(cancel.agreement.version === '2026-11-07-notice-clock', 'agreement version matches the website');
check(cancel.eligibility.decision === 'manual_review', 'unavailable account is manual review');
check(cancel.eligibility.verifiedGoodStanding === false, 'unavailable account is not verified good standing');
check(cancel.eligibility.liveVerification === false, 'live verification is false');
check(cancel.eligibility.reasons[0] === 'account_state_unavailable', 'eligibility reason is account_state_unavailable');
check(cancel.review.autoApproved === false && cancel.review.reasons.indexOf('not_auto_approved') >= 0, 'review is not auto-approved');
check(cancel.review.reasons.indexOf('notice_period_not_elapsed') >= 0, 'review.reasons includes the notice clock');
check(cancel.fee.inEffect === false && cancel.fee.enabled === false && cancel.fee.appliedAmountCents === null, 'fee snapshot is inactive');
check(cancel.billingDraft.active === false && cancel.billingDraft.computedTuitionCents === null, 'billing draft is inactive');
check(gate.eligibility.decision === 'gate_passed' && gate.eligibility.verifiedGoodStanding === true, 'trusted zero balance can pass the gate');
check(gate.eligibility.liveVerification === false && gate.review.autoApproved === false, 'a passed gate is not a live approval');
check(gate.notice.reasons.indexOf('hold_fee_does_not_satisfy_tuition') >= 0, 'a paid hold fee does not satisfy tuition');

const cancelModel = crqReviewModel(cancel);
check(cancelModel.notice.receivedOn === '2026-11-06', 'model reads notice.receivedOn');
check(cancelModel.notice.earliestCompletionOn === '2026-12-06', 'model reads notice.earliestCompletionOn');
check(cancelModel.eligibility.state === 'manual_review', 'unavailable eligibility renders as manual review');
check(cancelModel.feesEnabled === false, 'fee policy stays disabled');
check(crqReviewModel(legacy).eligibility.state === 'unknown', 'legacy row with no eligibility object is unknown');
check(crqReviewModel(legacy).notice.kind === 'missing', 'legacy row with no notice object is missing');
check(crqReviewModel({ notice: null, eligibility: { decision: 'manual_review', verifiedGoodStanding: false, liveVerification: false } }).notice.kind === 'none', 'explicit null notice is a non-cancellation');
check(crqReviewModel(gate).eligibility.state === 'gate_passed', 'gate_passed is labeled separately from eligible');
check(crqReviewModel({ eligibility: { decision: 'gate_passed', verifiedGoodStanding: true, liveVerification: true } }).eligibility.state === 'unknown', 'a claimed live check is not treated as eligible');
check(crqReviewModel({ goodstanding: 'eligible', paymentVerification: 'eligible' }).eligibility.state === 'unknown', 'guessed eligible strings are unknown');

state.cancellationRequests = fixtures;
sandbox.__writes.length = 0;
const page = renderHoldsPage();
check(sandbox.__writes.length === 0, 'rendering the queue does not write');
check(page.indexOf('data-crq-notice="2026-11-06"') >= 0, 'receipt date rendered from notice.receivedOn');
check(page.indexOf('data-crq-earliest="2026-12-06"') >= 0, 'earliest date rendered from notice.earliestCompletionOn');
check(page.indexOf('data-crq-earliest="2026-11-07"') < 0, 'hold start is not the earliest completion date');
check(page.indexOf('data-crq-verification="manual_review"') >= 0, 'unavailable standing is manual review');
check(page.indexOf('data-crq-verification="unknown"') >= 0, 'legacy row is unknown');
check(page.indexOf('data-crq-verification="eligible"') < 0, 'nothing is labeled eligible');
check(page.indexOf('data-crq-verification="gate_passed"') >= 0, 'gate passed is shown as a gate, not an approval');
check(page.indexOf('not_auto_approved') >= 0, 'review.reasons are visible');
check(page.indexOf('unverified_form_identity') >= 0 || page.indexOf('unverified form identity') >= 0, 'typed identity is not a verified member link');
check(page.indexOf('data-crq-identity="typed"') >= 0, 'identity line is on the card');
check(page.indexOf('data-hold-fee-policy="inactive"') >= 0, 'fee policy is inactive');
check(page.indexOf('$15') < 0 && page.indexOf('1500') < 0, 'the queue does not print a fee amount');
check((page.match(/● PENDING/g) || []).length === 4, 'four omitted-status fixtures are pending');

const gateCard = renderHoldCard(Object.assign({ id: 'test-fixture-gate-passed' }, gate));
check(gateCard.indexOf('not an approval') >= 0 || gateCard.indexOf('Not an approval') >= 0, 'gate passed still says it is not an approval');
check(gateCard.indexOf('not_auto_approved') >= 0, 'gate-passed card keeps review reasons');
check(crqStatusNeedsManualConfirm(gate, 'processed') === true, 'a passed gate still needs the bookkeeping confirm');
check(crqStatusNeedsManualConfirm(legacy, 'frozen') === true, 'legacy unknown still needs the bookkeeping confirm');
check(crqStatusNeedsManualConfirm(cancel, null) === false, 'clearing a status does not need the confirm');

sandbox.confirm = function () { return false; };
sandbox.__writes.length = 0;
crqSetStatus('test-fixture-cancel-notice', 'processed');
check(sandbox.__writes.length === 0, 'declining the confirm does not write');

let confirmText = '';
sandbox.confirm = function (msg) { confirmText = msg; return true; };
sandbox.__writes.length = 0;
crqSetStatus('test-fixture-gate-passed', 'processed');
check(confirmText.indexOf('staff queue') >= 0, 'confirm says this is the staff queue');
check(confirmText.indexOf('bookkeeping') >= 0, 'confirm says bookkeeping');
check(confirmText.indexOf('not an eligibility approval') >= 0, 'confirm says it is not an eligibility approval');
check(confirmText.indexOf('Gymdesk') >= 0 && confirmText.indexOf('billing') >= 0, 'confirm says it is not a Gymdesk or billing action');
check(sandbox.__writes.length === 1, 'accepting the confirm writes one field');
check(sandbox.__writes[0].path === 'cancellationRequests/test-fixture-gate-passed/status', 'the only write is status');
check(sandbox.__writes[0].val === 'processed', 'status is the staff bookkeeping choice');

state.cancellationRequests['test-fixture-gate-passed'] = Object.assign({}, gate, { status: 'processed' });
const after = renderHoldCard(Object.assign({ id: 'test-fixture-gate-passed' }, state.cancellationRequests['test-fixture-gate-passed']));
check(after.indexOf('● PENDING') < 0, 'processed card is no longer pending');
check(after.indexOf('not_auto_approved') >= 0, 'review reasons stay visible after status is set');
check(after.indexOf('notice_period_not_elapsed') >= 0, 'notice reasons stay visible after status is set');
check(after.indexOf('data-crq-verification="gate_passed"') >= 0, 'status does not rewrite eligibility');

sandbox.location.hash = '#clock';
check(renderHoldCard(Object.assign({ id: 'test-fixture-cancel-notice' }, cancel)) === '', 'kiosk clock does not render a request card');
sandbox.location.hash = '';

dashAuth.dashRole = 'frontdesk';
state.activeSection = 'holds';
state.cancellationRequests = fixtures;
const desk = renderMembersPage();
check(desk.indexOf('cancel-notice@example.test') < 0, 'front desk members page does not include request emails');
check(desk.indexOf('unverified_form_identity') < 0, 'front desk members page does not include agreement linkage');
check(desk.indexOf('Holds &amp; Cancellations') < 0 && desk.indexOf('Holds & Cancellations') < 0, 'front desk does not get the holds tab');

asLead();
const scdMonthKey = grab('scdMonthKey');
state.cancellationRequests = {
  'test-fixture-scorecard': Object.assign({}, cancel, {
    timestamp: scdMonthKey() + '-03T15:00:00-06:00',
    location: 'waunakee',
    action: 'Cancellation',
  }),
};
const details = renderCancellationDetails('waunakee');
check(details.indexOf('Earliest') >= 0, 'scorecard shows notice.earliestCompletionOn');
check(details.indexOf('2026-11-07-notice-clock') < 0, 'scorecard does not repeat the agreement version');
check(details.indexOf('data-crq-gymdesk') < 0, 'scorecard does not repeat the verification panel');

if (failed) {
  console.error(failed + ' failed, ' + passed + ' passed');
  process.exit(1);
}
console.log(passed + ' passed');
