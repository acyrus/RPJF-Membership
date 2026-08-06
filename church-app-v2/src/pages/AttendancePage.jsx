import { useState, useEffect, useRef } from "react";
import { supabase } from "../supabase";
import { Avatar, RoleBadge, SERVICE_NAMES, fullName, useHeaderOffset } from "../components";
import { Check, ClipboardList, X, Search, ChevronLeft, FileText, Pencil } from "lucide-react";

// Render list OR detail on mobile (master-detail), both side-by-side on desktop.
function useIsMobile(bp = 768) {
  const q = `(max-width: ${bp}px)`;
  const [m, setM] = useState(() => typeof window !== "undefined" && window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = e => setM(e.matches);
    mq.addEventListener ? mq.addEventListener("change", on) : mq.addListener(on);
    return () => { mq.removeEventListener ? mq.removeEventListener("change", on) : mq.removeListener(on); };
  }, [q]);
  return m;
}

async function logActivity(supabaseClient, action_type, description, user_id, user_name) {
  await supabaseClient.from("activity_log").insert({ action_type, description, user_id, user_name });
}

async function logAttActivity(supabaseClient, action_type, description, user_id, user_name) {
  try { await supabaseClient.from("activity_log").insert({ action_type, description, user_id, user_name }); } catch(e) {}
}

