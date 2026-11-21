# Members-area API contract

For the next pull request in `taekwonmoh/lvlupma-website`. This repo does not change that site.

Base URL in development: `http://127.0.0.1:8787` from `npm start` inside `crm/`. Production host is not deployed. Every route takes `Authorization: Bearer` with the same role token the dashboard will use. Until Firebase verification is wired, local tokens are HMAC tokens from `crm/src/auth.ts` (`admin`, `staff`, `guardian`, `member`).

Guardian tokens see only their `familyIds`. A member token sees only their own member id and cannot read promo administration, tasks, or the staff schedule. A family with children at two schools is one family and two memberships. The members UI should switch the selected member in memory and call the member endpoints again. It should not sign the parent out.

## Calls the members pages make

| Screen today | Call | What to show |
|---|---|---|
| Sign-in home, child switcher | `GET /v1/me` then `GET /v1/families/{familyId}` | Guardian email, each child, each child’s `locationId`. Switching children does not change the token. |
| Belt / rank | `GET /v1/members/{memberId}` | Name, school, plan. Rank events are the next field to add on this payload; until then the Firebase belt journey stays the display. |
| Book a class | `GET /v1/sessions?locationId&from&to` (OpenAPI) | Our sessions, not a GymDesk tab, once that school has cut over. Until then keep the GymDesk link. |
| Price on a clinic, tournament prep, or event | `POST /v1/quotes` | Body below. Show `dueCents` next to `listPriceCents` before the parent confirms. |
| Confirm a booking with a code | `POST /v1/sessions/{sessionId}/bookings` with the code, then `POST /v1/promo-redemptions` | Redemption is stored against the booking. `chargeId` stays null until a real charge exists. This backbone does not charge. |
| Hold or cancel | `POST /v1/memberships/{id}/holds` and `POST /v1/cancellation-requests` | Request only. Notice is 30 days from the Chicago receipt date. An approved hold suppresses tuition drafts. The hold fee stays off until Mike enables it. |
| Card on file | `POST /v1/payment-profiles/accept` | Accept.js opaque token plus `locationId`. Response is brand and last4. The token is not stored. Sandbox only in this build. |
| Payment history | `GET /v1/invoices?membershipId` | Guardians see their own invoices. Shadow drafts are staff-only. |

`POST /v1/quotes` body:

```json
{
  "listPriceCents": 5000,
  "on": "2026-11-21",
  "locationId": "waunakee",
  "brand": "lvlup",
  "eventType": "clinic",
  "buyer": "member",
  "familyId": "…",
  "memberId": "…",
  "codes": ["CLINIC10"]
}
```

`buyer` is `member` (active membership), `new_customer` (no membership yet), or `lead`. A members-only code returns 422 for a lead. A new-customer code returns 422 for a member. Two codes return 422 when either one has `stacks: false`. A code scoped to a school, a brand, an event type, an event, or a session returns 422 on anything else. The response is `{ listPriceCents, discountCents, dueCents, applied: [{ code, discountCents, priceAfterCents }] }`.

Show the discounted price on the booking step before confirm. If the quote fails, leave the list price and the error string. Do not invent a discount in the page.

## What the members site should not call yet

- `/v1/tasks` and `/v1/staff-schedule` are staff-only. The public site does not read the task sheet or the staff scheduler.
- `/v1/charges/preview` is finance staff. It returns the Authorize.net body and `submitted: false`.
- `/v1/imports/gymdesk` is the fixture importer for staff.

## Auth the website already has

Parents sign in with a Firebase email link (`members-auth.js`). The later website PR should send that ID token. This backbone’s local server still expects its own HMAC token so the tests do not need Firebase. The claim shape to map is: email, role `guardian` or `member`, `familyIds`, optional `memberId`.
