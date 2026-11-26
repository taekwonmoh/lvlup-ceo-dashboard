-- Journey automations and two-way family messaging.
-- Dry-run only. Do not apply this file to a live Supabase project.
-- Local tests apply crm/migrations/007_automations_messaging.sql.

create table if not exists location_automation_settings (
  location_id text primary key references locations (id),
  review_url text not null default '',
  programs jsonb not null default '{}'::jsonb,
  toggles jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  check (char_length(review_url) <= 300),
  check (review_url !~* 'tel:'),
  check (review_url !~* 'sms:')
);

insert into location_automation_settings (location_id, review_url, programs, toggles) values
  ('waunakee', 'https://reviews.example.test/waunakee',
    '{"mini_tigers":true,"tigers":true,"kids_teens":true,"teens":true,"adult_tkd":true,"taekwondo":true,"fitboxing":true,"general":true,"birthday":false,"goninja":false}'::jsonb,
    '{"watchlist":true,"onb90":true,"birthday_waiver":false}'::jsonb),
  ('eastmad', 'https://reviews.example.test/eastmad',
    '{"mini_tigers":true,"tigers":true,"kids_teens":true,"teens":true,"adult_tkd":true,"taekwondo":true,"fitboxing":false,"general":true,"birthday":false,"goninja":false}'::jsonb,
    '{"watchlist":true,"onb90":true,"birthday_waiver":false}'::jsonb),
  ('verona', 'https://reviews.example.test/verona',
    '{"mini_tigers":true,"tigers":true,"kids_teens":true,"teens":true,"adult_tkd":true,"taekwondo":true,"fitboxing":false,"general":true,"birthday":false,"goninja":false}'::jsonb,
    '{"watchlist":true,"onb90":true,"birthday_waiver":false}'::jsonb),
  ('deforest', 'https://reviews.example.test/deforest',
    '{"mini_tigers":true,"tigers":true,"kids_teens":true,"teens":true,"adult_tkd":true,"taekwondo":true,"fitboxing":false,"general":true,"birthday":false,"goninja":false}'::jsonb,
    '{"watchlist":true,"onb90":true,"birthday_waiver":false}'::jsonb),
  ('goninjaW', 'https://reviews.example.test/goninjaW',
    '{"mini_tigers":false,"tigers":false,"kids_teens":false,"teens":false,"adult_tkd":false,"taekwondo":false,"fitboxing":false,"general":false,"birthday":true,"goninja":true}'::jsonb,
    '{"watchlist":true,"onb90":false,"birthday_waiver":true}'::jsonb),
  ('goninjaV', 'https://reviews.example.test/goninjaV',
    '{"mini_tigers":false,"tigers":false,"kids_teens":false,"teens":false,"adult_tkd":false,"taekwondo":false,"fitboxing":false,"general":false,"birthday":true,"goninja":true}'::jsonb,
    '{"watchlist":true,"onb90":false,"birthday_waiver":true}'::jsonb)
on conflict (location_id) do nothing;

create table if not exists automation_workflows (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  category text not null check (category in (
    'BOOK', 'LEAD', 'NOSHOW', 'ONB', 'ONB90', 'OPS', 'PROG', 'RET', 'SRC', 'TRIAL', 'WATCHLIST', 'GONINJA'
  )),
  brand text not null check (brand in ('lvlup', 'goninja', 'shared')),
  name text not null,
  trigger_type text not null check (trigger_type in (
    'membership_start', 'new_booking', 'manual', 'new_lead',
    'booking_no_show', 'promotion', 'absence', 'member_frozen'
  )),
  trigger_rules jsonb not null default '{}'::jsonb,
  exit_conditions jsonb not null default '[]'::jsonb,
  enabled boolean not null default false,
  dry_run boolean not null default true,
  staff_note text not null default '',
  created_at timestamptz not null default now(),
  check (enabled = false and dry_run = true),
  check (code ~ '^[a-z0-9_]+$'),
  check (trigger_rules::text !~ 'session_id'),
  check (trigger_rules::text !~ 'sessionId')
);

