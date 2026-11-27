/**
 * QuickBooks Online export for Richelle.
 * Sample ledger only. Builds a CSV and a balanced journal. Does not call Intuit.
 * QBO_SYNC_ENABLED stays 0. Nothing here is submitted or charged.
 */
import { CrmError } from './errors.ts';
import { QBO_COMPANIES } from './qbo.ts';

export const QBO_AS_OF = '2026-11-27';

export const QBO_CSV_HEADER = [
  'Date',
  'Entity / LLC',
  'School / Class',
  'Financial Category',
  'QuickBooks Account',
  'Payment Count',
  'Gross',
  'Refunds',
  'Fees',
  'Net Deposit',
  'Memo',
] as const;

export const QBO_JOURNAL_HEADER = [
  'Journal No',
  'Journal Date',
  'Account Name',
  'Debits',
  'Credits',
  'Description',
  'Class',
  'Location',
] as const;

export type QboKind = 'category' | 'account' | 'school';
export type QboBrand = 'lvlup' | 'goninja' | 'adjust' | 'school';

export type QboMapRow = {
  id: string;
  kind: QboKind;
  brand: QboBrand;
  name: string;
  accountName: string;
  className: string;
  sortOrder: number;
};

export type QboCatalog = {
  categories: QboMapRow[];
  accounts: QboMapRow[];
  schools: QboMapRow[];
};

export type QboLedgerLine = {
  id: string;
  on: string;
  locationId: string;
  categoryId: string;
  count: number;
  grossCents: number;
  refundCents: number;
  creditCents: number;
  method: 'card' | 'cash' | 'check';
  memo: string;
};

type Seed = [id: string, kind: QboKind, brand: QboBrand, name: string, accountName: string, className: string, sortOrder: number];

const SEED: Seed[] = [
  ['tuition', 'category', 'lvlup', 'Tuition', '4010 LVLUP Tuition', '', 10],
  ['events', 'category', 'lvlup', 'Events', '4020 LVLUP Events', '', 20],
  ['tournaments', 'category', 'lvlup', 'Tournaments', '4030 LVLUP Tournaments', '', 30],
  ['retail', 'category', 'lvlup', 'Retail / Pro Shop', '4040 LVLUP Retail', '', 40],
  ['private_lessons', 'category', 'lvlup', 'Private Lessons', '4050 LVLUP Private Lessons', '', 50],
  ['lvlup_parties', 'category', 'lvlup', 'LVLUP Birthday Parties', '4060 LVLUP Birthday Parties', '', 60],
  ['gn_classes', 'category', 'goninja', 'Go Ninja Classes', '4110 Go Ninja Classes', '', 70],
  ['gn_after_school', 'category', 'goninja', 'Go Ninja After School', '4120 Go Ninja After School', '', 80],
  ['gn_summer_camp', 'category', 'goninja', 'Go Ninja Summer Camp', '4130 Go Ninja Summer Camp', '', 90],
  ['gn_events', 'category', 'goninja', 'Go Ninja Events', '4140 Go Ninja Events', '', 100],
  ['gn_parties', 'category', 'goninja', 'Go Ninja Birthday Parties', '4150 Go Ninja Birthday Parties', '', 110],
  ['gn_retail', 'category', 'goninja', 'Go Ninja Retail', '4160 Go Ninja Retail', '', 120],
  ['acct_refunds', 'account', 'adjust', 'Refunds', '4900 Refunds', '', 200],
  ['acct_fees', 'account', 'adjust', 'Processing Fees', '6100 Processing Fees', '', 210],
  ['acct_credits', 'account', 'adjust', 'Family Credits', '2300 Family Credits', '', 220],
  ['acct_deposit', 'account', 'adjust', 'Undeposited Funds', '1200 Undeposited Funds', '', 230],
  ['waunakee', 'school', 'school', 'Waunakee', '', 'Waunakee', 300],
  ['eastmad', 'school', 'school', 'East Madison', '', 'East Madison', 310],
  ['verona', 'school', 'school', 'Verona', '', 'Verona', 320],
  ['deforest', 'school', 'school', 'DeForest', '', 'DeForest', 330],
  ['goninjaW', 'school', 'school', 'Go Ninja Waunakee', '', 'Go Ninja Waunakee', 340],
  ['goninjaV', 'school', 'school', 'Go Ninja Verona', '', 'Go Ninja Verona', 350],
];

