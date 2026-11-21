# Target architecture

The backbone now lives in [`crm/`](../../crm/) in this repo: Postgres migrations, a local API, and adapters. It does not deploy, and it does not replace the live dashboard. Companion detail: [DATA-MODEL.md](DATA-MODEL.md), [BILLING.md](BILLING.md), [MIGRATION.md](MIGRATION.md), [MEMBERS-API.md](MEMBERS-API.md), [STAFF-OPS.md](STAFF-OPS.md), [schema/001_init.sql](schema/001_init.sql), [api/openapi.yaml](api/openapi.yaml). How the two apps work today: [CURRENT-STATE.md](CURRENT-STATE.md).

## Module map

Live behavior stays where it is. The backbone is the shared model and the API those screens can move onto later.

| Module | In the backbone now | Still live elsewhere | Later |
|---|---|---|---|
| Members, families, parents | Tables, GymDesk fixture import, `/v1/members` and `/v1/families`. Guardian tokens see their own kids and can switch between them. | Firebase `students`, `families`, `familyByEmail`. Members app email-link sign-in. | Members-site PR calls this API. See [MEMBERS-API.md](MEMBERS-API.md). |
| Billing and coupons | Plans, memberships, CIM profile ids, hold/cancel decision function, promo quote and redemption. Charge requests are built and **not sent**. | GymDesk drafts each school’s Authorize.net CIM profile. | Shadow billing, then one school at a time. |
| Classes, scheduling, bookings | `class_sessions`, `bookings`, quote with a promo code. | Public trial widget and `{school}.gymdesk.com/members/schedule`. | Replace the widget per school. |
| Attendance and check-in kiosk | `attendance` and `time_punches` tables. Punch adapter from the Firebase entry shape. | `#clock` kiosk writes `ceo/timeclock/entries`. Member class check-in is still GymDesk. | Kiosk stays PIN-only until a later cutover. It never gets a CRM key. |
| Ranks and belt testing | Rank catalog, requirements, sign-off, eligibility function (classes + days in rank + instructor sign-off). | `gymdeskRank` string and the black-belt tracker on Firebase. ATA registration stays on the ATA portal. | Record results here. Do not rebuild EZSignup. |
| Curriculum and videos | `curriculum_videos` stores a Vimeo id per rank. No video files. | Cycle videos are hard-coded in `members-curriculum.js`. | Point the members curriculum at these rows. |
| Leads and trials | `leads` plus the fixture importer. | `/book` posts to GymDesk `create-lead`. `/api/lead` writes `classLeads`. | One school mirrors, then stops posting to GymDesk. |
| Events, tournaments, parties | `events`, `event_registrations`, `parties`. Promo codes can target an event type. | `ceo/events` and the old `va-dashboard-bf7ca` events client. Go Ninja party counts are typed into KPIs. | One event writer. |
| Staff tasks and task sheets | `task_definitions`, `task_completions`, Firebase snapshot adapter. | Ops → Tasks in this dashboard. Paths under `ceo/tasks/emp/{seat}`. | Read from the API, then stop writing Firebase. See [STAFF-OPS.md](STAFF-OPS.md). |
| Staff scheduler and hours | `staff_shifts`, `staff_time_off`, `time_punches`, `schedule_publications`. Adapter sums scheduled minutes. | Schedule tab writes `ceo/timeclock/schedule` and punches. | Same cutover as tasks. Payroll hours stay a report on these rows. |
| Communications | Not built. | Resend for leads, bookings, and hold mail. Slack for holds. Scheduler comments mention a future Slack reminder, not SMS. | One sender for receipts, dunning, and class reminders. |
| Media | Not built. | Firebase Storage `events/`, `taskPhotos/`, `contentSubmissions/`. | Keep the buckets. The CRM stores the path, not the bytes. |
| Reporting | Not built. | `finance/gymdesk`, planner baseline, scorecard, KPI grid. | Add CRM collected totals in front of the GymDesk snapshot after cutover. |
| Parent and member apps | Same API and roles. No app binary. | Members PWA (`members-manifest.json`) opens GymDesk to book. | Expo app after the web members area uses this API. |

