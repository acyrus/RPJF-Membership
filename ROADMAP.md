# RPJF Membership App — Roadmap

Priority order. Done items first, then foundational and quick-win work before the larger
builds, with the most complex left for last.

## Completed

1. Ensure all account credential setup works properly
2. Enable duplicate session block (single active session, last login wins)
3. Redefine data intake pull for membership
4. Change name of Roster to Uncaptured Members

## In priority order

5. **Code standardization for replication and GitHub protection.** Do first. A one-time
   line-endings fix (`.gitattributes`) and branch protection rules protect production and
   stop the "whole tree looks modified" problem before more code piles on.
6. **Additional membership info: interaction type (In Person / Online / Both).** Done.
   Quick field, immediate value while onboarding is still active. (Nationality was considered
   and dropped.)
7. **A section for church position.** Another quick data addition on the member record.
8. **Standardize styling between light and dark mode.** Cleaner to settle before more pages
   are built. **Bundle white-label branding here:** pull church name, tagline, logo, and
   theme colors into one config file, plus a README section telling a new church what to
   change. Model is "each church runs their own copy" (own clone + own Supabase), so no
   multi-tenancy or data-model changes. Meanwhile, new pages should read the church
   name/logo from a single source rather than hardcoding it, so there's nothing scattered
   to hunt down when this is built.
9. **Develop the family and household trees.** Core feature, builds on the households that
   already exist.
10. **Improve the analytics pages for more meaningful, useful views.** Lands better after 6
    and 7 give it richer data to work with.
11. **Create more freedom for attendance registers.**
12. **Create a section for tracking private meetings.**
13. **Explore mass / targeted communication capabilities.**
14. **A printable letter template for the app.**
15. **Offline capabilities.** Biggest and most complex; best left until the rest is stable.

## Sequencing rationale

Item 5 is foundational and protects everything after it, so it goes first. Items 6 and 7 are
fast and useful right now. Item 8 is a styling base worth having in place before adding pages.
Then the feature builds, with the two data additions (6, 7) feeding better analytics (10).
Offline is last because it touches the whole app.
