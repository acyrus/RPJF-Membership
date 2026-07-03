-- ============================================================
-- Church Connect (RPJF Membership) — COMPLETE DATABASE SETUP
-- Consolidates the original schema + migrations v2–v15 into ONE
-- idempotent script.
--
-- WHEN TO USE THIS FILE:
--   • Setting up a NEW / blank Supabase project (e.g. staging, or a
--     fresh production project): run this whole file once in
--     Dashboard → SQL Editor → New query. That's the entire setup.
--   • Your EXISTING production database is already up to date (you ran
--     the migrations one at a time). You do NOT need to run this there.
--
-- SAFE TO RUN TOP-TO-BOTTOM: tables/columns use IF NOT EXISTS, policies
-- are dropped-then-created, functions use CREATE OR REPLACE. On an empty
-- database the data-conversion section at the bottom simply affects 0 rows.
--
-- AFTER RUNNING: create your first admin user in
--   Dashboard → Authentication → Users → Add user
-- then run (replacing the UUID + name):
--   insert into profiles (id, name, role)
--   values ('paste-user-uuid-here', 'Your Name', 'admin');
-- ============================================================


-- ============================================================
-- 1. TABLES
-- ============================================================

create table if not exists members (
  id uuid primary key default gen_random_uuid(),
  name text,                       -- legacy; app now uses first_name/last_name
  phone text,
  email text,
  dob date,
  marital_status text,
  join_date date default current_date,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists member_roles (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references members(id) on delete cascade,
  role_name text not null,
  unique(member_id, role_name)
);

create table if not exists services (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  service_date date not null,
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

create table if not exists attendance (
  id uuid primary key default gen_random_uuid(),
  service_id uuid references services(id) on delete cascade,
  member_id uuid references members(id) on delete cascade,
  marked_by uuid references auth.users(id),
  marked_at timestamptz default now(),
  unique(service_id, member_id)
);

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  role text not null default 'usher',
  created_at timestamptz default now()
);

create table if not exists activity_log (
  id uuid primary key default gen_random_uuid(),
  action_type text not null,
  description text not null,
  user_id uuid references auth.users(id),
  user_name text,
  metadata jsonb,
  created_at timestamptz default now()
);

create table if not exists households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now()
);

create table if not exists photo_submissions (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  photo_url text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  member_id uuid references members(id) on delete set null,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz default now()
);


-- ============================================================
-- 2. COLUMNS ADDED OVER TIME (safe on pre-existing tables)
-- ============================================================

alter table members
  add column if not exists first_name text,
  add column if not exists middle_name text,
  add column if not exists last_name text,
  add column if not exists sex text,
  add column if not exists address text,
  add column if not exists anniversary date,
  add column if not exists skills text,
  add column if not exists is_active boolean default true not null,
  add column if not exists skill1 text,
  add column if not exists skill2 text,
  add column if not exists skill3 text,
  add column if not exists other_skills text,
  add column if not exists city text,
  add column if not exists spouse_id uuid references members(id) on delete set null,
  add column if not exists household_id uuid references households(id) on delete set null,
  add column if not exists photo_url text,
  add column if not exists household_role text,
  add column if not exists instruments text;

-- App writes first_name/last_name (not the legacy name), so name must be nullable.
alter table members alter column name drop not null;

alter table profiles
  add column if not exists last_sign_in timestamptz,
  add column if not exists onboarded boolean not null default false,
  add column if not exists active_session uuid,
  add column if not exists require_2fa boolean not null default true;


-- ============================================================
-- 3. CONSTRAINTS  (final state)
-- ============================================================

-- Members: sex + marital status
alter table members drop constraint if exists members_sex_check;
alter table members add constraint members_sex_check
  check (sex is null or sex in ('Male','Female'));

alter table members drop constraint if exists members_marital_status_check;
alter table members add constraint members_marital_status_check
  check (marital_status is null or marital_status in ('Single','Married'));

-- Profiles: login roles. Migrate any legacy 'board' → 'leadership' FIRST,
-- otherwise the new constraint would reject those rows.
alter table profiles drop constraint if exists profiles_role_check;
update profiles set role = 'leadership' where role = 'board';
alter table profiles add constraint profiles_role_check
  check (role in ('admin','usher','leadership','celebrations'));


-- ============================================================
-- 4. INDEXES
-- ============================================================
create index if not exists idx_members_spouse_id on members(spouse_id);
create index if not exists idx_members_household_id on members(household_id);


-- ============================================================
-- 5. ENABLE ROW LEVEL SECURITY
-- ============================================================
alter table members           enable row level security;
alter table member_roles      enable row level security;
alter table services          enable row level security;
alter table attendance        enable row level security;
alter table profiles          enable row level security;
alter table activity_log      enable row level security;
alter table households        enable row level security;
alter table photo_submissions enable row level security;


-- ============================================================
-- 6. FUNCTIONS & VIEW
-- ============================================================

create or replace function get_my_role()
returns text as $$
  select role from profiles where id = auth.uid();