## Recommendation

## Recommendation

Build a school CRM whose system of record is **Postgres in a new Supabase project**, reached only through a **Cloudflare Worker API**. Keep the staff dashboard and the marketing site as clients. Add an **Expo** app later on that same API.

Do not extend Firebase Realtime Database into the billing system. It is the right store for the checklist, the time clock, and the photo bucket the schools already have. It is the wrong store for invoices, idempotency keys, and “this family was charged once for this period.”

Do not reuse Supabase project `xxyndswrierztzdbjvrd`. That database is a different product and it is production. See [CURRENT-STATE.md](CURRENT-STATE.md).

```
                    ┌─────────────────────────────┐
                    │  Cloudflare Worker  /v1     │
                    │  auth, scope, idempotency   │
                    └────────────┬────────────────┘
           ┌─────────────────────┼──────────────────────┐
           ▼                     ▼                      ▼
   staff.lvlupma.com      lvlupma.com            Expo iOS / Android
   (Google sign-in)       (email-link sign-in)   (same Firebase Auth)
           │                     │                      │
           └─────────────────────┴──────────────────────┘
                                 │ verifies Firebase ID token
                                 ▼
                    ┌─────────────────────────────┐
                    │  New Supabase Postgres      │
                    │  RLS on, no anon policies   │
                    │  service role only on Worker│
                    └────────────┬────────────────┘
                                 │ profile ids only
                                 ▼
                    Authorize.net CIM, one merchant per school
                    Accept.js for new cards (sandbox until cutover)

   Still on Firebase (lvlup-members-app), until a later phase moves them:
   time clock, task photos, events bucket, staff checklist, finance snapshot
```

## Stack and hosting

| Piece | Choice | Why this, given what is already running |
|---|---|---|
| System of record | New Supabase project, Postgres 15+, `us-east` or `us-west-2` | Relational constraints, transactions, and row security. The training-app project stays untouched. |
| API | Cloudflare Worker on a hostname such as `api.lvlupma.com` | The website is already Cloudflare Pages. Workers already run merch checkout, the calendar, and the roster sync. One Worker is the only process with the service-role key and the Authorize.net keys. |
| Staff UI | Keep `staff.lvlupma.com` (this repo, GitHub Pages) | Phase 1 adds a client of the API. It does not rewrite the checklist, the time clock, or the GymDesk snapshot page. |
| Public site and members web | Keep Cloudflare Pages, `lvlupma.com` from `main` | Replace the GymDesk widget calls with API calls when a school is ready. The PWA manifest can stay. |
| Auth, first releases | Firebase Auth on `lvlup-members-app` | Staff already use Google. Parents already use email links. The Worker verifies the ID token and maps the email onto a guardian or a staff row. A later phase can move to Supabase Auth; doing it in phase 1 forces every parent to re-enroll during a billing cutover. |
| Mail | Resend | Already used for leads, booking confirmations, and hold receipts. |
| Secrets | Cloudflare Worker secrets, one set per environment | Authorize.net transaction keys, the Supabase service role, and Resend. Never in git, never in the dashboard bundle. |
| Card entry | Authorize.net Accept.js (Accept Customer hosted fields) | The browser talks to Authorize.net. Our origin receives an opaque token, then the Worker creates a CIM payment profile. See PCI below. |
| Mobile | Expo (React Native) with EAS Build | One TypeScript codebase, the same API types as the web clients, push and a camera for check-in. Detail below. |
| Jobs | Worker cron, America/Chicago | Daily billing run, dunning, webhook reconciliation. No always-on server to patch. |
| Files | Firebase Storage for now (`events/`, `taskPhotos/`) | Already open for the uploads the kiosk and the task sheet need. Member documents (waivers) can move to a private Supabase bucket in the phase that needs them. |

