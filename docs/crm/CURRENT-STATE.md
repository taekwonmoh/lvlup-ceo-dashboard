# Current state: how GymDesk is used today

Investigated November 2026 from `taekwonmoh/lvlup-ceo-dashboard` (`main`) and `taekwonmoh/lvlupma-website` (`main`). No production database was written. No member list was copied into this repo.

GymDesk is the operational system of record, but **neither codebase calls a GymDesk private API or stores a GymDesk API key**. The coupling is public widgets, CSV exports, a revenue snapshot, and staff checklists that tell a person to click GymDesk.

```
Parents ──► lvlupma.com widgets ──► app.gymdesk.com (lead + booking + shop)
                     │
                     ▼
              Firebase RTDB (lvlup-members-app)
                     ▲
Staff ──► staff.lvlupma.com (Google sign-in)
                     │
                     ├── reads finance/gymdesk  (aggregates, bot-pushed)
                     └── uploads GymDesk CSVs by hand

GymDesk billing ──► Authorize.net CIM charge on that school's merchant account
                    (no ARB; no code in either repo)
```

## Two Firebase projects, one of them stale in code

| Project | What still points at it |
|---|---|
| `lvlup-members-app` | Live dashboard (`firebaseConfig` in `index.html`), members app, Pages Functions, `finance/gymdesk`, `finance/plannerBaseline`, `ceo/*`, root `students`, `staff`, `families`. |
| `va-dashboard-bf7ca` | Dashboard **events** REST client (`EVENTS_DB_URL` in `index.html`). Nightly roster worker source (`roster-sync-worker/worker.js` reads `ceo/watchlist` here). `sync-roster.py` reads the same URL. |

The live dashboard’s watchlist is an at-risk list (7-day and 14-day absent) on `lvlup-members-app` at `ceo/watchlist`, with manual adds. The worker’s comment still calls `va-dashboard-bf7ca` `/ceo/watchlist` “the roster uploaded from GymDesk”. Those are no longer the same node. Whether that worker is still deployed is an open question; the code on `main` would sync the old database if the cron runs.

## Authorize.net

No file in either repo mentions Authorize.net, CIM, `customerProfileId`, or ARB. Card-on-file charging happens inside GymDesk. The new billing engine is greenfield. Other payment code that must **not** be confused with tuition:

| Path | Processor | What it pays |
|---|---|---|
| `lvlupma-website/functions/pay.js` | Square | Kick Out Cancer pledges |
| `lvlupma-website/workers/merch-checkout` | Stripe Checkout, then Printful | Members-app merch |
| `prepaid-sale.js` product URLs | GymDesk shop (each school’s subdomain) | 2027 prepaid tuition |
| ADP / Tiger Leaders applications | No charge. `chargeOnFile` is a yes/no note: “charge the card on file in GymDesk.” Digits of 5+ are stripped from the note. | Staff later charge in GymDesk |

## Website: live GymDesk calls

Source: `book-flow.js`, `functions/api/gym-book.js`, `functions/api/book-confirm.js`, `functions/api/lead.js`, `members-curriculum.js` (the members “Book a Class” view and the contact form), `prepaid-sale.js`.

### Trial booking (`/book`)

Four LVLUP schools only. Go Ninja is not in `LOCATIONS`.

| School | Public gym id | Schedule id | Form id | Member portal host |
|---|---|---|---|---|
| Waunakee | `AppNe` | `lYYyv` | `lWMq3` | `lvlupwaunakee.gymdesk.com` |
| East Madison | `D0q7w` | `6ZYr1` | `Avdvn` | `lvlupeastmadison.gymdesk.com` |
| Verona | `AnnWE` | `A1Meo` | `l7EGz` | `lvlupverona.gymdesk.com` |
| DeForest | `lYOKP` | `lBax2` | `D8Qdq` | `lvlupdeforest.gymdesk.com` |

Flow:

1. The browser `GET`s `https://app.gymdesk.com/widgets/book/render/gym/{gym}?schedule={sched}&form={form}` and parses session HTML. Class times are never invented in our code.
2. The browser `POST`s `https://app.gymdesk.com/widgets/book/create-lead` as a CORS-simple form (`application/x-www-form-urlencoded`, no custom header, `credentials: 'omit'`). Body: name, optional email, optional phone, `form_id`, `schedule_id`, `academy_id`. GymDesk returns a numeric lead id.
3. The browser `POST`s **our** `/api/gym-book?gym={gym}`. That Pages Function forwards the body to `POST https://app.gymdesk.com/widgets/book/render/gym/{gym}` with `X-Requested-With: XMLHttpRequest`, which is what makes GymDesk return JSON instead of HTML. The header is not CORS-safelisted, and GymDesk answers the browser preflight with 405, so the proxy exists. It allows only those four gym ids and only same-site callers. It does not forward cookies.
4. `/api/book-confirm` emails the parent through Resend (class time, what to wear, address, map) and alerts `LEAD_NOTIFY_TO`. GymDesk still sends its own mail when the lead had an email. Child age has nowhere to go in GymDesk, so it only exists in our staff email.

DeForest’s widget shows the class list before it has a contact, unlike the other three schools. `schedule-deforest-*.html` collects the lead first via `POST /api/lead`, which writes root `classLeads` and sends the same Resend alert. The comment in `lead.js` says this endpoint can go away if DeForest’s GymDesk form-before-schedule setting is turned on.

### Members app booking and contact

`members.html` is a PWA (`members-manifest.json`). “Book a Class” does not use the trial widget. It opens a new tab on `{school}.gymdesk.com/members/schedule?bookable_only=1` and tells the parent to stay signed in to GymDesk.

The contact form JSONP-loads `https://app.gymdesk.com/contact/form` with a per-school `form_id` (`A3BQ8`, `Ay7xV`, `6VaJQ`). DeForest is not in that map.

### Prepaid shop

`/prepaid` is a catalog. Buy buttons are hard-coded GymDesk product URLs, one subdomain per school. A standard year on that page is 13 payments; Mini-Tigers is 12. That is the best in-repo evidence that tuition drafts every 4 weeks. Prices stay in `prepaid-sale.js` and are not copied here.

### Roster bridge (GymDesk CSV and Zapier, not the GymDesk API)

| Entry | Writes |
|---|---|
| `POST /api/roster-import` | Staff with dashboard access, or the front-desk code at root `config/rosterCode`. Mode `members`: upsert `students/gymdesk_{memberId}` (`name`, `location`, `rosterActive`, `rosterSource: gymdesk-import`, `gymdesk_member_id`, `gymdeskRank`). Optionally link `familyByEmail/{email}` and `families/{id}/students/{key}`. Mode `attendance`: check-ins onto `students/{key}/gymdeskAttendance` and the First 5 “first class” step. Never overwrites belt, journey, XP, or black-belt fields. |
| `POST /api/roster-upsert` | Secret-gated. Comment says a Zapier “New Member” zap, one per location. Same student key, `rosterSource: gymdesk-signup`. Email is not stored on the student. |
| `roster-sync-worker` | Nightly. Reads the **old** dashboard watchlist, writes `students/gymdesk_{id}` with `rosterSource: ceo`, and rebuilds family links. Also sweeps red/black stripe alerts. |
| `sync-roster.py` | Manual version of that worker. Dry-run by default. |

Family ids from the import and the zap are `fam_` plus 8 bytes of SHA-256 of the email key. A parent who uses “Find my student” in `members-auth.js` instead gets `fam_` plus a timestamp. Both writers assign `familyByEmail`. An import can overwrite a self-serve family id. Migration has to treat Firebase family ids as hints, not as stable keys.

Student keys in the wild:

- `gymdesk_{memberId}` from imports
- `bb_{…}` black-belt tracker rows, which can duplicate a GymDesk row; the switcher dedupes by name
- `students/{email with punctuation removed}` written by the dashboard’s monthly feedback publisher (`feedbackPublishMonthly`), a third key shape on the same node