function rowFromSeed(seed: Seed): QboMapRow {
  return {
    id: seed[0],
    kind: seed[1],
    brand: seed[2],
    name: seed[3],
    accountName: seed[4],
    className: seed[5],
    sortOrder: seed[6],
  };
}

export function defaultCatalog(): QboCatalog {
  const rows = SEED.map(rowFromSeed);
  return {
    categories: rows.filter(row => row.kind === 'category'),
    accounts: rows.filter(row => row.kind === 'account'),
    schools: rows.filter(row => row.kind === 'school'),
  };
}

export const QBO_CATEGORY_IDS = defaultCatalog().categories.map(row => row.id);

/** Card fee used on the sample ledger: 2.9% + $0.30, on the captured dollars. */
export function processingFeeCents(capturedCents: number, method: 'card' | 'cash' | 'check' = 'card'): number {
  if (method !== 'card' || capturedCents <= 0) return 0;
  return Math.round(capturedCents * 0.029) + 30;
}

function ledger(
  id: string,
  on: string,
  locationId: string,
  categoryId: string,
  grossCents: number,
  memo: string,
  extra: Partial<Pick<QboLedgerLine, 'refundCents' | 'creditCents' | 'method' | 'count'>> = {},
): QboLedgerLine {
  return {
    id,
    on,
    locationId,
    categoryId,
    count: extra.count ?? 1,
    grossCents,
    refundCents: extra.refundCents ?? 0,
    creditCents: extra.creditCents ?? 0,
    method: extra.method ?? 'card',
    memo,
  };
}

