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

**Staff schema** `ceo/timeclock/staff/{id}` = `{ name, loc, fullTime?, hireDate?, ptoAnchor?, ptoDays?, ptoFirstYearDays?, scheduleOnly? }`. Rosters are grouped **by brand only** (LVLUP vs Go Ninja), never by individual location. This is the clock roster, not the login record. Logins live at root `staff/{emailKey}` (see below).

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

**Storage** bucket `lvlup-members-app.firebasestorage.app`: dashboard uploads to `events/` and `taskPhotos/{loc}/` with **no auth** — the deployed rules must keep those paths open to unauthenticated image uploads.

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

## Monthly Goals Planner

Growth → Goals → **Monthly Plan** (`renderMonthlyGoalsPage`). One plan per school tab and month at `ceo/monthlyGoals/{locId}/{YYYY-MM}`. Directors use it to see how much revenue they still need **beyond recurring billing**, then build the events and upgrades that close that gap.

- **Billing and headcount** come from `finance/plannerBaseline/{locId}/{YYYY-MM}` = `{ expected_billing, collected, pending, is_partial, paying_members, as_of }`. `expected_billing` is that month’s GymDesk `memberships + sales_pos + pending` (what Monthly Plan still shows). `collected` is earned revenue: the closed-month `total`, or `memberships + sales_pos` when `is_partial` is true. Annual Tracker uses `collected` and does not count pending scheduled bills as earned. Older rows may only have `expected_billing`; the tracker uses that for closed months and ignores it for the in-progress month. Canonical loc ids only (`waunakee`, `eastmad`, `verona`, `deforest`, `goninjaW`, `goninjaV`) — the snapshot’s `east_madison` / `go_ninja_*` keys are mapped in `scripts/push_gymdesk_data.mjs`. The same push that writes `finance/gymdesk` PUTs this node (aggregates only). Finance/admin users fall back to `finance/gymdesk` if the baseline is missing. An empty box shows the figure and is not saved until edited; a saved value is never replaced. If neither source can be read, the box is manual.
- **Annual Tracker** (Growth → Goals → Annual Tracker) reads earned revenue in this order: `finance/gymdesk` when the finance listener has it (partial month = `memberships + sales_pos`, closed month = `total`), then `plannerBaseline.collected` (or closed-month `expected_billing`), then `ceo/financials` `grossTY` / nightly `ceo/scorecardDaily` `monthlyRevenue`. `ceo/goals/2026/vacationOverride/{month}` still replaces the company total. The in-progress month is compared to the goal prorated by the day of the month. “This Month vs Goal” is that comparison only — if the month has no earned figure yet, the card says so instead of repeating an earlier month.
- **Revenue plan**: quantity × price. LVLUP rows are new memberships (default $60), leadership upgrades ($299), legacy upgrades ($349), and merchandise (amount only). Go Ninja rows are new memberships (default $50), birthday parties, open gym / drop-ins, and merchandise. There is no fixed belt-test, tournament, or camp row. **Events** are the only place for those: name, date, type (camp, tournament, clinic, seminar, party/social, belt test, other), purpose (leads / profit / retention), and qty × price. “+ Add event” starts a blank row (qty 1, purpose profit). Planned extra feeds the gap bar. Total revenue = billing + planned extra.
- **Membership plan**: members at the start of the month, intros, close rate (default 80%) → new memberships, attrition % (goal ≤ 3%) → members lost, end-of-month member goal. The calculated new-membership count fills the revenue row unless that quantity is overridden. ARM targets that are already set: Waunakee $210, Verona $200, East Madison $180. DeForest and Go Ninja stay blank (`armTarget`) until someone enters one. Projected ARM = billing ÷ members at the start of the month.
- **Old fields stay.** `revTesting`, `revTournament`, `revCamps`, `revEvent1` / `revEvent2`, and event #1/#2 name and purpose are copied into `planEvents` the first time that month is opened (`planEventsMigrated`). Old stream dollar totals are copied into `planStreams` (`planStreamsMigrated`). Nothing is deleted. Go Ninja `mvmtMembership` / `afterschoolMembership` stay editable when they already have a value.
- **Rules** are not in this repo. In lvlupma.com `build-db-rules.py`, `finance/plannerBaseline` is a sibling of `gymdesk`: `.read` any signed-in staff with dashboard access (`staff/{email}` role admin, or a role with `access.dashboard === true`), `.write` false. Do not deploy rules from this repo.
