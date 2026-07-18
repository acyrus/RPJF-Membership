-- ============================================================
-- RPJF Membership — Migration: per-user tab access override
-- Run in Supabase → SQL Editor on your EXISTING database.
-- (Fresh projects get this via supabase_setup.sql.)
--
-- Tabs are still driven by the account's role (TAB_ACCESS in components.jsx).
-- This column is an OPTIONAL per-user override:
--   NULL  → use the role default. This is what every existing account gets,
--           so running this migration changes nobody's access.
--   text[] → exactly these tabs, ignoring the role default.
--
-- NOTE: this controls NAVIGATION only. Row-level security still gates every
-- write through get_my_role(), so granting a usher the Members tab lets them
-- SEE the page — it does not let them write anything their role can't already
-- write. Widening what a role may do is still an RLS change.
-- ============================================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS tab_access text[];

COMMENT ON COLUMN profiles.tab_access IS
  'Optional per-user tab override. NULL = inherit the role default from TAB_ACCESS in components.jsx. Navigation only; RLS still governs writes.';

-- Only admins may change someone's tabs. Everyone keeps reading their own row
-- (the existing self-select policy covers that), so the app can resolve tabs at login.
DROP POLICY IF EXISTS "admin manages tab access" ON profiles;
CREATE POLICY "admin manages tab access" ON profiles
  FOR UPDATE USING (get_my_role() = 'admin') WITH CHECK (get_my_role() = 'admin');

-- Undo:
--   ALTER TABLE profiles DROP COLUMN IF EXISTS tab_access;
--   DROP POLICY IF EXISTS "admin manages tab access" ON profiles;
