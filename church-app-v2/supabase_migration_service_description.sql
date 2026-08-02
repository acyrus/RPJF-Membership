-- ============================================================
-- RPJF Membership — Migration: optional description on a service session
-- Run in Supabase → SQL Editor on your EXISTING database.
-- (Fresh projects get this via supabase_setup.sql.)
--
-- Lets whoever creates a service session add a short note about it (e.g. guest
-- speaker, special theme, combined service). Optional, no behaviour change to
-- existing sessions — the column is simply NULL for them.
-- ============================================================

alter table services add column if not exists description text;

-- Undo:
--   alter table services drop column if exists description;
