# Financials

The CRM preview Financials tab. It follows the Spark Membership layout in `uploads/spark-financials-layout.md` and uses the sandbox ledger in `crm/src/financials.ts`. Nothing on this screen reads or writes Firebase, GymDesk, Supabase, or Authorize.net.

**[Spark]** means the label or the idea comes from Spark’s public dashboard, Ultimate Stats, or Financial reports. **[LVLUP]** means we added it because Spark does not have that piece in public sources.

## How to see it

The tab stays inside the CRM preview. The HQ dashboard is unchanged without the query.

1. Open `https://staff.lvlupma.com/?crmPreview=1` and sign in with a finance or admin account.
2. Open **CRM preview**, then **Financials**. On a phone it is under **More**.
3. Home → **Payments this month** → **Open Financials** goes to the same tab.

Locally, the same URL works on `localhost` or `127.0.0.1`. Add `&crmTheme=dark` for dark mode, or `&crmSchool=goninja` for the Go Ninja accent. Dollar totals need `canFinance` (admin, or `access.finance === true`). All schools, LVLUP, and Go Ninja rollups are admin-only. A finance login that is not admin sees the schools on their staff record.

## Layout

| Row | What it is | Source |
|---|---|---|
| Header | Scope, period, compare, Hide stats, Stats history, Export | [Spark] controls, [LVLUP] scope list |
| 0 | Red alert banner. Collapses to one alert on a phone, with “Show more” | [Spark] |
| 1 | Collected MTD, Still expected, Past due / failed, Projected month-end, Net billing | [Spark] money row, plus [LVLUP] past-due tile and projected tile |
| 2 | MRR, ARM, Paying members, Length of stay / LTV | [Spark] Ultimate Stats |
| 3 | New, Upgrades, Renewals, Holds, Cancellations, with goal rings. Attrition turns red above 3% | [Spark] movement tiles and goal rings |
| 4 | By school, with LVLUP and Go Ninja sections, or by Authorize.net account | [LVLUP] |
| 5 | MRR trend, this year vs last year, category donut, program bars | [Spark] charts, [LVLUP] program bars on this page |
| 6 | Five-week draft calendar. Phone shows the next 14 days | [LVLUP] |
| 7 | Spark’s financial report list. Each opens a table with a date range, a TOTAL row, and CSV | [Spark] |

Tiles open a drawer of the sandbox families behind the number. Retry and “Send card-update link” only draft a note. They do not charge and they do not send anything.

Hide stats leaves the charts, calendar, and reports on screen.

## Metric definitions

Money is integer cents. The open ledger month is November 2026, as of 2026-11-24. Mini-Tigers and grandfathered plans are monthly (12 drafts a year). Every other plan is every 4 weeks (13 drafts a year), so a month can contain two drafts. Family prices are the snapshotted post-discount amount: 30% at Waunakee and 50% at Verona, East Madison, and DeForest for the 3rd paying member. Go Ninja is not in that rule.

Monthly equivalent: monthly price × 1, 4-week price × 13/12, prepaid price ÷ months covered.

| Tile | Definition |
|---|---|
| Collected | Successful captured or settled charges in the period, all methods, **net of refunds**, by the membership’s school, **pre-tax**, on the **charge date**. [Spark] “This Month Income”, with the refund and tax choices below |
| Still expected | Drafts from today through the period end that are not captured. A hold skips a draft it covers. A draft after the hold ends is included. The headline does **not** include past due. [Spark] “Expected Income”, [LVLUP] split |
| Past due | Open membership balances plus past-due event schedules. Shows families, retries, cards expiring before the next draft, and the oldest age. [LVLUP] tile. [Spark] shows the dollars as sub-lines |
| Projected month-end | Collected + still expected − 4% of still expected. [LVLUP] |
| Net billing | Gain − loss in monthly-equivalent recurring. Gain is new, upgraded, and renewal. Loss is cancellations and downgrades. Holds are a separate line. [Spark] |
| MRR | Monthly equivalent of active and past-due memberships. Holds, trials, comps, and cancellations are zero. [Spark] |
| ARM | MRR ÷ paying members (students, not families). [Spark] “Monthly Value (AVG)” |
| Length of stay / LTV | Average whole months from the start date to cancel, or to today if still active, for the active, past-due, and cancelled cohort. LTV = ARM × that average. [Spark] |
| Attrition | Cancellations this month ÷ (paying members + those cancellations). Red above 3%. [LVLUP] target, [Spark] movement tile |

