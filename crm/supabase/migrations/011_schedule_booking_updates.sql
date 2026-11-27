-- Wave 2 migration 011.
-- This filename sorts before 20261126000001_core.sql, so the statements run
-- only when public.locations already exists. The ordered copy is
-- 20261127000011_schedule_booking_updates.sql.
do $wave2$
begin
  if to_regclass('public.locations') is null then
    raise notice 'wave2 011 waits for the core schema';
    return;
  end if;
  execute $ddl$
-- Wave 2 area D: schedule and booking.
-- Do not apply this file to Supabase project xxyndswrierztzdbjvrd
-- or belfzlyvgjheudxhviyt, or to any other live database.
-- Local tests apply crm/migrations/011_schedule_booking_updates.sql.
-- No card data. No phone numbers. No live charges. No message delivery.

-- ---------------------------------------------------------------------------
-- A session or template can belong to more than one program.
-- The single program column stays and is copied into the link tables.
-- Capacity remains on the session, not on each program.
-- ---------------------------------------------------------------------------

create table if not exists class_session_programs (
  session_id uuid not null references class_sessions (id) on delete cascade,
  program_code text not null references programs (code),
  primary key (session_id, program_code)
);

create table if not exists class_template_programs (
  template_id uuid not null references class_templates (id) on delete cascade,
  program_code text not null references programs (code),
  primary key (template_id, program_code)
);

insert into class_session_programs (session_id, program_code)
select s.id, s.program
from class_sessions s
join programs p on p.code = s.program
on conflict do nothing;

insert into class_template_programs (template_id, program_code)
select t.id, t.program::text
from class_templates t
join programs p on p.code = t.program::text
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Per-session booking options. Pricing and who may book. Not a charge.
-- ---------------------------------------------------------------------------

create table if not exists session_booking_options (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references class_sessions (id) on delete cascade,
  template_id uuid references class_templates (id) on delete cascade,
  kind text not null check (kind in ('member', 'trial', 'drop_in', 'paid')),
  price_cents integer,
  plan_ids uuid[] not null default '{}',
  capacity integer,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (session_id is not null or template_id is not null),
  check (price_cents is null or price_cents >= 0),
  check (capacity is null or capacity > 0)
);

create index if not exists session_booking_options_session_idx
  on session_booking_options (session_id) where session_id is not null;
create index if not exists session_booking_options_template_idx
  on session_booking_options (template_id) where template_id is not null;

-- ---------------------------------------------------------------------------
-- No-show release. NULL grace means the school has the job turned off.
-- ---------------------------------------------------------------------------

alter table bookings drop constraint if exists bookings_status_chk;
alter table bookings add constraint bookings_status_chk
  check (status in ('booked', 'waitlist', 'cancelled', 'no_show', 'released'));

alter table locations add column if not exists no_show_grace_min integer;
alter table locations drop constraint if exists locations_no_show_grace_chk;
alter table locations add constraint locations_no_show_grace_chk
  check (no_show_grace_min is null or no_show_grace_min >= 0);

comment on column locations.no_show_grace_min is
  'Minutes after starts_at before a booking with no attendance is released. NULL leaves the job off for that school.';

-- ---------------------------------------------------------------------------
-- Open-mat attendance has no session. The check-in view keeps a null session.
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

alter table attendance drop constraint if exists attendance_source_check;
alter table attendance add constraint attendance_source_check
  check (source in ('staff', 'kiosk', 'import', 'geofence_auto', 'qr_scan', 'manual', 'open_mat'));

alter table attendance add column if not exists program_code text;
do $$ begin
  alter table attendance
    add constraint attendance_program_code_fk
    foreign key (program_code) references programs (code);
exception when duplicate_object then null;
end $$;

create or replace view check_ins with (security_invoker = true) as
  select
    id,
    member_id,
    location_id,
    session_id,
    attended_on as checked_in_on,
    status,
    source,
    program_code
  from attendance;

comment on view check_ins is
  'Check-ins include open-mat rows whose session_id is null.';

