# Phase 1 and Phase 2

Phase 1 is the platform in this pull request. It is code, migrations, and tests. It does not go live on 4 January 2027 by itself. Phase 2 is the native app and any live send or charge. See [platform-runbook.md](platform-runbook.md).

## Phase 1 (ready to rehearse, not to bill)

| Capability | Where it lives | Live behavior |
|---|---|---|
| Schools, families, guardians, members, plans, memberships, holds | `crm/migrations/` | Not applied to a cloud project |
| Ranks, stripes, Mini Tiger to Tiger to color belt to 9th Degree, career rows | `005` plus `006`, `GET /v1/members/{id}/journey` | Reads the catalog. Career criteria with `needs_signoff` stay blank |
| GymDesk fixture import, email dedupe, both Firebase family ids kept | `POST /v1/imports/gymdesk-staging` | Fixture files only |
| Shadow invoices and the three-way payment compare | `POST /v1/billing/shadow` | `submitted: false` |
| Roster, holds, school-lead approval | `/v1/roster`, `/v1/holds/{id}/decision` | Staff token, school scope |
| Class book, capacity, waitlist, self-cancel | `/v1/sessions/{id}/bookings`, `/v1/bookings/{id}/cancel` | No charge |
| Geofence and one-scan family check-in | `/v1/check-ins/geofence`, `/v1/check-ins/family` | Sources `geofence_auto`, `qr_scan`, `kiosk`, `manual`. Coordinates are not stored |
| Guest trial and Go Ninja party | `/v1/public/trials`, `/v1/public/goninja/bookings` | No account. No phone field. Party `charged` cannot be true |
| Lead convert | `POST /v1/leads/{id}/convert` | Writes family, member, waiver copy, ledger row |
| Dunning schedule, statements | `/v1/billing/dunning/preview`, `/v1/families/{id}/statements` | `sent: false`, `delivery: not_sent` |
| Automations | `automation_rules`, `communication_log` | Rules cannot be enabled. Log status can only be `dry_run` |
| QuickBooks payloads | `POST /v1/qbo/preview` | `submitted: false`. Flag `1` still refuses the network |
| Device token and curriculum read | `POST /v1/devices`, `GET /v1/members/{id}/resources` | `pushSent: false` |
| Bulk promotion | `POST /v1/promotions/bulk` | Certificate row `not_generated`, `pdf: null` |
| Private-lesson payout math | `crm/src/payouts.ts` | No payment leaves the building |
| Crosswalk RLS | `crm_private.identity_crosswalk` | Family role sees zero rows |

## Phase 2 (not in this build)

- iOS and Android UI, App Store, and Play Store
- Live Apple or Google push
- Live email from the automation or dunning tables
- Certificate PDF files
- Authorize.net `createTransactionRequest` over the network
- Intuit OAuth and a real journal or bill post
- Replacing the GymDesk widget on lvlupma.com and the Go Ninja site
- Surveyed campus coordinates

Those wait until Mike asks for them in his own words.
