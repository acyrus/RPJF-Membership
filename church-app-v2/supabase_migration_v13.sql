-- ============================================================
-- RPJF Membership Migration v13
-- Run in Supabase Dashboard → SQL Editor
-- Adds mandatory onboarding (set password + 2FA) for new accounts.
-- ============================================================

-- 1. Flag on each account: has this person completed onboarding?
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS onboarded boolean NOT NULL DEFAULT false;

-- Existing accounts are grandfathered in as already onboarded, so current
-- users (e.g. your admin) are NOT forced through setup. Only NEW accounts
-- (default false) will be required to set a password and 2FA.
UPDATE profiles SET onboarded = true;

-- 2. Let a signed-in user mark THEIR OWN onboarding complete, without being
--    able to touch any other column (e.g. role). SECURITY DEFINER bypasses
--    RLS but only ever updates the caller's own row.
CREATE OR REPLACE FUNCTION complete_onboarding()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE profiles SET onboarded = true WHERE id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION complete_onboarding() TO authenticated;
