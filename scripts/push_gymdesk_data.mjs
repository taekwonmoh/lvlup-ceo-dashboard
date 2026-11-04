#!/usr/bin/env node
/**
 * Push a GymDesk snapshot to Firebase Realtime Database at finance/gymdesk,
 * and the director-facing aggregates at finance/plannerBaseline.
 *
 *   node scripts/push_gymdesk_data.mjs <path-to-gymdesk_data.json>
 *   node scripts/push_gymdesk_data.mjs --dry-run <path-to-gymdesk_data.json>
 *
 * Credentials — a service account. It bypasses security rules, which is the
 * only write path. Dashboard users cannot write this node.
 *   GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/key.json
 *   or FIREBASE_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}'
 * Optional:
 *   FIREBASE_DATABASE_URL  (default https://lvlup-members-app-default-rtdb.firebaseio.com)
 *
 * Keep the JSON file outside this git repo. This script only reads it.
 * One-time seed and the twice-a-day refresh use the same command.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';

const RTDB_PATH = 'finance/gymdesk';
const BASELINE_PATH = 'finance/plannerBaseline';
const DEFAULT_DB = 'https://lvlup-members-app-default-rtdb.firebaseio.com';
// GymDesk snapshot keys → canonical dashboard location ids. east_madison is
// eastmad here (never eastmadison). Go Ninja is goninjaW / goninjaV.
const GD_KEY_TO_LOC = {
  waunakee: 'waunakee',
  east_madison: 'eastmad',
  verona: 'verona',
  deforest: 'deforest',
  go_ninja_waunakee: 'goninjaW',
  go_ninja_verona: 'goninjaV'
};
const MAX_BYTES = 2 * 1024 * 1024;
const MONTH_FIELDS = ['paying_members', 'memberships', 'sales_pos', 'pending', 'total', 'per_member'];
const PII_KEYS = new Set([
  'email', 'phone', 'phonenumber', 'mobile', 'firstname', 'lastname', 'membername',
  'guardian', 'address', 'dob', 'birthdate', 'ssn', 'password', 'pin'
]);
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const BAD_KEY = /[.#$[\]/]/;

function die(code, msg) {
  console.error(msg);
  process.exit(code);
}

function loadServiceAccount() {
  const inline = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (inline && inline.trim()) {
    try { return JSON.parse(inline); }
    catch (e) { die(3, 'FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON (' + e.message + ').'); }
  }
  const path = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!path) die(3, 'Set GOOGLE_APPLICATION_CREDENTIALS (path to the service-account JSON) or FIREBASE_SERVICE_ACCOUNT_JSON (the JSON itself).');
  try { return JSON.parse(fs.readFileSync(path, 'utf8')); }
  catch (e) { die(3, 'Could not read GOOGLE_APPLICATION_CREDENTIALS: ' + e.message); }
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64url');
}

async function accessToken(sa) {
  if (!sa || sa.type !== 'service_account' || !sa.client_email || !sa.private_key) {
    die(3, 'The credential is not a service-account JSON key (need type, client_email, private_key).');
  }
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  }));
  const unsigned = header + '.' + claim;
  let sig;
  try {
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(unsigned);
    sig = sign.sign(sa.private_key).toString('base64url');
  } catch (e) {
    die(3, 'Could not sign with the service-account private key (' + e.message + ').');
  }
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: unsigned + '.' + sig
  });
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) {
    die(3, 'Google token exchange failed (' + res.status + '). The service account needs role Firebase Realtime Database Admin. ' + (json.error_description || json.error || ''));
  }
  return { token: json.access_token, email: sa.client_email };
}

function checkKey(key, path) {
  if (typeof key !== 'string' || !key) die(2, 'Empty key at ' + path);
  if (BAD_KEY.test(key) || key === '__proto__' || key === 'constructor' || key === 'prototype') {
    die(2, 'Key not allowed in Realtime Database at ' + path + '/' + key);
  }
  if (PII_KEYS.has(key.toLowerCase())) die(2, 'Refusing PII-like field "' + key + '" at ' + path);
}

function walk(node, path) {
  if (node == null || typeof node === 'number' || typeof node === 'boolean') return;
  if (typeof node === 'string') {
    if (EMAIL_RE.test(node)) die(2, 'Refusing a string that looks like an email at ' + path + '. This snapshot must stay aggregate.');
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((v, i) => walk(v, path + '[' + i + ']'));
    return;
  }
  if (typeof node === 'object') {
    Object.keys(node).forEach(k => {
      checkKey(k, path);
      walk(node[k], path + '/' + k);
    });
    return;
  }
  die(2, 'Unsupported value at ' + path);
}

function num(row, field, path) {
  const v = row[field];
  if (typeof v !== 'number' || !Number.isFinite(v)) die(2, path + '.' + field + ' must be a finite number');
  return v;
}

function checkMonth(row, path) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) die(2, path + ' must be an object');
  MONTH_FIELDS.forEach(f => num(row, f, path));
  if (typeof row.is_partial !== 'boolean') die(2, path + '.is_partial must be true or false');
  const sum = row.memberships + row.sales_pos + row.pending;
  if (Math.abs(sum - row.total) > 0.05) {
    die(2, path + ' total ' + row.total + ' != memberships + sales_pos + pending (' + sum.toFixed(2) + ')');
  }
}

function validate(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) die(2, 'Root value must be a JSON object');
  if (typeof data.schema_version !== 'string' || !/^\d+\.\d+\.\d+$/.test(data.schema_version)) {
    die(2, 'schema_version must be a semver string');
  }
  if (typeof data.as_of !== 'string' || !Number.isFinite(Date.parse(data.as_of))) die(2, 'as_of must be an ISO date string');
  if (data.currency !== 'USD') die(2, 'currency must be "USD"');
  if (typeof data.pii !== 'string' || !data.pii.trim()) die(2, 'pii must be a non-empty string declaring that the file has no member PII');
  walk(data, '');
  const groups = data.groups;
  if (!groups || !Array.isArray(groups.lvlup_only) || !Array.isArray(groups.go_ninja) || !Array.isArray(groups.all_in)) {
    die(2, 'groups.lvlup_only, groups.go_ninja, and groups.all_in must be arrays of location keys');
  }
  if (!groups.all_in.length) die(2, 'groups.all_in is empty');
  const locs = (data.franchise_revenue_2026 || {}).locations;
  if (!locs || typeof locs !== 'object') die(2, 'franchise_revenue_2026.locations is required');
  groups.all_in.forEach(key => {
    if (typeof key !== 'string') die(2, 'location key must be a string');
    if (!data.locations || !data.locations[key] || typeof data.locations[key].label !== 'string') {
      die(2, 'locations.' + key + '.label is required');
    }
    const node = locs[key];
    if (!node || !node.months || !node.ytd_totals) die(2, 'franchise revenue for ' + key + ' needs months and ytd_totals');
    Object.keys(node.months).forEach(mk => {
      if (!/^\d{4}-\d{2}$/.test(mk)) die(2, 'month key ' + mk + ' on ' + key + ' must look like 2026-11');
      checkMonth(node.months[mk], key + ' ' + mk);
    });
    MONTH_FIELDS.forEach(f => num(node.ytd_totals, f, key + ' ytd'));
  });
  const lvl = new Set(groups.lvlup_only);
  groups.lvlup_only.concat(groups.go_ninja).forEach(k => {
    if (!groups.all_in.includes(k)) die(2, k + ' is in a brand group but not in groups.all_in');
  });
  if (!groups.lvlup_only.length) die(2, 'groups.lvlup_only is empty');
  return { lvlupOnly: [...lvl] };
}

function cents(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }

// Aggregates only: expected billing (memberships + sales_pos + pending) and
// paying members for each school-month. Directors read this node; they do
// not get finance/gymdesk. A full PUT replaces the node so it matches the snapshot.
function buildPlannerBaseline(data) {
  const out = {};
  const locs = data.franchise_revenue_2026.locations;
  data.groups.all_in.forEach(key => {
    const locId = GD_KEY_TO_LOC[key];
    if (!locId) {
      die(2, 'No planner location id for GymDesk key "' + key + '". Add it to GD_KEY_TO_LOC (canonical ids: waunakee, eastmad, verona, deforest, goninjaW, goninjaV).');
    }
    const months = (locs[key] && locs[key].months) || {};
    out[locId] = {};
    Object.keys(months).forEach(mk => {
      const row = months[mk];
      out[locId][mk] = {
        expected_billing: cents(row.memberships + row.sales_pos + row.pending),
        paying_members: row.paying_members,
        as_of: data.as_of
      };
    });
  });
  return out;
}

function summary(data) {
  const keys = data.groups.all_in;
  const locs = data.franchise_revenue_2026.locations;
  const total = keys.reduce((s, k) => s + locs[k].ytd_totals.total, 0);
  const money = '$' + total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return 'schema ' + data.schema_version + '  as_of ' + data.as_of + '  locations ' + keys.length + '  ytd_all ' + money;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h') || !args.length) {
    console.log('Usage: node scripts/push_gymdesk_data.mjs [--dry-run] <path-to-gymdesk_data.json>');
    process.exit(args.length ? 0 : 1);
  }
  const dry = args.includes('--dry-run') || args.includes('--check');
  const file = args.find(a => !a.startsWith('--'));
  if (!file) die(1, 'Pass the path to gymdesk_data.json.');
  let raw;
  try { raw = fs.readFileSync(file); }
  catch (e) { die(1, 'Could not read ' + file + ': ' + e.message); }
  if (raw.length > MAX_BYTES) die(2, file + ' is ' + raw.length + ' bytes; refusing anything over ' + MAX_BYTES + '.');
  let data;
  try { data = JSON.parse(raw.toString('utf8')); }
  catch (e) { die(2, 'Not JSON: ' + e.message); }
  validate(data);
  const baseline = buildPlannerBaseline(data);
  const baseMonths = Object.keys(baseline).reduce((s, k) => s + Object.keys(baseline[k]).length, 0);
  const line = summary(data);
  const baseLine = 'plannerBaseline schools ' + Object.keys(baseline).length + ' months ' + baseMonths;
  if (dry) {
    console.log('dry-run ok  ' + line + '  ' + baseLine + '  (not written)');
    return;
  }
  const dbUrl = (process.env.FIREBASE_DATABASE_URL || DEFAULT_DB).replace(/\/$/, '');
  const { token, email } = await accessToken(loadServiceAccount());
  const url = dbUrl + '/' + RTDB_PATH + '.json?access_token=' + encodeURIComponent(token);
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    die(4, 'Write to ' + RTDB_PATH + ' failed (' + res.status + '). ' + text.slice(0, 300));
  }
  const baseUrl = dbUrl + '/' + BASELINE_PATH + '.json?access_token=' + encodeURIComponent(token);
  const res2 = await fetch(baseUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(baseline)
  });
  if (!res2.ok) {
    const text = await res2.text().catch(() => '');
    die(4, 'Wrote ' + RTDB_PATH + ' but ' + BASELINE_PATH + ' failed (' + res2.status + '). ' + text.slice(0, 300));
  }
  console.log('wrote ' + RTDB_PATH + ' and ' + BASELINE_PATH + '  ' + line + '  ' + baseLine + '  as ' + email);
}

main().catch(e => die(1, e && e.stack ? e.stack : String(e)));
