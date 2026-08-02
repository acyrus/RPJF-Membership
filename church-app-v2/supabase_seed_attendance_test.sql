-- ============================================================
-- RPJF Membership — TEST attendance seed (STAGING ONLY)
-- ============================================================
-- ⚠️  RUN THIS IN YOUR STAGING SUPABASE PROJECT ONLY, NEVER PRODUCTION.
--     It inserts ~90 service sessions and a few thousand attendance rows.
--
-- What it does: generates ~6 months of realistic sessions and attendance
-- for whatever members already exist in this database:
--   • Sunday Morning Service ...... every Sunday        (everyone)
--   • Friday Night Service ........ every Friday         (everyone)
--   • Youth Meeting ............... every Saturday        (ages ≤ 30)
--   • Men's Meeting ............... 1st Saturday / month  (males)
--   • Women's Meeting ............. 1st Saturday / month  (females)
--   • Special Service ............. 2 one-off dates        (everyone)
--
-- Attendance is not uniform: each member gets a stable "regularity" from a hash
-- of their id, so some are near-perfect attenders and some are sporadic, and each
-- service type has its own base turnout. Every seeded session is tagged in its
-- description so you can remove it all again (cleanup at the bottom).
--
-- PREREQUISITE: the members must already be in THIS database (import the roster
-- CSV via the app's Import Members first if they aren't).
-- ============================================================

-- Needs the description column (safe if already run).
alter table services add column if not exists description text;

do $$
declare
  d       date;
  sid     uuid;
  m       record;
  factor  numeric;
  p       numeric;
  start6  date := (current_date - interval '6 months')::date;
  tag     text := 'Seeded test data (safe to delete)';
begin
  -- Per-member regularity in [0.4, 1.6], stable per member id (hash → int).
  -- p = base_rate * factor, capped. present when random() < p.

  -- 1) Sunday Morning Service — every Sunday, everyone
  for d in select gs::date from generate_series(start6, current_date, interval '1 day') gs
           where extract(dow from gs) = 0 loop
    insert into services (name, service_date, description) values ('Sunday Morning Service', d, tag) returning id into sid;
    for m in select id from members where is_active is not false loop
      factor := 0.4 + (abs(('x' || substr(md5(m.id::text),1,8))::bit(32)::int) % 1000) / 1000.0 * 1.2;
      p := least(0.98, 0.72 * factor);
      if random() < p then insert into attendance (service_id, member_id) values (sid, m.id) on conflict do nothing; end if;
    end loop;
  end loop;

  -- 2) Friday Night Service (General) — every Friday, everyone
  for d in select gs::date from generate_series(start6, current_date, interval '1 day') gs
           where extract(dow from gs) = 5 loop
    insert into services (name, service_date, description) values ('Friday Night Service (General)', d, tag) returning id into sid;
    for m in select id from members where is_active is not false loop
      factor := 0.4 + (abs(('x' || substr(md5(m.id::text),1,8))::bit(32)::int) % 1000) / 1000.0 * 1.2;
      p := least(0.95, 0.50 * factor);
      if random() < p then insert into attendance (service_id, member_id) values (sid, m.id) on conflict do nothing; end if;
    end loop;
  end loop;

  -- 3) Youth Meeting — every Saturday, ages ≤ 30
  for d in select gs::date from generate_series(start6, current_date, interval '1 day') gs
           where extract(dow from gs) = 6 loop
    insert into services (name, service_date, description) values ('Youth Meeting', d, tag) returning id into sid;
    for m in select id from members where is_active is not false and dob is not null and dob > (current_date - interval '31 years') loop
      factor := 0.4 + (abs(('x' || substr(md5(m.id::text),1,8))::bit(32)::int) % 1000) / 1000.0 * 1.2;
      p := least(0.95, 0.55 * factor);
      if random() < p then insert into attendance (service_id, member_id) values (sid, m.id) on conflict do nothing; end if;
    end loop;
  end loop;

  -- 4) Men's Meeting — first Saturday of each month, males
  for d in select gs::date from generate_series(start6, current_date, interval '1 day') gs
           where extract(dow from gs) = 6 and extract(day from gs) <= 7 loop
    insert into services (name, service_date, description) values ('Men''s Meeting', d, tag) returning id into sid;
    for m in select id from members where is_active is not false and sex = 'Male' loop
      factor := 0.4 + (abs(('x' || substr(md5(m.id::text),1,8))::bit(32)::int) % 1000) / 1000.0 * 1.2;
      p := least(0.95, 0.60 * factor);
      if random() < p then insert into attendance (service_id, member_id) values (sid, m.id) on conflict do nothing; end if;
    end loop;
  end loop;

  -- 5) Women's Meeting — first Saturday of each month, females
  for d in select gs::date from generate_series(start6, current_date, interval '1 day') gs
           where extract(dow from gs) = 6 and extract(day from gs) <= 7 loop
    insert into services (name, service_date, description) values ('Women''s Meeting', d, tag) returning id into sid;
    for m in select id from members where is_active is not false and sex = 'Female' loop
      factor := 0.4 + (abs(('x' || substr(md5(m.id::text),1,8))::bit(32)::int) % 1000) / 1000.0 * 1.2;
      p := least(0.95, 0.60 * factor);
      if random() < p then insert into attendance (service_id, member_id) values (sid, m.id) on conflict do nothing; end if;
    end loop;
  end loop;

  -- 6) Special Service — two one-off dates, everyone, high turnout
  for d in select unnest(array[(current_date - interval '5 months')::date, (current_date - interval '2 months')::date]) loop
    insert into services (name, service_date, description) values ('Special Service', d, tag) returning id into sid;
    for m in select id from members where is_active is not false loop
      factor := 0.4 + (abs(('x' || substr(md5(m.id::text),1,8))::bit(32)::int) % 1000) / 1000.0 * 1.2;
      p := least(0.98, 0.82 * factor);
      if random() < p then insert into attendance (service_id, member_id) values (sid, m.id) on conflict do nothing; end if;
    end loop;
  end loop;
end $$;

-- Quick check of what was created:
--   select name, count(*) sessions from services
--   where description = 'Seeded test data (safe to delete)' group by name order by name;

-- ── CLEANUP (removes everything this script inserted; attendance cascades) ──
--   delete from services where description = 'Seeded test data (safe to delete)';
