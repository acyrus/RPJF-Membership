# RPJF Membership App — Roadmap

Priority order. Done items first, then foundational and quick-win work before the larger
builds, with the most complex left for last.

## Completed

1. Ensure all account credential setup works properly
2. Enable duplicate session block (single active session, last login wins)
3. Redefine data intake pull for membership
4. Change name of Roster to Uncaptured Members
5. Code standardization for replication and GitHub protection (`.gitattributes` + line-endings
   fix, `.editorconfig`, `.gitignore`, README, and branch protection on `main`)
6. Additional membership info: interaction type (In Person / Online / Both). Nationality was
   considered and dropped. (Field is built; run `member_info.sql` then re-run
   `import_members.sql` in Supabase to activate.)

## In priority order

7. **A section for church position.** ✅ Done — leadership position (Leader / Co-Leader) per
   ministry, admin-set, preserved across import.
8. **Standardize styling between light and dark mode.** ✅ Done — CSS token theme + manual
   dark-mode toggle (Option A teal), plus white-label branding pulled into `src/branding.js`
   (church name, tagline, logos, brand colours) and a README white-label section. Model is
   "each church runs their own copy" (own clone + own Supabase).
9. **Family view (households).** ✅ Done — renamed the tab to **Families**; accordion of
   family cards (collapsed by default), split family/person search, couple shown only when
   spouse-linked or titled Husband/Wife or Father/Mother, age-based adult/child grouping,
   inline title editing, and a "Suggest families" grouping helper (surname + address). Spouse
   link also de-duplicates anniversaries in Celebrations (one entry, both names). See
   `ITEM9-FAMILY-VIEW-PLAN.md`.
10. **Improve the analytics pages for more meaningful, useful views.** Lands better after 6
    and 7 give it richer data to work with.
11. **Create more freedom for attendance registers.**
12. **Create a section for tracking private meetings.**
13. **Explore mass / targeted communication capabilities.**
14. **A printable letter template for the app.**
15. **Offline capabilities.** Biggest and most complex; best left until the rest is stable.
16. **Refine the membership form — add sections and enhance the flow.** ✅ Done — grouped into
    five sections with intros: (1) About You, (2) Contact and Address, (3) Your Church Life,
    (4) Skills and Talents, (5) Anything Else. Conditional fields (wedding anniversary if
    married; instruments if they play). Admin-managed fields (leadership position, spouse,
    family, photo, active status) stay off the public form.

## Sequencing rationale

Item 5 is foundational and protects everything after it, so it goes first. Items 6 and 7 are
fast and useful right now. Item 8 is a styling base worth having in place before adding pages.
Then the feature builds, with the two data additions (6, 7) feeding better analytics (10).
Offline is last because it touches the whole app.
