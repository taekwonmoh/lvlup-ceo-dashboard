# CEO / HQ Dashboard

Single-file static app: `index.html` (~1MB, inline JS/CSS, no build step). Deployed to **staff.lvlupma.com** via GitHub Pages. Backed by Firebase Realtime DB (root `ceo`) + Firebase Storage.

- `state` object + `render()`; helpers `fbRef(path)` → `db.ref('ceo/'+path)`, `fbSet`, `fbDebounce`, `esc()`.
- Manager pages require a verified Google account (`DASH_AUTH_REQUIRED`). Access is `staff/{email}` (dots in the email become commas): `role === 'admin'`, or any `role` with `access.dashboard === true`. The `#clock` kiosk is still PIN-only and unsigned-in — paths it reads or writes must stay open without auth.
- Dashboard tiers read `dashRole` on that same `staff/{emailKey}` record (`admin`, `lead`, `ops`, `frontdesk`). See **Dashboard access tiers** below. Do not invent a new `role` value — `lvlupma.com` `build-db-rules.py` only understands `role: "admin"` or `role: "staff"`.

## Shared backend — keep in sync with lvlupma.com

This app shares one Firebase project (`lvlup-members-app`) with the **lvlupma.com** repo at `../lvlupma-website`. They are coupled through data contracts, not code. **When you change a shared contract here, check and update `../lvlupma-website` (and vice-versa) so they don't drift.**

**Shared data contracts** (Realtime DB):
| Path | Writer | Reader |
|---|---|---|
| `ceo/membership/{locId}/{year}/{month}/{total\|newMem}` | lvlupma.com roster-import | dashboard KPIs |
| `ceo/events/{key}` + Storage `events/` | both | both (members app shows photos) |
| `ceo/timeclock/*` (staff, schedule, entries, config=geofence, pto, timeoff, trades, pins, holidays, schedulePublished) | dashboard (kiosk at `#clock`) | dashboard |
| `ceo/cycles`, `ceo/firstFive`, `ceo/applications`, `ceo/inventory`, `ceo/watchlist` | mixed | mixed |
| `config/rosterCode` (**root, not under ceo**) | set by hand | lvlupma.com roster-upload gate |
| `finance/gymdesk` (**root, not under ceo**) | bot via `scripts/push_gymdesk_data.mjs` | GymDesk page and Annual Tracker, finance/admin only |
| `finance/plannerBaseline/{locId}/{YYYY-MM}` | same bot script (aggregates only) | Monthly Plan and Annual Tracker, any staff with dashboard access |

**Canonical location IDs** (both apps must agree): `waunakee, eastmad, verona, deforest, goninjaW, goninjaV`. Go Ninja = `goninjaW`/`goninjaV` (`GONINJA_LOC_IDS`). **Never `eastmadison`** — the dashboard uses `eastmad`; the website maps `eastmadison`/`east madison` → `eastmad` on the way in.

**Staff schema** `ceo/timeclock/staff/{id}` = `{ name, loc, fullTime?, hireDate?, ptoAnchor?, ptoDays?, ptoFirstYearDays?, scheduleOnly?, schedAll?, schedLocs? }`. Rosters are grouped **by brand only** (LVLUP vs Go Ninja), never by individual location. This is the clock roster, not the login record. Logins live at root `staff/{emailKey}` (see below).

`loc` is the home school. A Master Schedule location chip lists someone who has a shift there that week, anyone with `schedAll` on a LVLUP chip, anyone whose `schedLocs` includes that school, Tarik Murrell on East Madison, and Abigail Hoefling on Go Ninja Waunakee. Setup has no control for `schedAll` or `schedLocs`. Tarik (`tc_tarik`, home `waunakee`, also matched by `tmurrell.lvlupma@gmail.com` or a name containing Murrell) is assignable on `eastmad` from `tcSchedulableAt` even before he has a shift there. His home school, `tarikM` checklist, bathroom-photo days, and bonus seat stay the Waunakee lead list. East Madison daily tasks stay on Ash (`ash`). Abigail (`tc_muq58dnhkazw`, `ahoefling7@gmail.com`) is assignable on `goninjaW` the same way, including the posted Go Ninja Waunakee board, and shows on a LVLUP chip only in a week she already has a shift there. Her login still opens the `sueK` checklist. The other posted chips still show only people with a posted shift that week.