Firebase RTDB remains the store for staff operations that are not member-billing: time clock, PTO, inventory, task completions, the GymDesk **snapshot** until invoices replace it. The Worker may read those nodes. It does not become a second writer of `finance/gymdesk`.

## Clients

Three clients, one contract ([api/openapi.yaml](api/openapi.yaml)).

| Client | Signs in as | Calls |
|---|---|---|
| Staff dashboard | Google, existing `staff/{email}` record | Schools in scope, members, attendance corrections, holds, invoices, refunds. Finance routes require `access.finance` or admin, matching today’s GymDesk page. |
| lvlupma.com members area | Email link | Own family, schedules, bookings, belt progress, payment-method update, hold request. |
| iOS and Android | Same email link, or a staff Google account for a front-desk mode | Same member routes. A staff mode is a later slice, not v1. |

The website’s Pages Functions (`/api/gym-book`, `/api/roster-import`, `/api/hold-cancel`) stay until the school they serve is cut over. New code does not add a fourth writer of `students/gymdesk_{id}`.

## Data model

Canonical location ids stay `waunakee`, `eastmad`, `verona`, `deforest`, `goninjaW`, `goninjaV`. Never `eastmadison` in stored data. The website’s booking ids (`east-madison`) map at the edge, the way they do now.

The unit of billing is a **membership** at one **location**, owned by a **family**, covering one or more **members** (students). Guardians are the people who can sign in. A family with children at two schools has two memberships and two merchant charges. That matches “each school has its own Authorize.net account.”

Payment profiles store `customer_profile_id`, `payment_profile_id`, brand, last4, and expiration. They do not store a PAN, a CVV, or a raw Accept.js token past the request that creates the profile.

Ranks are a catalog plus a history of promotions, not a string column that gets overwritten. ATA Songahm is the LVLUP catalog (white through red, red/black, then black-belt degrees). Tigers and Mini Tigers are programs with their own advancement, not a second copy of the color-belt list. Go Ninja does not inherit Songahm ranks. Testing events record the result. Registration in ATA EZSignup stays outside this schema; a registration row can hold an external URL and a “registered” flag.

Full entities, status machines, and the hold rules: [DATA-MODEL.md](DATA-MODEL.md). Draft DDL: [schema/001_init.sql](schema/001_init.sql).

## Billing engine

GymDesk is the scheduler. Authorize.net is only the vault and the charge. The new engine copies that split on purpose. We do not turn on ARB. ARB would put the schedule back inside each merchant account, where a hold, a 4-week plan, a family with two schools, and a notice-period proration are painful to express, and where a bug is hard to unwind.

The Worker’s daily job, in America/Chicago:

1. Select memberships whose `biller` is `lvlup`, whose status is billable, and whose `next_bill_on` is today or earlier.
2. Open one invoice per membership per period. The idempotency key is `{membership_id}:{period_start}`.
3. Charge that school’s merchant account with the CIM profile. Store the Authorize.net `transId` on the attempt.
4. On success, advance `next_bill_on` by the plan interval and email a receipt.
5. On failure, keep the same invoice and schedule retries. Do not open a second invoice for the same period.

Intervals are data, not code assumptions. The prepaid page is evidence that standard tuition is every 4 weeks (13 drafts a year) and Mini-Tigers is 12 drafts. Each plan row says which. A prepaid term is an invoice with `next_bill_on` pushed to the end of the term, not a fake $0 plan.

Holds pause drafts. Cancellations keep drafting through 30 calendar days from the written request. Days already spent on hold do not count as notice. The $15 hold fee stays off until Mike approves a number, a basis (student or family), and a date. Detail, retry timing, refunds, and webhook verification: [BILLING.md](BILLING.md).

## Auth model

One person is an email. The same inbox can be a guardian, a staff user, or both (an instructor who also has a child enrolled).

