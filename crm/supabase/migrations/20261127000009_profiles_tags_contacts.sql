-- Wave 1 areas A and B: names, contacts, notes, photos, statuses, tags.
-- Do not apply this file to Supabase project xxyndswrierztzdbjvrd
-- or belfzlyvgjheudxhviyt, or to any other live database.
-- Local tests apply crm/migrations/009_profiles_tags_contacts.sql.
-- No card data. No sample phone numbers. No live charges.

-- ---------------------------------------------------------------------------
-- Separate first and last names. The old single-name columns stay.
-- ---------------------------------------------------------------------------

alter table leads add column if not exists first_name text;
alter table leads add column if not exists last_name text;
alter table leads add column if not exists guardian_first_name text;
alter table leads add column if not exists guardian_last_name text;

alter table lead_waivers add column if not exists first_name text;
alter table lead_waivers add column if not exists last_name text;
alter table lead_waivers add column if not exists guardian_first_name text;
alter table lead_waivers add column if not exists guardian_last_name text;
alter table lead_waivers add column if not exists signature_data text;
alter table lead_waivers add column if not exists signed_by_guardian_name text;

alter table lead_waivers drop constraint if exists lead_waivers_signature_chk;
alter table lead_waivers add constraint lead_waivers_signature_chk
  check (
    signature_data is null
    or (
      char_length(signature_data) between 1 and 200000
      and signature_data !~* '^https?://'
      and signature_data !~* 'tel:'
      and signature_data !~* 'sms:'
    )
  );

create or replace function public.backfill_person_names()
returns void
language plpgsql
set search_path = public
as $$
begin
  update leads
  set
    first_name = coalesce(
      nullif(btrim(first_name), ''),
      nullif(split_part(btrim(coalesce(child_name, '')), ' ', 1), '')
    ),
    last_name = coalesce(
      nullif(btrim(last_name), ''),
      case
        when btrim(coalesce(child_name, '')) like '% %'
          then nullif(btrim(substr(btrim(child_name), position(' ' in btrim(child_name)) + 1)), '')
        else last_name
      end
    ),
    guardian_first_name = coalesce(
      nullif(btrim(guardian_first_name), ''),
      nullif(split_part(btrim(guardian_name), ' ', 1), '')
    ),
    guardian_last_name = coalesce(
      nullif(btrim(guardian_last_name), ''),
      case
        when btrim(guardian_name) like '% %'
          then nullif(btrim(substr(btrim(guardian_name), position(' ' in btrim(guardian_name)) + 1)), '')
        else guardian_last_name
      end
    );

  update lead_waivers
  set
    signed_by_guardian_name = coalesce(nullif(btrim(signed_by_guardian_name), ''), signer_name),
    guardian_first_name = coalesce(
      nullif(btrim(guardian_first_name), ''),
      nullif(split_part(btrim(signer_name), ' ', 1), '')
    ),
    guardian_last_name = coalesce(
      nullif(btrim(guardian_last_name), ''),
      case
        when btrim(signer_name) like '% %'
          then nullif(btrim(substr(btrim(signer_name), position(' ' in btrim(signer_name)) + 1)), '')
        else guardian_last_name
      end
    );
end;
$$;

select public.backfill_person_names();

revoke all on function public.backfill_person_names() from public;
do $$ begin
  execute 'revoke all on function public.backfill_person_names() from anon, authenticated';
exception when undefined_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- Contacts label and emergency / pickup contacts.
-- ---------------------------------------------------------------------------

alter table locations add column if not exists contacts_label text not null default 'Emergency contacts';

alter table locations drop constraint if exists locations_contacts_label_chk;
alter table locations add constraint locations_contacts_label_chk
  check (
    char_length(btrim(contacts_label)) between 1 and 80
    and contacts_label !~* 'tel:'
    and contacts_label !~* 'sms:'
  );

