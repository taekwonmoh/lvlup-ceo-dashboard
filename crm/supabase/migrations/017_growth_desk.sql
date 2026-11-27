-- Category fee pass-through, lead pipeline, reviews, and the website chat toggle.
-- Migration 017.
-- Do not apply this file to a live database.
-- Pro Shop pass-through stays off. Belt tests stay at $0.
-- Sends stay off. Nothing here charges a card.

create table if not exists fee_pass_settings (
  id text primary key,
  card_bps integer not null default 290,
  card_fixed_cents integer not null default 30,
  ach_mode text not null default 'percent',
  ach_bps integer not null default 80,
  ach_flat_cents integer not null default 0,
  tuition_on boolean not null default true,
  events_on boolean not null default false,
  parties_on boolean not null default false,
  proshop_on boolean not null default false,
  belt_test_fee_cents integer not null default 0,
  updated_at timestamptz not null default now(),
  check (id = 'default'),
  check (ach_mode in ('percent', 'flat')),
  check (card_bps between 0 and 10000),
  check (ach_bps between 0 and 10000),
  check (card_fixed_cents >= 0),
  check (ach_flat_cents >= 0),
  check (proshop_on = false),
  check (belt_test_fee_cents = 0)
);

insert into fee_pass_settings (id) values ('default')
on conflict (id) do nothing;

create table if not exists lead_pipeline (
  person_key text primary key,
  stage text not null,
  source text not null default '',
  location_id text not null references locations (id),
  stage_since date not null,
  updated_at timestamptz not null default now(),
  check (stage in ('new', 'booked', 'showed', 'noshow', 'enrolled')),
  check (person_key ~ '^[a-z][a-z0-9_]{0,39}$')
);

create table if not exists smart_lists (
  id text primary key,
  name text not null,
  filters jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (id ~ '^[a-z0-9-]{1,40}$'),
  check (char_length(btrim(name)) between 2 and 60),
  check (name !~* 'tel:' and name !~* 'sms:')
);

create table if not exists review_invites (
  id uuid primary key default gen_random_uuid(),
  person_key text not null,
  rule text not null,
  status text not null default 'pending',
  sent boolean not null default false,
  created_at timestamptz not null default now(),
  check (status in ('pending', 'asked', 'posted')),
  check (sent = false),
  check (person_key ~ '^[a-z0-9_-]{1,40}$'),
  check (rule ~ '^[a-z0-9_]{1,40}$')
);

create table if not exists chat_assistant (
  id text primary key,
  enabled boolean not null default false,
  sends boolean not null default false,
  updated_at timestamptz not null default now(),
  check (id = 'website'),
  check (sends = false)
);

insert into chat_assistant (id, enabled) values ('website', false)
on conflict (id) do nothing;

create table if not exists family_referrals (
  id text primary key,
  referrer_key text not null,
  friend_key text not null,
  location_id text not null references locations (id),
  perk text not null,
  status text not null,
  created_on date not null,
  check (status in ('earned', 'used')),
  check (perk in ('Buddy pass', 'Class credit')),
  check (referrer_key ~ '^[a-z0-9_-]{1,40}$'),
  check (friend_key ~ '^[a-z0-9_-]{1,40}$')
);
