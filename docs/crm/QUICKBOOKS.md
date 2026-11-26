# QuickBooks

Three companies, mapped with the tuition merchant:

| Company | Schools |
|---|---|
| Moh's Martial Arts LLC | Waunakee, and (until Mike says otherwise) DeForest and Go Ninja Waunakee |
| LVLUP Martial Arts 2 LLC | East Madison |
| LVLUP Martial Arts 3 LLC | Verona, and (until Mike says otherwise) Go Ninja Verona |

`POST /v1/qbo/preview` builds a balanced bill or journal and stores it with `submitted: false`. The table check refuses `submitted = true`. `QBO_ENABLED=1` still throws `qbo_network_disabled`. Account codes in the preview (`FIX-5000`, `FIX-2000`) are placeholders, not a chart of accounts.

## What Mike approves before any Intuit call

1. An Intuit developer app, one OAuth connection per company realm.
2. Scope `com.intuit.quickbooks.accounting` only.
3. A redirect URL he chooses.
4. Refresh tokens as Worker secrets: `QBO_MOH_REFRESH_TOKEN`, `QBO_LVLUP2_REFRESH_TOKEN`, `QBO_LVLUP3_REFRESH_TOKEN`. Not in git.
5. His chart-of-accounts ids for tuition, events, retail, private-lesson income, private-lesson expense, and instructor payable, per company.
6. Which instructor maps to which vendor in each company.
7. Confirmation that DeForest and the Go Ninja schools belong on those LLCs.
8. A later build that is allowed to POST. This one is not.

Private-lesson payouts use `instructor_pay_rules`: a percent of paid lesson revenue, optional per school and lesson type, with effective dates. The most specific matching rule wins. Unpaid lessons are listed and are not in the share. Clock minutes are added only as hours, not as pay, until payroll says otherwise.
