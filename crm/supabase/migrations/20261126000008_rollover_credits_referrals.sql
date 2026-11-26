-- Prepaid rollover, tuition credits, and referrals.
-- Do not apply this file to Supabase project xxyndswrierztzdbjvrd
-- or belfzlyvgjheudxhviyt, or to any other live database.
-- Local tests apply crm/migrations/008_rollover_credits_referrals.sql.
-- No card data. No live charges. Credit amounts are cents, not a price list.

-- ---------------------------------------------------------------------------
-- Prepaid memberships can roll into a recurring draft at paid_through_on.
-- paid_through_date is that same date under the API name.
-- Cadence stored here is monthly, weekly, or every_4_weeks.
-- The API also accepts 4_weeks and writes every_4_weeks.
-- ---------------------------------------------------------------------------

alter table memberships add column if not exists rollover_enabled boolean not null default false;
alter table memberships add column if not exists rollover_cancelled boolean not null default false;
alter table memberships add column if not exists rollover_cadence text;
alter table memberships add column if not exists rollover_plan_id uuid references plans (id);
alter table memberships add column if not exists rollover_amount_cents integer;
alter table memberships add column if not exists rollover_anchor_day integer;
alter table memberships add column if not exists rollover_anchor_on date;

alter table memberships drop constraint if exists memberships_rollover_cadence_chk;
alter table memberships add constraint memberships_rollover_cadence_chk
  check (rollover_cadence is null or rollover_cadence in ('monthly', 'weekly', 'every_4_weeks'));

alter table memberships drop constraint if exists memberships_rollover_amount_chk;
alter table memberships add constraint memberships_rollover_amount_chk
  check (rollover_amount_cents is null or rollover_amount_cents >= 0);

alter table memberships drop constraint if exists memberships_rollover_anchor_day_chk;
alter table memberships add constraint memberships_rollover_anchor_day_chk
  check (rollover_anchor_day is null or rollover_anchor_day between 1 and 31);

alter table memberships drop constraint if exists memberships_rollover_enabled_chk;
alter table memberships add constraint memberships_rollover_enabled_chk
  check (rollover_enabled = false or rollover_cadence is not null);

alter table memberships drop column if exists paid_through_date;
alter table memberships add column paid_through_date date
  generated always as (paid_through_on) stored;

comment on column memberships.paid_through_on is
  'Last day the prepaid term covers. Rollover drafts start on or after this date. API name: paid_through_date.';

comment on column memberships.rollover_cancelled is
  'Opt-out. When true, no recurring draft is created after the prepaid window.';

create table if not exists billing_schedules (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null unique references memberships (id),
  cadence text not null check (cadence in ('monthly', 'weekly', 'every_4_weeks')),
  plan_id uuid references plans (id),
  amount_cents integer not null check (amount_cents >= 0),
  anchor_day integer,
  anchor_on date,
  starts_on date,
  cancelled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (anchor_day is null or anchor_day between 1 and 31)
);

comment on table billing_schedules is
  'Recurring draft created when a prepaid membership rolls over. The prepaid window itself is not billed again.';

-- ---------------------------------------------------------------------------
-- Tuition credit ledger. One row is a grant. Remaining falls as drafts use it.
-- ---------------------------------------------------------------------------

create table if not exists tuition_credits (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families (id),
  member_id uuid references members (id),
  location_id text not null references locations (id),
  amount_cents integer not null check (amount_cents > 0),
  remaining_cents integer not null check (remaining_cents >= 0),
  reason text not null check (reason in (
    'manual_staff', 'referral_reward', 'promo', 'refund_credit', 'adjustment'
  )),
  expires_on date,
  issued_by uuid references staff_users (id),
  note text,
  voided boolean not null default false,
  created_at timestamptz not null default now(),
  check (remaining_cents <= amount_cents),
  check (note is null or char_length(note) <= 500)
);

create index if not exists tuition_credits_family_idx
  on tuition_credits (family_id, expires_on nulls last, created_at);

