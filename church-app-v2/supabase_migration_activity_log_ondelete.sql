-- ============================================================
-- RPJF Membership — Migration: activity_log.user_id ON DELETE SET NULL
-- Run in Supabase → SQL Editor on your EXISTING database.
-- (Fresh projects get this via supabase_setup.sql.)
--
-- activity_log.user_id was `references auth.users(id)` with no delete action, so
-- the default (NO ACTION) BLOCKED deleting any staff account that had ever written
-- a log entry — the delete failed with 23503 activity_log_user_id_fkey.
--
-- An audit log should never stop you removing a user, and the entry should outlive
-- the account. This re-points the FK to ON DELETE SET NULL: deleting the account
-- nulls user_id on its old log rows but keeps the rows (user_name is still on each
-- one, so the history stays readable). Nothing is deleted from the log.
-- ============================================================

alter table activity_log
  drop constraint if exists activity_log_user_id_fkey;

alter table activity_log
  add constraint activity_log_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;

-- Undo (restore the blocking behaviour):
--   alter table activity_log drop constraint if exists activity_log_user_id_fkey;
--   alter table activity_log add constraint activity_log_user_id_fkey
--     foreign key (user_id) references auth.users(id);
