-- Wave 2 area E: membership, billing preview, sold-by, and income categories.
-- Do not apply this file to Supabase project xxyndswrierztzdbjvrd
-- or belfzlyvgjheudxhviyt, or to any other live database.
-- Local tests apply crm/migrations/012_billing_soldby_categories.sql.
-- Preview and dry-run only. BILLING_CHARGES_ENABLED stays 0. QBO_ENABLED stays 0.
-- No card numbers. No phone numbers. No live GymDesk member ids.

-- ---------------------------------------------------------------------------
-- Billing can wait for the first check-in. The anchor is a shadow date.
-- ---------------------------------------------------------------------------

alter table plans add column if not exists start_on_first_checkin boolean not null default false;
alter table memberships add column if not exists billing_starts_on_first_checkin boolean not null default false;
alter table memberships add column if not exists first_checkin_at timestamptz;
alter table memberships add column if not exists ends_on date;
alter table memberships drop constraint if exists memberships_ends_on_chk;
alter table memberships add constraint memberships_ends_on_chk
  check (ends_on is null or ends_on >= started_on);

alter table memberships add column if not exists payment_profile_id uuid references payment_profiles (id);

comment on column memberships.first_checkin_at is
  'First attendance on or after started_on when billing waits for a check-in. Not a charge.';

-- ---------------------------------------------------------------------------
-- Upcoming payment edits. Undo keeps the row. Nothing here submits a charge.
-- ---------------------------------------------------------------------------

create table if not exists scheduled_payment_overrides (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references memberships (id),
  due_on date not null,
  original_amount_cents integer not null check (original_amount_cents >= 0),
  new_amount_cents integer check (new_amount_cents is null or new_amount_cents >= 0),
  new_due_on date,
  skip boolean not null default false,
  reason text,
  created_by text,
  created_at timestamptz not null default now(),
  undone_at timestamptz,
  undone_by text,
  check (reason is null or (char_length(reason) <= 500 and reason !~* 'tel:' and reason !~* 'sms:')),
  check (skip = false or (new_amount_cents is null and new_due_on is null))
);

create unique index if not exists scheduled_payment_overrides_open_uidx
  on scheduled_payment_overrides (membership_id, due_on)
  where undone_at is null;

-- ---------------------------------------------------------------------------
-- Sold-by shares. Exactly one sale pointer. Shares are basis points.
-- ---------------------------------------------------------------------------

create table if not exists sale_credits (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid references memberships (id),
  retail_purchase_id uuid references retail_purchases (id),
  event_registration_id uuid references event_registrations (id),
  staff_id uuid not null references staff_users (id),
  share_bps integer not null check (share_bps > 0 and share_bps <= 10000),
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (num_nonnulls(membership_id, retail_purchase_id, event_registration_id) = 1)
);

create index if not exists sale_credits_membership_idx on sale_credits (membership_id);
create index if not exists sale_credits_staff_idx on sale_credits (staff_id);
create index if not exists sale_credits_retail_idx on sale_credits (retail_purchase_id);
create index if not exists sale_credits_event_idx on sale_credits (event_registration_id);

create or replace function public.sale_credits_share_ok()
returns trigger
language plpgsql
set search_path = public
as $$
declare total integer;
begin
  select coalesce(sum(share_bps), 0) into total
  from sale_credits
  where id is distinct from new.id
    and (
      (new.membership_id is not null and membership_id = new.membership_id)
      or (new.retail_purchase_id is not null and retail_purchase_id = new.retail_purchase_id)
      or (new.event_registration_id is not null and event_registration_id = new.event_registration_id)
    );
  if total + new.share_bps > 10000 then
    raise exception 'sale_credit_share_cap' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists sale_credits_share_ok on sale_credits;
create trigger sale_credits_share_ok
  before insert or update on sale_credits
  for each row execute function public.sale_credits_share_ok();

revoke all on function public.sale_credits_share_ok() from public;

-- ---------------------------------------------------------------------------
-- Session credits. Separate from prepaid renewal rollover in migration 008.
-- A null sessions_per_period means the plan is not session-counted.
-- A null rollover_cap means unused credits roll without a ceiling.
-- ---------------------------------------------------------------------------

alter table plans add column if not exists sessions_per_period integer;
alter table plans add column if not exists rollover_cap integer;
alter table plans drop constraint if exists plans_sessions_per_period_chk;
alter table plans add constraint plans_sessions_per_period_chk
  check (sessions_per_period is null or sessions_per_period >= 0);
alter table plans drop constraint if exists plans_rollover_cap_chk;
alter table plans add constraint plans_rollover_cap_chk
  check (rollover_cap is null or rollover_cap >= 0);

