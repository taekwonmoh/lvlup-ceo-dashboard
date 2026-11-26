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

-- Canonical workflows generated from crm/src/automation-catalog.ts
insert into automation_workflows (code, category, brand, name, trigger_type, trigger_rules, exit_conditions) values (
  'book_mini_tigers', 'BOOK', 'lvlup', 'Mini Tigers booking', 'new_booking',
  $crm${"program_slug":"mini_tigers","class_kind":"regular"}$crm$::jsonb,
  $crm$[]$crm$::jsonb
);
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's1', 'delay', 10, $crm${"days":0}$crm$::jsonb, 's2', null, null
from automation_workflows where code = 'book_mini_tigers';
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's2', 'email', 20, $crm${"subject":"Mini Tigers class booked","body":"Hi {first_name}, your Mini Tigers class at {location_name} is booked."}$crm$::jsonb, 's3', null, null
from automation_workflows where code = 'book_mini_tigers';
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's3', 'push', 30, $crm${"title":"Mini Tigers reminder","body":"See you at {location_name}, {first_name}."}$crm$::jsonb, null, null, null
from automation_workflows where code = 'book_mini_tigers';
insert into automation_workflows (code, category, brand, name, trigger_type, trigger_rules, exit_conditions) values (
  'book_tigers', 'BOOK', 'lvlup', 'Tigers booking', 'new_booking',
  $crm${"program_slug":"tigers","class_kind":"regular"}$crm$::jsonb,
  $crm$[]$crm$::jsonb
);
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's1', 'delay', 10, $crm${"days":0}$crm$::jsonb, 's2', null, null
from automation_workflows where code = 'book_tigers';
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's2', 'email', 20, $crm${"subject":"Tigers class booked","body":"Hi {first_name}, your Tigers class at {location_name} is booked."}$crm$::jsonb, 's3', null, null
from automation_workflows where code = 'book_tigers';
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's3', 'push', 30, $crm${"title":"Tigers reminder","body":"See you at {location_name}, {first_name}."}$crm$::jsonb, null, null, null
from automation_workflows where code = 'book_tigers';
insert into automation_workflows (code, category, brand, name, trigger_type, trigger_rules, exit_conditions) values (
  'book_kids_teens', 'BOOK', 'lvlup', 'Kids and Teens booking', 'new_booking',
  $crm${"program_slug":"kids_teens","class_kind":"regular"}$crm$::jsonb,
  $crm$[]$crm$::jsonb
);
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's1', 'delay', 10, $crm${"days":0}$crm$::jsonb, 's2', null, null
from automation_workflows where code = 'book_kids_teens';
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's2', 'email', 20, $crm${"subject":"Kids and Teens class booked","body":"Hi {first_name}, your Kids and Teens class at {location_name} is booked."}$crm$::jsonb, 's3', null, null
from automation_workflows where code = 'book_kids_teens';
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's3', 'push', 30, $crm${"title":"Kids and Teens reminder","body":"See you at {location_name}, {first_name}."}$crm$::jsonb, null, null, null
from automation_workflows where code = 'book_kids_teens';
insert into automation_workflows (code, category, brand, name, trigger_type, trigger_rules, exit_conditions) values (
  'book_adult_tkd', 'BOOK', 'lvlup', 'Adult Taekwondo booking', 'new_booking',
  $crm${"program_slug":"adult_tkd","class_kind":"regular"}$crm$::jsonb,
  $crm$[]$crm$::jsonb
);
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's1', 'delay', 10, $crm${"days":0}$crm$::jsonb, 's2', null, null
from automation_workflows where code = 'book_adult_tkd';
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's2', 'email', 20, $crm${"subject":"Adult Taekwondo class booked","body":"Hi {first_name}, your Adult Taekwondo class at {location_name} is booked."}$crm$::jsonb, 's3', null, null
from automation_workflows where code = 'book_adult_tkd';
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's3', 'push', 30, $crm${"title":"Adult Taekwondo reminder","body":"See you at {location_name}, {first_name}."}$crm$::jsonb, null, null, null
from automation_workflows where code = 'book_adult_tkd';
insert into automation_workflows (code, category, brand, name, trigger_type, trigger_rules, exit_conditions) values (
  'book_fitboxing', 'BOOK', 'lvlup', 'Fitboxing booking', 'new_booking',
  $crm${"program_slug":"fitboxing","class_kind":"regular"}$crm$::jsonb,
  $crm$[]$crm$::jsonb
);
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's1', 'delay', 10, $crm${"days":0}$crm$::jsonb, 's2', null, null
from automation_workflows where code = 'book_fitboxing';
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's2', 'email', 20, $crm${"subject":"Fitboxing class booked","body":"Hi {first_name}, your Fitboxing class at {location_name} is booked."}$crm$::jsonb, 's3', null, null
from automation_workflows where code = 'book_fitboxing';
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's3', 'push', 30, $crm${"title":"Fitboxing reminder","body":"See you at {location_name}, {first_name}."}$crm$::jsonb, null, null, null
from automation_workflows where code = 'book_fitboxing';
insert into automation_workflows (code, category, brand, name, trigger_type, trigger_rules, exit_conditions) values (
  'book_attended', 'BOOK', 'lvlup', 'Attended class follow-up', 'manual',
  $crm${"reason":"class_attended"}$crm$::jsonb,
  $crm$[]$crm$::jsonb
);
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's1', 'email', 10, $crm${"subject":"Nice work in class","body":"Hi {first_name}, glad you trained at {location_name}."}$crm$::jsonb, 's2', null, null
from automation_workflows where code = 'book_attended';
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's2', 'task', 20, $crm${"title":"Note the attended class","body":"Add a short class note for {first_name} at {location_name}."}$crm$::jsonb, null, null, null
from automation_workflows where code = 'book_attended';
insert into automation_workflows (code, category, brand, name, trigger_type, trigger_rules, exit_conditions) values (
  'lead_mini_tigers', 'LEAD', 'lvlup', 'Mini Tigers lead', 'new_lead',
  $crm${"program_slug":"mini_tigers"}$crm$::jsonb,
  $crm$["membership_started","class_booked"]$crm$::jsonb
);
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's1', 'email', 10, $crm${"subject":"Thanks for your interest","body":"Hi {parent_first_name}, thanks for asking about Mini Tigers at {location_name}."}$crm$::jsonb, 's2', null, null
from automation_workflows where code = 'lead_mini_tigers';
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's2', 'delay', 20, $crm${"days":2}$crm$::jsonb, 's3', null, null
from automation_workflows where code = 'lead_mini_tigers';
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's3', 'task', 30, $crm${"title":"Follow up on Mini Tigers lead","body":"Email {guardian_name} about {location_name}."}$crm$::jsonb, null, null, null
from automation_workflows where code = 'lead_mini_tigers';
insert into automation_workflows (code, category, brand, name, trigger_type, trigger_rules, exit_conditions) values (
  'lead_tigers', 'LEAD', 'lvlup', 'Tigers lead', 'new_lead',
  $crm${"program_slug":"tigers"}$crm$::jsonb,
  $crm$["membership_started","class_booked"]$crm$::jsonb
);
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's1', 'email', 10, $crm${"subject":"Thanks for your interest","body":"Hi {parent_first_name}, thanks for asking about Tigers at {location_name}."}$crm$::jsonb, 's2', null, null
from automation_workflows where code = 'lead_tigers';
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's2', 'delay', 20, $crm${"days":2}$crm$::jsonb, 's3', null, null
from automation_workflows where code = 'lead_tigers';
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's3', 'task', 30, $crm${"title":"Follow up on Tigers lead","body":"Email {guardian_name} about {location_name}."}$crm$::jsonb, null, null, null
from automation_workflows where code = 'lead_tigers';
insert into automation_workflows (code, category, brand, name, trigger_type, trigger_rules, exit_conditions) values (
  'lead_kids_teens', 'LEAD', 'lvlup', 'Kids and Teens lead', 'new_lead',
  $crm${"program_slug":"kids_teens"}$crm$::jsonb,
  $crm$["membership_started","class_booked"]$crm$::jsonb
);
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's1', 'email', 10, $crm${"subject":"Thanks for your interest","body":"Hi {parent_first_name}, thanks for asking about Kids and Teens at {location_name}."}$crm$::jsonb, 's2', null, null
from automation_workflows where code = 'lead_kids_teens';
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's2', 'delay', 20, $crm${"days":2}$crm$::jsonb, 's3', null, null
from automation_workflows where code = 'lead_kids_teens';
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's3', 'task', 30, $crm${"title":"Follow up on Kids and Teens lead","body":"Email {guardian_name} about {location_name}."}$crm$::jsonb, null, null, null
from automation_workflows where code = 'lead_kids_teens';
insert into automation_workflows (code, category, brand, name, trigger_type, trigger_rules, exit_conditions) values (
  'lead_adult_tkd', 'LEAD', 'lvlup', 'Adult Taekwondo lead', 'new_lead',
  $crm${"program_slug":"adult_tkd"}$crm$::jsonb,
  $crm$["membership_started","class_booked"]$crm$::jsonb
);
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's1', 'email', 10, $crm${"subject":"Thanks for your interest","body":"Hi {parent_first_name}, thanks for asking about Adult Taekwondo at {location_name}."}$crm$::jsonb, 's2', null, null
from automation_workflows where code = 'lead_adult_tkd';
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's2', 'delay', 20, $crm${"days":2}$crm$::jsonb, 's3', null, null
from automation_workflows where code = 'lead_adult_tkd';
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's3', 'task', 30, $crm${"title":"Follow up on Adult Taekwondo lead","body":"Email {guardian_name} about {location_name}."}$crm$::jsonb, null, null, null
from automation_workflows where code = 'lead_adult_tkd';
insert into automation_workflows (code, category, brand, name, trigger_type, trigger_rules, exit_conditions) values (
  'lead_fitboxing', 'LEAD', 'lvlup', 'Fitboxing lead', 'new_lead',
  $crm${"program_slug":"fitboxing"}$crm$::jsonb,
  $crm$["membership_started","class_booked"]$crm$::jsonb
);
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's1', 'email', 10, $crm${"subject":"Thanks for your interest","body":"Hi {parent_first_name}, thanks for asking about Fitboxing at {location_name}."}$crm$::jsonb, 's2', null, null
from automation_workflows where code = 'lead_fitboxing';
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's2', 'delay', 20, $crm${"days":2}$crm$::jsonb, 's3', null, null
from automation_workflows where code = 'lead_fitboxing';
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's3', 'task', 30, $crm${"title":"Follow up on Fitboxing lead","body":"Email {guardian_name} about {location_name}."}$crm$::jsonb, null, null, null
from automation_workflows where code = 'lead_fitboxing';
insert into automation_workflows (code, category, brand, name, trigger_type, trigger_rules, exit_conditions) values (
  'lead_teens', 'LEAD', 'lvlup', 'Teens lead', 'new_lead',
  $crm${"program_slug":"teens"}$crm$::jsonb,
  $crm$["membership_started","class_booked"]$crm$::jsonb
);
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's1', 'email', 10, $crm${"subject":"Teens classes at {location_name}","body":"Hi {parent_first_name}, teens classes are open at {location_name}."}$crm$::jsonb, 's2', null, null
from automation_workflows where code = 'lead_teens';
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's2', 'task', 20, $crm${"title":"Follow up on teens lead","body":"Email {guardian_name} about a teens class at {location_name}."}$crm$::jsonb, null, null, null
from automation_workflows where code = 'lead_teens';
insert into automation_workflows (code, category, brand, name, trigger_type, trigger_rules, exit_conditions) values (
  'lead_general', 'LEAD', 'lvlup', 'General lead', 'new_lead',
  $crm${"program_slug":"general"}$crm$::jsonb,
  $crm$["membership_started","class_booked"]$crm$::jsonb
);
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's1', 'email', 10, $crm${"subject":"Welcome to {location_name}","body":"Hi {guardian_name}, we got your note for {location_name}."}$crm$::jsonb, 's2', null, null
from automation_workflows where code = 'lead_general';
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's2', 'task', 20, $crm${"title":"Reply to general lead","body":"Reply to {email} about {location_name}."}$crm$::jsonb, null, null, null
from automation_workflows where code = 'lead_general';
insert into automation_workflows (code, category, brand, name, trigger_type, trigger_rules, exit_conditions) values (
  'lead_booking_form', 'LEAD', 'shared', 'Booking form lead', 'new_lead',
  $crm${"source":"booking_form"}$crm$::jsonb,
  $crm$["class_booked","membership_started"]$crm$::jsonb
);
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's1', 'add_tag', 10, $crm${"tag":"booking_form"}$crm$::jsonb, 's2', null, null
from automation_workflows where code = 'lead_booking_form';
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's2', 'email', 20, $crm${"subject":"We got your booking request","body":"Hi {parent_first_name}, {location_name} received the booking form."}$crm$::jsonb, null, null, null
from automation_workflows where code = 'lead_booking_form';
insert into automation_workflows (code, category, brand, name, trigger_type, trigger_rules, exit_conditions) values (
  'lead_party_guest', 'LEAD', 'shared', 'Party guest lead', 'new_lead',
  $crm${"source":"party_guest"}$crm$::jsonb,
  $crm$["class_booked"]$crm$::jsonb
);
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's1', 'add_tag', 10, $crm${"tag":"party_guest"}$crm$::jsonb, 's2', null, null
from automation_workflows where code = 'lead_party_guest';
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's2', 'email', 20, $crm${"subject":"Thanks for celebrating with us","body":"Hi {guardian_name}, the party guest note for {location_name} is saved."}$crm$::jsonb, null, null, null
from automation_workflows where code = 'lead_party_guest';
insert into automation_workflows (code, category, brand, name, trigger_type, trigger_rules, exit_conditions) values (
  'noshow_mini_tigers', 'NOSHOW', 'lvlup', 'Mini Tigers no-show', 'booking_no_show',
  $crm${"program_slug":"mini_tigers"}$crm$::jsonb,
  $crm$["class_booked"]$crm$::jsonb
);
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's1', 'email', 10, $crm${"subject":"We missed {first_name}","body":"{first_name} was marked absent from Mini Tigers at {location_name}."}$crm$::jsonb, 's2', null, null
from automation_workflows where code = 'noshow_mini_tigers';
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's2', 'delay', 20, $crm${"days":2}$crm$::jsonb, 's3', null, null
from automation_workflows where code = 'noshow_mini_tigers';
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's3', 'push', 30, $crm${"title":"Book the next class","body":"Pick another Mini Tigers class at {location_name}."}$crm$::jsonb, null, null, null
from automation_workflows where code = 'noshow_mini_tigers';
insert into automation_workflows (code, category, brand, name, trigger_type, trigger_rules, exit_conditions) values (
  'noshow_tigers', 'NOSHOW', 'lvlup', 'Tigers no-show', 'booking_no_show',
  $crm${"program_slug":"tigers"}$crm$::jsonb,
  $crm$["class_booked"]$crm$::jsonb
);
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's1', 'email', 10, $crm${"subject":"We missed {first_name}","body":"{first_name} was marked absent from Tigers at {location_name}."}$crm$::jsonb, 's2', null, null
from automation_workflows where code = 'noshow_tigers';
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's2', 'delay', 20, $crm${"days":2}$crm$::jsonb, 's3', null, null
from automation_workflows where code = 'noshow_tigers';
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's3', 'push', 30, $crm${"title":"Book the next class","body":"Pick another Tigers class at {location_name}."}$crm$::jsonb, null, null, null
from automation_workflows where code = 'noshow_tigers';
insert into automation_workflows (code, category, brand, name, trigger_type, trigger_rules, exit_conditions) values (
  'noshow_kids_teens', 'NOSHOW', 'lvlup', 'Kids and Teens no-show', 'booking_no_show',
  $crm${"program_slug":"kids_teens"}$crm$::jsonb,
  $crm$["class_booked"]$crm$::jsonb
);
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's1', 'email', 10, $crm${"subject":"We missed {first_name}","body":"{first_name} was marked absent from Kids and Teens at {location_name}."}$crm$::jsonb, 's2', null, null
from automation_workflows where code = 'noshow_kids_teens';
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's2', 'delay', 20, $crm${"days":2}$crm$::jsonb, 's3', null, null
from automation_workflows where code = 'noshow_kids_teens';
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's3', 'push', 30, $crm${"title":"Book the next class","body":"Pick another Kids and Teens class at {location_name}."}$crm$::jsonb, null, null, null
from automation_workflows where code = 'noshow_kids_teens';
insert into automation_workflows (code, category, brand, name, trigger_type, trigger_rules, exit_conditions) values (
  'noshow_adult_tkd', 'NOSHOW', 'lvlup', 'Adult Taekwondo no-show', 'booking_no_show',
  $crm${"program_slug":"adult_tkd"}$crm$::jsonb,
  $crm$["class_booked"]$crm$::jsonb
);
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's1', 'email', 10, $crm${"subject":"We missed {first_name}","body":"{first_name} was marked absent from Adult Taekwondo at {location_name}."}$crm$::jsonb, 's2', null, null
from automation_workflows where code = 'noshow_adult_tkd';
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's2', 'delay', 20, $crm${"days":2}$crm$::jsonb, 's3', null, null
from automation_workflows where code = 'noshow_adult_tkd';
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's3', 'push', 30, $crm${"title":"Book the next class","body":"Pick another Adult Taekwondo class at {location_name}."}$crm$::jsonb, null, null, null
from automation_workflows where code = 'noshow_adult_tkd';
insert into automation_workflows (code, category, brand, name, trigger_type, trigger_rules, exit_conditions) values (
  'noshow_fitboxing', 'NOSHOW', 'lvlup', 'Fitboxing no-show', 'booking_no_show',
  $crm${"program_slug":"fitboxing"}$crm$::jsonb,
  $crm$["class_booked"]$crm$::jsonb
);
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's1', 'email', 10, $crm${"subject":"We missed {first_name}","body":"{first_name} was marked absent from Fitboxing at {location_name}."}$crm$::jsonb, 's2', null, null
from automation_workflows where code = 'noshow_fitboxing';
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's2', 'delay', 20, $crm${"days":2}$crm$::jsonb, 's3', null, null
from automation_workflows where code = 'noshow_fitboxing';
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's3', 'push', 30, $crm${"title":"Book the next class","body":"Pick another Fitboxing class at {location_name}."}$crm$::jsonb, null, null, null
from automation_workflows where code = 'noshow_fitboxing';
insert into automation_workflows (code, category, brand, name, trigger_type, trigger_rules, exit_conditions) values (
  'noshow_rebook', 'NOSHOW', 'shared', 'Rebook after a no-show', 'booking_no_show',
  $crm${}$crm$::jsonb,
  $crm$["class_booked"]$crm$::jsonb
);
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's1', 'email', 10, $crm${"subject":"Save another class","body":"Hi {guardian_name}, book the next class at {location_name} for {first_name}."}$crm$::jsonb, 's2', null, null
from automation_workflows where code = 'noshow_rebook';
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's2', 'delay', 20, $crm${"days":1}$crm$::jsonb, 's3', null, null
from automation_workflows where code = 'noshow_rebook';
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's3', 'sms', 30, $crm${"body":"A seat is open for {first_name} at {location_name}."}$crm$::jsonb, 's4', null, null
from automation_workflows where code = 'noshow_rebook';
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's4', 'task', 40, $crm${"title":"Rebook follow-up","body":"Check whether {first_name} booked another class at {location_name}."}$crm$::jsonb, null, null, null
from automation_workflows where code = 'noshow_rebook';
insert into automation_workflows (code, category, brand, name, trigger_type, trigger_rules, exit_conditions) values (
  'onb_taekwondo', 'ONB', 'lvlup', 'Taekwondo onboarding', 'membership_start',
  $crm${"program_slug":"taekwondo"}$crm$::jsonb,
  $crm$[]$crm$::jsonb
);
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's1', 'email', 10, $crm${"subject":"Welcome to taekwondo","body":"Hi {first_name}, welcome to taekwondo at {location_name}."}$crm$::jsonb, 's2', null, null
from automation_workflows where code = 'onb_taekwondo';
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's2', 'task', 20, $crm${"title":"Class 1 note","body":"Write the first class note for {first_name}."}$crm$::jsonb, 's3', null, null
from automation_workflows where code = 'onb_taekwondo';
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's3', 'delay', 30, $crm${"days":7}$crm$::jsonb, 's4', null, null
from automation_workflows where code = 'onb_taekwondo';
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's4', 'email', 40, $crm${"subject":"Your first week","body":"How was the first week at {location_name}, {guardian_name}?"}$crm$::jsonb, null, null, null
from automation_workflows where code = 'onb_taekwondo';
insert into automation_workflows (code, category, brand, name, trigger_type, trigger_rules, exit_conditions) values (
  'onb_fitboxing', 'ONB', 'lvlup', 'Fitboxing onboarding', 'membership_start',
  $crm${"program_slug":"fitboxing"}$crm$::jsonb,
  $crm$[]$crm$::jsonb
);
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's1', 'email', 10, $crm${"subject":"Welcome to Fitboxing","body":"Hi {first_name}, welcome to Fitboxing at {location_name}."}$crm$::jsonb, 's2', null, null
from automation_workflows where code = 'onb_fitboxing';
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's2', 'task', 20, $crm${"title":"First session note","body":"Write the first session note for {first_name}."}$crm$::jsonb, null, null, null
from automation_workflows where code = 'onb_fitboxing';
insert into automation_workflows (code, category, brand, name, trigger_type, trigger_rules, exit_conditions) values (
  'onb90_sequence', 'ONB90', 'lvlup', '90-day onboarding', 'membership_start',
  $crm${"sequence":"ninety_day"}$crm$::jsonb,
  $crm$[]$crm$::jsonb
);
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's1', 'email', 10, $crm${"subject":"Day 1 check","body":"Welcome to {location_name}, {first_name}.","day":1}$crm$::jsonb, 's2', null, null
from automation_workflows where code = 'onb90_sequence';
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's2', 'task', 20, $crm${"title":"Class 1 note","body":"Write the class 1 note for {first_name}.","day":1}$crm$::jsonb, 's3', null, null
from automation_workflows where code = 'onb90_sequence';
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's3', 'delay', 30, $crm${"days":6,"until_day":7}$crm$::jsonb, 's4', null, null
from automation_workflows where code = 'onb90_sequence';
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's4', 'email', 40, $crm${"subject":"Day 7 check","body":"Day 7 check-in for {first_name} at {location_name}.","day":7}$crm$::jsonb, 's5', null, null
from automation_workflows where code = 'onb90_sequence';
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's5', 'delay', 50, $crm${"days":7,"until_day":14}$crm$::jsonb, 's6', null, null
from automation_workflows where code = 'onb90_sequence';
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's6', 'email', 60, $crm${"subject":"Day 14 check","body":"Day 14 check-in for {first_name} at {location_name}.","day":14}$crm$::jsonb, 's7', null, null
from automation_workflows where code = 'onb90_sequence';
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's7', 'delay', 70, $crm${"days":7,"until_day":21}$crm$::jsonb, 's8', null, null
from automation_workflows where code = 'onb90_sequence';
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's8', 'email', 80, $crm${"subject":"Day 21 check","body":"Day 21 check-in for {first_name} at {location_name}.","day":21}$crm$::jsonb, 's9', null, null
from automation_workflows where code = 'onb90_sequence';
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's9', 'delay', 90, $crm${"days":9,"until_day":30}$crm$::jsonb, 's10', null, null
from automation_workflows where code = 'onb90_sequence';
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's10', 'email', 100, $crm${"subject":"Day 30 check","body":"Day 30 check-in for {first_name} at {location_name}.","day":30}$crm$::jsonb, 's11', null, null
from automation_workflows where code = 'onb90_sequence';
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's11', 'email', 110, $crm${"subject":"How are we doing?","body":"A short survey for {guardian_name} about {location_name}.","day":30,"kind":"nps_survey"}$crm$::jsonb, 's12', null, null
from automation_workflows where code = 'onb90_sequence';
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's12', 'email', 120, $crm${"subject":"Tiger Leaders invite","body":"{first_name} may enjoy the Tiger Leaders group at {location_name}."}$crm$::jsonb, 's13', null, null
from automation_workflows where code = 'onb90_sequence';
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's13', 'task', 130, $crm${"title":"Track from class","body":"Track {first_name} from class and note the next step."}$crm$::jsonb, 's14', null, null
from automation_workflows where code = 'onb90_sequence';
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's14', 'delay', 140, $crm${"days":40,"until_day":70}$crm$::jsonb, 's15', null, null
from automation_workflows where code = 'onb90_sequence';
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's15', 'email', 150, $crm${"subject":"Day 70 check","body":"Day 70 check-in for {first_name} at {location_name}.","day":70}$crm$::jsonb, 's16', null, null
from automation_workflows where code = 'onb90_sequence';
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's16', 'delay', 160, $crm${"days":10,"until_day":80}$crm$::jsonb, 's17', null, null
from automation_workflows where code = 'onb90_sequence';
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's17', 'email', 170, $crm${"subject":"Day 80 check","body":"Day 80 check-in for {first_name} at {location_name}.","day":80}$crm$::jsonb, null, null, null
from automation_workflows where code = 'onb90_sequence';
insert into automation_workflows (code, category, brand, name, trigger_type, trigger_rules, exit_conditions) values (
  'ops_uniform_ready', 'OPS', 'shared', 'Uniform ready', 'manual',
  $crm${"reason":"uniform_ready"}$crm$::jsonb,
  $crm$[]$crm$::jsonb
);
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's1', 'email', 10, $crm${"subject":"Uniform is ready","body":"The uniform for {first_name} is ready at {location_name}."}$crm$::jsonb, 's2', null, null
from automation_workflows where code = 'ops_uniform_ready';
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's2', 'task', 20, $crm${"title":"Hand off the uniform","body":"Front desk: the uniform for {first_name} is ready at {location_name}."}$crm$::jsonb, null, null, null
from automation_workflows where code = 'ops_uniform_ready';
insert into automation_workflows (code, category, brand, name, trigger_type, trigger_rules, exit_conditions) values (
  'prog_tigers_ara', 'PROG', 'lvlup', 'Tigers first belt Ara', 'promotion',
  $crm${"rank_slug":"tigers_ara"}$crm$::jsonb,
  $crm$[]$crm$::jsonb
);
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's1', 'email', 10, $crm${"subject":"Tigers first belt Ara","body":"Hi {first_name}, Ara is the first Tigers belt at {location_name}."}$crm$::jsonb, 's2', null, null
from automation_workflows where code = 'prog_tigers_ara';
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's2', 'task', 20, $crm${"title":"Tigers first belt Ara","body":"Record Tigers first belt Ara for {first_name} at {location_name}."}$crm$::jsonb, null, null, null
from automation_workflows where code = 'prog_tigers_ara';
insert into automation_workflows (code, category, brand, name, trigger_type, trigger_rules, exit_conditions) values (
  'prog_orange_belt', 'PROG', 'lvlup', 'Orange belt', 'promotion',
  $crm${"rank_slug":"orange"}$crm$::jsonb,
  $crm$[]$crm$::jsonb
);
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's1', 'email', 10, $crm${"subject":"Orange belt","body":"Hi {first_name}, orange belt is recorded at {location_name}."}$crm$::jsonb, 's2', null, null
from automation_workflows where code = 'prog_orange_belt';
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's2', 'task', 20, $crm${"title":"Orange belt","body":"Record Orange belt for {first_name} at {location_name}."}$crm$::jsonb, null, null, null
from automation_workflows where code = 'prog_orange_belt';
insert into automation_workflows (code, category, brand, name, trigger_type, trigger_rules, exit_conditions) values (
  'prog_yellow_sparring', 'PROG', 'lvlup', 'Yellow belt sparring gear', 'promotion',
  $crm${"rank_slug":"yellow"}$crm$::jsonb,
  $crm$[]$crm$::jsonb
);
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's1', 'email', 10, $crm${"subject":"Yellow belt sparring gear","body":"Hi {first_name}, yellow belt is a good time to pick up sparring gear at {location_name}."}$crm$::jsonb, 's2', null, null
from automation_workflows where code = 'prog_yellow_sparring';
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's2', 'task', 20, $crm${"title":"Yellow belt sparring gear","body":"Record Yellow belt sparring gear for {first_name} at {location_name}."}$crm$::jsonb, null, null, null
from automation_workflows where code = 'prog_yellow_sparring';
insert into automation_workflows (code, category, brand, name, trigger_type, trigger_rules, exit_conditions) values (
  'prog_belt_promotion', 'PROG', 'lvlup', 'Belt promotion', 'promotion',
  $crm${"reason":"belt_promoted"}$crm$::jsonb,
  $crm$[]$crm$::jsonb
);
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's1', 'email', 10, $crm${"subject":"Belt promotion","body":"Hi {guardian_name}, {first_name} earned a new belt at {location_name}."}$crm$::jsonb, 's2', null, null
from automation_workflows where code = 'prog_belt_promotion';
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's2', 'task', 20, $crm${"title":"Belt promotion","body":"Record Belt promotion for {first_name} at {location_name}."}$crm$::jsonb, null, null, null
from automation_workflows where code = 'prog_belt_promotion';
insert into automation_workflows (code, category, brand, name, trigger_type, trigger_rules, exit_conditions) values (
  'prog_ready_to_test', 'PROG', 'lvlup', 'Ready to test', 'promotion',
  $crm${"reason":"ready_to_test"}$crm$::jsonb,
  $crm$[]$crm$::jsonb
);
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's1', 'email', 10, $crm${"subject":"Ready to test","body":"{first_name} is ready to test at {location_name}."}$crm$::jsonb, 's2', null, null
from automation_workflows where code = 'prog_ready_to_test';
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's2', 'task', 20, $crm${"title":"Ready to test","body":"Record Ready to test for {first_name} at {location_name}."}$crm$::jsonb, null, null, null
from automation_workflows where code = 'prog_ready_to_test';
insert into automation_workflows (code, category, brand, name, trigger_type, trigger_rules, exit_conditions) values (
  'prog_test_registered', 'PROG', 'lvlup', 'Test registered', 'promotion',
  $crm${"reason":"test_registered"}$crm$::jsonb,
  $crm$[]$crm$::jsonb
);
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's1', 'email', 10, $crm${"subject":"Test registered","body":"{first_name} is registered to test at {location_name}."}$crm$::jsonb, 's2', null, null
from automation_workflows where code = 'prog_test_registered';
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's2', 'task', 20, $crm${"title":"Test registered","body":"Record Test registered for {first_name} at {location_name}."}$crm$::jsonb, null, null, null
from automation_workflows where code = 'prog_test_registered';
insert into automation_workflows (code, category, brand, name, trigger_type, trigger_rules, exit_conditions) values (
  'prog_first_degree_decided', 'PROG', 'lvlup', '1st degree decided', 'promotion',
  $crm${"rank_slug":"first_degree_decided"}$crm$::jsonb,
  $crm$[]$crm$::jsonb
);
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's1', 'email', 10, $crm${"subject":"1st degree decided","body":"{first_name} is decided for 1st degree at {location_name}."}$crm$::jsonb, 's2', null, null
from automation_workflows where code = 'prog_first_degree_decided';
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's2', 'task', 20, $crm${"title":"1st degree decided","body":"Record 1st degree decided for {first_name} at {location_name}."}$crm$::jsonb, null, null, null
from automation_workflows where code = 'prog_first_degree_decided';
insert into automation_workflows (code, category, brand, name, trigger_type, trigger_rules, exit_conditions) values (
  'prog_fitboxing_streak_4', 'PROG', 'lvlup', 'Fitboxing 4-class streak', 'promotion',
  $crm${"program_slug":"fitboxing","streak":4}$crm$::jsonb,
  $crm$[]$crm$::jsonb
);
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's1', 'add_tag', 10, $crm${"tag":"fitboxing_streak_4"}$crm$::jsonb, 's2', null, null
from automation_workflows where code = 'prog_fitboxing_streak_4';
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's2', 'email', 20, $crm${"subject":"Four classes in a row","body":"{first_name} hit a 4-class Fitboxing streak at {location_name}."}$crm$::jsonb, null, null, null
from automation_workflows where code = 'prog_fitboxing_streak_4';
insert into automation_workflows (code, category, brand, name, trigger_type, trigger_rules, exit_conditions) values (
  'prog_fitboxing_streak_12', 'PROG', 'lvlup', 'Fitboxing 12-class streak', 'promotion',
  $crm${"program_slug":"fitboxing","streak":12}$crm$::jsonb,
  $crm$[]$crm$::jsonb
);
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's1', 'add_tag', 10, $crm${"tag":"fitboxing_streak_12"}$crm$::jsonb, 's2', null, null
from automation_workflows where code = 'prog_fitboxing_streak_12';
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's2', 'email', 20, $crm${"subject":"Twelve classes in a row","body":"{first_name} hit a 12-class Fitboxing streak at {location_name}."}$crm$::jsonb, null, null, null
from automation_workflows where code = 'prog_fitboxing_streak_12';
insert into automation_workflows (code, category, brand, name, trigger_type, trigger_rules, exit_conditions) values (
  'ret_absence_7', 'RET', 'shared', '7-day absence', 'absence',
  $crm${"absence_days":7}$crm$::jsonb,
  $crm$["class_booked"]$crm$::jsonb
);
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's1', 'absence_wait', 10, $crm${"days":7,"exit_on":"class_booked"}$crm$::jsonb, 's2', null, null
from automation_workflows where code = 'ret_absence_7';
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's2', 'email', 20, $crm${"subject":"We have not seen {first_name}","body":"{first_name} has been away from {location_name} for 7 days."}$crm$::jsonb, 's3', null, null
from automation_workflows where code = 'ret_absence_7';
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's3', 'task', 30, $crm${"title":"Absence check","body":"Review the 7-day absence for {first_name} at {location_name}."}$crm$::jsonb, null, null, null
from automation_workflows where code = 'ret_absence_7';
insert into automation_workflows (code, category, brand, name, trigger_type, trigger_rules, exit_conditions) values (
  'ret_absence_10', 'RET', 'shared', '10-day absence', 'absence',
  $crm${"absence_days":10}$crm$::jsonb,
  $crm$["class_booked"]$crm$::jsonb
);
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's1', 'absence_wait', 10, $crm${"days":10,"exit_on":"class_booked"}$crm$::jsonb, 's2', null, null
from automation_workflows where code = 'ret_absence_10';
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's2', 'email', 20, $crm${"subject":"We have not seen {first_name}","body":"{first_name} has been away from {location_name} for 10 days."}$crm$::jsonb, 's3', null, null
from automation_workflows where code = 'ret_absence_10';
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's3', 'task', 30, $crm${"title":"Absence check","body":"Review the 10-day absence for {first_name} at {location_name}."}$crm$::jsonb, null, null, null
from automation_workflows where code = 'ret_absence_10';
insert into automation_workflows (code, category, brand, name, trigger_type, trigger_rules, exit_conditions) values (
  'ret_absence_21', 'RET', 'shared', '21-day absence', 'absence',
  $crm${"absence_days":21}$crm$::jsonb,
  $crm$["class_booked"]$crm$::jsonb
);
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's1', 'absence_wait', 10, $crm${"days":21,"exit_on":"class_booked"}$crm$::jsonb, 's2', null, null
from automation_workflows where code = 'ret_absence_21';
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's2', 'email', 20, $crm${"subject":"We have not seen {first_name}","body":"{first_name} has been away from {location_name} for 21 days."}$crm$::jsonb, 's3', null, null
from automation_workflows where code = 'ret_absence_21';
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's3', 'task', 30, $crm${"title":"Absence check","body":"Review the 21-day absence for {first_name} at {location_name}."}$crm$::jsonb, null, null, null
from automation_workflows where code = 'ret_absence_21';
insert into automation_workflows (code, category, brand, name, trigger_type, trigger_rules, exit_conditions) values (
  'ret_hold_started', 'RET', 'shared', 'Hold started', 'member_frozen',
  $crm${"phase":"started"}$crm$::jsonb,
  $crm$[]$crm$::jsonb
);
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's1', 'email', 10, $crm${"subject":"Hold started","body":"A hold started for {first_name} at {location_name}."}$crm$::jsonb, 's2', null, null
from automation_workflows where code = 'ret_hold_started';
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's2', 'task', 20, $crm${"title":"Confirm the hold","body":"Confirm the hold dates for {first_name} at {location_name}."}$crm$::jsonb, null, null, null
from automation_workflows where code = 'ret_hold_started';
insert into automation_workflows (code, category, brand, name, trigger_type, trigger_rules, exit_conditions) values (
  'ret_hold_ending', 'RET', 'shared', 'Hold ending', 'member_frozen',
  $crm${"phase":"ending"}$crm$::jsonb,
  $crm$[]$crm$::jsonb
);
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's1', 'email', 10, $crm${"subject":"Hold ending","body":"The hold for {first_name} at {location_name} is ending soon."}$crm$::jsonb, 's2', null, null
from automation_workflows where code = 'ret_hold_ending';
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's2', 'task', 20, $crm${"title":"Welcome back plan","body":"Plan the return class for {first_name} at {location_name}."}$crm$::jsonb, null, null, null
from automation_workflows where code = 'ret_hold_ending';
insert into automation_workflows (code, category, brand, name, trigger_type, trigger_rules, exit_conditions) values (
  'ret_cancel_request', 'RET', 'shared', 'Cancel request', 'manual',
  $crm${"reason":"cancel_request"}$crm$::jsonb,
  $crm$[]$crm$::jsonb
);
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's1', 'task', 10, $crm${"title":"Review cancel request","body":"Review the cancel request for {first_name} at {location_name}."}$crm$::jsonb, 's2', null, null
from automation_workflows where code = 'ret_cancel_request';
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's2', 'email', 20, $crm${"subject":"We received your request","body":"Hi {guardian_name}, {location_name} received the request for {first_name}."}$crm$::jsonb, null, null, null
from automation_workflows where code = 'ret_cancel_request';
insert into automation_workflows (code, category, brand, name, trigger_type, trigger_rules, exit_conditions) values (
  'ret_anniversary', 'RET', 'shared', 'Anniversary', 'manual',
  $crm${"reason":"anniversary"}$crm$::jsonb,
  $crm$[]$crm$::jsonb
);
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's1', 'email', 10, $crm${"subject":"Happy anniversary","body":"Hi {first_name}, happy training anniversary from {location_name}."}$crm$::jsonb, null, null, null
from automation_workflows where code = 'ret_anniversary';
insert into automation_workflows (code, category, brand, name, trigger_type, trigger_rules, exit_conditions) values (
  'ret_referral_thanks', 'RET', 'shared', 'Referral thanks', 'manual',
  $crm${"reason":"referral_thanks"}$crm$::jsonb,
  $crm$[]$crm$::jsonb
);
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's1', 'email', 10, $crm${"subject":"Thanks for the referral","body":"Hi {guardian_name}, thank you for referring a family to {location_name}."}$crm$::jsonb, 's2', null, null
from automation_workflows where code = 'ret_referral_thanks';
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's2', 'add_tag', 20, $crm${"tag":"referral_thanks"}$crm$::jsonb, null, null, null
from automation_workflows where code = 'ret_referral_thanks';
insert into automation_workflows (code, category, brand, name, trigger_type, trigger_rules, exit_conditions) values (
  'ret_renewal_upcoming', 'RET', 'shared', 'Renewal coming up', 'manual',
  $crm${"reason":"renewal_due"}$crm$::jsonb,
  $crm$[]$crm$::jsonb
);
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's1', 'add_tag', 10, $crm${"tag":"renewal_due"}$crm$::jsonb, 's2', null, null
from automation_workflows where code = 'ret_renewal_upcoming';
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's2', 'email', 20, $crm${"subject":"Renewal coming up","body":"Hi {guardian_name}, a renewal is coming up for {first_name} at {location_name}."}$crm$::jsonb, null, null, null
from automation_workflows where code = 'ret_renewal_upcoming';
insert into automation_workflows (code, category, brand, name, trigger_type, trigger_rules, exit_conditions) values (
  'ret_renewal_complete', 'RET', 'shared', 'Renewal complete', 'manual',
  $crm${"reason":"renewed"}$crm$::jsonb,
  $crm$[]$crm$::jsonb
);
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's1', 'remove_tag', 10, $crm${"tag":"renewal_due"}$crm$::jsonb, 's2', null, null
from automation_workflows where code = 'ret_renewal_complete';
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's2', 'email', 20, $crm${"subject":"Renewal recorded","body":"The renewal for {first_name} at {location_name} is recorded."}$crm$::jsonb, null, null, null
from automation_workflows where code = 'ret_renewal_complete';
insert into automation_workflows (code, category, brand, name, trigger_type, trigger_rules, exit_conditions) values (
  'src_google_ad', 'SRC', 'shared', 'Google ad source', 'new_lead',
  $crm${"source":"google_ad"}$crm$::jsonb,
  $crm$["membership_started"]$crm$::jsonb
);
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's1', 'add_tag', 10, $crm${"tag":"source_google_ad"}$crm$::jsonb, 's2', null, null
from automation_workflows where code = 'src_google_ad';
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's2', 'email', 20, $crm${"subject":"Google ad lead","body":"New Google ad lead for {location_name}. Reply to {guardian_name} at {email}."}$crm$::jsonb, null, null, null
from automation_workflows where code = 'src_google_ad';
insert into automation_workflows (code, category, brand, name, trigger_type, trigger_rules, exit_conditions) values (
  'src_meta_ad', 'SRC', 'shared', 'Meta ad source', 'new_lead',
  $crm${"source":"meta_ad"}$crm$::jsonb,
  $crm$["membership_started"]$crm$::jsonb
);
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's1', 'add_tag', 10, $crm${"tag":"source_meta_ad"}$crm$::jsonb, 's2', null, null
from automation_workflows where code = 'src_meta_ad';
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's2', 'email', 20, $crm${"subject":"Meta ad lead","body":"New Meta ad lead for {location_name}. Reply to {guardian_name} at {email}."}$crm$::jsonb, null, null, null
from automation_workflows where code = 'src_meta_ad';
insert into automation_workflows (code, category, brand, name, trigger_type, trigger_rules, exit_conditions) values (
  'src_website_form', 'SRC', 'shared', 'Website form source', 'new_lead',
  $crm${"source":"website_form"}$crm$::jsonb,
  $crm$["membership_started"]$crm$::jsonb
);
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's1', 'add_tag', 10, $crm${"tag":"source_website_form"}$crm$::jsonb, 's2', null, null
from automation_workflows where code = 'src_website_form';
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's2', 'email', 20, $crm${"subject":"Website form lead","body":"New Website form lead for {location_name}. Reply to {guardian_name} at {email}."}$crm$::jsonb, 's3', null, null
from automation_workflows where code = 'src_website_form';
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's3', 'start_automation', 30, $crm${"workflow_code":"lead_general"}$crm$::jsonb, null, null, null
from automation_workflows where code = 'src_website_form';
insert into automation_workflows (code, category, brand, name, trigger_type, trigger_rules, exit_conditions) values (
  'src_event', 'SRC', 'shared', 'Event source', 'new_lead',
  $crm${"source":"event"}$crm$::jsonb,
  $crm$["membership_started"]$crm$::jsonb
);
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's1', 'add_tag', 10, $crm${"tag":"source_event"}$crm$::jsonb, 's2', null, null
from automation_workflows where code = 'src_event';
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's2', 'email', 20, $crm${"subject":"Event lead","body":"New Event lead for {location_name}. Reply to {guardian_name} at {email}."}$crm$::jsonb, null, null, null
from automation_workflows where code = 'src_event';
insert into automation_workflows (code, category, brand, name, trigger_type, trigger_rules, exit_conditions) values (
  'src_mailer_qr', 'SRC', 'shared', 'Mailer QR source', 'new_lead',
  $crm${"source":"mailer_qr"}$crm$::jsonb,
  $crm$["membership_started"]$crm$::jsonb
);
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's1', 'add_tag', 10, $crm${"tag":"source_mailer_qr"}$crm$::jsonb, 's2', null, null
from automation_workflows where code = 'src_mailer_qr';
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's2', 'email', 20, $crm${"subject":"Mailer QR lead","body":"New Mailer QR lead for {location_name}. Reply to {guardian_name} at {email}."}$crm$::jsonb, null, null, null
from automation_workflows where code = 'src_mailer_qr';
insert into automation_workflows (code, category, brand, name, trigger_type, trigger_rules, exit_conditions) values (
  'src_milo_chat', 'SRC', 'shared', 'Milo chat source', 'new_lead',
  $crm${"source":"milo_chat"}$crm$::jsonb,
  $crm$["membership_started"]$crm$::jsonb
);
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's1', 'add_tag', 10, $crm${"tag":"source_milo_chat"}$crm$::jsonb, 's2', null, null
from automation_workflows where code = 'src_milo_chat';
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's2', 'email', 20, $crm${"subject":"Milo chat lead","body":"New Milo chat lead for {location_name}. Reply to {guardian_name} at {email}."}$crm$::jsonb, null, null, null
from automation_workflows where code = 'src_milo_chat';
insert into automation_workflows (code, category, brand, name, trigger_type, trigger_rules, exit_conditions) values (
  'src_referral', 'SRC', 'shared', 'Referral source', 'new_lead',
  $crm${"source":"referral"}$crm$::jsonb,
  $crm$["membership_started"]$crm$::jsonb
);
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's1', 'add_tag', 10, $crm${"tag":"source_referral"}$crm$::jsonb, 's2', null, null
from automation_workflows where code = 'src_referral';
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's2', 'email', 20, $crm${"subject":"Referral lead","body":"New Referral lead for {location_name}. Reply to {guardian_name} at {email}."}$crm$::jsonb, null, null, null
from automation_workflows where code = 'src_referral';
insert into automation_workflows (code, category, brand, name, trigger_type, trigger_rules, exit_conditions) values (
  'src_walk_in', 'SRC', 'shared', 'Walk-in source', 'new_lead',
  $crm${"source":"walk_in"}$crm$::jsonb,
  $crm$["membership_started"]$crm$::jsonb
);
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's1', 'add_tag', 10, $crm${"tag":"source_walk_in"}$crm$::jsonb, 's2', null, null
from automation_workflows where code = 'src_walk_in';
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's2', 'email', 20, $crm${"subject":"Walk-in lead","body":"New Walk-in lead for {location_name}. Reply to {guardian_name} at {email}."}$crm$::jsonb, null, null, null
from automation_workflows where code = 'src_walk_in';
insert into automation_workflows (code, category, brand, name, trigger_type, trigger_rules, exit_conditions) values (
  'trial_kids', 'TRIAL', 'lvlup', 'Kids trial follow-up', 'new_booking',
  $crm${"program_slug":"kids_teens","class_kind":"intro"}$crm$::jsonb,
  $crm$["membership_started","class_booked"]$crm$::jsonb
);
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's1', 'email', 10, $crm${"subject":"Your intro class","body":"Hi {parent_first_name}, the intro class for {first_name} is at {location_name}."}$crm$::jsonb, 's2', null, null
from automation_workflows where code = 'trial_kids';
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's2', 'delay', 20, $crm${"days":1}$crm$::jsonb, 's3', null, null
from automation_workflows where code = 'trial_kids';
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's3', 'email', 30, $crm${"subject":"After the intro","body":"Hi {guardian_name}, tell us how the intro at {location_name} went."}$crm$::jsonb, null, null, null
from automation_workflows where code = 'trial_kids';
insert into automation_workflows (code, category, brand, name, trigger_type, trigger_rules, exit_conditions) values (
  'trial_adult', 'TRIAL', 'lvlup', 'Adult trial follow-up', 'new_booking',
  $crm${"program_slug":"adult_tkd","class_kind":"intro"}$crm$::jsonb,
  $crm$["membership_started","class_booked"]$crm$::jsonb
);
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's1', 'email', 10, $crm${"subject":"Your adult intro","body":"Hi {first_name}, your adult intro is booked at {location_name}."}$crm$::jsonb, 's2', null, null
from automation_workflows where code = 'trial_adult';
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's2', 'delay', 20, $crm${"days":1}$crm$::jsonb, 's3', null, null
from automation_workflows where code = 'trial_adult';
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's3', 'email', 30, $crm${"subject":"After your intro","body":"How did the intro at {location_name} feel, {first_name}?"}$crm$::jsonb, null, null, null
from automation_workflows where code = 'trial_adult';
insert into automation_workflows (code, category, brand, name, trigger_type, trigger_rules, exit_conditions) values (
  'trial_fitboxing', 'TRIAL', 'lvlup', 'Fitboxing trial follow-up', 'new_booking',
  $crm${"program_slug":"fitboxing","class_kind":"intro"}$crm$::jsonb,
  $crm$["membership_started","class_booked"]$crm$::jsonb
);
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's1', 'email', 10, $crm${"subject":"Your Fitboxing intro","body":"Hi {first_name}, your Fitboxing intro is booked at {location_name}."}$crm$::jsonb, 's2', null, null
from automation_workflows where code = 'trial_fitboxing';
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's2', 'delay', 20, $crm${"days":1}$crm$::jsonb, 's3', null, null
from automation_workflows where code = 'trial_fitboxing';
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's3', 'task', 30, $crm${"title":"Fitboxing intro follow-up","body":"Follow up with {guardian_name} after the Fitboxing intro at {location_name}."}$crm$::jsonb, null, null, null
from automation_workflows where code = 'trial_fitboxing';
insert into automation_workflows (code, category, brand, name, trigger_type, trigger_rules, exit_conditions) values (
  'watchlist_absence', 'WATCHLIST', 'shared', 'Absence watch list', 'absence',
  $crm${}$crm$::jsonb,
  $crm$["class_booked"]$crm$::jsonb
);
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 'gate', 'split', 10, $crm${"when":"absence_days_gte","value":21}$crm$::jsonb, null, 'critical', 'warning'
from automation_workflows where code = 'watchlist_absence';
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 'critical', 'webhook', 20, $crm${"url_template":"https://hooks.example.test/watchlist?location={location_id}&severity=critical","secret_env":"WATCHLIST_WEBHOOK_SECRET","severity":"critical"}$crm$::jsonb, 'task', null, null
from automation_workflows where code = 'watchlist_absence';
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 'warning', 'webhook', 30, $crm${"url_template":"https://hooks.example.test/watchlist?location={location_id}&severity=warning","secret_env":"WATCHLIST_WEBHOOK_SECRET","severity":"warning"}$crm$::jsonb, 'task', null, null
from automation_workflows where code = 'watchlist_absence';
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 'task', 'task', 40, $crm${"title":"Review the absence watch list","body":"Review {first_name} at {location_name}. Review link {review_url}."}$crm$::jsonb, null, null, null
from automation_workflows where code = 'watchlist_absence';
insert into automation_workflows (code, category, brand, name, trigger_type, trigger_rules, exit_conditions) values (
  'goninja_birthday_waiver', 'GONINJA', 'goninja', 'Birthday host and guest waivers', 'new_booking',
  $crm${"class_kind":"birthday"}$crm$::jsonb,
  $crm$[]$crm$::jsonb
);
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's1', 'add_document', 10, $crm${"document_code":"birthday_waiver_host","title":"Birthday host waiver","audience":"host"}$crm$::jsonb, 's2', null, null
from automation_workflows where code = 'goninja_birthday_waiver';
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's2', 'add_document', 20, $crm${"document_code":"birthday_waiver_guest","title":"Birthday guest waiver","audience":"guest"}$crm$::jsonb, 's3', null, null
from automation_workflows where code = 'goninja_birthday_waiver';
insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's3', 'email', 30, $crm${"subject":"Party waivers","body":"Waiver copies for the party at {location_name} are attached for the host and each guest."}$crm$::jsonb, null, null, null
from automation_workflows where code = 'goninja_birthday_waiver';
