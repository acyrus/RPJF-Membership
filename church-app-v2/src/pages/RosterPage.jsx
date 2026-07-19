import { useState, useEffect, useMemo } from "react";
import { supabase } from "../supabase";
import { Avatar, Spinner, fullName } from "../components";
import { Search, ClipboardList, ArrowUpDown, StickyNote, UserCheck, X } from "lucide-react";

// Same normalization the admin's Roster Check uses, so a name links to a member
// record here exactly when it matches there. "Ali-Mohammed" === "Ali Mohammed".
// The assignments table is keyed on nameKey too, so this MUST stay in step with the
// name_key the SQL migration expects — NFD strip accents, lowercase, a-z only.
function normName(s) {
  return String(s || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z]/g, "");
}
const nameKey = (first, last) => `${normName(first)}|${normName(last)}`;

// Small yes/no pill used in the table cells.
function YesNo({ yes, yesLabel = "Yes", noLabel = "No" }) {
  const c = yes ? { bg: "#e8f6ee", fg: "#1e7a4a", bd: "#b0e8c8" }
                : { bg: "#fdeeee", fg: "#b03030", bd: "#f3c8c8" };
  return (
    <span style={{
      display:"inline-block", minWidth:38, textAlign:"center",
      background:c.bg, color:c.fg, border:`1px solid ${c.bd}`,
      borderRadius:20, padding:"2px 10px", fontSize:11, fontWeight:700,
    }}>{yes ? yesLabel : noLabel}</span>
  );
}

// Labelled chip used in the mobile card rows: a small uppercase label beside its value.
function Chip({ label, children }) {
  return (
    <span style={{display:"inline-flex", alignItems:"center", gap:6}}>
      <span style={{fontSize:10, fontWeight:700, color:"#9ca3af", textTransform:"uppercase", letterSpacing:0.4}}>{label}</span>
      {children}
    </span>
  );
}

function Stat({ label, value, sub, color = "#2a3560" }) {
  return (
    <div className="card" style={{padding:"14px 16px"}}>
      <div style={{fontSize:24, fontWeight:800, color}}>{value}</div>
      <div style={{fontSize:11, color:"#9ca3af", fontWeight:600, textTransform:"uppercase", letterSpacing:0.4, marginTop:2}}>{label}</div>
      {sub && <div style={{fontSize:11, color:"#c0c8d8", marginTop:2}}>{sub}</div>}
    </div>
  );
}

// Columns: #, First, Last, In App?, Pic?, Assigned, Note. Names are deliberately
// narrow (they're short) so Assigned and Note get the room they actually need.
const GRID = "28px 0.85fr 0.85fr 74px 60px 1fr 1.4fr";