/** Fictional Sample families. Not live GymDesk, Firebase, or Authorize.net. */
export const QBO_SANDBOX_LINES: QboLedgerLine[] = [
  ledger('nov-avery-tuition', '2026-11-03', 'waunakee', 'tuition', 22400, 'Avery Sample tuition'),
  ledger('nov-hayden-tuition', '2026-11-06', 'waunakee', 'tuition', 15680, 'Hayden Sample, family credit', { creditCents: 2500 }),
  ledger('nov-wk-tourney', '2026-11-08', 'waunakee', 'tournaments', 9000, 'Waunakee fall tournament'),
  ledger('nov-wk-private', '2026-11-10', 'waunakee', 'private_lessons', 8000, 'Avery Sample private lesson'),
  ledger('nov-wk-retail', '2026-11-12', 'waunakee', 'retail', 4500, 'Avery Sample pro shop', { method: 'cash' }),
  ledger('nov-wk-event', '2026-11-14', 'waunakee', 'events', 6500, 'Parents Night Out'),
  ledger('nov-wk-retail-refund', '2026-11-18', 'waunakee', 'retail', 0, 'Avery Sample pro shop refund', { refundCents: 2000, method: 'cash' }),
  ledger('nov-wk-late-refund', '2026-11-27', 'waunakee', 'retail', 0, 'Late pro shop refund', { refundCents: 500, method: 'cash' }),
  ledger('nov-wk-party', '2026-11-22', 'waunakee', 'lvlup_parties', 21900, 'Riley Sample birthday party'),
  ledger('nov-df-tuition', '2026-11-11', 'deforest', 'tuition', 19900, 'Logan Sample tuition'),
  ledger('nov-df-event', '2026-11-16', 'deforest', 'events', 4500, 'DeForest seminar'),
  ledger('nov-gnw-class', '2026-11-04', 'goninjaW', 'gn_classes', 8900, 'Cameron Sample classes'),
  ledger('nov-gnw-after', '2026-11-07', 'goninjaW', 'gn_after_school', 15000, 'Go Ninja after school'),
  ledger('nov-gnw-camp', '2026-11-09', 'goninjaW', 'gn_summer_camp', 12000, 'Summer camp deposit'),
  ledger('nov-gnw-event', '2026-11-18', 'goninjaW', 'gn_events', 6000, 'Ninja night'),
  ledger('nov-gnw-party', '2026-11-21', 'goninjaW', 'gn_parties', 25000, 'Cameron Sample, birthday party'),
  ledger('nov-gnw-retail', '2026-11-12', 'goninjaW', 'gn_retail', 1200, 'Go Ninja grip socks', { method: 'cash' }),
  ledger('nov-em-tuition', '2026-11-04', 'eastmad', 'tuition', 29900, 'Jordan Sample tuition'),
  ledger('nov-em-event', '2026-11-15', 'eastmad', 'events', 12000, 'East Madison camp weekend', { refundCents: 1500 }),
  ledger('nov-em-tourney', '2026-11-17', 'eastmad', 'tournaments', 7000, 'East Madison tournament'),
  ledger('nov-em-retail', '2026-11-19', 'eastmad', 'retail', 3500, 'Jordan Sample hoodie', { method: 'cash' }),
  ledger('nov-em-private', '2026-11-20', 'eastmad', 'private_lessons', 6000, 'Jordan Sample private lesson', { creditCents: 1000 }),
  ledger('nov-em-party', '2026-11-25', 'eastmad', 'lvlup_parties', 21900, 'East Madison birthday party'),
  ledger('nov-ver-tuition', '2026-11-07', 'verona', 'tuition', 20900, 'Blake Sample tuition'),
  ledger('nov-ver-tuition-2', '2026-11-09', 'verona', 'tuition', 22400, 'Skyler Sample tuition'),
  ledger('nov-ver-event', '2026-11-20', 'verona', 'events', 8000, 'Blake Sample "clinic"'),
  ledger('nov-ver-tourney', '2026-11-11', 'verona', 'tournaments', 5500, 'Verona tournament'),
  ledger('nov-ver-retail', '2026-11-13', 'verona', 'retail', 3200, 'Verona pro shop', { method: 'cash' }),
  ledger('nov-ver-private', '2026-11-18', 'verona', 'private_lessons', 7500, 'Skyler Sample private lesson'),
  ledger('nov-ver-party', '2026-11-28', 'verona', 'lvlup_parties', 18900, 'Verona birthday party'),
  ledger('nov-gnv-class', '2026-11-08', 'goninjaV', 'gn_classes', 8900, 'Taylor Sample classes'),
  ledger('nov-gnv-after', '2026-11-10', 'goninjaV', 'gn_after_school', 11000, 'Go Ninja Verona after school'),
  ledger('nov-gnv-camp', '2026-11-14', 'goninjaV', 'gn_summer_camp', 8000, 'Verona summer camp deposit'),
  ledger('nov-gnv-event', '2026-11-16', 'goninjaV', 'gn_events', 4000, 'Go Ninja Verona event'),
  ledger('nov-gnv-party', '2026-11-22', 'goninjaV', 'gn_parties', 18900, 'Go Ninja Verona birthday party'),
  ledger('nov-gnv-retail', '2026-11-19', 'goninjaV', 'gn_retail', 1500, 'Go Ninja Verona retail', { method: 'cash', refundCents: 500 }),
  ledger('oct-wk-tuition', '2026-10-06', 'waunakee', 'tuition', 22400, 'Avery Sample October tuition'),
  ledger('oct-ver-tourney', '2026-10-17', 'verona', 'tournaments', 6000, 'Skyler Sample October tournament'),
  ledger('oct-em-retail', '2026-10-20', 'eastmad', 'retail', 2000, 'October pro shop', { method: 'cash' }),
  ledger('oct-gnw-class', '2026-10-12', 'goninjaW', 'gn_classes', 8900, 'October Go Ninja classes'),
  ledger('sep-wk-tuition', '2026-09-15', 'waunakee', 'tuition', 1000, 'Outside the sample window'),
  ledger('dec-em-tuition', '2026-12-02', 'eastmad', 'tuition', 1000, 'Outside the sample window'),
];

export type CategoryTotal = {
  id: string;
  name: string;
  brand: 'lvlup' | 'goninja';
  accountName: string;
  className: string;
  count: number;
  grossCents: number;
  refundCents: number;
  feeCents: number;
  creditCents: number;
  netCents: number;
};

export type JournalLine = {
  journalNo: string;
  date: string;
  accountName: string;
  debitCents: number;
  creditCents: number;
  description: string;
  className: string;
  location: string;
};

export type QboExportFile = {
  filename: string;
  body: string;
  kind: 'csv' | 'journal' | 'summary';
  entityId: string;
};

export type EntityExport = {
  id: string;
  legalName: string;
  schools: string[];
  categories: CategoryTotal[];
  totals: MoneyTotals;
  journal: { balanced: boolean; debitCents: number; creditCents: number; batches: number };
  csv: string;
  journalCsv: string;
  files: { csv: QboExportFile; journal: QboExportFile };
};

