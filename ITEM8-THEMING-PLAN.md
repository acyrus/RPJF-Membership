# Item 8 — Theming (light/dark) + white-label branding: plan

Status: **PR 1 + PR 2 built.** Manual dark mode + white-label branding complete.

## PR 2 build log (dark mode)

- `styles.css` — added `html.dark { }` with Option A dark values for every token
  (brand lifted to `#4d8b90`, dark surfaces/text/borders), plus 5 new neutral tokens
  (`--panel`, `--text-navy`, `--text-navy-muted`, `--border-navy`, `--border-navy-strong`).
- `branding.js` — added `colorsDark`; `applyBranding()` now injects a `<style>` with both
  `:root` and `html.dark` brand rules (a `<style>`, not inline styles on `<html>`, so the
  dark cascade still works and a white-label church controls brand in both modes).
- Inline colours — 579 automated conversions of the recurring neutral/brand palette from
  hardcoded hex to `var(--token)`, style-object values only. SVG/recharts `fill=`/`stroke=`
  attributes and colour arrays were deliberately left as literal hex (CSS vars don't resolve
  in SVG attributes), and two JS hover-reset handlers were fixed by hand.
- Manual toggle — sun/moon button in the header; choice saved to `localStorage`
  (`rpjf_theme`) and applied before first paint by an inline script in `index.html` (no flash).
- README — added a "Re-branding for a new church" section.
- Verified: esbuild syntax on all files, all 42 `var(--token)` references defined, local
  import/export bundle resolves, no vars leaked into SVG attributes.
- Known limitation: recharts axis/grid colours and a few colored status tints stay
  light-tuned in dark mode (visible but not ideal). Easy to refine after seeing it live.

## Build log

**PR 1 — done, no visible change.** Token layer + white-label config, all values
identical to today's RPJF look:
- `src/styles.css` — added a `:root` token block (brand, surfaces, text, status,
  birthday, shadows) and converted every rule to `var(--token)`. Same colours as before.
- `src/branding.js` — NEW single source of truth: church names, motto, tagline, logo
  refs, and brand colours, with a header comment telling a new church exactly what to
  swap (logos in `logoData.js`, text + colours here, Supabase env vars).
- `applyBranding()` injects the brand colours into the CSS tokens at boot, called once in
  `src/main.jsx` so both the app and the public `/submit` page re-tint.
- Wired the church name / motto / tagline / logo through `branding` in `App.jsx`,
  `LoginPage`, `DashboardPage`, `SubmitPhotoPage`, and the CSV report headers in
  `ImportPage`. No hardcoded "RPJF"/"Righteousness…" left in the pages.
- Verified: esbuild syntax-check on all changed files, all 36 CSS vars defined, local
  import/export bundle resolves. Full `vite build` could not run in the Linux sandbox
  because the repo's `node_modules` holds Windows binaries — worth a local `npm run build`
  on your machine as a final confirm.

**Refinement to the original phasing:** the inline-JSX colour sweep (originally phase 3–4
of PR 1) is **moved into PR 2** with dark mode. Those inline colours only need to become
variables *for* dark mode, and that mechanical sweep is the risky part — safer to verify it
against the actual dark rendering than to ship it blind in the "invisible" PR. So PR 1 stays
genuinely zero-visual-change: the CSS-class elements now read from tokens, the inline-styled
elements still carry their original hex (unchanged in light mode).

**PR 2 — to do:** convert inline JSX hex → `var(--token)` (excluding recharts/SVG `fill`/
`stroke` attributes, where CSS vars don't resolve), add the `html.dark` overrides (Option A
values below), the manual toggle with `localStorage`, and the README white-label section.

---

Original proposal below, for reference.

## Where the code is today

- **No CSS variables exist.** `styles.css` (455 lines) and every page use raw hex.
- **~1,155 hardcoded hex colors** across `src/`, the large majority **inline** in JSX
  (`style={{ color: "#111827" }}`), not CSS classes.
- **Brand teal `#2a5357` appears 105 times**, in all 14 pages plus `App.jsx` and `styles.css`.
- The recurring palette is small — roughly a dozen colors cover most usage: teal `#2a5357`,
  a navy set (`#2a3560`, `#8a96b8`, `#e4e9f5`), grays (`#111827`, `#374151`, `#6b7280`,
  `#9ca3af`, `#d1d5db`, `#e5e7eb`, `#f3f4f6`), black, white.
- **Church name** ("RPJF" / "Righteousness…") is hardcoded in 6 files; the logo lives in
  `logoData.js` (`logoIcon`, `logoFull`, `logoMark`).

## The core constraint that drives the design

A stylesheet rule like `.dark { color: … }` **cannot override an inline `style={{}}`** —
inline styles win. So dark mode can't be bolted on with a CSS class alone while colors are
inline hex.

**CSS custom properties are the exception.** `style={{ color: "var(--text)" }}` resolves the
variable at render, and the variable's value can be redefined by a class on a parent
(`html.dark`). So converting hardcoded hex to `var(--token)` is the single move that unlocks
*both* dark mode (swap the token values) and white-labeling (one config feeds the tokens).

