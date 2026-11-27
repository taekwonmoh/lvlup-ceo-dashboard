import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { signToken } from '../src/auth.ts';
import { CrmError } from '../src/errors.ts';
import {
  QBO_AS_OF,
  QBO_CATEGORY_IDS,
  QBO_CSV_HEADER,
  QBO_JOURNAL_HEADER,
  QBO_SANDBOX_LINES,
  applyMappingEdits,
  buildQuickbooksExport,
  defaultCatalog,
  dollarsToCents,
  parseCsv,
  processingFeeCents,
  type QboExport,
  type StoredMapRow,
} from '../src/qbo-export.ts';
import { type MapPool } from '../src/qbo-export-routes.ts';
import { dispatchCrm, unconfiguredPool } from '../worker/src/routes.ts';

const SECRET = 'test-only-secret';
const root = dirname(fileURLToPath(import.meta.url));

const CATEGORIES = [
  ['tuition', 'Tuition', '4010 LVLUP Tuition'],
  ['events', 'Events', '4020 LVLUP Events'],
  ['tournaments', 'Tournaments', '4030 LVLUP Tournaments'],
  ['retail', 'Retail / Pro Shop', '4040 LVLUP Retail'],
  ['private_lessons', 'Private Lessons', '4050 LVLUP Private Lessons'],
  ['lvlup_parties', 'LVLUP Birthday Parties', '4060 LVLUP Birthday Parties'],
  ['gn_classes', 'Go Ninja Classes', '4110 Go Ninja Classes'],
  ['gn_after_school', 'Go Ninja After School', '4120 Go Ninja After School'],
  ['gn_summer_camp', 'Go Ninja Summer Camp', '4130 Go Ninja Summer Camp'],
  ['gn_events', 'Go Ninja Events', '4140 Go Ninja Events'],
  ['gn_parties', 'Go Ninja Birthday Parties', '4150 Go Ninja Birthday Parties'],
  ['gn_retail', 'Go Ninja Retail', '4160 Go Ninja Retail'],
] as const;

function november() {
  return buildQuickbooksExport({ entity: 'all', period: 'month', asOf: QBO_AS_OF });
}

function columnSums(csv: string) {
  const rows = parseCsv(csv);
  assert.deepEqual(rows[0], [...QBO_CSV_HEADER]);
  let gross = 0;
  let refunds = 0;
  let fees = 0;
  let net = 0;
  const schools = new Set<string>();
  for (const row of rows.slice(1)) {
    assert.equal(row.length, QBO_CSV_HEADER.length);
    const grossCents = dollarsToCents(row[6]);
    const refundCents = dollarsToCents(row[7]);
    const feeCents = dollarsToCents(row[8]);
    const netCents = dollarsToCents(row[9]);
    assert.equal(netCents, grossCents - refundCents - feeCents, row.join('|'));
    gross += grossCents;
    refunds += refundCents;
    fees += feeCents;
    net += netCents;
    schools.add(row[2]);
  }
  return { gross, refunds, fees, net, schools, rows };
}

function journalSums(csv: string) {
  const rows = parseCsv(csv);
  assert.deepEqual(rows[0], [...QBO_JOURNAL_HEADER]);
  let debits = 0;
  let credits = 0;
  const batches = new Map<string, { debit: number; credit: number }>();
  for (const row of rows.slice(1)) {
    const debit = dollarsToCents(row[3]);
    const credit = dollarsToCents(row[4]);
    assert.equal(debit > 0 && credit > 0, false);
    debits += debit;
    credits += credit;
    const batch = batches.get(row[0]) || { debit: 0, credit: 0 };
    batch.debit += debit;
    batch.credit += credit;
    batches.set(row[0], batch);
  }
  for (const [journalNo, batch] of batches) {
    assert.equal(batch.debit, batch.credit, journalNo);
  }
  return { debits, credits, batches };
}

test('the chart has all 12 LVLUP and Go Ninja categories plus the deposit accounts', () => {
  assert.equal(QBO_CATEGORY_IDS.length, 12);
  const catalog = defaultCatalog();
  assert.deepEqual(catalog.categories.map(row => row.id), CATEGORIES.map(row => row[0]));
  for (const [id, name, account] of CATEGORIES) {
    const row = catalog.categories.find(item => item.id === id);
    assert.equal(row?.name, name);
    assert.equal(row?.accountName, account);
  }
  assert.equal(catalog.accounts.find(row => row.id === 'acct_refunds')?.accountName, '4900 Refunds');
  assert.equal(catalog.accounts.find(row => row.id === 'acct_fees')?.accountName, '6100 Processing Fees');
  assert.equal(catalog.accounts.find(row => row.id === 'acct_credits')?.accountName, '2300 Family Credits');
  assert.equal(catalog.accounts.find(row => row.id === 'acct_deposit')?.accountName, '1200 Undeposited Funds');
  assert.equal(processingFeeCents(22400, 'card'), 680);
  assert.equal(processingFeeCents(10000, 'card'), 320);
  assert.equal(processingFeeCents(4500, 'cash'), 0);
});