$$ language sql security definer stable;

create or replace function handle_updated_at()
returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

create or replace function handle_user_login()
returns trigger as $$
begin
  update profiles set last_sign_in = now() where id = new.id;
  return new;
end;
$$ language plpgsql security definer;

-- Non-admins (leadership/usher) may assign a member's household ONLY —
-- never any other member column — via this locked-down function.
create or replace function set_member_household(p_member_id uuid, p_household_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if get_my_role() not in ('admin','leadership','usher') then
    raise exception 'Not authorized to assign households';
  end if;
  update members set household_id = p_household_id where id = p_member_id;
end;
$$;

-- Lets a signed-in user mark THEIR OWN onboarding complete (no other column).
create or replace function complete_onboarding()
returns void language plpgsql security definer set search_path = public as $$
begin
  update profiles set onboarded = true where id = auth.uid();
end;
$$;

-- Claims this device as the single active session for the calling account.
create or replace function claim_session(p_session uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update profiles set active_session = p_session where id = auth.uid();
end;
$$;

-- View exposing last_sign_in_at alongside profile (used by the Users screen).
create or replace view user_profiles_with_login as
select p.id, p.name, p.role, p.created_at, u.last_sign_in_at
from profiles p
join auth.users u on u.id = p.id;


-- ============================================================
-- 7. TRIGGERS
-- ============================================================
drop trigger if exists members_updated_at on members;
create trigger members_updated_at before update on members
  for each row execute function handle_updated_at();

-- Trigger lives on auth.users; wrapped so a locked-down project won't abort
-- the whole script (last_sign_in also works through the view above).
do $$
begin
  drop trigger if exists on_user_login on auth.users;
  create trigger on_user_login
    after update of last_sign_in_at on auth.users
    for each row execute function handle_user_login();
exception when others then
  raise notice 'Skipped on_user_login trigger on auth.users (%).', sqlerrm;
end $$;


-- ============================================================
-- 8. STORAGE BUCKETS + POLICIES
-- (buckets created here; both public so photos display in the app)
-- ============================================================
insert into storage.buckets (id, name, public) values
  ('member-photos','member-photos', true),
  ('photo-submissions','photo-submissions', true)
on conflict (id) do nothing;


-- ============================================================
-- 9. POLICIES  (dropped-then-created so this file is re-runnable)
-- ============================================================

-- MEMBERS: everyone signed in reads; only admins write
drop policy if exists "members_select" on members;
create policy "members_select" on members for select to authenticated using (true);
drop policy if exists "members_insert" on members;
create policy "members_insert" on members for insert to authenticated with check (get_my_role() = 'admin');
drop policy if exists "members_update" on members;
create policy "members_update" on members for update to authenticated using (get_my_role() = 'admin');
drop policy if exists "members_delete" on members;
create policy "members_delete" on members for delete to authenticated using (get_my_role() = 'admin');

-- MEMBER_ROLES: same as members
drop policy if exists "member_roles_select" on member_roles;
create policy "member_roles_select" on member_roles for select to authenticated using (true);
drop policy if exists "member_roles_insert" on member_roles;
create policy "member_roles_insert" on member_roles for insert to authenticated with check (get_my_role() = 'admin');
drop policy if exists "member_roles_update" on member_roles;
create policy "member_roles_update" on member_roles for update to authenticated using (get_my_role() = 'admin');
drop policy if exists "member_roles_delete" on member_roles;
create policy "member_roles_delete" on member_roles for delete to authenticated using (get_my_role() = 'admin');

-- SERVICES: all read; admins create/delete
drop policy if exists "services_select" on services;
create policy "services_select" on services for select to authenticated using (true);
drop policy if exists "services_insert" on services;
create policy "services_insert" on services for insert to authenticated with check (get_my_role() in ('admin','leadership','usher'));
drop policy if exists "services_delete" on services;
create policy "services_delete" on services for delete to authenticated using (get_my_role() = 'admin');

-- ATTENDANCE: all signed-in read + write (ushers take attendance)
drop policy if exists "attendance_select" on attendance;
create policy "attendance_select" on attendance for select to authenticated using (true);
drop policy if exists "attendance_insert" on attendance;
create policy "attendance_insert" on attendance for insert to authenticated with check (true);
drop policy if exists "attendance_delete" on attendance;
create policy "attendance_delete" on attendance for delete to authenticated using (true);

-- PROFILES: all read; admins or self write
drop policy if exists "profiles_select" on profiles;
create policy "profiles_select" on profiles for select to authenticated using (true);
drop policy if exists "profiles_insert" on profiles;
create policy "profiles_insert" on profiles for insert to authenticated with check (get_my_role() = 'admin' or id = auth.uid());
drop policy if exists "profiles_update" on profiles;
create policy "profiles_update" on profiles for update to authenticated using (get_my_role() = 'admin' or id = auth.uid());
drop policy if exists "profiles_delete" on profiles;
create policy "profiles_delete" on profiles for delete to authenticated using (get_my_role() = 'admin');

-- ACTIVITY LOG: admins read; anyone signed in inserts
drop policy if exists "log_select_admin" on activity_log;
create policy "log_select_admin" on activity_log for select to authenticated
  using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));
