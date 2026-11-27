# CRM platform runbook

Nothing in this folder is deployed. Do not apply these migrations to Supabase project `xxyndswrierztzdbjvrd`. Do not point the Worker at live Firebase, GymDesk, or Authorize.net. Mike has to approve every provisioning step and any merge in his own words.

Candidate billing cutover mornings are **4 January 2027** and, if that interval is not clean, **2 February 2027**. Neither date is scheduled. A school does not cut over until a full shadow interval matches GymDesk.

## Local

```bash
cd crm
npm install
npm test
npm start
```

`npm test` applies `crm/migrations/` through `013_templates_system_emails.sql` (Supabase filenames `20261127000009` through `20261127000013`) to a local database `crm_test` (and `crm_platform_test`, `crm_messaging_test`, `crm_rollover_test`, `crm_wave_test`, `crm_wave_two_test`). Charges, QuickBooks, journey delivery, and push stay off. Wave 1 profiles, tags, and forms are described in [GYMDESK-UPDATES-WAVE1.md](GYMDESK-UPDATES-WAVE1.md). Wave 2 schedule, billing preview, and templates are described in [GYMDESK-UPDATES-WAVE2.md](GYMDESK-UPDATES-WAVE2.md).

Supabase CLI, from `crm/supabase`, against a new empty project only:

```bash
supabase start
supabase db reset
```

That needs Docker. This repo does not run `supabase link` and does not create a cloud project.

Worker `lvlup-crm-api` serves the same `/v1` routes as the Node server. SQL, validators, and billing rules stay in `crm/src`. `crm/worker/src/routes.ts` is the shared dispatcher, so the two hosts do not keep two copies of the route logic. This repo still does not deploy the Worker.

```bash
cd crm
npm install
npm test
npm run typecheck
npm run worker:dry-run
npx wrangler dev --config worker/wrangler.jsonc --port 8788 --local
```

`npm run worker:dry-run` builds the Worker. It does not deploy and it does not attach a hostname.

Database, in order:

- `env.HYPERDRIVE.connectionString` when the Hyperdrive binding is present.
- `env.DATABASE_URL` when it is not (local `worker/.dev.vars`, gitignored).
- Neither value is logged, returned, or written into a health payload.

`GET /v1/health` is `200` with `ok: true`, sandbox and dry-run flags (`charges` and `qbo` false, delivery flags `0`), and `db: { configured, via, connected }`. `via` is `hyperdrive`, `database_url`, or `none`. When a database is configured, health runs `SELECT 1`. A connection failure sets `connected` to false and does not include the URL. Routes that read Postgres return 503 until one of those sources is set. Rank, cycle, curriculum, home, and financial routes do not need a connection.

`crm/worker/wrangler.jsonc`:

- `nodejs_compat` is on so `pg` can use the Hyperdrive connection string. `pg` is `^8.16.3`, the minimum Hyperdrive accepts.
- `workers_dev` is true so a later sandbox deploy can use the workers.dev subdomain. There is no `routes` entry and no custom domain. `api.lvlupma.com` is not attached.
- Hyperdrive config `lvlup-crm-db` is bound as `HYPERDRIVE` with id `d711e181a6bb4f869ca9ac79f69382f7`. That id is not a secret. The database password stays in Hyperdrive, not in git. Do not point this binding at `xxyndswrierztzdbjvrd`.

Safety vars in that file stay sandbox / off: `AUTHORIZENET_MODE=sandbox`, `BILLING_CHARGES_ENABLED=0`, `QBO_ENABLED=0`, `AUTOMATION_DELIVERY_ENABLED=0`, `PUSH_DELIVERY_ENABLED=0`, `WEBHOOK_DELIVERY_ENABLED=0`, `CRM_ALLOW_LOCAL_TOKENS=0`, `FIREBASE_PROJECT_ID=lvlup-members-app`.

`CRM_ALLOW_LOCAL_TOKENS=0` means the Worker rejects the local HMAC tokens the tests use. The Node server still accepts those tokens when the variable is unset, which is how `npm test` signs in. For `wrangler dev` only, set `CRM_ALLOW_LOCAL_TOKENS=1` and `CRM_TOKEN_SECRET` in `worker/.dev.vars`. The Worker does not fall back to a built-in signing secret. Do not set the flag on a deployed Worker.

## What Mike has to approve before anything is created

1. Create a **new** Supabase project (Postgres 15+, `us-east` or `us-west-2`). Do not reuse `xxyndswrierztzdbjvrd`.
2. Apply `crm/supabase/migrations/` to that project only. Seed is fixture data (`example.test`), not a roster.
3. Create the Cloudflare Worker. Do not attach a route yet. Hyperdrive `lvlup-crm-db` (`d711e181a6bb4f869ca9ac79f69382f7`) is bound in `crm/worker/wrangler.jsonc`.
4. Worker secrets, names only, values never in git:
   - The Hyperdrive id above is public configuration. The database password stays in Hyperdrive. `DATABASE_URL` remains the local fallback secret.
   - `AUTHORIZENET_MODE=sandbox`
   - `BILLING_CHARGES_ENABLED` unset or `0`
   - `QBO_ENABLED` unset or `0`
   - `AUTOMATION_DELIVERY_ENABLED` unset or `0`
   - `PUSH_DELIVERY_ENABLED` unset or `0`
   - `WEBHOOK_DELIVERY_ENABLED` unset or `0`
   - `WATCHLIST_WEBHOOK_SECRET` only when a later build is allowed to call the watch-list hook. This build reads the name and never sends it
   - `CRM_ALLOW_LOCAL_TOKENS=0` outside local dev
   - Per merchant, sandbox only: `AUTHORIZENET_WAUNAKEE_API_LOGIN`, `AUTHORIZENET_WAUNAKEE_TRANSACTION_KEY`, `AUTHORIZENET_WAUNAKEE_SIGNATURE_KEY`, and the same pattern for `EASTMAD` and `VERONA`