test('November shows every category, and Net equals Gross minus Refunds minus Fees', () => {
  const report = november();
  assert.equal(report.charged, false);
  assert.equal(report.submitted, false);
  assert.equal(report.synced, false);
  assert.equal(report.qboSyncEnabled, false);
  assert.equal(report.entities.length, 3);
  for (const [id] of CATEGORIES) {
    const gross = report.summary.categories.find(row => row.id === id)?.grossCents || 0;
    assert.ok(gross > 0, id);
  }
  assert.equal(report.summary.formulaOk, true);
  assert.equal(report.summary.balanced, true);
  assert.equal(report.summary.netCents, report.summary.grossCents - report.summary.refundCents - report.summary.feeCents);
  assert.equal(report.summary.depositCents, report.summary.netCents - report.summary.creditCents);
  assert.ok(report.summary.creditCents > 0);
  assert.ok(report.summary.feeCents > 0);
  assert.ok(report.summary.refundCents > 0);
  const lines = QBO_SANDBOX_LINES.filter(line => line.on >= '2026-11-01' && line.on <= '2026-11-30');
  const gross = lines.reduce((sum, line) => sum + line.grossCents, 0);
  assert.equal(report.summary.grossCents, gross);
});

test('each deposit batch balances, including a refund-only day', () => {
  const report = november();
  let debits = 0;
  let credits = 0;
  for (const entity of report.entities) {
    assert.equal(entity.journal.balanced, true);
    assert.equal(entity.journal.debitCents, entity.journal.creditCents);
    assert.equal(entity.totals.depositCents, entity.totals.grossCents - entity.totals.refundCents - entity.totals.feeCents - entity.totals.creditCents);
    const parsed = journalSums(entity.journalCsv);
    assert.equal(parsed.debits, parsed.credits);
    assert.equal(parsed.debits, entity.journal.debitCents);
    debits += parsed.debits;
    credits += parsed.credits;
    const sheet = columnSums(entity.csv);
    assert.equal(sheet.net, entity.totals.depositCents);
  }
  assert.equal(debits, credits);
  const moh = report.entities.find(entity => entity.id === 'moh');
  assert.ok(moh);
  const refundDay = parseCsv(moh.journalCsv).filter(row => row[0] === 'JE-moh-20261127');
  assert.ok(refundDay.length >= 2);
  const bank = refundDay.find(row => row[2] === '1200 Undeposited Funds');
  assert.ok(bank);
  assert.equal(bank[3], '');
  assert.equal(dollarsToCents(bank[4]), 500);
  const refund = refundDay.find(row => row[2] === '4900 Refunds');
  assert.equal(dollarsToCents(refund?.[3] || ''), 500);
});

test('LLCs never share schools or dollars', () => {
  const moh = buildQuickbooksExport({ entity: 'moh', period: 'month', asOf: QBO_AS_OF });
  const east = buildQuickbooksExport({ entity: 'lvlup2', period: 'month', asOf: QBO_AS_OF });
  const verona = buildQuickbooksExport({ entity: 'lvlup3', period: 'month', asOf: QBO_AS_OF });
  const mohSchools = columnSums(moh.entities[0].csv).schools;
  assert.deepEqual([...mohSchools].sort(), ['DeForest', 'Go Ninja Waunakee', 'Waunakee']);
  const eastSchools = columnSums(east.entities[0].csv).schools;
  assert.deepEqual([...eastSchools], ['East Madison']);
  assert.equal(east.entities[0].csv.includes('Go Ninja'), false);
  assert.equal(east.entities[0].csv.includes('Waunakee'), false);
  const veronaSchools = columnSums(verona.entities[0].csv).schools;
  assert.deepEqual([...veronaSchools].sort(), ['Go Ninja Verona', 'Verona']);
  assert.equal(verona.entities[0].csv.includes('Waunakee'), false);
  assert.equal(verona.entities[0].csv.includes('East Madison'), false);
  assert.equal(verona.entities[0].csv.includes('DeForest'), false);
  assert.ok(east.summary.grossCents > 0);
  assert.equal(moh.summary.grossCents + east.summary.grossCents + verona.summary.grossCents, november().summary.grossCents);
  for (const id of ['gn_classes', 'gn_after_school', 'gn_summer_camp', 'gn_events', 'gn_parties', 'gn_retail']) {
    assert.equal(east.entities[0].categories.find(row => row.id === id)?.grossCents, 0);
  }
});

