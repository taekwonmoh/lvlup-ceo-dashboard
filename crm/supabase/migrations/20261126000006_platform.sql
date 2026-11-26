-- Platform layer for a NEW Supabase project.
-- Do not apply this file to Supabase project xxyndswrierztzdbjvrd
-- or to any live database. No card numbers. No live charges.

-- ---------------------------------------------------------------------------
-- Roles used by RLS tests. The Worker still scopes in code.
-- ---------------------------------------------------------------------------

do $$ begin
  create role crm_app nologin nobypassrls;
exception when duplicate_object then null;
         when insufficient_privilege then null;
end $$;

do $$ begin
  execute 'grant crm_app to current_user';
exception
  when insufficient_privilege then null;
  when undefined_object then null;
  when others then
    if sqlerrm ilike '%permission denied%' or sqlerrm ilike '%admin option%' then
      null;
    else
      raise;
    end if;
end $$;

-- ---------------------------------------------------------------------------
-- Schools: geofence and check-in window. Coordinates stay null until Mike sets them.
-- ---------------------------------------------------------------------------

alter table locations
  add column if not exists latitude numeric(9, 6),
  add column if not exists longitude numeric(9, 6),
  add column if not exists geofence_radius_m integer,
  add column if not exists checkin_minutes_before integer not null default 30,
  add column if not exists checkin_minutes_after integer not null default 15;

alter table locations drop constraint if exists locations_geofence_radius_chk;
alter table locations add constraint locations_geofence_radius_chk
  check (geofence_radius_m is null or geofence_radius_m between 50 and 500);
alter table locations drop constraint if exists locations_lat_chk;
alter table locations add constraint locations_lat_chk
  check (latitude is null or latitude between -90 and 90);
alter table locations drop constraint if exists locations_lng_chk;
alter table locations add constraint locations_lng_chk
  check (longitude is null or longitude between -180 and 180);
alter table locations drop constraint if exists locations_checkin_window_chk;
alter table locations add constraint locations_checkin_window_chk
  check (checkin_minutes_before between 0 and 180 and checkin_minutes_after between 0 and 180);

alter table families add column if not exists geofence_checkin_opt_in boolean not null default false;
alter table members add column if not exists geofence_checkin_opt_in boolean not null default false;
alter table members add column if not exists prospect_age text;

alter table memberships add column if not exists discount_bps integer not null default 0;
alter table memberships drop constraint if exists memberships_discount_bps_chk;
alter table memberships add constraint memberships_discount_bps_chk
  check (discount_bps between 0 and 10000);
alter table memberships add column if not exists prepaid boolean not null default false;

-- ---------------------------------------------------------------------------
-- Attendance sources and one check-in per member per session.
-- ---------------------------------------------------------------------------

do $$
declare cname text;
begin
  select c.conname into cname
  from pg_constraint c
  where c.conrelid = 'public.attendance'::regclass
    and c.contype = 'c'
    and pg_get_constraintdef(c.oid) ilike '%kiosk%';
  if cname is not null then
    execute format('alter table public.attendance drop constraint %I', cname);
  end if;
end $$;

alter table attendance add constraint attendance_source_check
  check (source in ('staff', 'kiosk', 'import', 'geofence_auto', 'qr_scan', 'manual'));

create unique index if not exists attendance_member_session_uidx
  on attendance (member_id, session_id)
  where member_id is not null and session_id is not null;

alter table bookings add column if not exists status text not null default 'booked';
alter table bookings drop constraint if exists bookings_status_chk;
alter table bookings add constraint bookings_status_chk
  check (status in ('booked', 'waitlist', 'cancelled'));

alter table class_sessions add column if not exists program text;
alter table class_sessions add column if not exists waitlist_capacity integer not null default 0;
alter table class_sessions add column if not exists trial_open boolean not null default false;
alter table class_sessions add column if not exists age_min integer;
alter table class_sessions add column if not exists age_max integer;
alter table class_sessions drop constraint if exists class_sessions_waitlist_chk;
alter table class_sessions add constraint class_sessions_waitlist_chk
  check (waitlist_capacity >= 0);

-- ---------------------------------------------------------------------------
-- Rank graph. Belt rows already exist. This only links them.
-- ---------------------------------------------------------------------------

