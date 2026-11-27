/**
 * Pro Shop catalog and fulfillment.
 * Orders are sandbox previews. This module never charges a card.
 */
import type { Actor } from './auth.ts';
import { canSeeLocation } from './auth.ts';
import { findCardPayload } from './charge-gate.ts';
import { CrmError } from './errors.ts';
import { assertUuid, type SqlPool } from './query.ts';

export const PRO_SHOP_SHIPPING_CENTS = 800;

export const LOCATION_NAMES: Record<string, string> = {
  waunakee: 'Waunakee',
  eastmad: 'East Madison',
  verona: 'Verona',
  deforest: 'DeForest',
  goninjaW: 'Go Ninja Waunakee',
  goninjaV: 'Go Ninja Verona',
};

const PICKUP_FLOW = ['ordered', 'ready_for_pickup', 'picked_up'] as const;
const SHIP_FLOW = ['ordered', 'packed', 'shipped', 'delivered'] as const;

const ACTION_STATUS: Record<string, string> = {
  mark_ready: 'ready_for_pickup',
  ready_for_pickup: 'ready_for_pickup',
  mark_picked_up: 'picked_up',
  handed_to_family: 'picked_up',
  picked_up: 'picked_up',
  mark_packed: 'packed',
  packed: 'packed',
  mark_shipped: 'shipped',
  shipped: 'shipped',
  mark_delivered: 'delivered',
  delivered: 'delivered',
};

export const FULFILLMENT_ACTION_LABEL: Record<string, string> = {
  ready_for_pickup: 'Mark Ready for Pickup',
  picked_up: 'Mark Picked Up',
  packed: 'Mark Packed',
  shipped: 'Mark Shipped',
  delivered: 'Mark Delivered',
};

export type ProShopEnv = { BILLING_CHARGES_ENABLED?: string };

type OrderRow = {
  id: string;
  family_id: string;
  member_id: string;
  location_id: string;
  fulfillment_method: 'studio_pickup' | 'ship_to_home';
  pickup_location_id: string | null;
  shipping_address: Record<string, string> | null;
  shipping_cents: number;
  tracking_number: string | null;
  fulfillment_status: string;
  subtotal_cents: number;
  total_cents: number;
  charged: boolean;
  preview: boolean;
  created_at: string;
  lines: Array<Record<string, unknown>>;
};

export function isPublicProShopPath(method: string, parts: string[]): boolean {
  return method === 'GET' && parts[0] === 'v1' && parts[1] === 'pro-shop' && parts[2] === 'items' && parts.length === 3;
}

export function isProShopPath(method: string, parts: string[]): boolean {
  if (parts[0] !== 'v1' || parts[1] !== 'pro-shop') return false;
  if (parts[2] === 'items' && method === 'GET' && parts.length === 3) return true;
  if (parts[2] === 'orders' && method === 'GET' && parts.length === 3) return true;
  if (parts[2] === 'orders' && method === 'POST' && parts.length === 3) return true;
  if (parts[2] === 'orders' && method === 'PATCH' && parts[4] === 'fulfillment' && parts.length === 5) return true;
  return false;
}

export function nextFulfillmentStatus(method: string, status: string): string | null {
  const flow = method === 'studio_pickup' ? PICKUP_FLOW : SHIP_FLOW;
  const index = flow.indexOf(status as never);
  if (index < 0 || index >= flow.length - 1) return null;
  return flow[index + 1];
}

export function orderStatusLabel(order: {
  fulfillmentMethod: string;
  fulfillmentStatus: string;
  pickupLocationId?: string | null;
  trackingNumber?: string | null;
}): string {
  if (order.fulfillmentMethod === 'studio_pickup') {
    const place = LOCATION_NAMES[order.pickupLocationId || ''] || 'the studio';
    if (order.fulfillmentStatus === 'ready_for_pickup') return `Ready for pickup at ${place}`;
    if (order.fulfillmentStatus === 'picked_up') return `Picked up at ${place}`;
    return `Ordered for pickup at ${place}`;
  }
  if (order.fulfillmentStatus === 'packed') return 'Packed';
  if (order.fulfillmentStatus === 'shipped') {
    return order.trackingNumber ? `Shipped · ${order.trackingNumber}` : 'Shipped';
  }
  if (order.fulfillmentStatus === 'delivered') return 'Delivered';
  return 'Ordered';
}

