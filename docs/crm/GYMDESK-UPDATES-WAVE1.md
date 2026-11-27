# GymDesk updates, wave 1

Areas A, B, and C of the product-update list: profiles, tags, and forms. This is local CRM code. It does not change `index.html`, the staff dashboard, or `api.lvlupma.com`.

`BILLING_CHARGES_ENABLED`, `QBO_ENABLED`, `AUTOMATION_DELIVERY_ENABLED`, `PUSH_DELIVERY_ENABLED`, and `WEBHOOK_DELIVERY_ENABLED` stay `0`. `AUTHORIZENET_MODE` stays `sandbox`. Invite rows keep `sent_at` null. Automation steps stay `dry_run`.

## Schema

Local tests apply `crm/migrations/009_profiles_tags_contacts.sql` and `010_forms_consent_invites.sql`.

Supabase, on a new empty project only, applies the same statements as:

- `crm/supabase/migrations/20261127000009_profiles_tags_contacts.sql`
- `crm/supabase/migrations/20261127000010_forms_consent_invites.sql`

The copies named `009_profiles_tags_contacts.sql` and `010_forms_consent_invites.sql` are the same SQL, guarded so a lexical sort that runs them before `20261126000001_core.sql` does not fail. Do not apply any of these files to project `xxyndswrierztzdbjvrd`.

Every new table has row level security and policies for `crm_app`. The Worker still connects as the table owner and scopes in code. There is no anon policy and no public storage URL.

## What staff can do

- Leads store separate participant and guardian first and last names. `public.backfill_person_names()` fills those from the older single-name columns.
- A public form or trial waiver for a minor requires a guardian first name, last name, and signature.
- `member_contacts` holds emergency, pickup, and other contacts. The school label defaults to `Emergency contacts` (`locations.contacts_label`).
- `POST /v1/leads` creates a lead with separate names and an optional note.
- Notes are soft-deleted. At most three notes can be pinned on one member, lead, or family. The fourth pin returns 409 `pinned_note_cap`.
- Member photos store a private path (`members/{id}/photo`). The API returns signed `/v1/...` links, not a public object URL.
- `custom_statuses` is a label. `members.status` and `leads.status` stay the billing enums. `POST /v1/members/bulk-status` can preview (`dryRun: true`) and writes one `audit_log` row per real change.
- Tags can belong to one school or to every school (`location_id` null, admin only). `POST /v1/tags/bulk-apply` adds or removes them. `GET /v1/members?tag=` and `GET /v1/leads?tag=` filter by name or id.
- Task definitions and completions store `tag_ids_add` and `tag_ids_remove`. Applying them writes `entity_tags` with source `task`.
- Automation `add_tag` and `remove_tag` look up `tags` and, while the workflow is dry-run, record `applied: false` and `reason: dry_run` on the step. They do not insert `entity_tags` in that mode.

## Forms, consent, and invites

- `GET /v1/public/forms/{slug}` returns the theme, fields, required documents, and plans in `sort_order`.
- `POST /v1/public/forms/{slug}/submit` stores the lead, the answers, and the email opt-in. A signup or trial form also creates a trial member. It does not charge a card. The response includes `redirectUrl` when the form has an `https://` redirect.
- `PUT /v1/forms/{id}/plans/order` sets that order.
- `notification_preferences` stores `marketing_source`, `marketing_consented_at`, and `marketing_revoked_at`.
- Workflows with `marketing = true` are skipped when the person has not opted in. The dry-run enrollment exits with `marketing_opt_out`.
- `POST /v1/leads/{id}/invites` returns the link and the token once. `sent_at` stays null. Accepting the link sets `accepted_at` and fires the dry-run `lead_invite_accepted` workflow.
- Seeded dry-run workflows: `lead_form_submitted` (`form_submitted`, marketing), `book_cancelled` (`booking_cancelled`), and `lead_invite_accepted`.

## Routes

| Method | Path |
|---|---|
| GET, POST, PATCH | `/v1/members/{id}/notes` |
| POST | `/v1/notes/{id}/pin` |
| GET, PUT | `/v1/families/{id}/contacts` |
| POST, GET | `/v1/members/{id}/photo` |
| GET, POST, PATCH | `/v1/statuses` |
| POST | `/v1/members/bulk-status` |
| POST | `/v1/leads` |
| GET, POST, PATCH | `/v1/tags` |
| POST | `/v1/tags/bulk-apply` |
| GET | `/v1/members?tag=` and `/v1/leads?tag=` |
| GET | `/v1/public/forms/{slug}` |
| POST | `/v1/public/forms/{slug}/submit` |
| GET, POST, PATCH | `/v1/forms` |
| PUT | `/v1/forms/{id}/plans/order` |
| POST | `/v1/leads/{id}/invites` |
| POST | `/v1/public/invites/{token}/accept` |