create unique index if not exists ranks_canonical_id_uidx on ranks (canonical_id);

create table if not exists rank_transitions (
  from_canonical_id text not null,
  to_canonical_id text not null,
  kind text not null check (kind in ('next', 'program_transition')),
  primary key (from_canonical_id, to_canonical_id),
  foreign key (from_canonical_id) references ranks (canonical_id),
  foreign key (to_canonical_id) references ranks (canonical_id)
);

insert into rank_transitions (from_canonical_id, to_canonical_id, kind) values
  ('mini_tiger.baron', 'tiger.white', 'program_transition'),
  ('tiger.baron', 'songahm.white', 'program_transition')
on conflict do nothing;

create table if not exists career_pathways (
  code text primary key,
  title text not null,
  needs_signoff boolean not null default true,
  note text not null
);

create table if not exists career_milestones (
  id text primary key,
  pathway_code text not null references career_pathways (code),
  sort_order integer not null,
  title text not null,
  needs_signoff boolean not null default true,
  min_age integer,
  min_rank_canonical_id text references ranks (canonical_id),
  min_classes integer,
  min_years numeric,
  note text not null
);

create table if not exists career_title_map (
  proposed_title text primary key,
  milestone_id text references career_milestones (id),
  needs_signoff boolean not null default true,
  note text not null
);

insert into career_pathways (code, title, needs_signoff, note) values
  ('legacy_leadership', 'LVLUP Legacy', true,
   'Nine titles from the Legacy catalog. Confirm this is the Leadership track. Class counts are unset.'),
  ('ata_instructor', 'ATA Instructor Certification', true,
   'Collar names and minimum ages are from the catalog. Junior Instructor and Certified Instructor are not rank names here.'),
  ('master', 'Master', true,
   'The belt catalog ends at 9th Degree Black Belt. There is no separate Master rank.'),
  ('school_owner', 'School Owner', true,
   'The rank catalog has no School Owner rank. Requirements are unset.')
on conflict (code) do nothing;

insert into career_milestones (id, pathway_code, sort_order, title, needs_signoff, min_age, min_rank_canonical_id, note)
select canonical_id, 'legacy_leadership', sort_order / 10, name, true, null, canonical_id,
  'Name is from the catalog. Classes, time in rank, and age are unset until Mike writes them.'
from ranks where program_code = 'legacy'
on conflict (id) do nothing;

insert into career_milestones (id, pathway_code, sort_order, title, needs_signoff, min_age, min_rank_canonical_id, note)
select canonical_id, 'ata_instructor', sort_order / 10, name, true, min_age, canonical_id,
  'Minimum age is from the catalog. Class and time-in-rank requirements are unset.'
from ranks where program_code = 'ata_instructor'
on conflict (id) do nothing;

insert into career_milestones (id, pathway_code, sort_order, title, needs_signoff, min_rank_canonical_id, note) values
  ('master', 'master', 1, 'Master', true, 'songahm.bb9',
   'Suggested link is 9th Degree so the roadmap can point at the last catalog belt. Mike sets the real Master rule.'),
  ('school_owner', 'school_owner', 1, 'School Owner', true, null,
   'Rank, age, classes, and time in rank are unset.')
on conflict (id) do nothing;

insert into career_title_map (proposed_title, milestone_id, needs_signoff, note) values
  ('Leadership', 'legacy.l1', true, 'Proposed label. The catalog name is Level 1 - Connector. Confirm or replace the mapping.'),
  ('Junior Instructor', null, true, 'Not a rank name in the catalog. Map it before it is used.'),
  ('Certified Instructor', null, true, 'Not a rank name in the catalog. Map it before it is used.')
on conflict (proposed_title) do nothing;

