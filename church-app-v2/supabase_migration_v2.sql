-- ============================================================
-- Church Connect - Migration v2
-- Run this in Supabase Dashboard → SQL Editor if you already
-- ran the original supabase_schema.sql
-- If this is a fresh setup, run supabase_schema_v2.sql instead
-- ============================================================

-- Add new columns to members table
ALTER TABLE members
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS middle_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS sex text CHECK (sex IN ('Male','Female')),
  ADD COLUMN IF NOT EXISTS address text;

-- Migrate existing 'name' data to first_name (if you had data)
UPDATE members SET first_name = name WHERE first_name IS NULL AND name IS NOT NULL;

-- Make marital_status only allow Single/Married
ALTER TABLE members DROP CONSTRAINT IF EXISTS members_marital_status_check;
ALTER TABLE members ADD CONSTRAINT members_marital_status_check
  CHECK (marital_status IN ('Single','Married'));