create table if not exists member_contacts (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families (id),
  member_id uuid references members (id),
  kind text not null check (kind in ('emergency', 'pickup', 'other')),
  label text,
  first_name text not null,
  last_name text not null,
  phone text,
  email text,
  relationship text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (char_length(btrim(first_name)) between 1 and 80),
  check (char_length(btrim(last_name)) between 1 and 80),
  check (label is null or (char_length(label) <= 80 and label !~* 'tel:' and label !~* 'sms:')),
  check (phone is null or (char_length(phone) <= 40 and phone !~* 'tel:' and phone !~* 'sms:')),
  check (email is null or char_length(email) <= 200),
  check (relationship is null or char_length(relationship) <= 80)
);

create index if not exists member_contacts_family_idx on member_contacts (family_id, sort_order, id);
create index if not exists member_contacts_member_idx on member_contacts (member_id);

comment on table member_contacts is
  'Staff-entered emergency, pickup, and other contacts. Phone stays off public forms.';

-- ---------------------------------------------------------------------------
-- Pinned notes. Soft delete only. At most 3 pinned notes per subject.
-- ---------------------------------------------------------------------------

create table if not exists member_notes (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references members (id),
  lead_id uuid references leads (id),
  family_id uuid references families (id),
  body text not null,
  author_staff_id uuid references staff_users (id),
  pinned boolean not null default false,
  pinned_at timestamptz,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (num_nonnulls(member_id, lead_id, family_id) = 1),
  check (char_length(btrim(body)) between 1 and 4000),
  check (body !~* 'tel:' and body !~* 'sms:'),
  check (pinned = false or pinned_at is not null)
);

create index if not exists member_notes_member_idx on member_notes (member_id, pinned desc, created_at desc);
create index if not exists member_notes_lead_idx on member_notes (lead_id, pinned desc, created_at desc);
create index if not exists member_notes_family_idx on member_notes (family_id, pinned desc, created_at desc);

create or replace function public.enforce_pinned_note_cap()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  pinned_count integer;
begin
  if new.pinned then
    if new.pinned_at is null then
      new.pinned_at := now();
    end if;
  else
    new.pinned_at := null;
  end if;
  if new.pinned and new.deleted_at is null then
    select count(*) into pinned_count
    from member_notes
    where pinned = true
      and deleted_at is null
      and id is distinct from new.id
      and (
        (new.member_id is not null and member_id = new.member_id)
        or (new.lead_id is not null and lead_id = new.lead_id)
        or (new.family_id is not null and family_id = new.family_id)
      );
    if pinned_count >= 3 then
      raise exception 'pinned_note_cap' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists member_notes_pin_cap on member_notes;
create trigger member_notes_pin_cap
  before insert or update on member_notes
  for each row execute function public.enforce_pinned_note_cap();

revoke all on function public.enforce_pinned_note_cap() from public;
do $$ begin
  execute 'revoke all on function public.enforce_pinned_note_cap() from anon, authenticated';
exception when undefined_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- Private member photo path. The API signs upload and view URLs.
-- ---------------------------------------------------------------------------

alter table members add column if not exists photo_storage_path text;
alter table members add column if not exists photo_updated_at timestamptz;

alter table members drop constraint if exists members_photo_path_chk;
alter table members add constraint members_photo_path_chk
  check (
    photo_storage_path is null
    or (
      photo_storage_path !~* 'https?://'
      and photo_storage_path !~* 'tel:'
      and photo_storage_path !~* 'sms:'
      and photo_storage_path !~* '/object/public/'
      and char_length(photo_storage_path) <= 300
    )
  );

-- ---------------------------------------------------------------------------
-- Custom statuses. members.status / leads.status stay the billing enums.
-- ---------------------------------------------------------------------------

create table if not exists custom_statuses (
  id uuid primary key default gen_random_uuid(),
  location_id text not null references locations (id),
  applies_to text not null check (applies_to in ('member', 'lead')),
  name text not null,
  color text,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (char_length(btrim(name)) between 1 and 60),
  check (color is null or color ~ '^#[0-9A-Fa-f]{6}$')
);

create unique index if not exists custom_statuses_name_uidx
  on custom_statuses (location_id, applies_to, lower(name));

alter table members add column if not exists custom_status_id uuid references custom_statuses (id) on delete set null;
alter table leads add column if not exists custom_status_id uuid references custom_statuses (id) on delete set null;

create index if not exists members_custom_status_idx on members (custom_status_id);
create index if not exists leads_custom_status_idx on leads (custom_status_id);

