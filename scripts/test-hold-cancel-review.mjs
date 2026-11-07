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
  check(!('holdFee' in row) && !('fee' in row) && !('amountDue' in row), id + ' has no fee amount');
});
check(!('status' in fixtures['test-fixture-cancel-notice']), 'new cancellation notice omits status');
check(!('status' in fixtures['test-fixture-both-eligible']), 'eligible fixture omits status');
check(!('status' in fixtures['test-fixture-hold-blocked']), 'hold fixture omits status');
check(!('status' in fixtures['test-fixture-legacy-pending']), 'legacy pending omits status');
check(fixtures['test-fixture-legacy-processed'].status === 'processed', 'existing processed record keeps status');

check(crqIsPending(fixtures['test-fixture-cancel-notice']) === true, 'omitted status counts pending');
check(crqIsPending({ status: '' }) === true, 'empty status counts pending');
check(crqIsPending(fixtures['test-fixture-legacy-processed']) === false, 'processed status is not pending');

const cancelModel = crqReviewModel(fixtures['test-fixture-cancel-notice']);
check(cancelModel.pending === true, 'cancel notice model is pending');
check(cancelModel.noticeReceiptDate === '2026-10-08T05:00:00.000Z', 'notice receipt is the server field, not the older timestamp');
check(cancelModel.earliestCompletionDate === '2026-11-07', 'earliest completion is the server date');
check(cancelModel.earliestCompletionDate !== fixtures['test-fixture-cancel-notice'].holdStart, 'hold start is not used as the completion date');
check(cancelModel.combined === 'unknown', 'unknown good standing and payment stay unknown');
check(cancelModel.feesEnabled === false, 'fee policy is disabled');
check(cancelModel.reasons.length === 2, 'review reasons are read from the record');
check(cancelModel.agreement.present === true, 'agreement evidence is shown when the server stored it');

const half = crqReviewModel({ goodstanding: 'eligible', paymentVerification: 'unknown' });
check(half.combined === 'unknown', 'eligible good standing with unknown payment is not eligible');
check(crqReviewModel({ goodstanding: true, paymentVerification: true }).combined === 'unknown', 'booleans are not a trusted eligible state');
check(crqReviewModel({ goodstanding: 'yes', paymentVerification: 'yes' }).combined === 'unknown', 'unrecognized verification is unknown');
check(crqReviewModel({ goodstanding: 'not_eligible', paymentVerification: 'eligible' }).combined === 'not_eligible', 'a not-eligible check stays not eligible');
check(crqReviewModel({ goodstanding: 'eligible', paymentVerification: 'eligible' }).combined === 'eligible', 'both server eligible values display as eligible');

const nested = crqReviewModel({
  serverReview: {
    noticeReceiptDate: '2026-10-08T05:00:00.000Z',
    earliestCompletionDate: '2026-11-07',
    goodstanding: 'unknown',
    paymentVerification: 'unknown',
    reviewReasons: ['nested reason'],
    agreementEvidence: { acknowledged: true, version: 'hold-cancel-ack' },
  },
});
check(nested.noticeReceiptDate === '2026-10-08T05:00:00.000Z', 'serverReview.noticeReceiptDate is read');
check(nested.reasons[0] === 'nested reason', 'serverReview.reviewReasons is read');

const longAgreement = crqReviewModel({ agreementEvidence: 'x'.repeat(400) });
check(longAgreement.agreement.lines[0].indexOf('not expanded') >= 0, 'long agreement text is not expanded');

state.cancellationRequests = fixtures;
sandbox.__writes.length = 0;
const page = renderHoldsPage();
check(sandbox.__writes.length === 0, 'rendering the queue does not write');
check(page.indexOf('TEST FIXTURE Cancel Notice') >= 0, 'lead queue shows the labeled cancel fixture');
check(page.indexOf('data-crq-verification="unknown"') >= 0, 'unknown verification is marked unknown');
check(page.indexOf('data-crq-earliest="2026-11-07"') >= 0, 'server earliest date is displayed unchanged');
check(page.indexOf('data-crq-earliest="2026-09-01"') < 0, 'hold start is not displayed as the earliest date');
check(page.indexOf('data-hold-fee-policy="draft-disabled"') >= 0, 'hold fee policy is draft and disabled');
check(page.indexOf('data-crq-gymdesk="no-loader"') >= 0, 'missing Gymdesk loader is stated');
check(page.indexOf('data-crq-identity="typed"') >= 0, 'typed identity is marked unverified');
check(page.indexOf('Obligations unresolved') >= 0, 'review reasons render');
check(page.indexOf('Not a verified member link') >= 0 || page.indexOf('not a verified member link') >= 0, 'identity line is visible');
check((page.match(/● PENDING/g) || []).length === 4, 'four omitted-status fixtures are pending and the processed one is not');