The Add shift box (people who can already edit shifts) has a **Time off** switch. It writes the same `ceo/timeclock/timeoff/{id}` record as a request: `empId`, `start`, `end`, `days`, `type` (`pto` or `unpaid`), and `note`. A manager entry is stored `status: "approved"` with `reqVia: "schedule"`, and paid time off logs `ceo/timeclock/pto` through `tcApprovedPtoWrite`, the same row Approve writes. The existing request form is all-day dates, including a multi-day range, so this switch is too. It shows on the Time-off requests card under Show approved, and on the PTO card when the type is paid. The `#clock` kiosk does not get the switch.

Approved time off blocks that person’s day on the master schedule (every location chip and the phone day view) and on the posted team schedule. The cell is a hatched **Time off** block labeled **PTO** or **Unpaid**, instead of the add button. A multi-day `start`–`end` blocks every date in the range. A shift already on that day stays visible and is marked as conflicting. The block opens the request; **Add a shift anyway** is the only way to put a new shift on an approved day. Pending requests are a lighter hint on the manager grid and still leave the add button. Denied requests are not shown. The posted board shows approved time off only, so staff see the block without pending requests. Weekly scheduled hours still count shifts only.

Scheduler labels (`tcStaffLabel`) are display only. A stored `name` that is already first + last is shown as stored. A single-word name gets a surname from `TC_DISPLAY_LAST` (Bryan Goad, Joey Zaworski, Miranda Smith, Ash Mouille, Cat Trevino, Erika Weiss, Mario Sanchez, Abigail Hoefling). The clock record stored as `Ms K` with email `msk.lvlupma@gmail.com` is the Sue seat and shows as Sue Kondratowicz. The location-less Meredith record (`tc_mvvjbiq88fhd`) stays off the scheduler so only Meredith Fitz is scheduled. That hide does not delete a Firebase record or change a task id.

## Dashboard access tiers (`staff/{emailKey}`)

Root path, **not** under `ceo/`. `emailKey` is the lowercase Google email with every `.` replaced by `,` (same key `lvlupma.com` rules use). The dashboard reads this once on sign-in.

| Field | Meaning |
|---|---|
| `role` | `"admin"` or `"staff"` only. This is what `build-db-rules.py` checks. Never store a dashboard tier here. |
| `access.dashboard` | `true` lets a `staff` role open the dashboard. Admins are allowed by `role` alone. Removing a login sets this to `false` and leaves `role` alone. |
| `access.finance` | `true` (boolean) unlocks Growth → GymDesk. Same check as `staffCanFinance()` / the `finance/gymdesk` read rule. |
| `access.growth` | `true` lets an **ops** login see Growth (Scorecard, Goals, Marketing, Financials). Leads see those without this flag. GymDesk still needs `canFinance`. |
| `dashRole` | `"admin"` \| `"lead"` \| `"ops"` \| `"frontdesk"`. Missing value: `role === "admin"` → `admin`; else a known lead/ops email → that tier; otherwise `frontdesk` (an untagged staff login never gets executive views). |
| `empId` | Optional `TASK_EMPLOYEES` seat: `tarikM`, `bryanG`, `ash`, `joeyZ`, `mirandaS`, `sueK`, `andyR`, `marioS`, `erikaD`. On sign-in the Tasks tab opens this checklist instead of Go Ninja (`mirandaS`). Front desk stays on that seat (no 9-person switcher, no cross-school history). Leads and ops can still switch seats. |
| `schools` | Object of canonical location keys set to `true`: `waunakee`, `eastmad`, `verona`, `deforest`, `goninjaW`, `goninjaV`. A school lead’s shift edits use `ceo/timeclock/schedulers/{emailKey}` when that scope exists, otherwise these schools (plus their own shifts). |
| `name` | Display name. Shown next to the header role pill (`Admin`, `School Lead`, `Ops`, `Front Desk`). |

**What each `dashRole` can open** (also enforced in `setSection` / `render`, not only the nav):

