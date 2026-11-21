# Migration from GymDesk

The goal is one charge per membership per period, on the right merchant account, without asking a parent to retype a card. This plan is a checklist. It does not run an import.

## What we can already see

From the two repos, not from a live GymDesk login:

- Member identity in our database is `students/gymdesk_{memberId}` plus `gymdesk_member_id`.
- The parent login is the email on the GymDesk export, stored only as `familyByEmail/{email-with-dots-as-commas}`, not on the student row.
- Rank is a free-text `gymdeskRank` next to a separate belt journey we own.
- Attendance imports are counts (`classes`, `lastClass`), not a row per check-in.
- Billing amounts in the dashboard are monthly aggregates, not per-member drafts.
- CIM profiles exist only at Authorize.net. Waunakee is reported as 363 profiles, 358 with a payment method, merchant customer ids of 7–8 digits. Those ids are the join key **if** they are the GymDesk member ids. That has to be checked on real profiles before the crosswalk is trusted. The check is read-only (`getCustomerProfile`), and it happens in phase 2, not in this PR.

## Exports to ask GymDesk for

Per school, files kept outside git:

| Export | Used for |
|---|---|
| Members | id, status, joined, plan name, price, interval, next bill date, paid-through, rank, home location |
| Families / guardians | member id, guardian name, email, phone, which person is the payer |
| Payment history | member id, date, amount, success or decline. No card data. Sets `paid_through_on`. |
| Check-ins | member id, date, class. Replaces the count-only import. |
| Schedules | the sessions the widget parses today, so we stop scraping HTML |
| Leads not yet enrolled | so the trial board is not empty on day one |
| Prepaid balances | who already bought a 2027 year in the GymDesk shop |
| Active holds and pending cancels | so we do not draft someone GymDesk has frozen |

If GymDesk cannot export next-bill-date and paid-through, the shadow phase cannot prove we match, and that school does not cut over.

## Mapping people

Order of trust:

1. `gymdesk_member_id` numeric match to `merchantCustomerId` on that school’s merchant account.
2. Firebase key `gymdesk_{id}` is the same id, so the belt journey and the family link come along.
3. Email match attaches the guardian. If both family-id schemes exist (`fam_` plus a hash, and `fam_` plus a timestamp), keep every child link and keep one family. Do not email anyone during this step.
4. Name-only match is a report, not a merge.

Unmatched buckets, written as counts plus ids, never pasted into Slack in bulk:

- GymDesk member with no CIM profile (they will need Accept.js before their first `lvlup` draft).
- CIM profile with no GymDesk member (do not charge; staff look at it).
- Profile with no payment method (the 5 of 363 at Waunakee, if that count holds).
- Firebase `bb_` row with no GymDesk id (keep the tracker; link it if the name and school are unique and staff confirm).
- Member whose email collides with a different family’s self-serve link.

Go Ninja and DeForest wait until their merchant question is answered. They can sit in the crosswalk with `live_billing_enabled` false.

## Parallel run

For the pilot school (Waunakee, unless Mike picks another):

1. `biller` stays `gymdesk`. The cron ignores the school.
2. Every day the engine **builds** the invoice it would have submitted and stores it as `status = draft` with `shadow = true`.
3. Compare to GymDesk’s payment export for that day: same member ids, same amounts, same people skipped for hold or prepaid. A mismatch is a bug in our calendar, not a reason to “just charge the difference.”
4. Run that comparison for a full interval (28 days if the plan is every 4 weeks). One clean interval is the bar.

During the parallel run, parents still book and still get drafted in GymDesk. Our `/book` flow can mirror a lead into the CRM without turning GymDesk’s create-lead off, so a failed CRM write does not lose a trial.

Staff keep using GymDesk for ranks and attendance in this window, and we import those on a schedule. Two writers of rank are allowed only because `member_rank_events.source` says where the row came from. The latest `staff` event wins over a later import of an older GymDesk string.

## Cutover, one school

Do this on a morning when that school is **not** inside GymDesk’s draft window, or immediately after GymDesk’s draft for the day has finished and been recorded.

1. Export payments one last time. Set `paid_through_on` from the last successful tuition charge.
2. In GymDesk, stop the billing schedule for that school. Because there is no ARB, this is a GymDesk setting, not an Authorize.net cancel. Confirm with a member who was due tomorrow that GymDesk will not also charge them. This is the step that prevents double billing.
3. Flip `biller` to `lvlup` only for memberships whose `paid_through_on` is set and whose profile has a payment method.
4. Leave everyone else on `gymdesk` (which is now paused) and a task list: missing card, unmatched profile, unresolved hold.
5. Set `live_billing_enabled` for that location.
6. The first live cron submits only periods that start **after** `paid_through_on`.
7. For the next 48 hours, reconciliation reads both the new `trans_id`s and GymDesk’s payment list. Any member with a success in both systems for the same period is refunded on **our** side (we can see our `trans_id`) and filed as an incident. GymDesk having charged after the pause is a GymDesk-side void, done by a person in that merchant account, not by an automated script in this repo.

Rollback, before any live approval exists: set `live_billing_enabled` false and `biller` back to `gymdesk`, and turn GymDesk’s schedule back on. Rollback after an approval exists: leave `biller` on `lvlup` for anyone we successfully charged, and turn GymDesk on only for people we did not charge. The `charges` table is what makes that split possible. Do not “turn both on and sort it out.”

## Later schools

East Madison, then Verona, then DeForest, then the two Go Ninja schools, unless the unmatched report says a different order is safer. Each school is its own merchant and its own `live_billing_enabled` flag. A bug at Verona does not pause Waunakee.

The members website stops sending that school’s trial bookings to `app.gymdesk.com` only after staff have run a week of trials in the CRM. Until then the proxy in `functions/api/gym-book.js` stays. Prepaid product URLs stay until prepaid terms are invoices in the CRM; a parent who already paid in the GymDesk shop is a `prepaid_term` membership with `paid_through_on` set, not a person we draft.

## Dashboard and members app during the bridge

- `finance/gymdesk` keeps receiving the bot snapshot for schools still on GymDesk. For a cut-over school, the Annual Tracker should prefer CRM collected totals. That code change is a later PR, and it should not delete the snapshot path.
- `/api/roster-import` and the Zapier upsert keep running for schools still on GymDesk. They should not overwrite a member whose `biller` is `lvlup`.
- `ceo/cancellationRequests` keeps receiving the public form until the Holds page reads the API. New CRM rows are mirrored there so the badge does not drop to zero.
- Belt journey, XP, and the red/black tracker stay on Firebase `students/{key}` until the members app reads rank events from the API. `firebase_student_key` is the join.

## Task sheets and the scheduler

Those stay on Firebase for this phase. The mapping and the order to move them are in [STAFF-OPS.md](STAFF-OPS.md). Do not turn off `ceo/tasks` or `ceo/timeclock` writes when the CRM import runs.

## Done

GymDesk is retired when every school has `biller = lvlup`, the widget proxy is unused, the CSV buttons are gone, and one full interval has been collected with a reconciliation diff of zero unexpected double charges.
