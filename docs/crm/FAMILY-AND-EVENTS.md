# Family accounts and events

## Family

One family, one or more guardians, one or more students. Guardians dedupe by email. The GymDesk import keeps every child when two Firebase family ids share an email, and it keeps both Firebase ids on the crosswalk.

Staff and parents switch children from `GET /v1/families/{id}/switcher` without a new token. Journey, resources, and bookings take the selected member id. GymDesk documents the same idea: manage every linked member from any profile ([family accounts](https://docs.gymdesk.com/en/help/docs/family-accounts), [member app](https://docs.gymdesk.com/en/help/docs/member-app-features)).

`GET /v1/families/{id}/timeline` lists attendance, rank events, non-shadow ledger lines, linked leads, two-way messages, and dry-run automation steps. `GET /v1/members/{id}/timeline` is the same stream limited to that student plus family-level rows. Purchases, parties, and private lessons write the same ledger with both `family_id` and `member_id`.

## Events and classes

Offers are the bookable dates under an event (MyStudio’s dates/options: [Events](https://help.mystudio.io/events)). Capacity is on the session or the offer. A full session waitlists. Cancelling a booked seat promotes the oldest waitlisted booking ([class waitlist](https://help.mystudio.io/v2-classes-capacity-waitlists-reminders)).

Guest party booking is a separate contract in [WEBSITE-EMBEDS.md](WEBSITE-EMBEDS.md) because the host usually has no account.

## Money and messages that do not send

Shadow billing builds the Waunakee, East Madison, or Verona draft and compares it to a payments export: matched amounts, mismatches, people we would skip for hold or prepaid, and GymDesk charges we would not make (double-charge risk).

Dunning dates are attempt 1 on the bill date, +3 days, +7 days (`past_due`), +14 days, then stop. The preview sets `sent: false`. The older `automation_rules` rows cannot be turned on. Communication rows can only be `dry_run`. The journey catalog can name an SMS step, and that step is stored as dry-run with no destination number. Nothing is sent. See [AUTOMATIONS-AND-MESSAGING.md](AUTOMATIONS-AND-MESSAGING.md).

Statements are a year of non-shadow ledger totals with `delivery: not_sent`.

At-risk attendance is a query: recent classes at or below half of a baseline of at least four. It does not message anyone.
