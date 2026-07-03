-- ============================================================
-- RPJF Membership Migration v9
-- Run in Supabase Dashboard → SQL Editor
-- Adds: households table, members.household_id, members.photo_url
-- ============================================================

-- 1. HOUSEHOLDS TABLE — group an entire family under one named household
CREATE TABLE IF NOT EXISTS households (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE households ENABLE ROW LEVEL SECURITY;

-- All logged-in users can read; only admins can create/edit/delete
CREATE POLICY "households_select" ON households FOR SELECT TO authenticated USING (true);
CREATE POLICY "households_insert" ON households FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "households_update" ON households FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "households_delete" ON households FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- 2. Link each member to a household (nullable). If a household is deleted,
--    members are simply unlinked rather than blocking the delete.
ALTER TABLE members
  ADD COLUMN IF NOT EXISTS household_id uuid REFERENCES households(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_members_household_id ON members(household_id);

-- 3. Member photo. Stores the public URL of an image kept in Supabase Storage
--    (see "member-photos" bucket setup in the deployment notes).
ALTER TABLE members ADD COLUMN IF NOT EXISTS photo_url text;

-- ============================================================
-- STORAGE BUCKET FOR MEMBER PHOTOS
-- ------------------------------------------------------------
-- Easiest way: Dashboard → Storage → New bucket
--   • Name:   member-photos
--   • Public: ON   (so photos can be shown in the app)
--
-- Then allow logged-in users to upload/replace photos by running the
-- policies below (Storage objects live in the storage.objects table).
-- ============================================================

-- Allow public read of files in the member-photos bucket
CREATE POLICY "member_photos_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'member-photos');

-- Allow any authenticated user to upload to the member-photos bucket
CREATE POLICY "member_photos_auth_insert" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'member-photos');

-- Allow authenticated users to overwrite/replace photos
CREATE POLICY "member_photos_auth_update" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'member-photos');

-- Allow authenticated users to delete photos
CREATE POLICY "member_photos_auth_delete" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'member-photos');
