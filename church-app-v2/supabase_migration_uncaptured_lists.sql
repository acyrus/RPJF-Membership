-- ============================================================
-- RPJF Membership — Migration: stored Uncaptured Members list
-- Run in Supabase → SQL Editor on your EXISTING database.
--
-- The printed attendance list now lives in the app. An admin uploads a list on
-- the Import page; it becomes the CURRENT list. Ushers get a read-only
-- "Uncaptured Members" tab. Older lists are kept as history (is_current=false)
-- so you can always see what the ushers were working from in a given month.
--
-- Formerly named rosters / roster_names. Existing databases are converted in place
-- by supabase_migration_rename_roster_to_uncaptured.sql; fresh projects use this file.
-- ============================================================

create table if not exists uncaptured_lists (
  id          uuid primary key default gen_random_uuid(),
  label       text not null,                       -- e.g. "July 2026"
  is_current  boolean not null default true,
  name_count  int  not null default 0,
  uploaded_by uuid references auth.users(id),
  created_at  timestamptz not null default now()
);

create table if not exists uncaptured_names (
  id            uuid primary key default gen_random_uuid(),
  uncaptured_id uuid not null references uncaptured_lists(id) on delete cascade,
  first_name    text not null default '',
  last_name     text not null default '',
  position      int  not null default 0               -- preserves the printed order
);

create index if not exists uncaptured_names_uncaptured_id_idx on uncaptured_names(uncaptured_id);

-- Partial unique index: at most ONE list can be current at any time. The app
-- demotes the existing current list before inserting the new one; this is the
-- backstop that guarantees the ushers never see two lists.
create unique index if not exists uncaptured_lists_one_current_idx on uncaptured_lists(is_current) where is_current;

alter table uncaptured_lists enable row level security;
alter table uncaptured_names enable row level security;

-- Everyone signed in (ushers included) can READ the list.
drop policy if exists "uncaptured_lists_select" on uncaptured_lists;
create policy "uncaptured_lists_select" on uncaptured_lists
  for select to authenticated using (true);

drop policy if exists "uncaptured_names_select" on uncaptured_names;
create policy "uncaptured_names_select" on uncaptured_names
  for select to authenticated using (true);

-- Only ADMIN can upload, relabel, or delete a list.
drop policy if exists "uncaptured_lists_insert" on uncaptured_lists;
create policy "uncaptured_lists_insert" on uncaptured_lists
  for insert to authenticated with check (get_my_role() = 'admin');

drop policy if exists "uncaptured_lists_update" on uncaptured_lists;
create policy "uncaptured_lists_update" on uncaptured_lists
  for update to authenticated using (get_my_role() = 'admin');

drop policy if exists "uncaptured_lists_delete" on uncaptured_lists;
create policy "uncaptured_lists_delete" on uncaptured_lists
  for delete to authenticated using (get_my_role() = 'admin');

drop policy if exists "uncaptured_names_insert" on uncaptured_names;
create policy "uncaptured_names_insert" on uncaptured_names
  for insert to authenticated with check (get_my_role() = 'admin');

drop policy if exists "uncaptured_names_delete" on uncaptured_names;
create policy "uncaptured_names_delete" on uncaptured_names
  for delete to authenticated using (get_my_role() = 'admin');
