-- ============================================================
-- RPJF Membership — Migration: stored ushers' roster
-- Run in Supabase → SQL Editor on your EXISTING database.
--
-- The printed attendance list now lives in the app. An admin uploads a
-- roster on Import → Roster Check; it becomes the CURRENT list. Ushers get a
-- read-only "Roster" tab. Older rosters are kept as history (is_current=false)
-- so you can always see what the ushers were working from in a given month.
-- ============================================================

create table if not exists rosters (
  id          uuid primary key default gen_random_uuid(),
  label       text not null,                       -- e.g. "July 2026"
  is_current  boolean not null default true,
  name_count  int  not null default 0,
  uploaded_by uuid references auth.users(id),
  created_at  timestamptz not null default now()
);

create table if not exists roster_names (
  id         uuid primary key default gen_random_uuid(),
  roster_id  uuid not null references rosters(id) on delete cascade,
  first_name text not null default '',
  last_name  text not null default '',
  position   int  not null default 0               -- preserves the printed order
);

create index if not exists roster_names_roster_id_idx on roster_names(roster_id);

-- Partial unique index: at most ONE roster can be current at any time. The app
-- demotes the existing current roster before inserting the new one; this is the
-- backstop that guarantees the ushers never see two lists.
create unique index if not exists rosters_one_current_idx on rosters(is_current) where is_current;

alter table rosters      enable row level security;
alter table roster_names enable row level security;

-- Everyone signed in (ushers included) can READ the roster.
drop policy if exists "rosters_select" on rosters;
create policy "rosters_select" on rosters
  for select to authenticated using (true);

drop policy if exists "roster_names_select" on roster_names;
create policy "roster_names_select" on roster_names
  for select to authenticated using (true);

-- Only ADMIN can upload, relabel, or delete a roster.
drop policy if exists "rosters_insert" on rosters;
create policy "rosters_insert" on rosters
  for insert to authenticated with check (get_my_role() = 'admin');

drop policy if exists "rosters_update" on rosters;
create policy "rosters_update" on rosters
  for update to authenticated using (get_my_role() = 'admin');

drop policy if exists "rosters_delete" on rosters;
create policy "rosters_delete" on rosters
  for delete to authenticated using (get_my_role() = 'admin');

drop policy if exists "roster_names_insert" on roster_names;
create policy "roster_names_insert" on roster_names
  for insert to authenticated with check (get_my_role() = 'admin');

drop policy if exists "roster_names_delete" on roster_names;
create policy "roster_names_delete" on roster_names
  for delete to authenticated using (get_my_role() = 'admin');
