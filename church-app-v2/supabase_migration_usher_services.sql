-- ============================================================
-- RPJF Membership — Migration: allow ushers/leadership to create services
-- Run in Supabase → SQL Editor on your EXISTING database.
-- (Fresh projects get this via supabase_setup.sql.)
-- Creating a service (attendance session) is widened to admin +
-- leadership + usher. Deleting a service stays ADMIN-ONLY.
-- ============================================================

DROP POLICY IF EXISTS "services_insert" ON services;
CREATE POLICY "services_insert" ON services
  FOR INSERT TO authenticated
  WITH CHECK (get_my_role() IN ('admin','leadership','usher'));
