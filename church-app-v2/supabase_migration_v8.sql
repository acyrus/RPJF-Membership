-- ============================================================
-- RPJF Membership Migration v8
-- Run in Supabase Dashboard → SQL Editor
-- Adds: spouse_id column to link two members together
-- ============================================================

-- Link a member to their spouse (another member).
-- ON DELETE SET NULL: if one spouse is deleted, the other's link
-- is automatically cleared rather than blocking the delete.
ALTER TABLE members
  ADD COLUMN IF NOT EXISTS spouse_id uuid REFERENCES members(id) ON DELETE SET NULL;

-- Optional: index for faster spouse lookups
CREATE INDEX IF NOT EXISTS idx_members_spouse_id ON members(spouse_id);
