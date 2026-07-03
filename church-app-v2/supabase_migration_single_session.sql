-- ============================================================
-- RPJF Membership — Migration: single active session
-- Run in Supabase → SQL Editor on your EXISTING database.
-- (Fresh projects already get this via supabase_setup.sql.)
-- Adds an active_session marker per account + a claim function,
-- powering "one active session, last login wins".
-- ============================================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS active_session uuid;

CREATE OR REPLACE FUNCTION claim_session(p_session uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE profiles SET active_session = p_session WHERE id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION claim_session(uuid) TO authenticated;
