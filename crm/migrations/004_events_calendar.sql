-- Event launch fields and class-template instructor.
-- Do not apply to Supabase project xxyndswrierztzdbjvrd or any live database.

alter table events add column if not exists brand text;
alter table events add column if not exists member_price_cents integer;
alter table events add column if not exists non_member_price_cents integer;
alter table events add column if not exists registered integer not null default 0;
alter table events add column if not exists published boolean not null default false;
alter table events add column if not exists registration_opens_on date;
alter table events add column if not exists registration_closes_on date;
alter table events add column if not exists eligibility text;
alter table events add column if not exists promo_code text;
alter table events add column if not exists banner_note text;

alter table class_templates add column if not exists instructor text;
alter table class_templates add column if not exists room text;
alter table class_templates add column if not exists rank_range text;

comment on column events.published is
  'Public booking is offered only when this is true, registration is open, and spots remain.';
comment on column events.banner_note is
  'Placeholder for a banner image. The file is not stored in this migration.';
