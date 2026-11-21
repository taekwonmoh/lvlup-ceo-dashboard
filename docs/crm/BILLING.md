# Billing engine

Design for the Worker cron and the charge path. No merchant is called by this document. Sandbox only, until a school’s `live_billing_enabled` flag is turned on in the cutover checklist.

## What we are copying, and what we are not

GymDesk saves a card as an Authorize.net CIM profile on **that school’s** merchant account and then charges the profile on GymDesk’s own calendar. There is no ARB subscription to cancel, export, or take over. The new engine owns the calendar. Authorize.net remains the vault and the processor.

A charge is: `createTransactionRequest` with `transactionType` `authCaptureTransaction` and `profile.customerProfileId` / `paymentProfile.paymentProfileId`. The merchant authentication on that request is the location’s API login and transaction key. The client never sends those, and never sends a profile id from a different school.

## Plans and the clock

All dates are America/Chicago calendar dates.

| `plans.interval` | Next draft |
|---|---|
| `every_4_weeks` | `anchor_on` plus 28 days, repeatedly. A full year is 13 drafts. This is what the prepaid page assumes for standard tuition. |
| `monthly` | Same day next month, clamped to the last day of a short month. Mini-Tigers is described as 12 payments a year. Confirm before using this for anyone else. |
| `prepaid_term` | One invoice. `next_bill_on` moves to the day after `paid_through_on`. No weekly draft in between. |

`next_bill_on` is the date the draft runs, not the date the period ends. For a 4-week plan the period is `[next_bill_on, next_bill_on + 28 days)`.

The job runs once a day after 06:00 Chicago. It also runs on demand for one membership (staff “charge now”), which uses the same function and the same idempotency key. A second click does not create a second charge.

## Who gets drafted

All of these must be true:

- `memberships.biller = 'lvlup'`
- `locations.merchant_accounts.live_billing_enabled = true` (or the process is in sandbox and the profile is a sandbox profile)
- status is `active` or `past_due`
- status is not `hold` for a hold that covers `next_bill_on`
- `next_bill_on <= today`
- no paid or open invoice already exists for this `(membership_id, period_start)`
- `paid_through_on` is null or earlier than the period start

`pending_cancel` still drafts through `earliest_completion_on`. A period that starts on or after the completion date is not created.

## Proration

Used in three places. The denominator is a property of the plan, not a magic number in a ticket.

| Situation | Amount |
|---|---|
| New member starts mid-cycle | `amount_cents * days_remaining / interval_days`, rounded to the nearest cent, minimum one day. `interval_days` is 28 or the actual days in that calendar month, matching the plan. |
| Upgrade mid-cycle | New plan’s prorated remainder minus the old plan’s unused remainder. One invoice, two lines (`proration` can be negative as a credit line). |
| Cancellation notice | Tuition for the notice days that are not already covered by a paid period. The current public form does **not** calculate this. The unpublished draft says: regular tuition across all 30 notice days, credit a hold fee already paid for those same days, never both. That draft stays off (`billing_draft.active` is false today) until Mike sets the denominator, the fee, and the effective date. |

Until that approval, a cancellation request does not create an invoice by itself. Staff can still add a one-off invoice if they would have typed a charge into GymDesk.

## Holds and freezes

An **approved** hold with `start_on <= today <= end_on` sets membership status to `hold` and skips the daily job. It does not delete `next_bill_on`. When the hold ends, `next_bill_on` becomes the later of the stored date and the day after `end_on`, so the days on hold are not billed and are not “caught up” in a lump. That matches the line the hold email already sends: billing pauses, and the paid-through date extends by the same number of days.

A requested or denied hold does nothing to the job.

Hold fee: no invoice while `hold_fee_policy.enabled` is false. The proposed $15 is 1500 cents in the website code and is explicitly not approved. If it is later enabled, it is its own monthly (or 4-week) invoice with `kind = hold_fee`, it does not satisfy notice-period tuition, and it is credited back on overlapping notice days only under the approved draft.

A hold cannot be retroactive. The API rejects `start_on` before today for a new request, same as `/api/hold-cancel`.

## Failures, retries, dunning

One invoice, many attempts.

| Attempt | When | Member status |
|---|---|---|
| 1 | `next_bill_on` | stays `active` |
| 2 | +3 days | stays `active` |
| 3 | +7 days from the first attempt | `past_due` |
| 4 | +14 days from the first attempt | `past_due` |

