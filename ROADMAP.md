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
13. **Lapsed-member detection.** ✅ Done — "Slipping Away" kept on a 28-day window with an
    in-app explanation of how it works, plus a new "Inactive Candidates" list (active members
    whose last attendance across all services was 90+ days ago) with an admin one-click
    "Mark inactive". By-Member view also gained sort by name/attended/missed/rate with an
    ascending/descending toggle. (was #22, #25)

### Feature builds

14. **Attendance registers & capacity.** ✅ Mostly done — editable service types (create /
    rename / remove, plus inline "+ New type" when creating a service and a standalone Service
    Types manager); a service's description surfaced and editable at any time; attendance search
    by family as well as by name (separate name + family filters); and a By Family attendance
    grid in Analytics (members × services, present/absent, per-member + household rate).
    **Shelved for later:** roster occupancy / capacity view. (folds old #11, #18, #20, #29, #30)
15. **Ministries & Skills.** ✅ Done — both tabs now have separate person and family filters
    (Ministries also a ministry dropdown, Skills keeps its skill dropdown), and admins can set a
    member's Leader / Co-Leader position directly from the Ministries page via a per-member
    popover (writes member_roles.position, no migration needed). (was #23, #28)

16. **Analytics polish.** ✅ Done — filter slide-out drawer (active-count badge, summary
    line, Clear all / Done) with marital / attends / skill / age-range filters added; sticky
    Analytics header + filter bar; Attendance Overview stat tiles with change badges +
    sparklines and service-type on the peak/lowest tiles; trend charts with average reference
    lines + filled areas; Chart/Grid small-multiples toggle on the service-type and age-group
    charts. Members subtab reworked (centre-total donuts, expandable attenders with rate, calm
    labelled city bars, birthday/anniversary toggle with spouse-merge, filled cumulative-growth
    area with side stats, labelled age pyramid, Households sub-tab with icon cards, icon
    scorecards). Ministries subtab (icon cards, data labels, natural overlap phrasing, dropped
    the duplicate coverage table) and a new **Musicians** tab (collapsible per-instrument
    lists, by-count table). All chart descriptions de-em-dashed. ✅ Attendance heatmap
    (months × service type, each row shaded to its own busiest month) and stable per-service-type
    colours across every chart (keyed off the full type list so filtering never repaints) both
    done. Plus a new **Data** tab (field completeness with progress bars) and the redundant
    "Services per Type" bar removed. (folds old #10, #24 + viz mockup)
17. **Revise the individual member view.** ✅ Done — member detail is now a centered popout
    modal (was a side panel), with Edit / Delete moved to the top; clicking a member anywhere
    (Ministries, Skills, Families, Celebrations) jumps to the Members tab and highlights that
    person's row instead of landing at the top of the list; the detail shows the household with
    clickable family members + spouse, and switching between them resets the popout scroll.
    (Tap-to-call / tap-to-email on the phone and email rows was deferred to the communication
    work, #20.) (was #27)
18. **App shell & branding polish.** ✅ Done — a branded splash screen replaces the bare boot
    spinner (logo, church name, tagline, loader); the horizontal tab bar is replaced by a
    collapsible left sidebar (expanded / icons-only toggle on desktop, hamburger slide-out
    drawer on mobile) driven by the same TAB_ACCESS list. (was #17, #19)

### Larger builds — later

19. **Private meetings tracking.** (was #12)
20. **Communication.** Mass / targeted messaging, plus an in-app "needs my attention"
    notification centre (from the notification-centre discussion). (was #13)
21. **Printable letter template.** (was #14)
22. **Offline capabilities.** Biggest and most complex; best left until the rest is stable.
    (was #15)

### Backlog / future

- **Roster occupancy / capacity view** (split out of #14). Track how full a service / roster is
  against a capacity figure. Shelved Aug 2026 for a later pass.
- **Member quick-action popover.** Clicking a member anywhere opens a small anchored popover
  with a mini profile (avatar, name, key info) and access-gated actions (View details, Edit,
  Call / Email, View family) instead of navigating straight to the Members tab — also gives
  lower-access accounts a read-only quick-look. Shelved Aug 2026.
- **Ministry Health + per-ministry staffing targets.** An analytics card flagging ministries
  that need a leader or more people, driven by an admin-set "needs at least N" target per
  ministry (new `ministry_targets` table + an editor on the Ministries page). A fixed-threshold
  version was built and removed; shelved Aug 2026 until the per-ministry targets are wanted.

## Notes

- "Slipping Away" already exists in Analytics; #13 is a refinement of it plus the inactive flag.
- Analytics (#16) is complete: the original "improve analytics" (old #10) plus the polish pass.
- The next unstarted item is **#19 (private meetings tracking)**; #20–22 are the larger later
  builds (communication + notification centre, letter template, offline).
- The plan docs `ITEM8-THEMING-PLAN.md` and `ITEM9-FAMILY-VIEW-PLAN.md` cover completed work
  and can be archived.
