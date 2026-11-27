-- QuickBooks account names for Richelle's export. Migration 015.
-- Do not apply this file to Supabase project xxyndswrierztzdbjvrd
-- or belfzlyvgjheudxhviyt, or to any other live database.
-- Local tests apply crm/migrations/015_qbo_category_mappings.sql.
-- The ordered Supabase copy is 20261127000015_qbo_category_mappings.sql.
-- Labels only. QBO_SYNC_ENABLED stays 0. QBO_ENABLED stays 0.
-- Nothing here posts a journal or charges a card.

create table if not exists qbo_category_mappings (
  id text primary key,
  kind text not null,
  brand text not null,
  name text not null,
  qbo_account_name text not null default '',
  qbo_class_name text not null default '',
  sort_order integer not null default 0,
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  check (id ~ '^[A-Za-z0-9_]{2,40}$'),
  check (kind in ('category', 'account', 'school')),
  check (brand in ('lvlup', 'goninja', 'adjust', 'school')),
  check (char_length(btrim(name)) between 1 and 80),
  check (char_length(qbo_account_name) <= 80),
  check (char_length(qbo_class_name) <= 80),
  check (name !~* 'tel:' and name !~* 'sms:'),
  check (qbo_account_name !~* 'tel:' and qbo_account_name !~* 'sms:'),
  check (qbo_class_name !~* 'tel:' and qbo_class_name !~* 'sms:'),
  check (
    (kind = 'school' and char_length(btrim(qbo_class_name)) between 1 and 80)
    or (kind in ('category', 'account') and char_length(btrim(qbo_account_name)) between 1 and 80)
  )
);

insert into qbo_category_mappings (id, kind, brand, name, qbo_account_name, qbo_class_name, sort_order)
select v.id, v.kind, v.brand, v.name, v.account_name, v.class_name, v.sort_order
from (values
  ('tuition'::text, 'category'::text, 'lvlup'::text, 'Tuition'::text, '4010 LVLUP Tuition'::text, ''::text, 10),
  ('events', 'category', 'lvlup', 'Events', '4020 LVLUP Events', '', 20),
  ('tournaments', 'category', 'lvlup', 'Tournaments', '4030 LVLUP Tournaments', '', 30),
  ('retail', 'category', 'lvlup', 'Retail / Pro Shop', '4040 LVLUP Retail', '', 40),
  ('private_lessons', 'category', 'lvlup', 'Private Lessons', '4050 LVLUP Private Lessons', '', 50),
  ('lvlup_parties', 'category', 'lvlup', 'LVLUP Birthday Parties', '4060 LVLUP Birthday Parties', '', 60),
  ('gn_classes', 'category', 'goninja', 'Go Ninja Classes', '4110 Go Ninja Classes', '', 70),
  ('gn_after_school', 'category', 'goninja', 'Go Ninja After School', '4120 Go Ninja After School', '', 80),
  ('gn_summer_camp', 'category', 'goninja', 'Go Ninja Summer Camp', '4130 Go Ninja Summer Camp', '', 90),
  ('gn_events', 'category', 'goninja', 'Go Ninja Events', '4140 Go Ninja Events', '', 100),
  ('gn_parties', 'category', 'goninja', 'Go Ninja Birthday Parties', '4150 Go Ninja Birthday Parties', '', 110),
  ('gn_retail', 'category', 'goninja', 'Go Ninja Retail', '4160 Go Ninja Retail', '', 120),
  ('acct_refunds', 'account', 'adjust', 'Refunds', '4900 Refunds', '', 200),
  ('acct_fees', 'account', 'adjust', 'Processing Fees', '6100 Processing Fees', '', 210),
  ('acct_credits', 'account', 'adjust', 'Family Credits', '2300 Family Credits', '', 220),
  ('acct_deposit', 'account', 'adjust', 'Undeposited Funds', '1200 Undeposited Funds', '', 230),
  ('waunakee', 'school', 'school', 'Waunakee', '', 'Waunakee', 300),
  ('eastmad', 'school', 'school', 'East Madison', '', 'East Madison', 310),
  ('verona', 'school', 'school', 'Verona', '', 'Verona', 320),
  ('deforest', 'school', 'school', 'DeForest', '', 'DeForest', 330),
  ('goninjaW', 'school', 'school', 'Go Ninja Waunakee', '', 'Go Ninja Waunakee', 340),
  ('goninjaV', 'school', 'school', 'Go Ninja Verona', '', 'Go Ninja Verona', 350)
) as v(id, kind, brand, name, account_name, class_name, sort_order)
where not exists (
  select 1 from qbo_category_mappings c where c.id = v.id
);

alter table qbo_category_mappings enable row level security;

drop policy if exists qbo_category_mappings_select on qbo_category_mappings;
create policy qbo_category_mappings_select on qbo_category_mappings
  for select to crm_app
  using (crm_private.staff_at(null));

drop policy if exists qbo_category_mappings_write on qbo_category_mappings;
create policy qbo_category_mappings_write on qbo_category_mappings
  for all to crm_app
  using ((select crm_private.actor_role()) = 'owner')
  with check ((select crm_private.actor_role()) = 'owner');

do $$ begin
  execute 'grant select, insert, update, delete on qbo_category_mappings to crm_app';
exception when undefined_object then null;
end $$;

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on qbo_category_mappings from anon, authenticated';
  end if;
end $$;
