-- Wave 1 area C: forms, marketing consent, lead invites, and dry-run triggers.
-- Do not apply this file to Supabase project xxyndswrierztzdbjvrd
-- or belfzlyvgjheudxhviyt, or to any other live database.
-- Local tests apply crm/migrations/010_forms_consent_invites.sql.
-- Delivery stays off. sent_at on an invite stays null until a later approval.

-- ---------------------------------------------------------------------------
-- Forms, fields, documents, plan order, and submissions.
-- ---------------------------------------------------------------------------

create table if not exists forms (
  id uuid primary key default gen_random_uuid(),
  location_id text not null references locations (id),
  brand text not null check (brand in ('lvlup', 'goninja')),
  kind text not null check (kind in ('trial', 'signup', 'event', 'party', 'contact')),
  slug text not null unique,
  title text not null,
  redirect_url text,
  theme jsonb not null default '{}'::jsonb,
  require_guardian_for_minor boolean not null default true,
  email_optin_enabled boolean not null default true,
  email_optin_label text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  check (char_length(title) between 1 and 120),
  check (
    redirect_url is null
    or (
      redirect_url like 'https://%'
      and redirect_url !~* 'tel:'
      and redirect_url !~* 'sms:'
      and char_length(redirect_url) <= 500
    )
  ),
  check (jsonb_typeof(theme) = 'object'),
  check (
    email_optin_label is null
    or (
      char_length(email_optin_label) <= 200
      and email_optin_label !~* 'tel:'
      and email_optin_label !~* 'sms:'
    )
  )
);

create index if not exists forms_location_idx on forms (location_id, active);

create table if not exists form_fields (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references forms (id) on delete cascade,
  key text not null,
  label text not null,
  type text not null check (type in ('text', 'select', 'checkbox', 'date', 'file')),
  options jsonb not null default '[]'::jsonb,
  required boolean not null default false,
  sort_order integer not null default 0,
  unique (form_id, key),
  check (key ~ '^[a-z][a-z0-9_]{0,40}$'),
  check (key !~* 'phone' and key !~* 'sms' and key !~* 'tel'),
  check (char_length(label) between 1 and 120),
  check (jsonb_typeof(options) = 'array')
);

create index if not exists form_fields_form_idx on form_fields (form_id, sort_order);

create table if not exists form_documents (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references forms (id) on delete cascade,
  document_kind text not null,
  waiver_version text,
  required_signature boolean not null default true,
  check (document_kind in ('waiver', 'photo_release', 'policy')),
  check (waiver_version is null or char_length(waiver_version) <= 40)
);

create index if not exists form_documents_form_idx on form_documents (form_id);

create table if not exists form_plan_options (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references forms (id) on delete cascade,
  plan_id uuid not null references plans (id),
  sort_order integer not null default 0,
  featured boolean not null default false,
  unique (form_id, plan_id)
);

create index if not exists form_plan_options_form_idx on form_plan_options (form_id, sort_order);

create table if not exists form_submissions (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references forms (id),
  lead_id uuid references leads (id),
  member_id uuid references members (id),
  answers jsonb not null default '{}'::jsonb,
  email_optin boolean,
  submitted_at timestamptz not null default now(),
  ip text,
  check (jsonb_typeof(answers) = 'object'),
  check (answers::text !~* 'tel:' and answers::text !~* 'sms:'),
  check (ip is null or char_length(ip) <= 64)
);

create index if not exists form_submissions_form_idx on form_submissions (form_id, submitted_at desc);
create index if not exists form_submissions_lead_idx on form_submissions (lead_id);

-- ---------------------------------------------------------------------------
-- Marketing consent on the guardian preference row.
-- ---------------------------------------------------------------------------

alter table notification_preferences add column if not exists marketing_source text;
alter table notification_preferences add column if not exists marketing_consented_at timestamptz;
alter table notification_preferences add column if not exists marketing_revoked_at timestamptz;

alter table notification_preferences drop constraint if exists notification_preferences_marketing_source_chk;
alter table notification_preferences add constraint notification_preferences_marketing_source_chk
  check (marketing_source is null or marketing_source in ('form', 'staff', 'import'));

alter table automation_workflows add column if not exists marketing boolean not null default false;

do $$
declare cname text;
begin
  for cname in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.automation_workflows'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%trigger_type%'
  loop
    execute format('alter table public.automation_workflows drop constraint %I', cname);
  end loop;
end $$;

