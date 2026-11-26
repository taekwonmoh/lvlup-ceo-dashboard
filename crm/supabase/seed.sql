-- Fixture seed for supabase db reset. Not a roster.
-- example.test addresses only. No campus survey coordinates.

insert into staff_users (email, name, firebase_role, dash_role, can_finance)
select 'owner@example.test', 'Owner Sample', 'staff', 'admin', true
where not exists (select 1 from staff_users where email = 'owner@example.test');

insert into families (display_name)
select 'Sample Household'
where not exists (select 1 from families where display_name = 'Sample Household');