create table if not exists tuition_credit_events (
  id uuid primary key default gen_random_uuid(),
  credit_id uuid not null references tuition_credits (id),
  family_id uuid not null references families (id),
  action text not null check (action in ('issued', 'adjusted', 'applied', 'voided')),
  amount_cents integer not null,
  remaining_cents integer not null check (remaining_cents >= 0),
  actor_email text,
  invoice_id uuid references invoices (id),
  note text,
  created_at timestamptz not null default now(),
  check (note is null or char_length(note) <= 500)
);

create index if not exists tuition_credit_events_credit_idx
  on tuition_credit_events (credit_id, created_at);

alter table invoice_lines add column if not exists credit_applied_cents integer not null default 0;
alter table invoice_lines add column if not exists charge_amount_cents integer;

alter table invoice_lines drop constraint if exists invoice_lines_credit_nonneg;
alter table invoice_lines add constraint invoice_lines_credit_nonneg
  check (credit_applied_cents >= 0);

alter table invoice_lines drop constraint if exists invoice_lines_charge_nonneg;
alter table invoice_lines add constraint invoice_lines_charge_nonneg
  check (charge_amount_cents is null or charge_amount_cents >= 0);

comment on column invoice_lines.credit_applied_cents is
  'Cents of tuition credit applied on this line. The draft total never goes below zero.';

comment on column invoice_lines.charge_amount_cents is
  'Net amount that would be charged after credits. Drafts are not submitted.';

alter table ledger_entries alter column member_id drop not null;

do $$
declare cname text;
begin
  for cname in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.ledger_entries'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%source_type%'
  loop
    execute format('alter table public.ledger_entries drop constraint %I', cname);
  end loop;
end $$;

alter table ledger_entries drop constraint if exists ledger_entries_source_type_chk;
alter table ledger_entries add constraint ledger_entries_source_type_chk
  check (source_type in (
    'membership', 'payment', 'event_registration', 'private_lesson', 'retail', 'party',
    'tuition_credit', 'referral_reward', 'rollover'
  ));

-- ---------------------------------------------------------------------------
-- Referral codes, the referral itself, and per-school or per-brand rules.
-- ---------------------------------------------------------------------------

create table if not exists referral_program_rules (
  id uuid primary key default gen_random_uuid(),
  location_id text references locations (id),
  brand brand_code,
  referrer_credit_cents integer not null default 0 check (referrer_credit_cents >= 0),
  new_family_credit_cents integer not null default 0 check (new_family_credit_cents >= 0),
  trigger_condition text not null check (trigger_condition in ('first_paid_membership', 'trial_converted')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (location_id is not null or brand is not null)
);

create unique index if not exists referral_rules_location_uidx
  on referral_program_rules (location_id)
  where location_id is not null;

create unique index if not exists referral_rules_brand_uidx
  on referral_program_rules (brand)
  where location_id is null and brand is not null;

insert into referral_program_rules (location_id, brand, referrer_credit_cents, new_family_credit_cents, trigger_condition)
select id, brand, 0, 0, 'first_paid_membership'
from locations
on conflict (location_id) where location_id is not null do nothing;

comment on table referral_program_rules is
  'Placeholder amounts are 0 until a school lead sets them. A zero rule does not issue a credit.';

create table if not exists referral_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  family_id uuid not null references families (id),
  member_id uuid references members (id),
  location_id text not null references locations (id),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (code ~ '^[A-Z0-9]{6,16}$')
);

create unique index if not exists referral_codes_code_uidx
  on referral_codes (code);

create unique index if not exists referral_codes_family_uidx
  on referral_codes (family_id)
  where member_id is null and active;

create unique index if not exists referral_codes_member_uidx
  on referral_codes (member_id)
  where member_id is not null and active;

