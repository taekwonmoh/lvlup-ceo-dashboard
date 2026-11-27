/** Minimal query surface shared by the Node server and the Worker dispatcher. */
import { CrmError } from './errors.ts';

export type Sql = {
  query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, any>[]; rowCount: number | null }>;
  release?: () => void;
};

export type SqlPool = Sql & { connect: () => Promise<Sql> };

export async function withTx<T>(pool: SqlPool, fn: (client: Sql) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const out = await fn(client);
    await client.query('commit');
    return out;
  } catch (err) {
    try { await client.query('rollback'); } catch { /* the original error is the one to throw */ }
    throw err;
  } finally {
    client.release?.();
  }
}

export function rethrowDb(err: unknown): never {
  if (err instanceof CrmError) throw err;
  const pgErr = err as { code?: string; message?: string };
  const message = pgErr.message || '';
  if (pgErr.code === '23514' && message.includes('pinned_note_cap')) {
    throw new CrmError(409, 'pinned_note_cap', 'A profile can have at most 3 pinned notes.');
  }
  if (pgErr.code === '23514' && message.includes('sale_credit_share_cap')) {
    throw new CrmError(409, 'sale_credit_share_cap', 'Sold-by shares cannot total more than 100%.');
  }
  if (pgErr.code === '23505') throw new CrmError(409, 'conflict', 'That record already exists.');
  throw err;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export function assertUuid(value: string): string {
  if (!isUuid(value)) throw new CrmError(400, 'bad_id', 'Use a uuid.');
  return value;
}
