-- LVLUP CRM draft schema. Phase 0.
--
-- DO NOT APPLY this file to Supabase project xxyndswrierztzdbjvrd
-- or to any other live database. That project is a different product.
-- Apply only to a new, empty CRM project when phase 1 starts.
--
-- No card data. payment_profiles holds Authorize.net CIM ids, brand,
-- last4, and expiry. There is no column for a PAN or a CVV.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type brand_code as enum ('lvlup', 'goninja');

create type plan_interval as enum ('every_4_weeks', 'monthly', 'prepaid_term');

create type program_code as enum (
  'taekwondo', 'mini_tigers', 'tigers', 'leadership', 'goninja'
);

create type membership_status as enum (
  'trial', 'active', 'hold', 'pending_cancel', 'cancelled', 'past_due'
);

create type biller_code as enum ('gymdesk', 'lvlup');

create type member_status as enum (
  'trial', 'active', 'hold', 'cancelled', 'inactive'
);

create type guardian_role as enum ('payer', 'contact');

create type hold_status as enum (
  'requested', 'approved', 'denied', 'active', 'ended'
);

create type hold_reason as enum (
  'injury', 'travel', 'financial', 'schedule', 'other'
);

create type cancel_status as enum (
  'requested', 'approved', 'completed', 'withdrawn'
);

create type invoice_status as enum (
  'draft', 'open', 'paid', 'void', 'uncollectible'
);

create type line_kind as enum (
  'tuition', 'proration', 'hold_fee', 'notice_tuition',
  'party', 'prepaid', 'upgrade', 'retail', 'refund_credit'
);

create type charge_status as enum (
  'pending', 'approved', 'declined', 'error', 'voided', 'refunded'
);

create type merchant_env as enum ('sandbox', 'live');

create type booking_kind as enum ('trial', 'member');

create type attendance_status as enum ('present', 'absent', 'late');

create type lead_status as enum (
  'new', 'booked', 'showed', 'no_show', 'enrolled', 'cold'
);

create type staff_tier as enum ('admin', 'lead', 'ops', 'frontdesk');

-- ---------------------------------------------------------------------------
-- Schools and merchants
-- ---------------------------------------------------------------------------

create table brands (
  code brand_code primary key,
  name text not null
);

insert into brands (code, name) values
  ('lvlup', 'LVLUP Martial Arts'),
  ('goninja', 'Go Ninja');

create table locations (
  id text primary key check (id in (
    'waunakee', 'eastmad', 'verona', 'deforest', 'goninjaW', 'goninjaV'
  )),
  brand brand_code not null references brands (code),
  name text not null,
  timezone text not null default 'America/Chicago',
  -- Public GymDesk ids, copied from the website so imports can reconcile.
  -- Not secrets.
  gymdesk_gym_id text,
  gymdesk_portal_host text,
  finance_note text
);

insert into locations (id, brand, name, gymdesk_gym_id, gymdesk_portal_host) values
  ('waunakee', 'lvlup', 'Waunakee', 'AppNe', 'lvlupwaunakee.gymdesk.com'),
  ('eastmad',  'lvlup', 'East Madison', 'D0q7w', 'lvlupeastmadison.gymdesk.com'),
  ('verona',   'lvlup', 'Verona', 'AnnWE', 'lvlupverona.gymdesk.com'),
  ('deforest', 'lvlup', 'DeForest', 'lYOKP', 'lvlupdeforest.gymdesk.com'),
  ('goninjaW', 'goninja', 'Go Ninja Waunakee', null, null),
  ('goninjaV', 'goninja', 'Go Ninja Verona', null, null);