test('this month, last month, and a custom day do not leak outside the range', () => {
  const current = buildQuickbooksExport({ entity: 'moh', period: 'month', asOf: QBO_AS_OF });
  const last = buildQuickbooksExport({ entity: 'all', period: 'last', asOf: QBO_AS_OF });
  const day = buildQuickbooksExport({ entity: 'moh', period: 'custom', from: '2026-11-03', through: '2026-11-03', asOf: QBO_AS_OF });
  assert.equal(current.period.from, '2026-11-01');
  assert.equal(current.period.through, '2026-11-30');
  assert.equal(last.period.from, '2026-10-01');
  assert.equal(last.period.through, '2026-10-31');
  assert.equal(current.entities[0].csv.includes('2026-10-06'), false);
  assert.equal(current.entities[0].csv.includes('2026-09-15'), false);
  assert.equal(current.entities[0].csv.includes('2026-12-02'), false);
  assert.equal(last.summaryCsv.includes('2026-11-'), false);
  const octoberTuition = QBO_SANDBOX_LINES.find(line => line.id === 'oct-wk-tuition');
  assert.equal(last.entities.find(entity => entity.id === 'moh')?.categories.find(row => row.id === 'tuition')?.grossCents, octoberTuition?.grossCents);
  assert.equal(day.entities[0].categories.find(row => row.id === 'tuition')?.grossCents, 22400);
  assert.equal(day.entities[0].categories.find(row => row.id === 'events')?.grossCents, 0);
  const avery = columnSums(day.entities[0].csv);
  assert.equal(avery.gross, 22400);
  assert.equal(avery.fees, 680);
  assert.equal(avery.net, 22400 - 680);
});

test('CSV is RFC4180 and an edited account name is the one Richelle saved', () => {
  const catalog = applyMappingEdits(defaultCatalog(), [
    { id: 'tuition', accountName: '4010 Tuition, LVLUP', className: 'LVLUP Classes' },
    { id: 'waunakee', className: '01 Waunakee' },
  ]);
  const report = buildQuickbooksExport({ entity: 'moh', period: 'custom', from: '2026-11-03', through: '2026-11-06', asOf: QBO_AS_OF, catalog });
  assert.match(report.entities[0].csv, /\r\n/);
  const rows = parseCsv(report.entities[0].csv);
  const tuition = rows.find(row => row[3] === 'Tuition' && row[0] === '2026-11-03');
  assert.ok(tuition);
  assert.equal(tuition[1], "Moh's Martial Arts LLC");
  assert.equal(tuition[2], '01 Waunakee');
  assert.equal(tuition[4], '4010 Tuition, LVLUP');
  assert.match(report.entities[0].csv, /"4010 Tuition, LVLUP"/);
  const hayden = rows.find(row => row[0] === '2026-11-06' && row[3] === 'Tuition');
  assert.equal(hayden?.[10], 'Hayden Sample, family credit');
  const credit = rows.find(row => row[0] === '2026-11-06' && row[3] === 'Family Credits');
  assert.equal(credit?.[4], '2300 Family Credits');
  assert.equal(dollarsToCents(credit?.[7] || ''), 2500);
  assert.equal(dollarsToCents(credit?.[9] || ''), -2500);
  const quoted = buildQuickbooksExport({ entity: 'lvlup3', period: 'custom', from: '2026-11-20', through: '2026-11-20', asOf: QBO_AS_OF });
  const clinic = parseCsv(quoted.entities[0].csv).find(row => row[3] === 'Events');
  assert.equal(clinic?.[10], 'Blake Sample "clinic"');
  assert.match(quoted.entities[0].csv, /"Blake Sample ""clinic"""/);
  assert.throws(() => applyMappingEdits(defaultCatalog(), [{ id: 'nope', accountName: '4000' }]), (err: unknown) => err instanceof CrmError && err.code === 'unknown_category');
  assert.throws(() => applyMappingEdits(defaultCatalog(), [{ id: 'tuition', accountName: 'sms:now' }]), (err: unknown) => err instanceof CrmError && err.code === 'bad_account');
});

