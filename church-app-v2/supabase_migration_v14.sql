-- ============================================================
-- RPJF Membership Migration v14
-- Run in Supabase Dashboard → SQL Editor
-- Adds a family title/role per member within a household
-- (Father, Mother, Son, Daughter, etc.), used to identify
-- families with children on the dashboard.
-- ============================================================

ALTER TABLE members ADD COLUMN IF NOT EXISTS household_role text;
