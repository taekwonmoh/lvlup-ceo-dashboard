-- Monthly attrition snapshots and marketing spend. Migration 016.
-- This filename sorts before 20261126000001_core.sql, so the statements run
-- only when public.locations already exists. The ordered copy is
-- 20261127000016_marketing_spend_attrition.sql.
do $wave16$
begin
  if to_regclass('public.locations') is null then
    raise notice '016 waits for the core schema';
    return;
  end if;
  execute $ddl$
-- Monthly attrition snapshots and marketing spend. Migration 016.
-- Do not apply this file to Supabase project xxyndswrierztzdbjvrd
-- or belfzlyvgjheudxhviyt, or to any other live database.
-- Local tests apply crm/migrations/016_marketing_spend_attrition.sql.
-- The ordered Supabase copy is 20261127000016_marketing_spend_attrition.sql.
-- Aggregates only. No member names, no ATA numbers, no GymDesk ids.
-- Nothing here charges a card or posts an ad-platform sync.

create table if not exists crm_marketing_spend (
  location_id text not null references locations (id),
  month_key text not null,
  channel text not null,
  amount_cents integer not null,
  note text not null default '',
  updated_by text not null default '',
  updated_at timestamptz not null default now(),
  primary key (location_id, month_key, channel),
  check (month_key ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  check (channel in ('google', 'meta', 'referrals', 'events', 'website')),
  check (amount_cents >= 0 and amount_cents <= 25000000),
  check (char_length(note) <= 200),
  check (char_length(updated_by) <= 120),
  check (note !~* 'tel:' and note !~* 'sms:'),
  check (updated_by !~* 'tel:' and updated_by !~* 'sms:')
);

create index if not exists crm_marketing_spend_month_idx
  on crm_marketing_spend (month_key);

create table if not exists crm_attrition_snapshots (
  location_id text not null references locations (id),
  month_key text not null,
  starting_active integer not null,
  new_enrollments integer not null,
  cancellations integer not null,
  reasons jsonb not null,
  tenure jsonb not null,
  channels jsonb not null,
  tuition_cents integer not null,
  avg_tenure_months numeric(5,1) not null,
  source text not null default 'manual',
  updated_at timestamptz not null default now(),
  primary key (location_id, month_key),
  check (month_key ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  check (starting_active >= 0 and starting_active <= 100000),
  check (new_enrollments >= 0 and new_enrollments <= 100000),
  check (cancellations >= 0 and cancellations <= starting_active),
  check (jsonb_typeof(reasons) = 'object'),
  check (jsonb_typeof(tenure) = 'object'),
  check (jsonb_typeof(channels) = 'object'),
  check (tuition_cents >= 0 and tuition_cents <= 1000000),
  check (avg_tenure_months >= 0 and avg_tenure_months <= 240),
  check (source in ('manual', 'calculated', 'import'))
);

create index if not exists crm_attrition_snapshots_month_idx
  on crm_attrition_snapshots (month_key);

create or replace function public.crm_growth_snapshot_ok()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  reason_keys text[] := array['schedule', 'moving', 'cost', 'lost_interest', 'medical', 'other'];
  tenure_keys text[] := array['under3', 'm3to6', 'm6to12', 'm12plus'];
  channel_keys text[] := array['google', 'meta', 'referrals', 'events', 'website'];
  key text;
  total int := 0;
  enrolled int := 0;
  leads int;
  trials int;
  joined int;
  obj jsonb;
begin
  if (select count(*) from jsonb_object_keys(new.reasons)) <> 6 then
    raise exception 'cancel reasons must list every reason';
  end if;
  foreach key in array reason_keys loop
    if not (new.reasons ? key) then
      raise exception 'cancel reasons are missing a bucket';
    end if;
    if (new.reasons ->> key) !~ '^[0-9]+$' then
      raise exception 'cancel reasons must be whole numbers';
    end if;
    total := total + (new.reasons ->> key)::int;
  end loop;
  if total <> new.cancellations then
    raise exception 'cancel reasons must add up to cancellations';
  end if;

  if (select count(*) from jsonb_object_keys(new.tenure)) <> 4 then
    raise exception 'tenure must list four buckets';
  end if;
  total := 0;
  foreach key in array tenure_keys loop
    if not (new.tenure ? key) then
      raise exception 'tenure buckets are missing one';
    end if;
    if (new.tenure ->> key) !~ '^[0-9]+$' then
      raise exception 'tenure buckets must be whole numbers';
    end if;
    total := total + (new.tenure ->> key)::int;
  end loop;
  if total <> new.cancellations then
    raise exception 'tenure buckets must add up to cancellations';
  end if;

  if (select count(*) from jsonb_object_keys(new.channels)) <> 5 then
    raise exception 'channels must list every acquisition channel';
  end if;
  foreach key in array channel_keys loop
    obj := new.channels -> key;
    if obj is null or jsonb_typeof(obj) <> 'object' then
      raise exception 'each channel needs leads, trials, and enrolled';
    end if;
    if coalesce(obj ->> 'leads', '') !~ '^[0-9]+$'
       or coalesce(obj ->> 'trials', '') !~ '^[0-9]+$'
       or coalesce(obj ->> 'enrolled', '') !~ '^[0-9]+$' then
      raise exception 'channel counts must be whole numbers';
    end if;
    leads := (obj ->> 'leads')::int;
    trials := (obj ->> 'trials')::int;
    joined := (obj ->> 'enrolled')::int;
    if leads < trials or trials < joined then
      raise exception 'channel funnel is out of order';
    end if;
    enrolled := enrolled + joined;
  end loop;
  if enrolled <> new.new_enrollments then
    raise exception 'channel enrollments must add up to new enrollments';
  end if;
  return new;
end;
$$;

drop trigger if exists crm_attrition_snapshots_ok on crm_attrition_snapshots;
create trigger crm_attrition_snapshots_ok
  before insert or update on crm_attrition_snapshots
  for each row execute function public.crm_growth_snapshot_ok();

create or replace view crm_monthly_attrition
with (security_invoker = true) as
select
  location_id,
  month_key,
  starting_active,
  new_enrollments,
  cancellations,
  case
    when starting_active = 0 then null
    else round((cancellations::numeric / starting_active) * 100, 1)
  end as attrition_pct,
  case
    when starting_active = 0 then null
    else round(100 - round((cancellations::numeric / starting_active) * 100, 1), 1)
  end as retention_pct,
  new_enrollments - cancellations as net_growth
from crm_attrition_snapshots;

comment on table crm_marketing_spend is
  'Monthly ad spend in cents by school and channel. Aggregates only. No member PII.';
comment on table crm_attrition_snapshots is
  'Monthly starting members, enrollments, and cancellations by school. Aggregates only. No member PII.';
comment on view crm_monthly_attrition is
  'Attrition percent is cancellations divided by starting active members.';

alter table crm_marketing_spend enable row level security;
alter table crm_attrition_snapshots enable row level security;

drop policy if exists crm_marketing_spend_select on crm_marketing_spend;
create policy crm_marketing_spend_select on crm_marketing_spend
  for select to crm_app
  using (crm_private.staff_at(location_id));

drop policy if exists crm_marketing_spend_write on crm_marketing_spend;
create policy crm_marketing_spend_write on crm_marketing_spend
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

drop policy if exists crm_attrition_snapshots_select on crm_attrition_snapshots;
create policy crm_attrition_snapshots_select on crm_attrition_snapshots
  for select to crm_app
  using (crm_private.staff_at(location_id));

drop policy if exists crm_attrition_snapshots_write on crm_attrition_snapshots;
create policy crm_attrition_snapshots_write on crm_attrition_snapshots
  for all to crm_app
  using ((select crm_private.actor_role()) = 'owner')
  with check ((select crm_private.actor_role()) = 'owner');

revoke all on function public.crm_growth_snapshot_ok() from public;

do $$ begin
  execute 'grant select, insert, update, delete on crm_marketing_spend, crm_attrition_snapshots to crm_app';
  execute 'grant select on crm_monthly_attrition to crm_app';
  execute 'grant execute on function public.crm_growth_snapshot_ok() to crm_app';
exception when undefined_object then null;
end $$;

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on crm_marketing_spend, crm_attrition_snapshots from anon, authenticated';
    execute 'revoke all on crm_monthly_attrition from anon, authenticated';
    execute 'revoke all on function public.crm_growth_snapshot_ok() from anon, authenticated';
  end if;
end $$;

  $ddl$;
end
$wave16$;