function chargesEnabled(env: ProShopEnv) {
  return env.BILLING_CHARGES_ENABLED === '1';
}

function rejectUnsafe(body: Record<string, unknown>) {
  if (findCardPayload(body)) {
    throw new CrmError(400, 'card_not_allowed', 'Card numbers are not accepted. Use Accept.js.');
  }
  const banned = findKey(body, key => /phone|sms|^tel$/i.test(key));
  if (banned) throw new CrmError(400, 'contact_not_allowed', 'This form does not take a phone number.');
  if (body.charge === true || body.charged === true) {
    throw new CrmError(403, 'charges_disabled', 'Charging is off.');
  }
}

function findKey(value: unknown, test: (key: string) => boolean): string | null {
  if (!value || typeof value !== 'object') return null;
  if (Array.isArray(value)) {
    for (const child of value) {
      const hit = findKey(child, test);
      if (hit) return hit;
    }
    return null;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (test(key)) return key;
    const hit = findKey(child, test);
    if (hit) return hit;
  }
  return null;
}

function locationName(id: string | null) {
  return id ? LOCATION_NAMES[id] || null : null;
}

function presentOrder(row: OrderRow) {
  const view = {
    id: row.id,
    familyId: row.family_id,
    memberId: row.member_id,
    locationId: row.location_id,
    locationName: locationName(row.location_id),
    fulfillmentMethod: row.fulfillment_method,
    pickupLocationId: row.pickup_location_id,
    pickupLocationName: locationName(row.pickup_location_id),
    shippingAddress: row.shipping_address,
    shippingCents: row.shipping_cents,
    trackingNumber: row.tracking_number,
    fulfillmentStatus: row.fulfillment_status,
    statusLabel: orderStatusLabel({
      fulfillmentMethod: row.fulfillment_method,
      fulfillmentStatus: row.fulfillment_status,
      pickupLocationId: row.pickup_location_id,
      trackingNumber: row.tracking_number,
    }),
    subtotalCents: row.subtotal_cents,
    totalCents: row.total_cents,
    charged: false,
    preview: true,
    submitted: false,
    createdAt: row.created_at,
    lines: row.lines || [],
    nextStatus: nextFulfillmentStatus(row.fulfillment_method, row.fulfillment_status),
  };
  return {
    ...view,
    actionLabel: view.nextStatus ? FULFILLMENT_ACTION_LABEL[view.nextStatus] || null : null,
  };
}

function presentItem(row: Record<string, unknown>) {
  const modes = Array.isArray(row.fulfillment_modes) ? row.fulfillment_modes : [];
  const variants = Array.isArray(row.variants) ? row.variants : [];
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    brand: row.brand,
    category: row.category,
    description: row.description,
    priceCents: row.price_cents,
    fulfillmentModes: modes,
    pickup: modes.includes('studio_pickup'),
    shipToHome: modes.includes('ship_to_home'),
    variants,
    active: row.active,
  };
}

const ORDER_SQL = `
  select o.id, o.family_id, o.member_id, o.location_id, o.fulfillment_method,
         o.pickup_location_id, o.shipping_address, o.shipping_cents, o.tracking_number,
         o.fulfillment_status, o.subtotal_cents, o.total_cents, o.charged, o.preview, o.created_at,
         coalesce(json_agg(json_build_object(
           'id', l.id,
           'sku', i.sku,
           'name', i.name,
           'variant', l.variant,
           'qty', l.qty,
           'unitPriceCents', l.unit_price_cents,
           'lineCents', l.line_cents
         ) order by l.id) filter (where l.id is not null), '[]'::json) as lines
  from pro_shop_orders o
  left join pro_shop_order_lines l on l.order_id = o.id
  left join pro_shop_items i on i.id = l.item_id
`;

