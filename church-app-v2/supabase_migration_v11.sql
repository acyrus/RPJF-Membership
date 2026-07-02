-- ============================================================
-- RPJF Membership Migration v11
-- Run in Supabase Dashboard → SQL Editor
-- Adds: public member photo submission queue
--   • photo_submissions table (pending → admin approves/rejects)
--   • a separate storage bucket the PUBLIC can upload to
-- Members submit from a public /submit page with no login. Nothing
-- reaches a real member record until an admin approves it.
-- ============================================================

-- 1. PENDING SUBMISSIONS QUEUE
CREATE TABLE IF NOT EXISTS photo_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name text NOT NULL,
  last_name text NOT NULL,
  photo_url text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  member_id uuid REFERENCES members(id) ON DELETE SET NULL,
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE photo_submissions ENABLE ROW LEVEL SECURITY;

-- Anyone (even not logged in) may SUBMIT, but only as a 'pending' row.
-- They cannot read, edit, or delete anything — so the member list and
-- other submissions stay private.
CREATE POLICY "photo_submissions_insert_public" ON photo_submissions
  FOR INSERT TO anon, authenticated
  WITH CHECK (status = 'pending');

-- Only admins can review the queue.
CREATE POLICY "photo_submissions_select_admin" ON photo_submissions
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "photo_submissions_update_admin" ON photo_submissions
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "photo_submissions_delete_admin" ON photo_submissions
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ============================================================
-- PUBLIC SUBMISSION STORAGE BUCKET
-- ------------------------------------------------------------
-- Dashboard → Storage → New bucket
--   • Name:   photo-submissions
--   • Public: ON
--
-- This is SEPARATE from member-photos so the public can only write to
-- the submission queue, never to live member photos.
-- ============================================================

-- Public read (so admins can preview submitted photos)
CREATE POLICY "photo_submissions_storage_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'photo-submissions');

-- Allow anyone (logged in or not) to upload a submission photo
CREATE POLICY "photo_submissions_storage_insert" ON storage.objects
  FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'photo-submissions');

-- Admins can delete submission photos (cleanup of rejected ones)
CREATE POLICY "photo_submissions_storage_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'photo-submissions'
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
