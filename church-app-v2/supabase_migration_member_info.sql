-- ============================================================
-- RPJF Membership — Migration: interaction type
-- Run in Supabase → SQL Editor on your EXISTING database.
-- (Fresh projects get this via supabase_setup.sql.)
--
-- One optional field on the member record:
--   interaction_type  — how they attend services: "In Person", "Online", or "Both"
-- Plain text (no DB constraint); the app supplies the button choices.
-- ============================================================

alter table members add column if not exists interaction_type  text;
