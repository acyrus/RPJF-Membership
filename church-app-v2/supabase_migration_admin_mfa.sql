-- ============================================================
-- RPJF Membership — Migration: admin can clear a user's 2FA
-- Run in Supabase → SQL Editor on your EXISTING database.
-- (Fresh projects get this via supabase_setup.sql.)
--
-- Turning OFF the "Require 2FA" flag alone does NOT disable two-step for a user who
-- already enrolled an authenticator — a verified factor still challenges them at
-- login. The browser can't remove another user's factor with the anon key, so this
-- SECURITY DEFINER function does it, re-checking that the caller is an admin.
-- ============================================================

create or replace function admin_clear_mfa(target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if get_my_role() <> 'admin' then
    raise exception 'Only admins can clear two-step verification';
  end if;

  -- Challenges reference factors, so clear them first to avoid an FK error.
  delete from auth.mfa_challenges
   where factor_id in (select id from auth.mfa_factors where user_id = target);

  delete from auth.mfa_factors where user_id = target;
end;
$$;

grant execute on function admin_clear_mfa(uuid) to authenticated;

-- Undo:
--   drop function if exists admin_clear_mfa(uuid);
