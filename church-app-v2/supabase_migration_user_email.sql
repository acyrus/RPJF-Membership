-- ============================================================
-- RPJF Membership — Migration: expose account email to the Users page
-- Run in Supabase → SQL Editor on your EXISTING database.
-- (Fresh projects get this via supabase_setup.sql.)
--
-- The Users page loads from user_profiles_with_login, which didn't select the email
-- — so "Reset Password" had nothing to send to and reported "no email on file" even
-- though the account has one in auth.users. Add the email column to the view.
--
-- These are staff / volunteer ACCOUNT emails (admin, usher, leadership logins), not
-- member contact details, and the view already surfaces names + roles + last login
-- to signed-in users, so this is a consistent, low-sensitivity addition.
-- ============================================================

create or replace view user_profiles_with_login as
select p.id, p.name, p.role, p.created_at, u.last_sign_in_at, u.email
from profiles p
join auth.users u on u.id = p.id;

grant select on user_profiles_with_login to authenticated;
