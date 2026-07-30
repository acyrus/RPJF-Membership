import { useState, useEffect, useMemo } from "react";
import { supabase } from "../supabase";
import { UserPlus, Pencil, Trash2, ClipboardCheck, Church, Camera, Ban, FileText, ClipboardList } from "lucide-react";

const ACTION_ICONS = {
  "member_added": <UserPlus size={16} />,
  "member_edited": <Pencil size={16} />,
  "member_deleted": <Trash2 size={16} />,
  "attendance_marked": <ClipboardCheck size={16} />,
  "service_created": <Church size={16} />,
  "service_deleted": <Trash2 size={16} />,
  "photo_approved": <Camera size={16} />,
  "photo_rejected": <Ban size={16} />,
};
const ACTION_COLORS = {
  "member_added": <UserPlus size={16} />,
  "member_edited": <Pencil size={16} />,
  "member_deleted": <Trash2 size={16} />,
  "attendance_marked": <ClipboardCheck size={16} />,
  "service_created": <Church size={16} />,
  "service_deleted": <Trash2 size={16} />,
  "photo_approved": <Camera size={16} />,
  "photo_rejected": <Ban size={16} />,
};

export default function ChangelogPage() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [actionFilter, setActionFilter] = useState("All");
  const [userFilter, setUserFilter] = useState("All");

  useEffect(() => { loadLogs(); }, []);

  async function loadLogs() {
    setLoading(true);
    const { data } = await supabase
      .from("activity_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    setLogs(data || []);
    setLoading(false);
  }

  const users = useMemo(() => ["All", ...new Set(logs.map(l => l.user_name).filter(Boolean))], [logs]);
  const actions = useMemo(() => ["All", ...new Set(logs.map(l => l.action_type).filter(Boolean))], [logs]);

  const filtered = useMemo(() => {
    return logs.filter(l => {
      const date = l.created_at?.slice(0, 10);
      const matchDate = (!dateFrom || date >= dateFrom) && (!dateTo || date <= dateTo);
      const matchAction = actionFilter === "All" || l.action_type === actionFilter;
      const matchUser = userFilter === "All" || l.user_name === userFilter;
      return matchDate && matchAction && matchUser;
    });
  }, [logs, dateFrom, dateTo, actionFilter, userFilter]);

  // Group by date
  const grouped = useMemo(() => {
    const groups = {};
    filtered.forEach(l => {
      const date = l.created_at?.slice(0, 10) || "Unknown";
      if (!groups[date]) groups[date] = [];
      groups[date].push(l);
    });
    return Object.entries(groups).sort((a,b) => b[0].localeCompare(a[0]));
  }, [filtered]);

  function formatDate(dateStr) {
    return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", { weekday:"long", month:"long", day:"numeric", year:"numeric" });
  }
  function formatTime(ts) {
    return new Date(ts).toLocaleTimeString("en-US", { hour:"2-digit", minute:"2-digit" });
  }

  function exportLogs() {
    const headers = ["Date","Time","Action","Description","User"];
    const rows = filtered.map(l => [
      l.created_at?.slice(0,10)||"",
      formatTime(l.created_at),
      l.action_type||"",
      l.description||"",
      l.user_name||""
    ]);
    const csv = [headers,...rows].map(r=>r.map(v=>`"${v}"`).join(",")).join("\n");
    const blob = new Blob([csv],{type:"text/csv"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href=url; a.download="activity-log.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="fade-in">
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20, flexWrap:"wrap", gap:12}}>
        <div>
          <div style={{fontFamily:"'Inter',sans-serif", color:"#111827", fontSize:14, letterSpacing:0.5, fontWeight:700}}>ACTIVITY LOG</div>
          <div style={{fontSize:12, color:"#9ca3af", marginTop:3}}>Last 6 months · {filtered.length} entries</div>
        </div>
        <button className="btn-ghost" onClick={exportLogs} style={{fontSize:12}}>Export CSV</button>
      </div>

      {/* Filters */}
      <div style={{display:"flex", gap:10, marginBottom:20, flexWrap:"wrap"}}>
        <div><label className="field-label">From</label><input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} style={{width:150}} /></div>
        <div><label className="field-label">To</label><input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} style={{width:150}} /></div>
        <div><label className="field-label">Action</label>
          <select value={actionFilter} onChange={e=>setActionFilter(e.target.value)} style={{width:160}}>
            {actions.map(a=><option key={a} value={a}>{a === "All" ? "All Actions" : a.replace(/_/g," ")}</option>)}
          </select>
        </div>
        <div><label className="field-label">User</label>
          <select value={userFilter} onChange={e=>setUserFilter(e.target.value)} style={{width:150}}>
            {users.map(u=><option key={u} value={u}>{u === "All" ? "All Users" : u}</option>)}
          </select>
        </div>
        {(dateFrom||dateTo||actionFilter!=="All"||userFilter!=="All") && (
          <div style={{display:"flex",alignItems:"flex-end"}}>
            <button className="btn-ghost" style={{fontSize:11}} onClick={()=>{setDateFrom("");setDateTo("");setActionFilter("All");setUserFilter("All");}}>Clear Filters</button>
          </div>
        )}
      </div>

      {loading ? (
        <div style={{textAlign:"center",padding:40,color:"#9ca3af"}}>Loading logs…</div>
      ) : grouped.length === 0 ? (
        <div style={{textAlign:"center",padding:"48px 20px",color:"#d1d5db"}}>
          <div style={{marginBottom:12,display:"flex",justifyContent:"center"}}><ClipboardList size={36} color="#8a96b8" /></div>
          <div style={{fontWeight:600,color:"#6b7280",marginBottom:6}}>No activity found</div>
          <div style={{fontSize:12}}>Activity will appear here as changes are made.</div>
        </div>
      ) : (
        grouped.map(([date, entries]) => (
          <div key={date} style={{marginBottom:24}}>
            <div style={{fontSize:12,fontWeight:700,color:"#9ca3af",textTransform:"uppercase",letterSpacing:0.8,marginBottom:10}}>
              {formatDate(date)}
            </div>
            <div className="card" style={{padding:6}}>
              {entries.map((entry, i) => {
                const color = ACTION_COLORS[entry.action_type] || "#8a96b8";
                const icon = ACTION_ICONS[entry.action_type] || <FileText size={16} />;
                return (
                  <div key={entry.id} style={{
                    display:"flex", alignItems:"flex-start", gap:12,
                    padding:"10px 14px",
                    borderBottom: i < entries.length-1 ? "1px solid #f0f2f8" : "none"
                  }}>
                    <div style={{
                      width:32, height:32, borderRadius:"50%", flexShrink:0,
                      background:color+"18", border:`1.5px solid ${color}33`,
                      display:"flex", alignItems:"center", justifyContent:"center", fontSize:14
                    }}><span style={{color, display:"flex"}}>{icon}</span></div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:14, color:"#111827", fontWeight:500}}>{entry.description}</div>
                      <div style={{display:"flex", gap:12, marginTop:3}}>
                        <span style={{fontSize:12, color:"#9ca3af"}}>{entry.user_name}</span>
                        <span style={{fontSize:12, color:"#d1d5db"}}>{formatTime(entry.created_at)}</span>
                        <span style={{background:color+"18",border:`1px solid ${color}33`,color,borderRadius:20,padding:"0px 8px",fontSize:11,fontWeight:600}}>
                          {(entry.action_type||"").replace(/_/g," ")}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
