import { useState } from "react";
import { supabase } from "../supabase";
import { SKILLS_LIST, ROLES } from "../components";
import { CheckCircle2, AlertTriangle } from "lucide-react";

// Convert DD/MM/YYYY to YYYY-MM-DD for database storage
function convertDate(raw) {
  if (!raw || !raw.trim()) return null;
  const s = raw.trim();
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // DD/MM/YYYY
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    const [d, m, y] = s.split("/");
    return `${y}-${m}-${d}`;
  }
  // D/M/YYYY or similar
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) {
    const [d, m, y] = s.split("/");
    return `${y}-${m.padStart(2,"0")}-${d.padStart(2,"0")}`;
  }
  return s; // return as-is, validation will catch bad formats
}

const MEMBER_COLUMNS = ["first_name","last_name","middle_name","email","phone","dob","sex","marital_status","city","address","join_date","anniversary","skill1","skill2","skill3","other_skills","instruments","notes","roles"];

// Accept friendly header aliases so app-exported CSVs (which use "Gender") still auto-map
const COLUMN_ALIASES = { sex: ["gender"], marital_status: ["marital"], instruments: ["instrument"] };

// For the non-blocking "suspicious email" warning: common valid TLD endings, plus
// well-known provider misspellings. Anything else is flagged (not blocked) as a likely typo.
const COMMON_TLDS = new Set(["com","org","net","edu","gov","mil","co","io","info","biz","me","tt","uk","ca","us","int","app","dev","online","live","email","name","pro","xyz","tv","site"]);
const DOMAIN_TYPOS = new Set(["gmial.com","gmai.com","gmal.com","gmil.com","gnail.com","gmail.co","gmaill.com","hotmial.com","hotmal.com","hotmai.com","hotmil.com","yahooo.com","yaho.com","yahoo.co","outlok.com","outook.com","iclould.com","icloud.co"]);

