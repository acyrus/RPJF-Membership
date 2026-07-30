import { Avatar, ROLES, ROLE_COLORS, fullName } from "../components";

const MUSIC_MINISTRIES = ["Musician"];

function getInstruments(m) {
  return String(m.instruments || "").split(",").map(s => s.trim()).filter(Boolean);
}

export default function RolesPage({ members, onMemberClick }) {
  // Distinct people involved in at least one ministry
  const involved = members.filter(m => (m.roles || []).length > 0);
  const totalInvolved = involved.length;

  return (
    <div className="fade-in">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10,marginBottom:18}}>
        <div style={{fontFamily:"'Inter',sans-serif",color:"#111827",fontSize:14,letterSpacing:0.2,fontWeight:600}}>MINISTRIES OVERVIEW</div>
        <div style={{
          background:"#2a535712", border:"1.5px solid #2a535733", color:"#2a5357",
          borderRadius:20, padding:"6px 14px", fontSize:12, fontWeight:700,
        }}>
          Total Members Involved in Ministry: {totalInvolved}
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:14}}>
        {ROLES.map(role => {
          const rm = members.filter(m=>(m.roles||[]).includes(role));
          const color = ROLE_COLORS[role]||"#888";
          return (
            <div key={role} className="card" style={{padding:16,borderLeft:`3px solid ${color}`}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                <div style={{fontWeight:700,fontSize:14,color:"#111827"}}>{role}</div>
                <div style={{background:color+"18",border:`1.5px solid ${color}44`,color,borderRadius:20,padding:"2px 10px",fontSize:12,fontWeight:700}}>{rm.length}</div>
              </div>
              {rm.length===0
                ? <div style={{fontSize:12,color:"#d1d5db"}}>No members assigned</div>
                : <div style={{display:"flex",flexDirection:"column",gap:8}}>
                    {rm.map(m=>{
                      const instruments = MUSIC_MINISTRIES.includes(role) ? getInstruments(m) : [];
                      return (
                      <div key={m.id} style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer"}} onClick={()=>onMemberClick(m)}>
                        <Avatar member={m} size={28} />
                        <div style={{minWidth:0}}>
                          <div style={{fontSize:12,color:"#1f2937",fontWeight:600}}>{fullName(m)}</div>
                          {instruments.length>0 && (
                            <div style={{display:"flex",flexWrap:"wrap",gap:4,marginTop:3}}>
                              {instruments.map(inst=>(
                                <span key={inst} style={{fontSize:10,fontWeight:600,background:color+"14",color,borderRadius:10,padding:"1px 8px"}}>{inst}</span>
                              ))}
                            </div>
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
