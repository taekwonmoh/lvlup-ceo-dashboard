# Automations and two-way messaging

Dry-run only. This build plans journeys and stores family messages. It does not send email, SMS, push, or webhooks. `GET /v1/health` reports `automationDelivery`, `pushDelivery`, and `webhookDelivery` as `0` even if those environment variables are set to `1`.

Nothing here is deployed. Do not apply `crm/supabase/migrations/20261126000007_automations_messaging.sql` to Supabase project `xxyndswrierztzdbjvrd` or `belfzlyvgjheudxhviyt`. Local tests apply the same SQL as `crm/migrations/007_automations_messaging.sql`.

The staff dashboard `index.html` is unchanged.

## Why one catalog

Gus counted 275 GymDesk automations across six academies, about 80 distinct workflows in 12 categories. GymDesk copies a workflow once per school. This catalog keeps one workflow and stores the school differences on `location_automation_settings`:

| School | What differs |
|---|---|
| All six | Its own `review_url`. DeForest is not left blank, so a missing link cannot fall through to Waunakee. The seeded links are `https://reviews.example.test/{school}` placeholders. |
| Waunakee | `programs.fitboxing` is true. The other schools are false, so Fitboxing journeys do not enroll there. |
| `goninjaW`, `goninjaV` | `toggles.birthday_waiver` is true. The birthday journey is brand `goninja`, so East Madison and the other LVLUP schools do not enroll. |

57 workflows. Counts: BOOK 6, LEAD 9, NOSHOW 6, ONB 2, ONB90 1, OPS 1, PROG 9, RET 10, SRC 8, TRIAL 3, WATCHLIST 1, GONINJA 1. Copy is generic. There are no member records, membership product labels, phone numbers, or session ids in the seed.

## Triggers, exits, and steps

Triggers: `membership_start`, `new_booking`, `manual`, `new_lead`, `booking_no_show`, `promotion`, `absence`, `member_frozen`.

`new_booking` and `booking_no_show` match `program_slug` and `class_kind` (`intro`, `regular`, `event`, `birthday`). A session id in the request is rejected with `session_id_not_accepted`.

Exit names on a workflow, such as `membership_started` or `class_booked`, end the enrollment before any send step when that fact is already true. `absence_wait` stops the rest of the journey when `class_booked` becomes true.

Steps: `delay`, `email`, `sms`, `push`, `split`, `start_automation`, `task`, `add_tag`, `remove_tag`, `absence_wait`, `webhook`, `add_document`.

An SMS step is allowed in the catalog. The rendered row sets `destination` to null, `delivered` to false, and `reason` to `sms_delivery_disabled`. No phone number is stored.

Public merge tags: `{first_name}`, `{parent_first_name}`, `{name}`, `{email}`, `{member_id}`, `{full_name}`, `{guardian_name}`, `{location_name}`, `{review_url}`. `{phone}`, `tel:` links, `sms:` links, and footer lines that start with “call us” or “phone” are stripped before a template is rendered. `{review_url}` comes from that school’s settings row.

## The four GymDesk fixes

1. **Webhook school.** Watch-list hooks use `https://hooks.example.test/watchlist?location={location_id}`. The engine substitutes the member’s `location_id`. If a template still has `location=waunakee`, that value is rewritten to the member’s school. Verona and DeForest no longer report as Waunakee. The signing secret is the environment variable `WATCHLIST_WEBHOOK_SECRET`. The rendered row stores `secretPresent` and `secretEnv` only. The secret value is not written to the database or the response. `delivered` stays false.
2. **Program and class kind.** Triggers do not store GymDesk session ids. Fitboxing is a program flag, not a copied workflow.
3. **`location_automation_settings`.** Review link, program flags, and toggles (`watchlist`, `onb90`, `birthday_waiver`) live on the school. `GET` and `PATCH /v1/locations/{id}/automation-settings` read and update that row. A school lead can patch their own school. Turning delivery on is not a setting.
4. **Go Ninja birthday waivers.** `goninja_birthday_waiver` runs for `class_kind: birthday` at `goninjaW` and `goninjaV`. It records `birthday_waiver_host` and `birthday_waiver_guest` on `automation_document_grants` (and on `member_documents` when the booking has a member). One workflow covers both schools.