test('all three entities download as separate files plus a summary', () => {
  const report = november();
  assert.equal(report.files.length, 4);
  assert.deepEqual(report.files.map(file => file.kind), ['csv', 'csv', 'csv', 'summary']);
  assert.deepEqual(report.files.map(file => file.entityId), ['moh', 'lvlup2', 'lvlup3', 'all']);
  const summary = parseCsv(report.summaryCsv);
  assert.equal(summary[1][0], "Moh's Martial Arts LLC");
  assert.equal(summary[2][0], 'LVLUP Martial Arts 2 LLC');
  assert.equal(summary[3][0], 'LVLUP Martial Arts 3 LLC');
  assert.equal(summary[4][0], 'TOTAL');
  assert.equal(summary[4][10], 'yes');
  assert.equal(dollarsToCents(summary[4][7]), report.summary.depositCents);
  assert.equal(dollarsToCents(summary[1][7]) + dollarsToCents(summary[2][7]) + dollarsToCents(summary[3][7]), report.summary.depositCents);
  const one = buildQuickbooksExport({ entity: 'lvlup2', period: 'month', asOf: QBO_AS_OF });
  assert.equal(one.files.length, 1);
  assert.equal(one.files[0].kind, 'csv');
});

function token(role: 'admin' | 'staff', canFinance = false) {
  return signToken({
    role,
    email: role + '@example.test',
    locationIds: ['waunakee'],
    familyIds: [],
    memberId: null,
    canFinance,
  }, SECRET);
}

async function dispatch(method: string, path: string, role: 'admin' | 'staff', body?: unknown, pool?: MapPool, canFinance = role === 'admin', env: Record<string, string> = {}) {
  return dispatchCrm({
    method,
    url: new URL('https://crm.test' + path),
    authorization: 'Bearer ' + token(role, canFinance),
    readBody: async () => body == null ? '' : JSON.stringify(body),
    pool: (pool || unconfiguredPool()) as never,
    env: {
      AUTHORIZENET_MODE: 'sandbox',
      BILLING_CHARGES_ENABLED: '0',
      QBO_ENABLED: '0',
      QBO_SYNC_ENABLED: '0',
      ...env,
    },
    tokenSecret: SECRET,
    allowLocalTokens: true,
  });
}

function memoryPool() {
  const rows = new Map<string, StoredMapRow>();
  const pool: MapPool = {
    async query(sql: string, params?: unknown[]) {
      if (sql.startsWith('select id, kind')) return { rows: [...rows.values()] };
      if (sql.startsWith('insert into qbo_category_mappings')) {
        const [id, kind, brand, name, account, klass, sort] = params || [];
        rows.set(String(id), {
          id: String(id),
          kind: String(kind),
          brand: String(brand),
          name: String(name),
          qbo_account_name: String(account),
          qbo_class_name: String(klass),
          sort_order: Number(sort),
        });
        return { rows: [] };
      }
      throw new Error('unexpected sql');
    },
  };
  return { pool, rows };
}

test('the export route stays a file, finance-only, and offline', async () => {
  const denied = await dispatch('GET', '/v1/financials/quickbooks-export?entity=all&period=month&asOf=2026-11-27', 'staff');
  assert.equal(denied.status, 403);
  assert.equal((denied.body as { error: { code: string } }).error.code, 'forbidden');

  const preview = await dispatch('GET', '/v1/financials/quickbooks-export?entity=all&period=month&asOf=2026-11-27', 'admin');
  assert.equal(preview.status, 200);
  const body = preview.body as QboExport;
  assert.equal(body.charged, false);
  assert.equal(body.submitted, false);
  assert.equal(body.synced, false);
  assert.equal(body.qboSyncEnabled, false);
  assert.equal(body.summary.balanced, true);
  assert.equal(body.entities.length, 3);

  const csv = await dispatch('GET', '/v1/financials/quickbooks-export?entity=moh&period=month&format=csv&asOf=2026-11-27', 'admin');
  assert.equal(csv.status, 200);
  assert.match(csv.text || '', /^Date,Entity \/ LLC,/);
  assert.equal(columnSums(csv.text || '').net > 0, true);

  const journal = await dispatch('GET', '/v1/financials/quickbooks-export?entity=lvlup3&period=last&format=journal&asOf=2026-11-27', 'admin');
  assert.match(journal.text || '', /^Journal No,Journal Date,/);
  const summed = journalSums(journal.text || '');
  assert.equal(summed.debits, summed.credits);

  const bundle = await dispatch('GET', '/v1/financials/quickbooks-export?entity=all&format=journal&period=month&asOf=2026-11-27', 'admin');
  const bundled = bundle.body as { files: Array<{ entityId: string }>; charged: boolean };
  assert.equal(bundled.charged, false);
  assert.equal(bundled.files.length, 3);

  const missing = await dispatch('PUT', '/v1/financials/quickbooks-categories', 'admin', {
    rows: [{ id: 'tuition', accountName: '4000 Tuition', className: '' }],
  });
  assert.equal(missing.status, 503);

  const blocked = await dispatch('GET', '/v1/financials/quickbooks-export?entity=moh&period=month&asOf=2026-11-27', 'admin', undefined, undefined, true, { QBO_SYNC_ENABLED: '1' });
  assert.equal(blocked.status, 403);
  assert.equal((blocked.body as { error: { code: string } }).error.code, 'qbo_network_disabled');
});

