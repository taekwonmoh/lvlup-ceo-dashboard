-- Go Ninja household sibling discounts.
-- This file is 018_goninja_household_discounts.sql so it does not collide
-- with 017_growth_desk. 018_testing_participation.sql is a different migration.
-- The ordered copies are crm/migrations/019_goninja_household_discounts.sql
-- and 20261127000019_goninja_household_discounts.sql.
-- Idempotent. Do not apply this file to a live database.
-- Sample configuration only. Nothing here charges a card.
-- This table does not replace family_discount_rules. That LVLUP rule stays as it is.
-- Pro Shop pass-through and belt-test prices are not in this file.

create table if not exists household_discount_rules (
  id text primary key,
  location_id text not null,
  program text not null,
  active boolean not null default true,
  mode text not null default 'stackable',
  second_kind text not null default 'percent',
  second_percent numeric(5,2),
  second_amount_cents integer,
  third_kind text not null default 'percent',
  third_percent numeric(5,2),
  third_amount_cents integer,
  multi_week_min integer,
  multi_week_kind text,
  multi_week_percent numeric(5,2),
  multi_week_amount_cents integer,
  label text not null default '',
  updated_at timestamptz not null default now(),
  check (id ~ '^[a-z0-9-]{2,40}$'),
  check (location_id in ('goninjaW', 'goninjaV', 'all')),
  check (program in ('ninja_8wk', 'summer_camp', 'afterschool', 'pno', 'all')),
  check (mode in ('stackable', 'best')),
  check (second_kind in ('percent', 'amount')),
  check (third_kind in ('percent', 'amount')),
  check (second_percent is null or (second_percent >= 0 and second_percent <= 100)),
  check (third_percent is null or (third_percent >= 0 and third_percent <= 100)),
  check (second_amount_cents is null or second_amount_cents >= 0),
  check (third_amount_cents is null or third_amount_cents >= 0),
  check (multi_week_min is null or multi_week_min between 2 and 16),
  check (multi_week_kind is null or multi_week_kind in ('percent', 'amount')),
  check (multi_week_percent is null or (multi_week_percent >= 0 and multi_week_percent <= 100)),
  check (multi_week_amount_cents is null or multi_week_amount_cents >= 0),
  check (second_kind <> 'percent' or second_percent is not null),
  check (second_kind <> 'amount' or second_amount_cents is not null),
  check (third_kind <> 'percent' or third_percent is not null),
  check (third_kind <> 'amount' or third_amount_cents is not null),
  check (
    multi_week_min is null
    or (
      multi_week_kind is not null
      and (
        (multi_week_kind = 'percent' and multi_week_percent is not null)
        or (multi_week_kind = 'amount' and multi_week_amount_cents is not null)
      )
    )
  ),
  check (char_length(label) <= 160),
  unique (location_id, program)
);

comment on table household_discount_rules is
  'Go Ninja sibling discounts by school and program. Sample rates. Does not charge. Does not replace family_discount_rules.';

insert into household_discount_rules (
  id, location_id, program, active, mode,
  second_kind, second_percent, second_amount_cents,
  third_kind, third_percent, third_amount_cents,
  multi_week_min, multi_week_kind, multi_week_percent, multi_week_amount_cents,
  label
) values
  ('gnw-all', 'goninjaW', 'all', true, 'stackable', 'percent', 10, null, 'percent', 20, null, null, null, null, null, 'Every Go Ninja program at Waunakee'),
  ('gnw-ninja-8wk', 'goninjaW', 'ninja_8wk', true, 'stackable', 'percent', 10, null, 'percent', 20, null, null, null, null, null, '8-week academy at Waunakee'),
  ('gnw-summer-camp', 'goninjaW', 'summer_camp', true, 'stackable', 'percent', 10, null, 'percent', 20, null, 3, 'percent', 5, null, 'Summer camp at Waunakee, with a 3-week bundle'),
  ('gnw-afterschool', 'goninjaW', 'afterschool', true, 'stackable', 'percent', 10, null, 'percent', 20, null, null, null, null, null, 'Afterschool at Waunakee'),
  ('gnw-pno', 'goninjaW', 'pno', true, 'stackable', 'percent', 10, null, 'percent', 20, null, null, null, null, null, 'Parents night out at Waunakee'),
  ('gnv-all', 'goninjaV', 'all', true, 'stackable', 'percent', 10, null, 'percent', 20, null, null, null, null, null, 'Every Go Ninja program at Verona'),
  ('gnv-ninja-8wk', 'goninjaV', 'ninja_8wk', true, 'stackable', 'percent', 10, null, 'percent', 20, null, null, null, null, null, '8-week academy at Verona'),
  ('gnv-summer-camp', 'goninjaV', 'summer_camp', true, 'stackable', 'percent', 10, null, 'percent', 20, null, 3, 'percent', 5, null, 'Summer camp at Verona, with a 3-week bundle'),
  ('gnv-afterschool', 'goninjaV', 'afterschool', true, 'stackable', 'percent', 10, null, 'percent', 20, null, null, null, null, null, 'Afterschool at Verona'),
  ('gnv-pno', 'goninjaV', 'pno', true, 'stackable', 'percent', 10, null, 'percent', 20, null, null, null, null, null, 'Parents night out at Verona')
on conflict (id) do nothing;

create index if not exists household_discount_rules_loc_idx
  on household_discount_rules (location_id, program);

alter table household_discount_rules enable row level security;

drop policy if exists household_discount_rules_select on household_discount_rules;
create policy household_discount_rules_select on household_discount_rules
  for select to crm_app
  using (crm_private.staff_at(null));

drop policy if exists household_discount_rules_write on household_discount_rules;
create policy household_discount_rules_write on household_discount_rules
  for all to crm_app
  using (crm_private.staff_at(null))
  with check (crm_private.staff_at(null));

do $$ begin
  execute 'grant select, insert, update, delete on household_discount_rules to crm_app';
exception when undefined_object then null;
end $$;

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on household_discount_rules from anon, authenticated';
  end if;
end $$;
