-- ============================================================
-- Church Connect - Supabase Schema
-- Run this entire file in: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- 1. MEMBERS TABLE
create table if not exists members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  email text,
  dob date,
  marital_status text check (marital_status in ('Single','Married','Widowed','Divorced')),
  join_date date default current_date,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 2. MEMBER ROLES (many-to-many stored as rows)
create table if not exists member_roles (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references members(id) on delete cascade,
  role_name text not null,
  unique(member_id, role_name)
);

-- 3. SERVICES TABLE
create table if not exists services (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  service_date date not null,
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

-- 4. ATTENDANCE TABLE
create table if not exists attendance (
  id uuid primary key default gen_random_uuid(),
  service_id uuid references services(id) on delete cascade,
  member_id uuid references members(id) on delete cascade,
  marked_by uuid references auth.users(id),
  marked_at timestamptz default now(),
  unique(service_id, member_id)
);

-- 5. USER PROFILES TABLE (extends Supabase auth.users)
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  role text not null default 'usher' check (role in ('admin','usher')),
  created_at timestamptz default now()
);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

alter table members enable row level security;
alter table member_roles enable row level security;
alter table services enable row level security;
alter table attendance enable row level security;
alter table profiles enable row level security;

-- Helper: get current user's role
create or replace function get_my_role()
returns text as $$
  select role from profiles where id = auth.uid();
$$ language sql security definer stable;

-- MEMBERS: all logged-in users can read; only admins can write
create policy "members_select" on members for select to authenticated using (true);
create policy "members_insert" on members for insert to authenticated with check (get_my_role() = 'admin');
create policy "members_update" on members for update to authenticated using (get_my_role() = 'admin');
create policy "members_delete" on members for delete to authenticated using (get_my_role() = 'admin');

-- MEMBER_ROLES: same as members
create policy "member_roles_select" on member_roles for select to authenticated using (true);
create policy "member_roles_insert" on member_roles for insert to authenticated with check (get_my_role() = 'admin');
create policy "member_roles_update" on member_roles for update to authenticated using (get_my_role() = 'admin');
create policy "member_roles_delete" on member_roles for delete to authenticated using (get_my_role() = 'admin');

-- SERVICES: all can read; only admins can create/delete
create policy "services_select" on services for select to authenticated using (true);
create policy "services_insert" on services for insert to authenticated with check (get_my_role() = 'admin');
create policy "services_delete" on services for delete to authenticated using (get_my_role() = 'admin');

-- ATTENDANCE: all logged-in users can read and write (ushers take attendance)
create policy "attendance_select" on attendance for select to authenticated using (true);
create policy "attendance_insert" on attendance for insert to authenticated with check (true);
create policy "attendance_delete" on attendance for delete to authenticated using (true);

-- PROFILES: users can read all profiles; only admins can insert/update others
create policy "profiles_select" on profiles for select to authenticated using (true);
create policy "profiles_insert" on profiles for insert to authenticated with check (get_my_role() = 'admin' or id = auth.uid());
create policy "profiles_update" on profiles for update to authenticated using (get_my_role() = 'admin' or id = auth.uid());
create policy "profiles_delete" on profiles for delete to authenticated using (get_my_role() = 'admin');

-- ============================================================
-- AUTO-UPDATE updated_at ON MEMBERS
-- ============================================================
create or replace function handle_updated_at()
returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

create trigger members_updated_at before update on members
  for each row execute function handle_updated_at();

-- ============================================================
-- DONE! Now go create your first admin user:
-- Supabase Dashboard → Authentication → Users → Add user
-- Then run this (replace the UUID and name):
--
-- insert into profiles (id, name, role)
-- values ('paste-user-uuid-here', 'Your Name', 'admin');
-- ============================================================
