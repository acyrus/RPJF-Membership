-- ============================================================
-- RPJF Membership — Migration: usher roster working data
-- Run in Supabase → SQL Editor on your EXISTING database.
-- (Fresh projects get this via supabase_setup.sql.)
--
-- The Roster tab was read-only. Ushers now track their own work against it:
--   • assign an usher (a member tagged with the Usher ministry) to each name
--   • add a note
--   • flag a name inactive so it drops out of the list they still need to chase
--
-- WHY A SEPARATE TABLE, keyed by name rather than by roster_names.id:
-- an admin republishes the roster every month, which deletes and recreates every
-- roster_names row. If this data lived on roster_names it would be wiped each time.
-- Keying on the NORMALISED name means a month of assignments and notes follows the
-- person onto the new list automatically. Trade-off: two people with the same first
-- and last name share one entry — the same limitation the roster matcher already has
-- (see normName / nameKey in RosterPage.jsx). name_key must be built the SAME way on
-- both sides: NFD-strip accents, lowercase, drop everything but a-z, join first|last.
-- ============================================================

create table if not exists roster_assignments (
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
create index if not exists roster_assignments_usher_idx    on roster_assignments(assigned_usher_id);
create index if not exists roster_assignments_inactive_idx on roster_assignments(is_inactive);

alter table roster_assignments enable row level security;

-- This is the first roster table ushers may WRITE to. Reviewing the door list is
-- their job, so admin + usher can read and upsert; deleting rows is admin-only
-- (a name flagged inactive stays as history rather than vanishing).
drop policy if exists "roster_assignments_select" on roster_assignments;
create policy "roster_assignments_select" on roster_assignments
  for select to authenticated using (get_my_role() in ('admin','usher'));

drop policy if exists "roster_assignments_insert" on roster_assignments;
create policy "roster_assignments_insert" on roster_assignments
  for insert to authenticated with check (get_my_role() in ('admin','usher'));

drop policy if exists "roster_assignments_update" on roster_assignments;
create policy "roster_assignments_update" on roster_assignments
  for update to authenticated using (get_my_role() in ('admin','usher'));

drop policy if exists "roster_assignments_delete" on roster_assignments;
create policy "roster_assignments_delete" on roster_assignments
  for delete to authenticated using (get_my_role() = 'admin');

-- Undo:
--   drop table if exists roster_assignments;
