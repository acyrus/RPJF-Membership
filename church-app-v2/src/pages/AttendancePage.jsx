import { useState, useMemo } from "react";
import { supabase } from "../supabase";
import { Avatar, RoleBadge, SERVICE_NAMES, fullName } from "../components";
import { Check, ClipboardList, X } from "lucide-react";

async function logActivity(supabaseClient, action_type, description, user_id, user_name) {
  await supabaseClient.from("activity_log").insert({ action_type, description, user_id, user_name });
}

async function logAttActivity(supabaseClient, action_type, description, user_id, user_name) {
  try { await supabaseClient.from("activity_log").insert({ action_type, description, user_id, user_name }); } catch(e) {}
}

export default function AttendancePage({ profile, members, services, setServices, attendance, setAttendance }) {
  const isAdmin = profile?.role === "admin";
  const [activeId, setActiveId] = useState(null);
  const [loadingAtt, setLoadingAtt] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [exportFrom, setExportFrom] = useState("");
  const [exportTo, setExportTo] = useState("");
  const [exportLoading, setExportLoading] = useState(false);
  const [newSvc, setNewSvc] = useState({ name: SERVICE_NAMES[0], service_date: "" });
  const [error, setError] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [exportServiceFilter, setExportServiceFilter] = useState("All");
  const [monthFilter, setMonthFilter] = useState("All");
  const [yearFilter, setYearFilter] = useState("All");

  // Get unique service types
  const serviceTypes = ["All", ...new Set(services.map(s => s.name))];

  // Filter services by type
  const filteredServices = services.filter(s => {
    const matchType  = typeFilter === "All" || s.name === typeFilter;
    const matchYear  = yearFilter === "All" || s.service_date.slice(0,4) === yearFilter;
    const matchMonth = monthFilter === "All" || parseInt(s.service_date.slice(5,7)) === parseInt(monthFilter);
    return matchType && matchYear && matchMonth;
  });

  async function selectService(id) {
    setActiveId(id);
    if (attendance[id]) return; // already loaded
    setLoadingAtt(true);
    const { data } = await supabase.from("attendance").select("member_id").eq("service_id", id);
    setAttendance(prev => ({ ...prev, [id]: (data||[]).map(r => r.member_id) }));
    setLoadingAtt(false);
  }

  const presentIds = activeId ? new Set(attendance[activeId] || []) : new Set();

  async function toggle(memberId) {
    const wasPresent = presentIds.has(memberId);
    const current = attendance[activeId] || [];
    setAttendance(prev => ({
      ...prev,
      [activeId]: wasPresent ? current.filter(id=>id!==memberId) : [...current, memberId]
    }));
    setServices(prev => prev.map(s => s.id===activeId ? {...s, attendance_count: (s.attendance_count||0)+(wasPresent?-1:1)} : s));
    if (wasPresent) {
      await supabase.from("attendance").delete().eq("service_id", activeId).eq("member_id", memberId);
    } else {
      await supabase.from("attendance").insert({ service_id: activeId, member_id: memberId, marked_by: profile.id });
    }
  }

  async function markAll() {
    const ids = members.map(m => m.id);
    setAttendance(prev => ({ ...prev, [activeId]: ids }));
    setServices(prev => prev.map(s => s.id===activeId ? {...s,attendance_count:ids.length} : s));
    await supabase.from("attendance").delete().eq("service_id", activeId);
    if (ids.length) await supabase.from("attendance").insert(ids.map(id => ({ service_id: activeId, member_id: id, marked_by: profile.id })));
  }

  async function clearAll() {
    setAttendance(prev => ({ ...prev, [activeId]: [] }));
    setServices(prev => prev.map(s => s.id===activeId ? {...s,attendance_count:0} : s));
    await supabase.from("attendance").delete().eq("service_id", activeId);
  }

  async function addService() {
    if (!newSvc.service_date) return setError("Please select a date");
    const { data, error: e } = await supabase.from("services").insert({ ...newSvc, created_by: profile.id }).select().single();
    if (e) return setError(e.message);
    setServices(prev => [{ ...data, attendance_count: 0 }, ...prev]);
    setAttendance(prev => ({ ...prev, [data.id]: [] }));
    try { await logAct('service_created', `Created service: ${newSvc.name} on ${newSvc.service_date}`, profile.id, profile.name); } catch(e) {}
    setShowAdd(false); setNewSvc({ name: SERVICE_NAMES[0], service_date: "" }); setError("");
  }

  async function deleteService(id) {
    if (!confirm("Delete this service record?")) return;
    const svcToDel = services.find(s=>s.id===id);
    await supabase.from("services").delete().eq("id", id);
    setServices(prev => prev.filter(s => s.id !== id));
    if (activeId === id) setActiveId(null);
    logAct("service_deleted", `Deleted service: ${svcToDel?.name} on ${svcToDel?.service_date}`);
  }

  async function logAct(action, desc) {
    await logAttActivity(supabase, action, desc, profile.id, profile.name);
  }

  function exportAttendanceCSV() {
    if (!activeId) return;
    const svc = services.find(s => s.id === activeId);
    const headers = ["Name","Sex","Role(s)","Status"];
    const rows = members.map(m => [
      fullName(m), m.sex||"", (m.roles||[]).join("; "),
      presentIds.has(m.id) ? "Present" : "Absent"
    ]);
    const csv = [headers,...rows].map(r=>r.map(v=>`"${v}"`).join(",")).join("\n");
    const blob = new Blob([csv],{type:"text/csv"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href=url; a.download=`attendance-${svc?.service_date||"export"}.csv`; a.click();
    URL.revokeObjectURL(url);
    logAct("export", `Exported attendance for ${svc?.name} on ${svc?.service_date}`);
  }

  async function exportRangeCSV() {
    if (!exportFrom || !exportTo) return;
    setExportLoading(true);

    // Filter services within the date range
    const rangeServices = services.filter(s =>
      s.service_date >= exportFrom && s.service_date <= exportTo &&
      (exportServiceFilter === "All" || s.name === exportServiceFilter)
    ).sort((a,b) => a.service_date.localeCompare(b.service_date));

    if (rangeServices.length === 0) {
      setExportLoading(false);
      alert("No services found in that date range.");
      return;
    }

    // Fetch attendance for any services not yet loaded
    const toFetch = rangeServices.filter(s => !attendance[s.id]);
    if (toFetch.length > 0) {
      const { data } = await supabase.from("attendance")
        .select("service_id, member_id")
        .in("service_id", toFetch.map(s => s.id));
      const newAtt = {};
      (data||[]).forEach(a => {
        if (!newAtt[a.service_id]) newAtt[a.service_id] = [];
        newAtt[a.service_id].push(a.member_id);
      });
      toFetch.forEach(s => { if (!newAtt[s.id]) newAtt[s.id] = []; });
      setAttendance(prev => ({ ...prev, ...newAtt }));
      // Use merged attendance for export
      const merged = { ...attendance, ...newAtt };
      buildAndDownloadRangeCSV(rangeServices, merged);
    } else {
      buildAndDownloadRangeCSV(rangeServices, attendance);
    }
    setExportLoading(false);
    setShowExport(false);
  }

  function buildAndDownloadRangeCSV(rangeServices, att) {
    // Header row: Name, Sex, Roles, then one column per service date
    const svcHeaders = rangeServices.map(s => `${s.service_date} (${s.name})`);
    const headers = ["First Name", "Last Name", "Sex", "Marital Status", "Roles", ...svcHeaders, "Total Present", "Total Services", "Attendance %"];

    const rows = members.map(m => {
      const svcCols = rangeServices.map(s => (att[s.id]||[]).includes(m.id) ? "Present" : "Absent");
      const totalPresent = svcCols.filter(v => v === "Present").length;
      const pct = rangeServices.length > 0 ? Math.round((totalPresent / rangeServices.length) * 100) : 0;
      return [
        m.first_name||"", m.last_name||"",
        m.sex||"", m.marital_status||"",
        (m.roles||[]).join("; "),
        ...svcCols,
        totalPresent, rangeServices.length, `${pct}%`
      ];
    });

    // Sort by last name
    rows.sort((a,b) => a[1].localeCompare(b[1]));

    // Summary row
    const summaryRow = ["TOTAL PRESENT", "", "", "", "",
      ...rangeServices.map(s => (att[s.id]||[]).length),
      "", "", ""
    ];

    const csv = [headers, ...rows, [], summaryRow]
      .map(r => r.map(v => `"${v}"`).join(",")).join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `attendance-${exportServiceFilter !== "All" ? exportServiceFilter.replace(/\s+/g,"-")+"-" : ""}${exportFrom}-to-${exportTo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    logAct("export", `Exported attendance range ${exportFrom} to ${exportTo}`);
  }

  const active = services.find(s => s.id === activeId);
  const present = presentIds.size, total = members.length;

  return (
    <div className="fade-in">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:10}}>
        <div style={{fontFamily:"'Inter',sans-serif",color:"#111827",fontSize:14,letterSpacing:0.2,fontWeight:600}}>SERVICE SESSIONS</div>
        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
          <select
            value={typeFilter}
            onChange={e=>{setTypeFilter(e.target.value);setActiveId(null);}}
            style={{width:180,fontSize:12,fontWeight:500}}>
            <option value="All">All Service Types</option>
            {[...new Set(services.map(s=>s.name))].sort().map(n=>(
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
          <select
            value={yearFilter}
            onChange={e=>{setYearFilter(e.target.value);setActiveId(null);}}
            style={{width:110,fontSize:12,fontWeight:500}}>
            <option value="All">All Years</option>
            {[...new Set(services.map(s=>s.service_date.slice(0,4)))].sort().reverse().map(y=>(
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <select
            value={monthFilter}
            onChange={e=>{setMonthFilter(e.target.value);setActiveId(null);}}
            style={{width:130,fontSize:12,fontWeight:500}}>
            <option value="All">All Months</option>
            {["January","February","March","April","May","June","July","August","September","October","November","December"].map((name,i)=>(
              <option key={name} value={String(i+1)}>{name}</option>
            ))}
          </select>
          <button className="btn-ghost" onClick={()=>setShowExport(true)}>Export</button>
          {isAdmin && <button className="btn-primary" onClick={()=>{setShowAdd(true);setError("");}}>+ New Service</button>}
        </div>
      </div>
      {(typeFilter !== "All" || yearFilter !== "All" || monthFilter !== "All") && (
        <div style={{fontSize:12,color:"#2a5357",marginBottom:12,fontWeight:500,display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
          Showing {filteredServices.length} session{filteredServices.length!==1?"s":""}
          {typeFilter !== "All" && <> · {typeFilter}</>}
          {monthFilter !== "All" && <> · {["January","February","March","April","May","June","July","August","September","October","November","December"][parseInt(monthFilter)-1]}</>}
          {yearFilter !== "All" && <> · {yearFilter}</>}
          <button onClick={()=>{setTypeFilter("All");setYearFilter("All");setMonthFilter("All");setActiveId(null);}} style={{background:"none",border:"1px solid #d0d7e8",borderRadius:20,color:"#9ca3af",cursor:"pointer",fontSize:12,padding:"1px 8px"}}>Clear</button>
        </div>
      )}

      <div className="att-grid" style={{display:"grid",gridTemplateColumns:"260px 1fr",gap:20}}>
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {filteredServices.length === 0 && <div style={{color:"#9ca3af",fontSize:14,textAlign:"center",padding:20}}>{typeFilter==="All"?"No services yet":"No "+typeFilter+" sessions found"}</div>}
          {filteredServices.map(s => {
            const d = new Date(s.service_date+"T12:00:00");
            return (
              <div key={s.id} className={`service-card ${activeId===s.id?"active":""}`} onClick={()=>selectService(s.id)}>
                <div style={{width:46,height:46,borderRadius:10,background:activeId===s.id?"#2a535720":"#f4f6ff",border:"1.5px solid #e4e9f5",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  <div style={{fontFamily:"'Inter',sans-serif",fontSize:17,color:"#2a5357",fontWeight:600}}>{d.getDate()}</div>
                  <div style={{fontSize:10,color:"#9ca3af",letterSpacing:0.2}}>{d.toLocaleString("default",{month:"short"}).toUpperCase()}</div>
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:14,fontWeight:700,color:"#111827"}}>{s.name}</div>
                  <div style={{fontSize:12,color:"#9ca3af",marginTop:2}}>{s.attendance_count||0} / {total} present</div>
                </div>
                {isAdmin && <button onClick={e=>{e.stopPropagation();deleteService(s.id);}} style={{background:"none",border:"none",color:"#e0a0a0",cursor:"pointer",fontSize:16,padding:4}}><X size={13} /></button>}
              </div>
            );
          })}
        </div>

        {activeId ? (
          <div className="card fade-in" style={{padding:20}}>
            {loadingAtt ? <div style={{textAlign:"center",color:"#9ca3af",padding:40}}>Loading…</div> : (
              <>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:12}}>
                  <div>
                    <div style={{fontFamily:"'Inter',sans-serif",fontSize:15,color:"#111827",fontWeight:600}}>{active?.name}</div>
                    <div style={{fontSize:12,color:"#9ca3af",marginTop:2}}>{active?.service_date}</div>
                  </div>
                  <div style={{display:"flex",gap:10}}>
                    <div className="stat-box"><div className="stat-num">{present}</div><div className="stat-label">Present</div></div>
                    <div className="stat-box"><div className="stat-num">{total-present}</div><div className="stat-label">Absent</div></div>
                    <div className="stat-box"><div className="stat-num">{total?Math.round((present/total)*100):0}%</div><div className="stat-label">Rate</div></div>
                  </div>
                </div>
                <div style={{display:"flex",gap:8,marginBottom:14}}>
                  <button className="btn-ghost" style={{fontSize:11}} onClick={markAll}>Mark All Present</button>
                  <button className="btn-ghost" style={{fontSize:11}} onClick={clearAll}>Clear All</button>
                  <button className="btn-ghost" style={{fontSize:11}} onClick={exportAttendanceCSV}>Export CSV</button>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:2}}>
                  {[...members].sort((a,b) => { const ln = a.last_name.localeCompare(b.last_name); return ln !== 0 ? ln : a.first_name.localeCompare(b.first_name); }).map(m => {
                    const isPresent = presentIds.has(m.id);
                    return (
                      <div key={m.id} className="att-row" onClick={()=>toggle(m.id)}>
                        <div className={`check-circle ${isPresent?"checked":""}`}>{isPresent && <Check size={14} color="#fff" />}</div>
                        <Avatar member={m} size={36} />
                        <div style={{flex:1}}>
                          <div style={{fontWeight:600,fontSize:14,color:"#111827"}}>{fullName(m)}</div>
                          <div style={{display:"flex",gap:4,marginTop:2,flexWrap:"wrap"}}>
                            {(m.roles||[]).map(r=><RoleBadge key={r} role={r} small />)}
                          </div>
                        </div>
                        <div style={{fontSize:12,color:isPresent?"#4caf82":"#e05050",fontWeight:700}}>{isPresent?"Present":"Absent"}</div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="card" style={{display:"flex",alignItems:"center",justifyContent:"center",color:"#d1d5db",fontSize:14,minHeight:200,flexDirection:"column",gap:8}}>
            <span style={{display:"flex"}}><ClipboardList size={28} color="#8a96b8" /></span>
            Select a service to take attendance
          </div>
        )}
      </div>

      {showAdd && (
        <div className="modal-bg" onClick={()=>setShowAdd(false)}>
          <div className="modal fade-in" onClick={e=>e.stopPropagation()}>
            <h2>NEW SERVICE SESSION</h2>
            <div className="field-group"><label className="field-label">Service Name</label>
              <select value={newSvc.name} onChange={e=>setNewSvc({...newSvc,name:e.target.value})}>
                {SERVICE_NAMES.map(n=><option key={n} value={n}>{n}</option>)}
              </select></div>
            <div className="field-group"><label className="field-label">Date *</label>
              <input type="date" value={newSvc.service_date} onChange={e=>setNewSvc({...newSvc,service_date:e.target.value})} /></div>
            {error && <div className="error-msg">{error}</div>}
            <div style={{display:"flex",gap:10,marginTop:6}}>
              <button className="btn-primary" style={{flex:1}} onClick={addService}>Create Session</button>
              <button className="btn-ghost" onClick={()=>setShowAdd(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
      {showExport && (
        <div className="modal-bg" onClick={()=>setShowExport(false)}>
          <div className="modal fade-in" onClick={e=>e.stopPropagation()}>
            <h2>EXPORT ATTENDANCE</h2>
            <div style={{fontSize:12,color:"#6b7280",marginBottom:18,lineHeight:1.7}}>
              Exports a spreadsheet with one column per service and one row per member,
              showing Present/Absent for each service plus each member's overall attendance rate.
            </div>

            <div className="field-group">
              <label className="field-label">Service Type</label>
              <select value={exportServiceFilter} onChange={e=>setExportServiceFilter(e.target.value)} style={{fontWeight:500}}>
                <option value="All">All Service Types</option>
                {[...new Set(services.map(s=>s.name))].sort().map(n=>(
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
              {exportServiceFilter !== "All" && (
                <div style={{fontSize:12,color:"#2a5357",marginTop:4,fontWeight:500}}>
                  Exporting {exportServiceFilter} sessions only
                </div>
              )}
            </div>

            <div className="field-row">
              <div>
                <label className="field-label">From Date</label>
                <input type="date" value={exportFrom} onChange={e=>setExportFrom(e.target.value)} />
              </div>
              <div>
                <label className="field-label">To Date</label>
                <input type="date" value={exportTo} onChange={e=>setExportTo(e.target.value)} />
              </div>
            </div>

            {/* Quick range shortcuts */}
            <div style={{marginBottom:16}}>
              <div style={{fontSize:12,color:"#9ca3af",letterSpacing:0.2,textTransform:"uppercase",fontWeight:700,marginBottom:8}}>Quick Select</div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                {[
                  { label:"This Month", fn:() => {
                    const now = new Date();
                    setExportFrom(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-01`);
                    setExportTo(new Date().toISOString().slice(0,10));
                  }},
                  { label:"Last Month", fn:() => {
                    const now = new Date();
                    const first = new Date(now.getFullYear(), now.getMonth()-1, 1);
                    const last = new Date(now.getFullYear(), now.getMonth(), 0);
                    setExportFrom(first.toISOString().slice(0,10));
                    setExportTo(last.toISOString().slice(0,10));
                  }},
                  { label:"Last 3 Months", fn:() => {
                    const now = new Date();
                    const from = new Date(now.getFullYear(), now.getMonth()-3, 1);
                    setExportFrom(from.toISOString().slice(0,10));
                    setExportTo(now.toISOString().slice(0,10));
                  }},
                  { label:"This Year", fn:() => {
                    const y = new Date().getFullYear();
                    setExportFrom(`${y}-01-01`);
                    setExportTo(new Date().toISOString().slice(0,10));
                  }},
                  { label:"All Time", fn:() => {
                    const sorted = [...services].sort((a,b)=>a.service_date.localeCompare(b.service_date));
                    if (sorted.length) {
                      setExportFrom(sorted[0].service_date);
                      setExportTo(sorted[sorted.length-1].service_date);
                    }
                  }},
                ].map(({label,fn})=>(
                  <button key={label} className="btn-ghost" style={{fontSize:11}} onClick={fn}>{label}</button>
                ))}
              </div>
            </div>

            {/* Preview of services in range */}
            {exportFrom && exportTo && (
              <div style={{background:"#f4f6ff",borderRadius:8,padding:"10px 12px",marginBottom:14,fontSize:12,color:"#1f2937"}}>
                {(() => {
                  const inRange = services.filter(s =>
                    s.service_date >= exportFrom && s.service_date <= exportTo &&
                    (exportServiceFilter === "All" || s.name === exportServiceFilter)
                  );
                  return inRange.length > 0
                    ? <><strong>{inRange.length} service{inRange.length>1?"s":""}</strong> in this range: {inRange.map(s=>s.service_date).join(", ")}</>
                    : <span style={{color:"#e05050"}}>No {exportServiceFilter !== "All" ? exportServiceFilter : ""} services found in this date range.</span>;
                })()}
              </div>
            )}

            <div style={{display:"flex",gap:10,marginTop:6}}>
              <button className="btn-primary" style={{flex:1}} onClick={exportRangeCSV} disabled={!exportFrom||!exportTo||exportLoading}>
                {exportLoading ? "Preparing…" : "Download CSV"}
              </button>
              <button className="btn-ghost" onClick={()=>setShowExport(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