-- ---------------------------------------------------------------------------
-- Tags, groups, and the entity link used by staff, bulk, tasks, and automations.
-- ---------------------------------------------------------------------------

create table if not exists tags (
  id uuid primary key default gen_random_uuid(),
  location_id text references locations (id),
  name text not null,
  group_name text,
  color text,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  check (char_length(btrim(name)) between 1 and 60),
  check (name !~* 'tel:' and name !~* 'sms:'),
  check (group_name is null or char_length(group_name) <= 60),
  check (color is null or color ~ '^#[0-9A-Fa-f]{6}$')
);

create unique index if not exists tags_name_location_uidx
  on tags (lower(name), coalesce(location_id, ''));

create index if not exists tags_location_idx on tags (location_id, archived, name);

create table if not exists entity_tags (
  id uuid primary key default gen_random_uuid(),
  tag_id uuid not null references tags (id),
  member_id uuid references members (id),
  lead_id uuid references leads (id),
  family_id uuid references families (id),
  added_by uuid references staff_users (id),
  source text not null check (source in ('staff', 'automation', 'bulk', 'task', 'form')),
  created_at timestamptz not null default now(),
  check (num_nonnulls(member_id, lead_id, family_id) = 1)
);

create unique index if not exists entity_tags_member_uidx
  on entity_tags (tag_id, member_id) where member_id is not null;
create unique index if not exists entity_tags_lead_uidx
  on entity_tags (tag_id, lead_id) where lead_id is not null;
create unique index if not exists entity_tags_family_uidx
  on entity_tags (tag_id, family_id) where family_id is not null;

create index if not exists entity_tags_member_idx on entity_tags (member_id);
create index if not exists entity_tags_lead_idx on entity_tags (lead_id);
create index if not exists entity_tags_family_idx on entity_tags (family_id);
create index if not exists entity_tags_tag_idx on entity_tags (tag_id);

alter table task_definitions add column if not exists tag_ids_add uuid[] not null default '{}';
alter table task_definitions add column if not exists tag_ids_remove uuid[] not null default '{}';
alter table task_completions add column if not exists tag_ids_add uuid[] not null default '{}';
alter table task_completions add column if not exists tag_ids_remove uuid[] not null default '{}';

-- ---------------------------------------------------------------------------
-- RLS helpers and policies. crm_app is the test role. The Worker uses the owner.
-- ---------------------------------------------------------------------------

create or replace function crm_private.can_read_note(p_member uuid, p_lead uuid, p_family uuid)
returns boolean
language sql
stable
security definer
set search_path = crm_private, public
as $$
  select (select crm_private.actor_role()) = 'owner'
  or (
    (select crm_private.actor_role()) in ('school_lead', 'front_desk', 'coach', 'ops')
    and (
      (p_member is not null and exists (
        select 1 from public.members m
        where m.id = p_member and m.location_id = any (crm_private.actor_locations())
      ))
      or (p_lead is not null and exists (
        select 1 from public.leads l
        where l.id = p_lead and l.location_id = any (crm_private.actor_locations())
      ))
      or (p_family is not null and exists (
        select 1 from public.members m
        where m.family_id = p_family and m.location_id = any (crm_private.actor_locations())
      ))
    )
  )
  or (
    (select crm_private.actor_role()) = 'family'
    and (
      (p_family is not null and p_family = any (crm_private.actor_families()))
      or (p_member is not null and exists (
        select 1 from public.members m
        where m.id = p_member and m.family_id = any (crm_private.actor_families())
      ))
    )
  );
$$;

create or replace function crm_private.can_write_note(p_member uuid, p_lead uuid, p_family uuid)
returns boolean
language sql
stable
security definer
set search_path = crm_private, public
as $$
  select (select crm_private.actor_role()) = 'owner'
  or (
    (select crm_private.actor_role()) in ('school_lead', 'front_desk', 'coach', 'ops')
    and crm_private.can_read_note(p_member, p_lead, p_family)
  );
$$;

