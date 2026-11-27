# GymDesk updates, wave 2

Areas D, E, and F of the product-update list: schedule and booking, membership and billing preview, and templates. This is local CRM code. It does not change `index.html`, the staff dashboard, or `api.lvlupma.com`.

`BILLING_CHARGES_ENABLED`, `QBO_ENABLED`, `AUTOMATION_DELIVERY_ENABLED`, `PUSH_DELIVERY_ENABLED`, and `WEBHOOK_DELIVERY_ENABLED` stay `0`. `AUTHORIZENET_MODE` stays `sandbox`. Upcoming payment edits, fee lines, QuickBooks groups, and system emails are previews. A saved template never sends. The new-member staff alert is stored as `not_sent`.

## Schema

Local tests apply `crm/migrations/011_schedule_booking_updates.sql`, `012_billing_soldby_categories.sql`, and `013_templates_system_emails.sql`.

Supabase, on a new empty project only, applies the same statements as:

- `crm/supabase/migrations/20261127000011_schedule_booking_updates.sql`
- `crm/supabase/migrations/20261127000012_billing_soldby_categories.sql`
- `crm/supabase/migrations/20261127000013_templates_system_emails.sql`

The copies named `011_schedule_booking_updates.sql`, `012_billing_soldby_categories.sql`, and `013_templates_system_emails.sql` are the same SQL, guarded so a lexical sort that runs them before `20261126000001_core.sql` does not fail. Do not apply any of these files to project `xxyndswrierztzdbjvrd`.

Every new table has row level security and policies for `crm_app`. The Worker still connects as the table owner and scopes in code. There is no anon policy.

## Schedule and booking

- `class_session_programs` and `class_template_programs` hold every program on a class. Existing single `program` values are copied in. One attendance counts toward each of those programs. Capacity stays the session’s own seat count.
- `session_booking_options` stores member, trial, drop-in, and paid options. A price there is not a charge.
- `locations.no_show_grace_min` is null until a school turns the job on. `POST /v1/jobs/release-no-shows` marks a booked row `released` after `starts_at` plus that grace when nobody was marked present, promotes the earliest waitlisted booking, writes `audit_log`, and records a dry-run `booking_no_show` event.
- `POST /v1/attendance` accepts a member, school, date, and program. `sessionId` is optional. Without it the source is `open_mat` and `check_ins.session_id` is null.
- `POST /v1/kiosk-sessions` pre-selects a class. `POST /v1/check-ins/family` uses that row when `sessionId` is omitted. A failed check-in includes a stable `reason` and `alert: true`.
- `POST /v1/bookings` books `memberIds` or `leadIds`. A lead moves to `pipeline_status` `trial_booked`.
- `GET /v1/bookings` filters by date, session, instructor, program, status, and school.
- `POST /v1/sessions/{id}/duplicate` copies the session, its programs, and its booking options. It does not copy bookings.
- `GET /v1/schedule?view=month|week|day|list` uses the windows in `scheduleRange`. Weeks start Monday. List is 28 days.
- `staff_users.ui_prefs` stores `default_schedule_location` and `default_view`. `GET` and `PATCH /v1/me/prefs` read and write those two keys.

## Membership, billing preview, sold-by, categories

- A plan or membership can wait for the first check-in. The shadow anchor is the first `attended_on` on or after the start date. Until that visit, upcoming drafts are empty.
- `GET /v1/memberships/{id}/upcoming` previews the next drafts. `POST .../override` and `POST /v1/payment-overrides/{id}/undo` edit that preview. `PATCH /v1/memberships/{id}` changes `started_on`, `ends_on`, or `payment_profile_id` only after `guardedPriceChange` sees a snapshot. None of these submit a charge.
- `sale_credits` points at one membership, retail purchase, or event registration. Omitted shares split evenly. The total cannot pass 10000 basis points. Edits write `audit_log`.
- `GET /v1/members` and `GET /v1/members.csv` accept `startedFrom`, `startedTo`, `cardExpired=true|soon`, `soldBy`, `tag`, `status`, and `customStatus`. The CSV has names and status. It does not include a phone number or a GymDesk member id.
- `plans.sessions_per_period` turns on a class-credit balance in `session_credit_ledger`. A null `rollover_cap` rolls unused visits without a ceiling. This is separate from prepaid renewal rollover. A booking that needs a credit and has none left returns 409 `session_credits`.
- `membership_location_access` lets a family’s membership check in and book at another school.
- `merchant_accounts.pass_through` defaults to false, so `/v1/charges/preview` and `/v1/quotes` return `processingFeeCents: 0` until that flag is turned on for a school.
- `income_categories` can be set on plans, retail, events, parties, lessons, and invoice lines. `GET /v1/reports/income.csv` and `POST /v1/qbo/category-preview` group by category. The QuickBooks body is `submitted: false`.

## Templates and system emails

- `GET`, `POST`, and `PATCH /v1/templates` save email, push, or in-app copy. Merge tags must be in `PUBLIC_MERGE_TAGS`. Saving does not write a send.
- An automation step can store `template_id`. That link does not run the step.
- `system_emails` is the catalog (`booking_confirmation`, `class_reminder`, `receipt`, `failed_payment`, `new_member_staff_alert`). `GET` and `PUT /v1/settings/system-emails` are for an admin or someone with `can_finance`. A missing row means the code is enabled.
- `POST /v1/memberships/{id}/staff-alert` builds the staff note (member, program, plan, first bill date, last4, source, sold-by) and writes `communication_log.status = 'not_sent'`.

## Routes

| Method | Path |
|---|---|
| POST | `/v1/attendance` |
| POST, GET | `/v1/bookings` |
| POST | `/v1/sessions/{id}/duplicate` |
| GET | `/v1/schedule` |
| GET, PATCH | `/v1/me/prefs` |
| POST | `/v1/kiosk-sessions` |
| POST | `/v1/booking-options` |
| POST | `/v1/jobs/release-no-shows` |
| GET | `/v1/memberships/{id}/upcoming` |
| POST | `/v1/memberships/{id}/upcoming/{dueOn}/override` |
| POST | `/v1/payment-overrides/{id}/undo` |
| PATCH | `/v1/memberships/{id}` |
| PUT | `/v1/memberships/{id}/location-access` |
| POST, PATCH | `/v1/sale-credits` |
| GET | `/v1/members` with the filters above, and `/v1/members.csv` |
| GET | `/v1/reports/income.csv` |
| POST | `/v1/qbo/category-preview` |
| GET, POST, PATCH | `/v1/templates` |
| PATCH | `/v1/automation-steps/{id}` |
| GET, PUT | `/v1/settings/system-emails` |
| POST | `/v1/memberships/{id}/staff-alert` |