create table if not exists certificate_jobs (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members (id),
  rank_id uuid not null references ranks (id),
  testing_event_id uuid references testing_events (id),
  status text not null default 'not_generated' check (status in ('not_generated')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- People, money, documents
-- ---------------------------------------------------------------------------

create table if not exists programs (
  code text primary key,
  brand brand_code not null,
  name text not null,
  rank_program_code text references rank_programs (code)
);

insert into programs (code, brand, name, rank_program_code) values
  ('taekwondo', 'lvlup', 'Taekwondo', 'songahm'),
  ('mini_tigers', 'lvlup', 'Mini Tigers', 'mini_tiger'),
  ('tigers', 'lvlup', 'Tigers', 'tiger'),
  ('leadership', 'lvlup', 'Leadership', 'legacy'),
  ('goninja', 'goninja', 'Go Ninja', 'goninja')
on conflict (code) do nothing;

create table if not exists waivers (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families (id),
  member_id uuid references members (id),
  location_id text not null references locations (id),
  signer_guardian_id uuid references guardians (id),
  waiver_version text not null,
  signed_on date not null,
  minor boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists member_documents (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families (id),
  member_id uuid not null references members (id),
  program_code text,
  rank_id uuid references ranks (id),
  kind text not null check (kind in ('waiver', 'form', 'other')),
  title text not null,
  storage_path text,
  signed_on date,
  signer_guardian_id uuid references guardians (id),
  minor boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists member_documents_filter_idx
  on member_documents (program_code, rank_id);

create table if not exists device_tokens (
  id uuid primary key default gen_random_uuid(),
  guardian_id uuid references guardians (id),
  member_id uuid references members (id),
  platform text not null check (platform in ('ios', 'android')),
  token text not null,
  created_at timestamptz not null default now(),
  unique (platform, token)
);

create table if not exists notification_preferences (
  guardian_id uuid primary key references guardians (id),
  rank_updates boolean not null default false,
  class_reminders boolean not null default false,
  billing boolean not null default false,
  marketing boolean not null default false
);

alter table leads add column if not exists pipeline_status text not null default 'new';
alter table leads drop constraint if exists leads_pipeline_status_chk;
alter table leads add constraint leads_pipeline_status_chk
  check (pipeline_status in ('new', 'trial_booked', 'trial_attended', 'converted', 'lost'));

create table if not exists lead_waivers (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads (id),
  waiver_version text not null,
  signer_name text not null,
  signed_on date,
  minor boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists attributions (
  id uuid primary key default gen_random_uuid(),
  family_id uuid references families (id),
  member_id uuid references members (id),
  lead_id uuid references leads (id),
  location_id text not null references locations (id),
  source_type text not null,
  source_id uuid not null,
  created_at timestamptz not null default now(),
  check (family_id is not null or lead_id is not null)
);

create table if not exists ledger_entries (
  id uuid primary key default gen_random_uuid(),
  occurred_on date not null,
  family_id uuid not null references families (id),
  member_id uuid not null references members (id),
  location_id text not null references locations (id),
  instructor_staff_id uuid references staff_users (id),
  source_type text not null check (source_type in (
    'membership', 'payment', 'event_registration', 'private_lesson', 'retail', 'party'
  )),
  source_id uuid not null,
  amount_cents integer not null,
  shadow boolean not null default false,
  memo text,
  created_at timestamptz not null default now()
);

create index if not exists ledger_family_idx on ledger_entries (family_id, occurred_on);
create index if not exists ledger_member_idx on ledger_entries (member_id, occurred_on);
create index if not exists ledger_location_idx on ledger_entries (location_id, occurred_on);

create table if not exists lesson_types (
  code text primary key,
  name text not null
);
insert into lesson_types (code, name) values
  ('private', 'Private lesson'),
  ('semi_private', 'Semi-private lesson')
on conflict (code) do nothing;

create table if not exists lesson_packages (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families (id),
  member_id uuid not null references members (id),
  location_id text not null references locations (id),
  lesson_type text not null references lesson_types (code),
  credits_total integer not null check (credits_total > 0),
  credits_remaining integer not null check (credits_remaining >= 0),
  price_cents integer not null check (price_cents >= 0),
  purchased_on date not null,
  check (credits_remaining <= credits_total)
);

create table if not exists private_lessons (
  id uuid primary key default gen_random_uuid(),
  instructor_staff_id uuid not null references staff_users (id),
  member_id uuid not null references members (id),
  family_id uuid not null references families (id),
  location_id text not null references locations (id),
  starts_at timestamptz not null,
  duration_min integer not null check (duration_min > 0),
  price_cents integer not null check (price_cents >= 0),
  lesson_type text not null references lesson_types (code),
  package_id uuid references lesson_packages (id),
  paid boolean not null default false,
  status text not null default 'scheduled' check (status in ('scheduled', 'taught', 'cancelled', 'no_show')),
  created_at timestamptz not null default now()
);

create table if not exists instructor_pay_rules (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff_users (id),
  location_id text references locations (id),
  lesson_type text references lesson_types (code),
  percent_bps integer not null check (percent_bps between 0 and 10000),
  effective_on date not null,
  ends_on date,
  check (ends_on is null or ends_on >= effective_on)
);

create table if not exists retail_purchases (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families (id),
  member_id uuid not null references members (id),
  location_id text not null references locations (id),
  sold_on date not null,
  description text not null,
  amount_cents integer not null check (amount_cents >= 0),
  created_at timestamptz not null default now()
);

create table if not exists qbo_companies (
  id text primary key,
  legal_name text not null,
  active boolean not null default false
);

create table if not exists qbo_company_locations (
  location_id text primary key references locations (id),
  company_id text not null references qbo_companies (id)
);

insert into qbo_companies (id, legal_name) values
  ('moh', 'Moh''s Martial Arts LLC'),
  ('lvlup2', 'LVLUP Martial Arts 2 LLC'),
  ('lvlup3', 'LVLUP Martial Arts 3 LLC')
on conflict (id) do nothing;

insert into qbo_company_locations (location_id, company_id) values
  ('waunakee', 'moh'),
  ('deforest', 'moh'),
  ('goninjaW', 'moh'),
  ('eastmad', 'lvlup2'),
  ('verona', 'lvlup3'),
  ('goninjaV', 'lvlup3')
on conflict (location_id) do nothing;

create table if not exists qbo_export_previews (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references qbo_companies (id),
  kind text not null check (kind in ('journal', 'bill')),
  period_start date not null,
  period_end date not null,
  payload jsonb not null,
  submitted boolean not null default false check (submitted = false),
  created_at timestamptz not null default now()
);

create table if not exists billing_shadow_runs (
  id uuid primary key default gen_random_uuid(),
  merchant_location_id text not null references locations (id),
  run_on date not null,
  summary jsonb not null,
  created_at timestamptz not null default now(),
  unique (merchant_location_id, run_on)
);

alter table dunning_notices add column if not exists delivery_status text not null default 'dry_run';
alter table dunning_notices drop constraint if exists dunning_notices_delivery_chk;
alter table dunning_notices add constraint dunning_notices_delivery_chk
  check (delivery_status in ('dry_run'));

create table if not exists automation_rules (
  code text primary key,
  trigger_name text not null,
  enabled boolean not null default false,
  dry_run boolean not null default true,
  check (enabled = false and dry_run = true)
);

insert into automation_rules (code, trigger_name) values
  ('missed_class', 'missed_class'),
  ('upcoming_test', 'upcoming_test'),
  ('birthday', 'birthday'),
  ('low_attendance', 'low_attendance'),
  ('payment_issue', 'payment_issue'),
  ('trial_followup', 'trial_followup')
on conflict (code) do nothing;

create table if not exists communication_log (
  id uuid primary key default gen_random_uuid(),
  rule_code text not null references automation_rules (code),
  family_id uuid references families (id),
  member_id uuid references members (id),
  lead_id uuid references leads (id),
  channel text not null check (channel in ('email', 'push', 'in_app')),
  status text not null default 'dry_run' check (status in ('dry_run')),
  template_code text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Go Ninja parties. Guest checkout. Charged stays false in this build.
-- ---------------------------------------------------------------------------

create table if not exists party_packages (
  id uuid primary key default gen_random_uuid(),
  location_id text not null references locations (id),
  name text not null,
  duration_min integer not null check (duration_min > 0),
  price_cents integer not null check (price_cents >= 0),
  deposit_cents integer not null check (deposit_cents >= 0),
  active boolean not null default true
);

create table if not exists party_addons (
  id uuid primary key default gen_random_uuid(),
  location_id text not null references locations (id),
  name text not null,
  price_cents integer not null check (price_cents >= 0),
  active boolean not null default true
);

create table if not exists party_slots (
  id uuid primary key default gen_random_uuid(),
  location_id text not null references locations (id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'open' check (status in ('open', 'closed')),
  check (ends_at > starts_at)
);

create table if not exists party_bookings (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null references party_slots (id),
  package_id uuid not null references party_packages (id),
  location_id text not null references locations (id),
  lead_id uuid references leads (id),
  host_name text not null,
  host_email text not null,
  child_name text not null,
  child_age text not null,
  guest_count integer not null check (guest_count > 0),
  status text not null default 'booked' check (status in ('booked', 'cancelled')),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'deposit_intent', 'full_intent')),
  charged boolean not null default false check (charged = false),
  access_key_hash text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists party_bookings_one_slot
  on party_bookings (slot_id) where status <> 'cancelled';

create table if not exists party_booking_addons (
  booking_id uuid not null references party_bookings (id),
  addon_id uuid not null references party_addons (id),
  primary key (booking_id, addon_id)
);

create table if not exists party_waivers (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references party_bookings (id),
  role text not null check (role in ('host', 'guest')),
  signer_name text not null,
  waiver_version text not null,
  signed_on date,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Events: one family checkout, several attendees, offers are the dates.
-- ---------------------------------------------------------------------------

create table if not exists event_offers (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events (id),
  title text not null,
  starts_at timestamptz,
  ends_at timestamptz,
  price_cents integer not null check (price_cents >= 0),
  capacity integer not null check (capacity > 0),
  waitlist_capacity integer not null default 0 check (waitlist_capacity >= 0)
);

create table if not exists event_checkouts (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families (id),
  event_id uuid not null references events (id),
  list_cents integer not null,
  discount_cents integer not null default 0,
  due_cents integer not null,
  status text not null check (status in ('reserved', 'waitlisted', 'cancelled')),
  created_at timestamptz not null default now()
);

alter table event_registrations add column if not exists family_id uuid references families (id);
alter table event_registrations add column if not exists offer_id uuid references event_offers (id);
alter table event_registrations add column if not exists checkout_id uuid references event_checkouts (id);
alter table event_registrations add column if not exists status text not null default 'registered';
alter table event_registrations drop constraint if exists event_registrations_status_chk;
alter table event_registrations add constraint event_registrations_status_chk
  check (status in ('registered', 'waitlisted', 'cancelled'));
alter table event_registrations drop constraint if exists event_registrations_attribution_chk;
alter table event_registrations add constraint event_registrations_attribution_chk
  check (member_id is null or family_id is not null);

-- ---------------------------------------------------------------------------
-- Private crosswalk. Forced RLS. No card number column.
-- ---------------------------------------------------------------------------

create schema if not exists crm_private;
revoke all on schema crm_private from public;

create table if not exists crm_private.identity_crosswalk (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references public.members (id),
  family_id uuid references public.families (id),
  location_id text not null references public.locations (id),
  merchant_location_id text not null references public.locations (id),
  gymdesk_member_id text,
  firebase_student_key text,
  firebase_family_ids text[] not null default '{}',
  customer_profile_id text,
  payment_profile_id text,
  created_at timestamptz not null default now(),
  unique (location_id, gymdesk_member_id),
  check (customer_profile_id is null or customer_profile_id ~ '^[0-9]{1,12}$'),
  check (payment_profile_id is null or payment_profile_id ~ '^[0-9]{1,12}$'),
  check (gymdesk_member_id is null or gymdesk_member_id ~ '^[0-9]{4,12}$')
);

create or replace function crm_private.set_actor(p_role text, p_locations text, p_families text)
returns void
language plpgsql
set search_path = crm_private, public
as $$
begin
  if p_role not in ('owner', 'school_lead', 'front_desk', 'coach', 'ops', 'family', 'import') then
    raise exception 'bad actor';
  end if;
  if p_families is not null and p_families <> '' then
    perform string_to_array(p_families, ',')::uuid[];
  end if;
  perform set_config('crm.role', p_role, true);
  perform set_config('crm.locations', coalesce(p_locations, ''), true);
  perform set_config('crm.families', coalesce(p_families, ''), true);
end;
$$;

create or replace function crm_private.actor_role()
returns text language sql stable set search_path = crm_private, public
as $$ select nullif(current_setting('crm.role', true), '') $$;

create or replace function crm_private.actor_locations()
returns text[] language sql stable set search_path = crm_private, public
as $$
  select case
    when coalesce(current_setting('crm.locations', true), '') = '' then '{}'::text[]
    else string_to_array(current_setting('crm.locations', true), ',')
  end
$$;

create or replace function crm_private.actor_families()
returns uuid[] language sql stable set search_path = crm_private, public
as $$
  select case
    when coalesce(current_setting('crm.families', true), '') = '' then '{}'::uuid[]
    else string_to_array(current_setting('crm.families', true), ',')::uuid[]
  end
$$;

revoke all on function crm_private.set_actor(text, text, text) from public;
do $$ begin
  execute 'grant execute on function crm_private.set_actor(text, text, text) to crm_app';
exception when undefined_object then null;
end $$;

alter table crm_private.identity_crosswalk enable row level security;
alter table crm_private.identity_crosswalk force row level security;
drop policy if exists crosswalk_actor on crm_private.identity_crosswalk;
create policy crosswalk_actor on crm_private.identity_crosswalk
  for all
  using ((select crm_private.actor_role()) in ('owner', 'import'))
  with check ((select crm_private.actor_role()) in ('owner', 'import'));

do $$ begin
  execute 'grant usage on schema crm_private to crm_app';
  execute 'grant select on crm_private.identity_crosswalk to crm_app';
  execute 'grant select on public.members to crm_app';
exception when undefined_object then null;
end $$;

create or replace function crm_private.can_read_member(loc text, fam uuid)
returns boolean
language sql
stable
set search_path = crm_private, public
as $$
  select (select crm_private.actor_role()) = 'owner'
    or (
      (select crm_private.actor_role()) in ('school_lead', 'front_desk', 'coach', 'ops')
      and loc = any (crm_private.actor_locations())
    )
    or (
      (select crm_private.actor_role()) = 'family'
      and fam = any (crm_private.actor_families())
    );
$$;

drop policy if exists members_crm_app_select on members;
create policy members_crm_app_select on members
  for select to crm_app
  using ((select crm_private.can_read_member(location_id, family_id)));

do $$
declare cname text;
begin
  select c.conname into cname
  from pg_constraint c
  where c.conrelid = 'public.external_ids'::regclass
    and c.contype = 'c'
    and pg_get_constraintdef(c.oid) ilike '%gymdesk%';
  if cname is not null then
    execute format('alter table public.external_ids drop constraint %I', cname);
  end if;
end $$;

alter table external_ids add constraint external_ids_system_check
  check (system in ('gymdesk', 'firebase_student', 'authorize_cim', 'firebase_family'));

-- New public tables: RLS on, no anon policies.
alter table programs enable row level security;
alter table waivers enable row level security;
alter table member_documents enable row level security;
alter table device_tokens enable row level security;
alter table notification_preferences enable row level security;
alter table lead_waivers enable row level security;
alter table attributions enable row level security;
alter table ledger_entries enable row level security;
alter table lesson_types enable row level security;
alter table lesson_packages enable row level security;
alter table private_lessons enable row level security;
alter table instructor_pay_rules enable row level security;
alter table retail_purchases enable row level security;
alter table qbo_companies enable row level security;
alter table qbo_company_locations enable row level security;
alter table qbo_export_previews enable row level security;
alter table billing_shadow_runs enable row level security;
alter table automation_rules enable row level security;
alter table communication_log enable row level security;
alter table party_packages enable row level security;
alter table party_addons enable row level security;
alter table party_slots enable row level security;
alter table party_bookings enable row level security;
alter table party_booking_addons enable row level security;
alter table party_waivers enable row level security;
alter table event_offers enable row level security;
alter table event_checkouts enable row level security;
alter table rank_transitions enable row level security;
alter table career_pathways enable row level security;
alter table career_milestones enable row level security;
alter table career_title_map enable row level security;
alter table certificate_jobs enable row level security;

create or replace view household_ledger with (security_invoker = true) as
  select * from ledger_entries where shadow = false;

create or replace view check_ins with (security_invoker = true) as
  select id, member_id, location_id, session_id, attended_on as checked_in_on, status, source
  from attendance;
