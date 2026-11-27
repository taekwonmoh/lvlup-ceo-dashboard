-- Pro Shop fulfillment. Migration 014.
-- This filename sorts before 20261126000001_core.sql, so the statements run
-- only when public.locations already exists. The ordered copy is
-- 20261127000014_pro_shop_fulfillment.sql.
do $wave2$
begin
  if to_regclass('public.locations') is null then
    raise notice '014 waits for the core schema';
    return;
  end if;
  execute $ddl$
-- Pro Shop catalog and fulfillment. Migration 014.
-- Do not apply this file to Supabase project xxyndswrierztzdbjvrd
-- or belfzlyvgjheudxhviyt, or to any other live database.
-- Local tests apply crm/migrations/014_pro_shop_fulfillment.sql.
-- The ordered Supabase copy is 20261127000014_pro_shop_fulfillment.sql.
-- Orders are sandbox previews. charged stays false. Nothing here takes a card.
-- No phone numbers. No tel: or sms: links.
-- These tables are separate from retail_purchases so older retail rows stay put.

-- ---------------------------------------------------------------------------
-- Catalog. An item can allow studio pickup, ship to home, or both.
-- ---------------------------------------------------------------------------

create table if not exists pro_shop_items (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  name text not null,
  brand text not null,
  category text not null,
  description text not null,
  price_cents integer not null,
  fulfillment_modes text[] not null,
  variants jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  check (sku ~ '^[a-z0-9-]{3,40}$'),
  check (brand in ('lvlup', 'goninja', 'shared')),
  check (char_length(name) between 1 and 80),
  check (char_length(category) between 1 and 40),
  check (char_length(description) between 1 and 400),
  check (price_cents >= 0),
  check (cardinality(fulfillment_modes) between 1 and 2),
  check (fulfillment_modes <@ array['studio_pickup', 'ship_to_home']::text[]),
  check ('studio_pickup' = any (fulfillment_modes) or 'ship_to_home' = any (fulfillment_modes)),
  check (jsonb_typeof(variants) = 'array'),
  check (name !~* 'tel:' and name !~* 'sms:'),
  check (description !~* 'tel:' and description !~* 'sms:'),
  check (category !~* 'tel:' and category !~* 'sms:')
);

create index if not exists pro_shop_items_active_idx
  on pro_shop_items (active, sort_order, name);

-- ---------------------------------------------------------------------------
-- Orders. Pickup and shipping use different status ladders.
-- charged and preview cannot be flipped. This build never charges.
-- ---------------------------------------------------------------------------

create table if not exists pro_shop_orders (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families (id),
  member_id uuid not null references members (id),
  location_id text not null references locations (id),
  fulfillment_method text not null,
  pickup_location_id text references locations (id),
  shipping_address jsonb,
  shipping_cents integer not null default 0,
  tracking_number text,
  fulfillment_status text not null,
  subtotal_cents integer not null,
  total_cents integer not null,
  charged boolean not null default false,
  preview boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (fulfillment_method in ('studio_pickup', 'ship_to_home')),
  check (charged = false),
  check (preview = true),
  check (subtotal_cents >= 0),
  check (total_cents >= 0),
  check (shipping_cents >= 0),
  check (total_cents = subtotal_cents + shipping_cents),
  check (
    (
      fulfillment_method = 'studio_pickup'
      and pickup_location_id is not null
      and shipping_address is null
      and shipping_cents = 0
      and tracking_number is null
      and fulfillment_status in ('ordered', 'ready_for_pickup', 'picked_up')
    )
    or (
      fulfillment_method = 'ship_to_home'
      and pickup_location_id is null
      and shipping_address is not null
      and fulfillment_status in ('ordered', 'packed', 'shipped', 'delivered')
    )
  ),
  check (
    shipping_address is null
    or (
      jsonb_typeof(shipping_address) = 'object'
      and shipping_address ? 'line1'
      and shipping_address ? 'city'
      and shipping_address ? 'region'
      and shipping_address ? 'postal'
      and not (shipping_address ? 'phone')
      and not (shipping_address ? 'tel')
      and not (shipping_address ? 'sms')
      and char_length(shipping_address->>'line1') between 1 and 120
      and char_length(shipping_address->>'city') between 1 and 80
      and shipping_address->>'region' ~ '^[A-Z]{2}$'
      and shipping_address->>'postal' ~ '^[0-9]{5}$'
      and shipping_address::text !~* 'tel:'
      and shipping_address::text !~* 'sms:'
    )
  ),
  check (
    tracking_number is null
    or (
      fulfillment_method = 'ship_to_home'
      and fulfillment_status in ('shipped', 'delivered')
      and char_length(tracking_number) between 4 and 40
      and tracking_number ~ '^[A-Za-z0-9-]+$'
    )
  )
);

create index if not exists pro_shop_orders_family_idx
  on pro_shop_orders (family_id, created_at desc);