-- ---------------------------------------------------------------------------
-- Kiosk pre-select. The family check-in uses the newest unexpired row.
-- ---------------------------------------------------------------------------

create table if not exists kiosk_sessions (
  id uuid primary key default gen_random_uuid(),
  location_id text not null references locations (id),
  session_id uuid not null references class_sessions (id),
  device_label text,
  selected_by uuid references staff_users (id),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (device_label is null or (char_length(device_label) <= 80 and device_label !~* 'tel:' and device_label !~* 'sms:'))
);

create index if not exists kiosk_sessions_location_idx
  on kiosk_sessions (location_id, expires_at desc);

-- ---------------------------------------------------------------------------
-- Dry-run domain events. booking_no_show is recorded here and never sent.
-- ---------------------------------------------------------------------------

create table if not exists dry_run_events (
  id uuid primary key default gen_random_uuid(),
  name text not null check (name ~ '^[a-z0-9_]+$'),
  location_id text references locations (id),
  entity_type text not null,
  entity_id uuid,
  payload jsonb not null default '{}'::jsonb,
  dry_run boolean not null default true,
  created_at timestamptz not null default now(),
  check (dry_run = true),
  check (payload::text !~* 'tel:' and payload::text !~* 'sms:')
);

create index if not exists dry_run_events_name_idx
  on dry_run_events (name, created_at desc);

-- ---------------------------------------------------------------------------
-- Per-staff schedule defaults. Display only.
-- ---------------------------------------------------------------------------

alter table staff_users add column if not exists ui_prefs jsonb not null default '{}'::jsonb;
alter table staff_users drop constraint if exists staff_users_ui_prefs_chk;
alter table staff_users add constraint staff_users_ui_prefs_chk
  check (jsonb_typeof(ui_prefs) = 'object');

-- ---------------------------------------------------------------------------
-- RLS. crm_app only. No anon policy.
-- ---------------------------------------------------------------------------

alter table class_session_programs enable row level security;
alter table class_template_programs enable row level security;
alter table session_booking_options enable row level security;
alter table kiosk_sessions enable row level security;
alter table dry_run_events enable row level security;

drop policy if exists class_session_programs_select on class_session_programs;
create policy class_session_programs_select on class_session_programs
  for select to crm_app
  using (
    exists (
      select 1 from class_sessions s
      where s.id = class_session_programs.session_id
        and crm_private.staff_at(s.location_id)
    )
  );

drop policy if exists class_session_programs_write on class_session_programs;
create policy class_session_programs_write on class_session_programs
  for all to crm_app
  using (
    exists (
      select 1 from class_sessions s
      where s.id = class_session_programs.session_id
        and (
          (select crm_private.actor_role()) = 'owner'
          or (
            (select crm_private.actor_role()) in ('school_lead', 'front_desk', 'ops')
            and s.location_id = any (crm_private.actor_locations())
          )
        )
    )
  )
  with check (
    exists (
      select 1 from class_sessions s
      where s.id = class_session_programs.session_id
        and (
          (select crm_private.actor_role()) = 'owner'
          or (
            (select crm_private.actor_role()) in ('school_lead', 'front_desk', 'ops')
            and s.location_id = any (crm_private.actor_locations())
          )
        )
    )
  );

drop policy if exists class_template_programs_select on class_template_programs;
create policy class_template_programs_select on class_template_programs
  for select to crm_app
  using (
    exists (
      select 1 from class_templates t
      where t.id = class_template_programs.template_id
        and crm_private.staff_at(t.location_id)
    )
  );

drop policy if exists class_template_programs_write on class_template_programs;
create policy class_template_programs_write on class_template_programs
  for all to crm_app
  using (
    exists (
      select 1 from class_templates t
      where t.id = class_template_programs.template_id
        and (
          (select crm_private.actor_role()) = 'owner'
          or (
            (select crm_private.actor_role()) in ('school_lead', 'ops')
            and t.location_id = any (crm_private.actor_locations())
          )
        )
    )
  )
  with check (
    exists (
      select 1 from class_templates t
      where t.id = class_template_programs.template_id
        and (
          (select crm_private.actor_role()) = 'owner'
          or (
            (select crm_private.actor_role()) in ('school_lead', 'ops')
            and t.location_id = any (crm_private.actor_locations())
          )
        )
    )
  );

