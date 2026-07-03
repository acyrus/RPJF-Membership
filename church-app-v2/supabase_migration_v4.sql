-- ============================================================
-- RPJF Membership Migration v4
-- Run in Supabase Dashboard → SQL Editor
-- Adds: skill1/skill2/skill3, activity_log table, auto-cleanup
-- ============================================================

-- 1. Add individual skill columns (replacing skills text)
ALTER TABLE members
  ADD COLUMN IF NOT EXISTS skill1 text,
  ADD COLUMN IF NOT EXISTS skill2 text,
  ADD COLUMN IF NOT EXISTS skill3 text;

-- Migrate old skills text to skill1 if it exists
UPDATE members SET skill1 = skills WHERE skill1 IS NULL AND skills IS NOT NULL AND skills != '';

-- 2. Create activity_log table
CREATE TABLE IF NOT EXISTS activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type text NOT NULL,
  description text NOT NULL,
  user_id uuid REFERENCES auth.users(id),
  user_name text,
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);

-- 3. Enable RLS on activity_log
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

-- Only admins can read the log
CREATE POLICY "log_select_admin" ON activity_log
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Anyone authenticated can insert (the app writes logs)
CREATE POLICY "log_insert" ON activity_log
  FOR INSERT TO authenticated WITH CHECK (true);

-- 4. Auto-delete logs older than 6 months
-- Run this as a scheduled job in Supabase (Database → Extensions → pg_cron)
-- Or just run manually periodically:
-- DELETE FROM activity_log WHERE created_at < now() - interval '6 months';

-- To set up automatic cleanup via pg_cron:
-- 1. Go to Supabase Dashboard → Database → Extensions
-- 2. Enable pg_cron
-- 3. Run: SELECT cron.schedule('cleanup-logs', '0 0 * * *', $$DELETE FROM activity_log WHERE created_at < now() - interval '6 months'$$);
