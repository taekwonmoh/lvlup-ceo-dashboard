# Data model

Draft for the new Postgres project. The DDL is [schema/001_init.sql](schema/001_init.sql). It is not applied to any database.

Money is integer cents. Dates that staff think of as “the day it happened” are `date` in America/Chicago. Timestamps are `timestamptz`. Location ids are the six canonical keys: `waunakee`, `eastmad`, `verona`, `deforest`, `goninjaW`, `goninjaV`.

## Schools

`brands`: `lvlup`, `goninja`.

`locations`: one row per school. Brand, display name, timezone (`America/Chicago` for all six today), public booking slug, and the GymDesk gym id and member-portal host kept as `external_refs` so the migration can reconcile widgets. Those GymDesk ids are public (they are in the website) and they are not secrets.

`merchant_accounts`: one per location that drafts tuition. Columns are the Authorize.net account label, the API-login **id** (not the transaction key), `environment` (`sandbox` or `live`), and `live_billing_enabled` (default false). The transaction key and the webhook signature key are Worker secrets, named by `location_id`. A row existing here does not mean we are allowed to charge.

DeForest may need a second “reporting” note for the MPK split and for MyStudio collections. That is a `location_finance_notes` text field, not a second merchant, until Mike says which account actually drafts.

## People

```
family ──< guardian_family >── guardian (email, can sign in)
   │
   └──< membership (one school, one plan, one merchant)
            │
            └──< membership_member >── member (the student)
```

`families`: id, optional display name (default is the primary guardian’s last name), primary location if they have one. No balance column. Balance is the sum of open invoices.

`guardians`: one row per email. Name, phone, `firebase_uid` once they have signed in. Emails are unique.

`guardian_families`: `payer`, `contact`, or both. A payer can update the payment profile and file a cancellation. A contact receives mail and cannot change the card. The import marks the GymDesk receipt email as payer.

`members`: the student. `family_id`, `location_id` (home school), legal name, preferred name, birth date, status (`active`, `trial`, `hold`, `cancelled`, `inactive`). ATA number, when we have one, lives here and **never in git**. Optional `firebase_student_key` (`gymdesk_123`, `bb_…`) so the members app can keep reading journey data during the bridge.

`member_guardians` is not a second path. The family is the link. A child at two schools is still one member row if it is the same child; they can have two memberships. If GymDesk has two member ids for one child (a known duplicate shape, alongside `bb_` rows), `external_ids` holds both and one member row wins. Staff merge is a later tool. The import does not guess a merge on name alone.

## Memberships and plans

`plans`: `location_id`, name (`Standard`, `Mini-Tigers`, `Athlete Development`, `Legacy`, `Tiger Leaders`, Go Ninja membership, party package), `amount_cents`, `interval` (`every_4_weeks`, `monthly`, `prepaid_term`), `program` (`taekwondo`, `mini_tigers`, `tigers`, `leadership`, `goninja`). Price changes insert a new plan version. Memberships point at the version they were sold.

`memberships`:

| Column | Meaning |
|---|---|
| `family_id`, `location_id`, `plan_id` | Who pays, which merchant, which price. |
| `status` | `trial`, `active`, `hold`, `pending_cancel`, `cancelled`, `past_due`. |
| `biller` | `gymdesk` or `lvlup`. The engine charges only `lvlup`. |
| `started_on`, `anchor_on` | Anchor is the date the 4-week (or monthly) cycle counts from. |
| `next_bill_on` | Next draft date. Null when prepaid through a term or when cancelled. |
| `paid_through_on` | Last period GymDesk or we successfully collected. Cutover will not draft a period that ends on or before this date. |
| `gymdesk_member_id` | The id we join to CIM `merchantCustomerId`. |

`membership_members`: which students this dues row covers. A standard plan is one student. A future family discount is a plan, not a special case in the charge code.

One-time money (Legacy investment, leadership uniform, a birthday party deposit, a prepaid year) is an invoice with no change to `next_bill_on`, or a prepaid membership whose `next_bill_on` is the day after the term.

## Ranks and testing

ATA Songahm for LVLUP color belts, stored as data so a wrong stripe rule is a row change:

`rank_programs`: `songahm`, `tiger`, `mini_tiger`, `goninja`.

`ranks`: program, sort order, name. Seed for `songahm`, in order: White, Orange, Yellow, Camo, Green, Purple, Blue, Brown, Red, Red/Black, then 1st through 9th degree black. This seed is the usual Songahm sequence. Mike should confirm it against the rank list staff actually type into GymDesk before anyone is promoted from it.

`rank_stripe_defs`: for Red/Black the members app already uses four stripes, `blue`, `black`, `silver`, `gold`. Other ranks can have zero or one stripe until someone writes the real rule down. The schema allows N named stripes per rank. It does not invent a stripe for every color.

`member_rank_events`: member, rank, stripe, `awarded_on`, source (`gymdesk_import`, `staff`, `testing`). Current rank is the latest event, not a column that gets edited in place. `students.gymdeskRank` during the bridge is a mirror of that latest event.

`testing_events`: location, date, program, optional external URL (EZSignup or the ATA portal). `testing_registrations`: member, event, status (`eligible`, `registered`, `passed`, `not_passed`, `no_show`). Passing writes a `member_rank_event`. This platform does not call ATA.

## Attendance and the schedule

