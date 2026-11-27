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
- Go Ninja web: `http://127.0.0.1:8765/crm/preview/goninja.html`
- Chooser: `http://127.0.0.1:8765/crm/preview/index.html`

The header switches between **Member** and **Staff**, and between **Demo** and **Live**. Demo opens immediately with the Sample family and no sign-in. Live talks to `https://lvlup-crm-api.mike-moh.workers.dev`. Names in Demo are the Sample family. Nothing on these pages is a real member, and the pages do not show phone numbers.

The member app is one tap at the top to switch Riley, Avery, or Jordan. The staff desk has five tabs: Today, Members & Leads, Schedule & Events, Financials & Billing, and Messages & Automations. Today has a **Front Desk** | **Tasks & Clock-In** switch. Tasks & Clock-In is the shift timer, pay-period hours, and the opening, mid-shift, and closing checklists. The payroll button downloads a QuickBooks-ready preview and does not update QuickBooks.

Go Ninja web (`goninja.html`) is the branded landing and enrollment preview for Go Ninja Waunakee and Go Ninja Verona. It has three flows: the 8-week Ninja Movement Academy (`#academy`), summer camp week picking (`#camp`), and afterschool family management (`#afterschool`). Sibling prices come from `crm/lib/household-discounts.js`. Staff edit those rates on Financials & Billing (`staff.html#billing`). Names are the Sample family. Nothing on that page is charged.

Both pages share one sample studio in this browser. Mark a hoodie ready on the staff desk, then open the member app and it shows **Ready for pickup at Waunakee**. Reset sample data from **More → Sandbox connection** on the member app, or **Messages → Sandbox connection** on the staff desk.

## Sandbox API

**Demo** is the default and needs no sign-in.

**Live** reads `GET /v1/pro-shop/items` from the sandbox worker. The response includes `charges: false`. Sign in from the card on Home, Pro Shop, or the staff Today page. Email delivery stays off, so a sandbox code is shown on screen when the API offers one. You can also paste a bearer session token. Sign out clears that token. Protected calls fall back to the sample studio when you are signed out, the token is refused, or the API is offline. This repo does not deploy the worker.

`GET /v1/pro-shop/items` returns the catalog.

`POST /v1/pro-shop/orders` creates a preview order. Send `studio_pickup` plus `pickupLocationId`, or `ship_to_home` plus a street, city, state, and ZIP. The response has `charged: false`.

`GET /v1/pro-shop/orders` is the family's own orders, or the staff pickup and shipping queue for their schools.

`PATCH /v1/pro-shop/orders/{id}/fulfillment` moves one step: Mark Ready for Pickup, Mark Picked Up, Mark Packed, Mark Shipped, or Mark Delivered.

## Schema

Local tests apply `crm/migrations/014_pro_shop_fulfillment.sql`.

On a new empty Supabase project only, apply `crm/supabase/migrations/20261127000014_pro_shop_fulfillment.sql`. The copy named `014_pro_shop_fulfillment.sql` is the same SQL, guarded so a lexical sort that runs it before the core schema does not fail. Do not apply it to project `xxyndswrierztzdbjvrd`.

`pro_shop_items`, `pro_shop_orders`, and `pro_shop_order_lines` have row level security and `crm_app` policies. There is no anon policy. An item can allow `studio_pickup`, `ship_to_home`, or both. Pickup moves `ordered` → `ready_for_pickup` → `picked_up`. Shipping moves `ordered` → `packed` → `shipped` → `delivered`. `charged` stays false.

East Madison is shown as Madison, WI 53718. Practice videos use a Vimeo player URL with `texttrack=false`. The upgrade screen says that starting in 2027, tuition includes every belt test.