| | admin | lead | ops | frontdesk |
|---|---|---|---|---|
| Home, including the weekly L10 agenda | yes | yes | yes | Home without the L10 agenda |
| Ops: Tasks, Events, Testing, Schedule, Inventory | yes | yes | yes | yes, Tasks locked to `empId` |
| Ops → Photos | yes | yes | yes | hidden |
| Schedule: edit shifts | all schools | `tcSchedScope` or `schools` | all schools | read-only |
| Schedule: Timesheets + Payroll | yes | hidden | yes | hidden |
| Scheduler access + holiday overrides | yes | hidden | hidden | hidden |
| Members: Students, Watchlist, First 5, Reviews, Incidents | yes | yes | yes | yes |
| Holds & Cancellations, Applications | yes | yes | yes | hidden |
| Growth: Scorecard, Goals, Marketing, Financials | yes | yes | only if `access.growth` or `access.finance` | hidden |
| Growth → GymDesk | `canFinance` | `canFinance` | `canFinance` | hidden |
| Training (Handbook, Forms & Pages, Playbooks) | yes | yes, playbook filter defaults to Lead Instructor | yes | yes, playbook filter defaults to Front Desk |

Admins (`dashAuth.isAdmin`, which is `role === "admin"` or `dashRole === "admin"`) get **Team Access** from the header. It reads and updates `staff/` in place: email, `dashRole`, `empId`, `schools`, add, and remove. Every save rewrites `role` to the existing `admin` or `staff` value and sets `access.dashboard` so a dashboard edit cannot break the members-site rules. A brand-new login is `role: "staff"` unless that email was already `admin`.

**Storage** bucket `lvlup-members-app.firebasestorage.app`: dashboard uploads to `events/` and `taskPhotos/{loc}/` with **no auth** — the deployed rules must keep those paths open to unauthenticated image uploads. Weekly Capture Content photos use `taskPhotos/content/{empId}/` (videos: `contentSubmissions/{empId}/`) and a row at `ceo/contentSubmissions/{id}` with `status: "new"`. Optional `brand` is `"LVLUP"` or `"GO NINJA"`; `url`, `uploaderId`, `school`, `week`, `pillar`, `caption`, and `status` stay so the marketing bot can keep reading the same record. The staff sheet only lists the viewer’s brand (Go Ninja for `mirandaS`, LVLUP for the other instructors, and for LVLUP only that school’s media). HQ admins see both, with brand filters.

**Security rules live in lvlupma.com, not here.** `database.rules.json` is **generated by `build-db-rules.py`** (edit the `.py`, never the JSON). Deployed via `firebase deploy --only database,storage` from `../lvlupma-website`.

## Drift traps (learned 2026-10-29)
- `config/rosterCode` must be a plain string `"3377"` or `{ code: "..." }` — **not** `{ desk: ... }` (production gate = `deskCodeOk` in lvlupma.com `functions/api/roster-import.js`).
- Don't add a DB/Storage rule that requires a signed-in user on paths the unsigned `#clock` kiosk or the public members site touch. `finance/gymdesk` is the exception: signed-in finance/admin only (see below).
- Keep git's rules matching what's deployed; a `firebase deploy` from a stale branch silently reverts live rules.

## GymDesk finance (`finance/gymdesk`)

Sensitive revenue. It lives in Realtime Database, never in this repo and never as a static file. Do not commit `gymdesk_data.json` / `gymdesk_data.csv`, and do not paste live numbers into `index.html`.

- **Page**: Growth → **GymDesk** (`state.activeSection === 'finance'`). `renderGymdeskFinancePage` and `initGymdeskFinanceCharts` in `index.html`. The tab is added only when `dashAuth.canFinance` is true.
- **Who can see it**: `staff.role === 'admin'`, or `staff.access.finance === true` (boolean, not the string `"true"`). Everyone else, including staff with dashboard access, does not get the tab and the read rule denies them. `staffCanFinance()` is the same check the rules should make.
- **RTDB path**: root `finance/gymdesk` — not under `ceo/`. A `.read` on `ceo` would cascade to children and cannot be tightened, so this node has to be a sibling of `ceo`. The listener is attached only for finance users. Clients never write it (`.write` is false). The bot’s service account bypasses rules.
- **Rules** are not in this repo. `database.rules.json` is generated in lvlupma.com by `build-db-rules.py`. Add this block as a sibling of `ceo`, and only if the root rules object does not already set `.read` / `.write` (a parent allow cannot be narrowed). Realtime Database `replace` swaps one match, so the email’s dots are replaced one at a time (the dashboard uses a global replace). Paste:

```json
"finance": {
  ".read": false,
  ".write": false,
  "gymdesk": {
    ".read": "auth != null && auth.token.email != null && (root.child('staff').child(auth.token.email.toLowerCase().replace('.', ',').replace('.', ',').replace('.', ',').replace('.', ',').replace('.', ',').replace('.', ',')).child('role').val() == 'admin' || root.child('staff').child(auth.token.email.toLowerCase().replace('.', ',').replace('.', ',').replace('.', ',').replace('.', ',').replace('.', ',').replace('.', ',')).child('access').child('finance').val() == true)",
    ".write": false
  },
  "plannerBaseline": {
    ".read": "auth != null && auth.token.email != null && (root.child('staff').child(auth.token.email.toLowerCase().replace('.', ',').replace('.', ',').replace('.', ',').replace('.', ',').replace('.', ',').replace('.', ',')).child('role').val() == 'admin' || (root.child('staff').child(auth.token.email.toLowerCase().replace('.', ',').replace('.', ',').replace('.', ',').replace('.', ',').replace('.', ',').replace('.', ',')).child('role').val() != null && root.child('staff').child(auth.token.email.toLowerCase().replace('.', ',').replace('.', ',').replace('.', ',').replace('.', ',').replace('.', ',').replace('.', ',')).child('role').val() != '' && root.child('staff').child(auth.token.email.toLowerCase().replace('.', ',').replace('.', ',').replace('.', ',').replace('.', ',').replace('.', ',').replace('.', ',')).child('access').child('dashboard').val() == true))",
    ".write": false
  }
}
```

- **Push / one-time seed**: `node scripts/push_gymdesk_data.mjs <path-to-json>` (`--dry-run` validates and does not write). Env: `GOOGLE_APPLICATION_CREDENTIALS` (path to the key file) or `FIREBASE_SERVICE_ACCOUNT_JSON` (the JSON string). Optional `FIREBASE_DATABASE_URL` (default `https://lvlup-members-app-default-rtdb.firebaseio.com`).
- **Credential Mike creates**: Google Cloud / Firebase service account named for this bot, role **Firebase Realtime Database Admin** only (`roles/firebasedatabase.admin`), JSON key stored on the bot — not in git, not a web API key, not `config/webhookSecret`. That key can write the whole database (rules do not apply to it). Do not grant the bot a broader Firebase Admin role.

## Staff checklists

Daily, weekly, and cycle tasks live in `index.html` (`EMP_DAILY`, `FRONTDESK_DAILY`, `lvlupWeekly`, `MIRANDA_WEEKLY`, `FRONTDESK_WEEKLY`, `LVLUP_CYCLE_CHECKLIST`). The dashboard is the only log for those checklists, verification photos, scorecard numbers, and restock items. Do not add a required Slack/`#LVLUPHQ`/`#inventory` proof step for the same work. Slack stays for questions (including `@jam`), shift coverage, urgent issues, and optional wins.