`class_templates`: location, program, weekday, local start time, duration, capacity, title. This replaces the GymDesk widget HTML the booker parses today.

`class_sessions`: one occurrence. Generated ahead (the booker currently looks about three weeks out). Cancelled dates are session rows with `status = cancelled`, which is what `closedDates` means in the widget.

`bookings`: a person on a session. `kind` is `trial` or `member`. Trial bookings point at a lead. Member bookings point at a member. Capacity is checked in the same transaction as the insert.

`attendance`: member or trial, session, `status` (`present`, `absent`, `late`), `recorded_by`, source (`staff`, `kiosk`, `import`). The instructor playbook’s “log it in GymDesk within an hour” becomes a write here. The staff time clock is a different table and stays on Firebase.

## Leads and trials

`leads`: location, guardian name, phone, optional email, child name, child age, source (`book`, `schedule_gate`, `event`, `phone`, `walk_in`), `utm` jsonb, status (`new`, `booked`, `showed`, `no_show`, `enrolled`, `cold`). This replaces `classLeads` and the GymDesk create-lead call.

`trials`: lead, session, status. A same-day enrollment is a lead that became a member on the trial date. The scorecard’s “day-one enrollments” metric counts that. It is typed by hand today.

## Events, tournaments, parties

`events`: location or “all LVLUP”, start, end, type (`camp`, `tournament`, `clinic`, `seminar`, `party`, `belt_test`, `other`), purpose (`leads`, `profit`, `retention`), price, capacity. This is the same shape the Monthly Plan already uses for planned events. The dashboard’s `ceo/events` photo feed can keep storing photos in Firebase Storage; the CRM row holds `photo_count` and a pointer, not the bytes.

`event_registrations`: member or lead, event, paid invoice id if any.

School tournaments in this table are LVLUP events. They are not the `tournaments` table in the other Supabase project.

`parties`: Go Ninja (and any LVLUP birthday the school sells). Family or lead, location, party date, package, headcount, `invoice_id`. The Go Ninja KPI columns `bdayParties` and `campWeeks` become counts of these rows.

## Holds and cancellations

`holds`: membership, `start_on`, `end_on`, reason (`injury`, `travel`, `financial`, `schedule`, `other`), status (`requested`, `approved`, `denied`, `active`, `ended`). Requested holds do not pause billing. Approved holds do, from `start_on` through `end_on`. A hold cannot start in the past (the form already rejects that).

`cancellation_requests`: membership or, until the member is matched, the free-text name the current form stores. `received_on` (Chicago date), `earliest_completion_on` (`received_on` + 30 calendar days), reason, `status` (`requested`, `approved`, `completed`, `withdrawn`). Notice does not add days the membership already spent on hold. Completing a cancellation sets the membership to `cancelled` and clears `next_bill_on` as of `earliest_completion_on` or a later staff-chosen date, never an earlier one.

The current Firebase row is richer than staff use (agreement text, eligibility, a billing draft that is explicitly inactive). The CRM stores the agreement version and the timestamp. It does not store a computed tuition amount until the policy in [BILLING.md](BILLING.md) is approved. Until then `fee_cents` is null and no hold fee invoice is created.

Dashboard fields staff already edit (`completedBy`, `cancelDate`, `retentionNotes`, `resumeDate`) map to columns here. The bridge phase keeps writing `ceo/cancellationRequests` so the current Holds page does not go blank.

## Invoices, charges, profiles

`invoices`: membership, location, `period_start`, `period_end`, `status` (`draft`, `open`, `paid`, `void`, `uncollectible`), `total_cents`. Unique on `(membership_id, period_start)` where status is not void.

`invoice_lines`: description, amount, kind (`tuition`, `proration`, `hold_fee`, `notice_tuition`, `party`, `prepaid`, `upgrade`, `retail`, `refund_credit`).

`payment_profiles`: location (the merchant), family, `customer_profile_id`, `payment_profile_id`, brand, last4, exp month, exp year, `is_default`. Unique on `(location_id, customer_profile_id, payment_profile_id)`. No PAN column exists, so a migration cannot “just add it.”

`charges`: invoice, profile, `idempotency_key`, `amount_cents`, `status` (`pending`, `approved`, `declined`, `error`, `voided`, `refunded`), Authorize.net `trans_id`, response code, `merchant_account_id`.

`charge_attempts`: one row per submit, including retries. The invoice does not change id between retries.

`refunds`: charge, amount, reason, staff id, `trans_id`. A refund cannot exceed the captured amount minus prior refunds. Enforced in the same transaction.

`billing_runs`: the cron’s diary. `webhook_events`: raw notification id, type, location, processed at. `dunning_notices`: which email template went out for which invoice.

`idempotency_keys`: caller key, request hash, response code, created at. Same key and same body returns the stored response. Same key and a different body returns 409.

`audit_log`: actor, action, entity, entity id, location, at. No free-text dumps of a profile.

`external_ids`: entity type, entity id, system (`gymdesk`, `firebase_student`, `authorize_cim`), value. The crosswalk from phase 2.

## What is deliberately not a table

- Card numbers, CVV, full magnetic stripe, Accept.js opaque tokens.
- A copy of the GymDesk revenue snapshot. Historical months stay in `finance/gymdesk`.
- Staff PINs and the time clock.
- Curriculum video URLs. They stay in the website until a content phase. Rank rows do not embed Vimeo links.
