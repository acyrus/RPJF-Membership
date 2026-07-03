-- ============================================================
-- RPJF Membership Migration v12
-- Run in Supabase Dashboard → SQL Editor
-- Renames the user-account role 'board' → 'leadership'.
-- (This is the LOGIN role, not the "Board Member" ministry — that is
--  a separate concept stored in member_roles and is unaffected.)
-- ============================================================

-- 1. Migrate existing accounts, then update the allowed-role constraint.
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
UPDATE profiles SET role = 'leadership' WHERE role = 'board';
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin','usher','leadership','celebrations'));

-- 2. Household permissions referenced 'board' — point them at 'leadership'.
DROP POLICY IF EXISTS "households_insert" ON households;
CREATE POLICY "households_insert" ON households FOR INSERT TO authenticated
  WITH CHECK (get_my_role() IN ('admin','leadership','usher'));

DROP POLICY IF EXISTS "households_update" ON households;
CREATE POLICY "households_update" ON households FOR UPDATE TO authenticated
  USING (get_my_role() IN ('admin','leadership','usher'));

CREATE OR REPLACE FUNCTION set_member_household(p_member_id uuid, p_household_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF get_my_role() NOT IN ('admin','leadership','usher') THEN
    RAISE EXCEPTION 'Not authorized to assign households';
  END IF;
  UPDATE members SET household_id = p_household_id WHERE id = p_member_id;
END;
$$;

GRANT EXECUTE ON FUNCTION set_member_household(uuid, uuid) TO authenticated;