create index if not exists pro_shop_orders_pickup_idx
  on pro_shop_orders (pickup_location_id, fulfillment_status, created_at desc);

create index if not exists pro_shop_orders_ship_idx
  on pro_shop_orders (location_id, fulfillment_method, fulfillment_status, created_at desc);

create table if not exists pro_shop_order_lines (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references pro_shop_orders (id) on delete cascade,
  item_id uuid not null references pro_shop_items (id),
  variant text,
  qty integer not null,
  unit_price_cents integer not null,
  line_cents integer not null,
  check (qty between 1 and 20),
  check (unit_price_cents >= 0),
  check (line_cents >= 0),
  check (line_cents = qty * unit_price_cents),
  check (variant is null or (char_length(variant) between 1 and 40 and variant !~* 'tel:' and variant !~* 'sms:'))
);

create index if not exists pro_shop_order_lines_order_idx
  on pro_shop_order_lines (order_id);

-- One step at a time. A new order starts at ordered. charged stays false.
create or replace function public.pro_shop_status_step()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  flow text[];
  prev int;
  nxt int;
begin
  if tg_op = 'INSERT' then
    if new.fulfillment_status <> 'ordered' then
      raise exception 'pro_shop_status_start';
    end if;
    if new.charged is distinct from false or new.preview is distinct from true then
      raise exception 'pro_shop_preview_only';
    end if;
    return new;
  end if;
  if new.fulfillment_method is distinct from old.fulfillment_method
     or new.family_id is distinct from old.family_id
     or new.member_id is distinct from old.member_id
     or new.charged is distinct from false
     or new.preview is distinct from true
  then
    raise exception 'pro_shop_locked_fields';
  end if;
  if new.fulfillment_status is distinct from old.fulfillment_status then
    flow := case new.fulfillment_method
      when 'studio_pickup' then array['ordered', 'ready_for_pickup', 'picked_up']
      else array['ordered', 'packed', 'shipped', 'delivered']
    end;
    prev := array_position(flow, old.fulfillment_status);
    nxt := array_position(flow, new.fulfillment_status);
    if prev is null or nxt is null or nxt <> prev + 1 then
      raise exception 'pro_shop_status_step';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists pro_shop_orders_status_step on pro_shop_orders;
create trigger pro_shop_orders_status_step
  before insert or update on pro_shop_orders
  for each row execute function public.pro_shop_status_step();

create or replace function public.pro_shop_line_ok()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  method text;
  modes text[];
  variants jsonb;
  price_cents integer;
begin
  select o.fulfillment_method into method
  from pro_shop_orders o
  where o.id = new.order_id;
  select i.fulfillment_modes, i.variants, i.price_cents
    into modes, variants, price_cents
  from pro_shop_items i
  where i.id = new.item_id;
  if method is null or modes is null or not (method = any (modes)) then
    raise exception 'pro_shop_mode_not_allowed';
  end if;
  if price_cents is null or new.unit_price_cents <> price_cents then
    raise exception 'pro_shop_price_mismatch';
  end if;
  if variants is not null and jsonb_typeof(variants) = 'array' and jsonb_array_length(variants) > 0 then
    if new.variant is null or not (variants ? new.variant) then
      raise exception 'pro_shop_bad_variant';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists pro_shop_order_lines_ok on pro_shop_order_lines;
create trigger pro_shop_order_lines_ok
  before insert or update on pro_shop_order_lines
  for each row execute function public.pro_shop_line_ok();

revoke all on function public.pro_shop_status_step() from public;
revoke all on function public.pro_shop_line_ok() from public;

-- ---------------------------------------------------------------------------
-- Sample gear. Fictional catalog. Both pickup and ship to home.
-- ---------------------------------------------------------------------------

insert into pro_shop_items (sku, name, brand, category, description, price_cents, fulfillment_modes, variants, sort_order)
select v.sku, v.name, v.brand, v.category, v.description, v.price_cents, v.modes, v.variants::jsonb, v.sort_order
from (values
  ('uniform-dobok', 'Uniform (Dobok)', 'shared', 'Uniforms', 'White training uniform for class.', 5500, array['studio_pickup', 'ship_to_home']::text[], '["YS","YM","YL","AS","AM","AL"]', 1),
  ('sparring-kit', 'Sparring Gear Kit', 'shared', 'Gear', 'Headgear, gloves, and boots sold as one kit.', 8900, array['studio_pickup', 'ship_to_home']::text[], '["Child","Youth","Adult"]', 2),
  ('bo-staff', 'Bo Staff', 'shared', 'Weapons', 'A tapered bo staff for forms.', 3500, array['studio_pickup', 'ship_to_home']::text[], '["4 foot","5 foot","6 foot"]', 3),
  ('lvlup-hoodie', 'LVLUP Hoodie', 'lvlup', 'Apparel', 'A warm LVLUP hoodie for outside the mat.', 4500, array['studio_pickup', 'ship_to_home']::text[], '["YS","YM","YL","AS","AM","AL"]', 4),
  ('goninja-grip-socks', 'Go Ninja Grip Socks', 'goninja', 'Apparel', 'Grip socks for Go Ninja training.', 1200, array['studio_pickup', 'ship_to_home']::text[], '["XS","S","M","L"]', 5)
) as v(sku, name, brand, category, description, price_cents, modes, variants, sort_order)
where not exists (select 1 from pro_shop_items i where i.sku = v.sku);