create table if not exists referrals (
  id uuid primary key default gen_random_uuid(),
  referral_code_id uuid not null references referral_codes (id),
  referrer_family_id uuid not null references families (id),
  referrer_member_id uuid references members (id),
  referred_lead_id uuid references leads (id),
  referred_family_id uuid references families (id),
  referred_member_id uuid references members (id),
  location_id text not null references locations (id),
  status text not null default 'invited' check (status in (
    'invited', 'lead', 'trial_booked', 'converted', 'rewarded', 'voided'
  )),
  reward_credit_id uuid references tuition_credits (id),
  new_family_credit_id uuid references tuition_credits (id),
  thanks_enrollment_id uuid,
  rewarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists referrals_lead_uidx
  on referrals (referred_lead_id)
  where referred_lead_id is not null;

create index if not exists referrals_referrer_idx on referrals (referrer_family_id, status);
create index if not exists referrals_referred_idx on referrals (referred_family_id);

alter table referrals drop constraint if exists referrals_thanks_enrollment_fk;
alter table referrals
  add constraint referrals_thanks_enrollment_fk
  foreign key (thanks_enrollment_id) references automation_enrollments (id);

-- ---------------------------------------------------------------------------
-- RLS. The Worker connects as the table owner and scopes in code.
-- crm_app is what the RLS tests use. Families see their own rows.
-- Staff see the schools on their actor location list.
-- ---------------------------------------------------------------------------

alter table billing_schedules enable row level security;
alter table tuition_credits enable row level security;
alter table tuition_credit_events enable row level security;
alter table referral_program_rules enable row level security;
alter table referral_codes enable row level security;
alter table referrals enable row level security;

drop policy if exists billing_schedules_select on billing_schedules;
create policy billing_schedules_select on billing_schedules
  for select to crm_app
  using (
    exists (
      select 1 from memberships ms
      where ms.id = billing_schedules.membership_id
        and (
          (select crm_private.actor_role()) = 'owner'
          or (
            (select crm_private.actor_role()) in ('school_lead', 'front_desk', 'coach', 'ops')
            and ms.location_id = any (crm_private.actor_locations())
          )
          or (
            (select crm_private.actor_role()) = 'family'
            and ms.family_id = any (crm_private.actor_families())
          )
        )
    )
  );

drop policy if exists tuition_credits_select on tuition_credits;
create policy tuition_credits_select on tuition_credits
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

drop policy if exists tuition_credit_events_select on tuition_credit_events;
create policy tuition_credit_events_select on tuition_credit_events
  for select to crm_app
  using (
    (select crm_private.actor_role()) = 'owner'
    or (
      (select crm_private.actor_role()) = 'family'
      and family_id = any (crm_private.actor_families())
    )
    or (
      (select crm_private.actor_role()) in ('school_lead', 'front_desk', 'coach', 'ops')
      and exists (
        select 1 from tuition_credits c
        where c.id = tuition_credit_events.credit_id
          and c.location_id = any (crm_private.actor_locations())
      )
    )
  );

drop policy if exists referral_rules_select on referral_program_rules;
create policy referral_rules_select on referral_program_rules
  for select to crm_app
  using (
    (select crm_private.actor_role()) = 'owner'
    or (
      (select crm_private.actor_role()) in ('school_lead', 'front_desk', 'coach', 'ops')
      and (
        location_id = any (crm_private.actor_locations())
        or location_id is null
      )
    )
  );

drop policy if exists referral_codes_select on referral_codes;
create policy referral_codes_select on referral_codes
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

drop policy if exists referrals_select on referrals;
create policy referrals_select on referrals
  for select to crm_app
  using (
    (select crm_private.actor_role()) = 'owner'
    or (
      (select crm_private.actor_role()) in ('school_lead', 'front_desk', 'coach', 'ops')
      and location_id = any (crm_private.actor_locations())
    )
    or (
      (select crm_private.actor_role()) = 'family'
      and (
        referrer_family_id = any (crm_private.actor_families())
        or referred_family_id = any (crm_private.actor_families())
      )
    )
  );

do $$ begin
  execute 'grant select on billing_schedules, tuition_credits, tuition_credit_events, referral_program_rules, referral_codes, referrals to crm_app';
exception when undefined_object then null;
end $$;