create table merchant_accounts (
  id uuid primary key default gen_random_uuid(),
  location_id text not null unique references locations (id),
  label text not null,
  -- Authorize.net API login id is an identifier, not the transaction key.
  -- The transaction key and the webhook signature key stay in Worker secrets.
  api_login_id text,
  environment merchant_env not null default 'sandbox',
  live_billing_enabled boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------------

create table families (
  id uuid primary key default gen_random_uuid(),
  display_name text,
  created_at timestamptz not null default now()
);

create table guardians (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  first_name text,
  last_name text,
  phone text,
  firebase_uid text unique,
  created_at timestamptz not null default now()
);

create table guardian_families (
  family_id uuid not null references families (id),
  guardian_id uuid not null references guardians (id),
  role guardian_role not null,
  primary key (family_id, guardian_id, role)
);

create table members (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families (id),
  location_id text not null references locations (id),
  first_name text not null,
  last_name text not null,
  preferred_name text,
  birth_date date,
  status member_status not null default 'active',
  -- Bridge to Firebase students/{key}. Not a secret, but it is an identifier.
  firebase_student_key text unique,
  created_at timestamptz not null default now()
);

create index members_family_idx on members (family_id);
create index members_location_idx on members (location_id);

create table staff_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text,
  -- Mirrors staff.role: only admin or staff. Dashboard tier is dash_role.
  firebase_role text not null default 'staff' check (firebase_role in ('admin', 'staff')),
  dash_role staff_tier not null default 'frontdesk',
  can_finance boolean not null default false,
  firebase_uid text unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table staff_location_grants (
  staff_id uuid not null references staff_users (id),
  location_id text not null references locations (id),
  primary key (staff_id, location_id)
);

-- ---------------------------------------------------------------------------
-- Plans and memberships
-- ---------------------------------------------------------------------------

create table plans (
  id uuid primary key default gen_random_uuid(),
  location_id text not null references locations (id),
  name text not null,
  program program_code not null,
  amount_cents integer not null check (amount_cents >= 0),
  interval plan_interval not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table memberships (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families (id),
  location_id text not null references locations (id),
  plan_id uuid not null references plans (id),
  status membership_status not null default 'active',
  biller biller_code not null default 'gymdesk',
  started_on date not null,
  anchor_on date not null,
  next_bill_on date,
  paid_through_on date,
  gymdesk_member_id text,
  created_at timestamptz not null default now(),
  check (paid_through_on is null or next_bill_on is null or next_bill_on >= paid_through_on)
);

create index memberships_bill_idx on memberships (biller, status, next_bill_on);
create unique index memberships_gymdesk_loc_idx
  on memberships (location_id, gymdesk_member_id)
  where gymdesk_member_id is not null;

create table membership_members (
  membership_id uuid not null references memberships (id),
  member_id uuid not null references members (id),
  primary key (membership_id, member_id)
);

-- ---------------------------------------------------------------------------
-- Holds and cancellations
-- ---------------------------------------------------------------------------

create table holds (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references memberships (id),
  start_on date not null,
  end_on date not null,
  reason hold_reason not null,
  status hold_status not null default 'requested',
  note text,
  requested_at timestamptz not null default now(),
  check (end_on >= start_on)
);

create table cancellation_requests (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid references memberships (id),
  location_id text not null references locations (id),
  -- Unmatched public-form submissions keep a name until staff link them.
  submitted_name text,
  submitted_email text,
  received_on date not null,
  earliest_completion_on date not null,
  reason text,
  status cancel_status not null default 'requested',
  agreement_version text,
  agreement_accepted_at timestamptz,
  completed_on date,
  completed_by text,
  retention_notes text,
  firebase_key text unique,
  created_at timestamptz not null default now(),
  check (earliest_completion_on >= received_on)
);

-- ---------------------------------------------------------------------------
-- Ranks (ATA Songahm seed is a starting catalog, not a tested rule set)
-- ---------------------------------------------------------------------------

create table rank_programs (
  code text primary key,
  name text not null
);

insert into rank_programs (code, name) values
  ('songahm', 'ATA Songahm'),
  ('tiger', 'Tigers'),
  ('mini_tiger', 'Mini Tigers'),
  ('goninja', 'Go Ninja');

create table ranks (
  id uuid primary key default gen_random_uuid(),
  program_code text not null references rank_programs (code),
  sort_order integer not null,
  name text not null,
  unique (program_code, sort_order)
);

insert into ranks (program_code, sort_order, name) values
  ('songahm', 10, 'White'),
  ('songahm', 20, 'Orange'),
  ('songahm', 30, 'Yellow'),
  ('songahm', 40, 'Camo'),
  ('songahm', 50, 'Green'),
  ('songahm', 60, 'Purple'),
  ('songahm', 70, 'Blue'),
  ('songahm', 80, 'Brown'),
  ('songahm', 90, 'Red'),
  ('songahm', 100, 'Red/Black'),
  ('songahm', 110, '1st Degree Black'),
  ('songahm', 120, '2nd Degree Black'),
  ('songahm', 130, '3rd Degree Black'),
  ('songahm', 140, '4th Degree Black'),
  ('songahm', 150, '5th Degree Black'),
  ('songahm', 160, '6th Degree Black'),
  ('songahm', 170, '7th Degree Black'),
  ('songahm', 180, '8th Degree Black'),
  ('songahm', 190, '9th Degree Black');

create table rank_stripe_defs (
  id uuid primary key default gen_random_uuid(),
  rank_id uuid not null references ranks (id),
  sort_order integer not null,
  name text not null,
  unique (rank_id, sort_order)
);

-- Red/Black stripes already used by the members app tracker.
insert into rank_stripe_defs (rank_id, sort_order, name)
select id, n, stripe
from ranks
join (values (1, 'blue'), (2, 'black'), (3, 'silver'), (4, 'gold')) as s(n, stripe) on true
where program_code = 'songahm' and name = 'Red/Black';

create table member_rank_events (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members (id),
  rank_id uuid not null references ranks (id),
  stripe_name text,
  awarded_on date not null,
  source text not null check (source in ('gymdesk_import', 'staff', 'testing')),
  created_at timestamptz not null default now()
);

create index member_rank_events_member_idx on member_rank_events (member_id, awarded_on);

create table testing_events (
  id uuid primary key default gen_random_uuid(),
  location_id text not null references locations (id),
  held_on date not null,
  program_code text not null references rank_programs (code),
  external_url text,
  notes text
);

create table testing_registrations (
  id uuid primary key default gen_random_uuid(),
  testing_event_id uuid not null references testing_events (id),
  member_id uuid not null references members (id),
  status text not null check (status in (
    'eligible', 'registered', 'passed', 'not_passed', 'no_show'
  )),
  unique (testing_event_id, member_id)
);

-- ---------------------------------------------------------------------------
-- Schedule, attendance, leads
-- ---------------------------------------------------------------------------

create table class_templates (
  id uuid primary key default gen_random_uuid(),
  location_id text not null references locations (id),
  program program_code not null,
  title text not null,
  weekday smallint not null check (weekday between 0 and 6),
  start_local time not null,
  duration_min integer not null check (duration_min > 0),
  capacity integer not null check (capacity > 0),
  active boolean not null default true
);

create table class_sessions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references class_templates (id),
  location_id text not null references locations (id),
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  capacity integer not null check (capacity > 0),
  status text not null default 'scheduled' check (status in ('scheduled', 'cancelled')),
  check (ends_at > starts_at)
);

create index class_sessions_loc_idx on class_sessions (location_id, starts_at);

create table leads (
  id uuid primary key default gen_random_uuid(),
  location_id text not null references locations (id),
  guardian_name text not null,
  phone text,
  email text,
  child_name text,
  child_age text,
  source text not null,
  status lead_status not null default 'new',
  utm jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table bookings (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references class_sessions (id),
  kind booking_kind not null,
  member_id uuid references members (id),
  lead_id uuid references leads (id),
  created_at timestamptz not null default now(),
  check (
    (kind = 'member' and member_id is not null)
    or (kind = 'trial' and lead_id is not null)
  )
);

create table attendance (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references class_sessions (id),
  member_id uuid references members (id),
  lead_id uuid references leads (id),
  location_id text not null references locations (id),
  attended_on date not null,
  status attendance_status not null,
  source text not null check (source in ('staff', 'kiosk', 'import')),
  recorded_by uuid references staff_users (id),
  check (member_id is not null or lead_id is not null)
);

create index attendance_member_idx on attendance (member_id, attended_on);

-- ---------------------------------------------------------------------------
-- Events and parties
-- ---------------------------------------------------------------------------

create table events (
  id uuid primary key default gen_random_uuid(),
  location_id text references locations (id),
  name text not null,
  event_type text not null check (event_type in (
    'camp', 'tournament', 'clinic', 'seminar', 'party', 'belt_test', 'other'
  )),
  purpose text check (purpose in ('leads', 'profit', 'retention')),
  starts_on date,
  ends_on date,
  price_cents integer check (price_cents is null or price_cents >= 0),
  capacity integer
);

create table event_registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events (id),
  member_id uuid references members (id),
  lead_id uuid references leads (id),
  invoice_id uuid,
  check (member_id is not null or lead_id is not null)
);

create table parties (
  id uuid primary key default gen_random_uuid(),
  location_id text not null references locations (id),
  family_id uuid references families (id),
  lead_id uuid references leads (id),
  party_on date not null,
  package_name text not null,
  headcount integer,
  invoice_id uuid
);

-- ---------------------------------------------------------------------------
-- Money
-- ---------------------------------------------------------------------------

create table payment_profiles (
  id uuid primary key default gen_random_uuid(),
  location_id text not null references locations (id),
  family_id uuid not null references families (id),
  customer_profile_id text not null,
  payment_profile_id text not null,
  brand text,
  last4 text check (last4 is null or last4 ~ '^[0-9]{4}$'),
  exp_month smallint check (exp_month is null or exp_month between 1 and 12),
  exp_year smallint,
  is_default boolean not null default false,
  environment merchant_env not null default 'sandbox',
  created_at timestamptz not null default now(),
  unique (location_id, customer_profile_id, payment_profile_id)
);

create table invoices (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid references memberships (id),
  location_id text not null references locations (id),
  family_id uuid not null references families (id),
  period_start date,
  period_end date,
  status invoice_status not null default 'draft',
  shadow boolean not null default false,
  total_cents integer not null default 0,
  created_at timestamptz not null default now()
);

-- One live invoice per membership per period. Voids and shadows are excluded.
create unique index invoices_one_period_idx
  on invoices (membership_id, period_start)
  where membership_id is not null
    and period_start is not null
    and status <> 'void'
    and shadow = false;

create table invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices (id),
  kind line_kind not null,
  description text not null,
  amount_cents integer not null
);

