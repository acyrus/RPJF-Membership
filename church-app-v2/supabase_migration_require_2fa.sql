-- ============================================================
-- RPJF Membership — Migration: per-account 2FA requirement
-- Run in Supabase → SQL Editor on your EXISTING database.
-- (Fresh projects get this via supabase_setup.sql.)
-- Adds a per-account flag controlling whether 2FA enrollment is
-- forced at login. Defaults to true, so every existing account
-- keeps mandatory 2FA until an admin exempts them.
-- ============================================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS require_2fa boolean NOT NULL DEFAULT true;