-- ---------------------------------------------------------------------------
-- RLS. crm_app only. No anon policy. The worker still scopes in code.
-- ---------------------------------------------------------------------------

alter table pro_shop_items enable row level security;
alter table pro_shop_orders enable row level security;
alter table pro_shop_order_lines enable row level security;

drop policy if exists pro_shop_items_select on pro_shop_items;
create policy pro_shop_items_select on pro_shop_items
  for select to crm_app
  using (
    (select crm_private.actor_role()) in ('owner', 'school_lead', 'front_desk', 'coach', 'ops', 'family')
  );

drop policy if exists pro_shop_items_write on pro_shop_items;
create policy pro_shop_items_write on pro_shop_items
  for all to crm_app
  using ((select crm_private.actor_role()) = 'owner')
  with check ((select crm_private.actor_role()) = 'owner');

drop policy if exists pro_shop_orders_select on pro_shop_orders;
create policy pro_shop_orders_select on pro_shop_orders
  for select to crm_app
  using (
    (select crm_private.actor_role()) = 'owner'
    or crm_private.staff_at(location_id)
    or (pickup_location_id is not null and crm_private.staff_at(pickup_location_id))
    or (
      (select crm_private.actor_role()) = 'family'
      and family_id = any (crm_private.actor_families())
    )
  );

drop policy if exists pro_shop_orders_insert on pro_shop_orders;
create policy pro_shop_orders_insert on pro_shop_orders
  for insert to crm_app
  with check (
    charged = false
    and preview = true
    and fulfillment_status = 'ordered'
    and (
      (select crm_private.actor_role()) = 'owner'
      or crm_private.staff_at(location_id)
      or (
        (select crm_private.actor_role()) = 'family'
        and family_id = any (crm_private.actor_families())
      )
    )
  );

drop policy if exists pro_shop_orders_update on pro_shop_orders;
create policy pro_shop_orders_update on pro_shop_orders
  for update to crm_app
  using (
    (select crm_private.actor_role()) = 'owner'
    or crm_private.staff_at(location_id)
    or (pickup_location_id is not null and crm_private.staff_at(pickup_location_id))
  )
  with check (
    charged = false
    and preview = true
    and (
      (select crm_private.actor_role()) = 'owner'
      or crm_private.staff_at(location_id)
      or (pickup_location_id is not null and crm_private.staff_at(pickup_location_id))
    )
  );

drop policy if exists pro_shop_lines_select on pro_shop_order_lines;
create policy pro_shop_lines_select on pro_shop_order_lines
  for select to crm_app
  using (
    exists (
      select 1 from pro_shop_orders o
      where o.id = pro_shop_order_lines.order_id
        and (
          (select crm_private.actor_role()) = 'owner'
          or crm_private.staff_at(o.location_id)
          or (o.pickup_location_id is not null and crm_private.staff_at(o.pickup_location_id))
          or (
            (select crm_private.actor_role()) = 'family'
            and o.family_id = any (crm_private.actor_families())
          )
        )
    )
  );

drop policy if exists pro_shop_lines_insert on pro_shop_order_lines;
create policy pro_shop_lines_insert on pro_shop_order_lines
  for insert to crm_app
  with check (
    exists (
      select 1 from pro_shop_orders o
      where o.id = pro_shop_order_lines.order_id
        and o.charged = false
        and o.preview = true
        and (
          (select crm_private.actor_role()) = 'owner'
          or crm_private.staff_at(o.location_id)
          or (
            (select crm_private.actor_role()) = 'family'
            and o.family_id = any (crm_private.actor_families())
          )
        )
    )
  );

do $$ begin
  execute 'grant select, insert, update, delete on pro_shop_items, pro_shop_orders, pro_shop_order_lines to crm_app';
  execute 'grant execute on function public.pro_shop_status_step() to crm_app';
  execute 'grant execute on function public.pro_shop_line_ok() to crm_app';
exception when undefined_object then null;
end $$;

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on pro_shop_items, pro_shop_orders, pro_shop_order_lines from anon, authenticated';
    execute 'revoke all on function public.pro_shop_status_step() from anon, authenticated';
    execute 'revoke all on function public.pro_shop_line_ok() from anon, authenticated';
  end if;
end $$;

comment on table pro_shop_orders is
  'Sandbox Pro Shop orders. studio_pickup or ship_to_home. charged is always false.';

  $ddl$;
end
$wave2$;