- **Bathroom photo** (`ph_bathroom`, `photo: true`, `multi: true`): a daily task with `days`, not a weekly row. The weekly sheet stays on screen every day until the week is done, so a Monday-only photo does not belong there. `dailyTasksForDate` drops it on any other weekday, and that is what the task sheet, the home pulse, and Tasks → History count. Leads (`bryanG`, `ash`, `joeyZ`, `tarikM`, `mirandaS`) are Monday only (`days: [1]`). Tarik does not have a Friday photo. Front desk is every open day after Monday, from `frontDeskBathroomDays`: Tue–Thu all four seats, Friday Waunakee only (`sueK`), Saturday every seat except DeForest (`erikaD`). It is not on `FRONTDESK_WEEKLY`. Completion is `ceo/tasks/emp/{empId}/daily/{YYYY-MM-DD}/ph_bathroom` on a day it is due. Front desk still tidies bathrooms every shift inside `fd_lobby`. They upload the photo from Ops → Tasks. Ops → Photos stays hidden for `dashRole === 'frontdesk'`.
- **Training floor photo** (`ph_floor`): stays daily for instructors. `TASK_PH_FLOOR` is on Bryan, Ash, Joey, and Tarik. Miranda’s daily item uses the same id with gym-floor wording. It is not weekly.
- **Tarik garbage** (`lvlup_garbage`): on `TARIK_WEEKLY` only, from week `2026-W47` (Monday Nov 16, 2026). One weekly check. The text says he takes out all LVLUP garbage daily (lobby, hallway, and main training floor). Weekly items have no daily frequency — `every` counts weeks — so this row is not also on `TARIK_DAILY`. Bryan, Ash, Joey, and Miranda do not get it.
- **Waunakee front desk cleaning**: `fd_dust_proshop` (“Dust the pro shop”), `fd_lobby_floors` (“Maintain the lobby and hallway floors”), and `fd_lobby_windows` (“Clean the lobby windows”) are daily on `sueK` only, from `2026-11-17`. That seat is Ms K’s checklist (`msk.lvlupma@gmail.com`). East Madison, Verona, and DeForest front desk stay on `FRONTDESK_DAILY` alone. Dates before Nov 17 keep the previous `sueK` list.
- **Day filter:** `dailyTasksForDate(empId, dateKey)` is what `renderTasksPage`, `renderPulseBar`, and `loadHistoryDate` use. It honors `t.days` and keeps `spray_mats` / `j_spray` off Saturday. A task that is not scheduled that weekday must not count as missed.
- **Closing:** School leads share `TASK_CLOSING` (Joey included). Old Slack EOS ids still satisfy it through `TASK_ALIASES.closing` (`eos`, `j_eos`, `eos_report`). There is no `fd_eos` task.
- **Proof:** A new completion is stored with `proofV: 1` and counts toward the bonus, the history percentage, and the home task chip only when its proof is filled. `hasNotes` rejects a blank note. Stoplight (`stoplight`, and cycle `cc_w1_outreach`) completes only from Students-page logs that have a method and initials (`auto: true`); the manual count box is gone, and `completeTaskCount` enforces `min`. Weekly `bday_report` is **Invite birthday families** (named invites, or a one-line “no eligible birthdays” note). Cycle `cc_bday` and `fd_cc_parties` are **Book a party**: child, family, and party date, 2 per cycle. Front desk `fd_questions` is not scored on dates from `2026-11-16` on; earlier days still include it so those totals stay put. “None today” (and the other listed phrases) is a valid complete on the message, follow-up, and quiet-day tasks.
- **Burst:** 4 or more non-photo completions inside 60 seconds set `burst: true` on those new records and `needsReview` for the day. They do not count until a lead, ops, or admin confirms (`burstOk`). Photo uploads are not part of the burst. Tasks → History opens a proof panel (names, counts, photo thumbs, time in America/Chicago, “Auto from Students”, and the needs-review flag).
- **Legacy math:** A record with no `proofV` still counts whenever `taskDone` would have counted it, including `TASK_ALIASES`. Do not rewrite old task ids. `scripts/test-task-cadence.mjs` checks that a full legacy day still scores the same.
- **Backfill:** Yesterday’s daily tasks can be finished until 11:00 AM America/Chicago. After that only an admin can add them. Either way the save is flagged `nextDay` (and `lateBackfill` after 11). Weekly and cycle tasks are not on this clock.
- **Joey’s mops:** `j_spray` and `j_wetmop` stay on the list (Saturday still drops `j_spray`, Monday still owns `j_wetmop`) but they complete only from the `ph_floor` photo when it is marked spray-mopped or wet-mopped. They cannot be ticked on their own.
- **Auto-complete:** A supplies / low-stock / party-supply row completes when Ops → Inventory has an item for that school created or updated this week. `pto_review` completes when that school has no pending time-off. `post_schedule` completes when next week’s Monday key is in `timeclock/schedulePublished`. A legacy record or a hand-entered proof is left alone. These run only after the time clock has loaded, and not on a signed or locked week.
- **Reused photos:** The upload stores a SHA-256 at `tasks/photoHashes/{taskId}/{hash}`. The same hash from an earlier day or week flags `reusedPhoto` and does not count until a manager confirms.
- **Clock-in gate:** `tasks/clockGate/{locId}` defaults off and stays off. An admin can turn it on per school from the task sheet. When on, daily tasks need a punch that day. Closing and photo tasks get 15 minutes after clock-out. An admin can still save and the row is flagged `noClock`.

