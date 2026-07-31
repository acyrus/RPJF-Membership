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
9. **Develop the family and household trees.** Core feature, builds on the households that
   already exist.
10. **Improve the analytics pages for more meaningful, useful views.** Lands better after 6
    and 7 give it richer data to work with.
11. **Create more freedom for attendance registers.**
12. **Create a section for tracking private meetings.**
13. **Explore mass / targeted communication capabilities.**
14. **A printable letter template for the app.**
15. **Offline capabilities.** Biggest and most complex; best left until the rest is stable.
16. **Refine the membership form — add sections and enhance the flow.** The form is one long
    flat list of ~20 fields in a scattered order (city ends up near instruments, anniversary
    far from spouse). Group into labelled sections and reorder for a natural flow. Proposed
    sections: (1) Photo & name, (2) Personal details — gender, DOB, marital status,
    (3) Contact — phone, email, address, city, (4) Family — household, spouse, wedding
    anniversary, (5) Church life — member status, join date, how they attend, ministries +
    leadership position, (6) Gifts & skills — skills, instruments, other skills, (7) Notes.
    Use the same section order on the admin form and the public submission form (subset);
    consider collapsible sections on mobile. Pairs naturally with items 6 and 7. No data-model
    change — purely form structure and UX.

## Sequencing rationale

Item 5 is foundational and protects everything after it, so it goes first. Items 6 and 7 are
fast and useful right now. Item 8 is a styling base worth having in place before adding pages.
Then the feature builds, with the two data additions (6, 7) feeding better analytics (10).
Offline is last because it touches the whole app.