drop policy if exists "log_insert" on activity_log;
create policy "log_insert" on activity_log for insert to authenticated with check (true);

-- HOUSEHOLDS: all read; admin/leadership/usher create+rename; admin deletes
drop policy if exists "households_select" on households;
create policy "households_select" on households for select to authenticated using (true);
drop policy if exists "households_insert" on households;
create policy "households_insert" on households for insert to authenticated
  with check (get_my_role() in ('admin','leadership','usher'));
drop policy if exists "households_update" on households;
create policy "households_update" on households for update to authenticated
  using (get_my_role() in ('admin','leadership','usher'));
drop policy if exists "households_delete" on households;
create policy "households_delete" on households for delete to authenticated
  using (get_my_role() = 'admin');

-- PHOTO SUBMISSIONS: public may submit pending rows; admins review
drop policy if exists "photo_submissions_insert_public" on photo_submissions;
create policy "photo_submissions_insert_public" on photo_submissions
  for insert to anon, authenticated with check (status = 'pending');
drop policy if exists "photo_submissions_select_admin" on photo_submissions;
create policy "photo_submissions_select_admin" on photo_submissions
  for select to authenticated using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));
drop policy if exists "photo_submissions_update_admin" on photo_submissions;
create policy "photo_submissions_update_admin" on photo_submissions
  for update to authenticated using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));
drop policy if exists "photo_submissions_delete_admin" on photo_submissions;
create policy "photo_submissions_delete_admin" on photo_submissions
  for delete to authenticated using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

-- STORAGE: member-photos (auth writes, public reads)
drop policy if exists "member_photos_public_read" on storage.objects;
create policy "member_photos_public_read" on storage.objects
  for select using (bucket_id = 'member-photos');
drop policy if exists "member_photos_auth_insert" on storage.objects;
create policy "member_photos_auth_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'member-photos');
drop policy if exists "member_photos_auth_update" on storage.objects;
create policy "member_photos_auth_update" on storage.objects
  for update to authenticated using (bucket_id = 'member-photos');
drop policy if exists "member_photos_auth_delete" on storage.objects;
create policy "member_photos_auth_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'member-photos');

-- STORAGE: photo-submissions (anyone uploads a submission; admins delete)
drop policy if exists "photo_submissions_storage_read" on storage.objects;
create policy "photo_submissions_storage_read" on storage.objects
  for select using (bucket_id = 'photo-submissions');
drop policy if exists "photo_submissions_storage_insert" on storage.objects;
create policy "photo_submissions_storage_insert" on storage.objects
  for insert to anon, authenticated with check (bucket_id = 'photo-submissions');
drop policy if exists "photo_submissions_storage_delete" on storage.objects;
create policy "photo_submissions_storage_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'photo-submissions' and exists (select 1 from profiles where id = auth.uid() and role = 'admin'));


-- ============================================================
-- 10. GRANTS
-- ============================================================
grant execute on function set_member_household(uuid, uuid) to authenticated;
grant execute on function complete_onboarding() to authenticated;
grant execute on function claim_session(uuid) to authenticated;
grant select on user_profiles_with_login to authenticated;


-- ============================================================
-- 11. ONE-TIME DATA CONVERSIONS
-- (Harmless on a fresh database — they touch 0 rows. On an existing
--  database with data they should be run ONCE; re-running is not
--  recommended, as noted per step.)
-- ============================================================

-- (v13) Grandfather all CURRENT accounts as onboarded, so existing users
-- aren't forced through password/2FA setup. New accounts default to false.
-- Do NOT re-run on a live database (it would clear pending onboarding).
update profiles set onboarded = true;

-- (v3) Any legacy members with no is_active become active.
update members set is_active = true where is_active is null;

-- (v15) Move any historical "Music (X)" values from the skill columns into
-- the dedicated instruments column, then clear them from skills.
-- Do NOT re-run on a live database once musicians have intentional music skills.
update members
set instruments = nullif(trim(both ', ' from concat_ws(', ',
  case when skill1 like 'Music (%)' then regexp_replace(skill1, '^Music \((.*)\)$', '\1') end,
  case when skill2 like 'Music (%)' then regexp_replace(skill2, '^Music \((.*)\)$', '\1') end,
  case when skill3 like 'Music (%)' then regexp_replace(skill3, '^Music \((.*)\)$', '\1') end
)), '')
where skill1 like 'Music (%)' or skill2 like 'Music (%)' or skill3 like 'Music (%)';

update members set skill1 = null where skill1 like 'Music (%)';
update members set skill2 = null where skill2 like 'Music (%)';
update members set skill3 = null where skill3 like 'Music (%)';

update members set instruments = replace(instruments, 'Keyboard / Piano', 'Keyboard/Piano')
where instruments like '%Keyboard / Piano%';

-- ============================================================
-- DONE.
-- ============================================================