November’s chart point matches the ledger. Earlier months, Stats history, Last month, and the year-to-date total outside November are **stored snapshots**. They are not recomputed from named charges. A custom range sums named charges only.

Merchant accounts, for the batch view: Waunakee covers Waunakee, DeForest, and Go Ninja Waunakee. Verona covers Verona and Go Ninja Verona. East Madison is its own account. Collected is still attributed to the school, not the merchant, until you switch the table.

## API

Local only (`cd crm && npm start`). Finance or admin.

- `GET /v1/financials/summary?scope=all&period=month&compare=prev_month&asOf=2026-11-24`
- `GET /v1/financials/reports/:id?scope=all&from=2026-11-24&through=2026-11-30`

`period` is `month`, `last`, `ytd`, or `custom`. `compare` is `prev_month`, `prev_year`, or `none`. Unknown scopes and unknown reports are 404. A non-admin asking for `all`, `lvlup`, `goninja`, or a school outside their list is 403. The body is fixture data: `fixture: true`, `live: false`.

Report ids: `transactions`, `by-category`, `by-membership`, `forecast`, `gross-history`, `refunds`, `autocharge`, `past-due`, `sales-tax`, `down-payments`, `credits`, `scheduled`, `end-of-day`, `items-sold`, `ach`, `stats-history`.

The preview does not call this API. It ships the same module, bundled into `index.html` between `FINANCIALS_BUNDLE_START` and `FINANCIALS_BUNDLE_END`. Rebuild that block after a math change:

```bash
npx esbuild crm/src/financials.ts --bundle --format=iife --global-name=LVLUPFin --target=es2018
```

`crm/test/financials.test.ts` checks the bundle against the module.

## Open questions, and what this screen assumes

These are the questions only Mike can close. The screen had to pick one answer so the tiles add up.

1. **Which Spark screen.** The approved plan builds the money row, the Ultimate Stats cards, and the financial report list, plus the LVLUP rows. The guess that the money row is the one Mike meant is still an inference.
2. **Past due inside Still expected.** Shown as sub-lines and in the red tile. Not added into the Still expected headline, and not added into Projected.
3. **Collected date.** Charge / capture date, not the deposit date.
4. **Refunds.** They reduce Collected, and they have their own report.
5. **Failure allowance.** 4% of still expected. Sandbox constant, not a measured decline rate.
6. **Holds and downgrades.** Holds are not Gain or Loss. A draft after the hold ends is expected again. Downgrades are Loss.
7. **Prepaid.** Spread over the months covered. Noah Sample’s prepaid year is in MRR and not in this month’s drafts.
8. **Who sees dollars.** Finance and admin see the whole screen. This preview does not give front desk a past-due list without totals.
9. **ARM.** Per paying member, not per family.
10. **Sales tax.** Tiles are pre-tax. Tax is only on the Sales Tax report (the sandbox pro shop lines).
11. **Goals.** Sandbox goals sized to this ledger, not the live dashboard goals. Movement rings use sandbox counts.
12. **DeForest / MPK.** One DeForest row. No split line.
13. **Categories.** Tuition, Events / Tournaments, Camps, Birthday Parties, Pro Shop / Retail, Testing (pre-2027), Other.
14. **ACH.** No school in this fixture takes ACH. The ACH report says so. Drafts are card, cash, or check.

The named families are the Sample roster already used in the CRM preview (Avery, Blake, Casey, and the other Sample names). Totals are those rows. They are not the Home rollup and they are not live GymDesk numbers.
