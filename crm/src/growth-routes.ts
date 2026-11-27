/**
 * Attrition and CAC HTTP. Reads synthetic demo figures when the database
 * has no snapshots. Spend writes go to crm_marketing_spend when that table
 * is present. Nothing here charges a card or calls an ad platform.
 */
import { assertStaff, type Actor } from './auth.ts';
import { CrmError } from './errors.ts';
import {
  GROWTH_MONTHS,
  GrowthInputError,
  answerGrowthQuestion,
  applySnapshots,
  attritionCsv,
  attritionReport,
  cacCsv,
  cacReport,
  cellsWithSpend,
  parseSpendInput,
  pulseReport,
  schoolsInScope,
  summaryPayload,
  type SnapshotInput,
  type SpendOverride,
  type GrowthCell,
  type ReasonCounts,
  type TenureCounts,
} from './growth.ts';

type GrowthPool = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>>; rowCount?: number | null }>;
};

export const SELECT_SPEND = `select location_id, month_key, channel, amount_cents
  from crm_marketing_spend
  where month_key = any($1::text[])`;

export const SELECT_SNAPSHOTS = `select location_id, month_key, starting_active, new_enrollments, cancellations,
    reasons, tenure, channels, tuition_cents, avg_tenure_months
  from crm_attrition_snapshots
  where month_key = any($1::text[])`;

export const UPSERT_SPEND = `insert into crm_marketing_spend
  (location_id, month_key, channel, amount_cents, updated_by)
  values ($1, $2, $3, $4, $5)
  on conflict (location_id, month_key, channel)
  do update set amount_cents = excluded.amount_cents,
    updated_by = excluded.updated_by,
    updated_at = now()`;

const memorySpend = new Map<string, SpendOverride>();

export function resetGrowthMemory() {
  memorySpend.clear();
}

function memoryRows(): SpendOverride[] {
  return [...memorySpend.values()];
}

function remember(rows: SpendOverride[]) {
  for (const row of rows) memorySpend.set(row.locationId + '|' + row.month + '|' + row.channel, row);
}

function dbMissing(err: unknown) {
  if (!err || typeof err !== 'object') return false;
  const code = (err as { code?: string }).code;
  return code === 'database_unconfigured' || code === '42P01' || code === '42703' || code === '42P07';
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') {
    try { return JSON.parse(value) as Record<string, unknown>; }
    catch { return {}; }
  }
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function mapSpend(rows: Array<Record<string, unknown>>): SpendOverride[] {
  return rows.map(row => ({
    locationId: String(row.location_id || ''),
    month: String(row.month_key || ''),
    channel: String(row.channel || ''),
    amountCents: Number(row.amount_cents),
  })).filter(row => Number.isInteger(row.amountCents));
}

function mapSnapshots(rows: Array<Record<string, unknown>>): SnapshotInput[] {
  return rows.map(row => ({
    locationId: String(row.location_id || ''),
    month: String(row.month_key || ''),
    startingActive: Number(row.starting_active),
    newEnrollments: Number(row.new_enrollments),
    cancellations: Number(row.cancellations),
    reasons: asRecord(row.reasons) as ReasonCounts,
    tenure: asRecord(row.tenure) as TenureCounts,
    channels: asRecord(row.channels) as SnapshotInput['channels'],
    tuitionCents: row.tuition_cents == null ? undefined : Number(row.tuition_cents),
    avgTenureMonths: row.avg_tenure_months == null ? undefined : Number(row.avg_tenure_months),
  }));
}

async function loadStored(pool: GrowthPool): Promise<{ spend: SpendOverride[]; snapshots: SnapshotInput[]; database: boolean }> {
  try {
    const spend = await pool.query(SELECT_SPEND, [[...GROWTH_MONTHS]]);
    const snapshots = await pool.query(SELECT_SNAPSHOTS, [[...GROWTH_MONTHS]]);
    return { spend: mapSpend(spend.rows || []), snapshots: mapSnapshots(snapshots.rows || []), database: true };
  } catch (err) {
    if (dbMissing(err)) return { spend: [], snapshots: [], database: false };
    throw err;
  }
}

function visibleIds(actor: Actor): string[] | null {
  if (actor.role === 'admin') return null;
  return actor.locationIds || [];
}

function filterCells(actor: Actor, cells: GrowthCell[]) {
  const ids = visibleIds(actor);
  if (!ids) return cells;
  const mine = new Set(ids);
  return cells.filter(cell => mine.has(cell.locationId));
}

function assertScope(actor: Actor, scope: string) {
  let ids: string[];
  try { ids = schoolsInScope(scope); }
  catch (err) {
    if (err instanceof GrowthInputError) throw new CrmError(404, 'not_found', 'Unknown scope.');
    throw err;
  }
  if (actor.role === 'admin') return;
  const mine = new Set(actor.locationIds || []);
  if (ids.length === 1 && !mine.has(ids[0])) throw new CrmError(403, 'forbidden', 'That scope is outside your schools.');
  if (!ids.some(id => mine.has(id))) throw new CrmError(403, 'forbidden', 'That scope is outside your schools.');
}