export type MoneyTotals = {
  count: number;
  grossCents: number;
  refundCents: number;
  feeCents: number;
  creditCents: number;
  netCents: number;
  depositCents: number;
  formulaOk: boolean;
};

export type QboExport = {
  fixture: true;
  live: false;
  charged: false;
  submitted: false;
  synced: false;
  qboSyncEnabled: false;
  entity: string;
  period: { id: string; label: string; from: string; through: string };
  entities: EntityExport[];
  summary: MoneyTotals & {
    balanced: boolean;
    debitCents: number;
    journalCreditCents: number;
    categories: CategoryTotal[];
  };
  summaryCsv: string;
  files: QboExportFile[];
  journalFiles: QboExportFile[];
};

export type MappingEdit = { id: string; accountName?: string; className?: string };

const ALL_ROWS = () => SEED.map(rowFromSeed);

export function applyMappingEdits(catalog: QboCatalog, edits: MappingEdit[]): QboCatalog {
  const next = cloneCatalog(catalog);
  const byId = new Map<string, QboMapRow>();
  for (const row of [...next.categories, ...next.accounts, ...next.schools]) byId.set(row.id, row);
  for (const edit of edits) {
    const row = byId.get(edit.id);
    if (!row) throw new CrmError(400, 'unknown_category', 'That QuickBooks category is not on the list.');
    if (edit.accountName != null && row.kind !== 'school') row.accountName = cleanAccount(edit.accountName, row.name);
    if (edit.className != null) row.className = cleanClass(edit.className, row.kind === 'school');
  }
  return next;
}

export function cloneCatalog(catalog: QboCatalog): QboCatalog {
  const copy = (row: QboMapRow): QboMapRow => ({ ...row });
  return {
    categories: catalog.categories.map(copy),
    accounts: catalog.accounts.map(copy),
    schools: catalog.schools.map(copy),
  };
}

function cleanAccount(value: string, label: string): string {
  const text = cleanLabel(value, 80);
  if (!text) throw new CrmError(400, 'bad_account', label + ' needs a QuickBooks account name.');
  return text;
}

function cleanClass(value: string, required: boolean): string {
  const text = cleanLabel(value, 80);
  if (required && !text) throw new CrmError(400, 'bad_class', 'Each school needs a QuickBooks class.');
  return text;
}

function cleanLabel(value: string, max: number): string {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (text.length > max) throw new CrmError(400, 'bad_account', 'Keep QuickBooks names to ' + max + ' characters.');
  if (/tel:|sms:/i.test(text) || /[\r\n]/.test(text)) {
    throw new CrmError(400, 'bad_account', 'That QuickBooks name cannot be saved.');
  }
  return text;
}

export function csvEscape(value: string): string {
  if (/[",\r\n]/.test(value)) return '"' + value.replace(/"/g, '""') + '"';
  return value;
}

export function toCsv(rows: string[][]): string {
  return rows.map(row => row.map(cell => csvEscape(cell)).join(',')).join('\r\n') + '\r\n';
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const source = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') { cell += '"'; i += 1; continue; }
        quoted = false;
        continue;
      }
      cell += char;
      continue;
    }
    if (char === '"') { quoted = true; continue; }
    if (char === ',') { row.push(cell); cell = ''; continue; }
    if (char === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; continue; }
    if (char === '\r') continue;
    cell += char;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(item => !(item.length === 1 && item[0] === ''));
}

export function formatDollars(cents: number): string {
  const neg = cents < 0;
  const abs = Math.abs(Math.round(cents));
  return (neg ? '-' : '') + Math.floor(abs / 100) + '.' + String(abs % 100).padStart(2, '0');
}

export function dollarsToCents(text: string): number {
  if (!text) return 0;
  const neg = text.startsWith('-');
  const [dollars, coins = '0'] = text.replace('-', '').split('.');
  const cents = Number(dollars) * 100 + Number(coins.padEnd(2, '0').slice(0, 2));
  return neg ? -cents : cents;
}

export function assertIsoDate(iso: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new CrmError(400, 'bad_date', 'Use a YYYY-MM-DD date.');
  const [year, month, day] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (dt.getUTCFullYear() !== year || dt.getUTCMonth() !== month - 1 || dt.getUTCDate() !== day) {
    throw new CrmError(400, 'bad_date', 'Use a real calendar date.');
  }
}