create table if not exists automation_steps (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references automation_workflows (id) on delete cascade,
  step_key text not null,
  step_type text not null check (step_type in (
    'delay', 'email', 'sms', 'push', 'split', 'start_automation', 'task',
    'add_tag', 'remove_tag', 'absence_wait', 'webhook', 'add_document'
  )),
  sort_order integer not null,
  config jsonb not null default '{}'::jsonb,
  next_step_key text,
  branch_yes_key text,
  branch_no_key text,
  unique (workflow_id, step_key),
  check (config::text !~* '\{phone\}'),
  check (config::text !~* 'tel:'),
  check (config::text !~* 'sms:'),
  check (config::text !~ 'session_id'),
  check (config::text !~ 'sessionId')
);

create table if not exists automation_enrollments (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references automation_workflows (id),
  location_id text not null references locations (id),
  family_id uuid references families (id),
  member_id uuid references members (id),
  lead_id uuid references leads (id),
  status text not null default 'active' check (status in ('active', 'exited', 'completed')),
  exit_reason text,
  context jsonb not null default '{}'::jsonb,
  entered_at timestamptz not null default now(),
  exited_at timestamptz
);

create index if not exists automation_enrollments_family_idx
  on automation_enrollments (family_id, entered_at);

create table if not exists automation_step_runs (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references automation_enrollments (id) on delete cascade,
  step_id uuid not null references automation_steps (id),
  status text not null default 'dry_run' check (status in ('dry_run')),
  rendered jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (rendered::text !~* '\{phone\}'),
  check (rendered::text !~* 'tel:'),
  check (rendered::text !~* 'sms:')
);

create index if not exists automation_step_runs_enrollment_idx
  on automation_step_runs (enrollment_id, created_at);

create table if not exists automation_document_grants (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references automation_enrollments (id) on delete cascade,
  location_id text not null references locations (id),
  document_code text not null,
  title text not null,
  audience text not null check (audience in ('host', 'guest', 'member')),
  dry_run boolean not null default true,
  created_at timestamptz not null default now(),
  check (dry_run = true),
  check (document_code ~ '^[a-z0-9_]+$')
);

create table if not exists message_threads (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families (id),
  member_id uuid references members (id),
  location_id text not null references locations (id),
  subject text not null,
  category text not null default 'general',
  status text not null default 'open' check (status in ('open', 'archived')),
  last_message_at timestamptz,
  staff_unread_count integer not null default 0 check (staff_unread_count >= 0),
  family_unread_count integer not null default 0 check (family_unread_count >= 0),
  created_at timestamptz not null default now()
);

create index if not exists message_threads_family_idx
  on message_threads (family_id, last_message_at desc);

create index if not exists message_threads_location_idx
  on message_threads (location_id, last_message_at desc);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references message_threads (id) on delete cascade,
  sender_type text not null check (sender_type in ('family', 'staff', 'system')),
  sender_id uuid,
  body text not null,
  created_at timestamptz not null default now(),
  check (char_length(body) between 1 and 4000),
  check (body !~* 'tel:'),
  check (body !~* 'sms:')
);

create index if not exists messages_thread_idx on messages (thread_id, created_at);

create table if not exists message_read_receipts (
  thread_id uuid not null references message_threads (id) on delete cascade,
  reader_type text not null check (reader_type in ('family', 'staff')),
  reader_id text not null,
  last_read_message_id uuid references messages (id),
  read_at timestamptz not null default now(),
  primary key (thread_id, reader_type, reader_id)
);

create table if not exists push_notification_outbox (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid references message_threads (id) on delete cascade,
  message_id uuid references messages (id) on delete cascade,
  audience text not null check (audience in ('family', 'staff')),
  location_id text not null references locations (id),
  family_id uuid references families (id),
  payload jsonb not null,
  delivered boolean not null default false,
  dry_run boolean not null default true,
  created_at timestamptz not null default now(),
  check (delivered = false),
  check (dry_run = true)
);

create index if not exists push_outbox_location_idx
  on push_notification_outbox (location_id, created_at desc);