function assertMonth(month: string) {
  if (!(GROWTH_MONTHS as readonly string[]).includes(month)) throw new CrmError(400, 'invalid_growth', 'Choose a month from June 2026 through November 2026.');
}

async function book(pool: GrowthPool, actor: Actor) {
  const stored = await loadStored(pool);
  const spend = stored.database ? stored.spend : memoryRows();
  const cells = filterCells(actor, applySnapshots(cellsWithSpend(spend), stored.database ? stored.snapshots : []));
  return { cells, database: stored.database, fixture: stored.snapshots.length === 0 };
}

function monthOf(search: URLSearchParams) {
  return search.get('month') || '2026-11';
}

function scopeOf(search: URLSearchParams) {
  return search.get('scope') || 'all';
}

function parseSpendRows(body: unknown): SpendOverride[] {
  try { return parseSpendInput(body); }
  catch (err) { growthError(err); }
}

function growthError(err: unknown): never {
  if (err instanceof GrowthInputError) {
    const missing = err.message === 'Unknown scope';
    throw new CrmError(missing ? 404 : 400, missing ? 'not_found' : 'invalid_growth', missing ? 'Unknown scope.' : err.message);
  }
  throw err;
}

export async function handleGrowthHttp(input: {
  method: string;
  parts: string[];
  search: URLSearchParams;
  actor: Actor;
  body: Record<string, unknown>;
  pool: GrowthPool;
}): Promise<{ status: number; body: unknown; text?: string; contentType?: string } | null> {
  const { method, parts, search, actor, pool } = input;
  if (parts[0] !== 'v1' || parts[1] !== 'growth') return null;
  assertStaff(actor);
  const kind = parts[2] || 'summary';
  try {
    if (method === 'PUT' && kind === 'spend') {
      const rows = parseSpendRows(input.body);
      for (const row of rows) {
        if (actor.role !== 'admin' && !(actor.locationIds || []).includes(row.locationId)) {
          throw new CrmError(403, 'forbidden', 'That school is outside your schools.');
        }
      }
      const email = String(actor.email || '').slice(0, 120);
      try {
        for (const row of rows) {
          await pool.query(UPSERT_SPEND, [row.locationId, row.month, row.channel, row.amountCents, email]);
        }
        return { status: 200, body: { saved: true, database: true, fixture: true, live: false, charged: false, rows } };
      } catch (err) {
        if (!dbMissing(err)) throw err;
        remember(rows);
        return { status: 200, body: { saved: true, database: false, fixture: true, live: false, charged: false, rows } };
      }
    }

    if (method !== 'GET' && !(method === 'POST' && kind === 'ask')) {
      return { status: 405, body: { error: { code: 'method_not_allowed', message: 'That action is not available.' } } };
    }

    const scope = scopeOf(search);
    const month = monthOf(search);
    if (kind !== 'ask') {
      assertScope(actor, scope);
      assertMonth(month);
    }
    const loaded = await book(pool, actor);
    const flags = { fixture: loaded.fixture, database: loaded.database, live: false, charged: false };

    if (kind === 'summary') {
      return { status: 200, body: { ...summaryPayload(loaded.cells, loaded), ...flags } };
    }
    if (kind === 'attrition.csv') {
      return { status: 200, text: attritionCsv(scope, month, loaded.cells), contentType: 'text/csv; charset=utf-8', body: null };
    }
    if (kind === 'cac.csv') {
      return { status: 200, text: cacCsv(scope, month, loaded.cells), contentType: 'text/csv; charset=utf-8', body: null };
    }
    if (kind === 'attrition') {
      return { status: 200, body: { ...flags, ...attritionReport(scope, month, loaded.cells) } };
    }
    if (kind === 'cac') {
      return { status: 200, body: { ...flags, ...cacReport(scope, month, loaded.cells) } };
    }
    if (kind === 'pulse') {
      return { status: 200, body: { ...flags, ...pulseReport(scope, month, loaded.cells) } };
    }
    if (kind === 'ask') {
      const question = String(search.get('q') || input.body.question || input.body.q || '');
      const askScope = String(search.get('scope') || input.body.scope || 'all');
      const askMonth = String(search.get('month') || input.body.month || '2026-11');
      assertScope(actor, askScope);
      let answer;
      try {
        answer = answerGrowthQuestion(question, { scope: askScope, month: askMonth, cells: loaded.cells });
      } catch (err) {
        if (err instanceof GrowthInputError) {
          return {
            status: 200,
            body: {
              ...flags,
              question,
              answer: 'That school is outside the schools you can open.',
              month: askMonth,
              scope: askScope,
              topic: 'help',
            },
          };
        }
        throw err;
      }
      if ((GROWTH_MONTHS as readonly string[]).includes(answer.month)) {
        try { assertScope(actor, answer.scope); }
        catch { answer.scope = askScope; }
      }
      return { status: 200, body: { ...flags, ...answer } };
    }
    return { status: 404, body: { error: { code: 'not_found', message: 'Not found.' } } };
  } catch (err) {
    if (err instanceof CrmError) throw err;
    if (err instanceof GrowthInputError) growthError(err);
    throw err;
  }
}