export function monthBounds(iso: string): { from: string; through: string } {
  assertIsoDate(iso);
  const [year, month] = iso.split('-').map(Number);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const mm = String(month).padStart(2, '0');
  return { from: year + '-' + mm + '-01', through: year + '-' + mm + '-' + String(last).padStart(2, '0') };
}

export function shiftMonth(iso: string, delta: number): string {
  assertIsoDate(iso);
  const [year, month] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(year, month - 1 + delta, 1));
  return dt.toISOString().slice(0, 10);
}

export function periodRange(input: { period?: string; from?: string; through?: string; asOf?: string }) {
  const asOf = input.asOf || QBO_AS_OF;
  assertIsoDate(asOf);
  const period = input.period || 'month';
  if (period === 'last') {
    const bounds = monthBounds(shiftMonth(asOf, -1));
    return { id: 'last', label: 'Last Month', ...bounds };
  }
  if (period === 'custom') {
    if (!input.from || !input.through) throw new CrmError(400, 'bad_range', 'Choose a start and end date.');
    assertIsoDate(input.from);
    assertIsoDate(input.through);
    if (input.from > input.through) throw new CrmError(400, 'bad_range', 'The start date has to be on or before the end date.');
    return { id: 'custom', label: 'Custom Range', from: input.from, through: input.through };
  }
  if (period !== 'month') throw new CrmError(400, 'bad_period', 'Period must be this month, last month, or a custom range.');
  const bounds = monthBounds(asOf);
  return { id: 'month', label: 'This Month', ...bounds };
}

export function companiesFor(entity: string) {
  if (entity === 'all') return [...QBO_COMPANIES];
  const hit = QBO_COMPANIES.find(company => company.id === entity);
  if (!hit) throw new CrmError(400, 'bad_entity', 'Pick one LLC or all three.');
  return [hit];
}

function accountOf(catalog: QboCatalog, id: string): QboMapRow {
  const row = catalog.accounts.find(item => item.id === id);
  if (!row) throw new CrmError(500, 'missing_account', 'QuickBooks account list is incomplete.');
  return row;
}

function schoolOf(catalog: QboCatalog, id: string): QboMapRow {
  const row = catalog.schools.find(item => item.id === id);
  if (!row) throw new CrmError(400, 'bad_school', 'That school is not on an LLC.');
  return row;
}

