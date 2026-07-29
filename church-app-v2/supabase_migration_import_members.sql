-- ============================================================
-- RPJF Membership — Migration: atomic member import
-- Run in Supabase → SQL Editor on your EXISTING database.
-- (Fresh projects get this via supabase_setup.sql.)
--
-- The import used to run one SELECT + insert/update + role delete/insert PER ROW —
-- hundreds of sequential round-trips, and if it failed partway you were left with a
-- half-finished import and no rollback. This does the whole commit in ONE function
-- call, inside a single transaction: all rows succeed or none do.
--
-- The client sends already-normalised rows (dates as ISO yyyy-mm-dd, phone
-- canonicalised, skills de-duplicated, roles validated). Matching is first + last +
-- middle, case-insensitive, blank matches blank — same rule the per-row loop used.
-- p_replace = false skips rows that already exist; true overwrites them.
-- ============================================================

create or replace function import_members(p_rows jsonb, p_replace boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  rec       jsonb;
  v_existing uuid;
  v_id      uuid;
  v_added   int := 0;
  v_updated int := 0;
  v_skipped int := 0;
  v_results jsonb := '[]'::jsonb;
  v_role    text;
begin
  if get_my_role() <> 'admin' then
    raise exception 'Only admins can import members';
  end if;

  for rec in select value from jsonb_array_elements(p_rows) as t(value)
  loop
    -- Match existing member: first + last + middle, case-insensitive, blank = blank.
    select id into v_existing
      from members m
     where lower(trim(m.first_name)) = lower(trim(rec->>'first_name'))
       and lower(trim(m.last_name))  = lower(trim(rec->>'last_name'))
       and coalesce(lower(trim(m.middle_name)), '') = coalesce(lower(trim(rec->>'middle_name')), '')
     limit 1;

    if v_existing is not null and not p_replace then
      v_skipped := v_skipped + 1;
      v_results := v_results || jsonb_build_object(
        'row', rec->>'row', 'name', rec->>'name',
        'outcome', 'skipped', 'reason', 'already in database (Replace mode off)');
      continue;
    end if;

    if v_existing is not null then
      update members set
        first_name     = rec->>'first_name',
        last_name      = rec->>'last_name',
        middle_name    = nullif(rec->>'middle_name', ''),
        email          = nullif(rec->>'email', ''),
        phone          = nullif(rec->>'phone', ''),
        dob            = (nullif(rec->>'dob', ''))::date,
        sex            = nullif(rec->>'sex', ''),
        marital_status = nullif(rec->>'marital_status', ''),
        address        = nullif(rec->>'address', ''),
        join_date      = (nullif(rec->>'join_date', ''))::date,
        anniversary    = (nullif(rec->>'anniversary', ''))::date,
        skill1         = nullif(rec->>'skill1', ''),
        skill2         = nullif(rec->>'skill2', ''),
        skill3         = nullif(rec->>'skill3', ''),
        other_skills   = nullif(rec->>'other_skills', ''),
        instruments    = nullif(rec->>'instruments', ''),
        city           = nullif(rec->>'city', ''),
        notes          = nullif(rec->>'notes', ''),
        is_active      = true
       where id = v_existing;
      v_id := v_existing;
      delete from member_roles where member_id = v_id;
      v_updated := v_updated + 1;
      v_results := v_results || jsonb_build_object(
        'row', rec->>'row', 'name', rec->>'name',
        'outcome', 'updated', 'reason', 'matched existing record — replaced');
    else
      insert into members (
        first_name, last_name, middle_name, email, phone, dob, sex, marital_status,
        address, join_date, anniversary, skill1, skill2, skill3, other_skills,
        instruments, city, notes, is_active)
      values (
        rec->>'first_name', rec->>'last_name', nullif(rec->>'middle_name', ''),
        nullif(rec->>'email', ''), nullif(rec->>'phone', ''), (nullif(rec->>'dob', ''))::date,
        nullif(rec->>'sex', ''), nullif(rec->>'marital_status', ''), nullif(rec->>'address', ''),
        (nullif(rec->>'join_date', ''))::date, (nullif(rec->>'anniversary', ''))::date,
        nullif(rec->>'skill1', ''), nullif(rec->>'skill2', ''), nullif(rec->>'skill3', ''),
        nullif(rec->>'other_skills', ''), nullif(rec->>'instruments', ''),
        nullif(rec->>'city', ''), nullif(rec->>'notes', ''), true)
      returning id into v_id;
      v_added := v_added + 1;
      v_results := v_results || jsonb_build_object(
        'row', rec->>'row', 'name', rec->>'name', 'outcome', 'added', 'reason', '');
    end if;

    -- Roles arrive as a JSON array of validated, de-duplicated names.
    if jsonb_typeof(rec->'roles') = 'array' then
      for v_role in select jsonb_array_elements_text(rec->'roles')
      loop
        insert into member_roles (member_id, role_name) values (v_id, v_role);
      end loop;
    end if;
  end loop;

  return jsonb_build_object(
    'added', v_added, 'updated', v_updated, 'skipped', v_skipped, 'results', v_results);
end;
$$;

grant execute on function import_members(jsonb, boolean) to authenticated;

-- Undo:
--   drop function if exists import_members(jsonb, boolean);
