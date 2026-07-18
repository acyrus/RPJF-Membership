-- ============================================================
-- RPJF Membership — Migration: ushers may review photo submissions
-- Run in Supabase → SQL Editor on your EXISTING database.
-- (Fresh projects get this via supabase_setup.sql.)
--
-- Ushers get the Photos tab so they can clear the submission queue.
--
-- The care point: approving a photo writes members.photo_url, and members UPDATE
-- is admin-only. Rather than grant ushers blanket write access to members (which
-- would let them edit every field on every member), approve/reject go through two
-- SECURITY DEFINER functions. Those functions are the ONLY way an usher can touch
-- the members table — they set photo_url on one member and nothing else.
--
-- Deleting submissions stays admin-only, matching how usher_services works.
-- ============================================================

-- ── Read: ushers can see the pending queue ──────────────────────────────────
drop policy if exists "photo_submissions_select_admin" on photo_submissions;
create policy "photo_submissions_select_reviewer" on photo_submissions
  for select to authenticated
  using (get_my_role() in ('admin','usher'));

-- UPDATE stays admin-only on purpose. Ushers act through the functions below, so
-- they cannot rewrite arbitrary columns (member_id, reviewed_by, status) by hand.

-- ── Approve: set the member's photo and close the submission ─────────────────
create or replace function approve_photo_submission(p_submission uuid, p_member uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := get_my_role();
  v_photo_url text;
begin
  if v_role not in ('admin','usher') then
    raise exception 'Not allowed to review photo submissions';
  end if;

  select photo_url into v_photo_url
  from photo_submissions
  where id = p_submission and status = 'pending';

  if v_photo_url is null then
    raise exception 'That submission is not pending';
  end if;

  -- The only write to members this function performs.
  update members set photo_url = v_photo_url where id = p_member;

  if not found then
    raise exception 'No such member';
  end if;

  update photo_submissions
     set status = 'approved',
         member_id = p_member,
         reviewed_by = auth.uid(),
         reviewed_at = now()
   where id = p_submission;
end;
$$;

-- ── Reject: close the submission, touch nothing else ────────────────────────
create or replace function reject_photo_submission(p_submission uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := get_my_role();
begin
  if v_role not in ('admin','usher') then
    raise exception 'Not allowed to review photo submissions';
  end if;

  update photo_submissions
     set status = 'rejected',
         reviewed_by = auth.uid(),
         reviewed_at = now()
   where id = p_submission and status = 'pending';

  if not found then
    raise exception 'That submission is not pending';
  end if;
end;
$$;

grant execute on function approve_photo_submission(uuid, uuid) to authenticated;
grant execute on function reject_photo_submission(uuid) to authenticated;

-- Undo:
--   drop function if exists approve_photo_submission(uuid, uuid);
--   drop function if exists reject_photo_submission(uuid);
--   drop policy if exists "photo_submissions_select_reviewer" on photo_submissions;
--   create policy "photo_submissions_select_admin" on photo_submissions
--     for select to authenticated using (get_my_role() = 'admin');