test('saved account names come back on the next export', async () => {
  const { pool } = memoryPool();
  const saved = await dispatch('PUT', '/v1/financials/quickbooks-categories', 'admin', {
    rows: [
      { id: 'gn_after_school', accountName: '4110 After School Income', className: 'Go Ninja' },
      { id: 'acct_deposit', accountName: '1010 Checking', className: '' },
    ],
  }, pool);
  assert.equal(saved.status, 200);
  const catalog = saved.body as { categories: Array<{ id: string; accountName: string; className: string }>; charged: boolean };
  assert.equal(catalog.charged, false);
  assert.equal(catalog.categories.find(row => row.id === 'gn_after_school')?.accountName, '4110 After School Income');
  assert.equal(catalog.categories.find(row => row.id === 'gn_after_school')?.className, 'Go Ninja');

  const preview = await dispatch('GET', '/v1/financials/quickbooks-export?entity=moh&period=month&asOf=2026-11-27', 'admin', undefined, pool);
  const body = preview.body as QboExport;
  assert.equal(body.entities[0].categories.find(row => row.id === 'gn_after_school')?.accountName, '4110 After School Income');
  assert.match(body.entities[0].journalCsv, /1010 Checking/);
  assert.match(body.entities[0].csv, /4110 After School Income/);
  const finance = await dispatch('GET', '/v1/financials/quickbooks-categories', 'staff', undefined, pool, true);
  assert.equal(finance.status, 200);
});

test('the migration seeds the same 12 accounts and the preview bundle matches', () => {
  const sql = readFileSync(join(root, '../migrations/015_qbo_category_mappings.sql'), 'utf8');
  const dated = readFileSync(join(root, '../supabase/migrations/20261127000015_qbo_category_mappings.sql'), 'utf8');
  const copy = readFileSync(join(root, '../supabase/migrations/015_qbo_category_mappings.sql'), 'utf8');
  assert.equal(sql, dated);
  assert.equal(sql, copy);
  for (const [, name, account] of CATEGORIES) {
    assert.ok(sql.includes(name), name);
    assert.ok(sql.includes(account), account);
  }
  assert.match(sql, /qbo_category_mappings enable row level security/);
  assert.match(sql, /!~\* 'tel:'/);
  const ui = readFileSync(join(root, '../ui/qbo-export.js'), 'utf8');
  const sandbox: { LvlupQbo?: { buildQuickbooksExport: typeof buildQuickbooksExport } } = {};
  vm.runInNewContext(ui, sandbox);
  assert.ok(sandbox.LvlupQbo);
  const fromUi = sandbox.LvlupQbo.buildQuickbooksExport({ entity: 'all', period: 'month', asOf: QBO_AS_OF });
  const fromModule = november();
  assert.equal(fromUi.summary.depositCents, fromModule.summary.depositCents);
  assert.equal(fromUi.summary.balanced, true);
  assert.equal(fromUi.entities.length, 3);
  const staff = readFileSync(join(root, '../ui/staff.js'), 'utf8');
  const html = readFileSync(join(root, '../preview/staff.html'), 'utf8');
  assert.match(staff, /QuickBooks Export for Richelle/);
  assert.match(staff, /\/v1\/financials\/quickbooks-export/);
  assert.match(staff, /Download QuickBooks CSV/);
  assert.match(staff, /Download QBO Journal Entry CSV/);
  assert.match(staff, /Edit QuickBooks Account Names/);
  assert.match(html, /qbo-export\.js/);
  const index = readFileSync(join(root, '../../index.html'), 'utf8');
  assert.equal(index.includes('quickbooks-export'), false);
  assert.equal(index.includes('qbo-export'), false);
});
