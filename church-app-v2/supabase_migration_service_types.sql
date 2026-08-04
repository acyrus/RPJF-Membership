-- ============================================================
-- RPJF Membership — Migration: editable service types
-- Run in Supabase → SQL Editor on your EXISTING database.
-- (Fresh projects get this via supabase_setup.sql.)
--
-- Service types used to be a hardcoded list (SERVICE_NAMES). This table lets an
-- admin create and remove them from the app. Removing a type only takes it off
-- the "New Service" picker — existing services keep their name (it's plain text
-- on services.name), so history is untouched.
-- ============================================================

create table if not exists service_types (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  created_at timestamptz default now()
);

alter table service_types enable row level security;

drop policy if exists "service_types_select" on service_types;
create policy "service_types_select" on service_types for select to authenticated using (true);

drop policy if exists "service_types_insert" on service_types;
create policy "service_types_insert" on service_types for insert to authenticated with check (get_my_role() = 'admin');

drop policy if exists "service_types_update" on service_types;
create policy "service_types_update" on service_types for update to authenticated using (get_my_role() = 'admin') with check (get_my_role() = 'admin');

drop policy if exists "service_types_delete" on service_types;
create policy "service_types_delete" on service_types for delete to authenticated using (get_my_role() = 'admin');

-- Seed with the previous preset list (no-op if already present).
insert into service_types (name) values
  ('Sunday Morning Service'),
  ('Friday Night Service (General)'),
  ('Men''s Meeting'),
  ('Women''s Meeting'),
  ('Youth Meeting'),
  ('Special Service')
on conflict (name) do nothing;

-- Undo:
--   drop table if exists service_types;
