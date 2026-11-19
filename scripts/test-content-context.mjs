/**
 * Optional context note on Capture Content uploads.
 * Loads the dashboard script with Firebase and Storage stubbed.
 * No network and no writes to production.
 *
 *   node scripts/test-content-context.mjs
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
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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
  const el = { style: {}, className: '', id: '', value: '' };
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
  el.getAttribute = function () { return null; };
  el.addEventListener = function () {};
  el.focus = function () {};
  el.prepend = function () {};
  return el;
}
const documentStub = {
  getElementById() { return makeEl(); },
  createElement() { return makeEl(); },
  querySelectorAll() { return []; },
  addEventListener() {},
  documentElement: { style: {} },
  body: { appendChild() {}, prepend() {} },
  activeElement: null,
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
  navigator: { userAgent: 'content-context-test' },
  location: { hash: '', hostname: 'staff.lvlupma.com', search: '' },
  localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
  sessionStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
  firebase: {
    initializeApp() {},
    database() { return { ref: makeRef }; },
    storage() {
      return {
        ref(path) {
          return {
            put(blob, meta) {
              sandbox.__storage.push({ path, meta: meta || null, size: blob && blob.size || 0 });
              return Promise.resolve();
            },
            getDownloadURL() {
              return Promise.resolve('https://example.test/mock/' + path);
            },
          };
        },
      };
    },
    auth: authFn,
  },
  Chart: function Chart() { this.destroy = function () {}; },
  Sortable: { create() {} },
  L: { map() { return { setView() { return this; }, remove() {} }; } },
  addEventListener() {},
  removeEventListener() {},
  requestAnimationFrame(fn) { return fn && 0; },
  confirm() { return false; },
  alert(msg) { sandbox.__alerts.push(String(msg)); },
  __writes: [],
  __alerts: [],
  __storage: [],
  __renders: 0,
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
  render = function() { __renders++; };
`, sandbox);

function grab(name) {
  const value = vm.runInContext(name, sandbox);
  if (typeof value === 'undefined') throw new Error('Dashboard did not define ' + name);
  return value;
}

const state = grab('state');
const dashAuth = grab('dashAuth');
const contentContextText = grab('contentContextText');
const contentSubmissionPayload = grab('contentSubmissionPayload');
const renderContentCard = grab('renderContentCard');
const renderContentUploadBox = grab('renderContentUploadBox');
const renderStaffContentFeed = grab('renderStaffContentFeed');
const renderBufferHub = grab('renderBufferHub');
const marketingContentPosts = grab('marketingContentPosts');
const contentPillarsForEmp = grab('contentPillarsForEmp');
const getTaskWeekKey = grab('getTaskWeekKey');
const taskFieldScope = grab('taskFieldScope');
const CONTENT_CONTEXT_MAX = grab('CONTENT_CONTEXT_MAX');
const CONTENT_CONTEXT_PLACEHOLDER = grab('CONTENT_CONTEXT_PLACEHOLDER');

let failed = 0;
let passed = 0;
function check(cond, msg) {
  if (cond) { passed++; return; }
  failed++;
  console.error('FAIL: ' + msg);
}

const NOTE = '28 East Madison competitors at Kalahari, our biggest team ever.';
const WEEK = '2026-11-16';
const WEEK_KEY = getTaskWeekKey(WEEK);

check(CONTENT_CONTEXT_MAX === 1000, 'context cap is 1000 characters');
check(CONTENT_CONTEXT_PLACEHOLDER.indexOf('Context') < 0 && CONTENT_CONTEXT_PLACEHOLDER.indexOf('Kalahari') >= 0, 'placeholder names the Kalahari example');
check(contentContextText('  ' + NOTE + '  ') === NOTE, 'context trims surrounding space');
check(contentContextText('Ash\r\nline two') === 'Ash\nline two', 'context keeps a line break');
check(contentContextText('A\u0000B\u0007') === 'AB', 'context drops control characters');
check(contentContextText('   ') === '', 'blank context is empty');
check(contentContextText('x'.repeat(1000) + 'EXTRA') === 'x'.repeat(1000), 'context stops at 1000 characters');

state.tasksLoc = 'ash';
state.tasksDate = WEEK;
const form = renderContentUploadBox('weekly', 'cc_content', contentPillarsForEmp('ash'));
check(form.indexOf('>Context (optional)</label>') >= 0, 'upload form labels the context field');
check(form.indexOf('maxlength="1000"') >= 0, 'the textarea allows 1000 characters');
check(form.indexOf('<textarea id="ccctx_weekly_cc_content"') >= 0, 'context is a textarea on the weekly capture form');
check(form.indexOf(CONTENT_CONTEXT_PLACEHOLDER) >= 0, 'placeholder is on the textarea');
check(form.indexOf('data-content-context-field="1"') >= 0, 'the field is marked for the upload form');
check(taskFieldScope('ccctx_weekly_cc_content') === taskFieldScope('cccap_weekly_cc_content'), 'context drafts follow the same weekly scope as the caption');

const dirty = '<script>alert(1)</script>\n<img src=x onerror="alert(1)">';
const card = renderContentCard({
  id: 'cs_test',
  url: 'https://example.test/mock/team.jpg',
  type: 'image',
  brand: 'LVLUP',
  status: 'new',
  caption: 'East Madison at Kalahari',
  context: dirty,
  uploaderName: 'E. Madison (Ash)',
  school: 'eastmad',
});
const ctxAt = card.indexOf('data-content-context="1"');
const uploadedAt = card.indexOf('>Uploaded<');
const imgAt = card.indexOf('<img ');
check(imgAt >= 0 && uploadedAt > imgAt && ctxAt > uploadedAt, 'the note renders after the thumbnail and the Uploaded status');
check(card.indexOf('<script>') < 0 && card.indexOf('&lt;script&gt;') > ctxAt, 'the note is escaped instead of injected as HTML');
check(card.indexOf('&lt;img ') > ctxAt, 'a tag inside the note stays text');
check(card.indexOf('data-content-brand="LVLUP"') >= 0, 'the card keeps its LVLUP brand');
check(renderContentCard({ id: 'cs_plain', url: 'https://example.test/mock/plain.jpg', brand: 'LVLUP', status: 'new', caption: 'No note' }).indexOf('data-content-context') < 0, 'a photo without a note does not show an empty context block');

const built = contentSubmissionPayload({
  url: 'https://example.test/mock/team.jpg',
  path: 'taskPhotos/content/ash/team.jpg',
  type: 'image',
  name: 'team.jpg',
  sizeBytes: 40,
  uploaderId: 'ash',
  uploaderName: 'E. Madison (Ash)',
  school: 'eastmad',
  brand: 'LVLUP',
  pillar: 'Student Wins',
  caption: 'East Madison at Kalahari',
  context: '  ' + NOTE + '  ',
  week: WEEK_KEY,
  at: 1,
});
check(built.stored.context === NOTE && built.meta.context === NOTE, 'the note is stored on the submission and the task upload copy');
check(built.stored.status === 'new' && built.stored.caption === 'East Madison at Kalahari' && built.stored.brand === 'LVLUP', 'caption, brand, and status stay on the record');
check(!Object.prototype.hasOwnProperty.call(contentSubmissionPayload({ caption: 'only' }).stored, 'context'), 'an empty note is left off the record');

function seedPosts() {
  state.contentSubmissions = {
    cs_kalahari: {
      url: 'https://example.test/mock/kalahari.jpg',
      type: 'image',
      uploaderId: 'ash',
      empId: 'ash',
      uploaderName: 'E. Madison (Ash)',
      school: 'eastmad',
      brand: 'LVLUP',
      pillar: 'Student Wins',
      caption: 'East Madison at Kalahari',
      context: NOTE,
      week: WEEK_KEY,
      at: Date.parse('2026-11-18T15:00:00Z'),
      status: 'new',
    },
    cs_ninja: {
      url: 'https://example.test/mock/ninja.jpg',
      type: 'image',
      uploaderId: 'mirandaS',
      empId: 'mirandaS',
      uploaderName: 'Go Ninja (Miranda)',
      school: 'goninjaW',
      brand: 'GO NINJA',
      caption: 'Open gym',
      context: 'Go Ninja only. This note stays off the LVLUP list.',
      week: WEEK_KEY,
      at: Date.parse('2026-11-18T14:00:00Z'),
      status: 'new',
    },
  };
  state.tasksData = { ash: {}, mirandaS: {} };
  state.tasksDate = WEEK;
}

seedPosts();
state.tasksLoc = 'ash';
dashAuth.isAdmin = false;
dashAuth.dashRole = 'lead';
dashAuth.empId = 'ash';
const ashFeed = renderStaffContentFeed('weekly', 'cc_content');
check(ashFeed.indexOf('data-brand-feed="LVLUP"') >= 0, 'Ash’s feed is LVLUP');
check(ashFeed.indexOf(NOTE) >= 0, 'Ash’s listing shows the Kalahari note');
check(ashFeed.indexOf('Go Ninja only') < 0, 'Ash’s listing hides the Go Ninja note');

state.tasksLoc = 'mirandaS';
dashAuth.empId = 'mirandaS';
const ninjaFeed = renderStaffContentFeed('weekly', 'cc_content');
check(ninjaFeed.indexOf('data-brand-feed="GO NINJA"') >= 0, 'Miranda’s feed is Go Ninja');
check(ninjaFeed.indexOf('Go Ninja only') >= 0, 'Miranda’s listing shows the Go Ninja note');
check(ninjaFeed.indexOf(NOTE) < 0, 'Miranda’s listing hides the LVLUP note');

dashAuth.isAdmin = true;
dashAuth.dashRole = 'admin';
dashAuth.empId = 'ash';
state.mktBrandFilter = 'LVLUP';
const lvlupHub = renderBufferHub();
check(lvlupHub.indexOf(NOTE) >= 0 && lvlupHub.indexOf('Go Ninja only') < 0, 'the LVLUP marketing list shows only the LVLUP note');
state.mktBrandFilter = 'GO NINJA';
const ninjaHub = renderBufferHub();
check(ninjaHub.indexOf('Go Ninja only') >= 0 && ninjaHub.indexOf(NOTE) < 0, 'the Go Ninja marketing list shows only the Go Ninja note');
check(marketingContentPosts('LVLUP').every(r => r.brand === 'LVLUP'), 'LVLUP post filter stays on LVLUP');
check(marketingContentPosts('GO NINJA').every(r => r.brand === 'GO NINJA'), 'Go Ninja post filter stays on Go Ninja');

state.tasksLoc = 'ash';
state.tasksDate = WEEK;
state.tasksData = { ash: {} };
state.taskInputDrafts = {
  cccap_weekly_cc_content: { scope: taskFieldScope('cccap_weekly_cc_content'), value: 'East Madison at Kalahari' },
  ccctx_weekly_cc_content: { scope: taskFieldScope('ccctx_weekly_cc_content'), value: '  ' + NOTE + '\nParents stayed to cheer.  ' },
};
sandbox.__writes.length = 0;
sandbox.__alerts.length = 0;
sandbox.__storage.length = 0;
sandbox.__renders = 0;
const fields = {
  ccpillar_weekly_cc_content: { value: 'Student Wins' },
  cccap_weekly_cc_content: { value: 'East Madison at Kalahari' },
  ccctx_weekly_cc_content: { value: '  ' + NOTE + '\nParents stayed to cheer.  ' },
  ccstat_weekly_cc_content: makeEl(),
};
documentStub.getElementById = function (id) { return fields[id] || makeEl(); };
await vm.runInContext(`contentUploadFiles('weekly','cc_content',[
  { name:'team-a.gif', type:'image/gif', size:20 },
  { name:'team-b.gif', type:'image/gif', size:21 },
])`, sandbox);

const submissions = sandbox.__writes.filter(w => String(w.path).indexOf('contentSubmissions/cs_') === 0);
const copies = sandbox.__writes.filter(w => String(w.path).indexOf('/uploads/cs_') >= 0);
check(sandbox.__alerts.length === 0, 'the mocked upload does not alert: ' + sandbox.__alerts.join(' | '));
check(sandbox.__storage.length === 2 && sandbox.__storage.every(p => String(p.path).indexOf('taskPhotos/content/ash/') === 0), 'photos go to the mocked content storage path');
check(sandbox.__storage.every(p => String(p.path).indexOf('firebasestorage') < 0), 'storage stub does not target a live bucket');
check(submissions.length === 2, 'one contentSubmissions record per file');
check(submissions.every(w => w.val && w.val.context === NOTE + '\nParents stayed to cheer.' && w.val.brand === 'LVLUP' && w.val.status === 'new' && w.val.caption === 'East Madison at Kalahari'), 'both photos keep the same trimmed note, brand, caption, and status');
check(copies.length === 2 && copies.every(w => w.val && w.val.context === NOTE + '\nParents stayed to cheer.'), 'the task upload copy keeps the note');
check(copies.every(w => String(w.path).indexOf('tasks/emp/ash/weekly/' + WEEK_KEY + '/cc_content/uploads/') === 0), 'the copy is on this week’s Capture Content task');
check(sandbox.__renders === 1, 'a successful upload redraws once');
check(fields.ccctx_weekly_cc_content.value === '' && fields.cccap_weekly_cc_content.value === '', 'the form clears the note and caption after upload');
check(!state.taskInputDrafts.ccctx_weekly_cc_content && !state.taskInputDrafts.cccap_weekly_cc_content, 'cleared notes are not restored from the draft');

sandbox.__writes.length = 0;
fields.ccctx_weekly_cc_content.value = '   ';
await vm.runInContext(`contentUploadFiles('weekly','cc_content',[{ name:'plain.gif', type:'image/gif', size:8 }])`, sandbox);
const blank = sandbox.__writes.find(w => String(w.path).indexOf('contentSubmissions/cs_') === 0);
check(blank && !Object.prototype.hasOwnProperty.call(blank.val, 'context'), 'whitespace-only context is not written');

state.tasksLoc = 'mirandaS';
sandbox.__writes.length = 0;
fields.ccctx_weekly_cc_content.value = 'Ninja story';
await vm.runInContext(`contentUploadFiles('weekly','cc_content',[{ name:'gym.gif', type:'image/gif', size:8 }])`, sandbox);
const ninjaWrite = sandbox.__writes.find(w => String(w.path).indexOf('contentSubmissions/cs_') === 0);
check(ninjaWrite && ninjaWrite.val.brand === 'GO NINJA' && ninjaWrite.val.context === 'Ninja story' && ninjaWrite.val.school === 'goninjaW', 'a Go Ninja upload stores its own brand with the note');

if (failed) {
  console.error(failed + ' failed, ' + passed + ' passed');
  process.exit(1);
}
console.log(passed + ' passed');