alter table device_tokens add column if not exists staff_id uuid references staff_users (id);
alter table device_tokens drop constraint if exists device_tokens_owner_chk;
alter table device_tokens add constraint device_tokens_owner_chk
  check (num_nonnulls(guardian_id, member_id, staff_id) = 1);

alter table location_automation_settings enable row level security;
alter table automation_workflows enable row level security;
alter table automation_steps enable row level security;
alter table automation_enrollments enable row level security;
alter table automation_step_runs enable row level security;
alter table automation_document_grants enable row level security;
alter table message_threads enable row level security;
alter table messages enable row level security;
alter table message_read_receipts enable row level security;
alter table push_notification_outbox enable row level security;

drop policy if exists settings_select on location_automation_settings;
create policy settings_select on location_automation_settings
  for select to crm_app
  using (
    (select crm_private.actor_role()) = 'owner'
    or (
      (select crm_private.actor_role()) in ('school_lead', 'front_desk', 'coach', 'ops')
      and location_id = any (crm_private.actor_locations())
    )
  );

drop policy if exists settings_update on location_automation_settings;
create policy settings_update on location_automation_settings
  for update to crm_app
  using (
    (select crm_private.actor_role()) = 'owner'
    or (
      (select crm_private.actor_role()) = 'school_lead'
      and location_id = any (crm_private.actor_locations())
    )
  )
  with check (
    (select crm_private.actor_role()) = 'owner'
    or (
      (select crm_private.actor_role()) = 'school_lead'
      and location_id = any (crm_private.actor_locations())
    )
  );

drop policy if exists workflows_select on automation_workflows;
create policy workflows_select on automation_workflows
  for select to crm_app
  using ((select crm_private.actor_role()) in ('owner', 'school_lead', 'front_desk', 'coach', 'ops'));

drop policy if exists steps_select on automation_steps;
create policy steps_select on automation_steps
  for select to crm_app
  using ((select crm_private.actor_role()) in ('owner', 'school_lead', 'front_desk', 'coach', 'ops'));

drop policy if exists enrollments_select on automation_enrollments;
create policy enrollments_select on automation_enrollments
  for select to crm_app
  using (
    (select crm_private.actor_role()) = 'owner'
    or (
      (select crm_private.actor_role()) in ('school_lead', 'front_desk', 'coach', 'ops')
      and location_id = any (crm_private.actor_locations())
    )
    or (
      (select crm_private.actor_role()) = 'family'
      and family_id = any (crm_private.actor_families())
    )
  );

drop policy if exists step_runs_select on automation_step_runs;
create policy step_runs_select on automation_step_runs
  for select to crm_app
  using (
    exists (
      select 1 from automation_enrollments e
      where e.id = enrollment_id
        and (
          (select crm_private.actor_role()) = 'owner'
          or (
            (select crm_private.actor_role()) in ('school_lead', 'front_desk', 'coach', 'ops')
            and e.location_id = any (crm_private.actor_locations())
          )
          or (
            (select crm_private.actor_role()) = 'family'
            and e.family_id = any (crm_private.actor_families())
          )
        )
    )
  );

drop policy if exists threads_select on message_threads;
create policy threads_select on message_threads
  for select to crm_app
  using (
    (select crm_private.actor_role()) = 'owner'
    or (
      (select crm_private.actor_role()) in ('school_lead', 'front_desk', 'coach', 'ops')
      and location_id = any (crm_private.actor_locations())
    )
    or (
      (select crm_private.actor_role()) = 'family'
      and family_id = any (crm_private.actor_families())
    )
  );

drop policy if exists threads_insert on message_threads;
create policy threads_insert on message_threads
  for insert to crm_app
  with check (
    (select crm_private.actor_role()) = 'owner'
    or (
      (select crm_private.actor_role()) in ('school_lead', 'front_desk', 'coach', 'ops')
      and location_id = any (crm_private.actor_locations())
    )
    or (
      (select crm_private.actor_role()) = 'family'
      and family_id = any (crm_private.actor_families())
    )
  );