async function listItems(pool: SqlPool) {
  const rows = await pool.query(
    `select id, sku, name, brand, category, description, price_cents, fulfillment_modes, variants, active
     from pro_shop_items
     where active = true
     order by sort_order, name`,
  );
  return {
    status: 200,
    body: {
      items: rows.rows.map(presentItem),
      shippingCents: PRO_SHOP_SHIPPING_CENTS,
      charges: false,
      preview: true,
    },
  };
}

function cleanAddress(raw: unknown) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new CrmError(400, 'bad_address', 'Add a street, city, state, and ZIP.');
  }
  const src = raw as Record<string, unknown>;
  const line1 = String(src.line1 || '').trim();
  const city = String(src.city || '').trim();
  const region = String(src.region || '').trim().toUpperCase();
  const postal = String(src.postal || '').trim();
  if (line1.length < 1 || line1.length > 120 || city.length < 1 || city.length > 80) {
    throw new CrmError(400, 'bad_address', 'Add a street, city, state, and ZIP.');
  }
  if (!/^[A-Z]{2}$/.test(region) || !/^[0-9]{5}$/.test(postal)) {
    throw new CrmError(400, 'bad_address', 'Use a 2-letter state and a 5-digit ZIP.');
  }
  if (/tel:|sms:/i.test(line1 + city)) {
    throw new CrmError(400, 'bad_address', 'Add a street, city, state, and ZIP.');
  }
  return { line1, city, region, postal };
}

function assertSchool(id: string) {
  if (!LOCATION_NAMES[id]) throw new CrmError(400, 'bad_location', 'Pick a school.');
  return id;
}