alter table automation_workflows drop constraint if exists automation_workflows_trigger_type_chk;
alter table automation_workflows add constraint automation_workflows_trigger_type_chk
  check (trigger_type in (
    'membership_start', 'new_booking', 'manual', 'new_lead',
    'booking_no_show', 'promotion', 'absence', 'member_frozen',
    'form_submitted', 'booking_cancelled', 'lead_invite_accepted'
  ));

-- ---------------------------------------------------------------------------
-- Lead re-invites. The token is stored as a hash. sent_at stays null.
-- ---------------------------------------------------------------------------

create table if not exists lead_invites (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads (id),
  plan_id uuid references plans (id),
  start_on date not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  sent_at timestamptz,
  accepted_at timestamptz,
  created_by uuid references staff_users (id),
  created_at timestamptz not null default now(),
  check (token_hash ~ '^[a-f0-9]{64}$'),
  check (sent_at is null)
);

create index if not exists lead_invites_lead_idx on lead_invites (lead_id, created_at desc);

comment on column lead_invites.sent_at is
  'Stays null while email delivery is off. The API returns the link and does not send it.';

-- ---------------------------------------------------------------------------
-- Dry-run workflows for the three new triggers. enabled stays false.
-- ---------------------------------------------------------------------------

insert into automation_workflows (code, category, brand, name, trigger_type, trigger_rules, exit_conditions, marketing)
values
  ('lead_form_submitted', 'LEAD', 'shared', 'Form submitted', 'form_submitted', '{}'::jsonb, '[]'::jsonb, true),
  ('book_cancelled', 'BOOK', 'shared', 'Booking cancelled', 'booking_cancelled', '{}'::jsonb, '[]'::jsonb, false),
  ('lead_invite_accepted', 'LEAD', 'shared', 'Lead invite accepted', 'lead_invite_accepted', '{}'::jsonb, '[]'::jsonb, false)
on conflict (code) do nothing;

insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's1', 'email', 10, '{"subject":"We received your form","body":"Hi {first_name}, we received your form for {location_name}."}'::jsonb, 's2', null, null
from automation_workflows w
where w.code = 'lead_form_submitted'
  and not exists (select 1 from automation_steps s where s.workflow_id = w.id and s.step_key = 's1');

insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's2', 'add_tag', 20, '{"tag":"form_submitted"}'::jsonb, null, null, null
from automation_workflows w
where w.code = 'lead_form_submitted'
  and not exists (select 1 from automation_steps s where s.workflow_id = w.id and s.step_key = 's2');

insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's1', 'task', 10, '{"title":"Review the cancelled booking","body":"A booking was cancelled at {location_name} for {first_name}."}'::jsonb, null, null, null
from automation_workflows w
where w.code = 'book_cancelled'
  and not exists (select 1 from automation_steps s where s.workflow_id = w.id and s.step_key = 's1');

insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's1', 'add_tag', 10, '{"tag":"invite_accepted"}'::jsonb, 's2', null, null
from automation_workflows w
where w.code = 'lead_invite_accepted'
  and not exists (select 1 from automation_steps s where s.workflow_id = w.id and s.step_key = 's1');

insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)
select id, 's2', 'task', 20, '{"title":"Confirm the invited start date","body":"Review the accepted invite for {first_name} at {location_name}."}'::jsonb, null, null, null
from automation_workflows w
where w.code = 'lead_invite_accepted'
  and not exists (select 1 from automation_steps s where s.workflow_id = w.id and s.step_key = 's2');

-- ---------------------------------------------------------------------------
-- RLS. Public form reads go through the Worker, not an anon policy.
-- ---------------------------------------------------------------------------

alter table forms enable row level security;
alter table form_fields enable row level security;
alter table form_documents enable row level security;
alter table form_plan_options enable row level security;
alter table form_submissions enable row level security;
alter table lead_invites enable row level security;

drop policy if exists forms_select on forms;
create policy forms_select on forms
  for select to crm_app
  using (crm_private.staff_at(location_id));

drop policy if exists forms_write on forms;
create policy forms_write on forms
  for all to crm_app
  using (
    (select crm_private.actor_role()) = 'owner'
    or (
      (select crm_private.actor_role()) in ('school_lead', 'ops')
      and location_id = any (crm_private.actor_locations())
    )
  )
  with check (
    (select crm_private.actor_role()) = 'owner'
    or (
      (select crm_private.actor_role()) in ('school_lead', 'ops')
      and location_id = any (crm_private.actor_locations())
    )
  );