create table if not exists session_credit_ledger (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references memberships (id),
  period_start date not null,
  granted integer not null check (granted >= 0),
  used integer not null default 0 check (used >= 0),
  rolled_in integer not null default 0 check (rolled_in >= 0),
  expired integer not null default 0 check (expired >= 0),
  updated_at timestamptz not null default now(),
  unique (membership_id, period_start),
  check (used + expired <= granted + rolled_in)
);

-- ---------------------------------------------------------------------------
-- A membership can be used at more than one school.
-- ---------------------------------------------------------------------------

create table if not exists membership_location_access (
  membership_id uuid not null references memberships (id) on delete cascade,
  location_id text not null references locations (id),
  primary key (membership_id, location_id)
);

-- ---------------------------------------------------------------------------
-- Processing fee preview. pass_through defaults off, so the fee line is 0
-- until someone turns it on. This migration does not turn it on.
-- ---------------------------------------------------------------------------

alter table merchant_accounts add column if not exists card_fee_bps integer not null default 0;
alter table merchant_accounts add column if not exists card_fee_fixed_cents integer not null default 0;
alter table merchant_accounts add column if not exists ach_fee_cents integer not null default 0;
alter table merchant_accounts add column if not exists pass_through boolean not null default false;
alter table merchant_accounts drop constraint if exists merchant_accounts_card_fee_bps_chk;
alter table merchant_accounts add constraint merchant_accounts_card_fee_bps_chk
  check (card_fee_bps between 0 and 10000);
alter table merchant_accounts drop constraint if exists merchant_accounts_card_fee_fixed_chk;
alter table merchant_accounts add constraint merchant_accounts_card_fee_fixed_chk
  check (card_fee_fixed_cents >= 0);
alter table merchant_accounts drop constraint if exists merchant_accounts_ach_fee_chk;
alter table merchant_accounts add constraint merchant_accounts_ach_fee_chk
  check (ach_fee_cents >= 0);

-- ---------------------------------------------------------------------------
-- Income categories. Codes are labels for a later export, not a live posting.
-- ---------------------------------------------------------------------------

create table if not exists income_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  qbo_account_code text,
  xero_code text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (char_length(btrim(name)) between 1 and 80),
  check (name !~* 'tel:' and name !~* 'sms:'),
  check (qbo_account_code is null or qbo_account_code ~ '^[A-Z0-9_-]{1,32}$'),
  check (xero_code is null or xero_code ~ '^[A-Z0-9_-]{1,32}$')
);

create unique index if not exists income_categories_name_uidx on income_categories (lower(name));

insert into income_categories (name, qbo_account_code, xero_code)
select v.name, v.qbo, v.xero
from (values
  ('Tuition', 'TUITION', '200'),
  ('Events', 'EVENTS', '210'),
  ('Parties', 'PARTIES', '220'),
  ('Pro shop', 'PROSHOP', '230'),
  ('Other', 'OTHER', '240')
) as v(name, qbo, xero)
where not exists (
  select 1 from income_categories c where lower(c.name) = lower(v.name)
);

alter table plans add column if not exists income_category_id uuid references income_categories (id);
alter table retail_purchases add column if not exists income_category_id uuid references income_categories (id);
alter table event_offers add column if not exists income_category_id uuid references income_categories (id);
alter table party_packages add column if not exists income_category_id uuid references income_categories (id);
alter table lesson_types add column if not exists income_category_id uuid references income_categories (id);
alter table invoice_lines add column if not exists income_category_id uuid references income_categories (id);

-- ---------------------------------------------------------------------------
-- RLS. crm_app only. No anon policy.
-- ---------------------------------------------------------------------------

alter table scheduled_payment_overrides enable row level security;
alter table sale_credits enable row level security;
alter table session_credit_ledger enable row level security;
alter table membership_location_access enable row level security;
alter table income_categories enable row level security;

drop policy if exists payment_overrides_select on scheduled_payment_overrides;
create policy payment_overrides_select on scheduled_payment_overrides
  for select to crm_app
  using (
    exists (
      select 1 from memberships ms
      where ms.id = scheduled_payment_overrides.membership_id
        and (
          (select crm_private.actor_role()) = 'owner'
          or (
            (select crm_private.actor_role()) in ('school_lead', 'front_desk', 'ops')
            and ms.location_id = any (crm_private.actor_locations())
          )
          or (
            (select crm_private.actor_role()) = 'family'
            and ms.family_id = any (crm_private.actor_families())
          )
        )
    )
  );

