// ============================================================
// WHITE-LABEL BRANDING — single source of truth
// ------------------------------------------------------------
// This app is run as "one church, one copy" (each church clones the repo and
// points it at their own Supabase). To re-brand for a new church you edit THIS
// FILE ONLY — nothing is hardcoded in the pages anymore.
//
// TO RE-BRAND FOR A NEW CHURCH:
//   1. Replace the logo image files in src/logoData.js with the new church's
//      logos (keep the same export names: logoMark, logoFull, logoIcon).
//      - logoMark : small square/emblem shown in the app header
//      - logoFull : full logo, shown faint behind the login screen
//      - logoIcon : optional icon variant
//   2. Edit the text fields below (name, shortName, fullName, motto, ...).
//   3. Optionally change the brand colours below. They are pushed into the CSS
//      theme variables at boot by applyBranding() (called from App.jsx), so the
//      whole app re-tints from these values.
//   4. Point the app at the new church's Supabase (VITE_SUPABASE_URL /
//      VITE_SUPABASE_ANON_KEY env vars) — that part is not in this file.
// ============================================================

import { logoMark, logoFull, logoIcon } from "./logoData";

export const branding = {
  // Names & wording shown across the app.
  name: "RPJF Membership",                                   // app/product name (login title, dashboard welcome)
  shortName: "RPJF",                                         // short label / image alt text
  fullName: "Righteousness Peace and Joy Fellowship",        // church's full name (header, submit-photo page)
  motto: "Serving God By Families",                          // header sub-line under the church name
  tagline: "Membership Management System",                   // login screen sub-title
  portalNote: "Church Connect · Secure Member Portal",  // small login footer line
  reportLabel: "Church Connect",                             // prefix on exported CSV report headers

  // Logos (swap the underlying files in logoData.js, not the names here).
  logo: { mark: logoMark, full: logoFull, icon: logoIcon },

  // Brand colours. Injected into the CSS theme tokens at boot, so changing them
  // here re-tints the whole app. `colors` = light mode, `colorsDark` = dark mode.
  // Values are the original RPJF palette (Option A dark). A new church edits both.
  colors: {
    brand: "#2a5357",          // primary brand teal
    brandHover: "#1e3f42",     // darker, button hover
    brandActive: "#162e30",    // darkest, button pressed
    brandContrast: "#ffffff",  // text/icon on top of the brand colour
    brandAccent: "#5edcd1",    // bright accent (active tab, header sub-line)
    brandTint: "#e8f5f5",      // pale brand fill (selected rows, "on" pills)
    brandTintSoft: "#f0fafa",  // even paler brand fill (hover backgrounds)
  },
  colorsDark: {
    brand: "#4d8b90",          // teal lifted so it reads on a dark surface
    brandHover: "#3f767a",
    brandActive: "#356266",
    brandContrast: "#08181a",  // near-black text on the brand colour
    brandAccent: "#5edcd1",
    brandTint: "#16302f",
    brandTintSoft: "#12211f",
  },
};

// Map a branding.colors key -> the CSS custom property it drives (styles.css :root).
const COLOR_TO_VAR = {
  brand: "--brand",
  brandHover: "--brand-hover",
  brandActive: "--brand-active",
  brandContrast: "--brand-contrast",
  brandAccent: "--brand-accent",
  brandTint: "--brand-tint",
  brandTintSoft: "--brand-tint-soft",
};

// Build a CSS rule body from a colours object, e.g. "--brand:#2a5357;...".
function rule(colors = {}) {
  return Object.entries(COLOR_TO_VAR)
    .map(([key, cssVar]) => (colors[key] ? `${cssVar}:${colors[key]};` : ""))
    .join("");
}

// Push the church's brand colours into the CSS theme, for BOTH light and dark
// mode, by injecting a <style> block. A <style> (not inline styles on <html>)
// is used deliberately: it keeps the same specificity as styles.css, so the
// html.dark rules still cascade — inline styles on <html> would pin one value
// and defeat the dark theme. This block is appended after styles.css, so a
// white-label church's colours win in both modes. Idempotent (replaces itself).
export function applyBranding(b = branding) {
  if (typeof document === "undefined") return;
  const css = `:root{${rule(b.colors)}}\nhtml.dark{${rule(b.colorsDark || b.colors)}}`;
  let el = document.getElementById("branding-colors");
  if (!el) {
    el = document.createElement("style");
    el.id = "branding-colors";
    document.head.appendChild(el);
  }
  el.textContent = css;
}

export default branding;
