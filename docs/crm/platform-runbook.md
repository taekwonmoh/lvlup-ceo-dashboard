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

`npm test` applies `crm/migrations/` to a local database `crm_test` (and `crm_platform_test`). Charges, QuickBooks, and messages stay off.

Supabase CLI, from `crm/supabase`, against a new empty project only:

```bash
supabase start
supabase db reset
```

That needs Docker. This repo does not run `supabase link` and does not create a cloud project.

Worker, still local, still not deployed:

```bash
cd crm
npx wrangler dev --config worker/wrangler.jsonc --port 8788 --local
```

`GET /v1/health` does not need a database. Other routes need `DATABASE_URL` in `worker/.dev.vars` (gitignored) pointed at the local database. Intended hostname later: `api.lvlupma.com`. The Wrangler config does not bind that hostname.

## What Mike has to approve before anything is created

1. Create a **new** Supabase project (Postgres 15+, `us-east` or `us-west-2`). Do not reuse `xxyndswrierztzdbjvrd`.
2. Apply `crm/supabase/migrations/` to that project only. Seed is fixture data (`example.test`), not a roster.
3. Create the Cloudflare Worker. Do not attach a route yet.
4. Worker secrets, names only, values never in git:
   - `DATABASE_URL` for the new project
   - `AUTHORIZENET_MODE=sandbox`
   - `BILLING_CHARGES_ENABLED` unset or `0`
   - `QBO_ENABLED` unset or `0`
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

Phase 1 is this code: schema, API, import, shadow billing, guest trial and party contracts, geofence and QR check-in endpoints, journey API, dry-run dunning, automations, and QuickBooks payloads. It is not live.

Phase 2, after Mike asks for it: native app UI, live push, live email, certificate PDFs, a real Authorize.net submit, and a real QuickBooks submit. Those paths return `submitted: false`, `sent: false`, `pushSent: false`, or `pdf: null` today.
