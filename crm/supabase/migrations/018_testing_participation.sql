-- Pre-test sign-up pace and post-cycle participation. Migration 018.
-- Do not apply this file to a live database.
-- Counts are sandbox planning figures. Belt testing is included with tuition.
-- No prices. No phone numbers.

create table if not exists testing_cycles (
  id text primary key,
  name text not null,
  test_on date not null,
  status text not null,
  check (id ~ '^[0-9]{4}-c[0-9]$'),
  check (status in ('upcoming', 'complete')),
  check (char_length(btrim(name)) between 2 and 40)
);

create table if not exists testing_signups (
  cycle_id text not null references testing_cycles (id),
  location_id text not null references locations (id),
  week_key text not null,
  active_students integer not null,
  signed_up integer not null,
  primary key (cycle_id, location_id, week_key),
  check (week_key in ('w4', 'w3', 'w2', 'w1', 'test')),
  check (active_students >= 0),
  check (signed_up >= 0),
  check (signed_up <= active_students)
);

create table if not exists testing_results (
  cycle_id text not null references testing_cycles (id),
  location_id text not null references locations (id),
  active_students integer not null,
  tested integer not null,
  primary key (cycle_id, location_id),
  check (active_students >= 0),
  check (tested >= 0),
  check (tested <= active_students)
);

insert into testing_cycles (id, name, test_on, status) values
  ('2026-c6', 'Cycle 6', '2026-12-14', 'upcoming'),
  ('2026-c5', 'Cycle 5', '2026-10-19', 'complete'),
  ('2026-c4', 'Cycle 4', '2026-08-17', 'complete'),
  ('2026-c3', 'Cycle 3', '2026-06-15', 'complete')
on conflict (id) do nothing;

insert into testing_signups (cycle_id, location_id, week_key, active_students, signed_up) values
  ('2026-c6', 'waunakee', 'w4', 140, 28),
  ('2026-c6', 'waunakee', 'w3', 140, 42),
  ('2026-c6', 'waunakee', 'w2', 140, 63),
  ('2026-c6', 'waunakee', 'w1', 140, 84),
  ('2026-c6', 'waunakee', 'test', 140, 98),
  ('2026-c6', 'verona', 'w4', 110, 18),
  ('2026-c6', 'verona', 'w3', 110, 30),
  ('2026-c6', 'verona', 'w2', 110, 48),
  ('2026-c6', 'verona', 'w1', 110, 66),
  ('2026-c6', 'verona', 'test', 110, 77),
  ('2026-c6', 'eastmad', 'w4', 90, 12),
  ('2026-c6', 'eastmad', 'w3', 90, 22),
  ('2026-c6', 'eastmad', 'w2', 90, 36),
  ('2026-c6', 'eastmad', 'w1', 90, 49),
  ('2026-c6', 'eastmad', 'test', 90, 58),
  ('2026-c6', 'deforest', 'w4', 70, 8),
  ('2026-c6', 'deforest', 'w3', 70, 14),
  ('2026-c6', 'deforest', 'w2', 70, 21),
  ('2026-c6', 'deforest', 'w1', 70, 28),
  ('2026-c6', 'deforest', 'test', 70, 35),
  ('2026-c6', 'goninjaW', 'w4', 48, 14),
  ('2026-c6', 'goninjaW', 'w3', 48, 18),
  ('2026-c6', 'goninjaW', 'w2', 48, 24),
  ('2026-c6', 'goninjaW', 'w1', 48, 29),
  ('2026-c6', 'goninjaW', 'test', 48, 34),
  ('2026-c6', 'goninjaV', 'w4', 36, 6),
  ('2026-c6', 'goninjaV', 'w3', 36, 10),
  ('2026-c6', 'goninjaV', 'w2', 36, 14),
  ('2026-c6', 'goninjaV', 'w1', 36, 18),
  ('2026-c6', 'goninjaV', 'test', 36, 22)
on conflict (cycle_id, location_id, week_key) do nothing;

insert into testing_results (cycle_id, location_id, active_students, tested) values
  ('2026-c5', 'waunakee', 140, 91),
  ('2026-c5', 'verona', 110, 70),
  ('2026-c5', 'eastmad', 90, 52),
  ('2026-c5', 'deforest', 70, 31),
  ('2026-c5', 'goninjaW', 48, 30),
  ('2026-c5', 'goninjaV', 36, 19),
  ('2026-c4', 'waunakee', 140, 84),
  ('2026-c4', 'verona', 110, 64),
  ('2026-c4', 'eastmad', 90, 48),
  ('2026-c4', 'deforest', 70, 28),
  ('2026-c4', 'goninjaW', 48, 26),
  ('2026-c4', 'goninjaV', 36, 16),
  ('2026-c3', 'waunakee', 140, 78),
  ('2026-c3', 'verona', 110, 60),
  ('2026-c3', 'eastmad', 90, 44),
  ('2026-c3', 'deforest', 70, 25),
  ('2026-c3', 'goninjaW', 48, 22),
  ('2026-c3', 'goninjaV', 36, 14)
on conflict (cycle_id, location_id) do nothing;
