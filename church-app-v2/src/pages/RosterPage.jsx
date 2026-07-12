import { useState, useEffect, useMemo } from "react";
import { supabase } from "../supabase";
import { Avatar, fullName, Spinner } from "../components";
import { Search, ClipboardList, CheckCircle2 } from "lucide-react";

// Same normalization the admin's Roster Check uses, so a name links to a member
// record here exactly when it matches there. "Ali-Mohammed" === "Ali Mohammed".
function normName(s) {
  return String(s || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z]/g, "");
}
const nameKey = (first, last) => `${normName(first)}|${normName(last)}`;

// Read-only view of the roster the admin published. Ushers cannot change it.
export default function RosterPage({ members = [] }) {
  const [roster, setRoster] = useState(null);
  const [names, setNames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

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
    return names.map(n => ({ ...n, member: byKey.get(nameKey(n.first_name, n.last_name)) || null }));
  }, [names, members]);

  const filtered = useMemo(() => {
    const needle = normName(q);
    if (!needle) return linked;
    return linked.filter(n => normName(`${n.first_name}${n.last_name}`).includes(needle));
  }, [linked, q]);

  const onAppCount = linked.filter(n => n.member).length;

  if (loading) return <Spinner />;

  return (
    <div className="fade-in">
      <div style={{fontFamily:"'Inter',sans-serif", color:"#111827", fontSize:14, letterSpacing:0.5, fontWeight:700, marginBottom:20}}>ATTENDANCE ROSTER</div>

      {!roster ? (
        <div className="card" style={{padding:28, textAlign:"center"}}>
          <ClipboardList size={28} color="#c0c8d8" />
          <div style={{fontWeight:700, fontSize:14, color:"#111827", marginTop:10}}>No roster published yet</div>
          <div style={{fontSize:12, color:"#9ca3af", marginTop:4, lineHeight:1.7}}>
            An admin needs to upload the attendance list from the Import page. Once they do, it will appear here.
          </div>
        </div>
      ) : (
        <>
          <div className="card" style={{padding:"14px 16px", marginBottom:16, display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:10}}>
            <div>
              <div style={{fontWeight:700, fontSize:14, color:"#111827"}}>{roster.label}</div>
              <div style={{fontSize:12, color:"#9ca3af", marginTop:2}}>
                {names.length} names · {onAppCount} linked to a member record · published {new Date(roster.created_at).toLocaleDateString()}
              </div>
            </div>
            <span style={{fontSize:10, fontWeight:700, background:"#e8f5f0", color:"#1f4e4a", padding:"4px 10px", borderRadius:20, textTransform:"uppercase", letterSpacing:0.4}}>Current list</span>
          </div>

          <div className="card" style={{padding:"10px 14px", marginBottom:16, display:"flex", alignItems:"center", gap:8}}>
            <Search size={16} color="#9ca3af" />
            <input placeholder="Search the roster…" value={q} onChange={e=>setQ(e.target.value)}
              style={{border:"none", outline:"none", flex:1, fontSize:13, background:"transparent"}} />
            {q && <button className="btn-ghost" style={{fontSize:11}} onClick={()=>setQ("")}>Clear</button>}
          </div>

          {filtered.length === 0 ? (
            <div className="card" style={{padding:24, textAlign:"center", fontSize:13, color:"#9ca3af"}}>
              No one on the roster matches “{q}”.
            </div>
          ) : (
            <div className="card" style={{padding:8}}>
              {filtered.map((n, i) => (
                <div key={n.id} style={{
                  display:"flex", alignItems:"center", gap:11, padding:"8px 10px",
                  borderTop: i ? "1px solid #f0f2f8" : "none",
                }}>
                  <span style={{fontSize:11, color:"#c0c8d8", width:28, textAlign:"right", flexShrink:0}}>{n.position + 1}</span>
                  {n.member
                    ? <Avatar member={n.member} size={32} />
                    : <div style={{width:32, height:32, borderRadius:"50%", background:"#eef1f6", flexShrink:0}} />}
                  <div style={{flex:1, minWidth:0}}>
                    <div style={{fontSize:13, fontWeight:600, color:"#2a3560", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>
                      {n.first_name} {n.last_name}
                    </div>
                  </div>
                  {n.member
                    ? <span title="Linked to a member record" style={{display:"flex", flexShrink:0}}><CheckCircle2 size={15} color="#4caf82" /></span>
                    : <span style={{fontSize:10, fontWeight:700, background:"#fff3e0", color:"#b5581a", padding:"2px 8px", borderRadius:20, flexShrink:0}}>NOT IN APP</span>}
                </div>
              ))}
            </div>
          )}

          <div style={{fontSize:11, color:"#9ca3af", marginTop:12, lineHeight:1.7}}>
            This list is read-only. To change it, ask an admin to publish an updated roster.
          </div>
        </>
      )}
    </div>
  );
}
