-- ============================================================
-- RPJF Membership Migration v5
-- Run in Supabase Dashboard → SQL Editor
-- Adds: new roles (board, celebrations), last_sign_in to profiles
-- ============================================================

-- 1. Update profiles role constraint to allow new roles
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'usher', 'board', 'celebrations'));

-- 2. Add last_sign_in column to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_sign_in timestamptz;

-- 3. Create a function to update last_sign_in on login
CREATE OR REPLACE FUNCTION handle_user_login()
RETURNS trigger AS $$
BEGIN
  UPDATE profiles SET last_sign_in = now() WHERE id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Trigger on auth.users update (fires on login)
DROP TRIGGER IF EXISTS on_user_login ON auth.users;
CREATE TRIGGER on_user_login
  AFTER UPDATE OF last_sign_in_at ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_user_login();

-- 5. Backfill existing last_sign_in from auth.users
UPDATE profiles p
SET last_sign_in = u.last_sign_in_at
FROM auth.users u
WHERE p.id = u.id AND u.last_sign_in_at IS NOT NULL;
