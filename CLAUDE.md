# RPJF Membership — working notes

Church membership app for Righteousness Peace and Joy Fellowship (Trinidad & Tobago).
React 18 + Vite 5 + Supabase, deployed on Vercel. Deps: `@supabase/supabase-js`, `recharts`,
`lucide-react`. No tests, no linter, no TypeScript — `npm run dev` / `npm run build` is the loop.

## Repo & workflow

- Real repo: `C:\Users\cyrus\dev\RPJF-Membership` (app lives in `church-app-v2/`).
- **Do not** work in `C:\Users\cyrus\OneDrive\Desktop\RPJF App\church-app-v2` — that's a stale
  pre-git copy. Git and OneDrive don't mix; the clone deliberately lives outside OneDrive.
- Branches: work on `staging`, merge to `main` via PR. `main` = production on Vercel.
- Loop: `git status` → `git add -A` → `git commit -m "..."` → `git push`.
- History before Jul 2026 is all "Add files via upload" — the repo was managed through the
  GitHub web UI, which caused delete-then-reupload commits and constant merge conflicts.
  That's fixed; don't go back to it.
- **Line endings are unmanaged.** No `.gitattributes`, `core.autocrlf` unset, and the files
  carry mixed CRLF/LF, so `git status` reports the *entire* tree as modified after almost any
  touch. `git diff --stat` will say ~5,000 changed lines when three lines actually changed.
  Always check real changes with `git diff --ignore-all-space` before believing a diff.
  Fixing this properly = add `.gitattributes` with `* text=auto eol=lf` and renormalize once.

## Architecture notes

- `src/components.jsx` is the shared module: `ROLES`, `ROLE_COLORS`, `SKILLS_LIST`,
  `TRINIDAD_CITIES`, `Avatar`, `fullName`, `MemberForm`, the auth screens (`MfaChallenge`,
  `SecurityModal`, `SetPasswordScreen`, `OnboardingFlow`), plus
  **`TAB_ACCESS` / `TAB_LABELS` / `DEFAULT_TAB` / `tabsForRole()`**.
- **Tab access is a single source of truth.** `App.jsx` (nav + routing) and `UsersPage.jsx`
  (the "who can see what" role cards) both derive from `TAB_ACCESS`. It used to be duplicated
  in three places, which meant the Users page silently lied about permissions. Add a tab in
  `TAB_ACCESS` only.
- **Every render gate in `App.jsx` must use `allowedTabs.includes(key)`, never a role check.**
  Users / Photos / Log / Import were gated on `isAdmin` while the nav was built from
  `TAB_ACCESS`, so an usher granted Photos saw the tab *and* its pending badge and then a
  blank page. If the nav can reach it, the gate must let it render; RLS is what stops writes.
  The role banner above the nav is derived from `allowedTabs` for the same reason — the
  hand-written usher line went stale the moment Roster and Photos were added.
- Roles (`member_roles.role_name`) are unconstrained text in the DB — adding a ministry means
  editing `ROLES` + `ROLE_COLORS` in `components.jsx`, no migration needed.
- Supabase RLS: `get_my_role()` gates writes. Account roles are `admin`, `leadership`,
  `usher`, `celebrations`. Role **defaults**:
  - **admin** — everything (13 tabs), lands on Home
  - **leadership** — all but Users / Photos / Log / Import, lands on Home
  - **usher** — Attendance, Roster, Photos, Households, Celebrations; **lands on Roster**
    (the printed list is what they work from at the door). Falls back to Attendance if an
    admin removes Roster from a specific usher.
  - **celebrations** — Celebrations only
- **Per-user tab overrides.** `profiles.tab_access text[]` (`supabase_migration_tab_access.sql`)
  overrides the role default for one account; NULL means inherit, so the migration changes
  nobody's access until an admin uses it. Admins edit it from Users → **Tabs**; Reset writes
  NULL back so future changes to a role default still reach that user. Resolve tabs with
  **`tabsForProfile(profile)` / `defaultTabForProfile(profile)`** from `components.jsx` — never
  read `TAB_ACCESS[role]` directly in a page, or you'll miss the override. Both helpers sort
  through `TAB_ORDER`, drop unknown keys, and never return an empty list.
  **This is navigation only** — RLS still gates writes by role, so granting a usher the
  Members tab shows the page without granting write access. Widening that is an RLS change.
- Routing is **hash-based**, no router library. `App.jsx` reads `window.location.hash`,
  validates it against `tabsForProfile()`, and falls back to `defaultTabForProfile()`.
  Deep links survive refresh; a hash the user can't reach silently drops to their landing tab.

## Pages (`src/pages/`)

Dashboard, Members, Attendance, Roster, PhotoRequests, Roles (labelled "Ministries"),
Households, Celebrations, Skills, Analytics, Users, Changelog ("Log"), Import,
plus Login and SubmitPhoto (the public photo-submission page, outside the tab shell).

