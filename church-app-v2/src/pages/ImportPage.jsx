import { useState, useMemo, useEffect } from "react";
import { supabase } from "../supabase";
import { SKILLS_LIST, ROLES, Avatar, fullName } from "../components";
import { branding } from "../branding";
import { CheckCircle2, AlertTriangle, Camera, UserX, UserCheck } from "lucide-react";

// ── Name matching for the Roster Check ────────────────────────────────────────
// Normalize a name for comparison: lowercase, strip accents, drop anything that
// isn't a letter. So "Alexander-Francois" === "Alexander Francois" === "alexanderfrancois",
// and "O'Brien" === "OBrien".
function normName(s) {
  return String(s || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")  // strip accents
    .toLowerCase().replace(/[^a-z]/g, "");             // drop spaces, hyphens, apostrophes
}
const nameKey = (first, last) => `${normName(first)}|${normName(last)}`;

// Convert DD/MM/YYYY to YYYY-MM-DD for database storage
// order: "DMY" (03/04 = 3 April) or "MDY" (03/04 = 4 March). ISO yyyy-mm-dd is always
// unambiguous. Google Sheets renders US MM/DD by default, so the wrong assumption here
// silently swaps day and month for any date where both parts are <= 12.
function convertDate(raw, order = "DMY") {
  if (!raw || !raw.trim()) return null;
  const s = raw.trim();
  let iso = null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) iso = s;
  else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) {
    const [a, b, y] = s.split("/");
    const [d, m] = order === "MDY" ? [b, a] : [a, b];
    iso = `${y}-${m.padStart(2,"0")}-${d.padStart(2,"0")}`;
  }
  if (!iso) return null; // unrecognized text (e.g. "Not sure") → invalid
  // Verify it's a REAL calendar date so "45/13/1990" (→1990-13-45) or "31/02/2020"
  // don't slip through as strings and error at the database.
  const [y, m, d] = iso.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(iso + "T00:00:00Z");
  if (isNaN(dt.getTime()) || dt.getUTCFullYear() !== y || (dt.getUTCMonth() + 1) !== m || dt.getUTCDate() !== d) return null;
  return iso;
}

// Infer whether slash-format dates in a file are DD/MM or MM/DD by finding any value
// where one part exceeds 12 — that part can only be the day. Returns the order plus how
// confident we are; defaults to DMY when nothing in the data is decisive.
function detectDateOrder(rawStrings) {
  let dmy = 0, mdy = 0;
  for (const raw of rawStrings) {
    const m = /^(\d{1,2})\/(\d{1,2})\/\d{4}$/.exec(String(raw || "").trim());
    if (!m) continue;
    const a = +m[1], b = +m[2];
    if (a > 12 && b <= 12) dmy++;      // first part must be a day → DD/MM
    else if (b > 12 && a <= 12) mdy++; // second part must be a day → MM/DD
  }
  if (dmy && !mdy) return { order: "DMY", confident: true, dmy, mdy };
  if (mdy && !dmy) return { order: "MDY", confident: true, dmy, mdy };
  if (dmy && mdy)  return { order: dmy >= mdy ? "DMY" : "MDY", confident: false, dmy, mdy };
  return { order: "DMY", confident: false, dmy, mdy }; // all values <= 12 → truly ambiguous
}

// Years-old from an ISO date, for catching implausible birth years (the "Include year off"
// Google-Forms bug produced current-year birthdays).
function ageFromISO(iso) {
  if (!iso) return null;
  return (Date.now() - new Date(iso + "T00:00:00Z").getTime()) / (365.25 * 24 * 3600 * 1000);
}

// Proper-case a personal name. Handles hyphens (Ali-Mohammed), apostrophes (O'Brien),
// the Mc prefix (McDonald), and keeps lowercase particles (de, van, der...) mid-name.
// Mac is deliberately NOT auto-capitalised — too many false positives (Machado, Mack).
// Not perfect for every surname, but far better than storing "JOHN SMITH" or "john smith";
// the import previews the changes and can be turned off per-import.
const NAME_PARTICLES = new Set(["de","del","der","van","von","da","di","la","le","du","dos","das","bin","al"]);
function properCaseName(raw) {
  const s = String(raw || "").trim().replace(/\s+/g, " ");
  if (!s) return s;
  const capToken = tok =>
    tok.replace(/[A-Za-zÀ-ÿ]+/g, word => {
      const w = word.toLowerCase();
      let cap = w.charAt(0).toUpperCase() + w.slice(1);
      if (/^mc[a-zà-ÿ]{2,}$/.test(w)) cap = "Mc" + w.charAt(2).toUpperCase() + w.slice(3);
      return cap;
    });
  const words = s.split(" ");
  return words.map((word, i) => {
    const lower = word.toLowerCase();
    if (i !== 0 && i !== words.length - 1 && NAME_PARTICLES.has(lower)) return lower;
    return capToken(word);
  }).join(" ");
}

// Normalize any way a member might type a Trinidad & Tobago phone number into the
// canonical local format "943-4893". Accepts: 9434893, 943 4893, 943-4893,
// (868) 943-4893, 868-943-4893, 1-868-943-4893, +1 868 943 4893.
// Returns { value, digits, ok }:
//   value  — formatted for storage (or the cleaned digits if we can't recognize it)
//   ok     — true only if it resolved to a real 7-digit local number
// Anything unrecognized is passed through rather than discarded, so no data is lost.
function normalizePhone(raw) {
  if (!raw || !String(raw).trim()) return { value: null, digits: "", ok: true, empty: true };
  const s = String(raw).trim();
  if (/[a-zA-Z]/.test(s)) return { value: s, digits: "", ok: false, reason: "contains letters" };

  let d = s.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1);   // +1 country code
  if (d.length === 10 && d.startsWith("868")) d = d.slice(3); // 868 area code

  if (d.length === 7) return { value: `${d.slice(0,3)}-${d.slice(3)}`, digits: d, ok: true };
  return { value: d || s, digits: d, ok: false, reason: `expected 7 digits, got ${d.length}` };
}

const MEMBER_COLUMNS = ["first_name","last_name","middle_name","email","phone","dob","sex","marital_status","interaction_type","city","address","join_date","anniversary","skill1","skill2","skill3","other_skills","instruments","notes","roles"];

// Accept friendly header aliases so app-exported CSVs (which use "Gender") still auto-map
const COLUMN_ALIASES = { sex: ["gender"], marital_status: ["marital"], instruments: ["instrument"] };

// For the non-blocking "suspicious email" warning: common valid TLD endings, plus
// well-known provider misspellings. Anything else is flagged (not blocked) as a likely typo.
const COMMON_TLDS = new Set(["com","org","net","edu","gov","mil","co","io","info","biz","me","tt","uk","ca","us","int","app","dev","online","live","email","name","pro","xyz","tv","site"]);
const DOMAIN_TYPOS = new Set(["gmial.com","gmai.com","gmal.com","gmil.com","gnail.com","gmail.co","gmaill.com","hotmial.com","hotmal.com","hotmai.com","hotmil.com","yahooo.com","yaho.com","yahoo.co","outlok.com","outook.com","iclould.com","icloud.co"]);

// Partial header hints so raw Google-Forms exports (long question headers) auto-map.
// A header matches a field if it *contains* one of the hint phrases (after normalizing).
const HEADER_HINTS = {
  first_name:["first name"], last_name:["last name"], middle_name:["middle name"],
  email:["email"], phone:["phone"], dob:["date of birth","birth"],
  sex:["gender","sex"], marital_status:["marital"], city:["city"],
  interaction_type:["interaction","in person","online","attend"],
  address:["home address"], join_date:["church join","join date"], anniversary:["anniversary"],
  skill1:["primary skill"], skill2:["secondary skill"], skill3:["tertiary skill"],
  other_skills:["additional skill","other skill"], instruments:["instrument"],
  notes:["comment","note"], roles:["roles","ministr"],
};
// Phrases that DISQUALIFY a header for a field (e.g. the Yes/No "do you play a musical
// instrument?" gate must not be mistaken for the actual instruments list).
const HEADER_AVOID = { instruments:["musical instrument"] };

function autoMapHeaders(headers) {
  const norm = h => String(h).toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
  const used = new Set();
  const mapping = {};
  MEMBER_COLUMNS.forEach(col => {
    const aliases = COLUMN_ALIASES[col] || [];
    // 1) exact field name / alias
    let match = headers.find(h => !used.has(h) && (h === col || norm(h) === col.replace(/_/g," ") || aliases.includes(norm(h))));
    // 2) partial hint match (skipping any disqualified headers)
    if (!match) {
      const hints = HEADER_HINTS[col] || [];
      const avoid = HEADER_AVOID[col] || [];
      match = headers.find(h => {
        if (used.has(h)) return false;
        const n = norm(h);
        if (avoid.some(a => n.includes(a))) return false;
        return hints.some(hint => n.includes(hint));
      });
    }
    if (match) { mapping[col] = match; used.add(match); }
  });
  return mapping;
}

// RFC 4180 CSV reader. Scans character-by-character so that a value like
//   "LP#126 Derrick Road Ext⏎Chase Village, Carapichaima"
// stays ONE field on ONE row. (The old version split on "\n" first, which chopped
// any address/notes field containing a line break into two bogus rows.)
// Handles: quoted fields, embedded newlines, embedded commas, escaped quotes (""),
// CRLF/LF/CR line endings, and a leading UTF-8 BOM.
function parseCSVRows(text) {
  const s = String(text).replace(/^﻿/, "");
  const rows = [];
  let row = [], field = "", inQuotes = false;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];

    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; }  // "" → literal quote
        else inQuotes = false;                         // closing quote
      } else {
        field += ch;                                   // newlines/commas kept verbatim
      }
      continue;
    }

    if (ch === '"') { inQuotes = true; }
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\r" || ch === "\n") {
      if (ch === "\r" && s[i + 1] === "\n") i++;       // CRLF counts once
      row.push(field); field = "";
      rows.push(row); row = [];
    }
    else { field += ch; }
  }
  row.push(field);
  rows.push(row);

  // Drop rows that are entirely blank (trailing newline at end of file, etc.)
  return rows.filter(r => r.some(v => v.trim() !== ""));
}

