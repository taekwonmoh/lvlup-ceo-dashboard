import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';

const here = dirname(fileURLToPath(import.meta.url));
export const migrationsDir = join(here, '..', 'migrations');

export async function migrate(pool: pg.Pool) {
  const names = (await readdir(migrationsDir)).filter(n => n.endsWith('.sql')).sort();
  await pool.query(`create table if not exists schema_migrations (
    name text primary key,
    applied_at timestamptz not null default now()
  )`);
  for (const name of names) {
    const done = await pool.query('select 1 from schema_migrations where name = $1', [name]);
    if (done.rowCount) continue;
    const sql = await readFile(join(migrationsDir, name), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query(sql);
      await client.query('insert into schema_migrations (name) values ($1)', [name]);
      await client.query('commit');
    } catch (err) {
      await client.query('rollback');
      throw err;
    } finally {
      client.release();
    }
  }
}
