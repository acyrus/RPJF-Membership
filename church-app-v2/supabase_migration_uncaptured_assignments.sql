-- ============================================================
-- RPJF Membership — Migration: Uncaptured Members working data
-- Run in Supabase → SQL Editor on your EXISTING database.
-- (Fresh projects use this file directly; existing DBs are converted in place by
--  supabase_migration_rename_roster_to_uncaptured.sql.)
--
-- The Uncaptured Members tab was read-only. Ushers now track their own work against it:
--   • assign an usher (a member tagged with the Usher ministry) to each name
--   • add a note
--   • flag a name inactive so it drops out of the list they still need to chase
--
-- WHY A SEPARATE TABLE, keyed by name rather than by uncaptured_names.id:
-- an admin republishes the list every month, which deletes and recreates every
-- uncaptured_names row. If this data lived on uncaptured_names it would be wiped each time.
-- Keying on the NORMALISED name means a month of assignments and notes follows the
-- person onto the new list automatically. Trade-off: two people with the same first
-- and last name share one entry — the same limitation the name matcher already has
-- (see normName / nameKey in UncapturedMembersPage.jsx). name_key must be built the SAME
-- way on both sides: NFD-strip accents, lowercase, drop everything but a-z, join first|last.
--
-- Formerly named roster_assignments.
-- ============================================================

create table if not exists uncaptured_assignments (
  name_key          text primary key,                 -- normName(first)|normName(last)
  first_name        text not null default '',          -- kept for display / re-seeding
  last_name         text not null default '',
  assigned_usher_id uuid references members(id) on delete set null,
  note              text,
  is_inactive       boolean not null default false,
  updated_by        uuid references auth.users(id),
  updated_at        timestamptz not null default now()
);

-- Filtering "who is assigned to me" and "who's still unassigned" hits these a lot.
create index if not exists uncaptured_assignments_usher_idx    on uncaptured_assignments(assigned_usher_id);
create index if not exists uncaptured_assignments_inactive_idx on uncaptured_assignments(is_inactive);

alter table uncaptured_assignments enable row level security;

-- This is the first list table ushers may WRITE to. Reviewing the door list is
-- their job, so admin + usher can read and upsert; deleting rows is admin-only
-- (a name flagged inactive stays as history rather than vanishing).
drop policy if exists "uncaptured_assignments_select" on uncaptured_assignments;
create policy "uncaptured_assignments_select" on uncaptured_assignments
  for select to authenticated using (get_my_role() in ('admin','usher'));

drop policy if exists "uncaptured_assignments_insert" on uncaptured_assignments;
create policy "uncaptured_assignments_insert" on uncaptured_assignments
  for insert to authenticated with check (get_my_role() in ('admin','usher'));

drop policy if exists "uncaptured_assignments_update" on uncaptured_assignments;
create policy "uncaptured_assignments_update" on uncaptured_assignments
  for update to authenticated using (get_my_role() in ('admin','usher'));

drop policy if exists "uncaptured_assignments_delete" on uncaptured_assignments;
create policy "uncaptured_assignments_delete" on uncaptured_assignments
  for delete to authenticated using (get_my_role() = 'admin');

-- Undo:
--   drop table if exists uncaptured_assignments;