| Actor | Credential | Record | What they can do |
|---|---|---|---|
| Staff admin | Google | `staff_users.role = admin` | Every school, billing, refunds, merchant settings (not the raw keys). |
| School lead | Google | `lead`, plus `staff_location_grants` | Members, schedule, attendance, holds for those schools. Not another school’s invoices. |
| Ops | Google | `ops` | Operational pages. Billing only with `can_finance`. |
| Front desk | Google | `frontdesk` | Check-in, lead, trial, take a new card via Accept.js, file a hold request. No refund, no export of payment profiles. |
| Guardian | Email link | `guardians` on one or more `families` | See and act for members linked to those families. Update the payment profile. File a hold or cancel request. Cannot see another family’s anything. |
| Member (student) | Optional later | `member_logins` | Own belt journey and schedule. No payment methods. Not in v1. Teen and adult students are the ones who need it. |
| Kiosk | Unsigned, as today | none | The `#clock` time clock stays on Firebase and stays PIN-only. It does not read the CRM. |

Family rules:

- A family has one or more guardians. The GymDesk receipt email becomes the primary payer during import.
- A second guardian is an invite to their own email, not a shared password.
- Linking a student who is already claimed requires staff. That matches `members-auth.js` today.
- Self-serve “find my student” moves to the API and matches on the imported member id when the parent is signed in, not on a public name scan of the whole roster. The current `/api/member-lookup` returns only a key, a name, and a location, but it still confirms that a full name is enrolled. The new lookup requires an email that matches a guardian on file, or a staff session.

The Worker checks the Firebase token, then loads scope from Postgres. Firebase custom claims are not the source of truth, because `dashRole` and school lists already live in data and change without a token refresh.

`role` on the Firebase `staff` record stays `"admin"` or `"staff"` only, so `build-db-rules.py` in the website repo does not break. `dashRole` stays the dashboard tier. The CRM copies those fields; it does not invent a new value for `role`.

## API

`https://api.lvlupma.com/v1` (name is a suggestion). JSON, HTTPS only. Every mutation takes an `Idempotency-Key` header. Billing mutations require one even if the caller forgets; the server derives a key for charges and refuses to proceed without a caller key for refunds.

Auth header: `Authorization: Bearer {Firebase ID token}`. The Worker fetches Google’s certs, checks audience `lvlup-members-app`, and rejects a token whose email is not a guardian or a staff user.

Resources in the draft contract:

- `GET /v1/me` — family or staff scope
- locations, families, guardians, members
- plans, memberships, holds, cancellation requests
- class sessions, bookings, attendance
- leads and trials
- invoices, charges (read), refunds (staff, finance)
- `POST /v1/payment-profiles/accept` — body is an Accept.js opaque token plus `location_id`. Response is last4 and brand. The token is not logged and not stored.
- webhooks: `POST /v1/webhooks/authorize/{location_id}` verified with that merchant’s signature key

List endpoints filter by the caller’s schools. A front-desk token for Verona that asks for Waunakee gets 404, not an empty list that leaks counts.

Errors are `{ "error": { "code", "message" } }`. No stack traces, no Authorize.net raw bodies, no profile ids in 500 pages.

The OpenAPI file is the contract the dashboard, the website, and the Expo app generate types from. Pages Functions are not a second public API for these resources.

## Mobile

**Use Expo (React Native), managed workflow, EAS Build and Submit.**

Why this and not the alternatives:

- The team’s clients are JavaScript. Expo is TypeScript. The OpenAPI types are shared with a future dashboard module without a second language.
- One codebase ships to the App Store and Play Store. LVLUP does not have two native teams.
- The members site is already a PWA. That remains the browser client. The native app is for the things a home-screen shortcut does poorly: push when a draft fails or a belt test is posted, a check-in barcode, and offline video for the curriculum they already host.
- Flutter would be a new language and a new component set for a product whose first screens are lists, forms, and a schedule.
- Fully native Swift and Kotlin doubles every screen the first time a parent asks for a change.
- Wrapping `members.html` in a WebView would ship faster and would also freeze the GymDesk booking tabs inside the app. That misses the point of replacing GymDesk.

