-- ============================================================
-- RPJF Membership Migration v6
-- Run in Supabase Dashboard → SQL Editor
-- Adds: other_skills column, fixes last_sign_in tracking
-- ============================================================

-- 1. Add other_skills column
ALTER TABLE members ADD COLUMN IF NOT EXISTS other_skills text;

-- 2. Fix last_sign_in - simpler approach that works without trigger
-- The app will read last_sign_in_at directly from auth.users via a view
CREATE OR REPLACE VIEW user_profiles_with_login AS
SELECT 
  p.id,
  p.name,
  p.role,
  p.created_at,
  u.last_sign_in_at
FROM profiles p
JOIN auth.users u ON u.id = p.id;

-- Grant access to authenticated users
GRANT SELECT ON user_profiles_with_login TO authenticated;
