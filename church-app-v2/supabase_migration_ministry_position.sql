-- ============================================================
-- RPJF Membership — Migration: leadership position within a ministry
-- Run in Supabase → SQL Editor on your EXISTING database.
-- (Fresh projects get this via supabase_setup.sql.)
--
-- A member's position of authority is stored on the member↔ministry link, not on the
-- member, because authority is always authority over a specific team. member_roles gains
-- a `position` column ("Leader" / "Co-Leader", or NULL for an ordinary member). Admin/
-- leadership set it in the Members form; it is not asked on the public intake form.
-- ============================================================

alter table member_roles add column if not exists position text;