Suggested app shape, v1:

1. Email-link sign-in (Firebase, same as the website).
2. Family home: each child, their rank, the next class.
3. Book or cancel a class against our schedule, not a GymDesk tab.
4. Show the membership, the next draft date, last4, and a button that opens Accept.js to replace the card.
5. Push for a failed payment and for a hold decision.

Staff check-in mode (camera at the door) is v2. It should not block the parent app, and it should not replace the staff time clock.

## PCI scope

Tuition cards are Authorize.net’s. Our target is **SAQ A-EP** if we use Accept.js, or **SAQ A** if we use Accept Hosted (a hosted form we redirect or iframe). Accept.js is the better fit because adding a card should feel like the members app, not a bounce to another site. Accept Hosted is the fallback if a QSA wants the smaller scope.

Rules for every phase:

- Card number and CVV are typed into Authorize.net hosted fields. They never hit a Worker, a Pages Function, Firebase, or Postgres.
- The Worker sends the opaque token once, to `createCustomerPaymentProfile`, and discards it.
- Logs drop request bodies on `/payment-profiles/accept` and on the charge path.
- Stored fields are the two profile ids, brand, last4, expiry month and year, and the merchant account id. Expiry and last4 are allowed account data. A PAN is not.
- CVV is never stored, including in a ticket or a Slack message. The hold form already strips long digit runs; the CRM API rejects a body that looks like a card number.
- Each school’s API login and transaction key live in Worker secrets, named by location. A Waunakee charge cannot be routed at East Madison by swapping an id in the client. The server loads the merchant from the membership’s location.
- Sandbox keys and sandbox profiles until that school’s cutover checklist is signed. The production charge function refuses to run when `BILLING_MODE` is not `live` for that location.
- No card data in this git repo, in `gymdesk_data.json`, or in a support export.

This note is not a completed SAQ. A qualified assessor still has to look at the real integration before anyone tells a bank the scope is reduced.

## Security and privacy

- RLS enabled on every CRM table in the draft SQL. No policy grants `anon` or `authenticated`. The Worker uses the service role and applies school and family scope in code. A leaked anon key returns nothing.
- The training-app Supabase project is out of bounds. Its `users` table and seven other public tables currently have RLS off. That is a separate fix for that product. Enabling RLS there without policies would break it. This project does not run that SQL.
- Staff finance permission matches today’s rule: `role = admin` or `access.finance = true`. Other staff do not get invoice line items.
- Guardian tokens see their family’s members, schedules, and last4. They do not see merchant customer ids in the JSON. Those ids are server-side.
- Audit table for refunds, profile changes, exports, hold decisions, and `biller` flips. Who, when, which row, which school.
- Imports run from a machine with the service role, from files kept outside git. The import rejects a column named like a card number.
- PII in logs: email and phone are hashed or omitted on the charge path. Names are unnecessary in a billing log that already has a member id.
- Webhook endpoints verify the Authorize.net signature and dedupe on `notificationId`. A replay does not charge again, because charging is not what the webhook does. The webhook only confirms an attempt we already created.
- The unsigned `#clock` kiosk and the public marketing pages do not receive a CRM key.
- Retention: payment attempts are kept for accounting (7 years is the number to confirm with whoever does the taxes). Leads that never enroll can be deleted on a shorter clock. That clock is an open question, not a default buried in code.
- Children: the member record is the child. Marketing email and a login belong to the guardian. A student login, when it exists, cannot see a sibling’s invoices.

## What this platform does not absorb

