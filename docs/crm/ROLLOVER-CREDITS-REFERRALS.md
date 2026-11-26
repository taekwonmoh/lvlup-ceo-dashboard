# Prepaid rollover, tuition credits, and referrals

Sandbox only. Migration `008_rollover_credits_referrals.sql` (Supabase name `20261126000008_rollover_credits_referrals.sql`) is applied by `npm test` to a local database. Do not apply it to Supabase project `xxyndswrierztzdbjvrd` or `belfzlyvgjheudxhviyt`.

`BILLING_CHARGES_ENABLED`, `AUTOMATION_DELIVERY_ENABLED`, `PUSH_DELIVERY_ENABLED`, `WEBHOOK_DELIVERY_ENABLED`, and `QBO_ENABLED` stay `0`. Draft invoices are stored with `submitted: false` and `charged: false`. No card is charged and no message is sent.

## Prepaid rollover

Any prepaid membership can roll into a recurring draft when the prepaid window ends.

| Field | Meaning |
|---|---|
| `paid_through_on` | Last covered day. The API calls this `paidThroughDate`. `paid_through_date` is the same value. |
| `rollover_enabled` | The membership should start recurring drafts. |
| `rollover_cancelled` | Opt-out. After the window, drafts stop. Dates inside the window are still skipped. |
| `rollover_cadence` | `monthly`, `weekly`, or `every_4_weeks`. The API accepts `4_weeks` and stores `every_4_weeks`. |
| `rollover_plan_id`, `rollover_amount_cents` | Target plan and the draft amount, in cents. |
| `rollover_anchor_day` | Monthly: day of month, 1–31, clamped on a short month. Weekly and every 4 weeks: weekday, Monday 1 through Sunday 7. |
| `billing_schedules` | The same cadence, amount, anchor, and cancel flag on one row per membership. |

The shadow classifier and `POST /v1/billing/drafts` share one rule:

- Before `paid_through_date`, the answer is `skipped_prepaid`. The prepaid term is not drafted again.
- On or after that date, a draft is created only when the date is on the cadence.
- A cancelled rollover answers `skipped_rollover_cancelled` once the window has ended.
- A second draft for the same membership and period returns the original invoice.

`GET` and `POST /v1/memberships/:id/rollover` read and write that configuration. Families can read their own membership. Staff write is limited to their schools.

## Tuition credits

`tuition_credits` is the grant. `tuition_credit_events` is the audit trail (`issued`, `adjusted`, `applied`).

| Column | Meaning |
|---|---|
| `family_id` | Required. The balance is per family. |
| `member_id` | Optional. |
| `amount_cents`, `remaining_cents` | Grant and what is left. Remaining never goes below zero and never exceeds the grant. |
| `reason` | `manual_staff`, `referral_reward`, `promo`, `refund_credit`, or `adjustment`. |
| `expires_on` | Optional. A lot is skipped on a draft dated after this day. |
| `issued_by` | Staff row when one exists for the signed-in email. |

`POST /v1/families/:id/credits` issues a grant or adjusts one (`action: "adjust"` is a signed cent delta). `GET` returns `balanceCents` for the billing screen. The same balance is `creditBalanceCents` on `GET /v1/families/:id/statements`.

When a tuition draft is built, open lots are applied soonest expiration first, then oldest `created_at`. The tuition line stores `credit_applied_cents` and net `charge_amount_cents`. A second line of kind `refund_credit` records the offset. The invoice total is the net and is never negative. Each application writes a `household_ledger` row (`source_type` `tuition_credit`, negative cents). The grant itself is a ledger row too, so the family timeline shows it. Statement totals ignore positive grant rows and keep the net draft.

## Referrals

| Table | Role |
|---|---|
| `referral_codes` | One active code per family, and one per member when a member is set. The code is uppercase letters and digits. `sharePath` is `/v1/public/trials`. |
| `referrals` | Referrer family and member, referred lead, then the converted family and member. Status is `invited`, `lead`, `trial_booked`, `converted`, `rewarded`, or `voided`. |
| `referral_program_rules` | Per school, or a brand default when `location_id` is null. Referrer cents, optional new-family cents, and a trigger: `trial_converted` or `first_paid_membership`. Seeded school rules are 0 cents until a lead sets them. A zero rule does not issue a credit. |

Passing `referralCode` on `POST /v1/public/trials` (or on `POST /v1/leads/:id/convert`) attributes the lead. An unknown code rejects the booking. Convert moves the row to `converted`.

The reward runs once:

- `trial_converted` pays when the lead is converted.
- `first_paid_membership` pays when the first tuition draft with a positive gross is built for the new family.

The referrer credit, and the new-family credit when the rule has one, use reason `referral_reward`. A second convert or a second draft does not insert another grant. The same transaction plans `ret_referral_thanks` (the RET catalog row “Referral thanks”) and stores the enrollment with step status `dry_run`. The response is `sent: false`.

`GET /v1/referrals` and `GET /v1/referrals/codes` are scoped. A family sees their own code and status, without the other family’s ids. Staff see the schools on their grant. Row level security on `crm_app` matches that split.