`/api/member-lookup` is the name search. The server reads the full `students` node (cached 60 seconds) and returns only `{key, name, location, claimed}` for an exact first-and-last match on `rosterActive === true`. Browsers used to download every student; they must not start doing that again.

### Holds, cancellations, and applications

`POST /api/hold-cancel` does **not** call GymDesk. `loadTrustedAccountState()` returns unavailable. The page is a request, not an approval.

- Dashboard contract: `ceo/cancellationRequests` on `lvlup-members-app`. New rows omit `status` (the badge counts missing status as pending) and omit `cancelDate` (staff set that).
- Audit copy: `holdCancelSubmissions`. Dedup: `holdCancelDedup` for 24 hours.
- Notice: 30 calendar days from the Chicago date the request is received. Hold time does not count. Earliest completion is stored. Nothing is auto-completed.
- Hold fee: `proposedMonthlyAmountCents: 1500` is unpublished, disabled, and not written onto the member’s record. The billing draft (tuition prorated across the notice days, credit a hold fee already paid for those days, no double charge) is `active: false`.
- Slack `#lvluphq` and Resend are best-effort.

`POST /api/program-application` writes `programApplications`, `ceo/applications`, and two `ceo/inventory` rows (custom uniform and combat weapon). Payment is a permission flag for GymDesk, not a charge.

## Members app: auth and what is actually ours

`members-auth.js` and `staff-auth.js`. Firebase Auth **email link**, no passwords. The sign-in copy tells parents to use “the email GymDesk sends your receipts to.”

| RTDB path | Role |
|---|---|
| `staff/{emailKey}` | `role: admin \| staff`, `schools`, `access.dashboard`, `access.finance`, `access.legacy`, and other flags. `emailKey` is the lower-case email with `.` replaced by `,`. Same key the dashboard uses. `dashRole` (`admin`, `lead`, `ops`, `frontdesk`) is a dashboard field on this record and is not a Firebase Auth role. |
| `familyByEmail/{emailKey}` | Family id for that inbox. |
| `families/{id}/students/{studentKey}` | Kids on the family. |
| `students/{key}` | Name, location display string, `rosterActive`, `gymdesk_member_id`, `gymdeskRank`, belt journey, XP, `bb` tracker, starter quest. |
| `claimed/{studentKey}` | Which family claimed the student. |
| `users/{uid}` | Email, family id, last sign-in. |
| `linkLog` | Self-serve link events. |
| `authConfig/strict` | When true, the home bar says sign-in is required. |

Curriculum videos, cycle themes (Honesty, Self-Esteem, and the rest), and the belt-journey UI are **in the website**, not in GymDesk. GymDesk rank is only a string (`gymdeskRank`) next to our own belt data. The red/black tracker uses four stripes (`blue`, `black`, `silver`, `gold`) and emails via `/api/bb-stripe-alert` and `/api/bb-approved-alert`.

Events the members app shows are shared with the dashboard in intent (`ceo/events`). The dashboard’s event REST client still targets `va-dashboard-bf7ca`. That split should be confirmed before events move into the CRM.

## Dashboard: GymDesk touchpoints

`index.html` never calls `gymdesk.com`. Staff sign in with Google (`dashSignIn`) against the same Firebase project. Access is `staff/{emailKey}` as documented in `CLAUDE.md`.

### Data that originated in GymDesk

