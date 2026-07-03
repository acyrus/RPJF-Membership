-- ============================================================
-- RPJF Membership Migration v10
-- Run in Supabase Dashboard → SQL Editor
-- Lets ushers & board (not just admins) manage households:
--   • create / rename households
--   • assign members to a household
-- Members' OTHER details stay admin-only. Household assignment is
-- routed through a SECURITY DEFINER function so a non-admin can ONLY
-- ever change household_id — never any other member column.
-- ============================================================

-- 1. Broaden household create/rename to admin, board, usher.
--    (Delete stays admin-only — keep the existing households_delete policy.)
DROP POLICY IF EXISTS "households_insert" ON households;
CREATE POLICY "households_insert" ON households FOR INSERT TO authenticated
  WITH CHECK (get_my_role() IN ('admin','board','usher'));

DROP POLICY IF EXISTS "households_update" ON households;
CREATE POLICY "households_update" ON households FOR UPDATE TO authenticated
  USING (get_my_role() IN ('admin','board','usher'));

-- 2. Locked-down household assignment.
--    SECURITY DEFINER runs with elevated rights and bypasses the
--    admin-only members RLS — but ONLY updates household_id, and ONLY
--    for callers who are admin / board / usher.
CREATE OR REPLACE FUNCTION set_member_household(p_member_id uuid, p_household_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF get_my_role() NOT IN ('admin','board','usher') THEN
    RAISE EXCEPTION 'Not authorized to assign households';
  END IF;
  UPDATE members SET household_id = p_household_id WHERE id = p_member_id;
END;
$$;

GRANT EXECUTE ON FUNCTION set_member_household(uuid, uuid) TO authenticated;