function parseCSV(text) {
  const rows = parseCSVRows(text);
  if (!rows.length) return [];
  const headers = rows[0].map(h => h.trim().toLowerCase().replace(/ /g, "_"));
  return rows.slice(1).map(values => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (values[i] ?? "").trim(); });
    return obj;
  });
}

async function logImportActivity(supabaseClient, action_type, description, user_id, user_name) {
  try {
    await supabaseClient.from("activity_log").insert({ action_type, description, user_id, user_name });
  } catch(e) { console.warn("Log failed:", e.message); }
}

export default function ImportPage({ profile, members = [], onImportComplete }) {
  const [activeTab, setActiveTab] = useState("members");

  // Roster check state
  const [rosterRows, setRosterRows] = useState([]);
  const [rosterFileName, setRosterFileName] = useState("");
  const [rosterError, setRosterError] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [rosterLabel, setRosterLabel] = useState("");
  const [rosterSaving, setRosterSaving] = useState(false);
  const [rosterSaved, setRosterSaved] = useState("");
  const [currentRoster, setCurrentRoster] = useState(null);   // { id, label, name_count, created_at }
  const [rosterHistory, setRosterHistory] = useState([]);

  // Load the roster that's currently published to the ushers.
  useEffect(() => {
    if (activeTab !== "roster") return;
    supabase.from("uncaptured_lists").select("*").order("created_at", { ascending: false })
      .then(({ data }) => {
        const all = data || [];
        setCurrentRoster(all.find(r => r.is_current) || null);
        setRosterHistory(all.filter(r => !r.is_current));
      });
  }, [activeTab, rosterSaved]);

  // Members import state
  const [memberFile, setMemberFile] = useState(null);
  const [memberRows, setMemberRows] = useState([]);
  const [memberHeaders, setMemberHeaders] = useState([]);
  const [memberMapping, setMemberMapping] = useState({});
  const [memberImporting, setMemberImporting] = useState(false);
  const [memberResult, setMemberResult] = useState(null);
  const [memberError, setMemberError] = useState("");
  const [memberSuccess, setMemberSuccess] = useState(false);
  const [memberReplaceMode, setMemberReplaceMode] = useState(false);
  const [memberValidation, setMemberValidation] = useState(null);
  const [dateOrderOverride, setDateOrderOverride] = useState(null); // null = use auto-detected
  const [properCase, setProperCase] = useState(true); // tidy name capitalisation on import
  const [sheetUrl, setSheetUrl] = useState("");
  const [sheetLoading, setSheetLoading] = useState(false);

  // Auto-detect DD/MM vs MM/DD from this file's date columns; the admin can override.
  const dateDetect = useMemo(() => {
    const cols = ["dob", "join_date", "anniversary"];
    const raw = [];
    memberRows.forEach(row => cols.forEach(c => { if (memberMapping[c]) raw.push(row[memberMapping[c]]); }));
    return detectDateOrder(raw);
  }, [memberRows, memberMapping]);
  const dateOrder = dateOrderOverride || dateDetect.order;

  // Name key that mirrors how import_members matches: first+last+middle, lowercased and
  // trimmed, blank middle = blank. Used to spot rows that already exist so they can be
  // hidden from the preview when Replace Mode is off (they'd be skipped on import anyway).
  const memberKey = (f, m, l) =>
    `${(f || "").trim().toLowerCase()}|${(m || "").trim().toLowerCase()}|${(l || "").trim().toLowerCase()}`;
  const existingKeys = useMemo(() => {
    const set = new Set();
    members.forEach(m => set.add(memberKey(m.first_name, m.middle_name, m.last_name)));
    return set;
  }, [members]);

  // Attendance import state
  const [attFile, setAttFile] = useState(null);
  const [attRows, setAttRows] = useState([]);
  const [attHeaders, setAttHeaders] = useState([]);
  const [attImporting, setAttImporting] = useState(false);
  const [attResult, setAttResult] = useState(null);
  const [attError, setAttError] = useState("");
  const [replaceMode, setReplaceMode] = useState(false);
  const [attValidation, setAttValidation] = useState(null);
  const [attSuccess, setAttSuccess] = useState(false);

  // --- MEMBER IMPORT ---
  function handleMemberFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setMemberFile(file);
    setMemberResult(null); setMemberError("");
    const reader = new FileReader();
    reader.onload = ev => {
      const rows = parseCSV(ev.target.result);
      if (!rows.length) return setMemberError("No data found in file.");
      setMemberRows(rows);
      const headers = Object.keys(rows[0]);
      setMemberHeaders(headers);
      setMemberMapping(autoMapHeaders(headers));
    };
    reader.readAsText(file);
  }

  async function fetchGoogleSheet() {
    if (!sheetUrl.trim()) return;
    setSheetLoading(true); setMemberError("");
    try {
      // Convert Google Sheets URL to CSV export URL
      let csvUrl = sheetUrl;
      if (sheetUrl.includes("docs.google.com/spreadsheets")) {
        const match = sheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
        if (!match) throw new Error("Could not parse Google Sheets URL");
        const id = match[1];
        csvUrl = `https://docs.google.com/spreadsheets/d/${id}/export?format=csv`;
      }
      // Fetch through our own /api/sheet proxy (server-side, no CORS). If that route
      // isn't deployed (e.g. a preview without functions), fall back to a direct fetch —
      // the old CORS-fragile path — so the feature still works where it can.
      const text = await fetchSheetCsv(csvUrl);
      const rows = parseCSV(text);
      if (!rows.length) throw new Error("No data found in sheet");
      setMemberRows(rows);
      const headers = Object.keys(rows[0]);
      setMemberHeaders(headers);
      setMemberMapping(autoMapHeaders(headers));
    } catch(e) { setMemberError(e.message); }
    finally { setSheetLoading(false); }
  }

  // Prefer the server proxy; fall back to a direct browser fetch only if the proxy
  // route is genuinely absent (404), not when Google itself refuses the sheet.
  async function fetchSheetCsv(csvUrl) {
    try {
      const res = await fetch(`/api/sheet?url=${encodeURIComponent(csvUrl)}`);
      if (res.ok) return await res.text();
      if (res.status !== 404) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Could not fetch the sheet.");
      }
      // 404 → proxy not deployed; fall through to a direct attempt.
    } catch (e) {
      if (e.message && !/failed to fetch|networkerror/i.test(e.message)) throw e;
      // network error reaching the proxy → try direct as a last resort
    }
    const direct = await fetch(csvUrl);
    if (!direct.ok) throw new Error("Could not fetch sheet. Make sure it is shared publicly (Anyone with link can view)");
    return await direct.text();
  }

  // Per-row validation, reused by both the validation summary and the import loop.
  // Returns { issues:[{field,msg}], warnings:[{field,msg}] } for one row.
  function memberRowChecks(row) {
    const today = new Date().toISOString().slice(0,10);
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const get = col => memberMapping[col] ? (row[memberMapping[col]] || "").trim() : "";
    const first = get("first_name"), last = get("last_name");
    const email = get("email"), phone = get("phone");
    const ph = normalizePhone(phone);
    const dob = convertDate(get("dob"), dateOrder);
    const anniversary = convertDate(get("anniversary"), dateOrder);
    const joinDate = convertDate(get("join_date"), dateOrder);
    const sex = get("sex"), marital = get("marital_status");
    const issues = [], warnings = [];

    if (!first) issues.push({ field: "first_name", msg: "Missing first name" });
    if (!last) issues.push({ field: "last_name", msg: "Missing last name" });
    if (email && !emailRe.test(email)) issues.push({ field: "email", msg: `Invalid email: "${email}"` });
    // Block only clearly broken phone input (letters, or too few digits to be a number).
    // Standardisation to the local format happens silently — no warning for a valid number
    // simply being reformatted.
    if (phone && !ph.ok && ph.digits.length < 7) {
      issues.push({ field: "phone", msg: `Invalid phone "${phone}": ${ph.reason}` });
    }
    if (get("dob")) {
      if (!dob || dob > today) issues.push({ field: "dob", msg: `Invalid or future date of birth: "${get("dob")}"` });
      else {
        const age = ageFromISO(dob);
        if (age > 120) issues.push({ field: "dob", msg: `Date of birth implies an age over 120: "${get("dob")}"` });
        else if (age < 2) warnings.push({ field: "dob", msg: `Date of birth "${get("dob")}" implies an age under 2. Check the year (a common "Include year" form slip)` });
      }
    }
    if (get("anniversary") && !anniversary) issues.push({ field: "anniversary", msg: `Invalid anniversary date: "${get("anniversary")}"` });
    if (get("join_date") && joinDate && joinDate > today) issues.push({ field: "join_date", msg: `Join date cannot be in the future` });
    if (sex && !["Male","Female"].includes(sex)) issues.push({ field: "sex", msg: `Sex must be "Male" or "Female", got "${sex}"` });
    if (marital && !["Single","Married"].includes(marital)) issues.push({ field: "marital_status", msg: `Marital status must be "Single" or "Married", got "${marital}"` });

    if (email && emailRe.test(email)) {
      const domain = email.split("@")[1].toLowerCase();
      const tld = domain.split(".").pop();
      if (!COMMON_TLDS.has(tld) || DOMAIN_TYPOS.has(domain)) warnings.push({ field: "email", msg: `Email "${email}" has an unusual domain. Check for a typo` });
    }
    if (anniversary && marital && marital !== "Married") warnings.push({ field: "anniversary", msg: `Marked "${marital}" but has a wedding anniversary. Should this be Married?` });
    return { issues, warnings };
  }

  function validateMemberRows() {
    const issues = [], warnings = [];
    let emptyRows = 0, existingSkipped = 0;
    const badRowNums = new Set();
    memberRows.forEach((row, i) => {
      const rowNum = i + 2;
      const get = col => memberMapping[col] ? (row[memberMapping[col]] || "").trim() : "";
      const first = get("first_name"), last = get("last_name"), middle = get("middle_name");
      if (!first && !last) { emptyRows++; return; } // fully blank row is silently skipped
      // With Replace Mode off, a row that already matches a member in the app is skipped
      // on import, so its issues/warnings are noise. The aim is only new people, so leave
      // these out of the preview entirely (just count them for the reconciliation line).
      if (!memberReplaceMode && existingKeys.has(memberKey(first, middle, last))) { existingSkipped++; return; }
      const name = `${first} ${last}`.trim() || "(no name)";
      const { issues: ri, warnings: rw } = memberRowChecks(row);
      if (ri.length) badRowNums.add(rowNum);
      ri.forEach(x => issues.push({ row: rowNum, name, ...x }));
      rw.forEach(x => warnings.push({ row: rowNum, name, ...x }));
    });
    const considered = memberRows.length - emptyRows - existingSkipped;
    const validRows = considered - badRowNums.size;
    setMemberValidation({ issues, warnings, validRows, badRows: badRowNums.size, emptyRows, existingSkipped, total: memberRows.length });
    return issues.length === 0;
  }

  async function importMembers() {
    setMemberImporting(true); setMemberError(""); setMemberResult(null);
    let errorSkipped = 0, nameSkipped = 0, emptySkipped = 0;
    const log = [];

    // 1) De-duplicate the sheet on first+middle+last, keeping the LAST occurrence
    //    (Google Forms appends newest responses at the bottom, so last = newest).
    const dedupeMap = new Map();
    memberRows.forEach((row, i) => {
      const get = col => memberMapping[col] ? (row[memberMapping[col]] || "").trim() : "";
      const first = get("first_name"); const last = get("last_name"); const middle = get("middle_name");
      const rowNum = i + 2;
      if (!first && !last) { emptySkipped++; log.push({ row: rowNum, name: "", outcome: "skipped", reason: "empty row" }); return; }
      if (!first || !last) { nameSkipped++; log.push({ row: rowNum, name: `${first} ${last}`.trim(), outcome: "skipped", reason: "missing first or last name" }); return; }
      const key = `${first}|${middle}|${last}`.toLowerCase().replace(/\s+/g, " ").trim();
      if (dedupeMap.has(key)) {
        const prev = dedupeMap.get(key);
        log.push({ row: prev.rowNum, name: `${prev.first} ${prev.last}`.trim(), outcome: "collapsed", reason: `duplicate of row ${rowNum} (newer kept)` });
      }
      dedupeMap.set(key, { row, rowNum, first, last, middle });
    });
    const importRows = Array.from(dedupeMap.values());
    const dedupedAway = log.filter(l => l.outcome === "collapsed").length;

    // 2) Validate each surviving row and normalise it. Bad rows are skipped here so the
    //    atomic import only ever receives clean data (one broken row can't abort it).
    const records = [];
    for (const { row, rowNum, first, last } of importRows) {
      const get = col => memberMapping[col] ? (row[memberMapping[col]] || "").trim() : "";
      const name = `${first} ${last}`.trim();
      const issues = memberRowChecks(row).issues;
      if (issues.length > 0) {
        errorSkipped++;
        log.push({ row: rowNum, name, outcome: "skipped", reason: issues.map(x => x.msg).join("; ") });
        continue;
      }
      const skills = [...new Set([get("skill1"), get("skill2"), get("skill3")].filter(Boolean))];
      const roles = [...new Set(get("roles").split(/[,;]/).map(r => r.trim()).filter(r => ROLES.includes(r)))];
      // Case names for STORAGE only. Matching/dedup still uses the lowercased originals,
      // so tidying capitalisation never changes who a row matches.
      const cn = v => properCase ? properCaseName(v) : v;
      records.push({
        row: rowNum, name: `${cn(first)} ${cn(last)}`.trim(),
        first_name: cn(first), last_name: cn(last),
        middle_name: cn(get("middle_name")) || "",
        email: get("email") || "",
        phone: normalizePhone(get("phone")).value || "",   // canonical "943-4893"
        dob: convertDate(get("dob"), dateOrder) || "",
        sex: get("sex") || "",
        marital_status: get("marital_status") || "",
        interaction_type: get("interaction_type") || "",
        address: get("address") || "",
        join_date: convertDate(get("join_date"), dateOrder) || "",
        anniversary: convertDate(get("anniversary"), dateOrder) || "",
        skill1: skills[0] || "", skill2: skills[1] || "", skill3: skills[2] || "",
        other_skills: get("other_skills") || "",
        instruments: get("instruments") || "",
        city: get("city") || "",
        notes: get("notes") || "",
        roles,
      });
    }

    // 3) One atomic call — every row commits, or none do and nothing is left half-saved.
    let added = 0, updated = 0, duplicates = 0;
    const addedList = [], updatedList = [], emailFlags = [];
    if (records.length) {
      const { data, error } = await supabase.rpc("import_members", {
        p_rows: records, p_replace: memberReplaceMode,
      });
      if (error) {
        setMemberImporting(false);
        setMemberError(/import_members/i.test(error.message) || /function .*does not exist/i.test(error.message)
          ? "The import needs a one-time setup: run supabase_migration_import_members.sql in the Supabase SQL editor, then try again."
          : `Import failed. Nothing was saved. ${error.message}`);
        return;
      }
      added = data.added || 0;
      updated = data.updated || 0;
      duplicates = data.skipped || 0;
      (data.results || []).forEach(r => {
        const entry = { row: Number(r.row), name: r.name, outcome: r.outcome, reason: r.reason || "" };
        log.push(entry);
        if (r.outcome === "added") addedList.push({ row: entry.row, name: entry.name });
        if (r.outcome === "updated") updatedList.push({ row: entry.row, name: entry.name });
        // Rows added but sharing an email with an existing member — surface for review.
        if (r.flag) emailFlags.push({ row: entry.row, name: entry.name, reason: entry.reason });
      });
    }

    log.sort((a, b) => a.row - b.row);
    const result = { added, updated, duplicates, deduped: dedupedAway, errorSkipped, nameSkipped, emptySkipped, addedList, updatedList, emailFlags, log, errors: [], replaced: memberReplaceMode };
    if (added > 0 || updated > 0) {
      const desc = memberReplaceMode
        ? `Imported members: ${added} added, ${updated} updated`
        : `Imported ${added} new members`;
      await logImportActivity(supabase, "member_added", desc, profile.id, profile.name);
    }
    setMemberResult(result);
    setMemberImporting(false);
    if (added > 0 || updated > 0) {
      setMemberSuccess(true);
      setTimeout(() => { setMemberSuccess(false); onImportComplete(); }, 3000);
    }
  }

  // Export a per-row log of the last import as a CSV report.
  function downloadImportReport() {
    if (!memberResult || !memberResult.log) return;
    const cell = v => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s; };
    const header = "row,name,outcome,detail";
    const body = memberResult.log.map(l => [l.row, l.name, l.outcome, l.reason].map(cell).join(",")).join("\n");
    const stamp = new Date().toISOString().slice(0,19).replace(/[:T]/g,"-");
    const mode = memberResult.replaced ? "replace" : "import";
    const csv = `# ${branding.reportLabel} ${mode} report ${new Date().toLocaleString()}\n# added:${memberResult.added} updated:${memberResult.updated} skipped(issues):${memberResult.errorSkipped} skipped(no name):${memberResult.nameSkipped} empty:${memberResult.emptySkipped} duplicates-in-sheet:${memberResult.deduped} db-errors:${memberResult.errors.length}\n${header}\n${body}\n`;
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `import-report-${stamp}.csv`; a.click();
  }

  // --- ROSTER CHECK (read-only reconciliation, writes nothing) ---
  function handleRosterFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setRosterFileName(file.name); setRosterError("");
    const reader = new FileReader();
    reader.onload = ev => {
      const rows = parseCSV(ev.target.result);
      if (!rows.length) { setRosterRows([]); return setRosterError("No data found in file."); }
      // Accept "first_name"/"last_name" or "FIRST NAME"/"LAST NAME" (→ first_name/last_name after parse)
      const keys = Object.keys(rows[0]);
      const fKey = keys.find(k => k.includes("first"));
      const lKey = keys.find(k => k.includes("last"));
      if (!fKey || !lKey) { setRosterRows([]); return setRosterError(`Could not find first/last name columns. Found: ${keys.join(", ")}`); }
      const cleaned = rows
        .map(r => ({ first: (r[fKey]||"").trim(), last: (r[lKey]||"").trim() }))
        .filter(r => r.first || r.last);
      setRosterRows(cleaned);
    };
    reader.readAsText(file);
  }

  // Compare the uploaded roster against the app's members.
  const rosterCheck = useMemo(() => {
    if (!rosterRows.length) return null;
    const pool = includeInactive ? members : members.filter(m => m.is_active !== false);

    // Index app members by normalized first|last, and by last name for near-match hints.
    const byKey = new Map();
    const byLast = new Map();
    pool.forEach(m => {
      const k = nameKey(m.first_name, m.last_name);
      if (!byKey.has(k)) byKey.set(k, []);
      byKey.get(k).push(m);
      const l = normName(m.last_name);
      if (!byLast.has(l)) byLast.set(l, []);
      byLast.get(l).push(m);
    });

    const matchedIds = new Set();
    const missingFromApp = [];   // on the printed roster, not in the app
    const dupesOnRoster = [];    // same name listed twice on the roster
    const seenRoster = new Set();

    rosterRows.forEach((r, i) => {
      const k = nameKey(r.first, r.last);
      if (seenRoster.has(k)) dupesOnRoster.push({ ...r, row: i + 2 });
      seenRoster.add(k);

      const hits = byKey.get(k);
      if (hits && hits.length) { hits.forEach(m => matchedIds.add(m.id)); return; }

      // No exact hit — offer same-last-name people as possible nickname/spelling matches.
      const near = (byLast.get(normName(r.last)) || []).slice(0, 3);
      missingFromApp.push({ ...r, row: i + 2, near });
    });

    const notOnRoster = pool.filter(m => !matchedIds.has(m.id));

    return {
      rosterCount: rosterRows.length,
      appCount: pool.length,
      matched: matchedIds.size,
      missingFromApp,
      notOnRoster,
      dupesOnRoster,
    };
  }, [rosterRows, members, includeInactive]);

  // Members with no profile photo (independent of the roster upload).
  const noPhoto = useMemo(() => {
    const pool = includeInactive ? members : members.filter(m => m.is_active !== false);
    return pool.filter(m => !m.photo_url || !String(m.photo_url).trim());
  }, [members, includeInactive]);

  // Publish the uploaded list to the ushers. The previous roster is demoted to
  // history (is_current=false) rather than deleted, so you can look back at it.
  async function publishRoster() {
    if (!rosterRows.length) return;
    const label = rosterLabel.trim() || rosterFileName.replace(/\.[^.]+$/, "") || new Date().toLocaleDateString();
    setRosterSaving(true); setRosterError(""); setRosterSaved("");
    try {
      // Demote whatever is current. Must happen before insert — a partial unique
      // index enforces that only one roster can be current at a time.
      const { error: demoteErr } = await supabase
        .from("uncaptured_lists").update({ is_current: false }).eq("is_current", true);
      if (demoteErr) throw demoteErr;

      const { data: roster, error: rErr } = await supabase.from("uncaptured_lists")
        .insert({ label, is_current: true, name_count: rosterRows.length, uploaded_by: profile.id })
        .select("id").single();
      if (rErr) throw rErr;

      const payload = rosterRows.map((r, i) => ({
        uncaptured_id: roster.id, first_name: r.first, last_name: r.last, position: i,
      }));
      // Chunk the insert — 300+ names in one request is fine, but this keeps
      // us well clear of any payload limit as the roster grows.
      for (let i = 0; i < payload.length; i += 200) {
        const { error: nErr } = await supabase.from("uncaptured_names").insert(payload.slice(i, i + 200));
        if (nErr) throw nErr;
      }

      await logImportActivity(supabase, "member_added",
        `Published roster "${label}" (${rosterRows.length} names) to ushers`, profile.id, profile.name);
      setRosterSaved(`"${label}" is now live for the ushers. ${rosterRows.length} names.`);
    } catch (e) {
      setRosterError(e.message || "Could not save the roster.");
    } finally {
      setRosterSaving(false);
    }
  }

  function downloadRosterReport() {
    if (!rosterCheck) return;
    const cell = v => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s; };
    const lines = ["section,first_name,last_name,detail"];
    rosterCheck.missingFromApp.forEach(r =>
      lines.push(["On roster - not in app", r.first, r.last, r.near.length ? `possible match: ${r.near.map(fullName).join(" / ")}` : ""].map(cell).join(",")));
    rosterCheck.notOnRoster.forEach(m =>
      lines.push(["In app - not on roster", m.first_name, m.last_name, m.is_active === false ? "inactive" : ""].map(cell).join(",")));
    noPhoto.forEach(m =>
      lines.push(["No photo", m.first_name, m.last_name, ""].map(cell).join(",")));
    const stamp = new Date().toISOString().slice(0,10);
    const csv = `# ${branding.shortName} roster check ${new Date().toLocaleString()}\n# roster:${rosterCheck.rosterCount} app:${rosterCheck.appCount} matched:${rosterCheck.matched} missing-from-app:${rosterCheck.missingFromApp.length} not-on-roster:${rosterCheck.notOnRoster.length} no-photo:${noPhoto.length}\n${lines.join("\n")}\n`;
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `roster-check-${stamp}.csv`;
    a.click();
  }

  // --- ATTENDANCE IMPORT ---
  function handleAttFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setAttFile(file); setAttResult(null); setAttError("");
    const reader = new FileReader();
    reader.onload = ev => {
      const rows = parseCSV(ev.target.result);
      if (!rows.length) return setAttError("No data found.");
      setAttRows(rows);
      setAttHeaders(Object.keys(rows[0]));
    };
    reader.readAsText(file);
  }

  function validateAttRows() {
    const issues = [];
    const warnings = [];
    const today = new Date().toISOString().slice(0,10);
    const seen = {}; // duplicate key -> first row number
    attRows.forEach((row, i) => {
      const rowNum = i + 2; // +2 because row 1 is headers
      const rawDate = (row.service_date || row.date || "").trim();
      const firstName = (row.first_name || "").trim();
      const lastName = (row.last_name || "").trim();
      const svcName = (row.service_name || row.service || "").trim();
      const convertedDate = convertDate(rawDate);
      if (!rawDate) {
        issues.push({ row: rowNum, field: "service_date", msg: "Missing service date" });
      } else if (!convertedDate || !/^\d{4}-\d{2}-\d{2}$/.test(convertedDate)) {
        issues.push({ row: rowNum, field: "service_date", msg: `Invalid date "${rawDate}". Use DD/MM/YYYY e.g. 15/05/2026` });
      } else if (convertedDate > today) {
        issues.push({ row: rowNum, field: "service_date", msg: `Date ${rawDate} is in the future` });
      } else if (convertedDate === today) {
        warnings.push({ row: rowNum, field: "service_date", msg: `Date ${rawDate} is today. Double-check this is the right service date` });
      }
      if (!firstName) issues.push({ row: rowNum, field: "first_name", msg: "Missing first name" });
      if (!lastName) issues.push({ row: rowNum, field: "last_name", msg: "Missing last name" });

      // Duplicate detection within the file (same person, same date, same service)
      if (convertedDate && firstName && lastName) {
        const key = [convertedDate, firstName.toLowerCase(), lastName.toLowerCase(), (svcName || "Imported Service").toLowerCase()].join("|");
        if (seen[key]) {
          warnings.push({ row: rowNum, field: "duplicate", msg: `Duplicate of row ${seen[key]}: ${firstName} ${lastName} on ${rawDate}${svcName ? ` (${svcName})` : ""}. It will only be imported once.` });
        } else {
          seen[key] = rowNum;
        }
      }
    });

    const emptyRows = attRows.filter(r => !r.service_date && !r.first_name && !r.last_name).length;
    const validRows = attRows.length - emptyRows;

    setAttValidation({ issues, warnings, validRows, emptyRows, total: attRows.length });
    return issues.length === 0;
  }

  async function importAttendance() {
    setAttImporting(true); setAttError(""); setAttResult(null);
    let added = 0, skipped = 0, duplicates = 0, errors = [];
    const unmatchedNames = []; // track names we couldn't find
    const serviceCache = {}; // cache service lookups
    const clearedServices = new Set(); // services cleared once in replace mode

    for (const row of attRows) {
      const svcName = (row.service_name || row.service || "").trim();
      const attRawDate = (row.service_date || row.date || "").trim();
      const svcDate = convertDate(attRawDate) || attRawDate;

      // Skip empty rows
      if (!svcDate || svcDate === "") { skipped++; continue; }

      const firstName = (row.first_name || "").trim();
      const lastName = (row.last_name || "").trim();
      const fullNameStr = (row.full_name || row.name || `${firstName} ${lastName}`).trim();

      if (!fullNameStr || fullNameStr.trim() === "") { skipped++; continue; }

      try {
        // Find or create service (use cache to avoid repeated lookups)
        const svcKey = `${svcDate}__${svcName || "Imported Service"}`;
        if (!serviceCache[svcKey]) {
          let { data: svcs } = await supabase.from("services")
            .select("id")
            .eq("service_date", svcDate)
            .eq("name", svcName || "Imported Service");
          if (!svcs?.length) {
            const { data: newSvc } = await supabase.from("services")
              .insert({ name: svcName || "Imported Service", service_date: svcDate, created_by: profile.id })
              .select("id").single();
            serviceCache[svcKey] = newSvc?.id;
          } else {
            serviceCache[svcKey] = svcs[0].id;
          }
        }
        const serviceId = serviceCache[svcKey];
        if (!serviceId) { errors.push(`Could not create service for date ${svcDate}`); continue; }

        // In replace mode, clear existing attendance for this service once
        if (replaceMode && !clearedServices.has(serviceId)) {
          await supabase.from("attendance").delete().eq("service_id", serviceId);
          clearedServices.add(serviceId);
        }

        // Find member by first + last name
        const nameParts = fullNameStr.trim().split(/\s+/);
        const fn = nameParts[0];
        const ln = nameParts[nameParts.length - 1];
        const { data: memberMatches } = await supabase.from("members")
          .select("id, first_name, last_name")
          .ilike("first_name", fn)
          .ilike("last_name", ln)
          .limit(1);

        if (!memberMatches?.length) {
          // Track unmatched names with context
          unmatchedNames.push({
            name: fullNameStr,
            date: svcDate,
            service: svcName || "Imported Service"
          });
          skipped++;
          continue;
        }

        const memberId = memberMatches[0].id;

        // Check duplicate before inserting
        const { data: existing } = await supabase.from("attendance")
          .select("id")
          .eq("service_id", serviceId)
          .eq("member_id", memberId)
          .maybeSingle();

        if (!existing) {
          await supabase.from("attendance").insert({
            service_id: serviceId,
            member_id: memberId,
            marked_by: profile.id
          });
          added++;
        } else {
          duplicates++;
        }
      } catch(e) {
        errors.push(`Row (${fullNameStr}): ${e.message}`);
      }
    }
    const result = { added, skipped, duplicates, errors: errors.slice(0, 10), unmatchedNames, replaced: replaceMode && clearedServices.size > 0, clearedCount: clearedServices.size };
    try {
      // Log the attendance import
      if (added > 0) {
        const desc = replaceMode
          ? `Replaced attendance: ${added} records across ${clearedServices.size} service(s)`
          : `Imported ${added} attendance records`;
        await logImportActivity(supabase, "attendance_marked", desc, profile.id, profile.name);
      }
      setAttResult(result);
      if (added > 0) {
        setAttSuccess(true);
        // Wait 3 seconds so the toast is visible before the page reloads
        setTimeout(() => {
          setAttSuccess(false);
          onImportComplete();
        }, 3000);
      }
    } catch (e) {
      setAttError(e.message || "Something went wrong finishing the import.");
      setAttResult(result);
    } finally {
      setAttImporting(false);
    }
  }

  return (
    <div className="fade-in">
      <div style={{fontFamily:"'Inter',sans-serif", color:"var(--text)", fontSize:14, letterSpacing:0.5, fontWeight:700, marginBottom:20}}>DATA IMPORT</div>

      {/* Tabs */}
      <div style={{display:"flex", gap:4, marginBottom:24, borderBottom:"1.5px solid var(--border-navy)"}}>
        {[["members","Import Members"],["attendance","Import Attendance"],["roster","Roster Check"]].map(([key,label])=>(
          <button key={key} onClick={()=>setActiveTab(key)} style={{
            background:"none", border:"none", cursor:"pointer", fontFamily:"'Inter',sans-serif",
            fontSize:14, fontWeight:600, padding:"10px 18px",
            color:activeTab===key?"#2a5357":"#8a96b8",
            borderBottom:activeTab===key?"2px solid var(--brand)":"2px solid transparent",
            transition:"all 0.15s",
          }}>{label}</button>
        ))}
      </div>

      {/* MEMBERS IMPORT */}
      {activeTab === "members" && (
        <div>
          {/* Google Sheets */}
          {/* Member Replace Mode */}
          <div className="card" style={{padding:16, marginBottom:16, background: memberReplaceMode?"#fff8f0":"var(--surface)", border:`1.5px solid ${memberReplaceMode?"#f5a050":"#e4e9f5"}`}}>
            <div style={{display:"flex", alignItems:"center", justifyContent:"space-between"}}>
              <div>
                <div style={{fontWeight:700, fontSize:14, color: memberReplaceMode?"#c06010":"#2a3560", marginBottom:3}}>
                  {memberReplaceMode ? "Replace Mode: ON" : "Replace Mode"}
                </div>
                <div style={{fontSize:12, color:"var(--text-faint)", lineHeight:1.7}}>
                  {memberReplaceMode
                    ? "Existing members with matching names will be updated. New members will be added."
                    : "Off. Duplicate names will be skipped. Turn on to update existing members."}
                </div>
              </div>
              <button onClick={()=>setMemberReplaceMode(r=>!r)} style={{
                flexShrink:0, marginLeft:16,
                background: memberReplaceMode?"#e07830":"#f4f6fa",
                color: memberReplaceMode?"#fff":"#5a6a8a",
                border:`1.5px solid ${memberReplaceMode?"#e07830":"#d0d7e8"}`,
                borderRadius:20, padding:"6px 16px", fontSize:12, fontWeight:700, cursor:"pointer", transition:"all 0.2s"
              }}>{memberReplaceMode ? "ON" : "OFF"}</button>
            </div>
            {memberReplaceMode && (
              <div style={{marginTop:10, background:"#fff3e0", borderRadius:8, padding:"8px 12px", fontSize:12, color:"#a05010"}}>
                <strong>Replace Mode:</strong> Members matched by first + last name will have their data overwritten. New members will be added normally.
              </div>
            )}
          </div>

          <div className="card" style={{padding:20, marginBottom:16}}>
            <div style={{fontWeight:700, fontSize:14, color:"var(--text)", marginBottom:4}}>Import from Google Sheets</div>
            <div style={{fontSize:12, color:"var(--text-faint)", marginBottom:12, lineHeight:1.7}}>
              Share your Google Sheet publicly (File → Share → Anyone with link → Viewer), then paste the URL below.
              Your sheet should have column headers matching: <code style={{background:"var(--panel)",padding:"1px 5px",borderRadius:4,fontSize:11}}>first_name, last_name, email, phone, dob, sex, marital_status</code> etc.
            </div>
            <div style={{display:"flex", gap:8}}>
              <input placeholder="https://docs.google.com/spreadsheets/d/…" value={sheetUrl} onChange={e=>setSheetUrl(e.target.value)} style={{flex:1}} />
              <button className="btn-primary" onClick={fetchGoogleSheet} disabled={sheetLoading}>{sheetLoading?"Loading…":"Load Sheet"}</button>
            </div>
          </div>

          {/* CSV Upload */}
          <div className="card" style={{padding:20, marginBottom:16}}>
            <div style={{fontWeight:700, fontSize:14, color:"var(--text)", marginBottom:4}}>Import from CSV / Excel</div>
            <div style={{fontSize:12, color:"var(--text-faint)", marginBottom:12}}>Export your spreadsheet as CSV and upload it here. First row must be column headers.</div>
            <input type="file" accept=".csv,.txt" onChange={handleMemberFile} style={{fontSize:12}} />
          </div>

          {memberError && <div className="error-msg" style={{marginBottom:12}}>{memberError}</div>}

          {/* Column mapping */}
          {memberRows.length > 0 && (
            <div className="card" style={{padding:20, marginBottom:16}}>
              <div style={{fontWeight:700, fontSize:14, color:"var(--text)", marginBottom:4}}>Map Columns</div>
              <div style={{fontSize:12, color:"var(--text-faint)", marginBottom:12}}>{memberRows.length} rows found. Match your spreadsheet columns to the app fields.</div>
              <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:10}}>
                {MEMBER_COLUMNS.map(col => (
                  <div key={col}>
                    <label className="field-label">{col.replace(/_/g," ")}{["first_name","last_name"].includes(col)?" *":""}</label>
                    <select value={memberMapping[col]||""} onChange={e=>setMemberMapping(prev=>({...prev,[col]:e.target.value}))}>
                      <option value="">(skip this field)</option>
                      {memberHeaders.map(h=><option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              {/* Date format — auto-detected, overridable. Wrong order silently swaps
                  day and month, so make it explicit before importing. */}
              <div style={{marginTop:16, background:"var(--panel)", border:"1px solid var(--border-navy)", borderRadius:8, padding:"11px 14px", display:"flex", flexWrap:"wrap", alignItems:"center", gap:10}}>
                <span style={{fontSize:12, fontWeight:700, color:"var(--text-2)"}}>Dates in this file are</span>
                <select value={dateOrder} onChange={e=>setDateOrderOverride(e.target.value)} style={{fontSize:12, padding:"5px 8px", width:"auto"}}>
                  <option value="DMY">DD/MM/YYYY (day first)</option>
                  <option value="MDY">MM/DD/YYYY (month first, US)</option>
                </select>
                <span style={{fontSize:11, color: dateDetect.confident ? "#2a8a50" : "#c06010"}}>
                  {dateDetect.confident
                    ? `Auto-detected from the data${dateOrderOverride ? " (overridden)" : ""}.`
                    : "Couldn't tell from the data. ISO yyyy-mm-dd values are always safe. Check this is right."}
                </span>
                <span style={{fontSize:11, color:"var(--text-faint)", width:"100%"}}>
                  e.g. <code>04/03/2020</code> → {convertDate("04/03/2020", dateOrder)}
                </span>
              </div>

              {/* Proper-case names on import (previewed in Validate Data). */}
              <div style={{marginTop:10, background:"var(--panel)", border:"1px solid var(--border-navy)", borderRadius:8, padding:"11px 14px"}}>
                <label style={{display:"flex", alignItems:"center", gap:9, cursor:"pointer", fontSize:12, color:"var(--text-2)"}}>
                  <input type="checkbox" checked={properCase} onChange={e=>setProperCase(e.target.checked)} />
                  <span><strong>Tidy name capitalisation</strong>: save <code>john smith</code> or <code>JOHN SMITH</code> as <code>John Smith</code>. Handles O'Brien, Ali-Mohammed, McDonald.</span>
                </label>
              </div>

              <div style={{marginTop:16}}>
                {/* Validate button */}
                <div style={{display:"flex", gap:8, marginBottom:12}}>
                  <button className="btn-ghost" style={{fontSize:12}} onClick={validateMemberRows}>Validate Data</button>
                </div>

                {/* Validation results */}
                {memberValidation && (
                  <div style={{marginBottom:14, background: memberValidation.issues.length?"#fff8f0":"#f0fff8", border:`1.5px solid ${memberValidation.issues.length?"#f5d088":"#b0e8c8"}`, borderRadius:8, padding:"12px 14px"}}>
                    <div style={{fontWeight:700, fontSize:12, color:"var(--text)", marginBottom:6}}>
                      {memberValidation.issues.length === 0 ? "Data looks good!" : `${memberValidation.issues.length} issue${memberValidation.issues.length!==1?"s":""} across ${memberValidation.badRows} row${memberValidation.badRows!==1?"s":""}`}
                    </div>
                    <div style={{fontSize:12, color:"var(--text-muted)", marginBottom: memberValidation.issues.length?8:0}}>
                      {memberValidation.validRows} valid row{memberValidation.validRows!==1?"s":""} will import
                      {memberValidation.badRows > 0 && ` · ${memberValidation.badRows} row${memberValidation.badRows!==1?"s":""} with issues will be skipped`}
                      {memberValidation.existingSkipped > 0 && ` · ${memberValidation.existingSkipped} already in the app (not shown)`}
                      {memberValidation.emptyRows > 0 && ` · ${memberValidation.emptyRows} empty skipped`}
                    </div>
                    {memberValidation.issues.length > 0 && (
                      <div style={{maxHeight:240, overflowY:"auto", paddingRight:4}}>
                        {memberValidation.issues.map((issue,i)=>(
                          <div key={i} style={{fontSize:12, color:"#c06010", marginTop:3}}>
                            <strong>Row {issue.row}</strong> · {issue.name} · {issue.field}: {issue.msg}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {memberValidation && memberValidation.warnings && memberValidation.warnings.length > 0 && (
                  <div style={{marginBottom:14, background:"#fff8ec", border:"1.5px solid #f0cf8a", borderRadius:8, padding:"12px 14px"}}>
                    <div style={{fontWeight:700, fontSize:12, color:"#8a5a10", marginBottom:6}}>
                      {memberValidation.warnings.length} warning{memberValidation.warnings.length!==1?"s":""} (these won't block the import)
                    </div>
                    <div style={{maxHeight:200, overflowY:"auto", paddingRight:4}}>
                      {memberValidation.warnings.map((w,i)=>(
                        <div key={i} style={{fontSize:12, color:"#a06a10", marginTop:3}}><strong>Row {w.row}</strong> · {w.name} · {w.msg}</div>
                      ))}
                    </div>
                  </div>
                )}


                {/* Count the rows that will ACTUALLY import (validated), not every parsed
                    row, otherwise the button says "18" while the summary says "17 valid". */}
                <button className="btn-primary" onClick={importMembers} disabled={memberImporting}
                  style={{background: memberReplaceMode?"#e07830":""}}>
                  {(() => {
                    const n = memberValidation ? memberValidation.validRows : memberRows.length;
                    return memberImporting
                      ? `${memberReplaceMode?"Updating":"Importing"}… (${n} row${n!==1?"s":""})`
                      : `${memberReplaceMode?"Update / Add":"Import"} ${n} Member${n!==1?"s":""}`;
                  })()}
                </button>
              </div>
            </div>
          )}

          {memberSuccess && (
            <div style={{
              position:"fixed", top:24, left:"50%", transform:"translateX(-50%)",
              background:"#2a8a50", color:"#fff", borderRadius:12,
              padding:"14px 28px", fontSize:14, fontWeight:700,
              boxShadow:"0 4px 24px #0000002a", zIndex:999,
              display:"flex", alignItems:"center", gap:10,
              animation:"fadeIn 0.3s ease"
            }}>
              <span style={{display:"flex"}}><CheckCircle2 size={20} color="#4caf82" /></span>
              Import successful! {memberResult?.added} member{memberResult?.added!==1?"s":""} added.
            </div>
          )}

          {memberResult && (
            <div style={{background: memberResult.errors.length?"#fff8f0":"#f0fff8", border:`1.5px solid ${memberResult.errors.length?"#f5d0a0":"#b0e8c8"}`, borderRadius:10, padding:"14px 16px"}}>
              <div style={{fontWeight:700, fontSize:14, color:"var(--text)", marginBottom:8, display:"flex", alignItems:"center", gap:8, flexWrap:"wrap"}}>
                {memberResult.replaced ? "Update Complete" : "Import Complete"}
                {memberResult.replaced && <span style={{fontSize:10, fontWeight:700, background:"#fbe4d0", color:"#b5581a", padding:"2px 9px", borderRadius:20, textTransform:"uppercase", letterSpacing:0.4}}>Replace mode: existing records overwritten</span>}
              </div>
              {memberResult.added > 0 && (
                <div style={{fontSize:14, color:"#4caf82", marginBottom:4}}>{memberResult.added} new member{memberResult.added!==1?"s":""} added</div>
              )}
              {memberResult.updated > 0 && (
                <div style={{fontSize:14, color:"#e07830", marginBottom:4}}>{memberResult.updated} existing member{memberResult.updated!==1?"s":""} updated</div>
              )}
              {((memberResult.addedList && memberResult.addedList.length > 0) || (memberResult.updatedList && memberResult.updatedList.length > 0)) && (
                <div style={{marginTop:8, marginBottom:6, maxHeight:220, overflowY:"auto", border:"1px solid var(--border-navy)", borderRadius:8, padding:"8px 10px", background:"var(--surface)"}}>
                  <div style={{fontSize:11, fontWeight:700, color:"var(--text-muted)", textTransform:"uppercase", letterSpacing:0.4, marginBottom:6}}>
                    {memberResult.replaced ? "Imported / updated records" : "Imported records"}
                  </div>
                  {(memberResult.addedList||[]).map((m,i)=>(
                    <div key={"a"+i} style={{fontSize:12, color:"var(--text-navy)", marginTop:2}}>
                      <strong>Row {m.row}</strong> · {m.name} <span style={{color:"#2a8a50", fontWeight:600}}>added</span>
                    </div>
                  ))}
                  {(memberResult.updatedList||[]).map((m,i)=>(
                    <div key={"u"+i} style={{fontSize:12, color:"var(--text-navy)", marginTop:2}}>
                      <strong>Row {m.row}</strong> · {m.name} <span style={{color:"#e07830", fontWeight:600}}>updated</span>
                    </div>
                  ))}
                </div>
              )}
              {/* People already captured (matched by name, Replace mode off) are intentionally
                  NOT listed here, they add nothing for the admin to act on. They're still in
                  the downloadable report if a full record is ever needed. */}
              {/* People added who share an email with someone already in the app: could be
                  a corrected name or a family sharing one address. Added, but flagged. */}
              {memberResult.emailFlags && memberResult.emailFlags.length > 0 && (
                <div style={{marginTop:8, marginBottom:6, background:"#f0f6ff", border:"1.5px solid #b8d0f0", borderRadius:8, padding:"10px 12px"}}>
                  <div style={{fontSize:12, fontWeight:700, color:"#2a5aa0", marginBottom:5}}>
                    {memberResult.emailFlags.length} added but sharing an email, worth a check
                  </div>
                  <div style={{fontSize:11, color:"#4a6a90", marginBottom:6, lineHeight:1.5}}>
                    These were added as new people, but their email is already on another member. If it's the same person (a corrected name), delete one; if it's a family sharing an address, leave both.
                  </div>
                  <div style={{maxHeight:160, overflowY:"auto"}}>
                    {memberResult.emailFlags.map((f,i)=>(
                      <div key={"f"+i} style={{fontSize:12, color:"#3a6ab0", marginTop:2}}><strong>Row {f.row}</strong> · {f.reason}</div>
                    ))}
                  </div>
                </div>
              )}
              {memberResult.errorSkipped > 0 && (
                <div style={{fontSize:12, color:"#c06010", marginBottom:4}}>{memberResult.errorSkipped} row{memberResult.errorSkipped!==1?"s":""} skipped due to validation issues (see Validate Data for details)</div>
              )}
              {memberResult.nameSkipped > 0 && (
                <div style={{fontSize:12, color:"#c06010", marginBottom:4}}>{memberResult.nameSkipped} row{memberResult.nameSkipped!==1?"s":""} skipped (missing first or last name)</div>
              )}
              {memberResult.emptySkipped > 0 && (
                <div style={{fontSize:12, color:"var(--text-faint)", marginBottom:4}}>{memberResult.emptySkipped} empty row{memberResult.emptySkipped!==1?"s":""} skipped</div>
              )}
              {memberResult.deduped > 0 && (
                <div style={{fontSize:12, color:"var(--text-faint)", marginBottom:4}}>{memberResult.deduped} duplicate row{memberResult.deduped!==1?"s":""} within the sheet collapsed to the newest entry each</div>
              )}
              {memberResult.errors.map((e,i)=><div key={i} style={{fontSize:12,color:"#e05050",marginTop:4}}>{e}</div>)}
              {memberResult.log && memberResult.log.length > 0 && (
                <button className="btn-ghost" style={{fontSize:12, marginTop:10}} onClick={downloadImportReport}>Download import report</button>
              )}
            </div>
          )}

          {/* Download template */}
          <div style={{marginTop:16}}>
            <button className="btn-ghost" style={{fontSize:12}} onClick={()=>{
              const cell = v => /[",\n]/.test(v) ? `"${v.replace(/"/g,'""')}"` : v;
              const sample = {
                first_name:"John", last_name:"Smith", middle_name:"Paul",
                email:"john@email.com", phone:"555-1234", dob:"15/06/1990",
                sex:"Male", marital_status:"Married", city:"Chaguanas", address:"123 Main St",
                join_date:"01/01/2020", anniversary:"", skill1:"Accounting", skill2:"Singing",
                skill3:"", other_skills:"Beekeeping", instruments:"Acoustic Guitar, Drums",
                notes:"Active member", roles:"Usher",
              };
              const headers = MEMBER_COLUMNS.join(",");
              const example = MEMBER_COLUMNS.map(c => cell(sample[c] || "")).join(",");
              const csv = headers + "\n" + example;
              const blob = new Blob([csv],{type:"text/csv"});
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a"); a.href=url; a.download="members-template.csv"; a.click();
            }}>Download CSV Template</button>
          </div>
        </div>
      )}

      {/* ROSTER CHECK — read-only reconciliation + photo gaps */}
      {activeTab === "roster" && (
        <div>
          <div className="card" style={{padding:20, marginBottom:16}}>
            <div style={{fontWeight:700, fontSize:14, color:"var(--text)", marginBottom:4}}>Check the Ushers' Roster</div>
            <div style={{fontSize:12, color:"var(--text-faint)", marginBottom:12, lineHeight:1.7}}>
              Upload the printed attendance list as a CSV (columns <code style={{background:"var(--panel)",padding:"1px 5px",borderRadius:4,fontSize:11}}>FIRST NAME, LAST NAME</code>).
              Nothing is written to the database. This only compares the list against your members and shows the gaps.
              In Excel: <strong>File → Save As → CSV</strong>.
            </div>
            <input type="file" accept=".csv,.txt" onChange={handleRosterFile} style={{fontSize:12}} />
            {rosterFileName && <div style={{fontSize:12, color:"var(--text-muted)", marginTop:8}}>Loaded: <strong>{rosterFileName}</strong>, {rosterRows.length} names</div>}
          </div>

          {/* What the ushers can see right now */}
          <div className="card" style={{padding:"14px 16px", marginBottom:16, background:"#f7fbfa", border:"1.5px solid #b8ddd8"}}>
            <div style={{fontSize:12, fontWeight:700, color:"#1f4e4a", marginBottom:3}}>Live for ushers</div>
            <div style={{fontSize:12, color:"#5a7a76", lineHeight:1.7}}>
              {currentRoster
                ? <>Ushers currently see <strong>{currentRoster.label}</strong>, {currentRoster.name_count} names, uploaded {new Date(currentRoster.created_at).toLocaleDateString()}.</>
                : <>No roster published yet. Upload one below and the ushers' Uncaptured Members tab will be empty until you do.</>}
            </div>
            {rosterHistory.length > 0 && (
              <div style={{fontSize:11, color:"var(--text-faint)", marginTop:6}}>
                Previous: {rosterHistory.slice(0,4).map(r=>r.label).join(" · ")}{rosterHistory.length>4?` · +${rosterHistory.length-4} more`:""}
              </div>
            )}
          </div>

          {/* Publish to ushers */}
          {rosterRows.length > 0 && (
            <div className="card" style={{padding:20, marginBottom:16}}>
              <div style={{fontWeight:700, fontSize:14, color:"var(--text)", marginBottom:4}}>Publish this list to the ushers</div>
              <div style={{fontSize:12, color:"var(--text-faint)", marginBottom:12, lineHeight:1.7}}>
                Saves the list into the app so ushers can open it on their phones. It replaces the current list. The old one is kept as history, not deleted.
              </div>
              <div style={{display:"flex", gap:8}}>
                <input placeholder="Label, e.g. July 2026" value={rosterLabel}
                  onChange={e=>setRosterLabel(e.target.value)} style={{flex:1}} />
                <button className="btn-primary" onClick={publishRoster} disabled={rosterSaving}>
                  {rosterSaving ? "Publishing…" : `Publish ${rosterRows.length} Names`}
                </button>
              </div>
              {rosterSaved && (
                <div style={{marginTop:10, display:"flex", alignItems:"center", gap:8, background:"#f0fff8", border:"1.5px solid #b0e8c8", borderRadius:8, padding:"9px 12px", fontSize:12, color:"#2a8a50", fontWeight:600}}>
                  <CheckCircle2 size={16} color="#4caf82" /> {rosterSaved}
                </div>
              )}
            </div>
          )}

          {rosterError && <div className="error-msg" style={{marginBottom:12}}>{rosterError}</div>}

          <div className="card" style={{padding:"12px 16px", marginBottom:16, display:"flex", alignItems:"center", justifyContent:"space-between"}}>
            <div style={{fontSize:12, color:"var(--text-muted)"}}>Include inactive members in the comparison</div>
            <button onClick={()=>setIncludeInactive(v=>!v)} style={{
              background: includeInactive?"#2a5357":"#f4f6fa", color: includeInactive?"#fff":"#5a6a8a",
              border:`1.5px solid ${includeInactive?"#2a5357":"#d0d7e8"}`, borderRadius:20,
              padding:"6px 16px", fontSize:12, fontWeight:700, cursor:"pointer"
            }}>{includeInactive ? "ON" : "OFF"}</button>
          </div>

          {/* Summary tiles */}
          {rosterCheck && (
            <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))", gap:12, marginBottom:16}}>
              {[
                ["On the roster", rosterCheck.rosterCount, "#2a3560"],
                ["In the app", rosterCheck.appCount, "#2a3560"],
                ["Matched", rosterCheck.matched, "#2a8a50"],
                ["Missing from app", rosterCheck.missingFromApp.length, "#c06010"],
                ["Not on roster", rosterCheck.notOnRoster.length, "#8a5a10"],
              ].map(([label, val, color]) => (
                <div key={label} className="card" style={{padding:"14px 16px"}}>
                  <div style={{fontSize:24, fontWeight:800, color}}>{val}</div>
                  <div style={{fontSize:11, color:"var(--text-faint)", fontWeight:600, textTransform:"uppercase", letterSpacing:0.4, marginTop:2}}>{label}</div>
                </div>
              ))}
            </div>
          )}

          {/* On the roster, not in the app */}
          {rosterCheck && rosterCheck.missingFromApp.length > 0 && (
            <div className="card" style={{padding:20, marginBottom:16, border:"1.5px solid #f5d088"}}>
              <div style={{display:"flex", alignItems:"center", gap:8, marginBottom:4}}>
                <UserX size={17} color="#c06010" />
                <div style={{fontWeight:700, fontSize:14, color:"var(--text)"}}>
                  {rosterCheck.missingFromApp.length} on the roster, not in the app
                </div>
              </div>
              <div style={{fontSize:12, color:"var(--text-faint)", marginBottom:12, lineHeight:1.7}}>
                These names are on the ushers' sheet but have no member record. Add them via Import Members, or check the suggested matches below. They may be spelling differences or nicknames.
              </div>
              <div style={{maxHeight:340, overflowY:"auto"}}>
                {rosterCheck.missingFromApp.map((r,i)=>(
                  <div key={i} style={{display:"flex", justifyContent:"space-between", gap:12, alignItems:"center", padding:"7px 0", borderTop: i?"1px solid var(--panel)":"none"}}>
                    <div style={{fontSize:13, color:"var(--text-navy)", fontWeight:600}}>{r.first} {r.last}</div>
                    {r.near.length > 0 && (
                      <div style={{fontSize:11, color:"#a06a10", textAlign:"right"}}>
                        possible match: {r.near.map(m=>fullName(m)).join(" · ")}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* In the app, not on the roster */}
          {rosterCheck && rosterCheck.notOnRoster.length > 0 && (
            <div className="card" style={{padding:20, marginBottom:16}}>
              <div style={{display:"flex", alignItems:"center", gap:8, marginBottom:4}}>
                <UserCheck size={17} color="#8a5a10" />
                <div style={{fontWeight:700, fontSize:14, color:"var(--text)"}}>
                  {rosterCheck.notOnRoster.length} in the app, not on the roster
                </div>
              </div>
              <div style={{fontSize:12, color:"var(--text-faint)", marginBottom:12, lineHeight:1.7}}>
                These members exist in the app but the ushers can't mark them present. Add them to next month's printed sheet.
              </div>
              <div style={{maxHeight:340, overflowY:"auto"}}>
                {rosterCheck.notOnRoster.map(m=>(
                  <div key={m.id} style={{display:"flex", alignItems:"center", gap:10, padding:"6px 0"}}>
                    <Avatar member={m} size={30} />
                    <div style={{fontSize:13, color:"var(--text-navy)", fontWeight:600}}>{fullName(m)}</div>
                    {m.is_active === false && <span style={{fontSize:10, fontWeight:700, background:"var(--panel)", color:"var(--text-muted-navy)", padding:"2px 8px", borderRadius:20}}>INACTIVE</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Duplicates on the printed sheet */}
          {rosterCheck && rosterCheck.dupesOnRoster.length > 0 && (
            <div className="card" style={{padding:"14px 16px", marginBottom:16, background:"#fff8ec", border:"1.5px solid #f0cf8a"}}>
              <div style={{fontWeight:700, fontSize:12, color:"#8a5a10", marginBottom:6}}>
                {rosterCheck.dupesOnRoster.length} name{rosterCheck.dupesOnRoster.length!==1?"s":""} listed more than once on the roster
              </div>
              {rosterCheck.dupesOnRoster.map((r,i)=>(
                <div key={i} style={{fontSize:12, color:"#a06a10", marginTop:2}}>Row {r.row} · {r.first} {r.last}</div>
              ))}
            </div>
          )}

          {/* Members with no photo — always shown, no upload needed */}
          <div className="card" style={{padding:20, marginBottom:16}}>
            <div style={{display:"flex", alignItems:"center", gap:8, marginBottom:4}}>
              <Camera size={17} color="#2a5357" />
              <div style={{fontWeight:700, fontSize:14, color:"var(--text)"}}>
                {noPhoto.length} member{noPhoto.length!==1?"s":""} without a photo
              </div>
            </div>
            <div style={{fontSize:12, color:"var(--text-faint)", lineHeight:1.7}}>
              {members.length > 0
                ? `${members.length - noPhoto.length} of ${members.length} members have a profile photo. The Uncaptured Members tab lists who's still missing one; use the Photos tab to request them.`
                : "No members loaded."}
            </div>
          </div>

          {rosterCheck && (
            <button className="btn-ghost" style={{fontSize:12}} onClick={downloadRosterReport}>Download roster check report</button>
          )}
        </div>
      )}

      {/* ATTENDANCE IMPORT */}
      {activeTab === "attendance" && (
        <div>
          {/* Replace mode toggle */}
          <div className="card" style={{padding:16, marginBottom:16, background: replaceMode?"#fff8f0":"var(--surface)", border:`1.5px solid ${replaceMode?"#f5a050":"#e4e9f5"}`}}>
            <div style={{display:"flex", alignItems:"center", justifyContent:"space-between"}}>
              <div>
                <div style={{fontWeight:700, fontSize:14, color: replaceMode?"#c06010":"#2a3560", marginBottom:3}}>
                  {replaceMode ? "Replace Mode: ON" : "Replace Mode"}
                </div>
                <div style={{fontSize:12, color:"var(--text-faint)", lineHeight:1.7}}>
                  {replaceMode
                    ? "Existing attendance for each service in your file will be cleared before importing. Use this to correct a previous import."
                    : "Turn on to replace existing attendance records. Leave off to add records to existing ones."}
                </div>
              </div>
              <button
                onClick={()=>setReplaceMode(r=>!r)}
                style={{
                  flexShrink:0, marginLeft:16,
                  background: replaceMode?"#e07830":"#f4f6fa",
                  color: replaceMode?"#fff":"#5a6a8a",
                  border:`1.5px solid ${replaceMode?"#e07830":"#d0d7e8"}`,
                  borderRadius:20, padding:"6px 16px",
                  fontSize:12, fontWeight:700, cursor:"pointer",
                  transition:"all 0.2s"
                }}>
                {replaceMode ? "ON" : "OFF"}
              </button>
            </div>
            {replaceMode && (
              <div style={{marginTop:10, background:"#fff3e0", borderRadius:8, padding:"8px 12px", fontSize:12, color:"#a05010"}}>
                <strong>Warning:</strong> This will permanently delete existing attendance records for any service date found in your file before re-importing. This cannot be undone.
              </div>
            )}
          </div>

          <div className="card" style={{padding:20, marginBottom:16}}>
            <div style={{fontWeight:700, fontSize:14, color:"var(--text)", marginBottom:4}}>Import Historical Attendance</div>
            <div style={{fontSize:12, color:"var(--text-faint)", marginBottom:4, lineHeight:1.7}}>
              Upload a CSV with historical attendance records. Required columns:
            </div>
            <div style={{background:"var(--panel)", borderRadius:8, padding:"8px 12px", marginBottom:12, fontSize:12, color:"var(--text)", fontFamily:"monospace"}}>
              service_date (DD/MM/YYYY), first_name, last_name, service_name (optional)
            </div>
            <div style={{fontSize:12, color:"var(--text-faint)", marginBottom:12}}>
              Members must already exist in the database. Dates should be in DD/MM/YYYY format e.g. 15/05/2026
            </div>
            <input type="file" accept=".csv,.txt" onChange={handleAttFile} style={{fontSize:12}} />
          </div>

          {attError && <div className="error-msg" style={{marginBottom:12}}>{attError}</div>}

          {attRows.length > 0 && (
            <div className="card" style={{padding:20, marginBottom:16}}>
              <div style={{fontSize:14, color:"var(--text)", marginBottom:12}}>
                <strong>{attRows.length}</strong> attendance records found. Columns detected: {attHeaders.join(", ")}
              </div>
              <div style={{background:"var(--panel)", borderRadius:8, padding:"10px 12px", marginBottom:14, fontSize:12, color:"var(--text)"}}>
                Preview (first 3 rows):<br/>
                {attRows.slice(0,3).map((r,i)=><div key={i} style={{marginTop:4, fontFamily:"monospace", fontSize:11}}>{JSON.stringify(r)}</div>)}
              </div>
              {/* Validate first */}
              <div style={{display:"flex",gap:8,marginBottom:12}}>
                <button className="btn-ghost" style={{fontSize:12}} onClick={validateAttRows}>
                  Validate Data
                </button>
              </div>

              {/* Validation results */}
              {attValidation && (
                <div style={{marginBottom:14, background: (attValidation.issues.length||(attValidation.warnings||[]).length)?"#fff8f0":"#f0fff8", border:`1.5px solid ${(attValidation.issues.length||(attValidation.warnings||[]).length)?"#f5d088":"#b0e8c8"}`, borderRadius:8, padding:"12px 14px"}}>
                  <div style={{fontWeight:700, fontSize:12, color:"var(--text)", marginBottom:6}}>
                    {attValidation.issues.length === 0 ? "Data looks good!" : `${attValidation.issues.length} issue${attValidation.issues.length!==1?"s":""} found`}
                  </div>
                  <div style={{fontSize:12, color:"var(--text-muted)", marginBottom: attValidation.issues.length?8:0}}>
                    {attValidation.validRows} valid row{attValidation.validRows!==1?"s":""} ready to import
                    {attValidation.emptyRows > 0 && ` · ${attValidation.emptyRows} empty row${attValidation.emptyRows!==1?"s":""} will be skipped`}
                  </div>
                  {attValidation.issues.slice(0,8).map((issue,i)=>(
                    <div key={i} style={{fontSize:12, color:"#c06010", marginTop:3}}>
                      Row {issue.row} · {issue.field}: {issue.msg}
                    </div>
                  ))}
                  {attValidation.issues.length > 8 && (
                    <div style={{fontSize:12, color:"var(--text-faint)", marginTop:3}}>
                      ...and {attValidation.issues.length - 8} more issues
                    </div>
                  )}
                  {(attValidation.warnings || []).length > 0 && (
                    <div style={{marginTop: attValidation.issues.length ? 10 : 8, paddingTop:10, borderTop:"1px solid #00000010"}}>
                      <div style={{fontSize:12, fontWeight:700, color:"#a05010", marginBottom:4}}>
                        {attValidation.warnings.length} note{attValidation.warnings.length!==1?"s":""} to review (won't block import)
                      </div>
                      {attValidation.warnings.slice(0,8).map((w,i)=>(
                        <div key={i} style={{fontSize:12, color:"#a05010", marginTop:3}}>
                          Row {w.row} · {w.field}: {w.msg}
                        </div>
                      ))}
                      {attValidation.warnings.length > 8 && (
                        <div style={{fontSize:12, color:"var(--text-faint)", marginTop:3}}>
                          ...and {attValidation.warnings.length - 8} more
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <button className="btn-primary" onClick={importAttendance} disabled={attImporting}
                style={{background: replaceMode?"#e07830":""}}>
                {attImporting
                  ? `${replaceMode?"Replacing":"Importing"}…`
                  : `${replaceMode?"Replace":"Import"} ${attRows.length} Records`}
              </button>
            </div>
          )}

          {/* Success toast */}
          {attSuccess && (
            <div style={{
              position:"fixed", top:24, left:"50%", transform:"translateX(-50%)",
              background:"#2a8a50", color:"#fff", borderRadius:12,
              padding:"14px 28px", fontSize:14, fontWeight:700,
              boxShadow:"0 4px 24px #0000002a", zIndex:999,
              display:"flex", alignItems:"center", gap:10,
              animation:"fadeIn 0.3s ease"
            }}>
              <span style={{display:"flex"}}><CheckCircle2 size={20} color="#4caf82" /></span>
              Import successful! {attResult?.added} record{attResult?.added!==1?"s":""} imported.
            </div>
          )}

          {attResult && (
            <div style={{background: attResult.unmatchedNames?.length ? "#fffbf0" : "#f0fff8", border:`1.5px solid ${attResult.unmatchedNames?.length?"#f5d88a":"#b0e8c8"}`, borderRadius:10, padding:"14px 16px"}}>
              <div style={{fontWeight:700, fontSize:14, color:"var(--text)", marginBottom:8}}>
                {attResult.replaced ? "Replace Complete" : "Import Complete"}
              </div>
              {attResult.replaced && (
                <div style={{fontSize:12, color:"#e07830", marginBottom:6}}>
                  Cleared attendance for {attResult.clearedCount} service session{attResult.clearedCount!==1?"s":""} before importing
                </div>
              )}
              <div style={{fontSize:14, color:"#4caf82", marginBottom:4}}>{attResult.added} new attendance records imported</div>
              {attResult.duplicates > 0 && !attResult.replaced && (
                <div style={{fontSize:12, color:"var(--text-faint)", marginBottom:4}}>
                  ℹ {attResult.duplicates} record{attResult.duplicates!==1?"s":""} already existed and were skipped
                </div>
              )}
              {attResult.skipped > 0 && (
                <div style={{fontSize:12, color:"var(--text-faint)", marginBottom:4}}>
                  {attResult.skipped} row{attResult.skipped!==1?"s":""} skipped (empty or missing data)
                </div>
              )}
              {attResult.errors.map((e,i)=><div key={i} style={{fontSize:12,color:"#e05050",marginTop:4}}>{e}</div>)}

              {/* Unmatched names warning */}
              {attResult.unmatchedNames?.length > 0 && (
                <div style={{marginTop:14, background:"#fffbeb", border:"1.5px solid #f59e0b", borderRadius:10, padding:"14px 16px"}}>
                  <div style={{display:"flex", alignItems:"center", gap:8, marginBottom:8}}>
                    <span style={{display:"flex"}}><AlertTriangle size={18} color="#e0a020" /></span>
                    <div style={{fontWeight:700, fontSize:13, color:"#92400e"}}>
                      {attResult.unmatchedNames.length} member{attResult.unmatchedNames.length!==1?"s":""} not found in database
                    </div>
                  </div>
                  <div style={{fontSize:12, color:"#78350f", marginBottom:12, lineHeight:1.7}}>
                    These names from your CSV could not be matched to any member in the system.
                    Their attendance was <strong>not imported</strong>. Check the spelling matches
                    exactly what's in the Members tab, then re-import.
                  </div>
                  <div style={{background:"var(--surface)", border:"1px solid #fde68a", borderRadius:8, overflow:"hidden"}}>
                    <div style={{display:"grid", gridTemplateColumns:"1fr 1fr 1fr", padding:"8px 12px", background:"#fef3c7", fontSize:10, fontWeight:700, color:"#92400e", textTransform:"uppercase", letterSpacing:0.5}}>
                      <span>Name in CSV</span><span>Date</span><span>Service</span>
                    </div>
                    {attResult.unmatchedNames.map((u,i)=>(
                      <div key={i} style={{
                        display:"grid", gridTemplateColumns:"1fr 1fr 1fr",
                        padding:"9px 12px", fontSize:12, color:"var(--text-2)",
                        borderTop:"1px solid #fde68a",
                        background: i%2===0?"var(--surface)":"#fffbeb"
                      }}>
                        <span style={{fontWeight:600, color:"var(--text)"}}>{u.name}</span>
                        <span style={{color:"var(--text-muted)"}}>{u.date}</span>
                        <span style={{color:"var(--text-faint)", fontSize:11}}>{u.service}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{marginTop:10, fontSize:11, color:"#92400e", background:"#fef3c7", borderRadius:6, padding:"6px 10px", lineHeight:1.6}}>
                    <strong>Common causes:</strong> Middle name included · Nickname used · Spelling difference · Member not yet added to the system
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Download template */}
          <div style={{marginTop:16}}>
            <button className="btn-ghost" style={{fontSize:12}} onClick={()=>{
              const csv = "service_date,first_name,last_name,service_name\n04/05/2026,John,Smith,Sunday Morning Service\n04/05/2026,Maria,Jones,Sunday Morning Service";
              const blob = new Blob([csv],{type:"text/csv"});
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a"); a.href=url; a.download="attendance-template.csv"; a.click();
            }}>Download Attendance Template</button>
          </div>
        </div>
      )}
    </div>
  );
}