function parseCSV(text) {
  const lines = text.trim().split("\n");
  const headers = lines[0].split(",").map(h => h.replace(/"/g,"").trim().toLowerCase().replace(/ /g,"_"));
  return lines.slice(1).filter(l => l.trim()).map(line => {
    const values = [];
    let current = "", inQuotes = false;
    for (const ch of line) {
      if (ch === '"') inQuotes = !inQuotes;
      else if (ch === "," && !inQuotes) { values.push(current.trim()); current = ""; }
      else current += ch;
    }
    values.push(current.trim());
    const obj = {};
    headers.forEach((h, i) => { obj[h] = values[i] || ""; });
    return obj;
  });
}

async function logImportActivity(supabaseClient, action_type, description, user_id, user_name) {
  try {
    await supabaseClient.from("activity_log").insert({ action_type, description, user_id, user_name });
  } catch(e) { console.warn("Log failed:", e.message); }
}

export default function ImportPage({ profile, onImportComplete }) {
  const [activeTab, setActiveTab] = useState("members");

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
  const [sheetUrl, setSheetUrl] = useState("");
  const [sheetLoading, setSheetLoading] = useState(false);

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
      // Auto-map headers
      const mapping = {};
      MEMBER_COLUMNS.forEach(col => {
        const match = headers.find(h => h === col || h.includes(col.split("_")[0]) || (COLUMN_ALIASES[col]||[]).includes(h));
        if (match) mapping[col] = match;
      });
      setMemberMapping(mapping);
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
      const res = await fetch(csvUrl);
      if (!res.ok) throw new Error("Could not fetch sheet — make sure it is shared publicly (Anyone with link can view)");
      const text = await res.text();
      const rows = parseCSV(text);
      if (!rows.length) throw new Error("No data found in sheet");
      setMemberRows(rows);
      const headers = Object.keys(rows[0]);
      setMemberHeaders(headers);
      const mapping = {};
      MEMBER_COLUMNS.forEach(col => {
        const match = headers.find(h => h === col || h.replace(/ /g,"_").toLowerCase() === col || (COLUMN_ALIASES[col]||[]).includes(h));
        if (match) mapping[col] = match;
      });
      setMemberMapping(mapping);
    } catch(e) { setMemberError(e.message); }
    finally { setSheetLoading(false); }
  }

  function validateMemberRows() {
    const today = new Date().toISOString().slice(0,10);
    const issues = [];
    const warnings = [];
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const phoneRe = /^[0-9\s\+\-\(\)]{7,20}$/;

    memberRows.forEach((row, i) => {
      const rowNum = i + 2;
      const get = col => memberMapping[col] ? (row[memberMapping[col]] || "").trim() : "";
      const first = get("first_name"), last = get("last_name");
      const email = get("email"), phone = get("phone");
      const dob = convertDate(get("dob"));
      const anniversary = convertDate(get("anniversary"));
      const joinDate = convertDate(get("join_date"));
      const sex = get("sex"), marital = get("marital_status");

      if (!first) issues.push({ row: rowNum, field: "first_name", msg: "Missing first name" });
      if (!last) issues.push({ row: rowNum, field: "last_name", msg: "Missing last name" });
      if (email && !emailRe.test(email)) issues.push({ row: rowNum, field: "email", msg: `Invalid email: "${email}"` });
      // Non-blocking: format is fine but the domain looks like a likely typo (e.g. ".com.dwp", ".con", "gmial.com").
      if (email && emailRe.test(email)) {
        const domain = email.split("@")[1].toLowerCase();
        const tld = domain.split(".").pop();
        if (!COMMON_TLDS.has(tld) || DOMAIN_TYPOS.has(domain)) {
          warnings.push({ row: rowNum, field: "email", msg: `Email "${email}" has an unusual domain — check for a typo` });
        }
      }
      if (phone && !phoneRe.test(phone)) issues.push({ row: rowNum, field: "phone", msg: `Invalid phone: "${phone}"` });
      if (get("dob") && (!dob || dob > today)) issues.push({ row: rowNum, field: "dob", msg: `Invalid or future date of birth: "${get("dob")}"` });
      if (get("anniversary") && !anniversary) issues.push({ row: rowNum, field: "anniversary", msg: `Invalid anniversary date: "${get("anniversary")}"` });
      if (get("join_date") && joinDate && joinDate > today) issues.push({ row: rowNum, field: "join_date", msg: `Join date cannot be in the future` });
      if (sex && !["Male","Female"].includes(sex)) issues.push({ row: rowNum, field: "sex", msg: `Sex must be "Male" or "Female", got "${sex}"` });
      if (marital && !["Single","Married"].includes(marital)) issues.push({ row: rowNum, field: "marital_status", msg: `Marital status must be "Single" or "Married", got "${marital}"` });
      // Non-blocking: a valid anniversary on someone not marked Married is likely a data-entry slip.
      if (anniversary && marital && marital !== "Married") warnings.push({ row: rowNum, field: "anniversary", msg: `Marked "${marital}" but has a wedding anniversary — should this be Married?` });
    });

    const emptyRows = memberRows.filter(r => {
      const get = col => memberMapping[col] ? (r[memberMapping[col]] || "").trim() : "";
      return !get("first_name") && !get("last_name");
    }).length;

    setMemberValidation({ issues, warnings, validRows: memberRows.length - emptyRows, emptyRows, total: memberRows.length });
    return issues.length === 0;
  }

  async function importMembers() {
    setMemberImporting(true); setMemberError(""); setMemberResult(null);
    let added = 0, updated = 0, skipped = 0, duplicates = 0, errors = [];

    // De-duplicate the sheet on normalized first+last, keeping the LAST occurrence
    // (Google Forms appends newest responses at the bottom, so last = newest).
    const dedupeMap = new Map();
    memberRows.forEach(row => {
      const get = col => memberMapping[col] ? (row[memberMapping[col]] || "").trim() : "";
      const first = get("first_name"); const last = get("last_name");
      if (!first || !last) return;
      const key = `${first}|${last}`.toLowerCase().replace(/\s+/g, " ").trim();
      dedupeMap.set(key, row);
    });
    const importRows = Array.from(dedupeMap.values());
    const nonEmpty = memberRows.filter(row => {
      const get = col => memberMapping[col] ? (row[memberMapping[col]] || "").trim() : "";
      return get("first_name") && get("last_name");
    }).length;
    const dedupedAway = nonEmpty - importRows.length;

    for (const row of importRows) {
      const get = col => memberMapping[col] ? (row[memberMapping[col]] || "").trim() : "";
      const first = get("first_name"); const last = get("last_name");
      if (!first || !last) { skipped++; continue; }

      try {
        const memberData = {
          first_name: first, last_name: last,
          middle_name: get("middle_name") || null,
          email: get("email") || null,
          phone: get("phone") || null,
          dob: convertDate(get("dob")) || null,
          sex: get("sex") || null,
          marital_status: get("marital_status") || null,
          address: get("address") || null,
          join_date: convertDate(get("join_date")) || null,
          anniversary: convertDate(get("anniversary")) || null,
          skill1: get("skill1") || null,
          skill2: get("skill2") || null,
          skill3: get("skill3") || null,
          other_skills: get("other_skills") || null,
          instruments: get("instruments") || null,
          city: get("city") || null,
          notes: get("notes") || null,
          is_active: true,
        };

        // Check if member already exists by first + last name
        const { data: existing } = await supabase.from("members")
          .select("id")
          .ilike("first_name", first)
          .ilike("last_name", last)
          .maybeSingle();

        let memberId;

        if (existing) {
          if (memberReplaceMode) {
            // Update existing member
            const { error: upErr } = await supabase.from("members")
              .update(memberData).eq("id", existing.id);
            if (upErr) throw upErr;
            memberId = existing.id;
            // Replace roles
            await supabase.from("member_roles").delete().eq("member_id", memberId);
            updated++;
          } else {
            // Skip duplicate
            duplicates++;
            continue;
          }
        } else {
          // Insert new member
          const { data: member, error: mErr } = await supabase.from("members")
            .insert(memberData).select("id").single();
          if (mErr) throw mErr;
          memberId = member.id;
          added++;
        }

        // Handle roles
        const rolesStr = get("roles");
        if (rolesStr && memberId) {
          const roleList = rolesStr.split(/[,;]/).map(r=>r.trim()).filter(r=>ROLES.includes(r));
          if (roleList.length) {
            await supabase.from("member_roles")
              .insert(roleList.map(r=>({ member_id: memberId, role_name: r })));
          }
        }
      } catch(e) {
        errors.push(`${first} ${last}: ${e.message}`);
      }
    }

    const result = { added, updated, skipped, duplicates, deduped: dedupedAway, errors: errors.slice(0, 10), replaced: memberReplaceMode };
    // Log the import action
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
      setTimeout(() => {
        setMemberSuccess(false);
        onImportComplete();
      }, 3000);
    }
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
        issues.push({ row: rowNum, field: "service_date", msg: `Invalid date "${rawDate}" — use DD/MM/YYYY e.g. 15/05/2026` });
      } else if (convertedDate > today) {
        issues.push({ row: rowNum, field: "service_date", msg: `Date ${rawDate} is in the future` });
      } else if (convertedDate === today) {
        warnings.push({ row: rowNum, field: "service_date", msg: `Date ${rawDate} is today — double-check this is the right service date` });
      }
      if (!firstName) issues.push({ row: rowNum, field: "first_name", msg: "Missing first name" });
      if (!lastName) issues.push({ row: rowNum, field: "last_name", msg: "Missing last name" });

      // Duplicate detection within the file (same person, same date, same service)
      if (convertedDate && firstName && lastName) {
        const key = [convertedDate, firstName.toLowerCase(), lastName.toLowerCase(), (svcName || "Imported Service").toLowerCase()].join("|");
        if (seen[key]) {
          warnings.push({ row: rowNum, field: "duplicate", msg: `Duplicate of row ${seen[key]} — ${firstName} ${lastName} on ${rawDate}${svcName ? ` (${svcName})` : ""}. It will only be imported once.` });
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
      <div style={{fontFamily:"'Inter',sans-serif", color:"#111827", fontSize:14, letterSpacing:0.5, fontWeight:700, marginBottom:20}}>DATA IMPORT</div>

      {/* Tabs */}
      <div style={{display:"flex", gap:4, marginBottom:24, borderBottom:"1.5px solid #e4e9f5"}}>
        {[["members","Import Members"],["attendance","Import Attendance"]].map(([key,label])=>(
          <button key={key} onClick={()=>setActiveTab(key)} style={{
            background:"none", border:"none", cursor:"pointer", fontFamily:"'Inter',sans-serif",
            fontSize:14, fontWeight:600, padding:"10px 18px",
            color:activeTab===key?"#2a5357":"#8a96b8",
            borderBottom:activeTab===key?"2px solid #2a5357":"2px solid transparent",
            transition:"all 0.15s",
          }}>{label}</button>
        ))}
      </div>

      {/* MEMBERS IMPORT */}
      {activeTab === "members" && (
        <div>
          {/* Google Sheets */}
          {/* Member Replace Mode */}
          <div className="card" style={{padding:16, marginBottom:16, background: memberReplaceMode?"#fff8f0":"#fff", border:`1.5px solid ${memberReplaceMode?"#f5a050":"#e4e9f5"}`}}>
            <div style={{display:"flex", alignItems:"center", justifyContent:"space-between"}}>
              <div>
                <div style={{fontWeight:700, fontSize:14, color: memberReplaceMode?"#c06010":"#2a3560", marginBottom:3}}>
                  {memberReplaceMode ? "Replace Mode — ON" : "Replace Mode"}
                </div>
                <div style={{fontSize:12, color:"#9ca3af", lineHeight:1.7}}>
                  {memberReplaceMode
                    ? "Existing members with matching names will be updated. New members will be added."
                    : "Off — duplicate names will be skipped. Turn on to update existing members."}
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
            <div style={{fontWeight:700, fontSize:14, color:"#111827", marginBottom:4}}>Import from Google Sheets</div>
            <div style={{fontSize:12, color:"#9ca3af", marginBottom:12, lineHeight:1.7}}>
              Share your Google Sheet publicly (File → Share → Anyone with link → Viewer), then paste the URL below.
              Your sheet should have column headers matching: <code style={{background:"#f4f6ff",padding:"1px 5px",borderRadius:4,fontSize:11}}>first_name, last_name, email, phone, dob, sex, marital_status</code> etc.
            </div>
            <div style={{display:"flex", gap:8}}>
              <input placeholder="https://docs.google.com/spreadsheets/d/…" value={sheetUrl} onChange={e=>setSheetUrl(e.target.value)} style={{flex:1}} />
              <button className="btn-primary" onClick={fetchGoogleSheet} disabled={sheetLoading}>{sheetLoading?"Loading…":"Load Sheet"}</button>
            </div>
          </div>

          {/* CSV Upload */}
          <div className="card" style={{padding:20, marginBottom:16}}>
            <div style={{fontWeight:700, fontSize:14, color:"#111827", marginBottom:4}}>Import from CSV / Excel</div>
            <div style={{fontSize:12, color:"#9ca3af", marginBottom:12}}>Export your spreadsheet as CSV and upload it here. First row must be column headers.</div>
            <input type="file" accept=".csv,.txt" onChange={handleMemberFile} style={{fontSize:12}} />
          </div>

          {memberError && <div className="error-msg" style={{marginBottom:12}}>{memberError}</div>}

          {/* Column mapping */}
          {memberRows.length > 0 && (
            <div className="card" style={{padding:20, marginBottom:16}}>
              <div style={{fontWeight:700, fontSize:14, color:"#111827", marginBottom:4}}>Map Columns</div>
              <div style={{fontSize:12, color:"#9ca3af", marginBottom:12}}>{memberRows.length} rows found. Match your spreadsheet columns to the app fields.</div>
              <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:10}}>
                {["first_name","last_name","middle_name","email","phone","dob","sex","marital_status","city","address","join_date","anniversary","skill1","skill2","skill3","other_skills","notes","roles"].map(col => (
                  <div key={col}>
                    <label className="field-label">{col.replace(/_/g," ")}{["first_name","last_name"].includes(col)?" *":""}</label>
                    <select value={memberMapping[col]||""} onChange={e=>setMemberMapping(prev=>({...prev,[col]:e.target.value}))}>
                      <option value="">— skip —</option>
                      {memberHeaders.map(h=><option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              <div style={{marginTop:16}}>
                {/* Validate button */}
                <div style={{display:"flex", gap:8, marginBottom:12}}>
                  <button className="btn-ghost" style={{fontSize:12}} onClick={validateMemberRows}>Validate Data</button>
                </div>

                {/* Validation results */}
                {memberValidation && (
                  <div style={{marginBottom:14, background: memberValidation.issues.length?"#fff8f0":"#f0fff8", border:`1.5px solid ${memberValidation.issues.length?"#f5d088":"#b0e8c8"}`, borderRadius:8, padding:"12px 14px"}}>
                    <div style={{fontWeight:700, fontSize:12, color:"#111827", marginBottom:6}}>
                      {memberValidation.issues.length === 0 ? "Data looks good!" : `${memberValidation.issues.length} issue${memberValidation.issues.length!==1?"s":""} found`}
                    </div>
                    <div style={{fontSize:12, color:"#6b7280", marginBottom: memberValidation.issues.length?8:0}}>
                      {memberValidation.validRows} valid row{memberValidation.validRows!==1?"s":""} ready to import
                      {memberValidation.emptyRows > 0 && ` · ${memberValidation.emptyRows} empty rows will be skipped`}
                    </div>
                    {memberValidation.issues.slice(0,8).map((issue,i)=>(
                      <div key={i} style={{fontSize:12, color:"#c06010", marginTop:3}}>
                        Row {issue.row} · {issue.field}: {issue.msg}
                      </div>
                    ))}
                    {memberValidation.issues.length > 8 && (
                      <div style={{fontSize:12, color:"#9ca3af", marginTop:3}}>...and {memberValidation.issues.length - 8} more issues</div>
                    )}
                  </div>
                )}

                {memberValidation && memberValidation.warnings && memberValidation.warnings.length > 0 && (
                  <div style={{marginBottom:14, background:"#fff8ec", border:"1.5px solid #f0cf8a", borderRadius:8, padding:"12px 14px"}}>
                    <div style={{fontWeight:700, fontSize:12, color:"#8a5a10", marginBottom:6}}>
                      {memberValidation.warnings.length} warning{memberValidation.warnings.length!==1?"s":""} — these won't block the import
                    </div>
                    {memberValidation.warnings.slice(0,8).map((w,i)=>(
                      <div key={i} style={{fontSize:12, color:"#a06a10", marginTop:3}}>Row {w.row}: {w.msg}</div>
                    ))}
                    {memberValidation.warnings.length > 8 && (
                      <div style={{fontSize:12, color:"#b89050", marginTop:3}}>...and {memberValidation.warnings.length - 8} more</div>
                    )}
                  </div>
                )}

                <button className="btn-primary" onClick={importMembers} disabled={memberImporting}
                  style={{background: memberReplaceMode?"#e07830":""}}>
                  {memberImporting
                    ? `${memberReplaceMode?"Updating":"Importing"}… (${memberRows.length} rows)`
                    : `${memberReplaceMode?"Update / Add":"Import"} ${memberRows.length} Members`}
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
              <div style={{fontWeight:700, fontSize:14, color:"#111827", marginBottom:8}}>
                {memberResult.replaced ? "Update Complete" : "Import Complete"}
              </div>
              {memberResult.added > 0 && (
                <div style={{fontSize:14, color:"#4caf82", marginBottom:4}}>{memberResult.added} new member{memberResult.added!==1?"s":""} added</div>
              )}
              {memberResult.updated > 0 && (
                <div style={{fontSize:14, color:"#e07830", marginBottom:4}}>{memberResult.updated} existing member{memberResult.updated!==1?"s":""} updated</div>
              )}
              {memberResult.duplicates > 0 && !memberResult.replaced && (
                <div style={{fontSize:12, color:"#9ca3af", marginBottom:4}}>ℹ {memberResult.duplicates} duplicate{memberResult.duplicates!==1?"s":""} skipped (already in database) — turn on Replace Mode to update them</div>
              )}
              {memberResult.deduped > 0 && (
                <div style={{fontSize:12, color:"#9ca3af", marginBottom:4}}>{memberResult.deduped} duplicate row{memberResult.deduped!==1?"s":""} within the sheet collapsed to the newest entry each</div>
              )}
              {memberResult.skipped > 0 && (
                <div style={{fontSize:12, color:"#9ca3af", marginBottom:4}}>{memberResult.skipped} row{memberResult.skipped!==1?"s":""} skipped (missing first/last name)</div>
              )}
              {memberResult.errors.map((e,i)=><div key={i} style={{fontSize:12,color:"#e05050",marginTop:4}}>{e}</div>)}
            </div>
          )}

          {/* Download template */}
          <div style={{marginTop:16}}>
            <button className="btn-ghost" style={{fontSize:12}} onClick={()=>{
              const headers = "first_name,last_name,middle_name,email,phone,dob,sex,marital_status,address,join_date,anniversary,skill1,skill2,skill3,notes,roles";
              const example = "John,Smith,Paul,john@email.com,555-1234,15/06/1990,Male,Married,123 Main St,01/01/2020,,Accounting,Music (Guitar),,Beekeeping,Active member,Usher";
              const csv = headers + "\n" + example;
              const blob = new Blob([csv],{type:"text/csv"});
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a"); a.href=url; a.download="members-template.csv"; a.click();
            }}>Download CSV Template</button>
          </div>
        </div>
      )}

      {/* ATTENDANCE IMPORT */}
      {activeTab === "attendance" && (
        <div>
          {/* Replace mode toggle */}
          <div className="card" style={{padding:16, marginBottom:16, background: replaceMode?"#fff8f0":"#fff", border:`1.5px solid ${replaceMode?"#f5a050":"#e4e9f5"}`}}>
            <div style={{display:"flex", alignItems:"center", justifyContent:"space-between"}}>
              <div>
                <div style={{fontWeight:700, fontSize:14, color: replaceMode?"#c06010":"#2a3560", marginBottom:3}}>
                  {replaceMode ? "Replace Mode — ON" : "Replace Mode"}
                </div>
                <div style={{fontSize:12, color:"#9ca3af", lineHeight:1.7}}>
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
            <div style={{fontWeight:700, fontSize:14, color:"#111827", marginBottom:4}}>Import Historical Attendance</div>
            <div style={{fontSize:12, color:"#9ca3af", marginBottom:4, lineHeight:1.7}}>
              Upload a CSV with historical attendance records. Required columns:
            </div>
            <div style={{background:"#f4f6ff", borderRadius:8, padding:"8px 12px", marginBottom:12, fontSize:12, color:"#1f2937", fontFamily:"monospace"}}>
              service_date (DD/MM/YYYY), first_name, last_name, service_name (optional)
            </div>
            <div style={{fontSize:12, color:"#9ca3af", marginBottom:12}}>
              Members must already exist in the database. Dates should be in DD/MM/YYYY format e.g. 15/05/2026
            </div>
            <input type="file" accept=".csv,.txt" onChange={handleAttFile} style={{fontSize:12}} />
          </div>

          {attError && <div className="error-msg" style={{marginBottom:12}}>{attError}</div>}

          {attRows.length > 0 && (
            <div className="card" style={{padding:20, marginBottom:16}}>
              <div style={{fontSize:14, color:"#111827", marginBottom:12}}>
                <strong>{attRows.length}</strong> attendance records found. Columns detected: {attHeaders.join(", ")}
              </div>
              <div style={{background:"#f4f6ff", borderRadius:8, padding:"10px 12px", marginBottom:14, fontSize:12, color:"#1f2937"}}>
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
                  <div style={{fontWeight:700, fontSize:12, color:"#111827", marginBottom:6}}>
                    {attValidation.issues.length === 0 ? "Data looks good!" : `${attValidation.issues.length} issue${attValidation.issues.length!==1?"s":""} found`}
                  </div>
                  <div style={{fontSize:12, color:"#6b7280", marginBottom: attValidation.issues.length?8:0}}>
                    {attValidation.validRows} valid row{attValidation.validRows!==1?"s":""} ready to import
                    {attValidation.emptyRows > 0 && ` · ${attValidation.emptyRows} empty row${attValidation.emptyRows!==1?"s":""} will be skipped`}
                  </div>
                  {attValidation.issues.slice(0,8).map((issue,i)=>(
                    <div key={i} style={{fontSize:12, color:"#c06010", marginTop:3}}>
                      Row {issue.row} · {issue.field}: {issue.msg}
                    </div>
                  ))}
                  {attValidation.issues.length > 8 && (
                    <div style={{fontSize:12, color:"#9ca3af", marginTop:3}}>
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
                        <div style={{fontSize:12, color:"#9ca3af", marginTop:3}}>
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
              <div style={{fontWeight:700, fontSize:14, color:"#111827", marginBottom:8}}>
                {attResult.replaced ? "Replace Complete" : "Import Complete"}
              </div>
              {attResult.replaced && (
                <div style={{fontSize:12, color:"#e07830", marginBottom:6}}>
                  Cleared attendance for {attResult.clearedCount} service session{attResult.clearedCount!==1?"s":""} before importing
                </div>
              )}
              <div style={{fontSize:14, color:"#4caf82", marginBottom:4}}>{attResult.added} new attendance records imported</div>
              {attResult.duplicates > 0 && !attResult.replaced && (
                <div style={{fontSize:12, color:"#9ca3af", marginBottom:4}}>
                  ℹ {attResult.duplicates} record{attResult.duplicates!==1?"s":""} already existed and were skipped
                </div>
              )}
              {attResult.skipped > 0 && (
                <div style={{fontSize:12, color:"#9ca3af", marginBottom:4}}>
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
                  <div style={{background:"#fff", border:"1px solid #fde68a", borderRadius:8, overflow:"hidden"}}>
                    <div style={{display:"grid", gridTemplateColumns:"1fr 1fr 1fr", padding:"8px 12px", background:"#fef3c7", fontSize:10, fontWeight:700, color:"#92400e", textTransform:"uppercase", letterSpacing:0.5}}>
                      <span>Name in CSV</span><span>Date</span><span>Service</span>
                    </div>
                    {attResult.unmatchedNames.map((u,i)=>(
                      <div key={i} style={{
                        display:"grid", gridTemplateColumns:"1fr 1fr 1fr",
                        padding:"9px 12px", fontSize:12, color:"#374151",
                        borderTop:"1px solid #fde68a",
                        background: i%2===0?"#fff":"#fffbeb"
                      }}>
                        <span style={{fontWeight:600, color:"#111827"}}>{u.name}</span>
                        <span style={{color:"#6b7280"}}>{u.date}</span>
                        <span style={{color:"#9ca3af", fontSize:11}}>{u.service}</span>
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
