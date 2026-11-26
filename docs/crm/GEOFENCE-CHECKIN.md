# Geofence check-in

The native apps are Phase 2. The API they will call is in this build.

## What is stored

Each location can hold `latitude`, `longitude`, `geofence_radius_m` (50–500, the example range is 100–150), `checkin_minutes_before` (default 30), and `checkin_minutes_after` (default 15). Coordinates in git are fixtures, not campus surveys. Mike enters the real points before a phone build ships.

`families.geofence_checkin_opt_in` and `members.geofence_checkin_opt_in` both default to false. A geofence check-in runs only when the family is opted in and that child is opted in.

## Call

`POST /v1/check-ins/geofence` with the family token:

```json
{ "familyId": "…", "locationId": "waunakee", "latitude": 43.01, "longitude": -89.01 }
```

The server compares the point to the school fence, then checks in every child in that family who has a **booked** class at that school whose start is inside the window. Waitlisted spots are not checked in. A second call for the same session is a duplicate, not a second attendance row. The response includes `coordinateStored: false`. The device coordinate is not written.

`POST /v1/check-ins/family` with `source` of `qr_scan`, `kiosk`, or `manual` is the one-scan desk flow. It uses the same booking window and does not require the geofence opt-in, because the adult is acting on purpose.

## Phone flow (not built here)

1. Parent signs in with the existing email link.
2. The app loads the switcher and the schools for those memberships.
3. An explicit screen turns on the family opt-in and each child. Default is off.
4. The phone registers an OS region for each opted-in school using that school’s point and radius. The server does not receive a stream of points.
5. When the OS says the device entered a region, the app takes one location fix and calls the endpoint once.
6. The app shows which children were checked in.
7. Turning the opt-in off removes the OS region. The API then returns `geofence_opt_out`.