// Editor for one roster name's working data. Uses the shared .modal styles so it's a
// centred dialog on desktop and a bottom sheet on mobile (same as the member forms).
function AssignmentEditor({ row, ushers, saving, onSave, onClose }) {
  const [usherId, setUsherId] = useState(row.assigned_usher_id || "");
  const [note, setNote] = useState(row.note || "");
  const [inactive, setInactive] = useState(!!row.is_inactive);

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal fade-in" onClick={e=>e.stopPropagation()}>
        <h2>{row.first_name} {row.last_name}</h2>
        <div style={{fontSize:12, color:"#9ca3af", marginTop:-14, marginBottom:18}}>
          {row.inApp ? "In the app" : "Not in the app"}
          {row.inApp && (row.hasPic ? " · has a picture" : " · no picture yet")}
        </div>

        <div className="field-group">
          <label className="field-label">Assigned usher</label>
          <select value={usherId} onChange={e=>setUsherId(e.target.value)}>
            <option value="">— Unassigned —</option>
            {ushers.map(u => <option key={u.id} value={u.id}>{fullName(u)}</option>)}
          </select>
          {ushers.length === 0 && (
            <div style={{fontSize:11, color:"#c06010", marginTop:6, lineHeight:1.6}}>
              No members are tagged with the Usher ministry yet. Add the Usher role to a
              member (Members → edit) and they'll appear here.
            </div>
          )}
        </div>

        <div className="field-group">
          <label className="field-label">Note</label>
          <textarea rows={3} value={note} onChange={e=>setNote(e.target.value)}
            placeholder="e.g. Away this month, phone number confirmed, needs a photo…"
            style={{resize:"vertical"}} />
        </div>

        <label style={{display:"flex", alignItems:"center", gap:9, cursor:"pointer", padding:"4px 0 2px", fontSize:13, color:"#374151"}}>
          <input type="checkbox" checked={inactive} onChange={e=>setInactive(e.target.checked)} />
          <span><strong>Flag as inactive</strong> — hide from the list of names still to chase</span>
        </label>

        <div style={{display:"flex", gap:10, marginTop:20}}>
          <button className="btn-primary" style={{flex:1}} disabled={saving}
            onClick={()=>onSave(row, { assigned_usher_id: usherId || null, note: note.trim() || null, is_inactive: inactive })}>
            {saving ? "Saving…" : "Save"}
          </button>
          <button className="btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// The Roster tab. The published list stays read-only (admins own it); the per-name
// working data — assigned usher, note, inactive flag — is what ushers edit here.
export default function RosterPage({ members = [] }) {
  const [roster, setRoster] = useState(null);
  const [names, setNames] = useState([]);
  const [assignments, setAssignments] = useState({});   // name_key -> row
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState("");

  const [q, setQ] = useState("");
  const [inApp, setInApp] = useState("all");            // all | yes | no
  const [hasPic, setHasPic] = useState("all");          // all | yes | no
  const [usherFilter, setUsherFilter] = useState("all"); // all | unassigned | <memberId>
  const [status, setStatus] = useState("active");        // active | inactive | all
  const [sort, setSort] = useState("roster");           // roster | last | first

  useEffect(() => {
    (async () => {
      const { data: rosters } = await supabase.from("rosters")
        .select("*").eq("is_current", true).limit(1);
      const current = (rosters || [])[0] || null;
      setRoster(current);
      if (current) {
        const { data: rows } = await supabase.from("roster_names")
          .select("*").eq("roster_id", current.id).order("position");
        setNames(rows || []);
      }
      // Assignments are keyed by name and span rosters, so load them regardless.
      const { data: assn } = await supabase.from("roster_assignments").select("*");
      const map = {};
      (assn || []).forEach(a => { map[a.name_key] = a; });
      setAssignments(map);
      setLoading(false);
    })();
  }, []);

  // Members who can be assigned: anyone carrying the Usher ministry.
  const ushers = useMemo(() =>
    members.filter(m => (m.roles || []).includes("Usher"))
           .sort((a, b) => fullName(a).localeCompare(fullName(b)))
  , [members]);
  const usherById = useMemo(() => {
    const m = new Map(); ushers.forEach(u => m.set(u.id, u)); return m;
  }, [ushers]);

  // Link each roster name to a member record and to its saved working data.
  const linked = useMemo(() => {
    const byKey = new Map();
    members.forEach(m => {
      const k = nameKey(m.first_name, m.last_name);
      if (!byKey.has(k)) byKey.set(k, m);
    });
    return names.map(n => {
      const key = nameKey(n.first_name, n.last_name);
      const member = byKey.get(key) || null;
      const a = assignments[key] || {};
      return {
        ...n, key, member, inApp: !!member, hasPic: !!(member && member.photo_url),
        assigned_usher_id: a.assigned_usher_id || null,
        note: a.note || "",
        is_inactive: !!a.is_inactive,
      };
    });
  }, [names, members, assignments]);

  // Stats describe the ACTIVE working set — inactive names are ones the ushers have
  // chosen to ignore, so folding them into "still owing" counts would be misleading.
  const stats = useMemo(() => {
    const active = linked.filter(n => !n.is_inactive);
    const total = active.length;
    const matched = active.filter(n => n.inApp).length;
    const withPic = active.filter(n => n.hasPic).length;
    const assigned = active.filter(n => n.assigned_usher_id).length;
    return {
      total, matched, assigned,
      unassigned: total - assigned,
      notMatched: total - matched,
      withPic,
      inactive: linked.length - total,
      pct: total ? Math.round((matched / total) * 100) : 0,
    };
  }, [linked]);

  const rows = useMemo(() => {
    const needle = normName(q);
    const out = linked.filter(n => {
      if (status === "active"   &&  n.is_inactive) return false;
      if (status === "inactive" && !n.is_inactive) return false;
      if (inApp  === "yes" && !n.inApp)  return false;
      if (inApp  === "no"  &&  n.inApp)  return false;
      if (hasPic === "yes" && !n.hasPic) return false;
      if (hasPic === "no"  &&  n.hasPic) return false;
      if (usherFilter === "unassigned" && n.assigned_usher_id) return false;
      if (usherFilter !== "all" && usherFilter !== "unassigned" && n.assigned_usher_id !== usherFilter) return false;
      if (needle && !normName(`${n.first_name}${n.last_name}`).includes(needle)) return false;
      return true;
    });
    if (sort === "last")  out.sort((a,b) => (a.last_name||"").localeCompare(b.last_name||"") || (a.first_name||"").localeCompare(b.first_name||""));
    if (sort === "first") out.sort((a,b) => (a.first_name||"").localeCompare(b.first_name||"") || (a.last_name||"").localeCompare(b.last_name||""));
    return out;
  }, [linked, q, inApp, hasPic, usherFilter, status, sort]);

  async function saveAssignment(row, patch) {
    setSaving(true); setError("");
    const record = {
      name_key: row.key,
      first_name: row.first_name,
      last_name: row.last_name,
      ...patch,
      updated_at: new Date().toISOString(),
    };
    // Upsert on the name key: first edit inserts, later edits update the same row.
    const { error: e } = await supabase.from("roster_assignments").upsert(record, { onConflict: "name_key" });
    setSaving(false);
    if (e) { setError(e.message); return; }
    setAssignments(prev => ({ ...prev, [row.key]: { ...(prev[row.key] || {}), ...record } }));
    setEditing(null);
  }

  function usherLabel(id) {
    const u = usherById.get(id);
    return u ? fullName(u) : null;
  }

  // Export exactly what's on screen, working data included.
  function exportView() {
    const cell = v => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s; };
    const head = ["First Name","Last Name","In App?","Has a Picture?","Assigned Usher","Note","Inactive?"];
    const body = rows.map(n => [
      n.first_name, n.last_name, n.inApp ? "Yes" : "No", n.hasPic ? "Yes" : "No",
      usherLabel(n.assigned_usher_id) || "", n.note || "", n.is_inactive ? "Yes" : "No",
    ].map(cell).join(","));
    const csv = `${head.join(",")}\n${body.join("\n")}\n`;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `roster-${(roster?.label || "list").replace(/\s+/g,"-").toLowerCase()}.csv`;
    a.click();
  }

  const anyFilter = q || inApp !== "all" || hasPic !== "all" || usherFilter !== "all" || status !== "active";

  if (loading) return <Spinner />;

  if (!roster) {
    return (
      <div className="fade-in">
        <div style={{fontFamily:"'Inter',sans-serif", color:"#111827", fontSize:14, letterSpacing:0.5, fontWeight:700, marginBottom:20}}>ATTENDANCE ROSTER</div>
        <div className="card" style={{padding:28, textAlign:"center"}}>
          <ClipboardList size={28} color="#c0c8d8" />
          <div style={{fontWeight:700, fontSize:14, color:"#111827", marginTop:10}}>No roster published yet</div>
          <div style={{fontSize:12, color:"#9ca3af", marginTop:4, lineHeight:1.7}}>
            An admin needs to upload the attendance list from the Import page. Once they do, it will appear here.
          </div>
        </div>
      </div>
    );
  }

  const FilterGroup = ({ label, value, onChange, options }) => (
    <div>
      <div style={{fontSize:10, fontWeight:700, color:"#9ca3af", textTransform:"uppercase", letterSpacing:0.5, marginBottom:5}}>{label}</div>
      <div style={{display:"flex", gap:5}}>
        {options.map(([key, text]) => (
          <button key={key} onClick={()=>onChange(key)} style={{
            background: value===key ? "#2a5357" : "#f4f6fa",
            color:      value===key ? "#fff" : "#5a6a8a",
            border:`1.5px solid ${value===key ? "#2a5357" : "#d0d7e8"}`,
            borderRadius:20, padding:"5px 13px", fontSize:12, fontWeight:700,
            cursor:"pointer", transition:"all 0.15s", whiteSpace:"nowrap",
          }}>{text}</button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="fade-in">
      <div style={{fontFamily:"'Inter',sans-serif", color:"#111827", fontSize:14, letterSpacing:0.5, fontWeight:700, marginBottom:20}}>ATTENDANCE ROSTER</div>

      {/* Which list is live */}
      <div className="card" style={{padding:"14px 16px", marginBottom:16, display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:10}}>
        <div>
          <div style={{fontWeight:700, fontSize:14, color:"#111827"}}>{roster.label}</div>
          <div style={{fontSize:12, color:"#9ca3af", marginTop:2}}>
            Published {new Date(roster.created_at).toLocaleDateString()}
          </div>
        </div>
        <span style={{fontSize:10, fontWeight:700, background:"#e8f5f0", color:"#1f4e4a", padding:"4px 10px", borderRadius:20, textTransform:"uppercase", letterSpacing:0.4}}>Current list</span>
      </div>

      {/* Summary statistics */}
      <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))", gap:12, marginBottom:16}}>
        <Stat label="Active names" value={stats.total} sub={stats.inactive ? `${stats.inactive} inactive hidden` : undefined} />
        <Stat label="Matched in app" value={stats.matched} sub={`${stats.pct}% of active`} color="#2a8a50" />
        <Stat label="Not in app"     value={stats.notMatched} color="#c06010" />
        <Stat label="Assigned"       value={stats.assigned} color="#3a8fd0" />
        <Stat label="Unassigned"     value={stats.unassigned} color="#8a5a10" />
      </div>

      {error && <div className="error-msg" style={{marginBottom:12}}>{error}</div>}

      {/* Search */}
      <div className="card" style={{padding:"10px 14px", marginBottom:12, display:"flex", alignItems:"center", gap:8}}>
        <Search size={16} color="#9ca3af" />
        <input placeholder="Search the roster by name…" value={q} onChange={e=>setQ(e.target.value)}
          style={{border:"none", outline:"none", flex:1, fontSize:13, background:"transparent"}} />
      </div>

      {/* Filters */}
      <div className="card" style={{padding:"14px 16px", marginBottom:16, display:"flex", gap:22, flexWrap:"wrap", alignItems:"flex-end"}}>
        <div>
          <div style={{fontSize:10, fontWeight:700, color:"#9ca3af", textTransform:"uppercase", letterSpacing:0.5, marginBottom:5}}>Assigned usher</div>
          <select value={usherFilter} onChange={e=>setUsherFilter(e.target.value)} style={{fontSize:12, padding:"6px 10px", minWidth:150}}>
            <option value="all">Anyone</option>
            <option value="unassigned">Unassigned</option>
            {ushers.map(u => <option key={u.id} value={u.id}>{fullName(u)}</option>)}
          </select>
        </div>
        <FilterGroup label="Status" value={status} onChange={setStatus}
          options={[["active","Active"],["inactive","Inactive"],["all","All"]]} />
        <FilterGroup label="In app?" value={inApp} onChange={setInApp}
          options={[["all","All"],["yes","Yes"],["no","No"]]} />
        <FilterGroup label="Has a picture?" value={hasPic} onChange={setHasPic}
          options={[["all","All"],["yes","Yes"],["no","No"]]} />
        <FilterGroup label="Sort by" value={sort} onChange={setSort}
          options={[["roster","Roster"],["last","Last"],["first","First"]]} />
        <div style={{marginLeft:"auto", display:"flex", gap:8, alignItems:"center"}}>
          {anyFilter && (
            <button className="btn-ghost" style={{fontSize:12}}
              onClick={()=>{ setQ(""); setInApp("all"); setHasPic("all"); setUsherFilter("all"); setStatus("active"); }}>Clear filters</button>
          )}
          <button className="btn-ghost" style={{fontSize:12}} onClick={exportView}>Export view</button>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="card" style={{padding:24, textAlign:"center", fontSize:13, color:"#9ca3af"}}>
          {q ? <>No one on the roster matches “{q}”.</> : "Nothing matches these filters."}
        </div>
      ) : (
        <>
          {/* Desktop: full table. The card scrolls internally so the header can pin to
              the top of the list (see .roster-scroll / .roster-head in styles.css). */}
          <div className="roster-desktop card roster-scroll" style={{padding:0}}>
            <div className="roster-head" style={{
              display:"grid", gridTemplateColumns:GRID,
              padding:"10px 14px", background:"#f7f9fc", borderBottom:"1.5px solid #e4e9f5",
              fontSize:10, fontWeight:700, color:"#6b7280", textTransform:"uppercase", letterSpacing:0.5,
            }}>
              <span>#</span>
              <span style={{display:"flex", alignItems:"center", gap:4, cursor:"pointer"}} onClick={()=>setSort("first")}>First <ArrowUpDown size={11} color="#c0c8d8" /></span>
              <span style={{display:"flex", alignItems:"center", gap:4, cursor:"pointer"}} onClick={()=>setSort("last")}>Last <ArrowUpDown size={11} color="#c0c8d8" /></span>
              <span>In App?</span>
              <span>Pic?</span>
              <span>Assigned</span>
              <span>Note</span>
            </div>

            {rows.map((n, i) => (
              <div key={n.id} onClick={()=>setEditing(n)} title="Click to assign an usher, add a note, or flag inactive" style={{
                display:"grid", gridTemplateColumns:GRID,
                alignItems:"center", padding:"9px 14px", cursor:"pointer",
                borderTop: i ? "1px solid #f0f2f8" : "none",
                background: n.is_inactive ? "#f7f8fa" : (i % 2 ? "#fcfdff" : "#fff"),
                opacity: n.is_inactive ? 0.6 : 1,
              }}>
                <span style={{fontSize:11, color:"#c0c8d8"}}>{n.position + 1}</span>
                <span style={{display:"flex", alignItems:"center", gap:8, minWidth:0}}>
                  {n.member
                    ? <Avatar member={n.member} size={24} />
                    : <div style={{width:24, height:24, borderRadius:"50%", background:"#eef1f6", flexShrink:0}} />}
                  <span style={{fontSize:13, fontWeight:600, color:"#2a3560", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", textDecoration:n.is_inactive?"line-through":"none"}}>{n.first_name}</span>
                </span>
                <span style={{fontSize:13, fontWeight:600, color:"#2a3560", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", textDecoration:n.is_inactive?"line-through":"none"}}>{n.last_name}</span>
                <span><YesNo yes={n.inApp} /></span>
                <span>{n.inApp ? <YesNo yes={n.hasPic} /> : <span style={{fontSize:11, color:"#c0c8d8"}}>—</span>}</span>
                <span style={{fontSize:12, color: n.assigned_usher_id ? "#2a5357" : "#c0c8d8", fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>
                  {n.assigned_usher_id
                    ? (usherLabel(n.assigned_usher_id) || <span style={{color:"#c06010"}}>unknown</span>)
                    : "—"}
                </span>
                <span title={n.note || ""} style={{display:"flex", alignItems:"center", gap:5, minWidth:0, fontSize:12, color: n.note ? "#5a6a7a" : "#c0c8d8"}}>
                  {n.note
                    ? <><StickyNote size={12} color="#c9a227" style={{flexShrink:0}} /><span style={{overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>{n.note}</span></>
                    : "—"}
                </span>
              </div>
            ))}
          </div>

          {/* Mobile: one card per name. Full name never truncates; everything else is a
              labelled chip underneath, so nothing gets squeezed to a single letter. */}
          <div className="roster-mobile" style={{display:"flex", flexDirection:"column", gap:8}}>
            {rows.map(n => (
              <div key={n.id} className="card" onClick={()=>setEditing(n)} style={{
                padding:"12px 14px", cursor:"pointer",
                background: n.is_inactive ? "#f7f8fa" : "#fff",
                opacity: n.is_inactive ? 0.7 : 1,
              }}>
                <div style={{display:"flex", alignItems:"center", gap:10}}>
                  <span style={{fontSize:11, color:"#c0c8d8", minWidth:20}}>{n.position + 1}</span>
                  {n.member
                    ? <Avatar member={n.member} size={30} />
                    : <div style={{width:30, height:30, borderRadius:"50%", background:"#eef1f6", flexShrink:0}} />}
                  <span style={{fontSize:15, fontWeight:700, color:"#2a3560", textDecoration:n.is_inactive?"line-through":"none", lineHeight:1.2}}>
                    {n.first_name} {n.last_name}
                  </span>
                  {n.is_inactive && (
                    <span style={{marginLeft:"auto", fontSize:10, fontWeight:700, color:"#8a94a6", background:"#eef1f6", borderRadius:20, padding:"2px 9px", textTransform:"uppercase", letterSpacing:0.4}}>Inactive</span>
                  )}
                </div>

                <div style={{display:"flex", flexWrap:"wrap", gap:8, alignItems:"center", marginTop:10, paddingLeft:30}}>
                  <Chip label="In app"><YesNo yes={n.inApp} /></Chip>
                  {n.inApp && <Chip label="Pic"><YesNo yes={n.hasPic} /></Chip>}
                  <Chip label="Usher">
                    <span style={{fontSize:12, fontWeight:600, color: n.assigned_usher_id ? "#2a5357" : "#c0c8d8"}}>
                      {n.assigned_usher_id ? (usherLabel(n.assigned_usher_id) || "unknown") : "—"}
                    </span>
                  </Chip>
                </div>

                {n.note && (
                  <div style={{display:"flex", gap:6, marginTop:9, paddingLeft:30, fontSize:12, color:"#5a6a7a", lineHeight:1.5}}>
                    <StickyNote size={13} color="#c9a227" style={{flexShrink:0, marginTop:1}} />
                    <span>{n.note}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      <div style={{fontSize:11, color:"#9ca3af", marginTop:12, lineHeight:1.7}}>
        Showing {rows.length} of {linked.length} names. Tap any name to assign an usher, add a note, or flag it inactive.
        The published list itself is read-only — ask an admin to publish an updated roster to change the names.
      </div>

      {editing && (
        <AssignmentEditor
          row={editing}
          ushers={ushers}
          saving={saving}
          onSave={saveAssignment}
          onClose={()=>setEditing(null)}
        />
      )}
    </div>
  );
}