function emptyCategory(row: QboMapRow): CategoryTotal {
  return {
    id: row.id,
    name: row.name,
    brand: row.brand === 'goninja' ? 'goninja' : 'lvlup',
    accountName: row.accountName,
    className: row.className,
    count: 0,
    grossCents: 0,
    refundCents: 0,
    feeCents: 0,
    creditCents: 0,
    netCents: 0,
  };
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function stamp(from: string, through: string): string {
  if (from.slice(0, 7) === through.slice(0, 7) && from.endsWith('-01')) return from.slice(0, 7);
  return from + '_' + through;
}

type Bucket = {
  date: string;
  locationId: string;
  categoryId: string;
  count: number;
  grossCents: number;
  refundCents: number;
  feeCents: number;
  creditCents: number;
  memos: string[];
};

function lineFee(line: QboLedgerLine): number {
  const captured = line.grossCents - line.creditCents;
  return processingFeeCents(captured, line.method);
}

function totalsOf(categories: CategoryTotal[], creditCents: number): MoneyTotals {
  const grossCents = categories.reduce((sum, row) => sum + row.grossCents, 0);
  const refundCents = categories.reduce((sum, row) => sum + row.refundCents, 0);
  const feeCents = categories.reduce((sum, row) => sum + row.feeCents, 0);
  const count = categories.reduce((sum, row) => sum + row.count, 0);
  const netCents = grossCents - refundCents - feeCents;
  const depositCents = netCents - creditCents;
  const formulaOk = categories.every(row => row.netCents === row.grossCents - row.refundCents - row.feeCents)
    && netCents === grossCents - refundCents - feeCents
    && depositCents === netCents - creditCents;
  return { count, grossCents, refundCents, feeCents, creditCents, netCents, depositCents, formulaOk };
}

function buildEntity(
  company: typeof QBO_COMPANIES[number],
  period: { from: string; through: string },
  catalog: QboCatalog,
  lines: QboLedgerLine[],
): EntityExport {
  const schools = new Set<string>(company.schools);
  const buckets = new Map<string, Bucket>();
  for (const line of lines) {
    if (!schools.has(line.locationId)) continue;
    if (line.on < period.from || line.on > period.through) continue;
    const key = line.on + '|' + line.locationId + '|' + line.categoryId;
    const bucket = buckets.get(key) || {
      date: line.on,
      locationId: line.locationId,
      categoryId: line.categoryId,
      count: 0,
      grossCents: 0,
      refundCents: 0,
      feeCents: 0,
      creditCents: 0,
      memos: [],
    };
    bucket.count += line.count;
    bucket.grossCents += line.grossCents;
    bucket.refundCents += line.refundCents;
    bucket.feeCents += lineFee(line);
    bucket.creditCents += line.creditCents;
    if (line.memo) bucket.memos.push(line.memo);
    buckets.set(key, bucket);
  }

  const categories = catalog.categories.map(emptyCategory);
  const byCategory = new Map(categories.map(row => [row.id, row]));
  for (const bucket of buckets.values()) {
    const category = byCategory.get(bucket.categoryId);
    if (!category) throw new CrmError(500, 'bad_category', 'A sample line uses an unknown category.');
    category.count += bucket.count;
    category.grossCents += bucket.grossCents;
    category.refundCents += bucket.refundCents;
    category.feeCents += bucket.feeCents;
    category.creditCents += bucket.creditCents;
  }
  for (const category of categories) {
    category.netCents = category.grossCents - category.refundCents - category.feeCents;
  }
  const creditCents = categories.reduce((sum, row) => sum + row.creditCents, 0);
  const totals = totalsOf(categories, creditCents);

  const refunds = accountOf(catalog, 'acct_refunds');
  const fees = accountOf(catalog, 'acct_fees');
  const credits = accountOf(catalog, 'acct_credits');
  const deposit = accountOf(catalog, 'acct_deposit');
  const categoryById = new Map(catalog.categories.map(row => [row.id, row]));

  const detail: string[][] = [[...QBO_CSV_HEADER]];
  const ordered = [...buckets.values()].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    const school = schoolOf(catalog, a.locationId).sortOrder - schoolOf(catalog, b.locationId).sortOrder;
    if (school !== 0) return school;
    return (categoryById.get(a.categoryId)?.sortOrder || 0) - (categoryById.get(b.categoryId)?.sortOrder || 0);
  });

  const journalLines: JournalLine[] = [];
  const dates = [...new Set(ordered.map(bucket => bucket.date))];
  for (const date of dates) {
    const day = ordered.filter(bucket => bucket.date === date);
    const dayGross = day.reduce((sum, bucket) => sum + bucket.grossCents, 0);
    const dayRefund = day.reduce((sum, bucket) => sum + bucket.refundCents, 0);
    const dayFee = day.reduce((sum, bucket) => sum + bucket.feeCents, 0);
    const dayCredit = day.reduce((sum, bucket) => sum + bucket.creditCents, 0);
    const dayDeposit = dayGross - dayRefund - dayFee - dayCredit;
    const journalNo = 'JE-' + company.id + '-' + date.replace(/-/g, '');
    for (const bucket of day) {
      const category = categoryById.get(bucket.categoryId);
      if (!category) continue;
      const school = schoolOf(catalog, bucket.locationId);
      const klass = category.className || school.className;
      const memo = memoText(bucket, school.name, category.name);
      if (bucket.grossCents || bucket.refundCents || bucket.feeCents || bucket.count) {
        detail.push([
          bucket.date,
          company.legalName,
          school.className,
          category.name,
          category.accountName,
          String(bucket.count),
          formatDollars(bucket.grossCents),
          formatDollars(bucket.refundCents),
          formatDollars(bucket.feeCents),
          formatDollars(bucket.grossCents - bucket.refundCents - bucket.feeCents),
          memo,
        ]);
      }
      if (bucket.creditCents) {
        detail.push([
          bucket.date,
          company.legalName,
          school.className,
          credits.name,
          credits.accountName,
          '1',
          '0.00',
          formatDollars(bucket.creditCents),
          '0.00',
          formatDollars(-bucket.creditCents),
          'Family credit applied to ' + category.name + '. Listed under Refunds so Net = Gross − Refunds − Fees. The journal posts ' + credits.accountName + '.',
        ]);
      }
      if (bucket.grossCents > 0) {
        journalLines.push({
          journalNo, date, accountName: category.accountName, debitCents: 0, creditCents: bucket.grossCents,
          description: category.name + ' · ' + school.name, className: klass, location: school.className,
        });
      }
      if (bucket.refundCents > 0) {
        journalLines.push({
          journalNo, date, accountName: refunds.accountName, debitCents: bucket.refundCents, creditCents: 0,
          description: 'Refund · ' + category.name + ' · ' + school.name, className: klass, location: school.className,
        });
      }
    }
    if (dayFee > 0) {
      journalLines.push({
        journalNo, date, accountName: fees.accountName, debitCents: dayFee, creditCents: 0,
        description: 'Processing fees · ' + company.legalName, className: '', location: '',
      });
    }
    if (dayCredit > 0) {
      journalLines.push({
        journalNo, date, accountName: credits.accountName, debitCents: dayCredit, creditCents: 0,
        description: 'Family credits applied · ' + company.legalName, className: '', location: '',
      });
    }
    if (dayDeposit > 0) {
      journalLines.push({
        journalNo, date, accountName: deposit.accountName, debitCents: dayDeposit, creditCents: 0,
        description: 'Net deposit · ' + company.legalName, className: '', location: '',
      });
    } else if (dayDeposit < 0) {
      journalLines.push({
        journalNo, date, accountName: deposit.accountName, debitCents: 0, creditCents: -dayDeposit,
        description: 'Net deposit · ' + company.legalName, className: '', location: '',
      });
    }
  }

  const debitCents = journalLines.reduce((sum, line) => sum + line.debitCents, 0);
  const creditSide = journalLines.reduce((sum, line) => sum + line.creditCents, 0);
  const batches = new Set(journalLines.map(line => line.journalNo)).size;
  const balanced = debitCents === creditSide && (journalLines.length === 0 || debitCents > 0);
  const journalRows: string[][] = [[...QBO_JOURNAL_HEADER]];
  for (const line of journalLines) {
    journalRows.push([
      line.journalNo,
      line.date,
      line.accountName,
      line.debitCents ? formatDollars(line.debitCents) : '',
      line.creditCents ? formatDollars(line.creditCents) : '',
      line.description,
      line.className,
      line.location,
    ]);
  }

  const fileStamp = stamp(period.from, period.through);
  const base = slug(company.legalName) + '-' + fileStamp;
  const csvFile: QboExportFile = { filename: 'quickbooks-' + base + '.csv', body: toCsv(detail), kind: 'csv', entityId: company.id };
  const journalFile: QboExportFile = { filename: 'qbo-journal-' + base + '.csv', body: toCsv(journalRows), kind: 'journal', entityId: company.id };
  return {
    id: company.id,
    legalName: company.legalName,
    schools: [...company.schools],
    categories,
    totals,
    journal: { balanced, debitCents, creditCents: creditSide, batches },
    csv: csvFile.body,
    journalCsv: journalFile.body,
    files: { csv: csvFile, journal: journalFile },
  };
}

