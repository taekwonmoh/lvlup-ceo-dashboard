-- Mike's billing decisions, November 2026.
-- Do not apply this file to Supabase project xxyndswrierztzdbjvrd
-- or to any other live database.

alter table plans add column if not exists grandfathered boolean not null default false;

comment on column plans.grandfathered is
  'Monthly plans that stay on a fixed day, usually the 1st. Mini-Tigers are monthly without this flag. Everything else is every 4 weeks.';

comment on column memberships.anchor_on is
  'Draft anchor. Defaults to started_on and can be set to another date. Still not a company-wide anchor.';

-- Tuition merchant for each school. The member's brand does not follow this column.
create table if not exists merchant_routes (
  location_id text primary key references locations (id),
  merchant_location_id text not null references locations (id),
  note text not null
);

insert into merchant_routes (location_id, merchant_location_id, note) values
  ('waunakee', 'waunakee', 'Waunakee drafts on its own Authorize.net account.'),
  ('eastmad', 'eastmad', 'East Madison drafts on its own Authorize.net account.'),
  ('verona', 'verona', 'Verona drafts on its own Authorize.net account.'),
  ('deforest', 'waunakee', 'DeForest drafts on the Waunakee Authorize.net account.'),
  ('goninjaW', 'waunakee', 'Go Ninja Waunakee drafts on the Waunakee account. Reports and the UI stay Go Ninja.'),
  ('goninjaV', 'verona', 'Go Ninja Verona drafts on the Verona account. Reports and the UI stay Go Ninja.')
on conflict (location_id) do update
  set merchant_location_id = excluded.merchant_location_id,
      note = excluded.note;

-- 3rd paying member and beyond. Go Ninja is not in this rule.
create table if not exists family_discount_rules (
  location_id text primary key references locations (id),
  percent_off integer not null check (percent_off between 1 and 100),
  starts_at_member integer not null default 3 check (starts_at_member >= 2)
);

insert into family_discount_rules (location_id, percent_off) values
  ('waunakee', 30),
  ('verona', 50),
  ('eastmad', 50),
  ('deforest', 50)
on conflict (location_id) do update set percent_off = excluded.percent_off;

-- A price change is stored only with the upcoming schedule that was snapshotted first.
create table if not exists upcoming_charge_snapshots (
  id uuid primary key default gen_random_uuid(),
  family_id uuid references families (id),
  label text not null,
  rows jsonb not null,
  created_at timestamptz not null default now()
);

alter table curriculum_videos add column if not exists cycle_theme text;

comment on column curriculum_videos.cycle_theme is
  'Cycle theme such as Honesty or Self-Esteem. Videos are grouped by this, not by rank.';

alter table merchant_routes enable row level security;
alter table family_discount_rules enable row level security;
alter table upcoming_charge_snapshots enable row level security;
