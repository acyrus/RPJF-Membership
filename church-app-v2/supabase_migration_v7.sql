-- ============================================================
-- RPJF Membership Migration v7
-- Run in Supabase Dashboard → SQL Editor
-- Adds: city column to members table
-- ============================================================

ALTER TABLE members ADD COLUMN IF NOT EXISTS city text;