alter table event_registrations
  add constraint event_registrations_invoice_fk
  foreign key (invoice_id) references invoices (id);

alter table parties
  add constraint parties_invoice_fk
  foreign key (invoice_id) references invoices (id);

create table charges (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices (id),
  payment_profile_id uuid not null references payment_profiles (id),
  merchant_account_id uuid not null references merchant_accounts (id),
  idempotency_key text not null unique,
  amount_cents integer not null check (amount_cents > 0),
  status charge_status not null default 'pending',
  trans_id text,
  response_code text,
  failure_reason text,
  created_at timestamptz not null default now()
);

create table charge_attempts (
  id uuid primary key default gen_random_uuid(),
  charge_id uuid not null references charges (id),
  attempt_no integer not null check (attempt_no >= 1),
  status charge_status not null,
  trans_id text,
  response_code text,
  created_at timestamptz not null default now(),
  unique (charge_id, attempt_no)
);

create table refunds (
  id uuid primary key default gen_random_uuid(),
  charge_id uuid not null references charges (id),
  amount_cents integer not null check (amount_cents > 0),
  reason text not null,
  staff_id uuid not null references staff_users (id),
  idempotency_key text not null unique,
  trans_id text,
  created_at timestamptz not null default now()
);

create table billing_runs (
  id uuid primary key default gen_random_uuid(),
  location_id text references locations (id),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  shadow boolean not null default true,
  invoices_created integer not null default 0,
  charges_submitted integer not null default 0,
  note text
);

