# Rank journey

Belt names, order, and the two program changes come from `crm/src/ranks.ts` and `crm/migrations/005_ranks_curriculum.sql` (PR 62). This layer does not add belt names.

`GET /v1/members/{id}/journey` returns where the student is, the next step, and the road ahead. `GET /v1/pathways` returns the career rows Mike can edit.

## Martial ladder

| From | To | How |
|---|---|---|
| Mini Tiger steps, White through Baron the Panther | next Mini Tiger step | sort order in the catalog |
| Baron the Panther (`mini_tiger.baron`) | Tiger White (`tiger.white`) | `rank_transitions` program change |
| Tiger steps, White through Baron the Panther | next Tiger step | sort order |
| Baron the Panther (`tiger.baron`) | Taekwondo White (`songahm.white`) | program change |
| White, Orange, Yellow, then Camo through Red as Recommended and Decided | next color belt | sort order |
| Red / Black | 1st Degree Black Belt | sort order |
| 1st through 8th Degree Black Belt | the next degree | sort order |
| 9th Degree Black Belt | none | end of the catalog |

Color-belt stripes and Red / Black stripes are the stripe systems already in the catalog. Degree rules through 4th degree are `DEGREE_REQUIREMENTS` in `ranks.ts`. The 4th-to-5th row says the rest is set with the instructor. 6th through 9th Degree exist on the ladder and have no coded class requirement.

## Career rows Mike can change without a code change

These live in `career_pathways`, `career_milestones`, and `career_title_map`. `needs_signoff` means the name may be a label he asked for, and the classes, age, or time in rank are not a rule yet.

| Pathway | What is already in the catalog | What is unset |
|---|---|---|
| LVLUP Legacy | Level 1 - Connector through Level 9 - Class Commander | Whether this is the Leadership track. Class counts and time in rank. |
| ATA Instructor Certification | Red Collar (age 10), Red/Black Collar (14), Black/Red/Black Collar (16), Black Collar (18) | Class counts and time in rank. |
| Master | No rank is named Master. The milestone points at 9th Degree only as a suggested end of the belt ladder. | The actual Master rule. |
| School Owner | No School Owner rank. | Rank, age, classes, and time in rank. |

Proposed titles that are **not** catalog rank names:

| Title | Mapped milestone | Sign-off |
|---|---|---|
| Leadership | `legacy.l1` (catalog name is Level 1 - Connector) | Confirm or replace |
| Junior Instructor | none | Pick a collar or Legacy level, or retire the title |
| Certified Instructor | none | Pick a collar, or retire the title |

Update a row to set a number. The journey API reads these tables. Do not add a new belt string in the client.
