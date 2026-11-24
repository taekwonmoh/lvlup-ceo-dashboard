/** Prints migration 005. Run from crm/: node --experimental-strip-types scripts/emit-rank-migration.ts */
import { CYCLES } from '../src/cycles.ts';
import { lessonsFor, type Lesson } from '../src/curriculum.ts';
import {
  ALIASES, COLOR_BELT_STRIPES, DEGREE_REQUIREMENTS, PROGRAMS, RANKS, RED_BLACK_STRIPES,
} from '../src/ranks.ts';

function q(value: string) {
  return "'" + value.replace(/'/g, "''") + "'";
}

function num(value: number | null) {
  return value == null ? 'null' : String(value);
}

function jsonb(value: unknown) {
  return q(JSON.stringify(value)) + '::jsonb';
}

const lines: string[] = [];
lines.push(`-- Rank ladders, GymDesk aliases, cycle calendar, and curriculum slots.
-- DO NOT APPLY this file to Supabase project xxyndswrierztzdbjvrd
-- or to any other live database. Local CRM tests only.
-- Mock catalog. No student names, emails, phones, or live revenue.

alter table rank_programs add column if not exists ranked boolean not null default true;
alter table rank_programs add column if not exists ages text;

alter table ranks add column if not exists canonical_id text;
alter table ranks add column if not exists belt_color text;
alter table ranks add column if not exists mascot text;
alter table ranks add column if not exists theme text;
alter table ranks add column if not exists sessions_required integer;
alter table ranks add column if not exists sessions_by_location jsonb not null default '{}'::jsonb;
alter table ranks add column if not exists curriculum_level text;
alter table ranks add column if not exists min_age integer;
alter table ranks add column if not exists stripe_system text;
alter table ranks add column if not exists degree_bars integer;

alter table ranks drop constraint if exists ranks_curriculum_level_chk;
alter table ranks add constraint ranks_curriculum_level_chk check (
  curriculum_level is null or curriculum_level in (
    'mini_tigers', 'tigers', 'beginners', 'intermediate', 'advanced', 'black_belt', 'legacy', 'go_ninja'
  )
);

-- Free the Songahm sort keys before the Recommended/Decided split lands.
update ranks set sort_order = sort_order + 1000 where program_code = 'songahm';
`);

const programNames: Record<string, string> = {
  songahm: 'Taekwondo (Ages 8-Adult)',
  tiger: 'Tigers (Ages 5-7)',
  mini_tiger: 'Mini Tigers (Ages 3-4)',
  goninja: 'Go Ninja Movement Academy',
};
for (const [code, name] of Object.entries(programNames)) {
  const prog = PROGRAMS.find(row => row.code === code)!;
  lines.push(`update rank_programs set name = ${q(name)}, ranked = true, ages = ${prog.ages ? q(prog.ages) : 'null'} where code = ${q(code)};`);
}

const existingSongahm = RANKS.filter(rank => rank.program === 'songahm' && [
  'songahm.white', 'songahm.orange', 'songahm.yellow',
  'songahm.camo_recommended', 'songahm.green_recommended', 'songahm.purple_recommended',
  'songahm.blue_recommended', 'songahm.brown_recommended', 'songahm.red_recommended',
  'songahm.red_black', 'songahm.bb1', 'songahm.bb2', 'songahm.bb3', 'songahm.bb4',
  'songahm.bb5', 'songahm.bb6', 'songahm.bb7', 'songahm.bb8', 'songahm.bb9',
].includes(rank.canonicalId));

const oldName: Record<string, string> = {
  'songahm.white': 'White',
  'songahm.orange': 'Orange',
  'songahm.yellow': 'Yellow',
  'songahm.camo_recommended': 'Camo',
  'songahm.green_recommended': 'Green',
  'songahm.purple_recommended': 'Purple',
  'songahm.blue_recommended': 'Blue',
  'songahm.brown_recommended': 'Brown',
  'songahm.red_recommended': 'Red',
  'songahm.red_black': 'Red/Black',
  'songahm.bb1': '1st Degree Black',
  'songahm.bb2': '2nd Degree Black',
  'songahm.bb3': '3rd Degree Black',
  'songahm.bb4': '4th Degree Black',
  'songahm.bb5': '5th Degree Black',
  'songahm.bb6': '6th Degree Black',
  'songahm.bb7': '7th Degree Black',
  'songahm.bb8': '8th Degree Black',
  'songahm.bb9': '9th Degree Black',
};

lines.push('');
for (const rank of existingSongahm) {
  lines.push(`update ranks set
  canonical_id = ${q(rank.canonicalId)},
  sort_order = ${rank.sortOrder},
  name = ${q(rank.name)},
  belt_color = ${q(rank.beltColor)},
  mascot = ${rank.mascot ? q(rank.mascot) : 'null'},
  theme = ${rank.theme ? q(rank.theme) : 'null'},
  sessions_required = ${num(rank.sessionsRequired)},
  sessions_by_location = ${jsonb(rank.sessionsByLocation)},
  curriculum_level = ${rank.curriculumLevel ? q(rank.curriculumLevel) : 'null'},
  min_age = ${num(rank.minAge)},
  stripe_system = ${q(rank.stripeSystem)},
  degree_bars = ${num(rank.degreeBars)}
where program_code = 'songahm' and name = ${q(oldName[rank.canonicalId])};`);
}

const newPrograms = PROGRAMS.filter(prog => !['songahm', 'tiger', 'mini_tiger', 'goninja'].includes(prog.code));
lines.push('');
lines.push('insert into rank_programs (code, name, ranked, ages) values');
lines.push(newPrograms.map(prog => `  (${q(prog.code)}, ${q(prog.name)}, ${prog.ranked}, ${prog.ages ? q(prog.ages) : 'null'})`).join(',\n') + ';');

function rankInsert(rank: typeof RANKS[number]) {
  return `(${q(rank.program)}, ${rank.sortOrder}, ${q(rank.name)}, ${q(rank.canonicalId)}, ${q(rank.beltColor)}, ${rank.mascot ? q(rank.mascot) : 'null'}, ${rank.theme ? q(rank.theme) : 'null'}, ${num(rank.sessionsRequired)}, ${jsonb(rank.sessionsByLocation)}, ${rank.curriculumLevel ? q(rank.curriculumLevel) : 'null'}, ${num(rank.minAge)}, ${q(rank.stripeSystem)}, ${num(rank.degreeBars)})`;
}

const fresh = RANKS.filter(rank => !oldName[rank.canonicalId]);
lines.push('');
lines.push(`insert into ranks (
  program_code, sort_order, name, canonical_id, belt_color, mascot, theme,
  sessions_required, sessions_by_location, curriculum_level, min_age, stripe_system, degree_bars
) values`);
lines.push(fresh.map(rankInsert).join(',\n') + ';');

lines.push(`
alter table ranks alter column canonical_id set not null;
create unique index if not exists ranks_canonical_id_idx on ranks (canonical_id);

create table if not exists rank_aliases (
  program_code text not null references rank_programs (code),
  alias text not null,
  alias_key text not null,
  canonical_id text not null references ranks (canonical_id),
  primary key (program_code, alias_key)
);

insert into rank_aliases (program_code, alias, alias_key, canonical_id) values`);

function aliasKey(value: string) {
  return value.trim().toLowerCase().replace(/\s*\/\s*/g, '/').replace(/\s*-\s*/g, ' - ').replace(/\s+/g, ' ');
}

const seen = new Set<string>();
const aliasRows: string[] = [];
for (const row of ALIASES) {
  const key = row.program + '\0' + aliasKey(row.alias);
  if (seen.has(key)) continue;
  seen.add(key);
  aliasRows.push(`  (${q(row.program)}, ${q(row.alias)}, ${q(aliasKey(row.alias))}, ${q(row.canonicalId)})`);
}
lines.push(aliasRows.join(',\n') + ';');

lines.push(`
create table if not exists stripe_systems (
  code text primary key,
  description text not null
);
insert into stripe_systems (code, description) values
  ('color_belt', 'White 4 credits, Blue 8, Red 12, plus optional Gold, Silver, and Green Set-to-Test'),
  ('red_black', 'Red/Black stripes: Blue weapons, Black board breaks, Silver forms, Gold sparring')
on conflict (code) do nothing;

create table if not exists stripe_system_steps (
  system_code text not null references stripe_systems (code),
  sort_order integer not null,
  name text not null,
  credits integer,
  optional boolean not null,
  meaning text not null,
  primary key (system_code, sort_order)
);
insert into stripe_system_steps (system_code, sort_order, name, credits, optional, meaning) values`);

const steps = [...COLOR_BELT_STRIPES, ...RED_BLACK_STRIPES];
lines.push(steps.map(step => `  (${q(step.system)}, ${step.sortOrder}, ${q(step.name)}, ${num(step.credits)}, ${step.optional}, ${q(step.meaning)})`).join(',\n') + ';');

lines.push(`
create table if not exists degree_requirements (
  canonical_id text primary key references ranks (canonical_id),
  next_rank text not null,
  pass_score text not null,
  min_classes integer,
  min_years numeric,
  midterm_points integer,
  stripes jsonb not null,
  tournaments jsonb not null,
  must_register boolean not null,
  team_gate text,
  notes text
);
insert into degree_requirements (
  canonical_id, next_rank, pass_score, min_classes, min_years, midterm_points,
  stripes, tournaments, must_register, team_gate, notes
) values`);
lines.push(DEGREE_REQUIREMENTS.map(row => `  (${q(row.canonicalId)}, ${q(row.nextRank)}, ${q(row.passScore)}, ${num(row.minClasses)}, ${num(row.minYears)}, ${num(row.midtermPoints)}, ${jsonb(row.stripes)}, ${jsonb(row.tournaments)}, ${row.mustRegister}, ${row.teamGate ? q(row.teamGate) : 'null'}, ${row.notes ? q(row.notes) : 'null'})`).join(',\n') + ';');

lines.push(`
create table if not exists curriculum_cycles (
  start_on date primary key,
  cycle_no integer not null check (cycle_no between 1 and 6),
  theme text not null,
  motto text not null,
  test_on date not null
);
insert into curriculum_cycles (start_on, cycle_no, theme, motto, test_on) values`);
lines.push(CYCLES.map(cycle => `  (${q(cycle.startOn)}, ${cycle.cycleNo}, ${q(cycle.theme)}, ${q(cycle.motto)}, ${q(cycle.testOn)})`).join(',\n') + ';');

const levels = ['mini_tigers', 'tigers', 'beginners', 'intermediate', 'advanced', 'black_belt', 'legacy', 'go_ninja'] as const;
const lessonRows: Lesson[] = [];
for (const cycle of CYCLES.filter(cycle => cycle.startOn.startsWith('2026-') && cycle.startOn < '2026-12-14')) {
  for (const level of levels) lessonRows.push(...lessonsFor(level, cycle.cycleNo, cycle.theme));
}

lines.push(`
create table if not exists curriculum_lessons (
  level text not null,
  cycle_no integer not null check (cycle_no between 1 and 6),
  slot integer not null,
  category text not null,
  title text not null,
  meta text not null,
  vimeo_id text,
  sample boolean not null,
  note text,
  primary key (level, cycle_no, slot)
);
insert into curriculum_lessons (level, cycle_no, slot, category, title, meta, vimeo_id, sample, note) values`);
lines.push(lessonRows.map(row => `  (${q(row.level)}, ${row.cycleNo}, ${row.slot}, ${q(row.category)}, ${q(row.title)}, ${q(row.meta)}, ${row.vimeoId ? q(row.vimeoId) : 'null'}, ${row.sample}, ${row.note ? q(row.note) : 'null'})`).join(',\n') + ';');

lines.push(`
alter table rank_aliases enable row level security;
alter table stripe_systems enable row level security;
alter table stripe_system_steps enable row level security;
alter table degree_requirements enable row level security;
alter table curriculum_cycles enable row level security;
alter table curriculum_lessons enable row level security;
`);

process.stdout.write(lines.join('\n'));
