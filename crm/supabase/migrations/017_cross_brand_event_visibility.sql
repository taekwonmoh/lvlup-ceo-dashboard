-- Cross-brand member-portal visibility for events.
-- Migration 017, beside 017_growth_desk.sql. Do not apply either file to a live database.
-- The ordered Supabase copy is 20261127000019_cross_brand_event_visibility.sql
-- so it runs after the events table exists. This file is idempotent and skips
-- the table changes when public.events is not there yet.
-- RLS stays enabled. No anon or authenticated policy is added.
-- The Worker uses the service role and enforces access itself.
-- Go Ninja Summer Camps and Parents' Night Out at goninjaW and goninjaV
-- default to visible in the LVLUP member portal.
-- No phone numbers. No ATA numbers. No GymDesk ids. Belt tests stay at $0.

create or replace function crm_default_show_in_lvlup_member_portal(p_location_id text, p_event_type text)
returns boolean
language sql
immutable
as $$
  select coalesce(
    p_location_id in ('goninjaW', 'goninjaV')
    and lower(replace(btrim(coalesce(p_event_type, '')), '''', '')) in (
      'camp',
      'summer_camp',
      'summer camp',
      'pno',
      'parents_night_out',
      'parents night out',
      'parents night'
    ),
    false
  );
$$;

create or replace function crm_event_visible_brands(p_location_id text, p_show boolean)
returns text[]
language sql
immutable
as $$
  select case
    when p_location_id in ('goninjaW', 'goninjaV') and p_show is true
      then array['goninja', 'lvlup']::text[]
    when p_location_id in ('goninjaW', 'goninjaV')
      then array['goninja']::text[]
    else array['lvlup']::text[]
  end;
$$;

create or replace function crm_events_apply_portal_visibility()
returns trigger
language plpgsql
as $$
begin
  if new.show_in_lvlup_member_portal is null then
    new.show_in_lvlup_member_portal :=
      crm_default_show_in_lvlup_member_portal(new.location_id, new.event_type);
  end if;
  new.visible_to_brands :=
    crm_event_visible_brands(new.location_id, new.show_in_lvlup_member_portal);
  return new;
end;
$$;

comment on function crm_default_show_in_lvlup_member_portal(text, text) is
  'True for Summer Camp and Parents Night Out hosted at Go Ninja Waunakee or Go Ninja Verona.';

comment on function crm_event_visible_brands(text, boolean) is
  'Host brand, plus lvlup when a Go Ninja event is shown in the LVLUP member portal.';

do $cross_brand$
begin
  if to_regclass('public.events') is null then
    return;
  end if;

  execute 'alter table events add column if not exists show_in_lvlup_member_portal boolean';
  execute 'alter table events add column if not exists visible_to_brands text[]';

  execute 'alter table events drop constraint if exists events_event_type_check';
  execute $check$
    alter table events add constraint events_event_type_check check (event_type in (
      'camp', 'summer_camp', 'tournament', 'clinic', 'seminar', 'party',
      'pno', 'parents_night_out', 'belt_test', 'other'
    ))
  $check$;

  execute 'drop trigger if exists events_portal_visibility on events';
  execute $trig$
    create trigger events_portal_visibility
    before insert or update on events
    for each row
    execute function crm_events_apply_portal_visibility()
  $trig$;

  -- Nulls pick up the helper. A later run does not turn an explicit false back on.
  execute $fill$
    update events
    set show_in_lvlup_member_portal = show_in_lvlup_member_portal
    where show_in_lvlup_member_portal is null
       or visible_to_brands is null
  $fill$;

  execute 'alter table events alter column show_in_lvlup_member_portal set not null';
  execute 'alter table events alter column visible_to_brands set not null';

  execute 'alter table events drop constraint if exists events_visible_to_brands_check';
  execute $brands$
    alter table events add constraint events_visible_to_brands_check check (
      visible_to_brands <@ array['goninja', 'lvlup']::text[]
      and cardinality(visible_to_brands) between 1 and 2
      and visible_to_brands @> (
        case
          when location_id in ('goninjaW', 'goninjaV') then array['goninja']::text[]
          else array['lvlup']::text[]
        end
      )
      and (
        coalesce(location_id, '') not in ('goninjaW', 'goninjaV')
        or (('lvlup' = any (visible_to_brands)) = show_in_lvlup_member_portal)
      )
    )
  $brands$;

  execute 'create index if not exists events_lvlup_portal_idx on events (starts_on) where show_in_lvlup_member_portal';

  execute $comment_flag$
    comment on column events.show_in_lvlup_member_portal is
      'When true, a Go Ninja event is listed in the LVLUP member portal. Summer camps and parents night out at goninjaW and goninjaV default to true.'
  $comment_flag$;
  execute $comment_brands$
    comment on column events.visible_to_brands is
      'Brand portals that list this event. Host brand is always included. lvlup is added for a flagged Go Ninja event.'
  $comment_brands$;

  -- Keep the existing posture: RLS on, and no client policy.
  execute 'alter table events enable row level security';

  insert into events (location_id, name, event_type, purpose, starts_on, ends_on, capacity)
  select v.location_id, v.name, v.event_type, 'profit', v.starts_on, v.ends_on, v.capacity
  from (
    values
      ('goninjaW'::text, 'Summer Camp'::text, 'summer_camp'::text, date '2027-06-14', date '2027-06-18', 24),
      ('goninjaV'::text, 'Summer Camp'::text, 'summer_camp'::text, date '2027-06-21', date '2027-06-25', 20),
      ('goninjaW'::text, 'Parents Night Out'::text, 'pno'::text, date '2026-12-11', date '2026-12-11', 16),
      ('goninjaV'::text, 'Parents Night Out'::text, 'pno'::text, date '2026-12-18', date '2026-12-18', 16)
  ) as v(location_id, name, event_type, starts_on, ends_on, capacity)
  where exists (select 1 from locations l where l.id = v.location_id)
    and not exists (
      select 1 from events e
      where e.location_id = v.location_id
        and e.name = v.name
        and e.starts_on = v.starts_on
    );
end
$cross_brand$;
