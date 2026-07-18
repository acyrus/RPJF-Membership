import { useMemo } from "react";
import { fullName, calcAge, daysUntilNext, Avatar, ROLES, ROLE_COLORS } from "../components";
import { Users, UserCheck, PauseCircle, Church, BarChart3, Calendar, TrendingUp, TrendingDown, ArrowRight, PartyPopper, Cake, Heart, Home, Link2, Baby, Circle, FileText } from "lucide-react";

function StatCard({ icon, label, value, sub, color = "#2a5357", onClick }) {
  return (
    <div onClick={onClick} style={{
      background: "#fff", border: "1.5px solid #e4e9f5", borderRadius: 14,
      padding: "18px 20px", flex: 1, minWidth: 140,
      cursor: onClick ? "pointer" : "default",
      transition: "box-shadow 0.15s, border-color 0.15s",
      boxShadow: "0 1px 4px #0000000a",
    }}
    onMouseEnter={e => { if (onClick) { e.currentTarget.style.borderColor = color; e.currentTarget.style.boxShadow = `0 2px 12px ${color}18`; }}}
    onMouseLeave={e => { e.currentTarget.style.borderColor = "#e4e9f5"; e.currentTarget.style.boxShadow = "0 1px 4px #0000000a"; }}>
      <div style={{ fontSize: 22, marginBottom: 8 }}>{icon}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color, fontFamily: "'Inter',sans-serif", lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 12, fontWeight: 600, color: "#2a3560", marginTop: 4 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: "#8a96b8", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function SectionTitle({ children }) {  return <div className="section-title">{children}</div>;
}

function DonutBlock({ data, total, totalLabel }) {
  const size = 110, thickness = 15, r = (size - thickness) / 2, circ = 2 * Math.PI * r;
  const sum = data.reduce((s, d) => s + d.value, 0) || 1;
  let off = 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)" }}>
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#f0f2f8" strokeWidth={thickness} />
          {data.map((d, i) => {
            const dash = (d.value / sum) * circ;
            const el = <circle key={i} cx={size/2} cy={size/2} r={r} fill="none" stroke={d.color} strokeWidth={thickness} strokeDasharray={`${dash} ${circ - dash}`} strokeDashoffset={-off} />;
            off += dash; return el;
          })}
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: 21, fontWeight: 700, color: "#1f2a44", lineHeight: 1 }}>{total}</span>
          <span style={{ fontSize: 10, color: "#8a96b8", marginTop: 2 }}>{totalLabel}</span>
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        {data.map((d, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: d.color, flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: "#374151", flex: 1 }}>{d.name}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#1f2a44" }}>{d.value}</span>
            <span style={{ fontSize: 11, color: "#9ca3af", width: 30, textAlign: "right" }}>{sum ? Math.round(d.value / sum * 100) : 0}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}