## Auth

- **2FA** is enrolled at login and enforced per account via `profiles.require_2fa`
  (defaults true). `supabase_migration_require_2fa.sql`. Set it false to exempt an account.
- **Concurrent logins are allowed.** Single-session enforcement ("last login wins") was
  removed from `App.jsx` in Jul 2026 — no claim call, no 45s poll, no visibilitychange
  check, no "signed out on another device" banner. The DB side was deliberately left in
  place (`profiles.active_session` + `claim_session()` from
  `supabase_migration_single_session.sql`), unused, so re-enabling is a code change with no
  SQL. Don't "tidy up" that migration expecting it to be dead.
- **15-minute idle auto-logout still applies** (warning at 13 min) — that's separate from
  the session work above and was not touched.

## Migrations

`supabase_setup.sql` is the superset for a **fresh** project. The `supabase_migration_*.sql`
files are for the **existing** database and must be run by hand in the Supabase SQL editor:
`require_2fa`, `single_session`, `usher_services` (ushers + leadership may create an
attendance service; **deleting** one stays admin-only), `rosters`, `tab_access`, `usher_photos`,
`roster_assignments` (usher-editable assign / note / inactive data, keyed by name).

**Photo review is function-gated, not policy-gated.** Ushers can reach the Photos tab, but
`photo_submissions` UPDATE and `members` UPDATE are both still admin-only. Approving calls
`approve_photo_submission(submission, member)` and rejecting calls
`reject_photo_submission(submission)` — `SECURITY DEFINER` functions that re-check the
caller's role. That deliberately avoids granting ushers write access to `members`, which is
what a naive policy widening would have done (photo approval writes `members.photo_url`).
If you add a reviewer role, edit the role check inside those functions, not the table policy.
Deleting submissions stays admin-only.

⚠️ **`tab_access` has not been run yet** (staging or production). Until it is, `UsersPage`
detects the missing column, shows a banner, and disables the Tabs button; everyone falls back
to their role default.

**`supabase-js` resolves with `{ data, error }` — it does not throw.** A `try`/`catch` around
a query catches nothing. This bit us once already: `require_2fa` and `tab_access` were
selected together, so the un-migrated column failed the *whole* select and every account
silently rendered as "Require 2FA: on" regardless of the real value. `UsersPage.load()` now
selects them separately and falls back. Check `.error` explicitly; don't wrap and hope.

## Import page (`src/pages/ImportPage.jsx`)

Three tabs: Import Members, Import Attendance, Roster Check.

- **CSV parsing** uses `parseCSVRows()`, a proper RFC 4180 character scanner. Do NOT
  reintroduce `text.split("\n")` — addresses and notes contain quoted line breaks, which
  split one member into two bogus rows.
- **Dates**: `convertDate()` expects **DD/MM/YYYY** or ISO. The linked Google Sheet renders
  US MM/DD/YYYY by default — format the sheet's date columns as `yyyy-mm-dd` so imports are
  unambiguous.
- **Phones**: `normalizePhone()` canonicalizes to T&T local format `943-4893`. Accepts
  `9434893`, `(868) 943-4893`, `1-868-943-4893`, etc. Only letters or <7 digits block a row.
- **Skills are deduped on ingest.** The form asks for three skills as three independent
  questions, so people pick the same one twice. The importer collapses repeats and
  left-packs `skill1..3`.
- **Google Sheets import** fetches the CSV export URL client-side. It is CORS-fragile; if it
  breaks again the fix is a server-side proxy, not a retry.

## Roster feature

Ushers work from a printed attendance list (~304 names, first+last only). That list now lives
in the app.

- Tables: `rosters` (one row per published list, `is_current` flag, history retained) and
  `roster_names`. See `supabase_migration_rosters.sql`. Partial unique index enforces exactly
  one current roster.
- Admin publishes from Import → Roster Check. Ushers get a **Roster** tab
  (`src/pages/RosterPage.jsx`) with summary stats and combinable filters.
- **The list is responsive: full table on desktop, stacked cards on mobile.** A 7-column
  table collapsed first names to one letter on a phone. **Which layout renders is decided in
  JS** (`useIsMobile` / `matchMedia` in `RosterPage.jsx`) and only that one is put in the
  DOM — a CSS `display:none` toggle was defeated first by an inline style, then by caching,
  so don't reintroduce one. Two renderings of a row now exist; add a roster column to *both*.
  Desktop table header is frozen via `.roster-scroll` (bounded-height card) + `.roster-head`
  (`position:sticky`); the sticky is scoped to the card so it doesn't fight the sticky app nav.
  Mobile card flags "Needs a photo" for in-app members without a `photo_url`.
