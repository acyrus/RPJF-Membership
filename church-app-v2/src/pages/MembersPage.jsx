import { useState, useMemo, useEffect } from "react";
import { supabase } from "../supabase";
import { Avatar, RoleBadge, MaritalBadge, SexBadge, StatusBadge, InfoRow, MemberForm, Spinner, ROLES, BLANK_MEMBER, TRINIDAD_CITIES, calcAge, formatDob, formatShortDate, isBirthdayThisWeek, fullName, fullNameFull, validateMember } from "../components";
import { Cake, Hourglass, MapPin, Phone, Mail, Heart, Users, Home as HomeIcon, Zap, Lightbulb, FileText, Music } from "lucide-react";
import { X, Check } from "lucide-react";

async function logActivity(action_type, description, user_id, user_name) {
  try { await supabase.from("activity_log").insert({ action_type, description, user_id, user_name }); } catch(e) {}
}

export default function MembersPage({ profile, members, setMembers, households = [], setHouseholds = () => {}, services, attendance }) {
  const isAdmin = profile?.role === "admin";
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("active");
  const [selected, setSelected] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editData, setEditData] = useState(null);
  const [form, setForm] = useState(BLANK_MEMBER);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [attFilter, setAttFilter] = useState("All");
  const [sexFilter, setSexFilter] = useState("All");
  const [ageMin, setAgeMin] = useState("");
  const [ageMax, setAgeMax] = useState("");
  const [skillFilter, setSkillFilter] = useState("All");
  const [cityFilter, setCityFilter] = useState("All");
  const [formErrors, setFormErrors] = useState({});

  useEffect(() => {
    if (selected) setSelected(members.find(m => m.id === selected.id) || null);
  }, [members]);

  const filtered = useMemo(() => members.filter(m => {
    const s = search.toLowerCase();
    const name = fullName(m).toLowerCase();
    return (name.includes(s) || (m.email||"").toLowerCase().includes(s)) &&
      (roleFilter === "All" || (m.roles||[]).includes(roleFilter)) &&
      (statusFilter === "all" || (statusFilter === "active" ? m.is_active !== false : m.is_active === false)) &&
      (cityFilter === "All" || m.city === cityFilter) &&
      (sexFilter === "All" || m.sex === sexFilter) &&
      (skillFilter === "All" || [m.skill1, m.skill2, m.skill3].includes(skillFilter)) &&
      (() => {
        const min = ageMin === "" ? null : parseInt(ageMin);
        const max = ageMax === "" ? null : parseInt(ageMax);
        if (min === null && max === null) return true;
        const age = calcAge(m.dob);
        if (age === null) return false; // no DOB → excluded when a range is active
        if (min !== null && age < min) return false;
        if (max !== null && age > max) return false;
        return true;
      })();
  }), [members, search, roleFilter, statusFilter, sexFilter, ageMin, ageMax, skillFilter, cityFilter]);

  // Skills actually present among members, for the filter dropdown
  const skillsInUse = useMemo(() => {
    const set = new Set();
    members.forEach(m => [m.skill1, m.skill2, m.skill3].filter(Boolean).forEach(sk => set.add(sk)));
    return [...set].sort();
  }, [members]);

  const birthdays = useMemo(() => members.filter(m => isBirthdayThisWeek(m.dob)), [members]);

  // Build attendance summary for selected member
  const memberAttendance = useMemo(() => {
    if (!selected || !services || !attendance) return [];
    return services.map(s => ({
      ...s,
      present: (attendance[s.id] || []).includes(selected.id)
    }));
  }, [selected, services, attendance]);

  // Get unique service names for filter dropdown
  const serviceTypes = useMemo(() => {
    const names = [...new Set(services.map(s => s.name))].sort();
    return ["All", ...names];
  }, [services]);

  const filteredMemberAttendance = useMemo(() => {
    if (attFilter === "All") return memberAttendance;
    return memberAttendance.filter(s => s.name === attFilter);
  }, [memberAttendance, attFilter]);

  const attendanceRate = useMemo(() => {
    if (!filteredMemberAttendance.length) return null;
    const present = filteredMemberAttendance.filter(s => s.present).length;
    return { present, total: filteredMemberAttendance.length, pct: Math.round((present / filteredMemberAttendance.length) * 100) };
  }, [filteredMemberAttendance]);

  async function logActivity(action_type, description) {
    try { await supabase.from("activity_log").insert({ action_type, description, user_id: profile.id, user_name: profile.name }); } catch(e) {}
  }

  function exportCSV() {
    const headers = ["First Name","Middle Name","Last Name","Gender","Marital Status","Date of Birth","Age","Phone","Email","City","Home Address","Church Join Date","Skill 1","Skill 2","Skill 3","Other Skills","Roles","Notes","Status"];
    const rows = members.map(m => [
      m.first_name||"", m.middle_name||"", m.last_name||"",
      m.sex||"", m.marital_status||"",
      m.dob||"", calcAge(m.dob)||"",
      m.phone||"", m.email||"", m.city||"", m.address||"",
      m.join_date||"",
      m.skill1||"", m.skill2||"", m.skill3||"", m.other_skills||"",
      (m.roles||[]).join("; "),
      (m.notes||"").replace(/,/g,""),
      m.is_active !== false ? "Active" : "Inactive"
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "church-members.csv"; a.click();
    URL.revokeObjectURL(url);
    logActivity("export", `Exported member list (${members.length} members)`);
  }

  // Resolve the household selection from the form into a real household id.
  // Creates a new household row if the user chose "Create new…".
  async function resolveHousehold(formData) {
    if (formData.household_id === "__new__") {
      const name = (formData.new_household_name || "").trim();
      if (!name) return null;
      const { data, error } = await supabase.from("households").insert({ name }).select().single();
      if (error) throw error;
      setHouseholds(prev => [...prev, data].sort((a,b)=>a.name.localeCompare(b.name)));
      return data.id;
    }
    return formData.household_id || null;
  }

  // Keep spouse links reciprocal: when member↔spouse is set, link both ways and
  // unlink any previous partners. Returns a map of {otherMemberId: newSpouseIdValue}
  // describing changes made to OTHER members, so local state can be patched.
  async function syncSpouse(memberId, newSpouseId, prevSpouseId) {
    const changes = {};
    if (prevSpouseId && prevSpouseId !== newSpouseId) {
      await supabase.from("members").update({ spouse_id: null }).eq("id", prevSpouseId).eq("spouse_id", memberId);
      changes[prevSpouseId] = null;
    }
    if (newSpouseId) {
      const newPartner = members.find(m => m.id === newSpouseId);
      if (newPartner && newPartner.spouse_id && newPartner.spouse_id !== memberId) {
        await supabase.from("members").update({ spouse_id: null }).eq("id", newPartner.spouse_id).eq("spouse_id", newSpouseId);
        changes[newPartner.spouse_id] = null;
      }
      await supabase.from("members").update({ spouse_id: memberId }).eq("id", newSpouseId);
      changes[newSpouseId] = memberId;
    }
    return changes;
  }

  async function handleAdd() {
    const errors = validateMember(form);
    if (Object.keys(errors).length > 0) { setFormErrors(errors); return setError("Please fix the errors below"); }
    setFormErrors({});
    setSaving(true); setError("");
    try {
      const spouseId = form.marital_status === "Married" ? (form.spouse_id || null) : null;
      const householdId = await resolveHousehold(form);
      const { data: member, error: mErr } = await supabase.from("members").insert({
        first_name: form.first_name, middle_name: form.middle_name||null, last_name: form.last_name, is_active: form.is_active !== false,
        phone: form.phone||null, email: form.email||null, dob: form.dob||null,
        sex: form.sex||null, marital_status: form.marital_status||null, anniversary: form.anniversary||null,
        address: form.address||null, city: form.city||null, join_date: form.join_date||null, notes: form.notes||null,
        skill1: form.skill1||null, skill2: form.skill2||null, skill3: form.skill3||null, other_skills: form.other_skills||null, instruments: form.instruments||null,
        spouse_id: spouseId, household_id: householdId, photo_url: form.photo_url||null,
      }).select().single();
      if (mErr) throw mErr;
      if (form.roles.length) {
        await supabase.from("member_roles").insert(form.roles.map(r => ({ member_id: member.id, role_name: r })));
      }
      const changes = await syncSpouse(member.id, spouseId, null);
      const newMember = { ...member, roles: form.roles, spouse_id: spouseId, household_id: householdId };
      setMembers(prev => {
        const patched = prev.map(m => changes[m.id] !== undefined ? { ...m, spouse_id: changes[m.id] } : m);
        return [...patched, newMember].sort((a,b)=>fullName(a).localeCompare(fullName(b)));
      });
      logActivity('member_added', `Added member ${form.first_name} ${form.last_name}`);
      setShowAdd(false); setForm(BLANK_MEMBER);
    } catch(e) { setError(e.message); }
    finally { setSaving(false); }
  }

  async function handleEdit() {
    const errors = validateMember(editData);
    if (Object.keys(errors).length > 0) { setFormErrors(errors); return setError("Please fix the errors below"); }
    setFormErrors({});
    setSaving(true); setError("");
    try {
      const spouseId = editData.marital_status === "Married" ? (editData.spouse_id || null) : null;
      const prevSpouseId = (members.find(m => m.id === editData.id) || {}).spouse_id || null;
      const householdId = await resolveHousehold(editData);
      const { error: mErr } = await supabase.from("members").update({
        first_name: editData.first_name,
        middle_name: editData.middle_name||null,
        last_name: editData.last_name,
        is_active: editData.is_active !== false,
        phone: editData.phone||null,
        email: editData.email||null,
        dob: editData.dob||null,
        sex: editData.sex||null,
        marital_status: editData.marital_status||null,
        anniversary: editData.anniversary||null,
        address: editData.address||null,
        city: editData.city||null,
        join_date: editData.join_date||null,
        notes: editData.notes||null,
        skill1: editData.skill1||null,
        skill2: editData.skill2||null,
        skill3: editData.skill3||null,
        other_skills: editData.other_skills||null,
        instruments: editData.instruments||null,
        spouse_id: spouseId,
        household_id: householdId,
        photo_url: editData.photo_url||null,
      }).eq("id", editData.id);
      if (mErr) throw mErr;
      await supabase.from("member_roles").delete().eq("member_id", editData.id);
      if (editData.roles.length) {
        await supabase.from("member_roles").insert(editData.roles.map(r => ({ member_id: editData.id, role_name: r })));
      }
      const changes = await syncSpouse(editData.id, spouseId, prevSpouseId);
      const updated = { ...editData, spouse_id: spouseId, household_id: householdId };
      setMembers(prev => prev.map(m => {
        if (m.id === editData.id) return updated;
        if (changes[m.id] !== undefined) return { ...m, spouse_id: changes[m.id] };
        return m;
      }));
      logActivity('member_edited', `Edited member ${editData.first_name} ${editData.last_name}`);
      setSelected(updated); setEditData(null);
      setSaveSuccess(true); setTimeout(() => setSaveSuccess(false), 3000);
    } catch(e) { setError(e.message); }
    finally { setSaving(false); }
  }

  async function handleDelete(id) {
    if (!confirm("Delete this member? This cannot be undone.")) return;
    const delMember = members.find(m => m.id === id);
    await supabase.from("members").delete().eq("id", id);
    logActivity('member_deleted', `Deleted member ${delMember ? fullName(delMember) : id}`);
    setMembers(prev => prev.filter(m => m.id !== id).map(m => m.spouse_id === id ? { ...m, spouse_id: null } : m));
    setSelected(null);
  }

  return (
    <>
      {saveSuccess && (
        <div style={{
          position:"fixed", top:24, left:"50%", transform:"translateX(-50%)",
          background:"#059669", color:"#fff", borderRadius:12,
          padding:"14px 28px", fontSize:14, fontWeight:700,
          boxShadow:"0 4px 24px #0000002a", zIndex:999,
          display:"flex", alignItems:"center", gap:10,
        }}>
          Member updated successfully
        </div>
      )}
    <div className="fade-in member-list-layout" style={{display:"flex",gap:20}}>
      {/* Left: List */}
      <div style={{flex:1,minWidth:0}}>
        {birthdays.length > 0 && (
          <div className="birthday-banner">
            <span style={{display:"flex"}}><Cake size={18} color="#e07830" /></span>
            <span><strong>Upcoming birthdays this week:</strong> {birthdays.map(m=>fullName(m)).join(", ")}</span>
          </div>
        )}
        <div className="filter-row" style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap"}}>
          <input className="search-input" placeholder="Search members…" value={search} onChange={e=>setSearch(e.target.value)} style={{flex:1,minWidth:160}} />
          <select value={sexFilter} onChange={e=>setSexFilter(e.target.value)} style={{width:120}}>
            <option value="All">Both Genders</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
          </select>
          <select value={cityFilter} onChange={e=>setCityFilter(e.target.value)} style={{width:130}}>
            <option value="All">All Cities</option>
            {TRINIDAD_CITIES.map(c=><option key={c} value={c}>{c}</option>)}
          </select>
          <select value={skillFilter} onChange={e=>setSkillFilter(e.target.value)} style={{width:150}}>
            <option value="All">All Skills</option>
            {skillsInUse.map(sk=><option key={sk} value={sk}>{sk}</option>)}
          </select>
          <div className="age-filter" style={{display:"flex",alignItems:"center",gap:4}} title="Filter by age range">
            <span style={{fontSize:12,color:"#8a96b8",fontWeight:600}}>Age</span>
            <input type="number" min="0" max="120" placeholder="min" value={ageMin} onChange={e=>setAgeMin(e.target.value)} style={{width:58,padding:"7px 6px"}} />
            <span style={{fontSize:12,color:"#8a96b8"}}>–</span>
            <input type="number" min="0" max="120" placeholder="max" value={ageMax} onChange={e=>setAgeMax(e.target.value)} style={{width:58,padding:"7px 6px"}} />
            {(ageMin!=="" || ageMax!=="") && (
              <button onClick={()=>{setAgeMin("");setAgeMax("");}} title="Clear age range" style={{background:"none",border:"1px solid #d0d7e8",borderRadius:8,color:"#9ca3af",cursor:"pointer",fontSize:12,padding:"4px 7px"}}><X size={13} /></button>
            )}
          </div>
          <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} style={{width:110}}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="all">All Members</option>
          </select>
          <select value={roleFilter} onChange={e=>setRoleFilter(e.target.value)} style={{width:160}}>
            <option value="All">All Ministries</option>
            {ROLES.map(r=><option key={r} value={r}>{r}</option>)}
          </select>
          <button className="btn-ghost" onClick={exportCSV} title="Export to CSV">Export CSV</button>
          {isAdmin && <button className="btn-primary" onClick={()=>{setForm(BLANK_MEMBER);setShowAdd(true);setError("");}}>+ Add Member</button>}
        </div>

        <div className="card" style={{padding:6}}>
          {filtered.length === 0 && <div style={{textAlign:"center",color:"#9ca3af",padding:30,fontSize:13}}>No members found</div>}
          {filtered.map(m => {
            const bday = isBirthdayThisWeek(m.dob);
            return (
              <div key={m.id} className={`member-row ${selected?.id===m.id?"selected":""}`} onClick={()=>setSelected(m)}>
                <div style={{position:"relative"}}>
                  <Avatar member={m} size={40} />
                  {bday && <span style={{position:"absolute",top:-4,right:-4,display:"flex"}}><Cake size={13} color="#e07830" /></span>}
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                    <span style={{fontWeight:700,fontSize:14,color:"#111827"}}>{fullName(m)}</span>
                    {m.sex && <SexBadge sex={m.sex} />}
                    {m.is_active === false && <StatusBadge active={false} />}
                  </div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:4,marginTop:4}}>
                    {(m.roles||[]).map(r=><RoleBadge key={r} role={r} small />)}
                  </div>
                </div>
                <div style={{fontSize:12,color:"#e5e7eb"}}>›</div>
              </div>
            );
          })}
        </div>
        <div style={{fontSize:12,color:"#d1d5db",marginTop:8,textAlign:"right"}}>{filtered.length} of {members.length} members</div>
      </div>

      {/* Mobile backdrop */}
      {selected && <div className="mobile-backdrop" style={{display:"none"}} onClick={()=>setSelected(null)} />}
      {/* Right: Detail Panel */}
      {selected && (
        <div className="card detail-panel fade-in" style={{padding:22}}>
          {/* Close button */}
          <button className="close-btn" onClick={()=>setSelected(null)}><X size={13} /></button>

          <div style={{textAlign:"center",marginBottom:18,paddingTop:4}}>
            <div style={{position:"relative",display:"inline-block"}}>
              <Avatar member={selected} size={72} />
              {isBirthdayThisWeek(selected.dob) && <span style={{position:"absolute",bottom:-2,right:-2,display:"flex"}}><Cake size={20} color="#e07830" /></span>}
            </div>
            <div style={{fontFamily:"'Inter',sans-serif",fontSize:16,color:"#111827",marginTop:12,fontWeight:600}}>{fullNameFull(selected)}</div>
            <div style={{fontSize:12,color:"#9ca3af",marginTop:4}}>
              Member since {selected.join_date ? new Date(selected.join_date+"T12:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}) : "—"}
            </div>
            <div style={{display:"flex",gap:6,justifyContent:"center",marginTop:8,flexWrap:"wrap"}}>
              {selected.sex && <SexBadge sex={selected.sex} />}
              {selected.marital_status && <MaritalBadge status={selected.marital_status} />}
              <StatusBadge active={selected.is_active !== false} />
            </div>
          </div>

          <hr className="section-divider" />

          {/* Personal Info */}
          {selected.dob && <InfoRow icon={<Cake size={15} color="#9ca3af" />} label="Date of Birth" value={formatDob(selected.dob)} />}
          {calcAge(selected.dob)!=null && <InfoRow icon={<Hourglass size={15} color="#9ca3af" />} label="Age" value={`${calcAge(selected.dob)} years old`} />}
          {selected.city && <InfoRow icon={<MapPin size={15} color="#9ca3af" />} label="City" value={selected.city} />}
            {selected.phone && <InfoRow icon={<Phone size={15} color="#9ca3af" />} label="Phone" value={selected.phone} />}
          {selected.email && <InfoRow icon={<Mail size={15} color="#9ca3af" />} label="Email" value={selected.email} />}
          {selected.address && <InfoRow icon={<MapPin size={15} color="#9ca3af" />} label="Home Address" value={selected.address} />}
          {selected.anniversary && <InfoRow icon={<Heart size={15} color="#9ca3af" />} label="Wedding Anniversary" value={formatShortDate(selected.anniversary)} />}
          {selected.spouse_id && (() => {
            const sp = members.find(m => m.id === selected.spouse_id);
            if (!sp) return null;
            return (
              <div onClick={()=>setSelected(sp)} style={{cursor:"pointer",borderRadius:8,transition:"background 0.15s"}}
                onMouseEnter={e=>e.currentTarget.style.background="#f4f6ff"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                <InfoRow icon={<Users size={15} color="#9ca3af" />} label="Spouse" value={<span style={{color:"#2a5357",fontWeight:600}}>{fullName(sp)} ›</span>} />
              </div>
            );
          })()}
          {selected.household_id && (() => {
            const hh = households.find(h => h.id === selected.household_id);
            const fam = members.filter(m => m.household_id === selected.household_id && m.id !== selected.id);
            if (!hh) return null;
            return (
              <div style={{marginBottom:10}}>
                <InfoRow icon={<HomeIcon size={15} color="#9ca3af" />} label="Household" value={hh.name} />
                {fam.length > 0 && (
                  <div style={{marginLeft:22,marginTop:-4,display:"flex",flexWrap:"wrap",gap:6}}>
                    {fam.map(m => (
                      <span key={m.id} onClick={()=>setSelected(m)} style={{cursor:"pointer",display:"inline-flex",alignItems:"center",gap:5,background:"#f4f6ff",border:"1px solid #e4e9f5",borderRadius:16,padding:"2px 8px 2px 2px",fontSize:11,fontWeight:600,color:"#2a3560"}}>
                        <Avatar member={m} size={18} />{fullName(m)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}
          {(selected.skill1||selected.skill2||selected.skill3) && <InfoRow icon={<Zap size={15} color="#9ca3af" />} label="Skills" value={[selected.skill1,selected.skill2,selected.skill3].filter(Boolean).join(" · ")} />}
            {selected.other_skills && <InfoRow icon={<Lightbulb size={15} color="#9ca3af" />} label="Other Skills" value={selected.other_skills} />}
            {selected.instruments && <InfoRow icon={<Music size={15} color="#9ca3af" />} label="Instruments" value={selected.instruments} />}
          {selected.notes && <InfoRow icon={<FileText size={15} color="#9ca3af" />} label="Notes" value={selected.notes} />}

          <hr className="section-divider" />

          {/* Roles */}
          <div style={{marginBottom:14}}>
            <div style={{fontSize:11,color:"#9ca3af",letterSpacing:0.8,textTransform:"uppercase",fontWeight:700,marginBottom:8}}>Roles & Ministries</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
              {(selected.roles||[]).length
                ? (selected.roles||[]).map(r=><RoleBadge key={r} role={r} />)
                : <span style={{color:"#d1d5db",fontSize:12}}>No roles assigned</span>}
            </div>
          </div>

          <hr className="section-divider" />

          {/* Attendance Summary */}
          <div style={{marginBottom:14}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <div style={{fontSize:11,color:"#9ca3af",letterSpacing:0.8,textTransform:"uppercase",fontWeight:700}}>Attendance History</div>
              {serviceTypes.length > 2 && (
                <select
                  value={attFilter}
                  onChange={e=>setAttFilter(e.target.value)}
                  style={{fontSize:11,padding:"3px 6px",width:"auto",borderRadius:6,border:"1.5px solid #d0d7e8",color:"#6b7280",fontWeight:600}}>
                  {serviceTypes.map(t=><option key={t} value={t}>{t === "All" ? "All Services" : t}</option>)}
                </select>
              )}
            </div>
            {memberAttendance.length === 0
              ? <div style={{fontSize:12,color:"#d1d5db"}}>No services recorded yet</div>
              : filteredMemberAttendance.length === 0
              ? <div style={{fontSize:12,color:"#d1d5db"}}>No {attFilter} services recorded yet</div>
              : <>
                  {attendanceRate && (
                    <div style={{display:"flex",gap:8,marginBottom:10}}>
                      <div style={{flex:1,background:"#f4f6ff",borderRadius:8,padding:"8px 6px",textAlign:"center"}}>
                        <div style={{fontFamily:"'Inter',sans-serif",fontSize:18,color:"#2a5357",fontWeight:700}}>{attendanceRate.present}</div>
                        <div style={{fontSize:10,color:"#9ca3af",textTransform:"uppercase",letterSpacing:0.5,fontWeight:600}}>Present</div>
                      </div>
                      <div style={{flex:1,background:"#f4f6ff",borderRadius:8,padding:"8px 6px",textAlign:"center"}}>
                        <div style={{fontFamily:"'Inter',sans-serif",fontSize:18,color:"#2a5357",fontWeight:700}}>{attendanceRate.total - attendanceRate.present}</div>
                        <div style={{fontSize:10,color:"#9ca3af",textTransform:"uppercase",letterSpacing:0.5,fontWeight:600}}>Absent</div>
                      </div>
                      <div style={{flex:1,background:"#f4f6ff",borderRadius:8,padding:"8px 6px",textAlign:"center"}}>
                        <div style={{fontFamily:"'Inter',sans-serif",fontSize:18,color:"#2a5357",fontWeight:700}}>{attendanceRate.pct}%</div>
                        <div style={{fontSize:10,color:"#9ca3af",textTransform:"uppercase",letterSpacing:0.5,fontWeight:600}}>Rate</div>
                      </div>
                    </div>
                  )}
                  {attFilter !== "All" && (
                    <div style={{fontSize:11,color:"#9ca3af",marginBottom:6,fontStyle:"italic"}}>
                      Showing {filteredMemberAttendance.length} {attFilter} session{filteredMemberAttendance.length!==1?"s":""}
                    </div>
                  )}
                  <div style={{maxHeight:160,overflowY:"auto"}}>
                    {filteredMemberAttendance.map(s=>(
                      <div key={s.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:12,marginBottom:5,color:"#4a5a7a"}}>
                        <span>{s.service_date} · {s.name.split(" ").slice(0,2).join(" ")}</span>
                        <span style={{color:s.present?"#4caf82":"#e05050",fontWeight:700}}>{s.present?<Check size={14} />:"–"}</span>
                      </div>
                    ))}
                  </div>
                </>
            }
          </div>

          {isAdmin && (
            <div style={{display:"flex",gap:8,marginTop:4}}>
              <button className="btn-primary" style={{flex:1,fontSize:12}}
                onClick={()=>{setEditData({...selected,dob:selected.dob?selected.dob.slice(0,10):"",join_date:selected.join_date?selected.join_date.slice(0,10):"",anniversary:selected.anniversary?selected.anniversary.slice(0,10):"",other_skills:selected.other_skills||"",instruments:selected.instruments||"",city:selected.city||"",spouse_id:selected.spouse_id||"",household_id:selected.household_id||"",new_household_name:"",photo_url:selected.photo_url||"",is_active:selected.is_active!==false,roles:selected.roles||[]});setError("");}}>
                Edit
              </button>
              <button className="btn-danger" style={{fontSize:12}} onClick={()=>handleDelete(selected.id)}>Delete</button>
            </div>
          )}
        </div>
      )}

      {/* Add Modal */}
      {showAdd && (
        <div className="modal-bg" onClick={()=>setShowAdd(false)}>
          <div className="modal fade-in" onClick={e=>e.stopPropagation()}>
            <h2>ADD NEW MEMBER</h2>
            <MemberForm value={form} onChange={v=>{setForm(v);setFormErrors({});}} onSubmit={handleAdd} onCancel={()=>{setShowAdd(false);setFormErrors({});}} submitLabel="Add Member" saving={saving} errors={formErrors} members={members} households={households} />
            {error && <div className="error-msg">{error}</div>}
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editData && (
        <div className="modal-bg" onClick={()=>setEditData(null)}>
          <div className="modal fade-in" onClick={e=>e.stopPropagation()}>
            <h2>EDIT MEMBER</h2>
            <MemberForm value={editData} onChange={v=>{setEditData(v);setFormErrors({});}} onSubmit={handleEdit} onCancel={()=>{setEditData(null);setFormErrors({});}} submitLabel="Save Changes" saving={saving} errors={formErrors} members={members} households={households} />
            {error && <div className="error-msg">{error}</div>}
          </div>
        </div>
      )}
    </div>
  </>
  );
}
