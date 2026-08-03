# RPJF Membership App — Roadmap

Priority order. Quick, high-value work first, then the feature builds, with the largest and
most complex left for last. Overlapping requests have been folded together
(re-prioritised Aug 2026).

## Completed

1. Ensure all account credential setup works properly.
2. Enable duplicate session block (single active session, last login wins).
3. Redefine data intake pull for membership.
4. Change name of Roster to Uncaptured Members.
5. Code standardization for replication and GitHub protection (`.gitattributes` + line-endings
   fix, `.editorconfig`, `.gitignore`, README, branch protection on `main`).
6. Additional membership info: interaction type (In Person / Online / Both).
7. A section for church position — leadership position (Leader / Co-Leader) per ministry,
   admin-set, preserved across import.
8. Standardize light/dark mode styling + white-label branding (`src/branding.js`, manual
   dark-mode toggle, README white-label section).
9. Family view (Families tab) — accordion cards, split family/person search, couple only when
   linked, grouping helper; spouse link also de-duplicates anniversaries in Celebrations.
   See `ITEM9-FAMILY-VIEW-PLAN.md`.
10. Refine the membership form — five sections with intros, conditional fields, admin-only
    fields kept off the public form.
11. Attendance & analytics groundwork — service description, per-service member search,
    by-individual attendance view moved into Analytics (tick/X per service, attended/missed/
    rate, sort, sticky name), distinct-member monthly charts by service type and age group,
    turnout %, lowest-attendance + least-attended cards, By-month/By-date toggle, and the
    >1000-row attendance load fix.

## Remaining (re-prioritised)

### Near-term — quick, high-value

12. **Mobile & layout fixes.** ✅ Done — by-usher progress table no longer clips usher names on
    mobile (narrower number columns, shortened headers, names wrap); Families card names wrap
    instead of truncating; Celebrations no longer overflows page width (sub-tab pills trimmed,
    rows shrink); Import "Roster Check" renamed to "Uncaptured Members" with reworded copy; and
    the Celebrations anniversary icon changed from a heart to a gem/ring. (was #21, #26)
13. **Lapsed-member detection.** Base "Slipping Away" on consecutive services missed rather than
    the 28-day window, and flag / auto-mark members who've gone inactive, with an inactive
    switch. (was #22, #25)

### Feature builds

14. **Attendance registers & capacity.** Support different register types/formats; surface a
    service's description and attendance at creation / list time; search attendance by family as
    well as by name; and a roster occupancy / capacity view. (folds old #11, #18, #20, #29, #30)
15. **Ministries & Skills.** Make both tabs searchable by skill, person, and household, and set
    leadership roles within a ministry directly from the Ministries page. (was #23, #28)
16. **Analytics polish.** Move filters into a collapsible side panel; add the prototyped
    visualization upgrades (attendance heatmap, average reference lines, change badges, fixed
    per-type colours); finish any remaining useful views. (folds old #10, #24 + viz mockup)
17. **Revise the individual member view.** Rework the member detail / interaction panel. (was #27)
18. **App shell & branding polish.** A title / splash screen, and collapsible / expandable
    navigation (drawer). (was #17, #19)

### Larger builds — later

19. **Private meetings tracking.** (was #12)
20. **Communication.** Mass / targeted messaging, plus an in-app "needs my attention"
    notification centre (from the notification-centre discussion). (was #13)
21. **Printable letter template.** (was #14)
22. **Offline capabilities.** Biggest and most complex; best left until the rest is stable.
    (was #15)

## Notes

- "Slipping Away" already exists in Analytics; #13 is a refinement of it plus the inactive flag.
- Much of the original "improve analytics" (old #10) was delivered in item 11; #16 is the
  remaining polish.
- The plan docs `ITEM8-THEMING-PLAN.md` and `ITEM9-FAMILY-VIEW-PLAN.md` cover completed work
  and can be archived.