- Name matching (`normName`) is case-, space-, hyphen- and accent-insensitive, so
  `Ali-Mohammed` === `Ali Mohammed`. Matching is name-only — two people with the same first
  and last name collapse to one. Live with it or add a disambiguator.
- **Usher working data lives in `roster_assignments`, not on `roster_names`.** Ushers can
  assign an usher, add a note, and flag a name inactive from the Roster tab
  (`supabase_migration_roster_assignments.sql`). It's keyed on `name_key` (=`nameKey()`,
  the same normalisation as matching) **on purpose**: a republish deletes and recreates every
  `roster_names` row, so anything stored there would be wiped monthly. Keying by name means a
  month of assignments follows the person onto the new list. Same-name collapse applies here
  too. `name_key` must be built identically in SQL and in `RosterPage.jsx` — NFD-strip accents,
  lowercase, a-z only, `first|last`. Writes are upserts on `name_key`.
- **This is the only roster table ushers may write to.** `rosters`/`roster_names` stay
  admin-only; `roster_assignments` select/insert/update is admin + usher, delete admin-only.
  Assignable ushers are members carrying the **Usher** ministry (`m.roles.includes("Usher")`),
  not usher login accounts. `assigned_usher_id` → `members(id)`, nulled if that member is
  deleted. Inactive is the "remove this one" flag (visitor / moved / duplicate); the default
  view hides inactive names. **Roster stats: Total names (all), Inactive, To capture
  (= total − inactive, the real goal), Captured (in app), Remaining, plus an Onboarding
  progress bar = Captured / To capture.** Removing a name (flagging inactive) shrinks the
  target so completion tracks what's actually left, not the raw roster count.
- **"Progress by usher" card** rolls up active assigned names per usher: Assigned / Done /
  Remaining, where **Done = inApp AND hasPic** (a record without a photo still counts as
  remaining — stricter than the top-level Captured stat, which is inApp only). Unassigned
  active names get their own row so totals reconcile. Clicking a row sets `usherFilter`.

## Skills

Skills are three flat columns on `members` (`skill1`, `skill2`, `skill3`) — not a join table.
Nothing at the DB level stops the same skill landing in two slots, and the Google Form's three
separate questions meant people did exactly that, so a member appeared **twice under one skill**
on the Skills page with an inflated count. Guarded in three places, all of which should stay:

- `SkillsPage` dedupes per member when building `skillMap` — this is what makes rows already
  in the database display correctly, so don't drop it even though entry is now guarded.
- `MemberForm` disables a skill in the other two dropdowns once it's chosen.
- `ImportPage` collapses repeats and left-packs on ingest.

Existing rows are untouched; the display fix makes them harmless. A one-time SQL normalize
would tidy the stored data if it ever matters.

## Known state / open items

- **The working tree was corrupted on 12 Jul 2026 and has been restored.** Files were
  truncated mid-token (`components.jsx` inside `MemberForm`, `UsersPage.jsx`, `styles.css`)
  and `App.jsx` had ~1,031 NUL bytes appended, so the app wouldn't build. Nothing of value
  was lost — with whitespace ignored every hunk was pure truncation — and the files were
  restored from `staging`. Suspect an unclean editor/OneDrive exit; **if it recurs, look
  there first**, and check for NUL bytes (`tr -dc '\0' < file | wc -c`) before assuming a
  real diff.
- **`staging` is well ahead of `main`** and not yet PR'd — roster tables + usher Roster tab,
  the mobile CSS fix, the `TAB_ACCESS` consolidation, and the Jul 18 batch below are all
  still off production.
- **The mobile Members edit modal is guarded twice.** `.modal-bg` outranks `.detail-panel`
  in the stylesheet *and* `MembersPage` adds `.hide-behind-modal` to the panel whenever a
  modal is open, which hides it on mobile only. The z-index fix alone was verified live on
  production and the overlap was still reported, so don't remove the class as redundant
  without reproducing on a real phone first. Desktop shows both, as before.
- **Stacking order is now documented at the top of the `.modal-bg` rule in `styles.css`.**
  `.modal-bg` was at `z-index: 100`, *below* `.detail-panel`'s mobile `200`, so on a phone
  the Members edit modal opened behind the member detail slide-up and looked half-clipped.
  Desktop was unaffected because `.detail-panel` is only positioned inside the mobile media
  query. Keep new overlays on that documented scale.
- The Google Form's DOB question produced several **birth years of 2026** — the symptom of
  "Include year" being off in Forms. Those rows are bad data; reformatting won't recover them.
- The July 2026 roster lists **Christine Mohammed twice**.
- Mobile grid-stacking CSS in `styles.css` was dead for a long time (camelCase selectors never
  match; React writes kebab-case into the DOM). Now fixed — worth eyeballing Analytics on a
  phone.
