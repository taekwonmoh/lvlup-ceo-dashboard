# LVLUP CRM and member platform (phase 0)

Design only. Nothing in this folder is deployed, and nothing here is applied to Firebase, Supabase, GymDesk, or Authorize.net.

Mike Moh wants to replace GymDesk with a CRM and member platform that the staff dashboard (`staff.lvlupma.com`, this repo), the members area of [lvlupma.com](https://github.com/taekwonmoh/lvlupma-website), and future iPhone and Android apps all share. Each school keeps its own Authorize.net merchant account. GymDesk already stores cards as Authorize.net CIM profiles and runs the billing schedule itself. There are no Authorize.net ARB subscriptions. The new system can charge those profiles, and it has to own the schedule.

## Read this first

| Doc | What it is |
|---|---|
| [CURRENT-STATE.md](CURRENT-STATE.md) | Every way the dashboard and the website touch GymDesk today, plus the backends they already use. |
| [ARCHITECTURE.md](ARCHITECTURE.md) | The target platform: stack, auth, API, mobile, security, and the phased roadmap. |
| [DATA-MODEL.md](DATA-MODEL.md) | Schools, families, members, ranks, attendance, billing objects. |
| [BILLING.md](BILLING.md) | The billing engine: schedules, proration, holds, retries, receipts, refunds, webhooks. |
| [MIGRATION.md](MIGRATION.md) | How to leave GymDesk without double-billing. |
| [schema/001_init.sql](schema/001_init.sql) | Draft Postgres schema. Not applied anywhere. |
| [api/openapi.yaml](api/openapi.yaml) | Draft HTTP contract for the dashboard, the website, and the apps. |
| [MEMBERS-API.md](MEMBERS-API.md) | Endpoints the lvlupma.com members area will call, including promo codes on a booking. |
| [STAFF-OPS.md](STAFF-OPS.md) | How task sheets and the staff scheduler work today, and how they move into this model without a cutover. |
| [`crm/`](../../crm/) | The runnable backbone: migrations, API, fixtures, and tests. |

## Decision in one paragraph

Put the new system of record in a **new** Supabase Postgres project. Do not put it in Supabase project `xxyndswrierztzdbjvrd` (that database is a separate training app, and it is production). Expose one Cloudflare Worker API. Keep Firebase Auth for the first releases so staff Google sign-in and parent email-link sign-in keep working. Charge existing CIM profiles from a billing worker that knows which school’s merchant account to use. Store profile ids, never card numbers. Ship the member apps with Expo (React Native) against the same API.

## Open questions for Mike

These block a build. They do not block this design.

1. **GymDesk exports.** Which of these can we download, per school, without member lists landing in git: members (id, status, joined, rank, plan, family), guardians and emails, attendance, payment history (dates and amounts, not cards), leads, the class schedule, and prepaid balances? The website already expects a Members CSV (`First Name`, `Last Name`, `Joined`, `Status`) and a check-ins export.
2. **Authorize.net, per school.** For Waunakee, East Madison, Verona, DeForest, Go Ninja Waunakee, and Go Ninja Verona: is there a separate merchant account, and who can create a **sandbox** API login, transaction key, and signature key? Production keys stay out of git and out of this repo. Waunakee is described as 363 CIM profiles, 358 with a payment method, each with a 7–8 digit merchant customer id that is probably the GymDesk member id. Please confirm that join on a handful of profiles before any import.
3. **Billing cadence.** The 2027 prepaid page treats a standard year as **13 payments** (a charge about every 4 weeks) and Mini-Tigers as **12**. Is every live plan on a 4-week draft, a calendar month, or a mix? What is the anchor: join date, a fixed weekday, or the 1st?
4. **DeForest money.** The dashboard warns that DeForest GymDesk revenue is gross, before the MPK split, and that MyStudio collections are not in the snapshot. Which merchant account actually drafts DeForest tuition?
5. **Go Ninja.** Revenue for both Go Ninja schools is in the GymDesk snapshot, but the public booker and the members roster do not include them. Are they GymDesk locations with their own CIM accounts, or a different billing setup? Parties and camps are first-class on the Go Ninja KPI grid.
6. **Hold fee and notice.** The public hold form stores a request only. A $15 monthly hold fee is a draft and is not charged. Notice is 30 calendar days from the written request, and days already on hold do not count. Still open: the fee amount, per student or per family, the proration denominator, whether a paid hold fee is credited against notice-period tuition, and the effective date. Nothing should start charging until Mike signs that policy.
7. **Failed drafts.** After how many retries should a student keep training, and when should the membership pause? Suggested default is in [BILLING.md](BILLING.md) and is not a decision.
8. **Family across schools.** A family with a child in Waunakee and a child in Verona must be charged on two merchant accounts. Confirm that is acceptable, and whether a second guardian (not the GymDesk receipt email) should be able to sign in on day one.
9. **ATA.** Rank checks on the dashboard say “GymDesk vs ATA”, and applications include “Register in ATA”. ATA EZSignup stays untouched. Should belt testing registration remain there, with this platform only recording the result?
10. **What we retire last.** Member class booking, prepaid shop links, and the front-desk POS habit all live in GymDesk today. Which of those must work in the new system before the first school stops drafting in GymDesk?
11. **Task sheets.** The lists in `index.html` cover daily, weekly, monthly, and cycle checks, plus custom rows, a weekly sign-off, and a “did not work” flag. Proof is a note, a count, a photo, or an automatic completion from inventory or the schedule. Which of those must the first CRM task screen reproduce, and which can wait?
12. **Seat versus clock id.** A task seat (`ash`, `sueK`) is not always the clock id (`tc_ash`). Is there a table that pairs them, or should staff confirm each pair during import?
13. **Hours.** Payroll can follow scheduled shift length or punched in/out. Which one should the CRM treat as the hours of record?
14. **Promo stacking.** The engine allows a code to be marked stackable. Should a percent code and a fixed code on the same clinic be allowed in practice, or should the first codes you create all be non-stacking?
15. **Curriculum.** Rank videos today are Vimeo embeds in the members page, organized by cycle theme. Should the CRM store one video per rank, or one set of videos per cycle that cuts across ranks?

## Hard rules for every later phase

- No card numbers, CVV, or magnetic data in Postgres, Firebase, logs, or git.
- No live charge, even for a dollar, until a school is explicitly cut over. Sandbox and recorded mocks until then.
- No member PII or ATA numbers committed to this repo. Imports run from files that stay outside git.
- Dashboard behavior does not change in the phase 0 pull request.
- Supabase project `xxyndswrierztzdbjvrd` is not migrated, altered, or used as the CRM.
