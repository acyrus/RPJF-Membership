import { useMemo, useState } from "react";
import { Avatar, ROLES, ROLE_COLORS, fullName } from "../components";
import { supabase } from "../supabase";
import { Search, ChevronDown } from "lucide-react";

const MUSIC_MINISTRIES = ["Musician"];
const POS_OPTIONS = ["Leader", "Co-Leader", ""]; // "" = ordinary member

function getInstruments(m) {
  return String(m.instruments || "").split(",").map(s => s.trim()).filter(Boolean);
}

export default function RolesPage({ members, households = [], profile, setMembers = () => {}, onMemberClick }) {
  const isAdmin = profile?.role === "admin";
  const [ministryFilter, setMinistryFilter] = useState("All");
  const [person, setPerson] = useState("");
  const [famFilter, setFamFilter] = useState("all");
  const [posEdit, setPosEdit] = useState(null); // { memberId, role } popover being edited
  const [err, setErr] = useState("");

  const householdById = useMemo(() => Object.fromEntries(households.map(h => [h.id, h.name])), [households]);
  const sortedHouseholds = useMemo(() => [...households].sort((a, b) => a.name.localeCompare(b.name)), [households]);

  // Distinct people involved in at least one ministry
  const totalInvolved = members.filter(m => (m.roles || []).length > 0).length;

  const pq = person.trim().toLowerCase();
  const memberFilterActive = !!pq || famFilter !== "all";
  const matchMember = (m) =>
    (!pq || fullName(m).toLowerCase().includes(pq)) &&
    (famFilter === "all" || m.household_id === famFilter);

  const rolesToShow = ministryFilter === "All" ? ROLES : ROLES.filter(r => r === ministryFilter);

  async function savePosition(memberId, role, newPos) {
    const val = newPos || null;
    setErr("");
    const { error } = await supabase.from("member_roles").update({ position: val }).eq("member_id", memberId).eq("role_name", role);
    if (error) { setErr(error.message); return; }
    setMembers(prev => prev.map(m => {
      if (m.id !== memberId) return m;
      const rp = { ...(m.rolePositions || {}) };
      if (val) rp[role] = val; else delete rp[role];
      return { ...m, rolePositions: rp };
    }));
    setPosEdit(null);
  }

  return (
    <div className="fade-in">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:10,marginBottom:14}}>
        <div style={{fontFamily:"'Inter',sans-serif",color:"var(--text)",fontSize:14,letterSpacing:0.2,fontWeight:600}}>MINISTRIES OVERVIEW</div>
        <div style={{
          background:"#2a535712", border:"1.5px solid #2a535733", color:"var(--brand)",
          borderRadius:20, padding:"6px 14px", fontSize:12, fontWeight:700,
        }}>
          Total Members Involved in Ministry: {totalInvolved}
        </div>
      </div>

      <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center",marginBottom:18}}>
        <select value={ministryFilter} onChange={e=>setMinistryFilter(e.target.value)} style={{width:190,fontSize:12,fontWeight:500}}>
          <option value="All">All ministries</option>
          {ROLES.map(r=><option key={r} value={r}>{r}</option>)}
        </select>
        <div style={{position:"relative"}}>
          <Search size={13} style={{position:"absolute",left:9,top:"50%",transform:"translateY(-50%)",color:"var(--text-faint)"}} />
          <input placeholder="Search person…" value={person} onChange={e=>setPerson(e.target.value)} style={{width:160,paddingLeft:28,fontSize:12}} />
        </div>
        <select value={famFilter} onChange={e=>setFamFilter(e.target.value)} title="Filter by family" style={{width:160,fontSize:12}}>
          <option value="all">All families</option>
          {sortedHouseholds.map(h=><option key={h.id} value={h.id}>{h.name}</option>)}
        </select>
      </div>

      {err && <div className="error-msg" style={{marginBottom:12}}>{err}</div>}

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:14}}>
        {rolesToShow.map(role => {
          const posRank = { "Leader": 0, "Co-Leader": 1 };
          // Leaders first, then co-leaders, then everyone else by name.
          const rmAll = members.filter(m=>(m.roles||[]).includes(role))
            .sort((a,b) => {
              const ra = posRank[(a.rolePositions||{})[role]] ?? 9;
              const rb = posRank[(b.rolePositions||{})[role]] ?? 9;
              return ra - rb || fullName(a).localeCompare(fullName(b));
            });
          const rm = memberFilterActive ? rmAll.filter(matchMember) : rmAll;
          // With a person/family filter on, hide ministries that have no match.
          if (memberFilterActive && rm.length === 0) return null;
          const color = ROLE_COLORS[role]||"#888";
          return (
            <div key={role} className="card" style={{padding:16,borderLeft:`3px solid ${color}`}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                <div style={{fontWeight:700,fontSize:14,color:"var(--text)"}}>{role}</div>
                <div style={{background:color+"18",border:`1.5px solid ${color}44`,color,borderRadius:20,padding:"2px 10px",fontSize:12,fontWeight:700}}>
                  {memberFilterActive ? `${rm.length}/${rmAll.length}` : rmAll.length}
                </div>
              </div>
              {rm.length===0
                ? <div style={{fontSize:12,color:"var(--border-strong)"}}>No members assigned</div>
                : <div style={{display:"flex",flexDirection:"column",gap:8}}>
                    {rm.map(m=>{
                      const instruments = MUSIC_MINISTRIES.includes(role) ? getInstruments(m) : [];
                      const pos = (m.rolePositions||{})[role] || "";
                      const editing = posEdit && posEdit.memberId===m.id && posEdit.role===role;
                      return (
                      <div key={m.id} style={{display:"flex",alignItems:"center",gap:8}}>
                        <div onClick={()=>onMemberClick(m)} style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",flex:1,minWidth:0}}>
                          <Avatar member={m} size={28} />
                          <div style={{minWidth:0}}>
                            <div style={{fontSize:12,color:"var(--text)",fontWeight:600}}>{fullName(m)}</div>
                            {householdById[m.household_id] && <div style={{fontSize:10,color:"var(--text-faint)"}}>{householdById[m.household_id]}</div>}
                            {instruments.length>0 && (
                              <div style={{display:"flex",flexWrap:"wrap",gap:4,marginTop:3}}>
                                {instruments.map(inst=>(
                                  <span key={inst} style={{fontSize:10,fontWeight:600,background:color+"14",color,borderRadius:10,padding:"1px 8px"}}>{inst}</span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                        <div style={{position:"relative",flexShrink:0}}>
                          {isAdmin ? (
                            <button onClick={()=>{setPosEdit(editing?null:{memberId:m.id,role});setErr("");}}
                              title="Set leadership position"
                              style={{display:"inline-flex",alignItems:"center",gap:3,cursor:"pointer",
                                fontSize:9,fontWeight:700,borderRadius:20,padding:"2px 8px",
                                ...(pos
                                  ? {color:"#7a4bd0",background:"#f0eaff",border:"1px solid #d9c9f5"}
                                  : {color:"var(--text-faint)",background:"none",border:"1px dashed var(--border-strong)"})}}>
                              {pos || "Set role"}<ChevronDown size={9} />
                            </button>
                          ) : pos ? (
                            <span style={{fontSize:9,fontWeight:700,color:"#7a4bd0",background:"#f0eaff",border:"1px solid #d9c9f5",borderRadius:20,padding:"2px 8px"}}>{pos}</span>
                          ) : null}

                          {editing && (
                            <>
                              <div onClick={()=>setPosEdit(null)} style={{position:"fixed",inset:0,zIndex:50}} />
                              <div style={{position:"absolute",top:"calc(100% + 4px)",right:0,zIndex:51,background:"var(--surface)",border:"1px solid var(--border)",borderRadius:10,boxShadow:"0 8px 24px #00000022",padding:6,minWidth:150}}>
                                {POS_OPTIONS.map(opt=>(
                                  <button key={opt||"member"} onClick={()=>savePosition(m.id,role,opt)}
                                    style={{display:"block",width:"100%",textAlign:"left",padding:"7px 10px",
                                      background:pos===opt?"var(--brand-tint)":"none",border:"none",borderRadius:6,
                                      cursor:"pointer",fontSize:12,fontWeight:600,color:"var(--text)"}}>
                                    {opt || "Member (no position)"}
                                  </button>
                                ))}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                      );
                    })}
                  </div>
              }
            </div>
          );
        })}
      </div>
    </div>
  );
}