The 90-day journey (`onb90_sequence`) is a single workflow: day 1, 7, 14, 21, 30, 70, and 80 checks, a class 1 note, an NPS survey note, a Tiger Leaders invite, and a track-from-class task. Delays are recorded and not waited on. `sequence` must be `ninety_day`, so a normal membership start does not enroll it.

Yellow belt (`prog_yellow_sparring`) is the sparring-gear prompt. It matches `rank_slug: yellow`.

## HTTP

Staff routes, local Node server (`crm/src/server.ts`). The Worker file only answers `GET /v1/health` and does not attach a hostname.

| Method | Path | Who |
|---|---|---|
| `GET` | `/v1/automations` | Staff. Optional `category`. |
| `PATCH` | `/v1/automations/{id}` | Owner. `staffNote` only. `enabled: true` returns 409. |
| `GET`, `PATCH` | `/v1/locations/{id}/automation-settings` | Staff of that school. School lead or owner can patch. |
| `POST` | `/v1/automations/evaluate` | Owner, school lead, or ops. Writes enrollments and `dry_run` step rows. |
| `GET` | `/v1/automations/runs` | Staff, scoped to their schools. |
| `POST` | `/v1/automations/run` | Owner. The older six rules. Still `sent: false`. |
| `GET`, `POST` | `/v1/messages/threads` | Family sees only their `family_id`. Staff see their schools. |
| `GET` | `/v1/messages/threads/{id}` | Same scope. |
| `POST` | `/v1/messages/threads/{id}/messages` | A reply. The other side’s unread count goes up. |
| `POST` | `/v1/messages/threads/{id}/read` | Writes `message_read_receipts` and clears that side’s unread count. |
| `GET` | `/v1/messages/unread` | Badge count for the caller. |
| `GET` | `/v1/messages/push-outbox` | Staff. Every row is `delivered: false`, `dry_run: true`. |

A family message queues a push for staff device tokens at that school. A staff reply queues a push for the family’s guardian and member device tokens. The outbox stores device-token ids, not the token strings. `PUSH_DELIVERY_ENABLED` does not send them.

`GET /v1/families/{id}/timeline` and `GET /v1/members/{id}/timeline` include `message` and `automation` rows next to attendance, rank events, ledger lines, and leads.

## Row security

`crm_app` is `NOBYPASSRLS`. Family actors can read and write threads, messages, and receipts only when `family_id` is one of `crm.families`. A family insert with `sender_type = staff` fails. A family cannot read another family’s threads, the workflow catalog, or staff-audience push rows. Staff actors are limited to `crm.locations`. The HTTP API checks the same scope before it writes. The table owner used by the local server bypasses RLS; the policies are what a `crm_app` connection enforces.

## Before any live delivery

Do all of this in a later build that Mike asks for. Flipping the flags in this build still returns `sent: false`.

1. Apply migration `20261126000007_automations_messaging.sql` only on a new empty Supabase project. Do not apply it to `xxyndswrierztzdbjvrd` or `belfzlyvgjheudxhviyt`.
2. Replace each `https://reviews.example.test/{school}` placeholder with that school’s real review link, including DeForest.
3. Confirm Fitboxing stays Waunakee-only and that both Go Ninja schools keep the birthday waiver toggle.
4. Add a sender for email. SMS still needs a consented destination stored outside git. This catalog does not contain numbers.
5. Add Apple and Google push credentials, then a worker that reads `push_notification_outbox` and is allowed to set `delivered`. The current check constraint refuses that update.
6. Put `WATCHLIST_WEBHOOK_SECRET` in Worker secrets and point the hook at a URL that reads `location` from the query string.
7. Review the 57 templates, add opt-out, and decide quiet hours.
8. Run a school in dry-run (`POST /v1/automations/evaluate` and the runs list) until the enrollments look right. Only then consider a build that can deliver.
