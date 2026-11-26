# Website embed contracts

These are the guest calls. They do not require a Firebase token. They do not accept a phone field. The production host is not wired. Local base URL is `http://127.0.0.1:8787`.

## LVLUP trial (`lvlupma.com`)

1. `GET /v1/public/trials?locationId=waunakee&age=6`  
   Returns upcoming `trial_open` sessions whose age range includes 6. No student names.
2. `POST /v1/public/trials`

```json
{
  "sessionId": "session-id",
  "guardianName": "Jordan Sample",
  "email": "jordan.sample@example.test",
  "childName": "Parker Sample",
  "childAge": "6",
  "source": "website",
  "utm": { "source": "fixture" },
  "waiver": { "version": "fixture-2026-09", "signerName": "Jordan Sample", "signedOn": "2026-11-01" }
}
```

Response: `{ "leadId", "bookingId", "accountRequired": false }`. Pipeline becomes `trial_booked`.

Staff later call `POST /v1/leads/{leadId}/convert`. That creates the family, the student, copies the waiver onto the member, and keeps the trial attribution. The parent can then sign in with the same email.

## Go Ninja party

Bookers are usually not members. One slot can hold one active booking.

1. `GET /v1/public/goninja/packages?locationId=goninjaW`
2. `GET /v1/public/goninja/slots?locationId=goninjaW`  
   Only open slots with no active booking.
3. `POST /v1/public/goninja/bookings`

```json
{
  "slotId": "slot-id",
  "packageId": "package-id",
  "hostName": "Riley Sample",
  "hostEmail": "riley.sample@example.test",
  "childName": "Quinn Sample",
  "childAge": "6",
  "guestCount": 8,
  "addonIds": []
}
```

Response includes `bookingId`, `accessKey`, `charged: false`, `paymentStatus: "unpaid"`. A second post for the same slot is 409.

4. `POST /v1/public/goninja/bookings/{id}/payment` with the access key and an Accept.js `opaqueData` object. This build records `deposit_intent` or `full_intent` and returns `submitted: false`, `charged: false`. The database check does not allow `charged = true`.
5. Staff read `GET /v1/parties?locationId=goninjaW` for host, package, payment status, and the charged flag.

A page on the marketing site should collect the fields above and post them. It should not embed a card field of our own. Card entry, when Mike turns it on later, is Authorize.net hosted fields.

## Family switcher

After sign-in, `GET /v1/families/{id}/switcher` lists the children. The page keeps the selected member id in memory and calls `/v1/members/{id}/journey` again. The token does not change. That matches the GymDesk family sidebar: one account, every linked member, switch without a second login. Sources: [GymDesk family accounts](https://docs.gymdesk.com/en/help/docs/family-accounts) and the [member portal guide](https://docs.gymdesk.com/en/help/docs/member-portal-guide).

## Events

An event has offers (MyStudio calls these dates/options): title, start, price, capacity, waitlist capacity. One checkout can name several children in the same family. A full offer waitlists instead of double-booking. Coupon math reuses `POST /v1/quotes`. MyStudio’s public event article is [Events](https://help.mystudio.io/events). Waitlist behavior follows their class article: a spot opens and the earliest waitlisted booking is promoted ([capacity and waitlists](https://help.mystudio.io/v2-classes-capacity-waitlists-reminders)). This API promotes on cancel. It does not send a message.
