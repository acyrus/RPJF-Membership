import { useState, useEffect, useMemo } from "react";
import { supabase } from "../supabase";
import { Avatar, Spinner } from "../components";
import { Search, ClipboardList, ArrowUpDown } from "lucide-react";

// Same normalization the admin's Roster Check uses, so a name links to a member
// record here exactly when it matches there. "Ali-Mohammed" === "Ali Mohammed".
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

function Stat({ label, value, sub, color = "#2a3560" }) {
  return (
    <div className="card" style={{padding:"14px 16px"}}>
      <div style={{fontSize:24, fontWeight:800, color}}>{value}</div>
      <div style={{fontSize:11, color:"#9ca3af", fontWeight:600, textTransform:"uppercase", letterSpacing:0.4, marginTop:2}}>{label}</div>
      {sub && <div style={{fontSize:11, color:"#c0c8d8", marginTop:2}}>{sub}</div>}
    </div>
  );
}

// Read-only view of the roster the admin published. Ushers cannot change it.
export default function RosterPage({ members = [] }) {
  const [roster, setRoster] = useState(null);
  const [names, setNames] = useState([]);
  const [loading, setLoading] = useState(true);

  const [q, setQ] = useState("");
  const [inApp, setInApp] = useState("all");      // all | yes | no
  const [hasPic, setHasPic] = useState("all");    // all | yes | no
  const [sort, setSort] = useState("roster");     // roster | last | first

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
      setLoading(false);
    })();
  }, []);

  // Link each roster name to a member record where one exists.
  const linked = useMemo(() => {
    const byKey = new Map();
    members.forEach(m => {
      const k = nameKey(m.first_name, m.last_name);
      if (!byKey.has(k)) byKey.set(k, m);
    });
    return names.map(n => {
      const member = byKey.get(nameKey(n.first_name, n.last_name)) || null;
      return { ...n, member, inApp: !!member, hasPic: !!(member && member.photo_url) };
    });
  }, [names, members]);

  const stats = useMemo(() => {
    const total   = linked.length;
    const matched = linked.filter(n => n.inApp).length;
    const withPic = linked.filter(n => n.hasPic).length;
    return {
      total, matched,
      notMatched: total - matched,
      withPic,
      noPic: matched - withPic,                    // members on the roster still owing a photo
      pct: total ? Math.round((matched / total) * 100) : 0,
      picPct: matched ? Math.round((withPic / matched) * 100) : 0,
    };
  }, [linked]);

  const rows = useMemo(() => {
    const needle = normName(q);
    const out = linked.filter(n => {
      if (inApp  === "yes" && !n.inApp)  return false;
      if (inApp  === "no"  &&  n.inApp)  return false;
      if (hasPic === "yes" && !n.hasPic) return false;
      if (hasPic === "no"  &&  n.hasPic) return false;
      if (needle && !normName(`${n.first_name}${n.last_name}`).includes(needle)) return false;
      return true;
    });
    if (sort === "last")  out.sort((a,b) => (a.last_name||"").localeCompare(b.last_name||"") || (a.first_name||"").localeCompare(b.first_name||""));
    if (sort === "first") out.sort((a,b) => (a.first_name||"").localeCompare(b.first_name||"") || (a.last_name||"").localeCompare(b.last_name||""));
    return out;
  }, [linked, q, inApp, hasPic, sort]);

  // Export exactly what's on screen, so a filtered view can be handed to whoever needs it.
  function exportView() {
    const cell = v => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s; };
    const body = rows.map(n => [n.first_name, n.last_name, n.inApp ? "Yes" : "No", n.hasPic ? "Yes" : "No"].map(cell).join(","));
    const csv = `First Name,Last Name,In App?,Has a Picture?\n${body.join("\n")}\n`;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `roster-${(roster?.label || "list").replace(/\s+/g,"-").toLowerCase()}.csv`;
    a.click();
  }

  const anyFilter = q || inApp !== "all" || hasPic !== "all";

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
      <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))", gap:12, marginBottom:16}}>
        <Stat label="On the roster" value={stats.total} />
        <Stat label="Matched in app" value={stats.matched} sub={`${stats.pct}% of roster`} color="#2a8a50" />
        <Stat label="Not in app"     value={stats.notMatched} color="#c06010" />
        <Stat label="Has a picture"  value={stats.withPic} sub={`${stats.picPct}% of matched`} color="#3a8fd0" />
        <Stat label="No picture"     value={stats.noPic} color="#8a5a10" />
      </div>

      {/* Search */}
      <div className="card" style={{padding:"10px 14px", marginBottom:12, display:"flex", alignItems:"center", gap:8}}>
        <Search size={16} color="#9ca3af" />
        <input placeholder="Search the roster…" value={q} onChange={e=>setQ(e.target.value)}
          style={{border:"none", outline:"none", flex:1, fontSize:13, background:"transparent"}} />
      </div>

      {/* Filters */}
      <div className="card" style={{padding:"14px 16px", marginBottom:16, display:"flex", gap:22, flexWrap:"wrap", alignItems:"flex-end"}}>
        <FilterGroup label="In app?" value={inApp} onChange={setInApp}
          options={[["all","All"],["yes","Yes"],["no","No"]]} />
        <FilterGroup label="Has a picture?" value={hasPic} onChange={setHasPic}
          options={[["all","All"],["yes","Yes"],["no","No"]]} />
        <FilterGroup label="Sort by" value={sort} onChange={setSort}
          options={[["roster","Roster order"],["last","Last name"],["first","First name"]]} />
        <div style={{marginLeft:"auto", display:"flex", gap:8, alignItems:"center"}}>
          {anyFilter && (
            <button className="btn-ghost" style={{fontSize:12}}
              onClick={()=>{ setQ(""); setInApp("all"); setHasPic("all"); }}>Clear filters</button>
          )}
          <button className="btn-ghost" style={{fontSize:12}} onClick={exportView}>Export view</button>
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{padding:0, overflow:"hidden"}}>
        <div style={{
          display:"grid", gridTemplateColumns:"38px 1fr 1fr 110px 130px",
          padding:"10px 14px", background:"#f7f9fc", borderBottom:"1.5px solid #e4e9f5",
          fontSize:10, fontWeight:700, color:"#6b7280", textTransform:"uppercase", letterSpacing:0.5,
        }}>
          <span>#</span>
          <span style={{display:"flex", alignItems:"center", gap:4, cursor:"pointer"}} onClick={()=>setSort("first")}>First Name <ArrowUpDown size={11} color="#c0c8d8" /></span>
          <span style={{display:"flex", alignItems:"center", gap:4, cursor:"pointer"}} onClick={()=>setSort("last")}>Last Name <ArrowUpDown size={11} color="#c0c8d8" /></span>
          <span>In App?</span>
          <span>Has a Picture?</span>
        </div>

        {rows.length === 0 ? (
          <div style={{padding:24, textAlign:"center", fontSize:13, color:"#9ca3af"}}>
            {q ? <>No one on the roster matches “{q}”.</> : "Nothing matches these filters."}
          </div>
        ) : rows.map((n, i) => (
          <div key={n.id} style={{
            display:"grid", gridTemplateColumns:"38px 1fr 1fr 110px 130px",
            alignItems:"center", padding:"9px 14px",
            borderTop: i ? "1px solid #f0f2f8" : "none",
            background: i % 2 ? "#fcfdff" : "#fff",
          }}>
            <span style={{fontSize:11, color:"#c0c8d8"}}>{n.position + 1}</span>
            <span style={{display:"flex", alignItems:"center", gap:9, minWidth:0}}>
              {n.member
                ? <Avatar member={n.member} size={26} />
                : <div style={{width:26, height:26, borderRadius:"50%", background:"#eef1f6", flexShrink:0}} />}
              <span style={{fontSize:13, fontWeight:600, color:"#2a3560", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>{n.first_name}</span>
            </span>
            <span style={{fontSize:13, fontWeight:600, color:"#2a3560", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>{n.last_name}</span>
            <span><YesNo yes={n.inApp} /></span>
            {/* A picture is only meaningful for someone who has a member record. */}
            <span>{n.inApp ? <YesNo yes={n.hasPic} /> : <span style={{fontSize:11, color:"#c0c8d8"}}>—</span>}</span>
          </div>
        ))}
      </div>

      <div style={{fontSize:11, color:"#9ca3af", marginTop:12, lineHeight:1.7}}>
        Showing {rows.length} of {linked.length} names. This list is read-only — to change it, ask an admin to publish an updated roster.
      </div>
    </div>
  );
}