drop policy if exists payment_overrides_write on scheduled_payment_overrides;
create policy payment_overrides_write on scheduled_payment_overrides
  for all to crm_app
  using (
    exists (
      select 1 from memberships ms
      where ms.id = scheduled_payment_overrides.membership_id
        and (
          (select crm_private.actor_role()) = 'owner'
          or (
            (select crm_private.actor_role()) in ('school_lead', 'ops')
            and ms.location_id = any (crm_private.actor_locations())
          )
        )
    )
  )
  with check (
    exists (
      select 1 from memberships ms
      where ms.id = scheduled_payment_overrides.membership_id
        and (
          (select crm_private.actor_role()) = 'owner'
          or (
            (select crm_private.actor_role()) in ('school_lead', 'ops')
            and ms.location_id = any (crm_private.actor_locations())
          )
        )
    )
  );

drop policy if exists sale_credits_select on sale_credits;
create policy sale_credits_select on sale_credits
  for select to crm_app
  using (
    (select crm_private.actor_role()) = 'owner'
    or (select crm_private.actor_role()) in ('school_lead', 'front_desk', 'coach', 'ops')
  );

drop policy if exists sale_credits_write on sale_credits;
create policy sale_credits_write on sale_credits
  for all to crm_app
  using ((select crm_private.actor_role()) in ('owner', 'school_lead', 'ops'))
  with check ((select crm_private.actor_role()) in ('owner', 'school_lead', 'ops'));

drop policy if exists session_credit_ledger_select on session_credit_ledger;
create policy session_credit_ledger_select on session_credit_ledger
  for select to crm_app
  using (
    exists (
      select 1 from memberships ms
      where ms.id = session_credit_ledger.membership_id
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

drop policy if exists session_credit_ledger_write on session_credit_ledger;
create policy session_credit_ledger_write on session_credit_ledger
  for all to crm_app
  using (
    exists (
      select 1 from memberships ms
      where ms.id = session_credit_ledger.membership_id
        and (
          (select crm_private.actor_role()) = 'owner'
          or (
            (select crm_private.actor_role()) in ('school_lead', 'front_desk', 'ops')
            and ms.location_id = any (crm_private.actor_locations())
          )
        )
    )
  )
  with check (
    exists (
      select 1 from memberships ms
      where ms.id = session_credit_ledger.membership_id
        and (
          (select crm_private.actor_role()) = 'owner'
          or (
            (select crm_private.actor_role()) in ('school_lead', 'front_desk', 'ops')
            and ms.location_id = any (crm_private.actor_locations())
          )
        )
    )
  );

drop policy if exists membership_location_access_select on membership_location_access;
create policy membership_location_access_select on membership_location_access
  for select to crm_app
  using (
    exists (
      select 1 from memberships ms
      where ms.id = membership_location_access.membership_id
        and (
          (select crm_private.actor_role()) = 'owner'
          or (
            (select crm_private.actor_role()) in ('school_lead', 'front_desk', 'coach', 'ops')
            and (
              ms.location_id = any (crm_private.actor_locations())
              or membership_location_access.location_id = any (crm_private.actor_locations())
            )
          )
          or (
            (select crm_private.actor_role()) = 'family'
            and ms.family_id = any (crm_private.actor_families())
          )
        )
    )
  );

drop policy if exists membership_location_access_write on membership_location_access;
create policy membership_location_access_write on membership_location_access
  for all to crm_app
  using (
    exists (
      select 1 from memberships ms
      where ms.id = membership_location_access.membership_id
        and (
          (select crm_private.actor_role()) = 'owner'
          or (
            (select crm_private.actor_role()) in ('school_lead', 'ops')
            and ms.location_id = any (crm_private.actor_locations())
          )
        )
    )
  )
  with check (
    exists (
      select 1 from memberships ms
      where ms.id = membership_location_access.membership_id
        and (
          (select crm_private.actor_role()) = 'owner'
          or (
            (select crm_private.actor_role()) in ('school_lead', 'ops')
            and ms.location_id = any (crm_private.actor_locations())
          )
        )
    )
  );

drop policy if exists income_categories_select on income_categories;
create policy income_categories_select on income_categories
  for select to crm_app
  using (crm_private.staff_at(null));

drop policy if exists income_categories_write on income_categories;
create policy income_categories_write on income_categories
  for all to crm_app
  using ((select crm_private.actor_role()) = 'owner')
  with check ((select crm_private.actor_role()) = 'owner');

do $$ begin
  execute 'grant select, insert, update, delete on scheduled_payment_overrides, sale_credits, session_credit_ledger, membership_location_access, income_categories to crm_app';
exception when undefined_object then null;
end $$;

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on scheduled_payment_overrides, sale_credits, session_credit_ledger, membership_location_access, income_categories from anon, authenticated';
  end if;
end $$;
