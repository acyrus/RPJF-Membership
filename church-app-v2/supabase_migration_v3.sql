-- ============================================================
-- Church Connect Migration v3
-- Run in Supabase Dashboard → SQL Editor
-- Adds: anniversary, skills, is_active columns
-- ============================================================

ALTER TABLE members
  ADD COLUMN IF NOT EXISTS anniversary date,
  ADD COLUMN IF NOT EXISTS skills text,
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true NOT NULL;

-- Set all existing members to active
UPDATE members SET is_active = true WHERE is_active IS NULL;
