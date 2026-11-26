import { execFileSync } from 'node:child_process';

function psql(database: string, sql: string) {
  execFileSync('sudo', ['-u', 'postgres', 'psql', '-v', 'ON_ERROR_STOP=1', '-d', database, '-c', sql], { stdio: 'pipe' });
}

export function bootstrapDatabase(name: string) {
  if (!/^[a-z_]+$/.test(name)) throw new Error('bad database name');
  psql('postgres', `
    DO $$ BEGIN
      CREATE ROLE crm LOGIN PASSWORD 'crm';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
    ALTER ROLE crm WITH LOGIN PASSWORD 'crm' CREATEROLE;
  `);
  psql('postgres', `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${name}' AND pid <> pg_backend_pid();`);
  psql('postgres', `DROP DATABASE IF EXISTS ${name};`);
  psql('postgres', `CREATE DATABASE ${name} OWNER crm;`);
}

export function grantCrmApp() {
  psql('postgres', `
    DO $$ BEGIN
      CREATE ROLE crm_app NOLOGIN NOBYPASSRLS;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
    GRANT crm_app TO crm;
  `);
}