create table webhook_events (
  id uuid primary key default gen_random_uuid(),
  location_id text not null references locations (id),
  notification_id text not null,
  event_type text not null,
  processed_at timestamptz,
  unique (location_id, notification_id)
);

create table dunning_notices (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices (id),
  attempt_no integer not null,
  sent_at timestamptz not null default now(),
  unique (invoice_id, attempt_no)
);

create table idempotency_keys (
  key text primary key,
  request_hash text not null,
  status_code integer not null,
  response jsonb not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Crosswalk and audit
-- ---------------------------------------------------------------------------

create table external_ids (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  system text not null check (system in ('gymdesk', 'firebase_student', 'authorize_cim')),
  value text not null,
  unique (system, entity_type, value)
);

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_email text,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  location_id text references locations (id),
  at timestamptz not null default now()
);

create index audit_log_entity_idx on audit_log (entity_type, entity_id);

-- ---------------------------------------------------------------------------
-- RLS on. No anon or authenticated policies. The Worker uses the service role
-- and enforces family and school scope itself. Do not add a wide-open policy
-- to "make the dashboard work."
-- ---------------------------------------------------------------------------

alter table brands enable row level security;
alter table locations enable row level security;
alter table merchant_accounts enable row level security;
alter table families enable row level security;
alter table guardians enable row level security;
alter table guardian_families enable row level security;
alter table members enable row level security;
alter table staff_users enable row level security;
alter table staff_location_grants enable row level security;
alter table plans enable row level security;
alter table memberships enable row level security;
alter table membership_members enable row level security;
alter table holds enable row level security;
alter table cancellation_requests enable row level security;
alter table rank_programs enable row level security;
alter table ranks enable row level security;
alter table rank_stripe_defs enable row level security;
alter table member_rank_events enable row level security;
alter table testing_events enable row level security;
alter table testing_registrations enable row level security;
alter table class_templates enable row level security;
alter table class_sessions enable row level security;
alter table leads enable row level security;
alter table bookings enable row level security;
alter table attendance enable row level security;
alter table events enable row level security;
alter table event_registrations enable row level security;
alter table parties enable row level security;
alter table payment_profiles enable row level security;
alter table invoices enable row level security;
alter table invoice_lines enable row level security;
alter table charges enable row level security;
alter table charge_attempts enable row level security;
alter table refunds enable row level security;
alter table billing_runs enable row level security;
alter table webhook_events enable row level security;
alter table dunning_notices enable row level security;
alter table idempotency_keys enable row level security;
alter table external_ids enable row level security;
alter table audit_log enable row level security;
