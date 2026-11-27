/**
 * HTTP for the QuickBooks export. Files only. No Intuit call.
 * QBO_SYNC_ENABLED and QBO_ENABLED stay off. charged stays false.
 */
import { assertFinance, type Actor } from './auth.ts';
import { CrmError } from './errors.ts';
import {
  SELECT_QBO_MAPPINGS,
  UPSERT_QBO_MAPPING,
  applyMappingEdits,
  buildQuickbooksExport,
  catalogFromRows,
  catalogRows,
  defaultCatalog,
  journalFiles,
  type QboCatalog,
  type QboExport,
  type StoredMapRow,
} from './qbo-export.ts';

export type MapPool = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: StoredMapRow[] }>;
};

export type QboHttpEnv = { QBO_ENABLED?: string; QBO_SYNC_ENABLED?: string };

const OFF = {
  charged: false as const,
  submitted: false as const,
  synced: false as const,
  qboSyncEnabled: false as const,
  live: false as const,
};

function dbMissing(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = (err as { code?: string }).code;
  return code === 'database_unconfigured' || code === '42P01' || code === '42703';
}

export async function readCatalog(pool: MapPool): Promise<QboCatalog> {
  try {
    const result = await pool.query(SELECT_QBO_MAPPINGS);
    if (!result.rows?.length) return defaultCatalog();
    return catalogFromRows(result.rows);
  } catch (err) {
    if (dbMissing(err)) return defaultCatalog();
    throw err;
  }
}

export async function saveCatalog(pool: MapPool, edits: Array<{ id?: string; accountName?: string; className?: string }>): Promise<QboCatalog> {
  let current: QboCatalog;
  try {
    const result = await pool.query(SELECT_QBO_MAPPINGS);
    current = result.rows?.length ? catalogFromRows(result.rows) : defaultCatalog();
  } catch (err) {
    if (dbMissing(err)) throw new CrmError(503, 'database_unavailable', 'Database is unavailable.');
    throw err;
  }
  const next = applyMappingEdits(current, edits.map(edit => ({
    id: String(edit.id || ''),
    accountName: edit.accountName == null ? undefined : String(edit.accountName),
    className: edit.className == null ? undefined : String(edit.className),
  })));
  try {
    for (const row of catalogRows(next)) {
      await pool.query(UPSERT_QBO_MAPPING, [row.id, row.kind, row.brand, row.name, row.accountName, row.className, row.sortOrder]);
    }
  } catch (err) {
    if (dbMissing(err)) throw new CrmError(503, 'database_unavailable', 'Database is unavailable.');
    throw err;
  }
  return next;
}

function publicCatalog(catalog: QboCatalog) {
  return {
    ...OFF,
    categories: catalog.categories,
    accounts: catalog.accounts,
    schools: catalog.schools,
  };
}

function publicExport(report: QboExport) {
  return {
    ...OFF,
    fixture: report.fixture,
    entity: report.entity,
    period: report.period,
    entities: report.entities.map(entity => ({
      id: entity.id,
      legalName: entity.legalName,
      schools: entity.schools,
      categories: entity.categories,
      totals: entity.totals,
      journal: entity.journal,
      csv: entity.csv,
      journalCsv: entity.journalCsv,
      files: entity.files,
    })),
    summary: report.summary,
    summaryCsv: report.summaryCsv,
    files: report.files,
    journalFiles: journalFiles(report),
  };
}

export async function handleQuickbooksHttp(input: {
  method: string;
  parts: string[];
  search: URLSearchParams;
  actor: Actor;
  body: Record<string, unknown>;
  pool: MapPool;
  env: QboHttpEnv;
}): Promise<{ status: number; body: unknown; text?: string; contentType?: string } | null> {
  const { method, parts, search, actor, body, pool } = input;
  if (parts[0] !== 'v1' || parts[1] !== 'financials') return null;
  if (parts[2] !== 'quickbooks-export' && parts[2] !== 'quickbooks-categories') return null;
  assertFinance(actor);
  if (input.env.QBO_ENABLED === '1' || input.env.QBO_SYNC_ENABLED === '1') {
    throw new CrmError(403, 'qbo_network_disabled', 'QuickBooks stays offline in this build. Download the file instead.');
  }

  if (parts[2] === 'quickbooks-categories' && method === 'GET') {
    return { status: 200, body: publicCatalog(await readCatalog(pool)) };
  }
  if (parts[2] === 'quickbooks-categories' && method === 'PUT') {
    const rows = Array.isArray(body.rows) ? body.rows as Array<Record<string, unknown>> : null;
    if (!rows || !rows.length) throw new CrmError(400, 'bad_account', 'Send the QuickBooks account names to save.');
    const saved = await saveCatalog(pool, rows.map(row => ({
      id: String(row.id || ''),
      accountName: row.accountName == null ? undefined : String(row.accountName),
      className: row.className == null ? undefined : String(row.className),
    })));
    return { status: 200, body: publicCatalog(saved) };
  }
  if (parts[2] === 'quickbooks-export' && method === 'GET') {
    const catalog = await readCatalog(pool);
    const report = buildQuickbooksExport({
      entity: search.get('entity') || 'all',
      period: search.get('period') || 'month',
      from: search.get('from') || undefined,
      through: search.get('through') || undefined,
      asOf: search.get('asOf') || undefined,
      catalog,
    });
    const format = search.get('format') || 'preview';
    if (format === 'csv') {
      if (report.entities.length === 1) {
        return { status: 200, body: { ...OFF, filename: report.files[0].filename }, text: report.entities[0].csv, contentType: 'text/csv; charset=utf-8' };
      }
      return { status: 200, body: { ...OFF, format: 'bundle', files: report.files, summary: report.summary } };
    }
    if (format === 'journal') {
      const journals = journalFiles(report);
      if (journals.length === 1) {
        return { status: 200, body: { ...OFF, filename: journals[0].filename }, text: journals[0].body, contentType: 'text/csv; charset=utf-8' };
      }
      return { status: 200, body: { ...OFF, format: 'bundle', files: journals, summary: report.summary } };
    }
    if (format !== 'preview') throw new CrmError(400, 'bad_format', 'Format must be preview, csv, or journal.');
    return { status: 200, body: publicExport(report) };
  }
  return null;
}