| Surface | Path | How it gets there |
|---|---|---|
| Growth → GymDesk | root `finance/gymdesk` | Bot runs `scripts/push_gymdesk_data.mjs` about 7 AM and 10 PM CT. Aggregates only. The script refuses email-like strings and fields such as `email`, `phone`, `firstname`. Clients cannot write this node. |
| Monthly Plan and Annual Tracker | `finance/plannerBaseline/{locId}/{YYYY-MM}` | Same script. `expected_billing` is memberships + POS + pending. `collected` drops pending on a partial month. Location keys: `waunakee`, `eastmad`, `verona`, `deforest`, `goninjaW`, `goninjaV`. The snapshot’s `east_madison` and `go_ninja_*` keys are mapped in the script. |
| Scorecard / KPIs | `ceo/membership/{loc}/{year}/{month}` | CSV import (`kpiImportGymdesk`) counts `status=active` and `Joined` in the current year into `total` and `newMem`. The rest of the grid (leads, intros, upgrades, attrition, parties, camps) is typed by hand. A button opens `https://lvlupma.com/roster-import` so the same file can update the members app. Go Ninja has no members-app roster. |
| Students → feedback roster | `feedbackRoster` plus a name list | “Sync Student Roster” parses a GymDesk Members CSV (`First Name`, `Last Name`, `Joined`, `Status`) into the feedback tool. It does not write `students/gymdesk_{id}` by itself. Publishing feedback writes root `students/{emailKey}` and `feedback/{emailKey}/{month}`. |
| Watchlist | `ceo/watchlist` | Retention workflow (warning / critical / contacted). Entries can carry `memberId`. This is not the full roster. |
| Holds | `ceo/cancellationRequests` | Rendered by the Holds page. The UI states that no trusted GymDesk or balance loader is connected (`data-crq-gymdesk="no-loader"`). Unknown stays a manual review. |
| Trials | `ceo/trialPipeline` | First-day trials waiting on an enrollment follow-up. Not a GymDesk sync. |
| Applications | `ceo/applications` | Checklist steps include “Update GymDesk membership”, “Process combat weapon in GymDesk”, “Process custom uniform in GymDesk”, “Charge Legacy investment in GymDesk”. ATA steps point at `https://www.atamartialarts.com` and stay manual. |
| Events | optional `link` | A URL field labeled “GymDesk link”. |
| Training content | `ceo/development/gymdesk` | A GymDesk training course inside the dashboard, plus playbooks that say to log leads, attendance, birthdays, ranks, retail, and billing flags in GymDesk. Those playbooks are instructions to humans. |

The GymDesk revenue page calls out two traps the CRM has to keep:

- DeForest in the snapshot is GymDesk gross, before the MPK split. MyStudio collections are absent. Do not treat that figure as LVLUP net.
- “Paying members” is a peak, not a sum across months. ARM uses memberships ÷ paying members (in-progress month adds pending).

`scripts/test-annual-tracker.mjs` locks the earned-revenue order: live `finance/gymdesk` when the finance listener has it, then `plannerBaseline.collected`, then `ceo/financials` / `ceo/scorecardDaily`. Replacing GymDesk means feeding that same order from our invoices, not deleting the page on day one.

### Rank and attendance are still a person

Testing prep includes “Update ranks in GymDesk” and “Verify ranks — GymDesk vs ATA”. Playbooks tell instructors to mark attendance in GymDesk within an hour, pull birthday reports from GymDesk, and enter every lead there within 10 minutes. The dashboard does not read those records back. That is the gap a CRM closes.

## Supabase project `xxyndswrierztzdbjvrd`

Read-only `list_tables` on 21 November 2026. This project is **not** the school CRM. It is an active Postgres 17 database in `us-west-2` named “taekwonmoh's Project”, with training-product tables (`drills`, `workouts`, `skills`, `tricks`, `junbi_forms`, `tournaments`, `profiles`, `users`, and others). Hundreds of profile rows. No schema change was made.

Row Level Security is **off** on `public.users`, `public.drills`, `public.tournaments`, `public.skills`, `public.waitlist`, `public.user_seasonal_badges`, `public.affiliates`, and `public.standards_assessments`. With the anon key, those tables are readable and writable by anyone who has that key. Enabling RLS without policies would lock the existing app out, so this design does not ship that change. It is a separate decision for that product. It is also the reason the school CRM gets its own project: member and payment tables do not belong next to an app whose anon key can already see `users`.

## What a replacement has to keep working on day one

1. A parent can book a free class without retyping the schedule.
2. A parent can sign in with the GymDesk receipt email and see the same children.
3. Staff can see membership counts, collected tuition, and the hold queue.
4. A draft hits the same school’s merchant account, against the existing CIM profile, for the period GymDesk has not already collected.
5. ATA registration, Square pledges, and Stripe merch keep their current pipes until someone deliberately moves them.
