-- ============================================================
-- RPJF Membership Migration v15
-- Run in Supabase Dashboard -> SQL Editor
-- Separates instruments from skills.
--   1. Adds members.instruments (comma-separated text)
--   2. Moves any existing "Music (...)" values out of the
--      skill1/skill2/skill3 columns into instruments
--   3. Clears those music values from the skill columns
-- ============================================================

ALTER TABLE members ADD COLUMN IF NOT EXISTS instruments text;

-- Collect any "Music (X)" skills into the instruments column (as "X"),
-- preserving multiple instruments as a comma-separated list.
UPDATE members
SET instruments = NULLIF(trim(both ', ' FROM concat_ws(', ',
  CASE WHEN skill1 LIKE 'Music (%)' THEN regexp_replace(skill1, '^Music \((.*)\)$', '\1') END,
  CASE WHEN skill2 LIKE 'Music (%)' THEN regexp_replace(skill2, '^Music \((.*)\)$', '\1') END,
  CASE WHEN skill3 LIKE 'Music (%)' THEN regexp_replace(skill3, '^Music \((.*)\)$', '\1') END
)), '')
WHERE skill1 LIKE 'Music (%)' OR skill2 LIKE 'Music (%)' OR skill3 LIKE 'Music (%)';

-- Remove the music values from the skill columns so the 3 skill
-- slots are free for non-music skills again.
UPDATE members SET skill1 = NULL WHERE skill1 LIKE 'Music (%)';
UPDATE members SET skill2 = NULL WHERE skill2 LIKE 'Music (%)';
UPDATE members SET skill3 = NULL WHERE skill3 LIKE 'Music (%)';

-- Normalize keyboard spelling to match the app/form (no spaces around the slash).
UPDATE members SET instruments = replace(instruments, 'Keyboard / Piano', 'Keyboard/Piano')
WHERE instruments LIKE '%Keyboard / Piano%';
