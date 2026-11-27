-- Staff studio ops: owner pulse support tables, outreach drafts,
-- miss-you retention, testing roster, lobby QR scans, and curriculum quizzes.
-- Migration 016.
-- Do not apply this file to Supabase project xxyndswrierztzdbjvrd
-- or belfzlyvgjheudxhviyt, or to any other live database.
-- Local tests apply crm/migrations/016_studio_ops.sql.
-- The ordered Supabase copy is 20261127000016_studio_ops.sql.
-- Sends stay off. Charges stay off. Belt tests are included with tuition.
-- No phone numbers. No card numbers.

create table if not exists studio_outreach_drafts (
  id uuid primary key default gen_random_uuid(),
  person_key text not null,
  location_id text not null references locations (id),
  channel text not null,
  body text not null,
  template_id text,
  sent boolean not null default false,
  charged boolean not null default false,
  created_at timestamptz not null default now(),
  check (channel in ('sms', 'email', 'call', 'note')),
  check (sent = false),
  check (charged = false),
  check (person_key ~ '^[a-z][a-z0-9_]{0,39}$'),
  check (char_length(btrim(body)) between 1 and 1000),
  check (body !~* 'tel:' and body !~* 'sms:'),
  check (template_id is null or template_id ~ '^[a-z0-9_]{1,40}$')
);

create index if not exists studio_outreach_person_idx
  on studio_outreach_drafts (person_key, created_at desc);

create table if not exists studio_retention_status (
  person_key text primary key,
  location_id text not null references locations (id),
  status text not null,
  snooze_until date,
  updated_at timestamptz not null default now(),
  check (status in ('open', 'snoozed', 'resolved')),
  check (person_key ~ '^[a-z][a-z0-9_]{0,39}$'),
  check (status <> 'snoozed' or snooze_until is not null)
);

create table if not exists studio_testing_roster (
  id uuid primary key default gen_random_uuid(),
  person_key text not null,
  location_id text not null references locations (id),
  action text not null,
  belt_test_fee_cents integer not null default 0,
  fee_model text not null default 'included_2027',
  sent boolean not null default false,
  charged boolean not null default false,
  created_at timestamptz not null default now(),
  check (action in ('invite', 'roster')),
  check (belt_test_fee_cents = 0),
  check (fee_model = 'included_2027'),
  check (sent = false),
  check (charged = false),
  check (person_key ~ '^[a-z][a-z0-9_]{0,39}$'),
  unique (person_key, action)
);

create table if not exists studio_qr_scans (
  id uuid primary key default gen_random_uuid(),
  location_id text not null references locations (id),
  kind text not null,
  payload text not null,
  charged boolean not null default false,
  sent boolean not null default false,
  created_at timestamptz not null default now(),
  check (kind in ('trial', 'checkin', 'checkout')),
  check (charged = false),
  check (sent = false),
  check (payload ~ '^LVLUP:(TRIAL|CHECKIN|CHECKOUT):(WAUNAKEE|EASTMAD|VERONA|DEFOREST|GNW|GNV):DEMO$')
);

create table if not exists curriculum_quizzes (
  id text primary key,
  program text not null,
  belt text not null,
  cycle_theme text not null,
  title text not null,
  questions jsonb not null,
  pass_pct integer not null default 70,
  active boolean not null default true,
  check (id ~ '^[a-z0-9-]{1,40}$'),
  check (char_length(btrim(title)) between 2 and 80),
  check (jsonb_typeof(questions) = 'array'),
  check (pass_pct between 1 and 100),
  check (title !~* 'tel:' and title !~* 'sms:')
);

create table if not exists curriculum_quiz_questions (
  id text primary key,
  quiz_id text not null references curriculum_quizzes (id),
  prompt text not null,
  choices jsonb not null,
  answer_index smallint not null,
  sort_order integer not null default 100,
  check (id ~ '^[a-z0-9-]{1,40}$'),
  check (char_length(btrim(prompt)) between 2 and 160),
  check (prompt !~* 'tel:' and prompt !~* 'sms:'),
  check (jsonb_typeof(choices) = 'array'),
  check (answer_index >= 0)
);

create table if not exists curriculum_quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  quiz_id text not null references curriculum_quizzes (id),
  person_key text not null,
  score_pct integer not null,
  passed boolean not null,
  answers jsonb not null default '[]'::jsonb,
  taken_on date not null,
  created_at timestamptz not null default now(),
  check (person_key ~ '^[a-z][a-z0-9_]{0,39}$'),
  check (score_pct between 0 and 100),
  check (jsonb_typeof(answers) = 'array')
);

insert into curriculum_quizzes (id, program, belt, cycle_theme, title, questions)
values
  (
    'white-korean', 'Taekwondo', 'White', 'Respect', 'White belt Korean counts',
    '[{"id":"wk1","prompt":"What is the Korean word for belt?","choices":["Dobok","Ti","Dojang"],"answer":1},{"id":"wk2","prompt":"Which word means three?","choices":["Hana","Dul","Set"],"answer":2},{"id":"wk3","prompt":"What is the training hall called?","choices":["Dojang","Dobok","Charyeot"],"answer":0}]'::jsonb
  ),
  (
    'yellow-stances', 'Taekwondo', 'Yellow', 'Foundation', 'Yellow belt stances and blocks',
    '[{"id":"ys1","prompt":"What is the walking stance called?","choices":["Ap kubi","Ap chagi","Sonnal"],"answer":0},{"id":"ys2","prompt":"What is a low block called?","choices":["Eolgul makki","Arae makki","Dollyo chagi"],"answer":1},{"id":"ys3","prompt":"Which command means attention?","choices":["Kyungye","Baro","Charyeot"],"answer":2}]'::jsonb
  ),
  (
    'ninja-safety', 'Go Ninja', 'White', 'Balance', 'Go Ninja floor safety',
    '[{"id":"ns1","prompt":"What do you do before you climb?","choices":["Look at the coach","Run at the wall","Close your eyes"],"answer":0},{"id":"ns2","prompt":"Grip socks are for which floor?","choices":["The parking lot","The ninja floor","The lobby tile"],"answer":1},{"id":"ns3","prompt":"Where does a spotter stand?","choices":["In the lobby","On the beam","Beside the athlete"],"answer":2}]'::jsonb
  )
on conflict (id) do nothing;