## Monthly Goals Planner

Growth → Goals → **Monthly Plan** (`renderMonthlyGoalsPage`). One plan per school tab and month at `ceo/monthlyGoals/{locId}/{YYYY-MM}`. Directors use it to see how much revenue they still need **beyond recurring billing**, then build the events and upgrades that close that gap.

- **Billing and headcount** come from `finance/plannerBaseline/{locId}/{YYYY-MM}` = `{ expected_billing, collected, pending, is_partial, paying_members, as_of }`. `expected_billing` is that month’s GymDesk `memberships + sales_pos + pending` (what Monthly Plan still shows). `collected` is earned revenue: the closed-month `total`, or `memberships + sales_pos` when `is_partial` is true. Annual Tracker uses `collected` and does not count pending scheduled bills as earned. Older rows may only have `expected_billing`; the tracker uses that for closed months and ignores it for the in-progress month. Canonical loc ids only (`waunakee`, `eastmad`, `verona`, `deforest`, `goninjaW`, `goninjaV`) — the snapshot’s `east_madison` / `go_ninja_*` keys are mapped in `scripts/push_gymdesk_data.mjs`. The same push that writes `finance/gymdesk` PUTs this node (aggregates only). Finance/admin users fall back to `finance/gymdesk` if the baseline is missing. An empty box shows the figure and is not saved until edited; a saved value is never replaced. If neither source can be read, the box is manual.
- **Annual Tracker** (Growth → Goals → Annual Tracker) reads earned revenue in this order: `finance/gymdesk` when the finance listener has it (partial month = `memberships + sales_pos`, closed month = `total`), then `plannerBaseline.collected` (or closed-month `expected_billing`), then `ceo/financials` `grossTY` / nightly `ceo/scorecardDaily` `monthlyRevenue`. `ceo/goals/2026/vacationOverride/{month}` still replaces the company total. The in-progress month is compared to the goal prorated by the day of the month. “This Month vs Goal” is that comparison only — if the month has no earned figure yet, the card says so instead of repeating an earlier month.
- **Revenue plan**: quantity × price. LVLUP rows are new memberships (default $60), leadership upgrades ($299), legacy upgrades ($349), and merchandise (amount only). Go Ninja rows are new memberships (default $50), birthday parties, open gym / drop-ins, and merchandise. There is no fixed belt-test, tournament, or camp row. **Events** are the only place for those: name, date, type (camp, tournament, clinic, seminar, party/social, belt test, other), purpose (leads / profit / retention), and qty × price. “+ Add event” starts a blank row (qty 1, purpose profit). Planned extra feeds the gap bar. Total revenue = billing + planned extra.
- **Membership plan**: members at the start of the month, intros, close rate (default 80%) → new memberships, attrition % (goal ≤ 3%) → members lost, end-of-month member goal. The calculated new-membership count fills the revenue row unless that quantity is overridden. ARM targets that are already set: Waunakee $210, Verona $200, East Madison $180. DeForest and Go Ninja stay blank (`armTarget`) until someone enters one. Projected ARM = billing ÷ members at the start of the month.
- **Old fields stay.** `revTesting`, `revTournament`, `revCamps`, `revEvent1` / `revEvent2`, and event #1/#2 name and purpose are copied into `planEvents` the first time that month is opened (`planEventsMigrated`). Old stream dollar totals are copied into `planStreams` (`planStreamsMigrated`). Nothing is deleted. Go Ninja `mvmtMembership` / `afterschoolMembership` stay editable when they already have a value.
- **Rules** are not in this repo. In lvlupma.com `build-db-rules.py`, `finance/plannerBaseline` is a sibling of `gymdesk`: `.read` any signed-in staff with dashboard access (`staff/{email}` role admin, or a role with `access.dashboard === true`), `.write` false. Do not deploy rules from this repo.
