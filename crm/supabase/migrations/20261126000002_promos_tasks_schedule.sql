-- Promo codes, belt-testing eligibility, curriculum pointers,
-- staff task sheets, and the staff scheduler.
--
-- Draft for a new CRM database. Do not apply to Supabase project
-- xxyndswrierztzdbjvrd or to any live database.
-- The live task sheet and the live scheduler stay on Firebase.
-- These tables are the shared model an adapter can fill.

alter table staff_users add column if not exists clock_staff_id text unique;
alter table staff_users add column if not exists firebase_email_key text;

alter table bookings add column if not exists list_price_cents integer;
alter table bookings add column if not exists discount_cents integer not null default 0;

-- ---------------------------------------------------------------------------
-- Promo codes
-- ---------------------------------------------------------------------------

create table promo_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  discount_type text not null check (discount_type in ('percent', 'fixed', 'free')),
  percent_off numeric(5,2) check (percent_off is null or (percent_off > 0 and percent_off <= 100)),
  amount_off_cents integer check (amount_off_cents is null or amount_off_cents > 0),
  starts_on date,
  ends_on date,
  max_redemptions integer check (max_redemptions is null or max_redemptions > 0),
  max_per_family integer check (max_per_family is null or max_per_family > 0),
  max_per_member integer check (max_per_member is null or max_per_member > 0),
  audience text not null default 'all' check (audience in ('all', 'members', 'new_customers')),
  stacks boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (ends_on is null or starts_on is null or ends_on >= starts_on),
  check (
    (discount_type = 'percent' and percent_off is not null)
    or (discount_type = 'fixed' and amount_off_cents is not null)
    or discount_type = 'free'
  )
);

create table promo_code_scopes (
  id uuid primary key default gen_random_uuid(),
  promo_code_id uuid not null references promo_codes (id),
  scope_type text not null check (scope_type in (
    'all', 'brand', 'location', 'event_type', 'event', 'session'
  )),
  brand brand_code,
  location_id text references locations (id),
  event_type text,
  event_id uuid references events (id),
  session_id uuid references class_sessions (id)
);

create table promo_redemptions (
  id uuid primary key default gen_random_uuid(),
  promo_code_id uuid not null references promo_codes (id),
  booking_id uuid references bookings (id),
  charge_id uuid references charges (id),
  family_id uuid references families (id),
  member_id uuid references members (id),
  discount_cents integer not null check (discount_cents >= 0),
  created_at timestamptz not null default now()
);

create index promo_redemptions_code_idx on promo_redemptions (promo_code_id);

-- ---------------------------------------------------------------------------
-- Ranks: eligibility inputs and curriculum pointers (Vimeo ids only)
-- ---------------------------------------------------------------------------

create table rank_requirements (
  rank_id uuid primary key references ranks (id),
  min_classes integer not null default 0 check (min_classes >= 0),
  min_days_in_rank integer not null default 0 check (min_days_in_rank >= 0),
  requires_instructor_signoff boolean not null default true
);

create table testing_signoffs (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members (id),
  rank_id uuid not null references ranks (id),
  instructor_staff_id uuid not null references staff_users (id),
  signed_on date not null,
  unique (member_id, rank_id, instructor_staff_id)
);

create table curriculum_videos (
  id uuid primary key default gen_random_uuid(),
  rank_id uuid references ranks (id),
  title text not null,
  vimeo_id text not null,
  cycle_name text,
  sort_order integer not null default 0
);

-- ---------------------------------------------------------------------------
-- Staff task sheets
-- Live path today: ceo/tasks/emp/{seat}/{daily|weekly|monthly|cycle|cycle_checklist}/{period}/{taskId}
-- ---------------------------------------------------------------------------

create table task_definitions (
  id text primary key,
  cadence text not null check (cadence in ('daily', 'weekly', 'cycle', 'monthly')),
  title text not null,
  seat_id text,
  location_id text references locations (id),
  days smallint[],
  proof_kind text,
  links_member boolean not null default false,
  active boolean not null default true
);

create table task_completions (
  id uuid primary key default gen_random_uuid(),
  task_id text not null references task_definitions (id),
  staff_id uuid references staff_users (id),
  clock_staff_id text,
  location_id text references locations (id),
  period_key text not null,
  cadence text not null check (cadence in ('daily', 'weekly', 'cycle', 'monthly')),
  member_id uuid references members (id),
  class_session_id uuid references class_sessions (id),
  event_id uuid references events (id),
  status text not null default 'done' check (status in ('done', 'needs_review')),
  proof jsonb not null default '{}'::jsonb,
  firebase_path text,
  completed_at timestamptz,
  unique (task_id, clock_staff_id, period_key)
);

-- ---------------------------------------------------------------------------
-- Staff scheduler and hours
-- Live path today: ceo/timeclock/schedule/{staffId}/{date}/{shiftId}
-- Punches: ceo/timeclock/entries/{staffId}/{date}/{entryId}
-- Time off: ceo/timeclock/timeoff/{id}
-- Published board: ceo/timeclock/schedulePublished/{weekKey}
-- ---------------------------------------------------------------------------

create table staff_shifts (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid references staff_users (id),
  clock_staff_id text not null,
  location_id text not null references locations (id),
  shift_date date not null,
  start_local time not null,
  end_local time not null,
  role text,
  class_session_id uuid references class_sessions (id),
  firebase_shift_id text,
  unique (clock_staff_id, shift_date, firebase_shift_id)
);

create table staff_time_off (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid references staff_users (id),
  clock_staff_id text not null,
  start_on date not null,
  end_on date not null,
  kind text not null check (kind in ('pto', 'unpaid')),
  status text not null check (status in ('pending', 'approved', 'denied')),
  note text,
  firebase_id text unique,
  check (end_on >= start_on)
);

create table time_punches (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid references staff_users (id),
  clock_staff_id text not null,
  location_id text references locations (id),
  punch_date date not null,
  in_at timestamptz,
  out_at timestamptz,
  source text not null default 'kiosk' check (source in ('kiosk', 'manager', 'import')),
  firebase_entry_id text,
  unique (clock_staff_id, punch_date, firebase_entry_id)
);

create table schedule_publications (
  week_key text primary key,
  published_at timestamptz not null,
  label text
);

create table import_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  status text not null check (status in ('ok', 'error')),
  summary jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

alter table promo_codes enable row level security;
alter table promo_code_scopes enable row level security;
alter table promo_redemptions enable row level security;
alter table rank_requirements enable row level security;
alter table testing_signoffs enable row level security;
alter table curriculum_videos enable row level security;
alter table task_definitions enable row level security;
alter table task_completions enable row level security;
alter table staff_shifts enable row level security;
alter table staff_time_off enable row level security;
alter table time_punches enable row level security;
alter table schedule_publications enable row level security;
alter table import_runs enable row level security;
