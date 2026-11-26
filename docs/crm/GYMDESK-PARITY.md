# GymDesk parity checklist

From Gus’s inventory, November 2026. Tags stay as he wrote them: **[V]** seen in GymDesk, **[R]** Mike’s rule, **[U]** not verified. An unverified item is not treated as a rule.

Status is against this repo’s CRM backbone. **Built** means the model or the preview implements it with fixtures. **Planned** means it is not in the backbone yet. Nothing here charges a card or writes GymDesk.

## Decisions already in the engine

- **[R]** Mini-Tigers and grandfathered memberships bill monthly. Everything else bills every 4 weeks. `cadenceForPlan` in `crm/src/billing.ts`.
- **[R]** Anyone billed monthly on the 1st belongs on a grandfathered plan. The flag is `plans.grandfathered`. The anchor is per membership: `started_on` unless `anchor_on` is set.
- **[V]** A 4-week plan drifts off the 1st, and some months contain two drafts. `draftDates` and `monthsWithTwoDrafts`.
- **[R]** Prepaid math is 13 payments for a 4-week plan and 12 for a monthly plan.
- **[R]** DeForest drafts on Waunakee’s Authorize.net account.
- **[R]** Go Ninja Waunakee drafts on Waunakee. Go Ninja Verona drafts on Verona. Reports and the UI stay Go Ninja. `merchantAccountFor`.
- **[R]** 3rd paying family member and beyond: 30% off at Waunakee, 50% off at Verona, East Madison, and DeForest. A hold or a leave drops them out of the count. The stored price does not change until upcoming charges are snapshotted. **[U]** GymDesk’s exact auto-adjust settings. **[V]** Manual discount codes and price overrides can disagree with the automatic percent.
- **[R]** Pay hours are clock-in to clock-out. Scheduled shifts are comparison only.
- **[R]** Curriculum videos group by cycle theme.
- **[R]** The first task screen is Daily, Weekly, Monthly, and Cycle. Sign-off and did-not-work wait.

A plan (membership type) stays separate from a program (the rank ladder). Named plan families to model, not all built as seed rows: Standard / Black Belt Journey Flex (4-week), Grandfathered Monthly, Athlete Development and its grandfathered variants plus a DeForest ADP add-on, Grandfathered Monthly Legacy with a down payment, Tiger Leaders add-on, Mini-Tigers 1X, Fitboxing 1X/week (Waunakee only), Competition Team, and Term/FREE placeholders for a prepaid span that ends on a cancel date.

## Requirements

| # | Requirement | Status | Where |
|---|---|---|---|
| 1 | Per-school tenancy. Share a member across schools only when needed. No single “current school” for the whole session. | Planned | Locations exist. The preview school switcher filters one school at a time. A person at two schools is not a first-class link yet. |
| 2 | Plans with 4-week and monthly cycles, a grandfathering flag, add-ons as their own lines, family discounts that move when someone pauses or leaves, and a guard so today’s price does not change without a snapshot. | Built for cadence, the flag, the discount preview, and the snapshot guard. Planned for add-on lines and for applying a discount in the billing job. | `crm/src/billing.ts`, migration `003_billing_rules.sql` |
| 3 | Prepaid products with spots, limits, and hide dates, and a membership schedule generated after purchase. | Planned | The website still links to GymDesk product URLs. `prepaid_term` is only the interval name. |
| 4 | Freeze and cancel-on-date, a notice policy, an approval step, and the public intake form. | Built for the 30-day notice decision and the request record. Planned for cancel-on-date automation and for replacing the live form. | `crm/src/holds.ts`, `cancellation_requests` |
| 5 | Per-school Authorize.net, tokenized card and bank, card-vs-bank fees, void versus refund, failed-payment retries **[U]**, a task when a draft fails, and an upcoming-schedule export. | Built for merchant routes, CIM profile ids, and a charge body that is not submitted. Planned for bank accounts, pass-through fees, the retry task, and the export. | `crm/src/authorize.ts`, `merchant_routes` |
| 6 | Rank and program ladders, testing sessions, test-pass logic, ready-to-test rules, and an ATA placeholder that does not call EZSignup. | Built for Mini Tigers (18), Tigers (18), Taekwondo through 5th degree plus 6th–9th, Legacy, ATA Instructor Certification, Go Ninja Movement Academy, ADP aliases, and the cycle-curriculum jump. Eligibility is still classes, days in rank, and sign-off. The preview does not call ATA. | `crm/src/ranks.ts`, `crm/src/curriculum.ts`, `crm/migrations/005_ranks_curriculum.sql` |
| 7 | Attendance and a check-in kiosk **[U]**, with class counts that start at the membership start. | Planned | The kiosk still writes Firebase. The attendance table exists. Counts are not limited to the membership start yet. |
| 8 | A schedule and booking widget, trial lead intake, and a waiver signed once per member. | Built for class templates, open hours, and holiday cancellations. Planned for the public widget and a waiver. | `/book` still posts to GymDesk. `crm/src/class-calendar.ts` generates the staff calendar. |
| 9 | Automations: tags, conditions, delays, staff tasks, and different copy per school. | Built as a dry-run catalog. One workflow per purpose, with per-school review links and program flags. Live send is not built. | `crm/src/automations.ts`, `docs/crm/AUTOMATIONS-AND-MESSAGING.md` |
| 10 | Email and SMS with saved filters, dedupe, a preview, history, opt-out, and a confirm step before send. | Planned | Resend is used by the website for leads and holds. There is no shared sender here. |
| 11 | Reports and exports: full schedule CSV, members, payments, and bookings. The rest of the report list is **[U]**. | Planned | The GymDesk revenue snapshot is still the dashboard’s finance page. |

## Pain points to design out

| Pain | Status |
|---|---|
| No entry-fee product for Athlete Development. The $349 fee is a checklist note, not a product. | Planned |
| CIM profile errors at checkout. | Planned. New cards stay on Accept.js, sandbox only, so a bad profile is not a live charge. |
| Multi-line prepaid scheduling is done by hand. | Planned |
| The public shop and the admin shop disagree about what is on sale. | Planned |
| Editing a prepaid or a family discount leaves duplicate or regenerated payment rows. | Built as a guard: `guardedPriceChange` refuses a new amount until upcoming charges are snapshotted. The audit screen is planned. |

## Still unverified

- GymDesk’s exact family-discount auto-adjust settings **[U]**.
- Failed-payment retry timing inside GymDesk **[U]**. The backbone’s suggested retries in `BILLING.md` are not that setting.
- What the check-in kiosk does inside GymDesk **[U]**. LVLUP’s own `#clock` kiosk is the staff time clock, which is a different tool.
- The full GymDesk report list **[U]**.