After attempt 4 the invoice stays `open`, the membership stays `past_due`, and the job stops retrying that invoice. Staff decide to retry, to write it off (`uncollectible`), or to cancel. This schedule is a default, not a policy Mike has signed. Training access is not turned off by the engine. The schools can keep a student on the mat while the card is failing; the front desk sees `past_due` on the roster.

Dunning email (Resend), to the payer guardian:

- Attempt 1 declines: “We could not take tuition. Update the card.” Includes school, amount, last4, and a link to Accept.js. No attachment of a PAN.
- Attempt 3: same, plus “the account is past due.”
- Attempt 4: “We stopped retrying. Please call the school.”

Each notice is a `dunning_notices` row so a cron replay cannot send two emails.

A decline stores Authorize.net’s response code and a short reason (`declined`, `expired`, `profile_missing`). It does not store the processor’s full payload if that payload could echo account data.

## Receipts

On approval, email the payer: school name, student names on the membership, period dates, amount, brand, last4, invoice id, and `trans_id`. The same payload is available as `GET /v1/invoices/{id}` for the family. A PDF is optional later; the email is the receipt the current GymDesk habit provides.

## Refunds and voids

Staff with finance access:

- Same day, unsettled: void the `trans_id` on the same merchant. Invoice becomes `void`.
- Settled: refund, full or partial, on the same merchant. A `refunds` row and a credit line. The membership’s `paid_through_on` does not move backward on a partial refund; staff edit it if the period should be re-opened. That edit is audited.

The refund request’s idempotency key is required. A timeout that might have succeeded is resolved by reading the attempt back from Authorize.net (`getTransactionDetails`) before submitting again.

## Per-school routing

```
membership.location_id
    → merchant_accounts.location_id
        → Worker secret AUTHORIZENET_{LOCATION}_API_LOGIN
        → Worker secret AUTHORIZENET_{LOCATION}_TRANSACTION_KEY
```

There is no “default merchant.” A missing secret fails the attempt with `error` and pages nobody by charging a sibling school. Go Ninja keys are separate even if a LVLUP staff member is signed in.

Sandbox and live are different secrets and different profile ids. A sandbox profile id is rejected when `live_billing_enabled` is true.

## Idempotency

| Action | Key |
|---|---|
| Recurring draft | `memb_{id}:period_{YYYY-MM-DD}` |
| Staff retry | same key as the invoice; a new **attempt** row, not a new invoice |
| Staff “charge now” for a one-off | caller `Idempotency-Key`, stored against the invoice |
| Refund | caller `Idempotency-Key`, required |
| Accept.js profile create | caller key; a replay returns the same profile row |

The charge function inserts the `charges` row in `pending` inside a transaction **before** the HTTP call to Authorize.net. A crash after the processor succeeds is recovered by the reconciliation job, which looks up the `trans_id` by the invoice reference we send as `order.invoiceNumber` (our invoice id, which fits Authorize.net’s 20-character field if we use a short id, or `poNumber`). If the lookup shows an approval, we mark the charge approved and do not submit again.

## Webhooks

Authorize.net can POST `net.authorize.payment.authcapture.created`, `net.authorize.payment.refund.created`, and `net.authorize.payment.void.created`. Endpoint: `POST /v1/webhooks/authorize/{location_id}`.

1. Read the raw body.
2. Check `X-ANET-Signature` as HMAC-SHA512 with that location’s signature key. Reject on mismatch. Do not log the body on failure.
3. Insert `webhook_events` on `notification_id`. A duplicate returns 200 and stops.
4. Find the charge by `trans_id` or by our invoice reference. Update status. Never create a charge from a webhook we do not already expect. A webhook is confirmation, not an instruction to take money.
5. Return 200 quickly. Mail and dunning happen on the cron, which notices the status change.

Webhooks get missed. A nightly job pulls settled batches per merchant (`getSettledBatchList` / `getTransactionList`) for the last three days and reconciles. That job is read-only against cards and write-only against our charge status.

## What the engine will not do

- Store or log a card number.
- Use ARB.
- Charge a membership whose `biller` is `gymdesk`.
- Charge a period covered by `paid_through_on`.
- Auto-complete a cancellation.
- Apply the unpublished hold-fee or notice-tuition formula.
- Route DeForest tuition until the merchant question in the README is answered. DeForest can be imported and shadowed with `live_billing_enabled` false.