drop policy if exists session_booking_options_select on session_booking_options;
create policy session_booking_options_select on session_booking_options
  for select to crm_app
  using (
    (
      session_id is not null
      and exists (
        select 1 from class_sessions s
        where s.id = session_booking_options.session_id
          and crm_private.staff_at(s.location_id)
      )
    )
    or (
      template_id is not null
      and exists (
        select 1 from class_templates t
        where t.id = session_booking_options.template_id
          and crm_private.staff_at(t.location_id)
      )
    )
  );

drop policy if exists session_booking_options_write on session_booking_options;
create policy session_booking_options_write on session_booking_options
  for all to crm_app
  using (
    (select crm_private.actor_role()) = 'owner'
    or (
      (select crm_private.actor_role()) in ('school_lead', 'front_desk', 'ops')
      and (
        exists (
          select 1 from class_sessions s
          where s.id = session_booking_options.session_id
            and s.location_id = any (crm_private.actor_locations())
        )
        or exists (
          select 1 from class_templates t
          where t.id = session_booking_options.template_id
            and t.location_id = any (crm_private.actor_locations())
        )
      )
    )
  )
  with check (
    (select crm_private.actor_role()) = 'owner'
    or (
      (select crm_private.actor_role()) in ('school_lead', 'front_desk', 'ops')
      and (
        exists (
          select 1 from class_sessions s
          where s.id = session_booking_options.session_id
            and s.location_id = any (crm_private.actor_locations())
        )
        or exists (
          select 1 from class_templates t
          where t.id = session_booking_options.template_id
            and t.location_id = any (crm_private.actor_locations())
        )
      )
    )
  );

drop policy if exists kiosk_sessions_select on kiosk_sessions;
create policy kiosk_sessions_select on kiosk_sessions
  for select to crm_app
  using (crm_private.staff_at(location_id));

drop policy if exists kiosk_sessions_write on kiosk_sessions;
create policy kiosk_sessions_write on kiosk_sessions
  for all to crm_app
  using (
    (select crm_private.actor_role()) = 'owner'
    or (
      (select crm_private.actor_role()) in ('school_lead', 'front_desk', 'ops')
      and location_id = any (crm_private.actor_locations())
    )
  )
  with check (
    (select crm_private.actor_role()) = 'owner'
    or (
      (select crm_private.actor_role()) in ('school_lead', 'front_desk', 'ops')
      and location_id = any (crm_private.actor_locations())
    )
  );

drop policy if exists dry_run_events_select on dry_run_events;
create policy dry_run_events_select on dry_run_events
  for select to crm_app
  using (
    (select crm_private.actor_role()) = 'owner'
    or (
      (select crm_private.actor_role()) in ('school_lead', 'front_desk', 'coach', 'ops')
      and (location_id is null or location_id = any (crm_private.actor_locations()))
    )
  );

drop policy if exists dry_run_events_insert on dry_run_events;
create policy dry_run_events_insert on dry_run_events
  for insert to crm_app
  with check (
    dry_run = true
    and (
      (select crm_private.actor_role()) = 'owner'
      or (
        (select crm_private.actor_role()) in ('school_lead', 'front_desk', 'ops')
        and location_id = any (crm_private.actor_locations())
      )
    )
  );

do $$ begin
  execute 'grant select, insert, update, delete on class_session_programs, class_template_programs, session_booking_options, kiosk_sessions, dry_run_events to crm_app';
exception when undefined_object then null;
end $$;

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on class_session_programs, class_template_programs, session_booking_options, kiosk_sessions, dry_run_events from anon, authenticated';
  end if;
end $$;

  $ddl$;
end
$wave2$;
