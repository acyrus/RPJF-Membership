import { useMemo, useState } from "react";
import { Avatar, fullName, SKILLS_LIST, MultiSelect, useIsMobile, useHeaderOffset } from "../components";
import { Zap, Search } from "lucide-react";

export default function SkillsPage({ members, households = [], onMemberClick }) {
  const isMobile = useIsMobile();
  const headerOffset = useHeaderOffset();
  const [selectedSkills, setSelectedSkills] = useState([]); // multi-select skills
  const [person, setPerson] = useState("");                 // filter members by name
  const [famSelected, setFamSelected] = useState([]);       // multi-select households

  const householdById = useMemo(() => Object.fromEntries(households.map(h => [h.id, h.name])), [households]);
  const sortedHouseholds = useMemo(() => [...households].sort((a, b) => a.name.localeCompare(b.name)), [households]);

  // Build skill → members map.
  // The three skill slots are independent columns, and the Google Form lets someone
  // pick the same skill in two of them — so a member could land in the same bucket
  // twice, showing their name twice on the card and inflating the count. The Set
  // collapses that per member. Entry-side guards exist too (MemberForm disables an
  // already-chosen skill, the importer drops repeats), but this keeps rows that are
  // already in the database from displaying wrong.
  const skillMap = useMemo(() => {
    const map = {};
    members.filter(m => m.is_active !== false).forEach(m => {
      [...new Set([m.skill1, m.skill2, m.skill3].filter(Boolean))].forEach(skill => {
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

  // Person / family filters narrow the members shown inside each card.
  const pq = person.trim().toLowerCase();
  const memberFilterActive = !!pq || famSelected.length > 0;
  const matchMember = (m) =>
    (!pq || fullName(m).toLowerCase().includes(pq)) &&
    (famSelected.length === 0 || famSelected.includes(m.household_id));

  const visibleSkills = useMemo(() => {
    const base = selectedSkills.length === 0 ? skillsInUse : skillsInUse.filter(s => selectedSkills.includes(s));
    if (!memberFilterActive) return base;
    return base.filter(s => (skillMap[s] || []).some(matchMember));
  }, [skillsInUse, selectedSkills, memberFilterActive, skillMap, pq, famSelected]);

  const totalWithSkills = useMemo(() => {
    return members.filter(m => m.skill1 || m.skill2 || m.skill3).length;
  }, [members]);

  return (
    <div className="fade-in">
      <div style={ isMobile
        ? {display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexWrap:"wrap", gap:12, position:"sticky", top:headerOffset, zIndex:30, background:"var(--bg-body)", paddingTop:8, paddingBottom:10, marginLeft:-14, marginRight:-14, paddingLeft:14, paddingRight:14, marginBottom:16, boxShadow:"0 6px 8px -6px #00000022"}
        : {display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20, flexWrap:"wrap", gap:12} }>
        <div>
          <div style={{fontFamily:"'Inter',sans-serif", color:"var(--text)", fontSize:14, letterSpacing:0.5, fontWeight:700}}>SKILLS DIRECTORY</div>
          <div style={{fontSize:12, color:"var(--text-faint)", marginTop:3}}>{totalWithSkills} of {members.length} members have skills recorded · {skillsInUse.length} skill{skillsInUse.length!==1?"s":""} in use</div>
        </div>
        <div style={{display:"flex", gap:8, flexWrap:"wrap", alignItems:"center"}}>
          <MultiSelect label="All skills" width={190}
            options={skillsInUse.map(s => ({ value: s, label: `${s} (${skillMap[s].length})` }))}
            selected={selectedSkills} onChange={setSelectedSkills} />
          <div style={{position:"relative"}}>
            <Search size={13} style={{position:"absolute", left:9, top:"50%", transform:"translateY(-50%)", color:"var(--text-faint)"}} />
            <input placeholder="Search person…" value={person} onChange={e=>setPerson(e.target.value)} style={{width:160, paddingLeft:28, fontSize:12}} />
          </div>
          <MultiSelect label="All families" width={160}
            options={sortedHouseholds.map(h => ({ value: h.id, label: h.name }))}
            selected={famSelected} onChange={setFamSelected} />
        </div>
      </div>

      {visibleSkills.length === 0 ? (
        <div style={{textAlign:"center", padding:"48px 20px", color:"var(--border-strong)"}}>
          <div style={{marginBottom:12, display:"flex", justifyContent:"center"}}><Zap size={36} color="#8a96b8" /></div>
          <div style={{fontWeight:600, color:"var(--text-muted)", marginBottom:6}}>
            {memberFilterActive || selectedSkills.length > 0 ? "No skills match those filters" : "No skills recorded yet"}
          </div>
          <div style={{fontSize:12}}>{memberFilterActive ? "Try clearing the person or family filter." : "Add skills to members in the Members tab."}</div>
        </div>
      ) : (
        <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(260px,1fr))", gap:14}}>
          {visibleSkills.map(skill => {
            const all = skillMap[skill] || [];
            const skillMembers = memberFilterActive ? all.filter(matchMember) : all;
            return (
              <div key={skill} className="card" style={{padding:16, borderLeft:"3px solid var(--brand)"}}>
                <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12}}>
                  <div style={{fontWeight:700, fontSize:14, color:"var(--text)", display:"flex", alignItems:"center", gap:6}}><Zap size={14} color="#e15700" />{skill}</div>
                  <div style={{background:"#2a535718", border:"1.5px solid #2a535744", color:"var(--brand)", borderRadius:20, padding:"2px 10px", fontSize:12, fontWeight:700}}>
                    {memberFilterActive ? `${skillMembers.length}/${all.length}` : all.length}
                  </div>
                </div>
                <div style={{display:"flex", flexDirection:"column", gap:8}}>
                  {skillMembers.map(m => (
                    <div key={m.id} style={{display:"flex", alignItems:"center", gap:8, cursor:"pointer"}} onClick={()=>onMemberClick(m)}>
                      <Avatar member={m} size={28} />
                      <div style={{minWidth:0}}>
                        <div style={{fontSize:12, color:"var(--text)", fontWeight:600}}>{fullName(m)}</div>
                        {householdById[m.household_id] && <div style={{fontSize:10, color:"var(--text-faint)"}}>{householdById[m.household_id]}</div>}
                      </div>
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