## Architecture

Three pieces.

**1. Token layer (in `styles.css`).**
Define semantic tokens once, with a dark override:

```css
:root {
  --brand: #2a5357;  --brand-contrast: #ffffff;
  --bg: #f9fafb;     --surface: #ffffff;  --border: #e5e7eb;
  --text: #111827;   --text-muted: #6b7280;  --text-faint: #9ca3af;
  /* …the ~dozen recurring colors, named by role not by hue… */
}
html.dark {
  --bg: #0f1417;     --surface: #1a2227;  --border: #2b343a;
  --text: #f3f4f6;   --text-muted: #9aa4ad;  --text-faint: #6b7280;
  /* brand stays, or gets a slightly lifted variant for contrast */
}
```

Tokens are **semantic** (`--text-muted`), not literal (`--gray-500`), so dark mode and
re-branding change values without renaming anything.

**2. Branding config (`src/branding.js`) — the white-label single source of truth.**

```js
export const branding = {
  name: "RPJF Membership",
  shortName: "RPJF",
  tagline: "Membership Management System",
  logo: { icon: logoIcon, full: logoFull, mark: logoMark },
  colors: { brand: "#2a5357", brandContrast: "#ffffff" /* church-overridable */ },
};
```

On boot, `App.jsx` writes `branding.colors` into the CSS tokens via
`document.documentElement.style.setProperty("--brand", …)`. So the config drives the CSS
layer (colors) *and* is imported directly for the strings/logo. A new church edits this one
file (plus their own Supabase env vars) and nothing else.

**3. Dark-mode toggle.**
Add/remove `html.dark`; persist the choice in `localStorage` (fine in the real app — the
no-storage rule only applies to sandboxed artifacts); default to the OS setting via
`matchMedia("(prefers-color-scheme: dark)")` on first visit. A small control in the header
or user menu.

## Phased steps (each ends buildable)

1. **Scaffold, no visual change.** Add the `:root` token block mirroring today's exact
   colors, add `branding.js`, inject brand color on boot. App looks identical.
2. **Convert `styles.css`** hex → `var(--token)`. Verify light mode pixel-identical.
3. **Convert inline JSX colors**, page by page (start with `App.jsx` + `LoginPage`, then the
   rest). Mechanical find/replace against the ~dozen palette colors; spot-check each page.
4. **Wire branding strings/logo** — point the 6 hardcoded church-name spots and logo uses at
   `branding.js`.
5. **Add the dark token overrides + toggle.** Now dark mode actually renders.
6. **README white-label section** — "to rebrand: edit `branding.js`, set your Supabase env
   vars, replace the logo files."

Phases 1–4 are safe and invisible; real change begins at 5. We can stop after any phase.

## Files touched

`styles.css` (tokens), new `src/branding.js`, `App.jsx` (inject + toggle + persist), all 14
pages + `components.jsx` (hex → var, mechanical), `logoData.js` (unchanged, imported by
branding), `README.md` (white-label section). No database or Supabase changes — this is
entirely front-end.

## Risks & verification

- **Contrast in dark mode.** Some brand-tinted backgrounds (`#2a535712` etc.) need dark
  equivalents; check each page on a real screen, not just a toggle.
- **Mechanical replace missing edge cases** — rgba() literals, box-shadows with color,
  gradient stops. Grep for `rgba(`, `box-shadow`, `linear-gradient` separately.
- **The mobile roster / modal stacking** notes in CLAUDE.md — verify those specific screens
  in both themes since they've been fragile.
- Verify with `npm run build` after each phase and eyeball light mode unchanged before
  touching dark.

## Decisions made

1. **Dark palette — Option A (teal, current brand), approved.** Light mode stays exactly as
   today. The `html.dark` token values:

   | Token | Light (today) | Dark (Option A) |
   |---|---|---|
   | `--bg` (page) | `#f9fafb` | `#0e1416` |
   | `--surface` (cards) | `#ffffff` | `#172025` |
   | `--border` | `#e5e7eb` | `#2a343a` |
   | `--text` | `#111827` | `#e8ecef` |
   | `--text-muted` | `#6b7280` | `#97a2a9` |
   | `--text-faint` | `#9ca3af` | `#6a757c` |
   | `--brand` | `#2a5357` | `#4d8b90` (lifted for contrast) |
   | `--brand-contrast` (text on brand) | `#ffffff` | `#08181a` (near-black) |

   Dark page bg carries a faint teal undertone so it echoes the brand instead of reading flat
   gray. The remaining recurring colors (navy set, mid-grays) get dark equivalents during the
   build, mapped by role.

2. **Toggle — manual switch.** A control in the header/user menu; choice persisted in
   `localStorage`. Not tied to the OS setting.

3. **Scope — two PRs, confirmed.** PR 1 = phases 1–4 (branding config + var plumbing, zero
   visible change). PR 2 = phases 5–6 (dark token overrides + toggle + README white-label
   section). Merge PR 1 to production first once verified identical, then build PR 2.