create or replace function crm_private.staff_at(p_location text)
returns boolean
language sql
stable
security definer
set search_path = crm_private, public
as $$
  select (select crm_private.actor_role()) = 'owner'
    or (
      (select crm_private.actor_role()) in ('school_lead', 'front_desk', 'coach', 'ops')
      and (
        p_location is null
        or p_location = any (crm_private.actor_locations())
      )
    );
$$;

revoke all on function crm_private.can_read_note(uuid, uuid, uuid) from public;
revoke all on function crm_private.can_write_note(uuid, uuid, uuid) from public;
revoke all on function crm_private.staff_at(text) from public;

do $$ begin
  execute 'grant execute on function crm_private.can_read_note(uuid, uuid, uuid) to crm_app';
  execute 'grant execute on function crm_private.can_write_note(uuid, uuid, uuid) to crm_app';
  execute 'grant execute on function crm_private.staff_at(text) to crm_app';
exception when undefined_object then null;
end $$;

alter table member_contacts enable row level security;
alter table member_notes enable row level security;
alter table custom_statuses enable row level security;
alter table tags enable row level security;
alter table entity_tags enable row level security;

drop policy if exists member_contacts_select on member_contacts;
create policy member_contacts_select on member_contacts
  for select to crm_app
  using (
    (select crm_private.actor_role()) = 'owner'
    or (
      (select crm_private.actor_role()) in ('school_lead', 'front_desk', 'coach', 'ops')
      and exists (
        select 1 from members m
        where m.family_id = member_contacts.family_id
          and m.location_id = any (crm_private.actor_locations())
      )
    )
    or (
      (select crm_private.actor_role()) = 'family'
      and family_id = any (crm_private.actor_families())
    )
  );

drop policy if exists member_contacts_write on member_contacts;
create policy member_contacts_write on member_contacts
  for all to crm_app
  using (
    (select crm_private.actor_role()) = 'owner'
    or (
      (select crm_private.actor_role()) in ('school_lead', 'front_desk', 'ops')
      and exists (
        select 1 from members m
        where m.family_id = member_contacts.family_id
          and m.location_id = any (crm_private.actor_locations())
      )
    )
  )
  with check (
    (select crm_private.actor_role()) = 'owner'
    or (
      (select crm_private.actor_role()) in ('school_lead', 'front_desk', 'ops')
      and exists (
        select 1 from members m
        where m.family_id = member_contacts.family_id
          and m.location_id = any (crm_private.actor_locations())
      )
    )
  );

drop policy if exists member_notes_select on member_notes;
create policy member_notes_select on member_notes
  for select to crm_app
  using (deleted_at is null and crm_private.can_read_note(member_id, lead_id, family_id));

drop policy if exists member_notes_insert on member_notes;
create policy member_notes_insert on member_notes
  for insert to crm_app
  with check (crm_private.can_write_note(member_id, lead_id, family_id));

drop policy if exists member_notes_update on member_notes;
create policy member_notes_update on member_notes
  for update to crm_app
  using (crm_private.can_write_note(member_id, lead_id, family_id))
  with check (crm_private.can_write_note(member_id, lead_id, family_id));

drop policy if exists custom_statuses_select on custom_statuses;
create policy custom_statuses_select on custom_statuses
  for select to crm_app
  using (crm_private.staff_at(location_id));

drop policy if exists custom_statuses_write on custom_statuses;
create policy custom_statuses_write on custom_statuses
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

drop policy if exists tags_select on tags;
create policy tags_select on tags
  for select to crm_app
  using (crm_private.staff_at(location_id));

drop policy if exists tags_write on tags;
create policy tags_write on tags
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

drop policy if exists entity_tags_select on entity_tags;
create policy entity_tags_select on entity_tags
  for select to crm_app
  using (crm_private.can_read_note(member_id, lead_id, family_id));

drop policy if exists entity_tags_write on entity_tags;
create policy entity_tags_write on entity_tags
  for all to crm_app
  using (crm_private.can_write_note(member_id, lead_id, family_id))
  with check (crm_private.can_write_note(member_id, lead_id, family_id));

do $$ begin
  execute 'grant select, insert, update, delete on member_contacts, member_notes, custom_statuses, tags, entity_tags to crm_app';
exception when undefined_object then null;
end $$;