export default function AttendancePage({ profile, members, households = [], services, setServices, attendance, setAttendance }) {
  const isAdmin = profile?.role === "admin";
  const canCreateService = ["admin","leadership","usher"].includes(profile?.role);
  const isMobile = useIsMobile();
  const headerOffset = useHeaderOffset();
  const lastCardRef = useRef(null);
  const [lastViewedId, setLastViewedId] = useState(null); // to return to the same spot on mobile
  const householdById = Object.fromEntries(households.map(h => [h.id, h.name]));
  const sortedHouseholds = [...households].sort((a, b) => a.name.localeCompare(b.name));
  const [activeId, setActiveId] = useState(null);
  const [loadingAtt, setLoadingAtt] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [exportFrom, setExportFrom] = useState("");
  const [exportTo, setExportTo] = useState("");
  const [exportLoading, setExportLoading] = useState(false);
  const [newSvc, setNewSvc] = useState({ name: SERVICE_NAMES[0], service_date: "", description: "" });
  const [error, setError] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [exportServiceFilter, setExportServiceFilter] = useState("All");
  const [monthFilter, setMonthFilter] = useState("All");
  const [yearFilter, setYearFilter] = useState("All");
  const [dateFilter, setDateFilter] = useState("");        // exact service date
  const [attSearch, setAttSearch] = useState("");          // search members within a service by name
  const [famFilter, setFamFilter] = useState("all");       // filter members by household/family
  const [serviceTypes, setServiceTypes] = useState(() => SERVICE_NAMES.map(n => ({ id: n, name: n })));
  const [typesReady, setTypesReady] = useState(false);     // service_types table present + loaded
  const [showTypes, setShowTypes] = useState(false);
  const [newTypeName, setNewTypeName] = useState("");
  const [editTypeId, setEditTypeId] = useState(null);      // service type being renamed
  const [editTypeName, setEditTypeName] = useState("");
  const [addingType, setAddingType] = useState(false);     // inline "new type" inside New Service
  const [editingNote, setEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  function startEditNote(active) { setNoteDraft(active?.description || ""); setEditingNote(true); }
  async function saveNote() {
    const desc = noteDraft.trim();
    setSavingNote(true);
    const { error } = await supabase.from("services").update({ description: desc || null }).eq("id", activeId);
    setSavingNote(false);
    if (error) { setError(error.message); return; }
    setServices(prev => prev.map(s => s.id === activeId ? { ...s, description: desc || null } : s));
    setEditingNote(false);
  }

  // Load editable service types; fall back to the presets if the table isn't migrated yet.
  useEffect(() => {
    supabase.from("service_types").select("*").order("name").then(({ data, error }) => {
      if (error) return;
      setServiceTypes(data || []);
      setTypesReady(true);
    });
  }, []);

  async function addType() {
    const name = newTypeName.trim();
    if (!name) return;
    if (serviceTypes.some(t => t.name.toLowerCase() === name.toLowerCase())) { setNewTypeName(""); return; }
    const { data, error } = await supabase.from("service_types").insert({ name }).select().single();
    if (error) { setError(error.message); return; }
    setServiceTypes(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
    setNewTypeName("");
  }
  async function removeType(id) {
    const { error } = await supabase.from("service_types").delete().eq("id", id);
    if (error) { setError(error.message); return; }
    setServiceTypes(prev => prev.filter(t => t.id !== id));
  }
  // Add a type from inside the New Service modal, then select it for the new service.
  async function addTypeInline() {
    const name = newTypeName.trim();
    if (!name) return;
    const existing = serviceTypes.find(t => t.name.toLowerCase() === name.toLowerCase());
    if (existing) { setNewSvc(s => ({ ...s, name: existing.name })); setNewTypeName(""); setAddingType(false); return; }
    const { data, error } = await supabase.from("service_types").insert({ name }).select().single();
    if (error) { setError(error.message); return; }
    setServiceTypes(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
    setNewSvc(s => ({ ...s, name: data.name }));
    setNewTypeName(""); setAddingType(false);
  }
  function startRename(t) { setEditTypeId(t.id); setEditTypeName(t.name); setError(""); }
  async function renameType(id) {
    const cur = serviceTypes.find(t => t.id === id);
    const newName = editTypeName.trim();
    if (!cur || !newName || newName === cur.name) { setEditTypeId(null); return; }
    if (serviceTypes.some(t => t.id !== id && t.name.toLowerCase() === newName.toLowerCase())) { setError("A type with that name already exists."); return; }
    const oldName = cur.name;
    const { error } = await supabase.from("service_types").update({ name: newName }).eq("id", id);
    if (error) { setError(error.message); return; }
    // Rename existing services under the old name too, so history and analytics stay grouped.
    await supabase.from("services").update({ name: newName }).eq("name", oldName);
    setServiceTypes(prev => prev.map(t => t.id === id ? { ...t, name: newName } : t).sort((a, b) => a.name.localeCompare(b.name)));
    setServices(prev => prev.map(s => s.name === oldName ? { ...s, name: newName } : s));
    setEditTypeId(null); setEditTypeName("");
  }

  // Filter services by type / year / month / exact date
  const filteredServices = services.filter(s => {
    const matchType  = typeFilter === "All" || s.name === typeFilter;
    const matchYear  = yearFilter === "All" || s.service_date.slice(0,4) === yearFilter;
    const matchMonth = monthFilter === "All" || parseInt(s.service_date.slice(5,7)) === parseInt(monthFilter);
    const matchDate  = !dateFilter || s.service_date === dateFilter;
    return matchType && matchYear && matchMonth && matchDate;
  });
  const anyFilter = typeFilter !== "All" || yearFilter !== "All" || monthFilter !== "All" || dateFilter !== "";

  // On mobile, returning from a service scrolls the list back to it (kept highlighted).
  useEffect(() => {
    if (!activeId && lastViewedId && lastCardRef.current) lastCardRef.current.scrollIntoView({ block: "center" });
  }, [activeId, lastViewedId]);

  async function selectService(id) {
    setActiveId(id);
    setEditingNote(false);
    setLastViewedId(null);
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
    setShowAdd(false); setNewSvc({ name: SERVICE_NAMES[0], service_date: "", description: "" }); setError("");
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
      {(!isMobile || !activeId) && (<>
      <div style={ isMobile
        ? {display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10,position:"sticky",top:headerOffset,zIndex:30,background:"var(--bg-body)",paddingTop:8,paddingBottom:10,marginLeft:-14,marginRight:-14,paddingLeft:14,paddingRight:14,marginBottom:14,boxShadow:"0 6px 8px -6px #00000022"}
        : {display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:10} }>
        <div style={{fontFamily:"'Inter',sans-serif",color:"var(--text)",fontSize:14,letterSpacing:0.2,fontWeight:600}}>SERVICES</div>
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
          <input type="date" value={dateFilter} onChange={e=>{setDateFilter(e.target.value);setActiveId(null);}} title="Filter by exact date" style={{width:150,fontSize:12}} />
          <button className="btn-ghost" onClick={()=>setShowExport(true)}>Export</button>
          {isAdmin && typesReady && <button className="btn-ghost" onClick={()=>{setShowTypes(true);setError("");}}>Service types</button>}
          {canCreateService && <button className="btn-primary" onClick={()=>{setShowAdd(true);setError("");setAddingType(false);setNewSvc(s=>({...s,name:serviceTypes[0]?.name||""}));}}>+ New Service</button>}
        </div>
      </div>
      {anyFilter && (
        <div style={{fontSize:12,color:"var(--brand)",marginBottom:12,fontWeight:500,display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
          Showing {filteredServices.length} service{filteredServices.length!==1?"s":""}
          {typeFilter !== "All" && <> · {typeFilter}</>}
          {dateFilter && <> · {dateFilter}</>}
          {monthFilter !== "All" && <> · {["January","February","March","April","May","June","July","August","September","October","November","December"][parseInt(monthFilter)-1]}</>}
          {yearFilter !== "All" && <> · {yearFilter}</>}
          <button onClick={()=>{setTypeFilter("All");setYearFilter("All");setMonthFilter("All");setDateFilter("");setActiveId(null);}} style={{background:"none",border:"1px solid var(--border-navy-strong)",borderRadius:20,color:"var(--text-faint)",cursor:"pointer",fontSize:12,padding:"1px 8px"}}>Clear</button>
        </div>
      )}
      </>)}

      <div className="att-grid" style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"260px 1fr",gap:20}}>
        {(!isMobile || !activeId) && (
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {filteredServices.length === 0 && <div style={{color:"var(--text-faint)",fontSize:14,textAlign:"center",padding:20}}>{typeFilter==="All"?"No services yet":"No "+typeFilter+" services found"}</div>}
          {filteredServices.map(s => {
            const d = new Date(s.service_date+"T12:00:00");
            return (
              <div key={s.id} ref={(activeId===s.id||lastViewedId===s.id)?lastCardRef:null} className={`service-card ${(activeId===s.id||lastViewedId===s.id)?"active":""}`} onClick={()=>selectService(s.id)}>
                <div style={{width:48,minHeight:48,borderRadius:10,background:(activeId===s.id||lastViewedId===s.id)?"#2a535720":"var(--panel)",border:"1.5px solid var(--border-navy)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",flexShrink:0,padding:"4px 0"}}>
                  <div style={{fontFamily:"'Inter',sans-serif",fontSize:17,color:"var(--brand)",fontWeight:600,lineHeight:1.05}}>{d.getDate()}</div>
                  <div style={{fontSize:10,color:"var(--text-faint)",letterSpacing:0.2}}>{d.toLocaleString("default",{month:"short"}).toUpperCase()}</div>
                  <div style={{fontSize:9,color:"var(--text-faint)",fontWeight:600}}>{d.getFullYear()}</div>
                </div>
                <div style={{flex:1, minWidth:0}}>
                  <div style={{fontSize:14,fontWeight:700,color:"var(--text)"}}>{s.name}</div>
                  <div style={{fontSize:12,color:"var(--text-faint)",marginTop:2}}>{s.attendance_count||0} / {total} present</div>
                  {s.description && <div style={{fontSize:11,color:"var(--text-muted)",marginTop:3,display:"flex",alignItems:"center",gap:4,overflow:"hidden"}}><FileText size={11} style={{flexShrink:0}} /><span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.description}</span></div>}
                </div>
                {isAdmin && <button onClick={e=>{e.stopPropagation();deleteService(s.id);}} style={{background:"none",border:"none",color:"#e0a0a0",cursor:"pointer",fontSize:16,padding:4}}><X size={13} /></button>}
              </div>
            );
          })}
        </div>
        )}

        {(!isMobile || activeId) && (activeId ? (
          <div className="card fade-in" style={{padding:20}}>
            {loadingAtt ? <div style={{textAlign:"center",color:"var(--text-faint)",padding:40}}>Loading…</div> : (
              <>
                {isMobile && (
                  <button onClick={()=>{setLastViewedId(activeId);setActiveId(null);}} style={{display:"inline-flex",alignItems:"center",gap:5,background:"none",border:"none",color:"var(--brand)",cursor:"pointer",fontSize:13,fontWeight:600,padding:"0 0 12px"}}>
                    <ChevronLeft size={16} /> Back to services
                  </button>
                )}
                <div style={{display:"flex",flexDirection:isMobile?"column":"row",justifyContent:"space-between",alignItems:isMobile?"stretch":"center",marginBottom:16,flexWrap:"wrap",gap:12}}>
                  <div style={{minWidth:0, flex:1}}>
                    <div style={{fontFamily:"'Inter',sans-serif",fontSize:15,color:"var(--text)",fontWeight:600}}>{active?.name}</div>
                    <div style={{fontSize:12,color:"var(--text-faint)",marginTop:2}}>{active?.service_date?.split("-").reverse().join("-")}</div>
                    {editingNote ? (
                      <div style={{marginTop:8,maxWidth:480}}>
                        <textarea rows={2} autoFocus value={noteDraft} onChange={e=>setNoteDraft(e.target.value)} placeholder="Add a note about this service…" style={{resize:"vertical",fontSize:12.5}} />
                        <div style={{display:"flex",gap:8,marginTop:6}}>
                          <button className="btn-primary" style={{fontSize:11,padding:"5px 12px"}} onClick={saveNote} disabled={savingNote}>{savingNote?"Saving…":"Save note"}</button>
                          <button className="btn-ghost" style={{fontSize:11,padding:"5px 12px"}} onClick={()=>setEditingNote(false)}>Cancel</button>
                        </div>
                      </div>
                    ) : active?.description ? (
                      <div style={{fontSize:12.5,color:"var(--text-2)",marginTop:8,lineHeight:1.5,maxWidth:480,display:"flex",gap:6,background:"var(--panel)",padding:"8px 10px",borderRadius:8}}>
                        <FileText size={13} style={{flexShrink:0,marginTop:1,color:"var(--brand)"}} />
                        <span style={{flex:1}}>{active.description}</span>
                        {canCreateService && <button onClick={()=>startEditNote(active)} title="Edit note" style={{background:"none",border:"none",color:"var(--brand)",cursor:"pointer",padding:0,flexShrink:0}}><Pencil size={12} /></button>}
                      </div>
                    ) : canCreateService ? (
                      <button onClick={()=>startEditNote(active)} style={{marginTop:6,background:"none",border:"none",color:"var(--brand)",cursor:"pointer",fontSize:12,fontWeight:600,padding:0,display:"inline-flex",alignItems:"center",gap:5}}><Pencil size={12} /> Add a note</button>
                    ) : null}
                  </div>
                  {isMobile ? (
                    <div style={{display:"flex",gap:16,alignItems:"baseline",flexWrap:"wrap"}}>
                      <span style={{fontSize:15,fontWeight:700,color:"var(--brand)"}}>{present}<span style={{fontSize:11,color:"var(--text-faint)",fontWeight:500}}> present</span></span>
                      <span style={{fontSize:15,fontWeight:700,color:"#e05050"}}>{total-present}<span style={{fontSize:11,color:"var(--text-faint)",fontWeight:500}}> absent</span></span>
                      <span style={{fontSize:15,fontWeight:700,color:"var(--text-2)"}}>{total?Math.round((present/total)*100):0}%<span style={{fontSize:11,color:"var(--text-faint)",fontWeight:500}}> rate</span></span>
                    </div>
                  ) : (
                  <div style={{display:"flex",gap:10}}>
                    <div className="stat-box"><div className="stat-num">{present}</div><div className="stat-label">Present</div></div>
                    <div className="stat-box"><div className="stat-num">{total-present}</div><div className="stat-label">Absent</div></div>
                    <div className="stat-box"><div className="stat-num">{total?Math.round((present/total)*100):0}%</div><div className="stat-label">Rate</div></div>
                  </div>
                  )}
                </div>
                <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap",alignItems:"center"}}>
                  <button className="btn-ghost" style={{fontSize:11}} onClick={markAll}>Mark All Present</button>
                  <button className="btn-ghost" style={{fontSize:11}} onClick={clearAll}>Clear All</button>
                  <button className="btn-ghost" style={{fontSize:11}} onClick={exportAttendanceCSV}>Export CSV</button>
                  <div style={{display:"flex",gap:8,alignItems:"center",marginLeft:"auto",flexWrap:"wrap"}}>
                    <div style={{position:"relative"}}>
                      <Search size={13} style={{position:"absolute",left:9,top:"50%",transform:"translateY(-50%)",color:"var(--text-faint)"}} />
                      <input placeholder="Search name…" value={attSearch} onChange={e=>setAttSearch(e.target.value)} style={{width:150,paddingLeft:28,fontSize:12}} />
                    </div>
                    <select value={famFilter} onChange={e=>setFamFilter(e.target.value)} title="Filter by family" style={{width:160,fontSize:12}}>
                      <option value="all">All families</option>
                      {sortedHouseholds.map(h=><option key={h.id} value={h.id}>{h.name}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:2,maxHeight:isMobile?"max(220px, calc(100dvh - 380px))":"56vh",overflowY:"auto",paddingRight:2}}>
                  {[...members].filter(m => { const q=attSearch.trim().toLowerCase(); const nameOk=!q||fullName(m).toLowerCase().includes(q); const famOk=famFilter==="all"||m.household_id===famFilter; return nameOk && famOk; }).sort((a,b) => { const ln = a.last_name.localeCompare(b.last_name); return ln !== 0 ? ln : a.first_name.localeCompare(b.first_name); }).map(m => {
                    const isPresent = presentIds.has(m.id);
                    return (
                      <div key={m.id} className="att-row" style={{flexShrink:0}} onClick={()=>toggle(m.id)}>
                        <div className={`check-circle ${isPresent?"checked":""}`}>{isPresent && <Check size={14} color="#fff" />}</div>
                        <Avatar member={m} size={36} />
                        <div style={{flex:1}}>
                          <div style={{fontWeight:600,fontSize:14,color:"var(--text)"}}>{fullName(m)}</div>
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
          <div className="card" style={{display:"flex",alignItems:"center",justifyContent:"center",color:"var(--border-strong)",fontSize:14,minHeight:200,flexDirection:"column",gap:8}}>
            <span style={{display:"flex"}}><ClipboardList size={28} color="#8a96b8" /></span>
            Select a service to take attendance
          </div>
        ))}
      </div>

      {showAdd && (
        <div className="modal-bg" onClick={()=>setShowAdd(false)}>
          <div className="modal fade-in" onClick={e=>e.stopPropagation()}>
            <h2>NEW SERVICE</h2>
            <div className="field-group">
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <label className="field-label">Service Name</label>
                {isAdmin && typesReady && !addingType && <button onClick={()=>{setAddingType(true);setNewTypeName("");setError("");}} style={{background:"none",border:"none",color:"var(--brand)",cursor:"pointer",fontSize:11,fontWeight:600,padding:0}}>+ New type</button>}
              </div>
              {addingType ? (
                <div style={{display:"flex",gap:8}}>
                  <input autoFocus placeholder="New type name, e.g. Prayer Meeting" value={newTypeName} onChange={e=>setNewTypeName(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();addTypeInline();}if(e.key==="Escape")setAddingType(false);}} style={{flex:1}} />
                  <button className="btn-primary" onClick={addTypeInline} disabled={!newTypeName.trim()}>Add</button>
                  <button className="btn-ghost" onClick={()=>setAddingType(false)}>Cancel</button>
                </div>
              ) : (
                <select value={newSvc.name} onChange={e=>setNewSvc({...newSvc,name:e.target.value})}>
                  {serviceTypes.length===0 && <option value="">No types yet — add one</option>}
                  {serviceTypes.map(t=><option key={t.id} value={t.name}>{t.name}</option>)}
                </select>
              )}</div>
            <div className="field-group"><label className="field-label">Date *</label>
              <input type="date" value={newSvc.service_date} onChange={e=>setNewSvc({...newSvc,service_date:e.target.value})} /></div>
            <div className="field-group"><label className="field-label">Description (optional)</label>
              <textarea rows={2} value={newSvc.description} onChange={e=>setNewSvc({...newSvc,description:e.target.value})} placeholder="e.g. Guest speaker, combined service, special theme…" style={{resize:"vertical"}} /></div>
            {error && <div className="error-msg">{error}</div>}
            <div style={{display:"flex",gap:10,marginTop:6}}>
              <button className="btn-primary" style={{flex:1}} onClick={addService}>Create Service</button>
              <button className="btn-ghost" onClick={()=>setShowAdd(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
      {showTypes && (
        <div className="modal-bg" onClick={()=>setShowTypes(false)}>
          <div className="modal fade-in" onClick={e=>e.stopPropagation()} style={{maxWidth:440}}>
            <h2>SERVICE TYPES</h2>
            <div style={{fontSize:12,color:"var(--text-muted)",marginBottom:14,lineHeight:1.6}}>
              Create, rename, or remove the service types shown when adding a service. Renaming one
              also updates every service already recorded under that name, so history stays grouped.
              Removing one only takes it off the picker; services keep their name.
            </div>
            <div style={{display:"flex",gap:8,marginBottom:14}}>
              <input placeholder="New type, e.g. Prayer Meeting" value={newTypeName} onChange={e=>setNewTypeName(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")addType();}} />
              <button className="btn-primary" onClick={addType} disabled={!newTypeName.trim()}>Add</button>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:6,maxHeight:280,overflowY:"auto"}}>
              {serviceTypes.length===0 && <div style={{fontSize:12,color:"var(--text-faint)",textAlign:"center",padding:16}}>No types yet — add one above.</div>}
              {serviceTypes.map(t=>(
                <div key={t.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,padding:"8px 10px",border:"1px solid var(--border)",borderRadius:8}}>
                  {editTypeId===t.id ? (
                    <>
                      <input autoFocus value={editTypeName} onChange={e=>setEditTypeName(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")renameType(t.id);if(e.key==="Escape")setEditTypeId(null);}} style={{flex:1,fontSize:13}} />
                      <button onClick={()=>renameType(t.id)} title="Save name" style={{background:"none",border:"1px solid var(--brand)",borderRadius:6,color:"var(--brand)",cursor:"pointer",padding:"3px 8px"}}><Check size={13}/></button>
                      <button onClick={()=>setEditTypeId(null)} title="Cancel" style={{background:"none",border:"1px solid var(--border)",borderRadius:6,color:"var(--text-faint)",cursor:"pointer",padding:"3px 8px"}}><X size={13}/></button>
                    </>
                  ) : (
                    <>
                      <span style={{flex:1,minWidth:0,fontSize:13,fontWeight:600,color:"var(--text)"}}>{t.name}</span>
                      <button onClick={()=>startRename(t)} title="Rename type" style={{background:"none",border:"1px solid var(--border)",borderRadius:6,color:"var(--text-muted)",cursor:"pointer",padding:"3px 8px"}}><Pencil size={12}/></button>
                      <button onClick={()=>removeType(t.id)} title="Remove type" style={{background:"none",border:"1px solid var(--danger-border)",borderRadius:6,color:"var(--danger)",cursor:"pointer",padding:"3px 8px"}}><X size={13}/></button>
                    </>
                  )}
                </div>
              ))}
            </div>
            <div style={{display:"flex",justifyContent:"flex-end",marginTop:16}}>
              <button className="btn-ghost" onClick={()=>setShowTypes(false)}>Done</button>
            </div>
          </div>
        </div>
      )}
      {showExport && (
        <div className="modal-bg" onClick={()=>setShowExport(false)}>
          <div className="modal fade-in" onClick={e=>e.stopPropagation()}>
            <h2>EXPORT ATTENDANCE</h2>
            <div style={{fontSize:12,color:"var(--text-muted)",marginBottom:18,lineHeight:1.7}}>
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
                <div style={{fontSize:12,color:"var(--brand)",marginTop:4,fontWeight:500}}>
                  Exporting {exportServiceFilter} services only
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
              <div style={{fontSize:12,color:"var(--text-faint)",letterSpacing:0.2,textTransform:"uppercase",fontWeight:700,marginBottom:8}}>Quick Select</div>
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
              <div style={{background:"var(--panel)",borderRadius:8,padding:"10px 12px",marginBottom:14,fontSize:12,color:"var(--text)"}}>
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
