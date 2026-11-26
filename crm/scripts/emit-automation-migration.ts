import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderCatalogSeedSql } from '../src/automation-catalog.ts';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const schema = readFileSync(join(here, 'automation-schema.sql'), 'utf8').trim();
const sql = schema + '\n\n' + renderCatalogSeedSql().trim() + '\n';
writeFileSync(join(root, 'migrations', '007_automations_messaging.sql'), sql);
writeFileSync(join(root, 'supabase', 'migrations', '20261126000007_automations_messaging.sql'), sql);
console.log('wrote automation migrations', sql.length);