drop policy if exists form_fields_select on form_fields;
create policy form_fields_select on form_fields
  for select to crm_app
  using (
    exists (
      select 1 from forms f
      where f.id = form_fields.form_id and crm_private.staff_at(f.location_id)
    )
  );

drop policy if exists form_fields_write on form_fields;
create policy form_fields_write on form_fields
  for all to crm_app
  using (
    exists (
      select 1 from forms f
      where f.id = form_fields.form_id
        and (
          (select crm_private.actor_role()) = 'owner'
          or (
            (select crm_private.actor_role()) in ('school_lead', 'ops')
            and f.location_id = any (crm_private.actor_locations())
          )
        )
    )
  )
  with check (
    exists (
      select 1 from forms f
      where f.id = form_fields.form_id
        and (
          (select crm_private.actor_role()) = 'owner'
          or (
            (select crm_private.actor_role()) in ('school_lead', 'ops')
            and f.location_id = any (crm_private.actor_locations())
          )
        )
    )
  );

drop policy if exists form_documents_select on form_documents;
create policy form_documents_select on form_documents
  for select to crm_app
  using (
    exists (
      select 1 from forms f
      where f.id = form_documents.form_id and crm_private.staff_at(f.location_id)
    )
  );

drop policy if exists form_documents_write on form_documents;
create policy form_documents_write on form_documents
  for all to crm_app
  using (
    exists (
      select 1 from forms f
      where f.id = form_documents.form_id
        and (
          (select crm_private.actor_role()) = 'owner'
          or (
            (select crm_private.actor_role()) in ('school_lead', 'ops')
            and f.location_id = any (crm_private.actor_locations())
          )
        )
    )
  )
  with check (
    exists (
      select 1 from forms f
      where f.id = form_documents.form_id
        and (
          (select crm_private.actor_role()) = 'owner'
          or (
            (select crm_private.actor_role()) in ('school_lead', 'ops')
            and f.location_id = any (crm_private.actor_locations())
          )
        )
    )
  );

drop policy if exists form_plan_options_select on form_plan_options;
create policy form_plan_options_select on form_plan_options
  for select to crm_app
  using (
    exists (
      select 1 from forms f
      where f.id = form_plan_options.form_id and crm_private.staff_at(f.location_id)
    )
  );

drop policy if exists form_plan_options_write on form_plan_options;
create policy form_plan_options_write on form_plan_options
  for all to crm_app
  using (
    exists (
      select 1 from forms f
      where f.id = form_plan_options.form_id
        and (
          (select crm_private.actor_role()) = 'owner'
          or (
            (select crm_private.actor_role()) in ('school_lead', 'ops')
            and f.location_id = any (crm_private.actor_locations())
          )
        )
    )
  )
  with check (
    exists (
      select 1 from forms f
      where f.id = form_plan_options.form_id
        and (
          (select crm_private.actor_role()) = 'owner'
          or (
            (select crm_private.actor_role()) in ('school_lead', 'ops')
            and f.location_id = any (crm_private.actor_locations())
          )
        )
    )
  );

drop policy if exists form_submissions_select on form_submissions;
create policy form_submissions_select on form_submissions
  for select to crm_app
  using (
    exists (
      select 1 from forms f
      where f.id = form_submissions.form_id and crm_private.staff_at(f.location_id)
    )
  );

drop policy if exists lead_invites_select on lead_invites;
create policy lead_invites_select on lead_invites
  for select to crm_app
  using (
    exists (
      select 1 from leads l
      where l.id = lead_invites.lead_id and crm_private.staff_at(l.location_id)
    )
  );

drop policy if exists lead_invites_write on lead_invites;
create policy lead_invites_write on lead_invites
  for all to crm_app
  using (
    exists (
      select 1 from leads l
      where l.id = lead_invites.lead_id
        and (
          (select crm_private.actor_role()) = 'owner'
          or (
            (select crm_private.actor_role()) in ('school_lead', 'front_desk', 'ops')
            and l.location_id = any (crm_private.actor_locations())
          )
        )
    )
  )
  with check (
    exists (
      select 1 from leads l
      where l.id = lead_invites.lead_id
        and (
          (select crm_private.actor_role()) = 'owner'
          or (
            (select crm_private.actor_role()) in ('school_lead', 'front_desk', 'ops')
            and l.location_id = any (crm_private.actor_locations())
          )
        )
    )
  );

do $$ begin
  execute 'grant select, insert, update, delete on forms, form_fields, form_documents, form_plan_options, form_submissions, lead_invites to crm_app';
exception when undefined_object then null;
end $$;
