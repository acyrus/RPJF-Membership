import { useMemo, useState } from "react";
import { Avatar, fullName, SKILLS_LIST } from "../components";
import { Zap } from "lucide-react";

export default function SkillsPage({ members, onMemberClick }) {
  const [selectedSkill, setSelectedSkill] = useState("All");

  // Build skill → members map
  const skillMap = useMemo(() => {
    const map = {};
    members.filter(m => m.is_active !== false).forEach(m => {
      [m.skill1, m.skill2, m.skill3].filter(Boolean).forEach(skill => {
        if (!map[skill]) map[skill] = [];
        map[skill].push(m);
      });
    });
    return map;
  }, [members]);

  // Skills that are actually in use, for the dropdown
  const skillsInUse = useMemo(() => {
    return SKILLS_LIST.filter(s => skillMap[s] && skillMap[s].length > 0);
  }, [skillMap]);

  const visibleSkills = useMemo(() => {
    return selectedSkill === "All"
      ? skillsInUse
      : skillsInUse.filter(s => s === selectedSkill);
  }, [skillsInUse, selectedSkill]);

  const totalWithSkills = useMemo(() => {
    return members.filter(m => m.skill1 || m.skill2 || m.skill3).length;
  }, [members]);

  return (
    <div className="fade-in">
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20, flexWrap:"wrap", gap:12}}>
        <div>
          <div style={{fontFamily:"'Inter',sans-serif", color:"#111827", fontSize:14, letterSpacing:0.5, fontWeight:700}}>SKILLS DIRECTORY</div>
          <div style={{fontSize:12, color:"#9ca3af", marginTop:3}}>{totalWithSkills} of {members.length} members have skills recorded · {skillsInUse.length} skill{skillsInUse.length!==1?"s":""} in use</div>
        </div>
        <select value={selectedSkill} onChange={e=>setSelectedSkill(e.target.value)} style={{width:220, fontWeight:500}}>
          <option value="All">All Skills ({skillsInUse.length})</option>
          {skillsInUse.map(s => (
            <option key={s} value={s}>{s} ({skillMap[s].length})</option>
          ))}
        </select>
      </div>

      {visibleSkills.length === 0 ? (
        <div style={{textAlign:"center", padding:"48px 20px", color:"#d1d5db"}}>
          <div style={{marginBottom:12, display:"flex", justifyContent:"center"}}><Zap size={36} color="#8a96b8" /></div>
          <div style={{fontWeight:600, color:"#6b7280", marginBottom:6}}>
            {selectedSkill !== "All" ? `No members with "${selectedSkill}"` : "No skills recorded yet"}
          </div>
          <div style={{fontSize:12}}>Add skills to members in the Members tab.</div>
        </div>
      ) : (
        <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(260px,1fr))", gap:14}}>
          {visibleSkills.map(skill => {
            const skillMembers = skillMap[skill] || [];
            return (
              <div key={skill} className="card" style={{padding:16, borderLeft:"3px solid #2a5357"}}>
                <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12}}>
                  <div style={{fontWeight:700, fontSize:14, color:"#111827", display:"flex", alignItems:"center", gap:6}}><Zap size={14} color="#e15700" />{skill}</div>
                  <div style={{background:"#2a535718", border:"1.5px solid #2a535744", color:"#2a5357", borderRadius:20, padding:"2px 10px", fontSize:12, fontWeight:700}}>
                    {skillMembers.length}
                  </div>
                </div>
                <div style={{display:"flex", flexDirection:"column", gap:8}}>
                  {skillMembers.map(m => (
                    <div key={m.id} style={{display:"flex", alignItems:"center", gap:8, cursor:"pointer"}} onClick={()=>onMemberClick(m)}>
                      <Avatar member={m} size={28} />
                      <div style={{fontSize:12, color:"#1f2937", fontWeight:600}}>{fullName(m)}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