async function createOrder(pool: SqlPool, actor: Actor, body: Record<string, unknown>, env: ProShopEnv) {
  rejectUnsafe(body);
  if (chargesEnabled(env)) {
    throw new CrmError(403, 'charges_disabled', 'Charging is off.');
  }
  const memberId = assertUuid(String(body.memberId || ''));
  const method = String(body.fulfillmentMethod || '');
  if (method !== 'studio_pickup' && method !== 'ship_to_home') {
    throw new CrmError(400, 'bad_method', 'Choose studio pickup or ship to home.');
  }
  const lines = Array.isArray(body.lines) ? body.lines : [];
  if (!lines.length) throw new CrmError(400, 'empty_order', 'Add an item first.');

  const member = await pool.query(
    `select id, family_id, location_id, first_name, status from members where id = $1`,
    [memberId],
  );
  const who = member.rows[0];
  if (!who) throw new CrmError(404, 'not_found', 'Not found.');
  if (actor.role === 'guardian' && !actor.familyIds.includes(who.family_id)) {
    throw new CrmError(404, 'not_found', 'Not found.');
  }
  if (actor.role === 'member' && (actor.memberId !== who.id || !actor.familyIds.includes(who.family_id))) {
    throw new CrmError(404, 'not_found', 'Not found.');
  }
  if (actor.role === 'staff' && !canSeeLocation(actor, who.location_id)) {
    throw new CrmError(403, 'forbidden', 'That school is outside your access.');
  }
  if (actor.role !== 'admin' && actor.role !== 'staff' && actor.role !== 'guardian' && actor.role !== 'member') {
    throw new CrmError(403, 'forbidden', 'Sign in required.');
  }

  let pickupLocationId: string | null = null;
  let shippingAddress: ReturnType<typeof cleanAddress> | null = null;
  let shippingCents = 0;
  if (method === 'studio_pickup') {
    if (body.shippingAddress) throw new CrmError(400, 'bad_method', 'Pickup does not use a shipping address.');
    pickupLocationId = assertSchool(String(body.pickupLocationId || ''));
    if (actor.role === 'staff' && !canSeeLocation(actor, pickupLocationId) && !canSeeLocation(actor, who.location_id)) {
      throw new CrmError(403, 'forbidden', 'That school is outside your access.');
    }
  } else {
    if (body.pickupLocationId) throw new CrmError(400, 'bad_method', 'Shipping does not use a pickup school.');
    shippingAddress = cleanAddress(body.shippingAddress);
    shippingCents = PRO_SHOP_SHIPPING_CENTS;
  }

  const skus = lines.map(line => String((line as Record<string, unknown>).sku || ''));
  const items = await pool.query(
    `select id, sku, name, price_cents, fulfillment_modes, variants, active
     from pro_shop_items where sku = any($1::text[])`,
    [skus],
  );
  const bySku = new Map(items.rows.map(row => [row.sku as string, row]));
  const priced: Array<{ itemId: string; variant: string | null; qty: number; unit: number; line: number }> = [];
  for (const raw of lines) {
    const line = raw as Record<string, unknown>;
    const item = bySku.get(String(line.sku || ''));
    if (!item || item.active === false) throw new CrmError(400, 'unknown_item', 'That item is not in the catalog.');
    const modes: string[] = item.fulfillment_modes || [];
    if (!modes.includes(method)) throw new CrmError(422, 'fulfillment_not_allowed', 'That item cannot use this fulfillment choice.');
    const qty = Number(line.qty ?? 1);
    if (!Number.isInteger(qty) || qty < 1 || qty > 20) throw new CrmError(400, 'bad_qty', 'Quantity must be from 1 to 20.');
    const variants: string[] = Array.isArray(item.variants) ? item.variants : [];
    const variant = line.variant == null || line.variant === '' ? null : String(line.variant);
    if (variants.length && (variant == null || !variants.includes(variant))) {
      throw new CrmError(400, 'bad_variant', 'Pick a size.');
    }
    const unit = Number(item.price_cents);
    priced.push({ itemId: item.id, variant, qty, unit, line: unit * qty });
  }
  const subtotal = priced.reduce((sum, line) => sum + line.line, 0);
  const total = subtotal + shippingCents;

  const client = await pool.connect();
  try {
    await client.query('begin');
    const inserted = await client.query(
      `insert into pro_shop_orders (
         family_id, member_id, location_id, fulfillment_method, pickup_location_id,
         shipping_address, shipping_cents, fulfillment_status, subtotal_cents, total_cents,
         charged, preview
       ) values ($1,$2,$3,$4,$5,$6::jsonb,$7,'ordered',$8,$9,false,true)
       returning id`,
      [
        who.family_id,
        who.id,
        who.location_id,
        method,
        pickupLocationId,
        shippingAddress ? JSON.stringify(shippingAddress) : null,
        shippingCents,
        subtotal,
        total,
      ],
    );
    const orderId = inserted.rows[0].id as string;
    for (const line of priced) {
      await client.query(
        `insert into pro_shop_order_lines (order_id, item_id, variant, qty, unit_price_cents, line_cents)
         values ($1,$2,$3,$4,$5,$6)`,
        [orderId, line.itemId, line.variant, line.qty, line.unit, line.line],
      );
    }
    await client.query('commit');
    const full = await loadOrder(pool, orderId);
    return { status: 201, body: { ...presentOrder(full), chargesEnabled: false } };
  } catch (err) {
    try { await client.query('rollback'); } catch { /* keep the original error */ }
    throw err;
  } finally {
    client.release?.();
  }
}

async function loadOrder(pool: SqlPool, id: string): Promise<OrderRow> {
  const rows = await pool.query(ORDER_SQL + ' where o.id = $1 group by o.id', [id]);
  if (!rows.rows[0]) throw new CrmError(404, 'not_found', 'Not found.');
  return rows.rows[0] as OrderRow;
}

function canSeeOrder(actor: Actor, row: OrderRow) {
  if (actor.role === 'admin') return true;
  if (actor.role === 'staff') {
    return canSeeLocation(actor, row.location_id) || (!!row.pickup_location_id && canSeeLocation(actor, row.pickup_location_id));
  }
  if (!actor.familyIds.includes(row.family_id)) return false;
  if (actor.role === 'member' && actor.memberId && actor.memberId !== row.member_id) return false;
  return actor.role === 'guardian' || actor.role === 'member';
}