export default function DashboardPage({ profile, members, services, attendance, households = [], setTab, activityLog = [] }) {
  const isAdmin = profile?.role === "admin";

  const stats = useMemo(() => {
    const active = members.filter(m => m.is_active !== false).length;
    const inactive = members.length - active;
    const male = members.filter(m => m.sex === "Male").length;
    const female = members.filter(m => m.sex === "Female").length;
    // Marital status is only meaningful for adults (18+) — children shouldn't count as "Single"
    const adults = members.filter(m => { const a = calcAge(m.dob); return a !== null && a >= 18; });
    const adultsCount = adults.length;
    const married = adults.filter(m => m.marital_status === "Married").length;
    const single = adults.filter(m => m.marital_status === "Single").length;
    const maritalUnknown = adultsCount - married - single;

    // Attendance stats
    const svcIds = services.map(s => s.id);
    const totals = svcIds.map(id => (attendance[id] || []).length);
    const avgAtt = totals.length ? Math.round(totals.reduce((a, b) => a + b, 0) / totals.length) : 0;
    const lastSvc = services[0];
    const lastAtt = lastSvc ? (attendance[lastSvc.id] || []).length : 0;
    const lastPct = members.length ? Math.round((lastAtt / members.length) * 100) : 0;
    const currentYear = new Date().getFullYear();
    const servicesThisYear = services.filter(s => s.service_date && new Date(s.service_date).getFullYear() === currentYear).length;

    // Trend: compare per service type (last 4 vs previous 4 of each type)
    const serviceTypes = [...new Set(services.map(s => s.name))];
    const trendsByType = serviceTypes.map(typeName => {
      const typeSvcs = services.filter(s => s.name === typeName);
      const typeTotals = typeSvcs.map(s => (attendance[s.id] || []).length);
      const recent4 = typeTotals.slice(0, 4);
      const prev4 = typeTotals.slice(4, 8);
      const recentAvg = recent4.length ? Math.round(recent4.reduce((a,b)=>a+b,0)/recent4.length) : 0;
      const prevAvg = prev4.length ? Math.round(prev4.reduce((a,b)=>a+b,0)/prev4.length) : 0;
      const direction = prev4.length === 0 ? null : recentAvg > prevAvg ? "up" : recentAvg < prevAvg ? "down" : "steady";
      return { name: typeName, recentAvg, prevAvg, direction, count: typeSvcs.length };
    }).filter(t => t.count >= 2); // only show types with enough data
    const trend = null; // replaced by trendsByType

    // Average attendance per service type
    const avgByType = serviceTypes.map(name => {
      const svcs = services.filter(s => s.name === name);
      const tot = svcs.map(s => (attendance[s.id] || []).length);
      const avg = tot.length ? Math.round(tot.reduce((a,b)=>a+b,0)/tot.length) : 0;
      return { name, avg, count: svcs.length };
    }).filter(t => t.count > 0).sort((a,b) => b.avg - a.avg);

    // Birthdays & anniversaries this week
    const birthdaysThisWeek = members.filter(m => { const d = daysUntilNext(m.dob); return d !== null && d <= 7 && m.is_active !== false; });
    const anniversariesThisWeek = members.filter(m => { const d = daysUntilNext(m.anniversary); return d !== null && d <= 7 && m.is_active !== false; });

    // Role distribution
    const roleCounts = {};
    ROLES.forEach(r => { roleCounts[r] = members.filter(m => (m.roles||[]).includes(r)).length; });

    // Age category breakdown (active members only)
    const AGE_CATS = [
      { label:"Babes & Toddlers", min:0,  max:4,   color:"#f0a0c0", icon:<span style={{width:9,height:9,borderRadius:"50%",background:"#f0a0c0",display:"inline-block"}} /> },
      { label:"Children",         min:5,  max:12,  color:"#f0c040", icon:<span style={{width:9,height:9,borderRadius:"50%",background:"#f0c040",display:"inline-block"}} /> },
      { label:"Teenagers",        min:13, max:17,  color:"#60b060", icon:<span style={{width:9,height:9,borderRadius:"50%",background:"#60b060",display:"inline-block"}} /> },
      { label:"Young Adults",     min:18, max:29,  color:"#2a5357", icon:<span style={{width:9,height:9,borderRadius:"50%",background:"#2a5357",display:"inline-block"}} /> },
      { label:"Adults",           min:30, max:59,  color:"#a040c0", icon:<span style={{width:9,height:9,borderRadius:"50%",background:"#a040c0",display:"inline-block"}} /> },
      { label:"Seniors",          min:60, max:999, color:"#c07830", icon:<span style={{width:9,height:9,borderRadius:"50%",background:"#c07830",display:"inline-block"}} /> },
    ];
    const activeMembers = members.filter(m => m.is_active !== false);
    const ageCats = AGE_CATS.map(cat => {
      const count = activeMembers.filter(m => {
        const age = calcAge(m.dob);
        return age !== null && age >= cat.min && age <= cat.max;
      }).length;
      return { ...cat, count };
    });
    const noAgeCount = activeMembers.filter(m => calcAge(m.dob) === null).length;

    // Household at-a-glance
    const hhGroups = {};
    members.forEach(m => { if (m.household_id) (hhGroups[m.household_id] = hhGroups[m.household_id] || []).push(m); });
    const CHILD_TITLES = ["Son","Daughter","Grandson","Granddaughter"];
    const hhList = Object.entries(hhGroups).map(([id, mem]) => ({
      id, name: (households.find(h => h.id === id) || {}).name || "Household", size: mem.length,
      children: mem.filter(mm => { const a = calcAge(mm.dob); return CHILD_TITLES.includes(mm.household_role) || (a !== null && a < 18); }).length,
    })).sort((a, b) => b.size - a.size);
    const inHousehold = members.filter(m => m.household_id).length;
    const household = {
      count: hhList.length,
      inHousehold,
      without: members.length - inHousehold,
      avg: hhList.length ? (inHousehold / hhList.length) : 0,
      withChildren: hhList.filter(h => h.children > 0).length,
      largest: hhList[0] || null,
    };

    return { active, inactive, male, female, married, single, adultsCount, maritalUnknown, avgAtt, avgByType, servicesThisYear, lastSvc, lastAtt, lastPct, trend, trendsByType, birthdaysThisWeek, anniversariesThisWeek, roleCounts, ageCats, noAgeCount, household };
  }, [members, services, attendance, households]);

  const recentLog = useMemo(() => activityLog.slice(0, 6), [activityLog]);

  const topRoles = Object.entries(stats.roleCounts)
    .filter(([,v]) => v > 0)
    .sort((a,b) => b[1]-a[1]);

  return (
    <div className="fade-in">

      {/* Welcome */}
      <div style={{ marginBottom: 24 }}>
        <div className="page-title">Welcome back</div>
        <div className="page-subtitle">
          {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
        </div>
      </div>

      {/* Member Stats */}
      <SectionTitle>Membership</SectionTitle>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <StatCard icon={<Users size={22} />} label="Total Members" value={members.length} color="#2a5357" onClick={() => setTab("members")} />
        <StatCard icon={<UserCheck size={22} />} label="Active Members" value={stats.active} sub={`${members.length ? Math.round((stats.active/members.length)*100) : 0}% of total`} color="#4caf82" onClick={() => setTab("members")} />
        <StatCard icon={<PauseCircle size={22} />} label="Inactive Members" value={stats.inactive} color="#8a96b8" onClick={() => setTab("members")} />
        <StatCard icon={<Church size={22} />} label="Services This Year" value={stats.servicesThisYear} color="#e07830" onClick={() => setTab("attendance")} />
      </div>

      {/* Attendance Stats */}
      <SectionTitle>Attendance</SectionTitle>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <StatCard icon={<Calendar size={22} />} label="Last Service"
          value={stats.lastSvc ? `${stats.lastAtt}` : "—"}
          sub={stats.lastSvc ? `${stats.lastSvc.name} · ${stats.lastSvc.service_date.split("-").reverse().join("/")}` : "No services yet"}
          color="#4caf82" />
      </div>

      {stats.avgByType.length > 0 && (
        <div className="card" style={{ padding: "14px 16px", marginTop: 12 }}>
          <div className="card-title" style={{ marginBottom: 12 }}>Average attendance by service</div>
          {stats.avgByType.map(t => {
            const pct = members.length ? Math.round((t.avg / members.length) * 100) : 0;
            return (
              <div key={t.name} style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#1f2a44" }}>{t.name}</span>
                  <span style={{ fontSize: 13, color: "#6b7280" }}><strong style={{ color: "#2a5357" }}>{t.avg}</strong> avg · {pct}%</span>
                </div>
                <div style={{ height: 7, background: "#eef1f6", borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ width: `${Math.min(pct, 100)}%`, height: "100%", background: "#2a5357", borderRadius: 4 }} />
                </div>
              </div>
            );
          })}
          <div style={{ fontSize: 11, color: "#8a96b8", marginTop: 2 }}>Averaged across all recorded services of each type. Percentages are of total members.</div>
        </div>
      )}

      {/* Per-service-type trends */}
      {stats.trendsByType && stats.trendsByType.length > 0 && (
        <>
          <SectionTitle>Attendance Trend by Service Type</SectionTitle>
          <div className="card" style={{padding:"16px 18px", boxShadow:"0 1px 4px #0000000a"}}>
            {stats.trendsByType.map(t => {
              const color = t.direction === "up" ? "#4caf82" : t.direction === "down" ? "#e05050" : "#8a96b8";
              const icon = t.direction === "up" ? <TrendingUp size={20} /> : t.direction === "down" ? <TrendingDown size={20} /> : <ArrowRight size={20} />;
              const label = t.direction === "up" ? "Growing" : t.direction === "down" ? "Declining" : t.direction === null ? "Not enough data" : "Steady";
              return (
                <div key={t.name} style={{display:"flex", alignItems:"center", gap:14, padding:"10px 0", borderBottom:"1px solid #f0f2f8"}}>
                  <span style={{fontSize:20, flexShrink:0}}>{icon}</span>
                  <div style={{flex:1}}>
                    <div style={{fontSize:14, fontWeight:600, color:"#111827"}}>{t.name}</div>
                    <div style={{fontSize:12, color:"#9ca3af", marginTop:2}}>
                      {t.direction !== null
                        ? `Avg ${t.prevAvg} → ${t.recentAvg} per service`
                        : `Avg ${t.recentAvg} per service · need more data for trend`}
                    </div>
                  </div>
                  <div style={{textAlign:"right", flexShrink:0}}>
                    <span style={{
                      background: color+"18", border:`1.5px solid ${color}33`,
                      color, borderRadius:20, padding:"3px 12px",
                      fontSize:12, fontWeight:700
                    }}>{label}</span>
                    {t.direction !== null && (
                      <div style={{fontSize:11, color:"#d1d5db", marginTop:3}}>
                        {t.recentAvg > t.prevAvg ? `+${t.recentAvg - t.prevAvg}` : t.recentAvg < t.prevAvg ? `-${t.prevAvg - t.recentAvg}` : "No change"} avg attendance
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Member Breakdown + Celebrations side by side */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 28 }}>

        {/* Member Breakdown */}
        <div>
          <div className="section-title flush">Member Breakdown</div>
          <div style={{ background: "#fff", border: "1.5px solid #e4e9f5", borderRadius: 14, padding: "16px 18px", boxShadow: "0 1px 4px #0000000a" }}>
            {/* Sex */}
            <div style={{ marginBottom: 14 }}>
              <DonutBlock
                data={[{ name: "Male", value: stats.male, color: "#3a8fd0" }, { name: "Female", value: stats.female, color: "#d060a0" }]}
                total={stats.male + stats.female} totalLabel="members" />
            </div>
            <div style={{ borderTop: "1.5px solid #f0f2f8", paddingTop: 14 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: 12 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: "#8a96b8", textTransform:"uppercase", letterSpacing: 0.5 }}>Marital Status (18+)</span>
              </div>
              <DonutBlock
                data={[
                  { name: "Married", value: stats.married, color: "#4caf82" },
                  { name: "Single", value: stats.single, color: "#3a8fd0" },
                  ...(stats.maritalUnknown > 0 ? [{ name: "Not recorded", value: stats.maritalUnknown, color: "#c9ccd6" }] : []),
                ]}
                total={stats.adultsCount} totalLabel="adults" />
            </div>
          </div>
        </div>

        {/* Celebrations this week */}
        <div>
          <div className="section-title flush">Celebrations This Week</div>
          <div style={{ background: "#fff", border: "1.5px solid #e4e9f5", borderRadius: 14, padding: "16px 18px", boxShadow: "0 1px 4px #0000000a", minHeight: 140 }}>
            {stats.birthdaysThisWeek.length === 0 && stats.anniversariesThisWeek.length === 0 ? (
              <div style={{ textAlign: "center", padding: "24px 0", color: "#b0b8d0", fontSize: 12 }}>
                <div style={{ marginBottom: 8 }}><PartyPopper size={28} color="#b0b8d0" /></div>
                No celebrations this week
              </div>
            ) : (
              <>
                {stats.birthdaysThisWeek.map(m => (
                  <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                    <span style={{ display:"flex" }}><Cake size={16} color="#e07830" /></span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#2a3560" }}>{fullName(m)}</div>
                      <div style={{ fontSize: 11, color: "#8a96b8" }}>
                        Birthday · {daysUntilNext(m.dob) === 0 ? "Today!" : `${daysUntilNext(m.dob)} days away`}
                      </div>
                    </div>
                  </div>
                ))}
                {stats.anniversariesThisWeek.map(m => (
                  <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                    <span style={{ display:"flex" }}><Heart size={16} color="#d060a0" /></span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#2a3560" }}>{fullName(m)}</div>
                      <div style={{ fontSize: 11, color: "#8a96b8" }}>
                        Anniversary · {daysUntilNext(m.anniversary) === 0 ? "Today!" : `${daysUntilNext(m.anniversary)} days away`}
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Age Category Breakdown */}
      <SectionTitle>Members by Age Group</SectionTitle>
      <div style={{ background:"#fff", border:"1.5px solid #e4e9f5", borderRadius:14, padding:"16px 18px", boxShadow:"0 1px 4px #0000000a", marginBottom:4 }}>
        {stats.ageCats.map(cat => {
          const pct = stats.active ? Math.round((cat.count / stats.active) * 100) : 0;
          return (
            <div key={cat.label} style={{ marginBottom:12 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:5 }}>
                <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                  <span style={{ fontSize:16 }}>{cat.icon}</span>
                  <span style={{ fontSize:12, fontWeight:600, color:"#111827" }}>{cat.label}</span>
                  <span style={{ fontSize:11, color:"#8a96b8" }}>
                    ({cat.min === 0 ? "0" : cat.min}–{cat.max === 999 ? "60+" : cat.max})
                  </span>
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <span style={{ fontSize:12, color:cat.color, fontWeight:700 }}>{cat.count}</span>
                  <span style={{ fontSize:12, color:"#6b7280", fontWeight:600 }}>{pct}%</span>
                </div>
              </div>
              <div style={{ height:7, background:"#f0f2f8", borderRadius:4, overflow:"hidden" }}>
                <div style={{ height:"100%", width:`${pct}%`, background:cat.color, borderRadius:4, transition:"width 0.5s" }} />
              </div>
            </div>
          );
        })}
        {stats.noAgeCount > 0 && (
          <div style={{ marginTop:8, paddingTop:10, borderTop:"1px solid #f0f2f8", display:"flex", justifyContent:"space-between", fontSize:12, color:"#6b7280" }}>
            <span>No date of birth recorded</span>
            <span>{stats.noAgeCount} member{stats.noAgeCount !== 1 ? "s" : ""}</span>
          </div>
        )}
      </div>

      {/* Households at a glance */}
      <SectionTitle>Households at a Glance</SectionTitle>
      {stats.household.count === 0 ? (
        <div onClick={() => setTab("households")} style={{ background:"#fff", border:"1.5px solid #e4e9f5", borderRadius:14, padding:"18px 20px", boxShadow:"0 1px 4px #0000000a", cursor:"pointer", display:"flex", alignItems:"center", gap:14 }}>
          <span style={{ display:"flex" }}><Home size={28} color="#8a96b8" /></span>
          <div>
            <div style={{ fontSize:14, fontWeight:700, color:"#2a3560" }}>No households yet</div>
            <div style={{ fontSize:12, color:"#8a96b8", marginTop:2 }}>Group families together in the Households tab →</div>
          </div>
        </div>
      ) : (
        <div style={{ background:"#fff", border:"1.5px solid #e4e9f5", borderRadius:14, padding:"18px 20px", boxShadow:"0 1px 4px #0000000a" }}>
          <div style={{ display:"flex", gap:12, flexWrap:"wrap" }}>
            {[
              { icon:<Home size={18} color="#2a5357" />, label:"Households", value:stats.household.count, color:"#2a5357" },
              { icon:<Users size={18} color="#4caf82" />, label:"Avg Family Size", value:stats.household.avg ? stats.household.avg.toFixed(1) : "0", color:"#4caf82" },
              { icon:<Link2 size={18} color="#3a8fd0" />, label:"Members Linked", value:stats.household.inHousehold, color:"#3a8fd0", sub:`${members.length ? Math.round((stats.household.inHousehold/members.length)*100) : 0}% of members` },
              { icon:<Circle size={18} color="#8a96b8" />, label:"Not Linked", value:stats.household.without, color:"#8a96b8" },
            ].map(s => (
              <div key={s.label} onClick={() => setTab("households")} style={{ flex:1, minWidth:120, cursor:"pointer" }}>
                <div style={{ fontSize:18, marginBottom:4 }}>{s.icon}</div>
                <div style={{ fontSize:24, fontWeight:700, color:s.color, lineHeight:1, fontFamily:"'Inter',sans-serif" }}>{s.value}</div>
                <div style={{ fontSize:12, fontWeight:600, color:"#2a3560", marginTop:4 }}>{s.label}</div>
                {s.sub && <div style={{ fontSize:11, color:"#8a96b8", marginTop:2 }}>{s.sub}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Ministry Distribution */}
      {topRoles.length > 0 && (
        <>
          <SectionTitle>Ministry Distribution</SectionTitle>
          <div style={{ background: "#fff", border: "1.5px solid #e4e9f5", borderRadius: 14, padding: "16px 18px", boxShadow: "0 1px 4px #0000000a" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {topRoles.map(([role, count]) => {
                const color = ROLE_COLORS[role] || "#2a5357";
                const pct = members.length ? Math.round((count/members.length)*100) : 0;
                return (
                  <div key={role}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "#2a3560" }}>{role}</span>
                      <span style={{ fontSize: 12, color, fontWeight: 700 }}>{count} member{count !== 1 ? "s" : ""}</span>
                    </div>
                    <div style={{ height: 6, background: "#f0f2f8", borderRadius: 4, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 4, transition: "width 0.5s" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* Recent Activity — admin only */}
      {isAdmin && recentLog.length > 0 && (
        <>
          <SectionTitle>Recent Activity</SectionTitle>
          <div style={{ background: "#fff", border: "1.5px solid #e4e9f5", borderRadius: 14, padding: "6px", boxShadow: "0 1px 4px #0000000a" }}>
            {recentLog.map((entry, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "10px 14px", borderBottom: i < recentLog.length-1 ? "1px solid #f0f2f8" : "none" }}>
                <span style={{ fontSize: 16, flexShrink: 0 }}>{entry.icon || <FileText size={16} />}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: "#2a3560", fontWeight: 500 }}>{entry.description}</div>
                  <div style={{ fontSize: 11, color: "#8a96b8", marginTop: 2 }}>{entry.user_name} · {new Date(entry.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Empty state for new installs */}
      {members.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px 20px", marginTop: 20, background: "#fff", border: "1.5px solid #e4e9f5", borderRadius: 14 }}>
          <div style={{ marginBottom: 12 }}><Church size={36} color="#8a96b8" /></div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#2a3560", marginBottom: 6 }}>Welcome to RPJF Membership</div>
          <div style={{ fontSize: 13, color: "#8a96b8", maxWidth: 320, margin: "0 auto 20px" }}>Get started by adding your first member or importing existing members.</div>
          <button className="btn-primary" onClick={() => setTab("members")}>+ Add First Member</button>
        </div>
      )}
    </div>
  );
}