function memoText(bucket: Bucket, school: string, category: string): string {
  const extra = bucket.memos.filter((memo, index) => bucket.memos.indexOf(memo) === index).join('; ');
  const text = extra || (school + ' · ' + category);
  return text.length > 180 ? text.slice(0, 177) + '...' : text;
}

function sumCategories(entities: EntityExport[], catalog: QboCatalog): CategoryTotal[] {
  return catalog.categories.map(row => {
    const total = emptyCategory(row);
    for (const entity of entities) {
      const hit = entity.categories.find(item => item.id === row.id);
      if (!hit) continue;
      total.count += hit.count;
      total.grossCents += hit.grossCents;
      total.refundCents += hit.refundCents;
      total.feeCents += hit.feeCents;
      total.creditCents += hit.creditCents;
    }
    total.netCents = total.grossCents - total.refundCents - total.feeCents;
    return total;
  });
}

export function buildQuickbooksExport(input: {
  entity?: string;
  period?: string;
  from?: string;
  through?: string;
  asOf?: string;
  catalog?: QboCatalog;
  lines?: QboLedgerLine[];
} = {}): QboExport {
  const catalog = input.catalog || defaultCatalog();
  const period = periodRange(input);
  const companies = companiesFor(input.entity || 'all');
  const lines = input.lines || QBO_SANDBOX_LINES;
  const entities = companies.map(company => buildEntity(company, period, catalog, lines));
  const categories = sumCategories(entities, catalog);
  const creditCents = categories.reduce((sum, row) => sum + row.creditCents, 0);
  const totals = totalsOf(categories, creditCents);
  const debitCents = entities.reduce((sum, entity) => sum + entity.journal.debitCents, 0);
  const creditSide = entities.reduce((sum, entity) => sum + entity.journal.creditCents, 0);
  const balanced = entities.every(entity => entity.journal.balanced) && debitCents === creditSide && totals.formulaOk;
  const summaryRows: string[][] = [[
    'Entity / LLC', 'Payment Count', 'Gross', 'Refunds', 'Fees', 'Family Credits', 'Net', 'Deposit', 'Debits', 'Credits', 'Balanced',
  ]];
  for (const entity of entities) {
    summaryRows.push([
      entity.legalName,
      String(entity.totals.count),
      formatDollars(entity.totals.grossCents),
      formatDollars(entity.totals.refundCents),
      formatDollars(entity.totals.feeCents),
      formatDollars(entity.totals.creditCents),
      formatDollars(entity.totals.netCents),
      formatDollars(entity.totals.depositCents),
      formatDollars(entity.journal.debitCents),
      formatDollars(entity.journal.creditCents),
      entity.journal.balanced ? 'yes' : 'no',
    ]);
  }
  summaryRows.push([
    'TOTAL',
    String(totals.count),
    formatDollars(totals.grossCents),
    formatDollars(totals.refundCents),
    formatDollars(totals.feeCents),
    formatDollars(totals.creditCents),
    formatDollars(totals.netCents),
    formatDollars(totals.depositCents),
    formatDollars(debitCents),
    formatDollars(creditSide),
    balanced ? 'yes' : 'no',
  ]);
  const fileStamp = stamp(period.from, period.through);
  const summaryFile: QboExportFile = {
    filename: 'quickbooks-all-entities-summary-' + fileStamp + '.csv',
    body: toCsv(summaryRows),
    kind: 'summary',
    entityId: 'all',
  };
  const files: QboExportFile[] = [];
  for (const entity of entities) files.push(entity.files.csv);
  if (entities.length > 1) files.push(summaryFile);
  return {
    fixture: true,
    live: false,
    charged: false,
    submitted: false,
    synced: false,
    qboSyncEnabled: false,
    entity: input.entity || 'all',
    period,
    entities,
    summary: { ...totals, balanced, debitCents, journalCreditCents: creditSide, categories },
    summaryCsv: summaryFile.body,
    files,
    journalFiles: entities.map(entity => entity.files.journal),
  };
}

