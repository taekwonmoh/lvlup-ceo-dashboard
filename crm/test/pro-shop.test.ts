import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import pg from 'pg';
import { createServer } from 'node:http';
import { signToken } from '../src/auth.ts';
import { migrate } from '../src/migrate.ts';
import { createApp } from '../src/server.ts';
import { handleWorkerRequest, type CrmWorkerEnv } from '../worker/src/app.ts';
import { bootstrapDatabase, grantCrmApp } from './bootstrap.ts';

const URL = 'postgres://crm:crm@127.0.0.1:5432/crm_pro_shop_test';
const SECRET = 'dev-only-secret';
process.env.CRM_TOKEN_SECRET = SECRET;
process.env.AUTHORIZENET_MODE = 'sandbox';
process.env.BILLING_CHARGES_ENABLED = '0';
process.env.AUTOMATION_DELIVERY_ENABLED = '0';
process.env.PUSH_DELIVERY_ENABLED = '0';
process.env.WEBHOOK_DELIVERY_ENABLED = '0';
process.env.QBO_ENABLED = '0';

const root = dirname(fileURLToPath(import.meta.url));
const repo = join(root, '..', '..');
let pool: pg.Pool;
let base = '';
let close: () => Promise<void>;

function token(role: 'admin' | 'staff' | 'guardian' | 'member', extra: Record<string, unknown> = {}) {
  return signToken({
    role,
    email: role + '@example.test',
    locationIds: ['waunakee'],
    familyIds: [],
    memberId: null,
    canFinance: role === 'admin',
    ...extra,
  }, SECRET);
}

