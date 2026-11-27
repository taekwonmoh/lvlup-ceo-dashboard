# Member portal and staff desk preview

Sandbox only. These pages do not change `index.html`, the live staff dashboard, or `api.lvlupma.com`. Orders are previews. `BILLING_CHARGES_ENABLED` stays `0`.

## Open it

From the repo root:

```bash
python3 -m http.server 8765
```

Then open:

- Member app: `http://127.0.0.1:8765/crm/preview/member.html`
- Staff desk: `http://127.0.0.1:8765/crm/preview/staff.html`
- Chooser: `http://127.0.0.1:8765/crm/preview/index.html`

The header switches between **Member app** and **Staff desk**. A badge says **Sandbox Preview**. Names are the Sample family. Nothing is a real member, and the pages do not show phone numbers.

The member app is one tap at the top to switch Riley, Avery, or Jordan. The staff desk has five tabs: Today, Members & Leads, Schedule & Events, Financials & Billing, and Messages & Automations.

Both pages share one sample studio in this browser. Mark a hoodie ready on the staff desk, then open the member app and it shows **Ready for pickup at Waunakee**. Reset sample data from **More → Sandbox connection** on the member app, or **Messages → Sandbox connection** on the staff desk.

## Sandbox API

Leave the connection blank to stay on sample data with no sign-in.

To read the gear catalog from the sandbox worker, paste `https://lvlup-crm-api.mike-moh.workers.dev`. A token is optional and stays in this browser tab. Catalog reads are public. Placing an order or moving a pickup still needs a staff or family token, and the worker must be running this build. This repo does not deploy it.

`GET /v1/pro-shop/items` returns the catalog.

`POST /v1/pro-shop/orders` creates a preview order. Send `studio_pickup` plus `pickupLocationId`, or `ship_to_home` plus a street, city, state, and ZIP. The response has `charged: false`.

`GET /v1/pro-shop/orders` is the family's own orders, or the staff pickup and shipping queue for their schools.

`PATCH /v1/pro-shop/orders/{id}/fulfillment` moves one step: Mark Ready for Pickup, Mark Picked Up, Mark Packed, Mark Shipped, or Mark Delivered.

## Schema

Local tests apply `crm/migrations/014_pro_shop_fulfillment.sql`.

On a new empty Supabase project only, apply `crm/supabase/migrations/20261127000014_pro_shop_fulfillment.sql`. The copy named `014_pro_shop_fulfillment.sql` is the same SQL, guarded so a lexical sort that runs it before the core schema does not fail. Do not apply it to project `xxyndswrierztzdbjvrd`.

`pro_shop_items`, `pro_shop_orders`, and `pro_shop_order_lines` have row level security and `crm_app` policies. There is no anon policy. An item can allow `studio_pickup`, `ship_to_home`, or both. Pickup moves `ordered` → `ready_for_pickup` → `picked_up`. Shipping moves `ordered` → `packed` → `shipped` → `delivered`. `charged` stays false.

East Madison is shown as Madison, WI 53718. Practice videos use a Vimeo player URL with `texttrack=false`. The upgrade screen says that starting in 2027, tuition includes every belt test.
