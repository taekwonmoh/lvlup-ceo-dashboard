-- Wave 2 area F: saved templates and system email toggles.
-- Do not apply this file to Supabase project xxyndswrierztzdbjvrd
-- or belfzlyvgjheudxhviyt, or to any other live database.
-- Local tests apply crm/migrations/013_templates_system_emails.sql.
-- Saving a template never sends. AUTOMATION_DELIVERY_ENABLED stays 0.
-- No phone numbers. No tel: or sms: links.

-- ---------------------------------------------------------------------------
-- Saved email and in-app copy. Merge tags are checked in the API.
-- ---------------------------------------------------------------------------

create table if not exists message_templates (
  id uuid primary key default gen_random_uuid(),
  location_id text references locations (id),
  brand text,
  code text not null,
  channel text not null,
  subject text,
  body text not null,
  updated_by uuid references staff_users (id),
  updated_at timestamptz not null default now(),
  check (brand is null or brand in ('lvlup', 'goninja', 'shared')),
  check (code ~ '^[a-z0-9_]+$'),
  check (channel in ('email', 'push', 'in_app')),
  check (char_length(body) between 1 and 8000),
  check (subject is null or char_length(subject) between 1 and 200),
  check (body !~* 'tel:' and body !~* 'sms:' and body !~* '\{phone'),
  check (subject is null or (subject !~* 'tel:' and subject !~* 'sms:' and subject !~* '\{phone'))
);

create unique index if not exists message_templates_code_uidx
  on message_templates (coalesce(location_id, ''), coalesce(brand, ''), code, channel);

alter table automation_steps add column if not exists template_id uuid references message_templates (id);

-- ---------------------------------------------------------------------------
-- System emails. A missing settings row means the code is enabled.
-- The catalog is the list of codes staff can turn off per school.
-- ---------------------------------------------------------------------------

create table if not exists system_emails (
  code text primary key,
  name text not null,
  description text not null,
  channel text not null default 'email',
  check (code ~ '^[a-z0-9_]+$'),
  check (channel = 'email'),
  check (name !~* 'tel:' and description !~* 'tel:' and name !~* 'sms:' and description !~* 'sms:')
);

insert into system_emails (code, name, description)
select v.code, v.name, v.description
from (values
  ('booking_confirmation', 'Booking confirmation', 'Staff preview when a class is booked.'),
  ('class_reminder', 'Class reminder', 'Staff preview before a booked class.'),
  ('receipt', 'Receipt', 'Staff preview after a payment is recorded.'),
  ('failed_payment', 'Failed payment', 'Staff preview when a draft payment fails.'),
  ('new_member_staff_alert', 'New member staff alert', 'Staff preview when a membership starts.')
) as v(code, name, description)
where not exists (select 1 from system_emails s where s.code = v.code);

create table if not exists location_system_email_settings (
  location_id text not null references locations (id),
  code text not null references system_emails (code),
  enabled boolean not null default true,
  updated_by text,
  updated_at timestamptz not null default now(),
  primary key (location_id, code)
);

alter table locations add column if not exists staff_alert_emails text[] not null default '{}';
alter table locations drop constraint if exists locations_staff_alert_emails_chk;
alter table locations add constraint locations_staff_alert_emails_chk
  check (staff_alert_emails::text !~* 'tel:' and staff_alert_emails::text !~* 'sms:');

-- communication_log already exists. not_sent is the dry-run status for this alert.
do $$
declare cname text;
begin
  for cname in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.communication_log'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%dry_run%'
      and pg_get_constraintdef(c.oid) ilike '%status%'
  loop
    execute format('alter table public.communication_log drop constraint %I', cname);
  end loop;
end $$;

alter table communication_log drop constraint if exists communication_log_status_check;
alter table communication_log add constraint communication_log_status_check
  check (status in ('dry_run', 'not_sent'));

alter table communication_log add column if not exists subject text;
alter table communication_log add column if not exists body text;
alter table communication_log drop constraint if exists communication_log_subject_chk;
alter table communication_log add constraint communication_log_subject_chk
  check (subject is null or (char_length(subject) <= 200 and subject !~* 'tel:' and subject !~* 'sms:'));
alter table communication_log drop constraint if exists communication_log_body_chk;
alter table communication_log add constraint communication_log_body_chk
  check (body is null or (char_length(body) <= 8000 and body !~* 'tel:' and body !~* 'sms:' and body !~* '\{phone'));

insert into automation_rules (code, trigger_name)
values ('new_member_staff_alert', 'membership_start')
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- RLS. crm_app only. No anon policy.
-- ---------------------------------------------------------------------------

alter table message_templates enable row level security;
alter table system_emails enable row level security;
alter table location_system_email_settings enable row level security;

drop policy if exists message_templates_select on message_templates;
create policy message_templates_select on message_templates
  for select to crm_app
  using (
    (select crm_private.actor_role()) = 'owner'
    or (
      (select crm_private.actor_role()) in ('school_lead', 'front_desk', 'coach', 'ops')
      and (location_id is null or location_id = any (crm_private.actor_locations()))
    )
  );

drop policy if exists message_templates_write on message_templates;
create policy message_templates_write on message_templates
  for all to crm_app
  using (
    (select crm_private.actor_role()) = 'owner'
    or (
      (select crm_private.actor_role()) in ('school_lead', 'ops')
      and location_id is not null
      and location_id = any (crm_private.actor_locations())
    )
  )
  with check (
    (select crm_private.actor_role()) = 'owner'
    or (
      (select crm_private.actor_role()) in ('school_lead', 'ops')
      and location_id is not null
      and location_id = any (crm_private.actor_locations())
    )
  );

drop policy if exists system_emails_select on system_emails;
create policy system_emails_select on system_emails
  for select to crm_app
  using (crm_private.staff_at(null));

drop policy if exists system_emails_write on system_emails;
create policy system_emails_write on system_emails
  for all to crm_app
  using ((select crm_private.actor_role()) = 'owner')
  with check ((select crm_private.actor_role()) = 'owner');

drop policy if exists location_system_email_select on location_system_email_settings;
create policy location_system_email_select on location_system_email_settings
  for select to crm_app
  using (crm_private.staff_at(location_id));

drop policy if exists location_system_email_write on location_system_email_settings;
create policy location_system_email_write on location_system_email_settings
  for all to crm_app
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

do $$ begin
  execute 'grant select, insert, update, delete on message_templates, system_emails, location_system_email_settings to crm_app';
exception when undefined_object then null;
end $$;

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on message_templates, system_emails, location_system_email_settings from anon, authenticated';
  end if;
end $$;