export function journalFiles(report: QboExport): QboExportFile[] {
  return report.entities.map(entity => entity.files.journal);
}

export type StoredMapRow = {
  id: string;
  kind?: string;
  brand?: string;
  name?: string;
  qbo_account_name?: string;
  qbo_class_name?: string;
  sort_order?: number | string;
};

export function catalogFromRows(rows: StoredMapRow[]): QboCatalog {
  const catalog = defaultCatalog();
  const known = new Map<string, QboMapRow>();
  for (const row of [...catalog.categories, ...catalog.accounts, ...catalog.schools]) known.set(row.id, row);
  for (const stored of rows) {
    const row = known.get(String(stored.id || ''));
    if (!row) continue;
    if (row.kind !== 'school' && stored.qbo_account_name != null && String(stored.qbo_account_name).trim()) {
      row.accountName = String(stored.qbo_account_name).trim();
    }
    if (stored.qbo_class_name != null && String(stored.qbo_class_name).trim()) {
      row.className = String(stored.qbo_class_name).trim();
    }
  }
  return catalog;
}

export function catalogRows(catalog: QboCatalog): QboMapRow[] {
  return [...catalog.categories, ...catalog.accounts, ...catalog.schools];
}

export const SELECT_QBO_MAPPINGS = 'select id, kind, brand, name, qbo_account_name, qbo_class_name, sort_order from qbo_category_mappings order by sort_order, id';

export const UPSERT_QBO_MAPPING = `insert into qbo_category_mappings (id, kind, brand, name, qbo_account_name, qbo_class_name, sort_order)
values ($1, $2, $3, $4, $5, $6, $7)
on conflict (id) do update set
  qbo_account_name = excluded.qbo_account_name,
  qbo_class_name = excluded.qbo_class_name,
  updated_at = now()`;

export function seedRows(): Array<[string, string, string, string, string, string, number]> {
  return ALL_ROWS().map(row => [row.id, row.kind, row.brand, row.name, row.accountName, row.className, row.sortOrder]);
}
