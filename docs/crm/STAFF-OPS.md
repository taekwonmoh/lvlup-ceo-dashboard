# Task sheets and the staff scheduler

Both live in this dashboard (`index.html`) on Firebase Realtime Database `lvlup-members-app`, under `ceo/`. The members site does not render them. GymDesk is not the staff scheduler. No Google Sheet is referenced in either repo.

This pull request does not change those screens. The CRM tables and the import functions are a second copy you can fill from a snapshot. Nothing here writes `ceo/tasks` or `ceo/timeclock`.

## Task sheets today

Ops → Tasks. The lists are code, not rows in the database: `EMP_DAILY`, `FRONTDESK_DAILY`, `lvlupWeekly`, `MIRANDA_WEEKLY`, cycle checklists. `dailyTasksForDate(empId, dateKey)` decides what is due. A task with `days` is skipped on other weekdays. `spray_mats` and `j_spray` are never due on Saturday.

Completions are per seat:

| Cadence | Path |
|---|---|
| Daily | `ceo/tasks/emp/{seat}/daily/{YYYY-MM-DD}/{taskId}` |
| Weekly | `ceo/tasks/emp/{seat}/weekly/{weekKey}/{taskId}` |
| Monthly | `ceo/tasks/emp/{seat}/monthly/{YYYY-MM}/{taskId}` |
| Cycle | `ceo/tasks/emp/{seat}/cycle/{cycleKey}/{taskId}` or `cycle_checklist` for LVLUP |
| Custom | `custom_daily`, `custom_weekly`, `custom_monthly` under the same seat |
| Sign-off | `weekly_signoff` |
| Did not work | `did_not_work` |

A completion looks like `{ ts, proofV: 1, note?, photos?, burst? }`. Photos go to Storage `taskPhotos/`. Some weekly rows name students (birthday invites, at-risk boosters). Those are the tasks that should link to a CRM `member_id`. The adapter stores `memberId` when the snapshot has one. It does not parse names out of notes, because a note is not an id.

Seats in code include `bryanG`, `ash`, `joeyZ`, `tarikM`, `mirandaS`, and the front desk seats `sueK`, `andyR`, `marioS`, `erikaD`. That seat id is not the clock id (`tc_ash` and similar). The CRM keeps both: `seat_id` on the definition and `clock_staff_id` on the completion, and `staff_users` can hold both.

`crm/src/tasks.ts` `completionsFromFirebase` maps a snapshot. `POST /v1/tasks/import` loads the fixture in `crm/fixtures/firebase-tasks.json`. `GET /v1/tasks` is staff-only.

## Scheduler today

Schedule tab, same dashboard. Staff roster is `ceo/timeclock/staff/{id}` (`name`, `loc`, `fullTime`, PTO fields, `schedAll`, `schedLocs`). It is not the login record. Logins stay at root `staff/{emailKey}` with `dashRole`.

| Data | Path |
|---|---|
| Shift | `ceo/timeclock/schedule/{staffId}/{YYYY-MM-DD}/{shiftId}` = `{ start, end, loc, role? }` |
| Published week | `ceo/timeclock/schedulePublished/{weekKey}` = `{ snap, publishedAt, label }` |
| Time off | `ceo/timeclock/timeoff/{id}` = `{ empId, start, end, type: pto\|unpaid, status, note, reqVia? }` |
| Punch | `ceo/timeclock/entries/{staffId}/{date}/{entryId}` = `{ inAt, outAt, inLoc, … }` |
| Who may edit | `ceo/timeclock/schedulers/{emailKey}` plus `dashRole` |
| Geofence | `ceo/timeclock/config` |

Approved time off blocks the day on the grid. A shift that is already there is marked as a conflict. Pending time off does not remove the add button. The `#clock` kiosk writes punches and does not get the time-off switch.

`crm/src/schedule.ts` maps that shape and flags a shift that lands on approved time off. `payHours` is the paycheck: punched minutes only. Scheduled minutes are returned beside it for comparison. `POST /v1/staff-schedule/import` loads `crm/fixtures/firebase-schedule.json`.

Class sessions (`class_sessions`) are the member calendar. A staff shift can point at `class_session_id` when someone is assigned to a class. The fixture does not invent that link.

## Migration path

1. Keep writing Firebase. The dashboard code in `index.html` stays the source of punches, shifts, and task checks.
2. A later job reads those nodes (service account, same pattern as the GymDesk snapshot push) and calls the import functions. It does not delete Firebase rows.
3. Staff identity is the join: Firebase `staff/{email}` email plus `timeclock/staff` id, both stored on `staff_users`. Roles stay `admin` / `staff` for security rules, and `dash_role` stays `admin` | `lead` | `ops` | `frontdesk`.
4. When a week of imports matches the screen, the task sheet and the scheduler can read the API. Only then does a PR stop writing the Firebase path it replaced.
5. The kiosk moves last. It is unsigned. Its paths must stay open until the kiosk itself is replaced.

## Open questions

See the list in [README.md](README.md). The ones that are only about these two tools: whether custom tasks and exception logs must round-trip, whether payroll should use scheduled hours or punched hours, and how a task seat lines up with a clock id when they differ.