async function listOrders(pool: SqlPool, actor: Actor, search: URLSearchParams) {
  const params: unknown[] = [];
  const where: string[] = [];
  if (actor.role === 'staff') {
    params.push(actor.locationIds);
    where.push(`(o.location_id = any($${params.length}::text[]) or o.pickup_location_id = any($${params.length}::text[]))`);
  } else if (actor.role === 'guardian' || actor.role === 'member') {
    params.push(actor.familyIds);
    where.push(`o.family_id = any($${params.length}::uuid[])`);
    if (actor.role === 'member' && actor.memberId) {
      params.push(actor.memberId);
      where.push(`o.member_id = $${params.length}::uuid`);
    }
  } else if (actor.role !== 'admin') {
    throw new CrmError(403, 'forbidden', 'Sign in required.');
  }
  const locationId = search.get('locationId');
  if (locationId) {
    assertSchool(locationId);
    params.push(locationId);
    where.push(`(o.pickup_location_id = $${params.length} or (o.fulfillment_method = 'ship_to_home' and o.location_id = $${params.length}))`);
  }
  const method = search.get('method');
  if (method) {
    if (method !== 'studio_pickup' && method !== 'ship_to_home') {
      throw new CrmError(400, 'bad_method', 'Choose studio pickup or ship to home.');
    }
    params.push(method);
    where.push(`o.fulfillment_method = $${params.length}`);
  }
  const status = search.get('status');
  if (status) {
    params.push(status);
    where.push(`o.fulfillment_status = $${params.length}`);
  }
  const sql = ORDER_SQL + (where.length ? ' where ' + where.join(' and ') : '') + ' group by o.id order by o.created_at desc limit 100';
  const rows = await pool.query(sql, params);
  return {
    status: 200,
    body: {
      orders: (rows.rows as OrderRow[]).map(presentOrder),
      charges: false,
      preview: true,
    },
  };
}

async function patchFulfillment(pool: SqlPool, actor: Actor, id: string, body: Record<string, unknown>, env: ProShopEnv) {
  rejectUnsafe(body);
  if (chargesEnabled(env)) throw new CrmError(403, 'charges_disabled', 'Charging is off.');
  if (actor.role !== 'admin' && actor.role !== 'staff') {
    throw new CrmError(403, 'forbidden', 'Staff only.');
  }
  assertUuid(id);
  const current = await loadOrder(pool, id);
  if (!canSeeOrder(actor, current)) throw new CrmError(404, 'not_found', 'Not found.');
  const requested = String(body.status || body.action || '');
  const next = ACTION_STATUS[requested];
  if (!next) throw new CrmError(400, 'bad_status', 'Pick the next step.');
  const expected = nextFulfillmentStatus(current.fulfillment_method, current.fulfillment_status);
  if (next !== expected) throw new CrmError(409, 'bad_status', 'That step is not next.');
  let tracking: string | null = null;
  if (body.trackingNumber != null && String(body.trackingNumber).trim()) {
    tracking = String(body.trackingNumber).trim();
    if (!/^[A-Za-z0-9-]{4,40}$/.test(tracking) || current.fulfillment_method !== 'ship_to_home' || next === 'packed') {
      throw new CrmError(400, 'bad_tracking', 'Tracking can be added when the order ships.');
    }
  }
  await pool.query(
    `update pro_shop_orders
     set fulfillment_status = $2,
         tracking_number = case when $3::text is null then tracking_number else $3 end
     where id = $1`,
    [id, next, tracking],
  );
  const full = await loadOrder(pool, id);
  return { status: 200, body: { ...presentOrder(full), chargesEnabled: false } };
}

export async function handleProShop(input: {
  method: string;
  parts: string[];
  search: URLSearchParams;
  actor: Actor | null;
  body: Record<string, unknown>;
  pool: SqlPool;
  env: ProShopEnv;
}): Promise<{ status: number; body: unknown }> {
  const { method, parts, search, actor, body, pool, env } = input;
  if (method === 'GET' && parts[2] === 'items') return listItems(pool);
  if (!actor) throw new CrmError(401, 'unauthorized', 'Sign in required.');
  if (method === 'GET' && parts[2] === 'orders' && parts.length === 3) return listOrders(pool, actor, search);
  if (method === 'POST' && parts[2] === 'orders' && parts.length === 3) return createOrder(pool, actor, body, env);
  if (method === 'PATCH' && parts[4] === 'fulfillment') return patchFulfillment(pool, actor, parts[3], body, env);
  return { status: 404, body: { error: { code: 'not_found', message: 'Not found.' } } };
}