async function api(method: string, path: string, tok?: string, body?: unknown) {
  const res = await fetch(base + path, {
    method,
    headers: {
      ...(tok ? { authorization: 'Bearer ' + tok } : {}),
      'content-type': 'application/json',
    },
    body: body == null ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = {};
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  return { status: res.status, json, text };
}

async function seedMember(name: string, location = 'waunakee', familyId?: string) {
  const family = familyId
    ? { rows: [{ id: familyId }] }
    : await pool.query(`insert into families (display_name) values ($1) returning id`, [name + ' home']);
  const member = await pool.query(
    `insert into members (family_id, location_id, first_name, last_name, status)
     values ($1, $2, $3, 'Sample', 'active') returning id, family_id`,
    [family.rows[0].id, location, name],
  );
  return { familyId: member.rows[0].family_id as string, memberId: member.rows[0].id as string };
}

before(async () => {
  bootstrapDatabase('crm_pro_shop_test');
  pool = new pg.Pool({ connectionString: URL });
  await migrate(pool);
  grantCrmApp();
  const app = createApp(pool);
  const server = createServer((req, res) => { void app.handle(req, res); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', () => resolve()));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  base = 'http://127.0.0.1:' + port;
  close = () => new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
});

after(async () => {
  if (close) await close();
  if (pool) await pool.end();
});

test('migration 014 matches the ordered copy and enables crm_app RLS', () => {
  const local = readFileSync(join(root, '../migrations/014_pro_shop_fulfillment.sql'), 'utf8');
  const ordered = readFileSync(join(root, '../supabase/migrations/20261127000014_pro_shop_fulfillment.sql'), 'utf8');
  const wrapped = readFileSync(join(root, '../supabase/migrations/014_pro_shop_fulfillment.sql'), 'utf8');
  assert.equal(ordered, local);
  assert.match(wrapped, /to_regclass\('public\.locations'\)/);
  assert.ok(wrapped.includes(local.trim()));
  for (const table of ['pro_shop_items', 'pro_shop_orders', 'pro_shop_order_lines']) {
    assert.match(local, new RegExp('alter table ' + table + ' enable row level security'));
  }
  assert.match(local, /to crm_app/);
  assert.match(local, /studio_pickup/);
  assert.match(local, /ship_to_home/);
  assert.match(local, /ready_for_pickup/);
  assert.match(local, /uniform-dobok/);
  assert.match(local, /goninja-grip-socks/);
  assert.equal(local.includes('revoke all on pro_shop_items, pro_shop_orders, pro_shop_order_lines from anon, authenticated'), true);
});

test('preview UI stays out of the live dashboard and keeps the safety copy', () => {
  const files = [
    'crm/preview/member.html',
    'crm/preview/staff.html',
    'crm/preview/index.html',
    'crm/ui/member.js',
    'crm/ui/staff.js',
    'crm/ui/portal.js',
    'crm/ui/portal.css',
    'crm/ui/preview-data.js',
    'crm/ui/rules.js',
  ].map(path => readFileSync(join(repo, path), 'utf8')).join('\n');
  assert.equal(/tel:/i.test(files), false);
  assert.equal(/sms:/i.test(files), false);
  assert.equal(/\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}/.test(files), false);
  assert.match(files, /texttrack=false/);
  assert.equal(/player\.vimeo\.com\/video\/[^"'?\s]+(?!.*texttrack=false)/.test(files), false);
  assert.match(files, /Madison, WI 53718/);
  assert.match(files, /tuition includes every belt test/);
  assert.match(files, /Sandbox Preview/);
  assert.match(files, /Mark Ready/);
  assert.match(files, /Handed to Family/);
  const dashboard = readFileSync(join(repo, 'index.html'), 'utf8');
  assert.equal(dashboard.includes('crm/preview/member.html'), false);
  assert.equal(dashboard.includes('pro_shop_orders'), false);
  const wrangler = readFileSync(join(root, '../worker/wrangler.jsonc'), 'utf8');
  for (const flag of ['BILLING_CHARGES_ENABLED', 'QBO_ENABLED', 'AUTOMATION_DELIVERY_ENABLED', 'PUSH_DELIVERY_ENABLED', 'WEBHOOK_DELIVERY_ENABLED']) {
    assert.match(wrangler, new RegExp('"' + flag + '": "0"'));
  }
  assert.match(wrangler, /"AUTHORIZENET_MODE": "sandbox"/);
  assert.equal(wrangler.includes('api.lvlupma.com'), true);
  assert.equal(/"pattern":\s*"api\.lvlupma\.com"/.test(wrangler), false);
});

test('preview rules block a second party in the same slot', () => {
  const code = readFileSync(join(root, '../ui/rules.js'), 'utf8');
  const context: { CrmRules?: any } = {};
  vm.runInNewContext(code, context);
  const rules = context.CrmRules;
  assert.equal(rules.cycleTheme('2026-11-27'), 'Honesty');
  assert.match(rules.vimeoUrl, /texttrack=false/);
  const taken = rules.claimPartySlot(
    [{ locationId: 'goninjaW', date: '2026-12-05', time: '11:00', status: 'booked' }],
    { locationId: 'goninjaW', date: '2026-12-05', time: '11:00' },
  );
  assert.equal(taken.ok, false);
  const open = rules.claimPartySlot(
    [{ locationId: 'goninjaW', date: '2026-12-05', time: '11:00', status: 'booked' }],
    { locationId: 'goninjaW', date: '2026-12-05', time: '13:30' },
  );
  assert.equal(open.ok, true);
  assert.equal(rules.nextFulfillmentStatus('studio_pickup', 'ordered'), 'ready_for_pickup');
  assert.equal(rules.nextFulfillmentStatus('studio_pickup', 'ready_for_pickup'), 'picked_up');
  assert.equal(rules.nextFulfillmentStatus('ship_to_home', 'shipped'), 'delivered');
  assert.equal(rules.orderStatusLabel({
    fulfillmentMethod: 'studio_pickup',
    fulfillmentStatus: 'ready_for_pickup',
    pickupLocationId: 'waunakee',
  }, { waunakee: 'Waunakee' }), 'Ready for pickup at Waunakee');
});

test('catalog is public and pickup versus ship moves one step at a time', async () => {
  const catalog = await api('GET', '/v1/pro-shop/items');
  assert.equal(catalog.status, 200, JSON.stringify(catalog.json));
  assert.equal(catalog.json.charges, false);
  const skus = catalog.json.items.map((item: { sku: string; fulfillmentModes: string[] }) => item.sku);
  assert.deepEqual(skus, ['uniform-dobok', 'sparring-kit', 'bo-staff', 'lvlup-hoodie', 'goninja-grip-socks']);
  assert.ok(catalog.json.items.every((item: { fulfillmentModes: string[] }) => item.fulfillmentModes.includes('studio_pickup') && item.fulfillmentModes.includes('ship_to_home')));

  const home = await seedMember('Riley');
  const sibling = await seedMember('Avery', 'waunakee', home.familyId);
  const other = await seedMember('Quinn', 'verona');
  const guardian = token('guardian', { familyIds: [home.familyId], locationIds: [] });
  const member = token('member', { familyIds: [home.familyId], memberId: home.memberId, locationIds: [] });
  const staff = token('staff', { locationIds: ['waunakee'] });
  const verona = token('staff', { locationIds: ['verona'] });
  const admin = token('admin', { locationIds: [] });

  const unsigned = await api('POST', '/v1/pro-shop/orders', undefined, { memberId: home.memberId });
  assert.equal(unsigned.status, 401);

  const card = await api('POST', '/v1/pro-shop/orders', guardian, {
    memberId: home.memberId,
    fulfillmentMethod: 'studio_pickup',
    pickupLocationId: 'waunakee',
    lines: [{ sku: 'lvlup-hoodie', variant: 'YM', qty: 1 }],
    cardNumber: '4242424242424242',
  });
  assert.equal(card.status, 400);
  assert.equal(card.json.error.code, 'card_not_allowed');

  const phone = await api('POST', '/v1/pro-shop/orders', guardian, {
    memberId: home.memberId,
    fulfillmentMethod: 'studio_pickup',
    pickupLocationId: 'waunakee',
    lines: [{ sku: 'lvlup-hoodie', variant: 'YM', qty: 1 }],
    phone: 'no',
  });
  assert.equal(phone.status, 400);

  const charge = await api('POST', '/v1/pro-shop/orders', guardian, {
    memberId: home.memberId,
    fulfillmentMethod: 'studio_pickup',
    pickupLocationId: 'waunakee',
    lines: [{ sku: 'lvlup-hoodie', variant: 'YM', qty: 1 }],
    charge: true,
  });
  assert.equal(charge.status, 403);
  assert.equal(charge.json.error.code, 'charges_disabled');

  const pickup = await api('POST', '/v1/pro-shop/orders', guardian, {
    memberId: home.memberId,
    fulfillmentMethod: 'studio_pickup',
    pickupLocationId: 'waunakee',
    lines: [{ sku: 'lvlup-hoodie', variant: 'YM', qty: 1 }],
  });
  assert.equal(pickup.status, 201, JSON.stringify(pickup.json));
  assert.equal(pickup.json.charged, false);
  assert.equal(pickup.json.preview, true);
  assert.equal(pickup.json.fulfillmentStatus, 'ordered');
  assert.equal(pickup.json.shippingCents, 0);
  assert.equal(pickup.json.totalCents, 4500);

  const ship = await api('POST', '/v1/pro-shop/orders', member, {
    memberId: home.memberId,
    fulfillmentMethod: 'ship_to_home',
    shippingAddress: { line1: '100 Sample Lane', city: 'Waunakee', region: 'WI', postal: '53597' },
    lines: [{ sku: 'goninja-grip-socks', variant: 'S', qty: 2 }],
  });
  assert.equal(ship.status, 201, JSON.stringify(ship.json));
  assert.equal(ship.json.shippingCents, 800);
  assert.equal(ship.json.totalCents, 3200);
  assert.equal(ship.json.statusLabel, 'Ordered');

  await pool.query(
    `insert into pro_shop_items (sku, name, brand, category, description, price_cents, fulfillment_modes, variants, sort_order)
     values ('desk-only', 'Desk Flag', 'shared', 'Gear', 'A sample flag for the front desk.', 500, array['studio_pickup'], '[]'::jsonb, 9)`,
  );
  const denied = await api('POST', '/v1/pro-shop/orders', guardian, {
    memberId: home.memberId,
    fulfillmentMethod: 'ship_to_home',
    shippingAddress: { line1: '100 Sample Lane', city: 'Waunakee', region: 'WI', postal: '53597' },
    lines: [{ sku: 'desk-only', qty: 1 }],
  });
  assert.equal(denied.status, 422, JSON.stringify(denied.json));

  const mine = await api('GET', '/v1/pro-shop/orders', member);
  assert.equal(mine.status, 200);
  assert.ok(mine.json.orders.every((order: { memberId: string }) => order.memberId === home.memberId));
  const siblingOrder = await api('POST', '/v1/pro-shop/orders', guardian, {
    memberId: sibling.memberId,
    fulfillmentMethod: 'studio_pickup',
    pickupLocationId: 'eastmad',
    lines: [{ sku: 'bo-staff', variant: '4 foot', qty: 1 }],
  });
  assert.equal(siblingOrder.status, 201, JSON.stringify(siblingOrder.json));
  const hidden = await api('GET', '/v1/pro-shop/orders', member);
  assert.equal(hidden.json.orders.some((order: { id: string }) => order.id === siblingOrder.json.id), false);

  const outsider = token('guardian', { familyIds: [other.familyId], locationIds: [] });
  const peek = await api('GET', '/v1/pro-shop/orders', outsider);
  assert.equal(peek.json.orders.length, 0);

  const queue = await api('GET', '/v1/pro-shop/orders?locationId=waunakee&method=studio_pickup', staff);
  assert.equal(queue.status, 200);
  assert.ok(queue.json.orders.some((order: { id: string }) => order.id === pickup.json.id));
  const elsewhere = await api('GET', '/v1/pro-shop/orders?locationId=waunakee', verona);
  assert.equal(elsewhere.json.orders.length, 0);

  const skip = await api('PATCH', '/v1/pro-shop/orders/' + pickup.json.id + '/fulfillment', staff, { action: 'handed_to_family' });
  assert.equal(skip.status, 409);
  const ready = await api('PATCH', '/v1/pro-shop/orders/' + pickup.json.id + '/fulfillment', staff, { action: 'mark_ready' });
  assert.equal(ready.status, 200, JSON.stringify(ready.json));
  assert.equal(ready.json.statusLabel, 'Ready for pickup at Waunakee');
  assert.equal(ready.json.charged, false);
  const handed = await api('PATCH', '/v1/pro-shop/orders/' + pickup.json.id + '/fulfillment', admin, { status: 'picked_up' });
  assert.equal(handed.status, 200);
  assert.equal(handed.json.fulfillmentStatus, 'picked_up');
  const familyPatch = await api('PATCH', '/v1/pro-shop/orders/' + ship.json.id + '/fulfillment', guardian, { action: 'mark_packed' });
  assert.equal(familyPatch.status, 403);

  const packed = await api('PATCH', '/v1/pro-shop/orders/' + ship.json.id + '/fulfillment', staff, { action: 'mark_packed' });
  assert.equal(packed.status, 200);
  const shipped = await api('PATCH', '/v1/pro-shop/orders/' + ship.json.id + '/fulfillment', staff, { action: 'mark_shipped', trackingNumber: 'SAMPLETRACK1' });
  assert.equal(shipped.status, 200, JSON.stringify(shipped.json));
  assert.equal(shipped.json.statusLabel, 'Shipped · SAMPLETRACK1');
  const delivered = await api('PATCH', '/v1/pro-shop/orders/' + ship.json.id + '/fulfillment', staff, { action: 'mark_delivered' });
  assert.equal(delivered.status, 200);
  assert.equal(delivered.json.fulfillmentStatus, 'delivered');

  await assert.rejects(
    pool.query(`update pro_shop_orders set fulfillment_status = 'picked_up' where id = $1`, [siblingOrder.json.id]),
    /pro_shop_status_step/,
  );
});

test('crm_app policies hide another family and a school outside the grant', async () => {
  const flags = await pool.query(
    `select relname, relrowsecurity from pg_class
     where relname in ('pro_shop_items', 'pro_shop_orders', 'pro_shop_order_lines')`,
  );
  assert.equal(flags.rows.length, 3);
  assert.ok(flags.rows.every((row: { relrowsecurity: boolean }) => row.relrowsecurity));
  const policies = await pool.query(
    `select count(*)::int as n from pg_policies
     where tablename in ('pro_shop_items', 'pro_shop_orders', 'pro_shop_order_lines')`,
  );
  assert.ok(policies.rows[0].n >= 6);

  const home = await seedMember('Parker');
  const other = await seedMember('Blake', 'verona');
  const item = await pool.query(`select id, price_cents from pro_shop_items where sku = 'uniform-dobok'`);
  async function orderFor(memberId: string, familyId: string, location: string) {
    const row = await pool.query(
      `insert into pro_shop_orders (
         family_id, member_id, location_id, fulfillment_method, pickup_location_id,
         fulfillment_status, subtotal_cents, total_cents, charged, preview
       ) values ($1,$2,$3,'studio_pickup',$3,'ordered',5500,5500,false,true) returning id`,
      [familyId, memberId, location],
    );
    await pool.query(
      `insert into pro_shop_order_lines (order_id, item_id, variant, qty, unit_price_cents, line_cents)
       values ($1,$2,'AS',1,$3,$3)`,
      [row.rows[0].id, item.rows[0].id, item.rows[0].price_cents],
    );
    return row.rows[0].id as string;
  }
  const mine = await orderFor(home.memberId, home.familyId, 'waunakee');
  const theirs = await orderFor(other.memberId, other.familyId, 'verona');

  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query('set role crm_app');
    await client.query(`select crm_private.set_actor('family', '', $1)`, [home.familyId]);
    const seen = await client.query(`select id from pro_shop_orders`);
    assert.deepEqual(seen.rows.map(row => row.id).sort(), [mine].sort());
    const items = await client.query(`select count(*)::int as n from pro_shop_items`);
    assert.ok(items.rows[0].n >= 5);
    await client.query('rollback');

    await client.query('begin');
    await client.query('set role crm_app');
    const none = await client.query(`select id from pro_shop_orders`);
    assert.equal(none.rows.length, 0);
    await client.query('rollback');

    await client.query('begin');
    await client.query('set role crm_app');
    await client.query(`select crm_private.set_actor('front_desk', 'waunakee', '')`);
    const desk = await client.query(`select id from pro_shop_orders`);
    assert.ok(desk.rows.some(row => row.id === mine));
    assert.equal(desk.rows.some(row => row.id === theirs), false);
    await client.query('rollback');
  } finally {
    client.release();
  }
});

test('localhost preview origins get CORS and other origins do not', async () => {
  const env: CrmWorkerEnv = {
    AUTHORIZENET_MODE: 'sandbox',
    BILLING_CHARGES_ENABLED: '0',
    QBO_ENABLED: '0',
    AUTOMATION_DELIVERY_ENABLED: '0',
    PUSH_DELIVERY_ENABLED: '0',
    WEBHOOK_DELIVERY_ENABLED: '0',
    CRM_ALLOW_LOCAL_TOKENS: '0',
  };
  const ok = await handleWorkerRequest(new Request('https://crm.test/v1/health', {
    headers: { origin: 'http://127.0.0.1:8765' },
  }), env, undefined, { pool: null });
  assert.equal(ok.headers.get('access-control-allow-origin'), 'http://127.0.0.1:8765');
  const preflight = await handleWorkerRequest(new Request('https://crm.test/v1/pro-shop/items', {
    method: 'OPTIONS',
    headers: { origin: 'https://staff.lvlupma.com' },
  }), env, undefined, { pool: null });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), 'https://staff.lvlupma.com');
  const blocked = await handleWorkerRequest(new Request('https://crm.test/v1/health', {
    headers: { origin: 'https://evil.example' },
  }), env, undefined, { pool: null });
  assert.equal(blocked.headers.get('access-control-allow-origin'), null);
});