const eligibleCard = renderHoldCard(Object.assign({ id: 'test-fixture-both-eligible' }, fixtures['test-fixture-both-eligible']));
check(eligibleCard.indexOf('data-crq-verification="eligible"') >= 0, 'both-eligible fixture can display eligible');
check(eligibleCard.indexOf('Staff still approve by hand') >= 0, 'eligible still requires a manual staff decision');
check(eligibleCard.indexOf('crqAutoComplete') < 0, 'there is no automatic completion control');

const legacyCard = renderHoldCard(Object.assign({ id: 'test-fixture-legacy-pending' }, fixtures['test-fixture-legacy-pending']));
check(legacyCard.indexOf('data-crq-notice="missing"') >= 0, 'legacy record without a notice date says it is not on the record');
check(legacyCard.indexOf('● PENDING') >= 0, 'legacy omitted status still shows pending');
check(crqStatusNeedsManualConfirm(fixtures['test-fixture-legacy-pending'], 'processed') === true, 'unknown legacy record needs a manual confirm before processed');
check(crqStatusNeedsManualConfirm(fixtures['test-fixture-both-eligible'], 'processed') === false, 'server-eligible record uses the existing status control');
check(crqStatusNeedsManualConfirm(fixtures['test-fixture-legacy-processed'], null) === false, 'clearing a status does not need the verification confirm');

sandbox.confirm = function () { return false; };
sandbox.__writes.length = 0;
crqSetStatus('test-fixture-cancel-notice', 'processed');
check(sandbox.__writes.length === 0, 'declining the manual confirm does not write status');

sandbox.confirm = function () { return true; };
sandbox.__writes.length = 0;
crqSetStatus('test-fixture-cancel-notice', 'processed');
check(sandbox.__writes.length === 1, 'accepting the confirm writes one field');
check(sandbox.__writes[0].path === 'cancellationRequests/test-fixture-cancel-notice/status', 'the only write is the existing status field');
check(sandbox.__writes[0].val === 'processed', 'status is the staff choice');

sandbox.__writes.length = 0;
crqSetStatus('test-fixture-both-eligible', 'frozen');
check(sandbox.__writes.length === 1 && sandbox.__writes[0].val === 'frozen', 'eligible status change still goes through the manual button');
check(sandbox.__writes[0].path.indexOf('goodstanding') < 0, 'status change does not write verification');

sandbox.location.hash = '#clock';
check(renderHoldCard(Object.assign({ id: 'test-fixture-cancel-notice' }, fixtures['test-fixture-cancel-notice'])) === '', 'kiosk clock does not render a request card');
sandbox.location.hash = '';

dashAuth.dashRole = 'frontdesk';
state.activeSection = 'holds';
const desk = renderMembersPage();
check(desk.indexOf('cancel-notice@example.test') < 0, 'front desk members page does not include request emails');
check(desk.indexOf('agreementEvidence') < 0, 'front desk members page does not include agreement evidence');
check(desk.indexOf('Holds &amp; Cancellations') < 0 && desk.indexOf('Holds & Cancellations') < 0, 'front desk does not get the holds tab');

asLead();
const scdMonthKey = grab('scdMonthKey');
state.cancellationRequests = {
  'test-fixture-scorecard': Object.assign({}, fixtures['test-fixture-cancel-notice'], {
    timestamp: scdMonthKey() + '-03T15:00:00.000Z',
    location: 'waunakee',
    action: 'Cancellation',
  }),
};
state.scorecardDaily = {};
const details = renderCancellationDetails('waunakee');
check(details.indexOf('Earliest') >= 0, 'scorecard shows the server earliest date');
check(details.indexOf('hold-cancel-ack') < 0, 'scorecard does not repeat agreement evidence');
check(details.indexOf('data-crq-gymdesk') < 0, 'scorecard does not repeat the verification panel');

if (failed) {
  console.error(failed + ' failed, ' + passed + ' passed');
  process.exit(1);
}
console.log(passed + ' passed');