| Stays where it is | Until |
|---|---|
| ATA EZSignup and the ATA portal (`atamartialarts.com`) | A deliberate decision. Testing **results** can be recorded here. Registration is not rebuilt. |
| Staff time clock, PTO, checklists, task photos | They are staff tools on Firebase and they work. |
| Square Kick Out Cancer pledges | Unrelated to tuition. |
| Stripe + Printful merch | Unrelated to tuition. A later phase can offer “charge the card on file” for a uniform; that is a one-off invoice, not a second Stripe integration that also stores cards. |
| `finance/gymdesk` snapshot | Kept as the historical series. New months come from our invoices once a school is cut over. The Annual Tracker already has a source order; add `crm` at the front of it in the cutover phase, not in this PR. |

## Roadmap

Effort is engineer-time for someone who already knows these two repos. It is not a calendar and not a promise about which month a school goes live. Phases are sequential where money is involved. Schema and API work inside a phase can overlap.

| Phase | What “done” means | Effort |
|---|---|---|
| 0. This design | Docs and a draft schema. No production change. | Done in this PR. |
| 1. Empty platform | New Supabase project. Schema applied **there**, not to `xxyndswrierztzdbjvrd`. Worker verifies a Firebase token and returns `/v1/me` for a staff user and a guardian. Sandbox Authorize.net merchant wired for one school. Accept.js test page that creates a sandbox profile and stores only ids. | About 3 engineer-weeks. |
| 2. Identity match | Read-only import of a GymDesk member export and a read-only CIM `getCustomerProfile` pull in a sandbox-or-report script. Crosswalk of GymDesk member id, Firebase `students/gymdesk_{id}`, and `customerProfileId`. A written unmatched report. No charges. | About 2 engineer-weeks, plus Mike’s export and a sandbox key. Waunakee first (363 profiles). |
| 3. Shadow billing | Engine creates invoices for one school and does not submit them. Diff against GymDesk’s payment export for a full 4-week cycle: same people, same amounts, same skipped holds. | About 4 engineer-weeks. |
| 4. Staff screens | Dashboard pages that **read** the API: roster, membership, last draft, hold queue. Replaces the “go type this into GymDesk” steps only after the data is trusted. Existing pages keep working. | About 4 engineer-weeks. |
| 5. Member web | `/book` writes a lead and a trial into the CRM for one school, and still mirrors to GymDesk until cutover if Mike wants zero lead loss. Members schedule reads our sessions. Hold form writes our `cancellation_requests` and keeps writing `ceo/cancellationRequests` until the dashboard reads the API. | About 4 engineer-weeks. |
| 6. Cutover, one school | Checklist in [MIGRATION.md](MIGRATION.md). GymDesk drafting paused for that school. `biller` flipped to `lvlup`. First live charge is a period GymDesk did not already collect. Watch one full interval. Then the next school. | About 1 engineer-week of tooling, then a billing interval of watching per school. |
| 7. Parent app | Expo app through TestFlight and an internal Play track: sign-in, schedule, card update, push on a failed draft. | About 6 engineer-weeks for v1. Store review sits outside that effort. |
| 8. Retire GymDesk | Remove widget proxies, CSV importers, product-URL prepaid, and the “update GymDesk” checklist steps. Snapshot job writes from our invoices. | About 2 engineer-weeks, after every school has billed once on the new engine. |

Phases 1–3 have no production charge and no change to `index.html` behavior beyond an optional new page behind a flag. This PR does not add that page.

## Risks worth naming now

- **Double billing** is the failure that matters. The guard is `biller` plus “period already collected,” not a careful person on cutover morning. See [MIGRATION.md](MIGRATION.md).
- **Two family-id algorithms** already exist in Firebase. The import must collapse them by email before guardians are invited.
- **The old Firebase project** (`va-dashboard-bf7ca`) is still in the events client and the roster worker. If that worker is live, it can hide members based on a watchlist that is no longer the roster. Confirm and stop it before the CRM becomes the roster people trust.
- **DeForest and Go Ninja** may not be “GymDesk location with its own CIM account” in the simple way the four LVLUP schools are. They are later cutovers, not the pilot.
- **4-week versus monthly** plans change proration math. Shadow billing will show a mismatch immediately if we guess wrong. That is why phase 3 exists.
