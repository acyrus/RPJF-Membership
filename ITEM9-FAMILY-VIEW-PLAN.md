# Item 9 — Family view (households), plan

Status: **proposal, not yet built.** Reframed from "family trees" — a grouped family
*view*, not a drawn genealogical tree (see reasoning at the bottom).

## What already exists (so there's little to add)

- `households` table + `members.household_id` (which family a member is in).
- `members.spouse_id` (links two members) and `members.household_role` — already a rich
  vocabulary: `FAMILY_TITLES = Father, Mother, Husband, Wife, Son, Daughter, Grandfather,
  Grandmother, Grandson, ...` (`components.jsx`).
- The Households page already lets an admin assign a member's household and set their family
  title, and unassign. `set_member_household(member, household)` RPC exists (admin/leadership/
  usher).
- Members load with `select("*")`, so household, title, spouse, DOB, address, photo are all
  already available to render — **no new columns, no migration for the view itself.**

Gap: it's an *assignment tool*, not a *family you can look at*. And only ~3 of 64 members are
in a household today, so the real cost is grouping people into families (addressed below).

## The feature

### 1. Family view (per household)
A clean read layout for each household:
- **Adults on top** (Father/Mother/Husband/Wife/Grandparents), with the couple linked via
  `spouse_id` (one subtle "married" connector, not a graph).
- **Children below**, sorted by age (Son/Daughter/Grandchildren).
- Each person: photo, age (from DOB), relationship-title badge; click opens their record.
- Household facts: member count, number of children, the head's phone/email, birthdays and
  anniversaries in the family this month, and a "needs a photo" flag (ties into Uncaptured).

**Grouping works from data you already have.** When a member has a title, use it. When they
don't, fall back to age: 18+ sits in Adults, under-18 in Children. So a household looks right
the moment its members are assigned, *before anyone fills in a single title*.

### 2. Household role (titles)
Keep the existing `FAMILY_TITLES` vocabulary. Titles are an **optional override** of the
age-based guess — needed only for edge cases (an adult child still at home, a live-in
grandparent). Editable where it already is (Households page); optionally surface it in the
member form's Family section too (pairs with item 16). No DB change.

### 3. Grouping helper (makes the one real chore painless)
On the Households page (admin), a **"Suggest families"** action:
- Scans members with no household, clusters them by normalised last name + address.
- Presents each cluster as a suggestion: *"5 members named Mariemootoo at 12 Main St —
  create this household?"* with the people listed and checkboxes to drop any that don't belong.
- Admin names it (defaults to "The <Surname> Family") and confirms → the household is created
  and those members assigned in one step.
So grouping ~60 people becomes a handful of confirmations instead of one-by-one assignment.
Suggestions only; the admin always confirms (same surname ≠ same family).

### 4. (Optional) Import household column
Let the member import carry a "Household" column so a fresh church can bulk-set families at
import time.

## Phases (each usable on its own)

1. **Family view read layout** — the whole payoff, from existing data. No migration.
2. **Age-based default grouping + title badges + household facts** (folded into 1, really).
3. **Grouping helper** — suggestions + confirm-to-create.
4. **Optional:** an atomic `create_household_with_members(name, member_ids[])` RPC (cleaner
   than looping `set_member_household`), and the import household column.

Phases 1–3 need no schema change. Phase 4's RPC is a small, optional migration for atomicity.

## Files

`src/pages/HouseholdsPage.jsx` (the view + grouping helper), maybe a small `FamilyCard`
component in `components.jsx`, `src/pages/ImportPage.jsx` (optional household column),
`supabase_migration_household_bulk.sql` (optional, phase 4 only).

## Risks

- **Same surname, different family / same family, different address.** The helper only
  *suggests*; nothing is created without admin confirmation, and clusters are editable.
- **Blended / extended families.** The title override handles the cases age-based grouping
  gets wrong; nothing is forced into a rigid parent→child structure.
- **A member in the wrong household** is a one-click reassign, already supported.

## Decisions needed

1. **Replace or alongside?** Turn the current Households page into the family view, or add a
   "Family view" mode next to the existing assignment layout?
2. **Where to edit titles?** Keep it only on the Households page, or also add it to the member
   form's Family section?
3. **Approach:** build phase 1 first (the view) so you can see it with real data, then the
   grouping helper — recommended — or build view + helper together?

## Why not a real tree

A drawn multi-generation tree with connector lines fights reality (blended families, people
who move between households, extended family), is fiddly on mobile, and needs someone to hand-
enter every parent→child link for little payoff. The grouped family view delivers what a church
uses a family for — visiting, contacting, celebrating, knowing kids' ages — from data you
already collect.