5. DNS for `api.lvlupma.com` is a later change. Do not add it in this phase.
6. Firebase stays the login provider (`lvlup-members-app`). The Worker verifies ID tokens. It does not write Firebase.
7. GymDesk exports and CIM profile checks stay outside git. The import job in tests reads `crm/fixtures/platform/` only.
8. QuickBooks OAuth for three companies is a separate approval. See [QUICKBOOKS.md](QUICKBOOKS.md). DeForest and both Go Ninja schools follow the tuition merchant (Waunakee or Verona) until Mike confirms that mapping.
9. School geofence coordinates are not in git. Mike enters latitude, longitude, and a radius (100–150 m is the example) per school before any phone build uses check-in.
10. Career milestones that say `needs_signoff` stay blank until Mike sets them. See [RANK-JOURNEY.md](RANK-JOURNEY.md).

## Go-live checklist (one school, after shadow is clean)

1. Export GymDesk payments one last time. Set `paid_through_on` from the last successful tuition charge.
2. Stop GymDesk drafting for that school and confirm a member due the next day will not also be charged there.
3. Flip `biller` to `lvlup` only where `paid_through_on` is set and a payment profile exists.
4. Leave everyone else on `gymdesk` with a task list (missing card, unmatched profile, open hold).
5. Set `live_billing_enabled` for that location only. The charge function in this build still refuses to call Authorize.net.
6. The first live cron, in a later build Mike approves, submits only periods that start after `paid_through_on`.
7. For 48 hours, compare new transaction ids with GymDesk. Any member charged in both systems for the same period is refunded on our side by a person, not by an unattended script.
8. Rollback before any live approval: `live_billing_enabled` false and `biller` back to `gymdesk`. After an approval exists, leave `lvlup` on people we successfully charged.

Waunakee first, then East Madison, then Verona. DeForest and Go Ninja wait on the merchant confirmation above.

## Phase 1 vs Phase 2

Phase 1 is this code: schema, API, import, shadow billing, guest trial and party contracts, geofence and QR check-in endpoints, journey API, dry-run dunning, the canonical automation catalog, two-way message threads, QuickBooks payloads, and the dry-run rollover, tuition-credit, and referral routes. It is not live. Migration `20261126000007_automations_messaging.sql` adds the automation and messaging tables. Migration `20261126000008_rollover_credits_referrals.sql` adds prepaid rollover, the credit ledger, and referrals. Migrations `20261127000009_profiles_tags_contacts.sql` and `20261127000010_forms_consent_invites.sql` add wave 1 profiles, tags, forms, consent, and invites. Migrations `20261127000011_schedule_booking_updates.sql`, `20261127000012_billing_soldby_categories.sql`, and `20261127000013_templates_system_emails.sql` add wave 2 schedule, billing preview, sold-by, income categories, templates, and system-email toggles. Health reports `automationDelivery`, `pushDelivery`, and `webhookDelivery` as `0`.

## Prepaid rollover, tuition credits, and referrals

These three behaviors are sandbox drafts. `BILLING_CHARGES_ENABLED`, `AUTOMATION_DELIVERY_ENABLED`, `PUSH_DELIVERY_ENABLED`, `WEBHOOK_DELIVERY_ENABLED`, and `QBO_ENABLED` stay `0`. A draft invoice is not a charge. The referral thanks automation (`ret_referral_thanks`) is planned and stored as `dry_run`. Nothing in this build calls Authorize.net, GymDesk, QuickBooks, or a messaging provider.

Staff routes, all under `/v1` and still local:

- `POST /v1/memberships/:id/rollover` configures a prepaid membership to start a `monthly`, `weekly`, or `every_4_weeks` draft on or after `paid_through_date` (`paid_through_on` in the table). `4_weeks` is stored as `every_4_weeks`. `cancel: true` is the opt-out.
- `POST /v1/billing/drafts` builds that would-charge invoice and applies family tuition credits. A second call for the same period returns the same invoice.
- `POST /v1/families/:id/credits` issues or adjusts a credit in one step. `GET` is the balance a family sees on the billing screen.
- `POST /v1/referrals/codes`, `GET /v1/referrals`, and `POST /v1/referrals/rules` are the referral book. A public trial body may include `referralCode`.

Families read their own code, referral status, and credit balance. Staff are limited to their schools. The detail is in [ROLLOVER-CREDITS-REFERRALS.md](ROLLOVER-CREDITS-REFERRALS.md).

Phase 2, after Mike asks for it: native app UI, live push, live email, live SMS, live webhooks, certificate PDFs, a real Authorize.net submit, and a real QuickBooks submit. Those paths return `submitted: false`, `sent: false`, `delivered: false`, `pushSent: false`, or `pdf: null` today. See [AUTOMATIONS-AND-MESSAGING.md](AUTOMATIONS-AND-MESSAGING.md).