drop policy if exists threads_update on message_threads;
create policy threads_update on message_threads
  for update to crm_app
  using (
    (select crm_private.actor_role()) = 'owner'
    or (
      (select crm_private.actor_role()) in ('school_lead', 'front_desk', 'coach', 'ops')
      and location_id = any (crm_private.actor_locations())
    )
    or (
      (select crm_private.actor_role()) = 'family'
      and family_id = any (crm_private.actor_families())
    )
  )
  with check (
    (select crm_private.actor_role()) = 'owner'
    or (
      (select crm_private.actor_role()) in ('school_lead', 'front_desk', 'coach', 'ops')
      and location_id = any (crm_private.actor_locations())
    )
    or (
      (select crm_private.actor_role()) = 'family'
      and family_id = any (crm_private.actor_families())
    )
  );

drop policy if exists messages_select on messages;
create policy messages_select on messages
  for select to crm_app
  using (
    exists (
      select 1 from message_threads t
      where t.id = thread_id
        and (
          (select crm_private.actor_role()) = 'owner'
          or (
            (select crm_private.actor_role()) in ('school_lead', 'front_desk', 'coach', 'ops')
            and t.location_id = any (crm_private.actor_locations())
          )
          or (
            (select crm_private.actor_role()) = 'family'
            and t.family_id = any (crm_private.actor_families())
          )
        )
    )
  );

drop policy if exists messages_insert_family on messages;
create policy messages_insert_family on messages
  for insert to crm_app
  with check (
    sender_type = 'family'
    and exists (
      select 1 from message_threads t
      where t.id = thread_id
        and t.family_id = any (crm_private.actor_families())
        and (select crm_private.actor_role()) = 'family'
    )
  );

drop policy if exists messages_insert_staff on messages;
create policy messages_insert_staff on messages
  for insert to crm_app
  with check (
    sender_type = 'staff'
    and exists (
      select 1 from message_threads t
      where t.id = thread_id
        and (select crm_private.actor_role()) in ('school_lead', 'front_desk', 'coach', 'ops')
        and t.location_id = any (crm_private.actor_locations())
    )
  );

drop policy if exists messages_insert_owner on messages;
create policy messages_insert_owner on messages
  for insert to crm_app
  with check ((select crm_private.actor_role()) = 'owner');

drop policy if exists receipts_all on message_read_receipts;
create policy receipts_all on message_read_receipts
  for all to crm_app
  using (
    exists (
      select 1 from message_threads t
      where t.id = thread_id
        and (
          (select crm_private.actor_role()) = 'owner'
          or (
            (select crm_private.actor_role()) in ('school_lead', 'front_desk', 'coach', 'ops')
            and t.location_id = any (crm_private.actor_locations())
          )
          or (
            (select crm_private.actor_role()) = 'family'
            and t.family_id = any (crm_private.actor_families())
          )
        )
    )
  )
  with check (
    exists (
      select 1 from message_threads t
      where t.id = thread_id
        and (
          (select crm_private.actor_role()) = 'owner'
          or (
            (select crm_private.actor_role()) in ('school_lead', 'front_desk', 'coach', 'ops')
            and t.location_id = any (crm_private.actor_locations())
          )
          or (
            (select crm_private.actor_role()) = 'family'
            and t.family_id = any (crm_private.actor_families())
          )
        )
    )
  );

drop policy if exists outbox_select on push_notification_outbox;
create policy outbox_select on push_notification_outbox
  for select to crm_app
  using (
    (select crm_private.actor_role()) = 'owner'
    or (
      (select crm_private.actor_role()) in ('school_lead', 'front_desk', 'coach', 'ops')
      and location_id = any (crm_private.actor_locations())
    )
    or (
      (select crm_private.actor_role()) = 'family'
      and family_id = any (crm_private.actor_families())
      and audience = 'family'
    )
  );

do $$ begin
  execute 'grant select, update on location_automation_settings to crm_app';
  execute 'grant select on automation_workflows, automation_steps to crm_app';
  execute 'grant select on automation_enrollments, automation_step_runs, automation_document_grants to crm_app';
  execute 'grant select, insert, update on message_threads, messages, message_read_receipts to crm_app';
  execute 'grant select on push_notification_outbox to crm_app';
exception when undefined_object then null;
end $$;
