-- ============================================================
-- RPJF Membership — Migration: rename roster_* → uncaptured_*
-- Run in Supabase → SQL Editor on your EXISTING database (staging first, then production).
--
-- WHY: the tables named rosters / roster_names / roster_assignments never held
-- duty rosters — they hold the "Uncaptured Members" list (the printed attendance
-- list plus each name's capture/assignment working data). Renaming them frees the
-- roster* name space for a FUTURE, genuine Rosters feature (who is serving when),
-- and makes the schema match the "Uncaptured Members" tab the app already shows.
--
-- SAFETY:
--   • This is a pure RENAME. No rows are copied, dropped, or recreated — all data,
--     foreign keys, and row-level-security stay intact and simply follow the tables.
--   • Wrapped in a single transaction: it all applies or nothing does.
--   • Deploy the matching app code AT THE SAME TIME. The app queries these tables by
--     name, so the running app must switch to uncaptured_* together with this rename,
--     or the Uncaptured Members tab and list-publishing break in the gap. Ideally run
--     when no ushers are mid-edit (uncaptured_assignments is the one they write to).
--
-- FRESH PROJECTS do NOT need this file — the updated migration files
-- (supabase_migration_uncaptured_lists.sql / _uncaptured_assignments.sql) already
-- create the tables with the new names.
--
-- Undo: rename each object back (swap the two names in every statement below).
-- ============================================================

begin;

-- 1. Tables (RLS, foreign keys and the one-current rule follow automatically).
alter table if exists rosters            rename to uncaptured_lists;
alter table if exists roster_names        rename to uncaptured_names;
alter table if exists roster_assignments  rename to uncaptured_assignments;

-- 2. The foreign-key column on the names table.
alter table if exists uncaptured_names rename column roster_id to uncaptured_id;

-- 3. Free the schema-global index names (these WOULD collide with a future rosters
--    table's auto-named indexes). Renaming a primary-key's backing index is safe.
alter index if exists rosters_pkey                    rename to uncaptured_lists_pkey;
alter index if exists roster_names_pkey               rename to uncaptured_names_pkey;
alter index if exists roster_assignments_pkey         rename to uncaptured_assignments_pkey;
alter index if exists rosters_one_current_idx         rename to uncaptured_lists_one_current_idx;
alter index if exists roster_names_roster_id_idx      rename to uncaptured_names_uncaptured_id_idx;
alter index if exists roster_assignments_usher_idx    rename to uncaptured_assignments_usher_idx;
alter index if exists roster_assignments_inactive_idx rename to uncaptured_assignments_inactive_idx;

-- 4. Re-point the RLS policies to the new names (drop old, recreate identical logic)
--    so a migrated database matches a freshly-created one exactly. RLS stays enabled
--    throughout — the policies below reproduce the original access rules verbatim.
drop policy if exists "rosters_select" on uncaptured_lists;
drop policy if exists "rosters_insert" on uncaptured_lists;
drop policy if exists "rosters_update" on uncaptured_lists;
drop policy if exists "rosters_delete" on uncaptured_lists;
create policy "uncaptured_lists_select" on uncaptured_lists
  for select to authenticated using (true);
create policy "uncaptured_lists_insert" on uncaptured_lists
  for insert to authenticated with check (get_my_role() = 'admin');
create policy "uncaptured_lists_update" on uncaptured_lists
  for update to authenticated using (get_my_role() = 'admin');
create policy "uncaptured_lists_delete" on uncaptured_lists
  for delete to authenticated using (get_my_role() = 'admin');

drop policy if exists "roster_names_select" on uncaptured_names;
drop policy if exists "roster_names_insert" on uncaptured_names;
drop policy if exists "roster_names_delete" on uncaptured_names;
create policy "uncaptured_names_select" on uncaptured_names
  for select to authenticated using (true);
create policy "uncaptured_names_insert" on uncaptured_names
  for insert to authenticated with check (get_my_role() = 'admin');
create policy "uncaptured_names_delete" on uncaptured_names
  for delete to authenticated using (get_my_role() = 'admin');

drop policy if exists "roster_assignments_select" on uncaptured_assignments;
drop policy if exists "roster_assignments_insert" on uncaptured_assignments;
drop policy if exists "roster_assignments_update" on uncaptured_assignments;
drop policy if exists "roster_assignments_delete" on uncaptured_assignments;
create policy "uncaptured_assignments_select" on uncaptured_assignments
  for select to authenticated using (get_my_role() in ('admin','usher'));
create policy "uncaptured_assignments_insert" on uncaptured_assignments
  for insert to authenticated with check (get_my_role() in ('admin','usher'));
create policy "uncaptured_assignments_update" on uncaptured_assignments
  for update to authenticated using (get_my_role() in ('admin','usher'));
create policy "uncaptured_assignments_delete" on uncaptured_assignments
  for delete to authenticated using (get_my_role() = 'admin');

commit;

-- Note: foreign-key CONSTRAINT names (e.g. roster_names_roster_id_fkey) are left as-is.
-- They are scoped per-table, never collide with a future rosters table, and renaming
-- them changes nothing about behaviour — a purely cosmetic difference from a fresh DB.
