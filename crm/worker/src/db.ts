/**
 * Database source for the Worker.
 * Prefer Hyperdrive. Fall back to DATABASE_URL for local dev.
 * Never log, return, or interpolate the connection string.
 */
import pg from 'pg';

export type DbVia = 'hyperdrive' | 'database_url' | 'none';

export type DbStatus = {
  configured: boolean;
  via: DbVia;
  connected: boolean;
};

export type DatabaseBinding = {
  HYPERDRIVE?: { connectionString?: string } | null;
  DATABASE_URL?: string;
};

export function resolveDatabase(env: DatabaseBinding): { via: DbVia; connectionString?: string } {
  const hyper = env.HYPERDRIVE?.connectionString;
  if (typeof hyper === 'string' && hyper.trim()) return { via: 'hyperdrive', connectionString: hyper };
  const direct = env.DATABASE_URL;
  if (typeof direct === 'string' && direct.trim()) return { via: 'database_url', connectionString: direct };
  return { via: 'none' };
}

export function createCrmPool(connectionString: string): pg.Pool {
  const pool = new pg.Pool({
    connectionString,
    max: 5,
    connectionTimeoutMillis: 8_000,
    idleTimeoutMillis: 1_000,
  });
  pool.on('error', () => {
    // The request path reports failure. Do not log the client error; it can carry the URL.
  });
  return pool;
}

export async function probePool(pool: pg.Pool): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}
