import { useMemo, useState, useEffect } from "react";
import {
  LineChart, Line, AreaChart, Area, ReferenceLine, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LabelList
} from "recharts";
import { ROLES, TRINIDAD_CITIES, calcAge, fullName, Avatar } from "../components";
import { supabase } from "../supabase";
import { Search, Home, Check, X, ChevronDown, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown, UserMinus, SlidersHorizontal, Users, TrendingUp, Calendar, Clock, Baby, Music, Layers, UserCheck, Heart, User } from "lucide-react";

const TEAL      = "#2a5357";
const TURQUOISE = "#5edcd1";
const ORANGE    = "#e15700";
const RED       = "#ec3b09";
const PURPLE    = "#7c3aed";
const GOLD      = "#d97706";
const GREEN     = "#059669";
const PINK      = "#db2777";
const CHART_COLORS = [TEAL, TURQUOISE, ORANGE, RED, PURPLE, GOLD, GREEN, PINK];

// True when a member's age falls within an optional [min, max] range (blank = open end).
// A member with no recorded age is excluded once any bound is set.
function ageInRange(age, minStr, maxStr) {
  const min = minStr === "" ? null : parseInt(minStr);
  const max = maxStr === "" ? null : parseInt(maxStr);
  if (min === null && max === null) return true;
  if (age === null) return false;
  if (min !== null && age < min) return false;
  if (max !== null && age > max) return false;
  return true;
}

// Phrase ministry names naturally for the overlap sentences.
const MINISTRY_TEAM_RE = /team|media|finance|preparation|sanitation|ministry|committee|worship|choir|band|hospitality|production/i;
function pluralizeWord(name) {
  const parts = name.split(" ");
  let last = parts[parts.length - 1];
  if (/(s|x|z|ch|sh)$/i.test(last)) last += "es";
  else if (/[^aeiou]y$/i.test(last)) last = last.slice(0, -1) + "ies";
  else last += "s";
  parts[parts.length - 1] = last;
  return parts.join(" ");
}
function ministryPeople(name) { // "the Ushers" · "the Finances" · "the Social Media team"
  if (MINISTRY_TEAM_RE.test(name)) return (/s$/i.test(name) || /team$/i.test(name)) ? `the ${name}` : `the ${name} team`;
  return `the ${pluralizeWord(name)}`;
}
function ministryServeClause(name) { // "serve as Musicians" · "serve in the Worship Team"
  if (MINISTRY_TEAM_RE.test(name)) return `serve in ${/team$/i.test(name) ? "the " + name : name}`;
  return `serve as ${pluralizeWord(name)}`;
}
// Calmer, harmonised palette for multi-line charts (less visual noise than CHART_COLORS).
const LINE_COLORS = ["#2a5357", "#4a7fa0", "#c98a3e", "#6f9a5e", "#8e6e9e", "#b79a4a", "#6f8a8a", "#a8737f"];

const AGE_CATS = [
  { label:"Babes & Toddlers", min:0,  max:4,   color:"#f0a0c0" },
  { label:"Children",         min:5,  max:12,  color:"#f0c040" },
  { label:"Teenagers",        min:13, max:17,  color:"#60b060" },
  { label:"Young Adults",     min:18, max:29,  color:TEAL },
  { label:"Adults",           min:30, max:59,  color:PURPLE },
  { label:"Seniors",          min:60, max:999, color:GOLD },
];

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTH_FULL  = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function getDateRange(key) {
  const now = new Date();
  const today = now.toISOString().slice(0,10);
  const y = now.getFullYear();
  const m = now.getMonth();
  switch(key) {
    case "this_month": return { from:`${y}-${String(m+1).padStart(2,"0")}-01`, to:today };
    case "last_3":     { const d = new Date(now); d.setMonth(d.getMonth()-3); return { from:d.toISOString().slice(0,10), to:today }; }
    case "this_year":  return { from:`${y}-01-01`, to:today };
    case "last_year":  return { from:`${y-1}-01-01`, to:`${y-1}-12-31` };
    default:           return { from:"2000-01-01", to:today };
  }
}

function SectionTitle({ children }) {
  return <div className="section-title">{children}</div>;
}

function ChartCard({ title, subtitle, children }) {
  return (
    <div style={{background:"var(--surface)",border:"1px solid #edf0f4",borderRadius:10,padding:"18px 20px",boxShadow:"0 1px 2px #0b13210a",marginBottom:4}}>
      <div style={{marginBottom:16}}>
        <div className="card-title">{title}</div>
        {subtitle && <div style={{fontSize:12,color:"var(--text-muted-navy)",marginTop:2}}>{subtitle}</div>}
      </div>
      {children}
    </div>
  );
}

function StatPill({ label, value, color="#2a5357" }) {  return (
    <div style={{background:"var(--surface-alt)",border:"1px solid var(--border)",borderRadius:10,padding:"12px 16px",textAlign:"center"}}>
      <div style={{fontSize:24,fontWeight:700,color,lineHeight:1.1}}>{value}</div>
      <div style={{fontSize:11,color:"var(--text-faint)",textTransform:"uppercase",letterSpacing:0.5,marginTop:4,fontWeight:500}}>{label}</div>
    </div>
  );
}

// Tiny inline trend line for a stat tile.
function Sparkline({ data, color, width=96, height=24 }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data), max = Math.max(...data), span = (max - min) || 1;
  const pts = data.map((v,i) => {
    const x = (i/(data.length-1))*width;
    const y = height - 2 - ((v-min)/span)*(height-4);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{display:"block",marginTop:8}}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// Stat tile: value + optional change badge (vs the previous equal-length period) + sparkline.
function StatTile({ label, value, color="#2a5357", delta=null, sub, spark, sparkColor }) {
  let badge = null;
  if (delta !== null && delta !== undefined && Number.isFinite(delta) && delta !== 0) {
    const up = delta > 0;
    badge = <span style={{fontSize:12,fontWeight:700,color:up?"#059669":"#dc2626",whiteSpace:"nowrap",display:"inline-flex",alignItems:"center",gap:1}}>{up?"▲":"▼"} {Math.abs(delta)}</span>;
  }
  return (
    <div style={{background:"var(--surface-alt)",border:"1px solid var(--border)",borderRadius:10,padding:"12px 14px"}}>
      <div style={{fontSize:11,color:"var(--text-faint)",textTransform:"uppercase",letterSpacing:0.5,fontWeight:500}}>{label}</div>
      <div style={{display:"flex",alignItems:"baseline",gap:8,marginTop:4,flexWrap:"wrap"}}>
        <span style={{fontSize:24,fontWeight:700,color,lineHeight:1.1}}>{value}</span>
        {badge}
        {sub && <span style={{fontSize:11,color:"var(--text-faint)"}}>{sub}</span>}
      </div>
      {spark && <Sparkline data={spark} color={sparkColor||color} />}
    </div>
  );
}

// Donut with a total in the centre + a legend that shows count, %, and a proportion bar.
function DonutCard({ title, subtitle, data }) {
  const sum = data.reduce((a,b)=>a+(b.value||0),0);
  return (
    <div style={{background:"var(--surface)",border:"1px solid #edf0f4",borderRadius:10,padding:"18px 20px",boxShadow:"0 1px 2px #0b13210a",marginBottom:4}}>
      <div style={{marginBottom:16}}>
        <div className="card-title">{title}</div>
        {subtitle && <div style={{fontSize:12,color:"var(--text-muted-navy)",marginTop:2}}>{subtitle}</div>}
      </div>
      {sum === 0 ? <div style={{textAlign:"center",padding:30,color:"var(--text-faint)",fontSize:12}}>No data</div>
        : <div style={{display:"flex",alignItems:"center",gap:18,flexWrap:"wrap"}}>
            <div style={{position:"relative",width:160,height:160,flexShrink:0}}>
              <ResponsiveContainer width={160} height={160}>
                <PieChart>
                  <Pie data={data} dataKey="value" cx="50%" cy="50%" innerRadius={54} outerRadius={72} paddingAngle={2} stroke="none">
                    {data.map((e,i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",pointerEvents:"none"}}>
                <div style={{fontSize:26,fontWeight:700,color:"var(--text)",lineHeight:1}}>{sum}</div>
                <div style={{fontSize:10,color:"var(--text-faint)",textTransform:"uppercase",letterSpacing:0.5}}>total</div>
              </div>
            </div>
            <div style={{flex:1,minWidth:150}}>
              {data.map((d,i) => (
                <div key={i} style={{marginBottom:9}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3}}>
                    <div style={{width:10,height:10,borderRadius:2,background:d.color,flexShrink:0}} />
                    <div style={{fontSize:12,color:"var(--text-2)",flex:1,minWidth:0}}>{d.name}</div>
                    <div style={{fontSize:12,fontWeight:700,color:"var(--text)"}}>{d.value}</div>
                    <div style={{fontSize:11,color:"var(--text-faint)",minWidth:36,textAlign:"right"}}>{Math.round(d.value/sum*100)}%</div>
                  </div>
                  <div style={{height:5,background:"var(--border-divider)",borderRadius:3,overflow:"hidden"}}>
                    <div style={{width:`${d.value/sum*100}%`,height:"100%",background:d.color,borderRadius:3}} />
                  </div>
                </div>
              ))}
            </div>
          </div>
      }
    </div>
  );
}

// Compact icon stat card (used for member / ministry / household / instrument summaries).
function IconStat({ icon, value, label, sub, color = "#2a5357" }) {
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ width: 40, height: 40, borderRadius: 10, background: color + "18", color, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{icon}</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 24, fontWeight: 700, color: "var(--text)", lineHeight: 1.05 }}>{value}</div>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)" }}>{label}</div>
        {sub && <div style={{ fontSize: 10.5, color: "var(--text-faint)" }}>{sub}</div>}
      </div>
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{background:"var(--surface)",border:"1px solid var(--border)",borderRadius:8,fontSize:12,boxShadow:"0 4px 12px #0000001a"}}>
      <div style={{padding:"8px 12px",borderBottom:"1px solid var(--border-divider)",fontWeight:600,fontSize:12,color:"var(--text)"}}>{label}</div>
      {payload.map((p,i) => (
        <div key={i} style={{padding:"6px 12px",fontSize:12,color:p.color,fontWeight:500}}>
          {p.name}: <strong>{p.value}</strong>
        </div>
      ))}
    </div>
  );
};

const TEAL_C = "#2a5357";
const chipBase = { padding:"5px 12px", borderRadius:20, fontSize:12, fontWeight:500, cursor:"pointer" };

// Mobile detection so the filter drawer becomes a bottom sheet on small screens.
function useIsMobile() {
  const [m, setM] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 768px)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const on = () => setM(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return m;
}

// Multi-select dropdown: pick any number of options; empty = "all".
function MultiSelect({ label, options, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const toggle = v => onChange(selected.includes(v) ? selected.filter(x=>x!==v) : [...selected, v]);
  const summary = selected.length === 0 ? label : selected.length === 1 ? selected[0] : `${label}: ${selected.length}`;
  const on = selected.length > 0;
  return (
    <div style={{position:"relative"}}>
      <button onClick={()=>setOpen(o=>!o)} style={{...chipBase, background:on?TEAL_C:"var(--surface-alt)", color:on?"#fff":"#374151", border:`1.5px solid ${on?TEAL_C:"var(--border)"}`}}>
        {summary} ▾
      </button>
      {open && (
        <>
          <div onClick={()=>setOpen(false)} style={{position:"fixed",inset:0,zIndex:50}} />
          <div style={{position:"absolute",top:"calc(100% + 4px)",left:0,zIndex:51,background:"var(--surface)",border:"1px solid var(--border)",borderRadius:10,boxShadow:"0 8px 24px #00000018",padding:6,minWidth:170,maxHeight:260,overflowY:"auto"}}>
            {options.map(o => (
              <label key={o} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 8px",borderRadius:6,cursor:"pointer",fontSize:12.5,color:"var(--text-2)"}}>
                <input type="checkbox" checked={selected.includes(o)} onChange={()=>toggle(o)} />
                {o}
              </label>
            ))}
            {selected.length > 0 && (
              <button onClick={()=>onChange([])} style={{width:"100%",marginTop:4,padding:"6px",fontSize:12,background:"var(--surface-alt)",border:"1px solid var(--border)",borderRadius:6,color:"#dc2626",cursor:"pointer"}}>Clear</button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// Search-and-select specific members to scope the whole page to just them.
function MemberPicker({ members, selectedIds, onChange }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const toggle = id => onChange(selectedIds.includes(id) ? selectedIds.filter(x=>x!==id) : [...selectedIds, id]);
  const matches = members
    .filter(m => fullName(m).toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a,b)=>fullName(a).localeCompare(fullName(b)))
    .slice(0, 60);
  const on = selectedIds.length > 0;
  const label = on ? `${selectedIds.length} member${selectedIds.length===1?"":"s"}` : "Specific members";
  return (
    <div style={{position:"relative"}}>
      <button onClick={()=>setOpen(o=>!o)} style={{...chipBase, background:on?PURPLE:"var(--surface-alt)", color:on?"#fff":"#374151", border:`1.5px solid ${on?PURPLE:"var(--border)"}`}}>
        <Search size={12} /> {label} ▾
      </button>
      {open && (
        <>
          <div onClick={()=>setOpen(false)} style={{position:"fixed",inset:0,zIndex:50}} />
          <div style={{position:"absolute",top:"calc(100% + 4px)",left:0,zIndex:51,background:"var(--surface)",border:"1px solid var(--border)",borderRadius:10,boxShadow:"0 8px 24px #00000018",padding:8,width:260,maxHeight:320,overflowY:"auto"}}>
            <input autoFocus value={q} onChange={e=>setQ(e.target.value)} placeholder="Search members…"
              style={{width:"100%",padding:"7px 9px",border:"1.5px solid #d6dde3",borderRadius:8,fontSize:12.5,marginBottom:6}} />
            {selectedIds.length > 0 && (
              <button onClick={()=>onChange([])} style={{width:"100%",marginBottom:6,padding:"5px",fontSize:11.5,background:"var(--danger-bg)",border:"1px solid var(--danger-border)",borderRadius:6,color:"var(--danger)",cursor:"pointer"}}>Clear {selectedIds.length} selected</button>
            )}
            {matches.length === 0 && <div style={{fontSize:12,color:"var(--text-faint)",padding:"8px 4px"}}>No members match.</div>}
            {matches.map(m => (
              <label key={m.id} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 6px",borderRadius:6,cursor:"pointer",fontSize:12.5,color:"var(--text-2)"}}>
                <input type="checkbox" checked={selectedIds.includes(m.id)} onChange={()=>toggle(m.id)} />
                {fullName(m)}
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// Per-member attendance across the filtered sessions: expand a person to see each
// session with a present tick / absent X; right side shows attended, missed, rate.
function IndividualAttendance({ members, services, attendance, scope }) {
  const [sort, setSort] = useState("name");   // name | attended | missed | rate
  const [dir, setDir] = useState("desc");     // asc | desc
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState(null);
  const total = services.length;

  const rows = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const r = members
      .filter(m => !ql || fullName(m).toLowerCase().includes(ql))
      .map(m => {
        const attended = services.reduce((n, s) => n + ((attendance[s.id] || []).includes(m.id) ? 1 : 0), 0);
        return { m, attended, missed: total - attended, pct: total ? Math.round(attended / total * 100) : 0 };
      });
    const byName = (a, b) => { const ln = a.m.last_name.localeCompare(b.m.last_name); return ln !== 0 ? ln : a.m.first_name.localeCompare(b.m.first_name); };
    const asc = ({ name: byName, attended: (a, b) => a.attended - b.attended, missed: (a, b) => a.missed - b.missed, rate: (a, b) => a.pct - b.pct })[sort] || byName;
    r.sort((a, b) => (dir === "asc" ? asc(a, b) : -asc(a, b)) || byName(a, b));
    return r;
  }, [members, services, attendance, sort, dir, q, total]);

  const orderedServices = useMemo(() => [...services].sort((a, b) => b.service_date.localeCompare(a.service_date)), [services]);

  if (total === 0) return <div style={{ textAlign: "center", padding: 30, color: "var(--text-faint)", fontSize: 13 }}>No services match the current filters.</div>;

  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, color: "var(--text-faint)" }}>{rows.length} member{rows.length !== 1 ? "s" : ""} · {total} service{total !== 1 ? "s" : ""} in view</div>
          {scope && <div style={{ fontSize: 11.5, color: "var(--brand)", fontWeight: 600, marginTop: 3 }}>{scope}</div>}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <ArrowUpDown size={13} color="var(--text-faint)" />
            <select value={sort} onChange={e => setSort(e.target.value)} title="Sort the list"
              style={{ fontSize: 12, fontWeight: 600, padding: "6px 8px", width: "auto" }}>
              <option value="name">Sort: Name</option>
              <option value="attended">Sort: Attended</option>
              <option value="missed">Sort: Missed</option>
              <option value="rate">Sort: Rate</option>
            </select>
            <button onClick={() => setDir(d => d === "desc" ? "asc" : "desc")}
              title={dir === "desc" ? "Descending (high to low)" : "Ascending (low to high)"}
              aria-label={dir === "desc" ? "Descending" : "Ascending"}
              style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "6px 8px", borderRadius: 8, cursor: "pointer", background: "var(--surface-alt)", color: "var(--text-2)", border: "1.5px solid var(--border)" }}>
              {dir === "desc" ? <ArrowDown size={14} /> : <ArrowUp size={14} />}
            </button>
          </div>
          <div style={{ position: "relative" }}>
            <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-faint)" }} />
            <input placeholder="Search a person…" value={q} onChange={e => setQ(e.target.value)} style={{ width: 200, paddingLeft: 30, fontSize: 12 }} />
          </div>
        </div>
      </div>
      <div style={{ maxHeight: "65vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: 6, paddingRight: 2 }}>
        {rows.map(({ m, attended, missed, pct }) => {
          const open = openId === m.id;
          return (
            <div key={m.id} style={{ border: "1px solid var(--border)", borderRadius: 10, flexShrink: 0 }}>
              <div onClick={() => setOpenId(open ? null : m.id)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", cursor: "pointer", background: "var(--surface)", position: "sticky", top: 0, zIndex: 2, borderRadius: open ? "9px 9px 0 0" : 9, borderBottom: open ? "1px solid var(--border-divider)" : "none" }}>
                {open ? <ChevronDown size={15} color="var(--text-muted-navy)" /> : <ChevronRight size={15} color="var(--text-muted-navy)" />}
                <Avatar member={m} size={30} />
                <div style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, color: "var(--text)" }}>{fullName(m)}</div>
                <div style={{ display: "flex", gap: 14, alignItems: "center", flexShrink: 0 }}>
                  <div style={{ textAlign: "center", minWidth: 42 }}><div style={{ fontSize: 14, fontWeight: 700, color: "var(--success)" }}>{attended}</div><div style={{ fontSize: 10, color: "var(--text-faint)" }}>attended</div></div>
                  <div style={{ textAlign: "center", minWidth: 42 }}><div style={{ fontSize: 14, fontWeight: 700, color: "var(--danger)" }}>{missed}</div><div style={{ fontSize: 10, color: "var(--text-faint)" }}>missed</div></div>
                  <div style={{ textAlign: "center", minWidth: 46 }}><div style={{ fontSize: 14, fontWeight: 700, color: "var(--brand)" }}>{pct}%</div><div style={{ fontSize: 10, color: "var(--text-faint)" }}>rate</div></div>
                </div>
              </div>
              {open && (
                <div style={{ padding: "10px 12px", borderTop: "1px solid var(--border-divider)", background: "var(--surface-alt)", display: "flex", flexDirection: "column", gap: 4 }}>
                  {orderedServices.map(s => {
                    const present = (attendance[s.id] || []).includes(m.id);
                    return (
                      <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 12px", borderRadius: 8, background: "var(--surface)", border: "1px solid var(--border)" }}>
                        <div style={{ width: 92, flexShrink: 0, fontSize: 12, fontWeight: 500, color: "var(--text-2)" }}>{s.service_date.split("-").reverse().join("-")}</div>
                        <div style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{s.name}</div>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, background: present ? "var(--pill-yes-bg)" : "var(--pill-no-bg)", color: present ? "var(--pill-yes-fg)" : "var(--pill-no-fg)", border: `1px solid ${present ? "var(--pill-yes-bd)" : "var(--pill-no-bd)"}` }}>
                          {present ? <Check size={12} /> : <X size={12} />} {present ? "Present" : "Absent"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Attendance by household: open a family to see a grid of members (rows) x services
// (columns) with present/absent, plus each member's rate and the household's overall rate.
function HouseholdAttendance({ households, members, services, attendance }) {
  const [openId, setOpenId] = useState(null);
  const membersByHh = useMemo(() => {
    const map = {};
    members.forEach(m => { if (m.household_id) (map[m.household_id] = map[m.household_id] || []).push(m); });
    Object.values(map).forEach(list => list.sort((a, b) => { const ln = a.last_name.localeCompare(b.last_name); return ln !== 0 ? ln : a.first_name.localeCompare(b.first_name); }));
    return map;
  }, [members]);
  const cols = useMemo(() => [...services].sort((a, b) => a.service_date.localeCompare(b.service_date)), [services]);
  const total = cols.length;
  const rows = useMemo(() => households
    .filter(h => (membersByHh[h.id] || []).length)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(h => {
      const mem = membersByHh[h.id] || [];
      let present = 0;
      mem.forEach(m => cols.forEach(s => { if ((attendance[s.id] || []).includes(m.id)) present++; }));
      const cells = mem.length * total;
      return { h, mem, rate: cells ? Math.round(present / cells * 100) : 0 };
    }), [households, membersByHh, cols, attendance, total]);

  if (total === 0) return <div style={{ textAlign: "center", padding: 30, color: "var(--text-faint)", fontSize: 13 }}>No services match the current filters.</div>;
  if (!rows.length) return <div style={{ textAlign: "center", padding: 30, color: "var(--text-faint)", fontSize: 13 }}>No families with members yet. Group members in the Families tab first.</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>
        Open a family to see who attended which service. Columns are the {total} service{total !== 1 ? "s" : ""} in view. Narrow the date range or service type above if the grid is very wide.
      </div>
      {rows.map(({ h, mem, rate }) => {
        const open = openId === h.id;
        return (
          <div key={h.id} style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
            <div onClick={() => setOpenId(open ? null : h.id)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", cursor: "pointer", background: "var(--surface)" }}>
              {open ? <ChevronDown size={15} color="var(--text-muted-navy)" /> : <ChevronRight size={15} color="var(--text-muted-navy)" />}
              <Home size={15} color="var(--brand)" />
              <div style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, color: "var(--text)" }}>{h.name}</div>
              <span style={{ fontSize: 12, color: "var(--text-faint)" }}>{mem.length} member{mem.length !== 1 ? "s" : ""}</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: "var(--brand)", minWidth: 42, textAlign: "right" }}>{rate}%</span>
            </div>
            {open && (
              <div style={{ borderTop: "1px solid var(--border-divider)", overflowX: "auto", background: "var(--surface-alt)" }}>
                <table style={{ borderCollapse: "collapse", fontSize: 12, width: "100%" }}>
                  <thead>
                    <tr>
                      <th style={{ position: "sticky", left: 0, zIndex: 1, background: "var(--surface-alt)", textAlign: "left", padding: "8px 10px", minWidth: 130, color: "var(--text-faint)", fontWeight: 700 }}>Member</th>
                      {cols.map(s => (
                        <th key={s.id} style={{ padding: "8px 8px", color: "var(--text-faint)", fontWeight: 600, verticalAlign: "bottom", minWidth: 74 }}>
                          <div style={{ whiteSpace: "nowrap", fontSize: 10.5, fontWeight: 700, color: "var(--text-2)" }}>{(() => { const [y, m, d] = s.service_date.split("-"); return `${d}-${m}-${y.slice(2)}`; })()}</div>
                          <div style={{ fontSize: 9, fontWeight: 500, color: "var(--text-faint)", lineHeight: 1.2, marginTop: 3, maxWidth: 88, whiteSpace: "normal" }}>{s.name}</div>
                        </th>
                      ))}
                      <th style={{ padding: "8px 10px", color: "var(--text-faint)", fontWeight: 700, textAlign: "right" }}>Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mem.map(m => {
                      const att = cols.filter(s => (attendance[s.id] || []).includes(m.id)).length;
                      return (
                        <tr key={m.id} style={{ borderTop: "1px solid var(--border-divider)" }}>
                          <td style={{ position: "sticky", left: 0, zIndex: 1, background: "var(--surface)", padding: "6px 10px", fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap" }}>{fullName(m)}</td>
                          {cols.map(s => { const p = (attendance[s.id] || []).includes(m.id); return <td key={s.id} style={{ textAlign: "center", padding: "6px 5px" }}>{p ? <Check size={13} color="#2a8a50" /> : <X size={12} color="#d05050" />}</td>; })}
                          <td style={{ textAlign: "right", padding: "6px 10px", fontWeight: 700, color: "var(--brand)" }}>{total ? Math.round(att / total * 100) : 0}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function AnalyticsPage({ members, services, attendance, households = [], setMembers = () => {}, profile }) {
  // ── All state hooks first ─────────────────────────────────
  const [quickRange, setQuickRange]     = useState("this_year");
  const [customFrom, setCustomFrom]     = useState("");
  const [customTo, setCustomTo]         = useState("");
  const [svcTypeFilter, setSvcTypeFilter] = useState([]);
  const [sexFilter, setSexFilter]       = useState([]);
  const [ageFilter, setAgeFilter]       = useState([]);
  const [cityFilter, setCityFilter]     = useState([]);
  const [roleFilter, setRoleFilter]     = useState([]);
  const [selectedMemberIds, setSelectedMemberIds] = useState([]);
  const [statusFilter, setStatusFilter] = useState("active");
  const [maritalFilter, setMaritalFilter] = useState([]);
  const [interactionFilter, setInteractionFilter] = useState([]);
  const [skillFilterA, setSkillFilterA] = useState([]);
  const [ageMin, setAgeMin] = useState("");
  const [ageMax, setAgeMax] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false); // slide-out filter drawer
  const [memberSub, setMemberSub] = useState("overview"); // members sub-tab: "overview" | "households"
  const [celebMode, setCelebMode] = useState("birthdays"); // "birthdays" | "anniversaries"
  const isMobile = useIsMobile();
  // Pin the Analytics header + filter bar just beneath the app's sticky top bar,
  // whose height varies (brand row + wrapping tab nav), so we measure it live.
  const [stickyTop, setStickyTop] = useState(0);
  useEffect(() => {
    const measure = () => { const hb = document.querySelector(".header-bar"); setStickyTop(hb ? Math.round(hb.getBoundingClientRect().height) : 0); };
    measure();
    const t = setTimeout(measure, 300);
    window.addEventListener("resize", measure);
    return () => { window.removeEventListener("resize", measure); clearTimeout(t); };
  }, []);
  const [activeSection, setActiveSection] = useState("attendance");
  const [attSub, setAttSub] = useState("overview"); // attendance sub-tab: "overview" | "bymember"
  const [svcTypeAxis, setSvcTypeAxis] = useState("month"); // service-type chart x-axis: "month" | "date"
  const [savingInactive, setSavingInactive] = useState(null); // member id being marked inactive

  // ── All useMemo hooks in dependency order ─────────────────

  // 1. Date range
  const dateRange = useMemo(() => {
    if (customFrom && customTo) return { from: customFrom, to: customTo };
    return getDateRange(quickRange);
  }, [quickRange, customFrom, customTo]);

  // 2. Service type names
  const allSvcTypes = useMemo(() =>
    [...new Set(services.map(s => s.name))].sort()
  , [services]);

  // Option lists for the extra member filters, built from the data present.
  const maritalOptions = useMemo(() => [...new Set(members.map(m => m.marital_status).filter(Boolean))].sort(), [members]);
  const interactionOptions = useMemo(() => [...new Set(members.map(m => m.interaction_type).filter(Boolean))].sort(), [members]);
  const skillOptions = useMemo(() => { const s = new Set(); members.forEach(m => [m.skill1, m.skill2, m.skill3].filter(Boolean).forEach(k => s.add(k))); return [...s].sort(); }, [members]);

  // 3. Filtered services — no dependency on filteredMembers
  const filteredServices = useMemo(() => {
    return services.filter(s => {
      const inRange = s.service_date >= dateRange.from && s.service_date <= dateRange.to;
      const inType  = svcTypeFilter.length === 0 || svcTypeFilter.includes(s.name);
      return inRange && inType;
    });
  }, [services, dateRange, svcTypeFilter]);

  // 4. Attending member IDs (depends on filteredServices — declared AFTER it)
  const attendingMemberIds = useMemo(() => {
    if (svcTypeFilter.length === 0) return null;
    const ids = new Set();
    filteredServices.forEach(s => (attendance[s.id]||[]).forEach(id => ids.add(id)));
    return ids;
  }, [filteredServices, svcTypeFilter, attendance]);

  // 5. Filtered members (depends on attendingMemberIds)
  const filteredMembers = useMemo(() => {
    const picked = new Set(selectedMemberIds);
    return members.filter(m => {
      if (picked.size > 0 && !picked.has(m.id)) return false; // hand-picked members override
      const age = calcAge(m.dob);
      const matchStatus = statusFilter === "all"
        ? true
        : statusFilter === "active" ? m.is_active !== false : m.is_active === false;
      const matchSex    = sexFilter.length === 0 || sexFilter.includes(m.sex);
      const matchCity   = cityFilter.length === 0 || cityFilter.includes(m.city);
      const matchRole   = roleFilter.length === 0 || (m.roles||[]).some(r => roleFilter.includes(r));
      const matchAge    = (() => {
        if (ageFilter.length === 0) return true;
        return ageFilter.some(lbl => {
          if (lbl === "Unknown") return age === null;
          const cat = AGE_CATS.find(c => c.label === lbl);
          return cat && age !== null && age >= cat.min && age <= cat.max;
        });
      })();
      const matchMarital = maritalFilter.length === 0 || maritalFilter.includes(m.marital_status);
      const matchInteraction = interactionFilter.length === 0 || interactionFilter.includes(m.interaction_type);
      const matchSkill = skillFilterA.length === 0 || skillFilterA.some(k => [m.skill1, m.skill2, m.skill3].includes(k));
      const matchAgeRange = ageInRange(age, ageMin, ageMax);
      const matchAttended = !attendingMemberIds || attendingMemberIds.has(m.id);
      return matchStatus && matchSex && matchCity && matchRole && matchAge && matchMarital && matchInteraction && matchSkill && matchAgeRange && matchAttended;
    });
  }, [members, statusFilter, sexFilter, cityFilter, roleFilter, ageFilter, maritalFilter, interactionFilter, skillFilterA, ageMin, ageMax, selectedMemberIds, attendingMemberIds]);

  // Same member filters WITHOUT the attended-only restriction, so the by-individual
  // list also shows people who attended none of the selected services (their "missed").
  const attMembers = useMemo(() => {
    const picked = new Set(selectedMemberIds);
    return members.filter(m => {
      if (picked.size > 0 && !picked.has(m.id)) return false;
      const age = calcAge(m.dob);
      const matchStatus = statusFilter === "all" ? true : statusFilter === "active" ? m.is_active !== false : m.is_active === false;
      const matchSex  = sexFilter.length === 0 || sexFilter.includes(m.sex);
      const matchCity = cityFilter.length === 0 || cityFilter.includes(m.city);
      const matchRole = roleFilter.length === 0 || (m.roles||[]).some(r => roleFilter.includes(r));
      const matchAge  = ageFilter.length === 0 || ageFilter.some(lbl => {
        if (lbl === "Unknown") return age === null;
        const cat = AGE_CATS.find(c => c.label === lbl);
        return cat && age !== null && age >= cat.min && age <= cat.max;
      });
      const matchMarital = maritalFilter.length === 0 || maritalFilter.includes(m.marital_status);
      const matchInteraction = interactionFilter.length === 0 || interactionFilter.includes(m.interaction_type);
      const matchSkill = skillFilterA.length === 0 || skillFilterA.some(k => [m.skill1, m.skill2, m.skill3].includes(k));
      const matchAgeRange = ageInRange(age, ageMin, ageMax);
      return matchStatus && matchSex && matchCity && matchRole && matchAge && matchMarital && matchInteraction && matchSkill && matchAgeRange;
    });
  }, [members, statusFilter, sexFilter, cityFilter, roleFilter, ageFilter, maritalFilter, interactionFilter, skillFilterA, ageMin, ageMax, selectedMemberIds]);

  // A one-line summary of what the By-Member list is currently scoped to, shown
  // (and kept visible) in its toolbar so the active filters stay in view.
  const bymemberScope = [
    svcTypeFilter.length ? `Service types: ${svcTypeFilter.join(", ")}` : "All service types",
    roleFilter.length ? `Ministry: ${roleFilter.join(", ")}` : null,
  ].filter(Boolean).join("   ·   ");

  // Set of member IDs that pass the current member filters — used so the
  // Attendance charts also respond to gender/age/city/ministry/status filters.
  const filteredMemberIds = useMemo(() => new Set(filteredMembers.map(m => m.id)), [filteredMembers]);
  const presentCount = (s) => (attendance[s.id] || []).filter(id => filteredMemberIds.has(id)).length;

  // 6. Summary stats
  const summaryStats = useMemo(() => {
    const counts = filteredServices.map(s => presentCount(s));
    const total = counts.reduce((sum, c) => sum + c, 0);
    const avg   = counts.length ? Math.round(total / counts.length) : 0;
    const peak  = counts.length ? Math.max(...counts) : 0;
    const low   = counts.length ? Math.min(...counts) : 0;
    const ids = new Set();
    filteredServices.forEach(s => (attendance[s.id]||[]).forEach(id => { if (filteredMemberIds.has(id)) ids.add(id); }));
    return { totalAtt: total, avgAtt: avg, peakAtt: peak, lowestAtt: low, distinctAttendees: ids.size };
  }, [filteredServices, attendance, filteredMemberIds]);

  // 7. Attendance trend by month
  // "total" = distinct members who attended at least one service that month
  // "avg"   = average attendance per service session that month
  const attendanceTrend = useMemo(() => {
    const byMonth = {};
    filteredServices.forEach(s => {
      const month = s.service_date.slice(0,7);
      if (!byMonth[month]) byMonth[month] = { month, memberIds: new Set(), sessions:0, sessionTotal:0 };
      (attendance[s.id]||[]).forEach(id => { if (filteredMemberIds.has(id)) byMonth[month].memberIds.add(id); });
      byMonth[month].sessionTotal += presentCount(s);
      byMonth[month].sessions++;
    });
    return Object.values(byMonth)
      .sort((a,b) => a.month.localeCompare(b.month))
      .map(d => ({
        month: d.month,
        total: d.memberIds.size,  // distinct members
        services: d.sessions,
        label: MONTH_NAMES[parseInt(d.month.slice(5,7))-1] + " " + d.month.slice(2,4),
        avg: d.sessions ? Math.round(d.sessionTotal / d.sessions) : 0,
      }));
  }, [filteredServices, attendance, filteredMemberIds]);

  // 7b. Attendance by gender — one line per gender, per month
  const attendanceByGender = useMemo(() => {
    const sexById = {};
    members.forEach(m => { sexById[m.id] = m.sex; });
    const byMonth = {};
    filteredServices.forEach(s => {
      const month = s.service_date.slice(0,7);
      if (!byMonth[month]) byMonth[month] = { month, Male:0, Female:0 };
      (attendance[s.id]||[]).forEach(id => {
        if (!filteredMemberIds.has(id)) return;
        if (sexById[id] === "Male") byMonth[month].Male++;
        else if (sexById[id] === "Female") byMonth[month].Female++;
      });
    });
    return Object.values(byMonth)
      .sort((a,b) => a.month.localeCompare(b.month))
      .map(d => ({ ...d, label: MONTH_NAMES[parseInt(d.month.slice(5,7))-1] + " " + d.month.slice(2,4) }));
  }, [filteredServices, attendance, members, filteredMemberIds]);

  // 7c. Monthly attendance by service type — one line per type, per month
  const attByTypeMonthly = useMemo(() => {
    // Distinct members per type per month (a member attending 4 Sundays counts once).
    const sets = {}; // month -> { type -> Set(memberId) }
    filteredServices.forEach(s => {
      const month = s.service_date.slice(0,7);
      sets[month] = sets[month] || {};
      sets[month][s.name] = sets[month][s.name] || new Set();
      (attendance[s.id]||[]).forEach(id => { if (filteredMemberIds.has(id)) sets[month][s.name].add(id); });
    });
    return Object.keys(sets).sort().map(month => {
      const row = { month, label: MONTH_NAMES[parseInt(month.slice(5,7))-1] + " " + month.slice(2,4) };
      Object.entries(sets[month]).forEach(([type, set]) => { row[type] = set.size; });
      return row;
    });
  }, [filteredServices, attendance, filteredMemberIds]);

  // 8. Attendance by service type
  const attByType = useMemo(() => {
    const byType = {};
    filteredServices.forEach(s => {
      if (!byType[s.name]) byType[s.name] = { name:s.name, total:0, sessions:0 };
      byType[s.name].total += presentCount(s);
      byType[s.name].sessions++;
    });
    return Object.values(byType)
      .map(d => ({ ...d, avg: d.sessions ? Math.round(d.total / d.sessions) : 0 }))
      .sort((a,b) => b.avg - a.avg);
  }, [filteredServices, attendance, filteredMemberIds]);

  // 8a2. Attendance by service type, one point per service DATE (for the date-axis view)
  const attByTypeByDate = useMemo(() => {
    const byDate = {};
    filteredServices.forEach(s => {
      byDate[s.service_date] = byDate[s.service_date] || { date: s.service_date, label: s.service_date.split("-").reverse().join("-") };
      byDate[s.service_date][s.name] = (byDate[s.service_date][s.name] || 0) + presentCount(s);
    });
    return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
  }, [filteredServices, attendance, filteredMemberIds]);

  // 8b. Monthly attendance by age band (same bands as the demographics/summary)
  const attByAgeMonthly = useMemo(() => {
    const bandById = {};
    members.forEach(m => {
      const age = calcAge(m.dob);
      const cat = age === null ? null : AGE_CATS.find(c => age >= c.min && age <= c.max);
      bandById[m.id] = cat ? cat.label : "Unknown";
    });
    // Distinct members per age band per month.
    const sets = {}; // month -> { band -> Set(memberId) }
    filteredServices.forEach(s => {
      const month = s.service_date.slice(0,7);
      sets[month] = sets[month] || {};
      (attendance[s.id]||[]).forEach(id => {
        if (!filteredMemberIds.has(id)) return;
        const band = bandById[id] || "Unknown";
        (sets[month][band] = sets[month][band] || new Set()).add(id);
      });
    });
    return Object.keys(sets).sort().map(month => {
      const row = { month, label: MONTH_NAMES[parseInt(month.slice(5,7))-1] + " " + month.slice(2,4) };
      Object.entries(sets[month]).forEach(([band, set]) => { row[band] = set.size; });
      return row;
    });
  }, [filteredServices, attendance, members, filteredMemberIds]);

  // 9. Member attendance rates
  const memberAttRates = useMemo(() => {
    if (!filteredServices.length) return { high:0, medium:0, low:0, none:0 };
    const counts = {};
    filteredMembers.forEach(m => { counts[m.id] = 0; });
    filteredServices.forEach(s => {
      (attendance[s.id]||[]).forEach(id => {
        if (counts[id] !== undefined) counts[id]++;
      });
    });
    const total = filteredServices.length;
    const rates = Object.values(counts).map(c => c / total * 100);
    return {
      high:   rates.filter(r => r >= 75).length,
      medium: rates.filter(r => r >= 40 && r < 75).length,
      low:    rates.filter(r => r > 0 && r < 40).length,
      none:   rates.filter(r => r === 0).length,
    };
  }, [filteredServices, filteredMembers, attendance]);

  // 10. Service ranking — best and least attended
  const rankedServices = useMemo(() =>
    filteredServices
      .map(s => ({ name:`${s.name} (${s.service_date.split("-").reverse().join("-")})`, count:presentCount(s) }))
      .sort((a,b) => b.count - a.count)
  , [filteredServices, attendance, filteredMemberIds]);
  const sessionRanking = useMemo(() => rankedServices.slice(0,8), [rankedServices]);
  const lowestServices = useMemo(() => [...rankedServices].sort((a,b) => a.count - b.count).slice(0,8), [rankedServices]);

  // 11. Age breakdown
  const ageBreakdown = useMemo(() => {
    const cats = AGE_CATS.map(cat => ({
      name: cat.label,
      value: filteredMembers.filter(m => {
        const age = calcAge(m.dob);
        return age !== null && age >= cat.min && age <= cat.max;
      }).length,
      color: cat.color,
    })).filter(d => d.value > 0);
    const noDob = filteredMembers.filter(m => !m.dob).length;
    if (noDob > 0) cats.push({ name:"No DOB", value:noDob, color:"var(--border)" });
    return cats;
  }, [filteredMembers]);

  // 12. Sex breakdown
  const sexBreakdown = useMemo(() => [
    { name:"Male",    value: filteredMembers.filter(m => m.sex==="Male").length,   color:TEAL },
    { name:"Female",  value: filteredMembers.filter(m => m.sex==="Female").length, color:PINK },
    { name:"Unknown", value: filteredMembers.filter(m => !m.sex).length,           color:"var(--border)" },
  ].filter(d => d.value > 0), [filteredMembers]);

  // 13. City distribution
  const cityBreakdown = useMemo(() => {
    const counts = {};
    filteredMembers.forEach(m => {
      const c = m.city || "Not Specified";
      counts[c] = (counts[c]||0) + 1;
    });
    return Object.entries(counts)
      .map(([name,value]) => ({ name, value }))
      .sort((a,b) => b.value - a.value)
      .slice(0,10);
  }, [filteredMembers]);

  // 14. Join trend
  const joinTrend = useMemo(() => {
    const byMonth = {};
    filteredMembers
      .filter(m => m.join_date && m.join_date >= dateRange.from && m.join_date <= dateRange.to)
      .forEach(m => {
        const month = m.join_date.slice(0,7);
        byMonth[month] = (byMonth[month]||0) + 1;
      });
    return Object.entries(byMonth)
      .sort((a,b) => a[0].localeCompare(b[0]))
      .map(([month, count]) => ({
        label: MONTH_NAMES[parseInt(month.slice(5,7))-1] + " " + month.slice(2,4),
        count,
      }));
  }, [filteredMembers, dateRange]);

  // 15. Ministry size
  const ministrySize = useMemo(() =>
    ROLES.map(r => ({
      name: r,
      value: filteredMembers.filter(m => (m.roles||[]).includes(r)).length,
    })).filter(d => d.value > 0).sort((a,b) => b.value - a.value)
  , [filteredMembers]);

  // 16. Multi-role data
  const multiRoleData = useMemo(() => {
    const c = { 0:0, 1:0, 2:0, 3:0, "4+":0 };
    filteredMembers.forEach(m => {
      const n = (m.roles||[]).length;
      if (n === 0) c[0]++;
      else if (n === 1) c[1]++;
      else if (n === 2) c[2]++;
      else if (n === 3) c[3]++;
      else c["4+"]++;
    });
    return [
      { name:"No Ministry",   value:c[0],    color:"var(--border)" },
      { name:"1 Ministry",    value:c[1],    color:TEAL },
      { name:"2 Ministries",  value:c[2],    color:TURQUOISE },
      { name:"3 Ministries",  value:c[3],    color:ORANGE },
      { name:"4+ Ministries", value:c["4+"], color:PURPLE },
    ].filter(d => d.value > 0);
  }, [filteredMembers]);

  // 17. Distinct with role
  const distinctWithRole = useMemo(() =>
    filteredMembers.filter(m => (m.roles||[]).length > 0).length
  , [filteredMembers]);

  // 18. Birthdays by month
  const birthdaysByMonth = useMemo(() => {
    const counts = Array(12).fill(0);
    filteredMembers.filter(m => m.dob).forEach(m => {
      const month = new Date(m.dob+"T00:00:00").getUTCMonth();
      counts[month]++;
    });
    return counts.map((count, i) => ({ name: MONTH_FULL[i], count }));
  }, [filteredMembers]);

  const anniversariesByMonth = useMemo(() => {
    const counts = Array(12).fill(0);
    const seen = new Set(); // count a spouse-linked couple once
    filteredMembers.filter(m => m.anniversary).forEach(m => {
      if (seen.has(m.id)) return;
      seen.add(m.id);
      if (m.spouse_id) seen.add(m.spouse_id);
      const month = new Date(m.anniversary+"T00:00:00").getUTCMonth();
      counts[month]++;
    });
    return counts.map((count, i) => ({ name: MONTH_FULL[i], count }));
  }, [filteredMembers]);

  const WEEKDAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

  // 19. Day-of-week attendance patterns
  const dayOfWeekPatterns = useMemo(() => {
    const acc = WEEKDAYS.map(d => ({ day:d, sessions:0, total:0 }));
    filteredServices.forEach(s => {
      const wd = new Date(s.service_date+"T12:00:00").getDay();
      acc[wd].sessions++;
      acc[wd].total += presentCount(s);
    });
    return acc.map(a => ({ ...a, avg: a.sessions ? Math.round(a.total/a.sessions) : 0 }));
  }, [filteredServices, attendance, filteredMemberIds]);

  // 20. Slipping away — active members who used to attend but have gone quiet (no attendance in last 28 days)
  const slippingAway = useMemo(() => {
    if (filteredServices.length < 2) return [];
    const latest = filteredServices.map(s => s.service_date).reduce((a,b)=>a>b?a:b);
    const cutoff = new Date(latest+"T12:00:00"); cutoff.setDate(cutoff.getDate()-28);
    const cutoffStr = cutoff.toISOString().slice(0,10);
    const attDates = {};
    filteredServices.forEach(s => (attendance[s.id]||[]).forEach(id => {
      (attDates[id] = attDates[id] || []).push(s.service_date);
    }));
    const out = [];
    filteredMembers.forEach(m => {
      const ds = attDates[m.id];
      if (!ds || ds.length < 2) return;
      const lastSeen = ds.reduce((a,b)=>a>b?a:b);
      const recently = ds.some(d => d >= cutoffStr);
      if (!recently) out.push({ id:m.id, name:fullName(m), lastSeen, count:ds.length });
    });
    return out.sort((a,b)=>a.lastSeen.localeCompare(b.lastSeen)).slice(0,20);
  }, [filteredServices, attendance, filteredMembers]);

  // 20b. Inactive candidates — still marked active, but haven't attended any service in 90+ days
  // after having attended before. Measured against today (independent of the analytics filters).
  const inactiveCandidates = useMemo(() => {
    const lastByMember = {};
    services.forEach(s => (attendance[s.id]||[]).forEach(id => {
      if (!lastByMember[id] || s.service_date > lastByMember[id]) lastByMember[id] = s.service_date;
    }));
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate()-90);
    const cutoffStr = cutoff.toISOString().slice(0,10);
    const today = new Date();
    return members
      .filter(m => m.is_active !== false)
      .map(m => ({ m, lastSeen: lastByMember[m.id] }))
      .filter(x => x.lastSeen && x.lastSeen < cutoffStr)
      .map(x => ({ ...x, daysAgo: Math.round((today - new Date(x.lastSeen + "T12:00:00")) / 86400000) }))
      .sort((a, b) => a.lastSeen.localeCompare(b.lastSeen));
  }, [members, services, attendance]);

  async function markInactive(id) {
    setSavingInactive(id);
    const { error } = await supabase.from("members").update({ is_active: false }).eq("id", id);
    setSavingInactive(null);
    if (!error) setMembers(prev => prev.map(m => m.id === id ? { ...m, is_active: false } : m));
  }

  // 21. First-timer retention — based on ALL recorded services so "first time" is truly first
  const firstTimerRetention = useMemo(() => {
    const attDates = {};
    services.forEach(s => (attendance[s.id]||[]).forEach(id => {
      (attDates[id] = attDates[id] || []).push(s.service_date);
    }));
    const cohorts = {};
    Object.entries(attDates).forEach(([id, ds]) => {
      if (!ds.length || !filteredMemberIds.has(id)) return;
      ds.sort();
      const first = ds[0];
      const month = first.slice(0,7);
      const returned = ds.some(d => d > first);
      if (!cohorts[month]) cohorts[month] = { month, cohort:0, returned:0 };
      cohorts[month].cohort++;
      if (returned) cohorts[month].returned++;
    });
    return Object.values(cohorts)
      .sort((a,b)=>a.month.localeCompare(b.month))
      .slice(-12)
      .map(c => ({ ...c, label: MONTH_NAMES[parseInt(c.month.slice(5,7))-1]+" "+c.month.slice(2,4), pct: c.cohort?Math.round(c.returned/c.cohort*100):0 }));
  }, [services, attendance, filteredMemberIds]);

  // 22. Net growth — cumulative membership over time (all members with a join date)
  const netGrowth = useMemo(() => {
    const byMonth = {};
    filteredMembers.filter(m => m.join_date).forEach(m => {
      const month = m.join_date.slice(0,7);
      byMonth[month] = (byMonth[month]||0)+1;
    });
    let run = 0;
    return Object.keys(byMonth).sort().map(month => {
      run += byMonth[month];
      return { label: MONTH_NAMES[parseInt(month.slice(5,7))-1]+" '"+month.slice(2,4), total: run, added: byMonth[month] };
    });
  }, [filteredMembers]);

  // 23. Age pyramid — male (left, negative) vs female (right) per age band
  const agePyramid = useMemo(() => AGE_CATS.map(cat => {
    const inBand = filteredMembers.filter(m => { const a = calcAge(m.dob); return a!==null && a>=cat.min && a<=cat.max; });
    return {
      band: cat.label,
      male: -inBand.filter(m => m.sex==="Male").length,
      female: inBand.filter(m => m.sex==="Female").length,
    };
  }), [filteredMembers]);

  // 24. Households view
  const householdView = useMemo(() => {
    const byHh = {};
    filteredMembers.forEach(m => { if (m.household_id) (byHh[m.household_id] = byHh[m.household_id]||[]).push(m); });
    const list = Object.entries(byHh).map(([id, mem]) => ({
      id, name: (households.find(h=>h.id===id)||{}).name || "Household", members: mem, size: mem.length,
      children: mem.filter(m => { const a = calcAge(m.dob); return ["Son","Daughter","Grandson","Granddaughter"].includes(m.household_role) || (a!==null && a < 18); }).length,
    })).sort((a,b)=> b.size - a.size || a.name.localeCompare(b.name));
    const peopleInHouseholds = filteredMembers.filter(m => m.household_id).length;
    const sizeDist = { 1:0, 2:0, 3:0, "4+":0 };
    const sizeCount = {};
    list.forEach(h => {
      if (h.size>=4) sizeDist["4+"]++; else sizeDist[h.size]++;
      const key = h.size >= 5 ? "5+" : String(h.size);
      sizeCount[key] = (sizeCount[key]||0) + 1;
    });
    const sizeChart = ["1","2","3","4","5+"].map(k => ({ name: k === "5+" ? "5+" : k + (k==="1"?" person":" people"), households: sizeCount[k]||0 }));
    const withChildren = list.filter(h => h.children > 0);
    const totalChildren = withChildren.reduce((s,h)=>s+h.children, 0);
    return {
      list, count:list.length, peopleInHouseholds,
      without: filteredMembers.length - peopleInHouseholds,
      avg: list.length ? (peopleInHouseholds/list.length) : 0,
      sizeDist, sizeChart,
      withChildren: withChildren.length,
      adultsOnly: list.filter(h => h.children === 0).length,
      avgChildren: withChildren.length ? totalChildren / withChildren.length : 0,
      largest: list[0] || null,
    };
  }, [filteredMembers, households]);

  // 25. Cross-ministry overlap — pairs of ministries that share members
  const crossMinistry = useMemo(() => {
    const pairs = [];
    for (let i=0;i<ROLES.length;i++) for (let j=i+1;j<ROLES.length;j++) {
      const a = ROLES[i], b = ROLES[j];
      const count = filteredMembers.filter(m => (m.roles||[]).includes(a) && (m.roles||[]).includes(b)).length;
      if (count>0) pairs.push({ pair:`${a} + ${b}`, count });
    }
    return pairs.sort((x,y)=>y.count-x.count).slice(0,10);
  }, [filteredMembers]);

  // 26. Ministry coverage by gender + average age
  const ministryCoverage = useMemo(() => ROLES.map(r => {
    const mem = filteredMembers.filter(m => (m.roles||[]).includes(r));
    const ages = mem.map(m=>calcAge(m.dob)).filter(a=>a!==null);
    return {
      name: r,
      male: mem.filter(m=>m.sex==="Male").length,
      female: mem.filter(m=>m.sex==="Female").length,
      unknownSex: mem.filter(m=>!m.sex).length,
      avgAge: ages.length ? Math.round(ages.reduce((s,a)=>s+a,0)/ages.length) : null,
      total: mem.length,
    };
  }).filter(d => d.total>0).sort((a,b)=>b.total-a.total), [filteredMembers]);

  // Notable one-directional overlaps: "X% of ministry A also serve in B".
  const overlapInsights = useMemo(() => {
    const sizeOf = n => (ministrySize.find(x => x.name === n) || {}).value || 0;
    return crossMinistry.map(p => {
      const [a, b] = p.pair.split(" + ");
      const sa = sizeOf(a), sb = sizeOf(b);
      const pctA = sa ? Math.round(p.count / sa * 100) : 0;
      const pctB = sb ? Math.round(p.count / sb * 100) : 0;
      return pctA >= pctB ? { from: a, to: b, pct: pctA, count: p.count } : { from: b, to: a, pct: pctB, count: p.count };
    }).sort((x, y) => y.pct - x.pct).slice(0, 5);
  }, [crossMinistry, ministrySize]);

  // Instruments: parse the comma-separated `instruments` field on each member.
  const instrumentData = useMemo(() => {
    const instrsOf = m => String(m.instruments || "").split(",").map(s => s.trim()).filter(Boolean);
    const musicians = filteredMembers.filter(m => instrsOf(m).length > 0 || (m.roles || []).includes("Musician"));
    const withInstr = filteredMembers.filter(m => instrsOf(m).length > 0);
    const byInstrument = {};
    withInstr.forEach(m => { [...new Set(instrsOf(m))].forEach(inst => (byInstrument[inst] = byInstrument[inst] || []).push(m)); });
    const dist = {};
    const byCount = {};
    withInstr.forEach(m => {
      const insts = [...new Set(instrsOf(m))];
      const n = insts.length;
      dist[n] = (dist[n] || 0) + 1;
      (byCount[n] = byCount[n] || []).push({ member: m, instruments: insts });
    });
    return {
      total: musicians.length,
      withInstr: withInstr.length,
      multi: withInstr.filter(m => new Set(instrsOf(m)).size >= 2).length,
      instrumentList: Object.entries(byInstrument).map(([instrument, members]) => ({ instrument, members, count: members.length })).sort((a, b) => b.count - a.count),
      distList: Object.keys(dist).map(Number).sort((a, b) => a - b).map(n => ({ name: `${n} instrument${n > 1 ? "s" : ""}`, count: dist[n] })),
      byCount: Object.keys(byCount).map(Number).sort((a, b) => b - a).map(n => ({ n, players: byCount[n].sort((x, y) => fullName(x.member).localeCompare(fullName(y.member))) })),
    };
  }, [filteredMembers]);

  // ── Helper ────────────────────────────────────────────────
  function toggleSvcType(name) {
    setSvcTypeFilter(prev => prev.includes(name) ? prev.filter(x => x !== name) : [...prev, name]);
  }

  // Filter-drawer helpers: how many filter groups are active, a label for the period,
  // and a one-shot reset.
  const customRangeActive = !!(customFrom || customTo);
  const activeFilterCount =
    (svcTypeFilter.length ? 1 : 0) + (sexFilter.length ? 1 : 0) + (ageFilter.length ? 1 : 0) +
    (cityFilter.length ? 1 : 0) + (roleFilter.length ? 1 : 0) + (selectedMemberIds.length ? 1 : 0) +
    (statusFilter !== "active" ? 1 : 0) + (customRangeActive ? 1 : 0) +
    (maritalFilter.length ? 1 : 0) + (interactionFilter.length ? 1 : 0) + (skillFilterA.length ? 1 : 0) +
    ((ageMin !== "" || ageMax !== "") ? 1 : 0);
  const PERIOD_LABELS = { this_month: "This Month", last_3: "Last 3 Months", this_year: "This Year", last_year: "Last Year", all: "All Time" };
  const periodLabel = customRangeActive
    ? `${dateRange.from.split("-").reverse().join("/")} – ${dateRange.to.split("-").reverse().join("/")}`
    : (PERIOD_LABELS[quickRange] || "All Time");
  function clearAllFilters() {
    setSvcTypeFilter([]); setSexFilter([]); setAgeFilter([]); setCityFilter([]);
    setRoleFilter([]); setSelectedMemberIds([]); setStatusFilter("active");
    setMaritalFilter([]); setInteractionFilter([]); setSkillFilterA([]);
    setAgeMin(""); setAgeMax("");
    setCustomFrom(""); setCustomTo("");
  }

  const { totalAtt, avgAtt, peakAtt, lowestAtt, distinctAttendees } = summaryStats;
  // Average attendance as a share of the active members in scope.
  const activeInScope = attMembers.filter(m => m.is_active !== false).length;
  const avgTurnoutPct = activeInScope ? Math.round(avgAtt / activeInScope * 100) : 0;
  const svcTypeData = svcTypeAxis === "date" ? attByTypeByDate : attByTypeMonthly;

  // Which service hit peak / lowest attendance (for the date shown on those tiles).
  const svcCounts = filteredServices.map(s => ({ s, c: presentCount(s) }));
  const peakSvc = svcCounts.reduce((a,b) => (a === null || b.c > a.c) ? b : a, null);
  const lowSvc  = svcCounts.reduce((a,b) => (a === null || b.c < a.c) ? b : a, null);
  const fmtDay  = ds => ds ? new Date(ds + "T12:00:00").toLocaleString("default",{month:"short",day:"numeric"}) : "";

  // Same stats over the previous equal-length window (same filters) → change badges.
  const prevStats = useMemo(() => {
    const fromD = new Date(dateRange.from + "T12:00:00"), toD = new Date(dateRange.to + "T12:00:00");
    const spanDays = Math.max(1, Math.round((toD - fromD) / 86400000));
    const iso = d => d.toISOString().slice(0,10);
    const prevTo = new Date(fromD.getTime() - 86400000);
    const prevFrom = new Date(prevTo.getTime() - spanDays * 86400000);
    const pf = iso(prevFrom), pt = iso(prevTo);
    const svcs = services.filter(s => (svcTypeFilter.length === 0 || svcTypeFilter.includes(s.name)) && s.service_date >= pf && s.service_date <= pt);
    const counts = svcs.map(s => (attendance[s.id] || []).filter(id => filteredMemberIds.has(id)).length);
    const ids = new Set(); svcs.forEach(s => (attendance[s.id] || []).forEach(id => { if (filteredMemberIds.has(id)) ids.add(id); }));
    const avg = counts.length ? Math.round(counts.reduce((a,b)=>a+b,0) / counts.length) : 0;
    return { has: svcs.length > 0, services: svcs.length, distinct: ids.size, avg,
      turnout: activeInScope ? Math.round(avg / activeInScope * 100) : 0,
      peak: counts.length ? Math.max(...counts) : 0, low: counts.length ? Math.min(...counts) : 0 };
  }, [services, attendance, filteredMemberIds, dateRange, svcTypeFilter, activeInScope]);
  const chg = (cur, prev) => prevStats.has ? cur - prev : null;

  // Sparkline series + reference-line averages from the monthly trend.
  const sparkTotal = attendanceTrend.map(x => x.total);
  const sparkAvg   = attendanceTrend.map(x => x.avg);
  const sparkTurn  = attendanceTrend.map(x => activeInScope ? Math.round(x.avg / activeInScope * 100) : 0);
  const trendTotalAvg = sparkTotal.length ? Math.round(sparkTotal.reduce((a,b)=>a+b,0) / sparkTotal.length) : 0;

  // ── RENDER ────────────────────────────────────────────────
  return (
    <div className="fade-in">
      <div style={{position:"sticky",top:stickyTop,zIndex:40,background:"var(--bg-body)",paddingTop:12,marginBottom:20,borderBottom:"1px solid var(--border)",boxShadow:"0 6px 8px -6px #00000022"}}>
      <div style={{marginBottom:12}}>
        <div style={{fontSize:14,letterSpacing:0.5,fontWeight:700,color:"var(--text)"}}>ANALYTICS</div>
        <div style={{fontSize:12,color:"var(--text-faint)",marginTop:3}}>
          {filteredMembers.length} members · {filteredServices.length} services · {dateRange.from.split("-").reverse().join("/")} – {dateRange.to.split("-").reverse().join("/")}
        </div>
      </div>

      {/* ── FILTER TOOLBAR (opens the slide-out drawer) ── */}
      <div style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap",paddingBottom:12}}>
        <button onClick={()=>setFiltersOpen(true)} style={{
          display:"inline-flex",alignItems:"center",gap:8,padding:"8px 16px",borderRadius:10,
          fontSize:13,fontWeight:600,cursor:"pointer",
          background:activeFilterCount?TEAL:"var(--surface-alt)",
          color:activeFilterCount?"#fff":"var(--text-2)",
          border:`1.5px solid ${activeFilterCount?TEAL:"var(--border)"}`,
        }}>
          <SlidersHorizontal size={15} /> Filters
          {activeFilterCount>0 && <span style={{background:"#ffffff33",borderRadius:20,padding:"0 7px",fontSize:11,fontWeight:700}}>{activeFilterCount}</span>}
        </button>
        <span style={{fontSize:12,color:"var(--text-faint)"}}>
          {periodLabel}{svcTypeFilter.length ? ` · ${svcTypeFilter.join(", ")}` : " · All services"}
        </span>
        {activeFilterCount>0 && (
          <button onClick={clearAllFilters} style={{padding:"5px 12px",borderRadius:20,fontSize:12,background:"var(--danger-bg)",color:"var(--danger)",border:"1.5px solid var(--danger-border)",cursor:"pointer",fontWeight:500}}>Clear all</button>
        )}
      </div>
      </div>

      {/* ── FILTER DRAWER ── */}
      {filtersOpen && (
        <>
          <div onClick={()=>setFiltersOpen(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",zIndex:300}} />
          <div className="fade-in" style={{position:"fixed",zIndex:301,background:"var(--surface)",display:"flex",flexDirection:"column",
            ...(isMobile
              ? {left:0,right:0,bottom:0,maxHeight:"82vh",borderRadius:"16px 16px 0 0",boxShadow:"0 -4px 24px #00000026"}
              : {top:0,right:0,height:"100%",width:370,maxWidth:"92vw",boxShadow:"-4px 0 24px #00000026"})}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"16px 20px",borderBottom:"1px solid var(--border)"}}>
              <div style={{fontSize:14,fontWeight:700,color:"var(--text)"}}>Filters</div>
              <button onClick={()=>setFiltersOpen(false)} style={{background:"none",border:"1px solid var(--border)",borderRadius:8,width:30,height:30,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",color:"var(--text-muted)"}}><X size={15} /></button>
            </div>

            <div style={{flex:1,overflowY:"auto",padding:"18px 20px",display:"flex",flexDirection:"column",gap:22}}>
              {/* Period */}
              <div>
                <div style={{fontSize:11,fontWeight:700,color:"var(--text-faint)",textTransform:"uppercase",letterSpacing:0.8,marginBottom:10}}>Period</div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  {[["this_month","This Month"],["last_3","Last 3 Months"],["this_year","This Year"],["last_year","Last Year"],["all","All Time"]].map(([key,label]) => (
                    <button key={key} onClick={()=>{setQuickRange(key);setCustomFrom("");setCustomTo("");}} style={{
                      padding:"5px 12px",borderRadius:20,fontSize:12,fontWeight:500,cursor:"pointer",
                      background:quickRange===key&&!customFrom?TEAL:"var(--surface-alt)",
                      color:quickRange===key&&!customFrom?"#fff":"#374151",
                      border:`1.5px solid ${quickRange===key&&!customFrom?TEAL:"var(--border)"}`,
                    }}>{label}</button>
                  ))}
                </div>
                <div style={{display:"flex",gap:6,alignItems:"center",marginTop:8}}>
                  <input type="date" value={customFrom} onChange={e=>{setCustomFrom(e.target.value);setQuickRange("");}} style={{flex:1,fontSize:12,padding:"5px 8px"}} />
                  <span style={{color:"var(--text-faint)",fontSize:12}}>to</span>
                  <input type="date" value={customTo} onChange={e=>{setCustomTo(e.target.value);setQuickRange("");}} style={{flex:1,fontSize:12,padding:"5px 8px"}} />
                </div>
              </div>

              {/* Service type */}
              <div>
                <div style={{fontSize:11,fontWeight:700,color:"var(--text-faint)",textTransform:"uppercase",letterSpacing:0.8,marginBottom:10}}>Service type</div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  <button onClick={()=>setSvcTypeFilter([])} style={{
                    padding:"5px 12px",borderRadius:20,fontSize:12,fontWeight:500,cursor:"pointer",
                    background:svcTypeFilter.length===0?TEAL:"var(--surface-alt)",
                    color:svcTypeFilter.length===0?"#fff":"#374151",
                    border:`1.5px solid ${svcTypeFilter.length===0?TEAL:"var(--border)"}`,
                  }}>All</button>
                  {allSvcTypes.map(t => (
                    <button key={t} onClick={()=>toggleSvcType(t)} style={{
                      padding:"5px 12px",borderRadius:20,fontSize:12,fontWeight:500,cursor:"pointer",
                      background:svcTypeFilter.includes(t)?TEAL:"var(--surface-alt)",
                      color:svcTypeFilter.includes(t)?"#fff":"#374151",
                      border:`1.5px solid ${svcTypeFilter.includes(t)?TEAL:"var(--border)"}`,
                    }}>{t}</button>
                  ))}
                </div>
              </div>

              {/* Members */}
              <div>
                <div style={{fontSize:11,fontWeight:700,color:"var(--text-faint)",textTransform:"uppercase",letterSpacing:0.8,marginBottom:10}}>Members</div>
                <div style={{display:"flex",flexDirection:"column",gap:10,alignItems:"flex-start"}}>
                  <MultiSelect label="Gender" options={["Male","Female"]} selected={sexFilter} onChange={setSexFilter} />
                  <MultiSelect label="Age group" options={[...AGE_CATS.map(c=>c.label), "Unknown"]} selected={ageFilter} onChange={setAgeFilter} />
                  <div style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:"var(--text-2)"}}>
                    <span style={{fontWeight:600}}>Age range</span>
                    <input type="number" min="0" max="120" placeholder="min" value={ageMin} onChange={e=>setAgeMin(e.target.value)} style={{width:56,padding:"5px 6px",fontSize:12}} />
                    <span style={{color:"var(--text-faint)"}}>to</span>
                    <input type="number" min="0" max="120" placeholder="max" value={ageMax} onChange={e=>setAgeMax(e.target.value)} style={{width:56,padding:"5px 6px",fontSize:12}} />
                    {(ageMin!==""||ageMax!=="") && <button onClick={()=>{setAgeMin("");setAgeMax("");}} title="Clear age range" style={{background:"none",border:"1px solid var(--border)",borderRadius:8,color:"var(--text-faint)",cursor:"pointer",fontSize:11,padding:"3px 6px",display:"inline-flex"}}><X size={12}/></button>}
                  </div>
                  <MultiSelect label="City" options={TRINIDAD_CITIES} selected={cityFilter} onChange={setCityFilter} />
                  <MultiSelect label="Ministry" options={ROLES} selected={roleFilter} onChange={setRoleFilter} />
                  <MultiSelect label="Marital" options={maritalOptions} selected={maritalFilter} onChange={setMaritalFilter} />
                  <MultiSelect label="Attends" options={interactionOptions} selected={interactionFilter} onChange={setInteractionFilter} />
                  <MultiSelect label="Skill" options={skillOptions} selected={skillFilterA} onChange={setSkillFilterA} />
                  <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} style={{fontSize:12,padding:"5px 8px"}}>
                    <option value="active">Active Only</option>
                    <option value="all">All Members</option>
                    <option value="inactive">Inactive Only</option>
                  </select>
                  <MemberPicker members={members} selectedIds={selectedMemberIds} onChange={setSelectedMemberIds} />
                </div>
                {selectedMemberIds.length > 0 && (
                  <div style={{marginTop:8,fontSize:11.5,color:"var(--text-muted)"}}>
                    Showing {selectedMemberIds.length} hand-picked member{selectedMemberIds.length===1?"":"s"}, other member filters are applied within that group.
                  </div>
                )}
              </div>
            </div>

            <div style={{display:"flex",gap:10,padding:"14px 20px",borderTop:"1px solid var(--border)"}}>
              <button className="btn-ghost" style={{flex:1}} onClick={clearAllFilters}>Clear all</button>
              <button className="btn-primary" style={{flex:1}} onClick={()=>setFiltersOpen(false)}>Done</button>
            </div>
          </div>
        </>
      )}

      {/* ── SECTION TABS ── */}
      <div style={{display:"flex",gap:4,borderBottom:"1.5px solid var(--border)",marginBottom:20}}>
        {[["attendance","Attendance"],["members","Members"],["ministry","Ministries"],["instruments","Musicians"]].map(([key,label]) => (
          <button key={key} onClick={()=>setActiveSection(key)} style={{
            background:"none",border:"none",cursor:"pointer",fontFamily:"Inter,sans-serif",
            fontSize:13,fontWeight:600,padding:"10px 18px",
            color:activeSection===key?TEAL:"var(--text-faint)",
            borderBottom:`2px solid ${activeSection===key?TURQUOISE:"transparent"}`,
          }}>{label}</button>
        ))}
      </div>

      {/* ── ATTENDANCE ── */}
      {activeSection === "attendance" && (
        <div>
          <div style={{display:"flex",gap:4,marginBottom:16}}>
            {[["overview","Overview"],["bymember","By Member"],["byhousehold","By Family"]].map(([k,label])=>(
              <button key={k} onClick={()=>setAttSub(k)} style={{
                background:attSub===k?TEAL:"var(--surface-alt)",color:attSub===k?"#fff":"var(--text-2)",
                border:`1.5px solid ${attSub===k?TEAL:"var(--border)"}`,borderRadius:20,cursor:"pointer",
                fontSize:12.5,fontWeight:600,padding:"6px 16px"}}>{label}</button>
            ))}
          </div>

          {attSub === "overview" && (<>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:12,marginBottom:4}}>
            <StatTile label="Total Services" value={filteredServices.length} delta={chg(filteredServices.length, prevStats.services)} />
            <StatTile label="Total Members" value={distinctAttendees} delta={chg(distinctAttendees, prevStats.distinct)} spark={sparkTotal} />
            <StatTile label="Avg per Service" value={avgAtt} color={TURQUOISE} delta={chg(avgAtt, prevStats.avg)} spark={sparkAvg} sparkColor={TURQUOISE} />
            <StatTile label="Avg Turnout" value={`${avgTurnoutPct}%`} color={GREEN} delta={chg(avgTurnoutPct, prevStats.turnout)} spark={sparkTurn} sparkColor={GREEN} />
            <StatTile label="Peak Attendance" value={peakAtt} color={ORANGE} delta={chg(peakAtt, prevStats.peak)} sub={fmtDay(peakSvc?.s?.service_date)} />
            <StatTile label="Lowest Attendance" value={lowestAtt} color={RED} delta={chg(lowestAtt, prevStats.low)} sub={fmtDay(lowSvc?.s?.service_date)} />
          </div>
          {prevStats.has && <div style={{fontSize:11,color:"var(--text-faint)",marginTop:6}}>▲▼ vs the previous {(() => { const dd=Math.max(1,Math.round((new Date(dateRange.to)-new Date(dateRange.from))/86400000)); return dd>=28 ? `${Math.round(dd/30)||1} month${Math.round(dd/30)>1?"s":""}` : `${dd} days`; })()}</div>}

          <SectionTitle>Attendance Trend</SectionTitle>
          {attendanceTrend.length === 0
            ? <div style={{textAlign:"center",padding:40,color:"var(--text-faint)",fontSize:13}}>No attendance data for this period</div>
            : <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(320px,1fr))",gap:14}}>
                <ChartCard title="Total Members per Month" subtitle="Distinct members who attended each month">
                  <ResponsiveContainer width="100%" height={240}>
                    <AreaChart data={attendanceTrend} margin={{top:4,right:16,bottom:4,left:0}}>
                      <defs>
                        <linearGradient id="gradTotal" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={TEAL} stopOpacity={0.22} />
                          <stop offset="100%" stopColor={TEAL} stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                      <XAxis dataKey="label" tick={{fontSize:11,fill:"var(--text-faint)"}} />
                      <YAxis tick={{fontSize:11,fill:"var(--text-faint)"}} />
                      <Tooltip content={<CustomTooltip />} />
                      {sparkTotal.length > 1 && <ReferenceLine y={trendTotalAvg} stroke="#98a2ad" strokeDasharray="5 5" strokeWidth={1.5} label={{value:`avg ${trendTotalAvg}`,position:"insideTopRight",fontSize:10,fill:"var(--text-faint)"}} />}
                      <Area type="monotone" dataKey="total" name="Total Members" stroke={TEAL} strokeWidth={2.5} fill="url(#gradTotal)" dot={{r:3.5,fill:TEAL}} activeDot={{r:6}} />
                    </AreaChart>
                  </ResponsiveContainer>
                </ChartCard>
                <ChartCard title="Average Attendance per Service" subtitle="Mean attendance per service each month">
                  <ResponsiveContainer width="100%" height={240}>
                    <AreaChart data={attendanceTrend} margin={{top:4,right:16,bottom:4,left:0}}>
                      <defs>
                        <linearGradient id="gradAvg" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={TURQUOISE} stopOpacity={0.28} />
                          <stop offset="100%" stopColor={TURQUOISE} stopOpacity={0.03} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                      <XAxis dataKey="label" tick={{fontSize:11,fill:"var(--text-faint)"}} />
                      <YAxis tick={{fontSize:11,fill:"var(--text-faint)"}} />
                      <Tooltip content={<CustomTooltip />} />
                      {avgAtt > 0 && <ReferenceLine y={avgAtt} stroke="#98a2ad" strokeDasharray="5 5" strokeWidth={1.5} label={{value:`avg ${avgAtt}`,position:"insideTopRight",fontSize:10,fill:"var(--text-faint)"}} />}
                      <Area type="monotone" dataKey="avg" name="Avg per Service" stroke={TURQUOISE} strokeWidth={2.5} fill="url(#gradAvg)" dot={{r:3.5,fill:TURQUOISE}} activeDot={{r:6}} />
                    </AreaChart>
                  </ResponsiveContainer>
                </ChartCard>
              </div>
          }

          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",flexWrap:"wrap",gap:8}}>
            <SectionTitle>Attendance by Service Type</SectionTitle>
            <div style={{display:"inline-flex",border:"1px solid var(--border)",borderRadius:20,overflow:"hidden",marginBottom:14}}>
              {[["month","By month"],["date","By date"]].map(([k,label])=>(
                <button key={k} onClick={()=>setSvcTypeAxis(k)} style={{border:"none",cursor:"pointer",fontSize:11.5,fontWeight:600,padding:"5px 14px",background:svcTypeAxis===k?TEAL:"var(--surface)",color:svcTypeAxis===k?"#fff":"var(--text-muted)"}}>{label}</button>
              ))}
            </div>
          </div>
          {svcTypeData.length === 0
            ? <div style={{textAlign:"center",padding:40,color:"var(--text-faint)",fontSize:13}}>No attendance data for this period</div>
            : <ChartCard title={svcTypeAxis==="date"?"Attendance by Service Type (by date)":"Monthly Attendance by Service Type"} subtitle={svcTypeAxis==="date"?"Members present at each service, by date":"Distinct members per service type each month"}>
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={svcTypeData} margin={{top:4,right:16,bottom:svcTypeAxis==="date"?44:4,left:0}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                    <XAxis dataKey="label" tick={{fontSize:svcTypeAxis==="date"?9:11,fill:"var(--text-faint)"}} angle={svcTypeAxis==="date"?-40:0} textAnchor={svcTypeAxis==="date"?"end":"middle"} interval={svcTypeAxis==="date"?"preserveStartEnd":0} height={svcTypeAxis==="date"?54:30} />
                    <YAxis tick={{fontSize:11,fill:"var(--text-faint)"}} allowDecimals={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{fontSize:12}} />
                    {attByType.map((t,i) => (
                      <Line key={t.name} type="monotone" dataKey={t.name} name={t.name} stroke={LINE_COLORS[i%LINE_COLORS.length]} strokeWidth={2.5} dot={{r:2.5}} activeDot={{r:6}} connectNulls />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>
          }

          <SectionTitle>Attendance by Age Group</SectionTitle>
          {attByAgeMonthly.length === 0
            ? <div style={{textAlign:"center",padding:40,color:"var(--text-faint)",fontSize:13}}>No attendance data for this period</div>
            : <ChartCard title="Monthly Attendance by Age Group" subtitle="Distinct members per age band each month">
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={attByAgeMonthly} margin={{top:4,right:16,bottom:4,left:0}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                    <XAxis dataKey="label" tick={{fontSize:11,fill:"var(--text-faint)"}} />
                    <YAxis tick={{fontSize:11,fill:"var(--text-faint)"}} allowDecimals={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{fontSize:12}} />
                    {AGE_CATS.map(c => (
                      <Line key={c.label} type="monotone" dataKey={c.label} name={c.label} stroke={c.color} strokeWidth={2.5} dot={{r:3}} activeDot={{r:6}} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>
          }

          <SectionTitle>By Service Type</SectionTitle>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:14}}>
            <ChartCard title="Average Attendance by Type" subtitle="Mean attendance per service">
              {attByType.length === 0 ? <div style={{textAlign:"center",padding:30,color:"var(--text-faint)",fontSize:12}}>No data</div>
                : <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={attByType} margin={{top:4,right:8,bottom:40,left:0}}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                      <XAxis dataKey="name" tick={{fontSize:10,fill:"var(--text-faint)"}} angle={-25} textAnchor="end" interval={0} />
                      <YAxis tick={{fontSize:11,fill:"var(--text-faint)"}} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="avg" name="Avg Attendance" radius={[6,6,0,0]}>
                        {attByType.map((_,i) => <Cell key={i} fill={CHART_COLORS[i%CHART_COLORS.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
              }
            </ChartCard>
            <ChartCard title="Services per Type" subtitle="How many times each service ran">
              {attByType.length === 0 ? <div style={{textAlign:"center",padding:30,color:"var(--text-faint)",fontSize:12}}>No data</div>
                : <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={attByType} margin={{top:4,right:8,bottom:40,left:0}}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                      <XAxis dataKey="name" tick={{fontSize:10,fill:"var(--text-faint)"}} angle={-25} textAnchor="end" interval={0} />
                      <YAxis tick={{fontSize:11,fill:"var(--text-faint)"}} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="sessions" name="Services" radius={[6,6,0,0]}>
                        {attByType.map((_,i) => <Cell key={i} fill={CHART_COLORS[i%CHART_COLORS.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
              }
            </ChartCard>
          </div>

          <SectionTitle>Member Attendance Rates</SectionTitle>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:14}}>
            <ChartCard title="Attendance Consistency" subtitle="How regularly members attend">
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                {[
                  {label:"Regular (75%+)", value:memberAttRates.high, color:GREEN},
                  {label:"Occasional (40-74%)", value:memberAttRates.medium, color:GOLD},
                  {label:"Rare (<40%)", value:memberAttRates.low, color:ORANGE},
                  {label:"Not Attended", value:memberAttRates.none, color:"var(--text-faint)"},
                ].map(s => (
                  <div key={s.label} style={{background:"var(--surface-alt)",border:"1px solid var(--border)",borderRadius:10,padding:12,textAlign:"center"}}>
                    <div style={{fontSize:22,fontWeight:700,color:s.color}}>{s.value}</div>
                    <div style={{fontSize:11,color:"var(--text-faint)",marginTop:2,lineHeight:1.4}}>{s.label}</div>
                  </div>
                ))}
              </div>
            </ChartCard>
            <ChartCard title="Top Services by Attendance" subtitle="Best attended services in period">
              {sessionRanking.length === 0 ? <div style={{textAlign:"center",padding:30,color:"var(--text-faint)",fontSize:12}}>No data</div>
                : <div style={{maxHeight:200,overflowY:"auto"}}>
                    {sessionRanking.map((s,i) => (
                      <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 0",borderBottom:i<sessionRanking.length-1?"1px solid var(--border-divider)":"none"}}>
                        <div style={{fontSize:12,color:"var(--text-2)",flex:1,marginRight:8}}>{s.name}</div>
                        <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
                          <div style={{width:60,height:6,background:"var(--border-divider)",borderRadius:3,overflow:"hidden"}}>
                            <div style={{width:`${sessionRanking[0].count>0?(s.count/sessionRanking[0].count)*100:0}%`,height:"100%",background:TEAL,borderRadius:3}} />
                          </div>
                          <span style={{fontSize:12,fontWeight:600,color:TEAL,minWidth:20}}>{s.count}</span>
                        </div>
                      </div>
                    ))}
                  </div>
              }
            </ChartCard>
            <ChartCard title="Least Attended Services" subtitle="Lowest turnout in period">
              {lowestServices.length === 0 ? <div style={{textAlign:"center",padding:30,color:"var(--text-faint)",fontSize:12}}>No data</div>
                : <div style={{maxHeight:200,overflowY:"auto"}}>
                    {lowestServices.map((s,i) => (
                      <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 0",borderBottom:i<lowestServices.length-1?"1px solid var(--border-divider)":"none"}}>
                        <div style={{fontSize:12,color:"var(--text-2)",flex:1,marginRight:8}}>{s.name}</div>
                        <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
                          <div style={{width:60,height:6,background:"var(--border-divider)",borderRadius:3,overflow:"hidden"}}>
                            <div style={{width:`${sessionRanking[0]&&sessionRanking[0].count>0?(s.count/sessionRanking[0].count)*100:0}%`,height:"100%",background:ORANGE,borderRadius:3}} />
                          </div>
                          <span style={{fontSize:12,fontWeight:600,color:ORANGE,minWidth:20}}>{s.count}</span>
                        </div>
                      </div>
                    ))}
                  </div>
              }
            </ChartCard>
          </div>

          <SectionTitle>Slipping Away</SectionTitle>
          <div style={{fontSize:12,color:"var(--text-muted)",lineHeight:1.6,marginBottom:12}}>
            <strong>How this works:</strong> among the members and services currently in view, this
            lists anyone who had attended at least twice but hasn't come to any service in the last
            28 days (measured from the most recent service in view). New or one-time visitors never
            appear; it needs a prior pattern to lapse from. It's a pastoral-care follow-up list.
          </div>
          <ChartCard title="Members Who've Gone Quiet" subtitle="Previously regular members with no attendance in the last 28 days">
            {slippingAway.length === 0
              ? <div style={{textAlign:"center",padding:24,color:"var(--text-faint)",fontSize:12}}>No one is slipping away in this period</div>
              : <div style={{maxHeight:280,overflowY:"auto"}}>
                  {slippingAway.map((m,i) => {
                    const weeks = Math.max(1, Math.round((Date.now() - new Date(m.lastSeen+"T12:00:00")) / (7*864e5)));
                    return (
                      <div key={m.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 0",borderBottom:i<slippingAway.length-1?"1px solid var(--border-divider)":"none"}}>
                        <div style={{fontSize:13,fontWeight:600,color:"var(--text)"}}>{m.name}</div>
                        <div style={{textAlign:"right"}}>
                          <div style={{fontSize:12,fontWeight:700,color:weeks>=8?RED:ORANGE}}>{weeks} week{weeks!==1?"s":""} away</div>
                          <div style={{fontSize:11,color:"var(--text-faint)"}}>last seen {m.lastSeen.split("-").reverse().join("/")} · attended {m.count}×</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
            }
          </ChartCard>

          <SectionTitle>Inactive Candidates</SectionTitle>
          <div style={{fontSize:12,color:"var(--text-muted)",lineHeight:1.6,marginBottom:12}}>
            Members still marked active who attended before but haven't been to any service in 90+
            days (measured from today, across all services). Mark someone inactive with one click.
          </div>
          <ChartCard title="Not seen in 90+ days" subtitle={`${inactiveCandidates.length} active member${inactiveCandidates.length!==1?"s":""} may be inactive`}>
            {inactiveCandidates.length === 0
              ? <div style={{textAlign:"center",padding:24,color:"var(--text-faint)",fontSize:12}}>No active members are 90+ days lapsed</div>
              : <div style={{maxHeight:320,overflowY:"auto"}}>
                  {inactiveCandidates.map(({m,lastSeen,daysAgo},i) => (
                    <div key={m.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,padding:"8px 0",borderBottom:i<inactiveCandidates.length-1?"1px solid var(--border-divider)":"none"}}>
                      <div style={{display:"flex",alignItems:"center",gap:10,minWidth:0}}>
                        <Avatar member={m} size={30} />
                        <div style={{minWidth:0}}>
                          <div style={{fontSize:13,fontWeight:600,color:"var(--text)"}}>{fullName(m)}</div>
                          <div style={{fontSize:11,color:"var(--text-faint)"}}>last seen {lastSeen.split("-").reverse().join("-")} · {daysAgo} days ago</div>
                        </div>
                      </div>
                      {profile?.role === "admin" && (
                        <button onClick={()=>markInactive(m.id)} disabled={savingInactive===m.id}
                          style={{flexShrink:0,display:"inline-flex",alignItems:"center",gap:5,fontSize:11,fontWeight:600,padding:"5px 10px",borderRadius:8,cursor:"pointer",background:"var(--danger-bg)",color:"var(--danger)",border:"1px solid var(--danger-border)"}}>
                          <UserMinus size={13}/> {savingInactive===m.id?"Saving…":"Mark inactive"}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
            }
          </ChartCard>

          <SectionTitle>First-Timer Retention</SectionTitle>
          <ChartCard title="Did First-Timers Come Back?" subtitle="By the month of each member's very first recorded attendance, the share who attended again at least once">
            {firstTimerRetention.length === 0
              ? <div style={{textAlign:"center",padding:24,color:"var(--text-faint)",fontSize:12}}>Not enough attendance history yet</div>
              : <div style={{overflowX:"auto"}}>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 90px 90px 110px",padding:"8px 4px",fontSize:11,fontWeight:700,color:"var(--text-faint)",textTransform:"uppercase",letterSpacing:0.5,borderBottom:"1.5px solid var(--border)"}}>
                    <span>First Attended</span><span style={{textAlign:"right"}}>First-timers</span><span style={{textAlign:"right"}}>Returned</span><span style={{textAlign:"right"}}>Retention</span>
                  </div>
                  {firstTimerRetention.map((c,i) => (
                    <div key={i} style={{display:"grid",gridTemplateColumns:"1fr 90px 90px 110px",padding:"9px 4px",alignItems:"center",borderBottom:i<firstTimerRetention.length-1?"1px solid var(--border-divider)":"none"}}>
                      <span style={{fontSize:13,color:"var(--text-2)",fontWeight:500}}>{c.label}</span>
                      <span style={{textAlign:"right",fontSize:13,color:"var(--text)"}}>{c.cohort}</span>
                      <span style={{textAlign:"right",fontSize:13,color:"var(--text)"}}>{c.returned}</span>
                      <span style={{textAlign:"right",fontSize:13,fontWeight:700,color:c.pct>=60?GREEN:c.pct>=30?GOLD:ORANGE}}>{c.pct}%</span>
                    </div>
                  ))}
                </div>
            }
          </ChartCard>
          </>)}

          {attSub === "bymember" && (
            <IndividualAttendance members={attMembers} services={filteredServices} attendance={attendance} scope={bymemberScope} />
          )}

          {attSub === "byhousehold" && (
            <HouseholdAttendance households={households} members={members} services={filteredServices} attendance={attendance} />
          )}
        </div>
      )}

      {activeSection === "members" && (
        <div>
          {(() => {
            const n = filteredMembers.length || 1;
            const male = filteredMembers.filter(m=>m.sex==="Male").length;
            const female = filteredMembers.filter(m=>m.sex==="Female").length;
            const active = filteredMembers.filter(m=>m.is_active!==false).length;
            const married = filteredMembers.filter(m=>m.marital_status==="Married").length;
            const single = filteredMembers.filter(m=>m.marital_status==="Single").length;
            const parents = filteredMembers.filter(m=>m.household_role==="Father"||m.household_role==="Mother").length;
            const cards = [
              {icon:<Users size={18}/>, value:filteredMembers.length, label:"In view", sub:"current filter", color:TEAL},
              {icon:<UserCheck size={18}/>, value:active, label:"Active", sub:`${Math.round(active/n*100)}% of view`, color:GREEN},
              {icon:<User size={18}/>, value:male, label:"Male", sub:`${Math.round(male/n*100)}%`, color:TEAL},
              {icon:<User size={18}/>, value:female, label:"Female", sub:`${Math.round(female/n*100)}%`, color:PINK},
              {icon:<Heart size={18}/>, value:married, label:"Married", sub:`${single} single`, color:PURPLE},
              {icon:<Baby size={18}/>, value:parents, label:"Parents", sub:"fathers & mothers", color:ORANGE},
            ];
            return (
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(170px,1fr))",gap:12,marginBottom:6}}>
                {cards.map((c,i)=><IconStat key={i} {...c} />)}
              </div>
            );
          })()}

          <div style={{display:"flex",gap:4,margin:"16px 0"}}>
            {[["overview","Overview"],["households","Households"]].map(([k,label])=>(
              <button key={k} onClick={()=>setMemberSub(k)} style={{background:memberSub===k?TEAL:"var(--surface-alt)",color:memberSub===k?"#fff":"var(--text-2)",border:`1.5px solid ${memberSub===k?TEAL:"var(--border)"}`,borderRadius:20,cursor:"pointer",fontSize:12.5,fontWeight:600,padding:"6px 16px"}}>{label}</button>
            ))}
          </div>

          {memberSub === "overview" && (<>
          <SectionTitle>Demographics</SectionTitle>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:14}}>
            <DonutCard title="Age Group Breakdown" subtitle="Members by age category" data={ageBreakdown} />
            <DonutCard title="Gender Breakdown" subtitle="Gender distribution" data={sexBreakdown} />
          </div>

          {svcTypeFilter.length > 0 && (
            <>
              <SectionTitle>Members Who Attended</SectionTitle>
              <div style={{fontSize:12,color:"var(--text-muted)",marginBottom:12}}>
                {filteredMembers.length} unique member{filteredMembers.length!==1?"s":""} attended {svcTypeFilter.join(", ")}. Expand a name to see which sessions.
              </div>
              <IndividualAttendance members={filteredMembers} services={filteredServices} attendance={attendance} scope={`Attending: ${svcTypeFilter.join(", ")}`} />
            </>
          )}

          <SectionTitle>Geography</SectionTitle>
          <ChartCard title="Members by City" subtitle="Top 10 cities represented">
            {cityBreakdown.length === 0 ? <div style={{textAlign:"center",padding:30,color:"var(--text-faint)",fontSize:12}}>No city data recorded</div>
              : <ResponsiveContainer width="100%" height={Math.max(160, cityBreakdown.length*30)}>
                  <BarChart data={cityBreakdown} layout="vertical" margin={{top:4,right:44,bottom:4,left:100}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
                    <XAxis type="number" tick={{fontSize:11,fill:"var(--text-faint)"}} />
                    <YAxis type="category" dataKey="name" tick={{fontSize:11,fill:"var(--text-2)"}} width={95} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="value" name="Members" radius={[0,6,6,0]} fill={TEAL}>
                      <LabelList dataKey="value" position="right" style={{fontSize:11,fontWeight:700,fill:"var(--text-2)"}} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
            }
          </ChartCard>

          <SectionTitle>Growth</SectionTitle>
          <ChartCard title="New Members Joined" subtitle="Members whose join date falls in the selected period">
            {joinTrend.length === 0 ? <div style={{textAlign:"center",padding:30,color:"var(--text-faint)",fontSize:12}}>No join dates in this period</div>
              : <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={joinTrend} margin={{top:4,right:16,bottom:4,left:0}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                    <XAxis dataKey="label" tick={{fontSize:11,fill:"var(--text-faint)"}} />
                    <YAxis tick={{fontSize:11,fill:"var(--text-faint)"}} allowDecimals={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="count" name="New Members" fill={TURQUOISE} radius={[6,6,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
            }
          </ChartCard>

          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",flexWrap:"wrap",gap:8}}>
            <SectionTitle>Celebrations by Month</SectionTitle>
            <div style={{display:"inline-flex",border:"1px solid var(--border)",borderRadius:20,overflow:"hidden",marginBottom:14}}>
              {[["birthdays","Birthdays"],["anniversaries","Anniversaries"]].map(([k,label])=>(
                <button key={k} onClick={()=>setCelebMode(k)} style={{border:"none",cursor:"pointer",fontSize:11.5,fontWeight:600,padding:"5px 14px",background:celebMode===k?TEAL:"var(--surface)",color:celebMode===k?"#fff":"var(--text-muted)"}}>{label}</button>
              ))}
            </div>
          </div>
          {(() => {
            const data = celebMode === "birthdays" ? birthdaysByMonth : anniversariesByMonth;
            const barColor = celebMode === "birthdays" ? PINK : PURPLE;
            const total = data.reduce((a,b)=>a+b.count,0);
            return (
              <ChartCard title={celebMode==="birthdays"?"Birthday Distribution":"Anniversary Distribution"} subtitle={celebMode==="birthdays"
                ? `${total} member${total!==1?"s":""} with a birthday on record · current month highlighted`
                : `${total} anniversar${total!==1?"ies":"y"} · linked spouses counted once · current month highlighted`}>
                <ResponsiveContainer width="100%" height={210}>
                  <BarChart data={data} margin={{top:14,right:16,bottom:4,left:0}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                    <XAxis dataKey="name" tick={{fontSize:10,fill:"var(--text-faint)"}} />
                    <YAxis tick={{fontSize:11,fill:"var(--text-faint)"}} allowDecimals={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="count" name={celebMode==="birthdays"?"Birthdays":"Anniversaries"} radius={[6,6,0,0]}>
                      {data.map((_,i) => <Cell key={i} fill={i===new Date().getMonth()?RED:barColor} />)}
                      <LabelList dataKey="count" position="top" formatter={v=>v||""} style={{fontSize:10,fontWeight:700,fill:"var(--text-faint)"}} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            );
          })()}

          <SectionTitle>Net Growth</SectionTitle>
          <ChartCard title="Cumulative Membership" subtitle="Running total of members over time, based on join dates (all-time)">
            {netGrowth.length === 0 ? <div style={{textAlign:"center",padding:30,color:"var(--text-faint)",fontSize:12}}>No join dates recorded</div>
              : (() => {
                  const now = netGrowth[netGrowth.length-1].total;
                  const start = netGrowth[0];
                  const biggest = netGrowth.reduce((a,b)=> b.added>(a?.added??-1)?b:a, null);
                  const last12 = netGrowth.slice(-12).reduce((s,d)=>s+d.added,0);
                  return (
                    <div style={{display:"flex",gap:16,flexWrap:"wrap",alignItems:"stretch"}}>
                      <div style={{flex:"1 1 320px",minWidth:280}}>
                        <ResponsiveContainer width="100%" height={240}>
                          <AreaChart data={netGrowth} margin={{top:4,right:16,bottom:4,left:0}}>
                            <defs>
                              <linearGradient id="gradGrowth" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={TEAL} stopOpacity={0.26} />
                                <stop offset="100%" stopColor={TEAL} stopOpacity={0.02} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                            <XAxis dataKey="label" tick={{fontSize:11,fill:"var(--text-faint)"}} />
                            <YAxis tick={{fontSize:11,fill:"var(--text-faint)"}} allowDecimals={false} />
                            <Tooltip content={<CustomTooltip />} />
                            <Area type="monotone" dataKey="total" name="Total Members" stroke={TEAL} strokeWidth={2.5} fill="url(#gradGrowth)" dot={false} activeDot={{r:6}} />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                      <div style={{flex:"0 0 190px",display:"flex",flexDirection:"column",gap:10,justifyContent:"center"}}>
                        {[
                          {icon:<Users size={15}/>, label:"Members today", value:now, color:TEAL},
                          {icon:<TrendingUp size={15}/>, label:"Added last 12 mo", value:`+${last12}`, color:GREEN},
                          {icon:<Calendar size={15}/>, label:"Best month", value:biggest?`+${biggest.added}`:"None", sub:biggest?biggest.label:"", color:ORANGE},
                          {icon:<Clock size={15}/>, label:"Tracking since", value:start.label, color:PURPLE},
                        ].map((s,i)=>(
                          <div key={i} style={{background:"var(--surface-alt)",border:"1px solid var(--border)",borderRadius:10,padding:"10px 12px",display:"flex",alignItems:"center",gap:10}}>
                            <span style={{color:s.color,display:"flex"}}>{s.icon}</span>
                            <div style={{minWidth:0}}>
                              <div style={{fontSize:16,fontWeight:700,color:"var(--text)",lineHeight:1.1}}>{s.value}{s.sub && <span style={{fontSize:11,fontWeight:500,color:"var(--text-faint)"}}> · {s.sub}</span>}</div>
                              <div style={{fontSize:10.5,color:"var(--text-faint)",textTransform:"uppercase",letterSpacing:0.4}}>{s.label}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()
            }
          </ChartCard>

          <SectionTitle>Age Pyramid</SectionTitle>
          <ChartCard title="Age & Gender Pyramid" subtitle="Male on the left, female on the right, across age bands. Counts are labelled on each bar.">
            {filteredMembers.length === 0 ? <div style={{textAlign:"center",padding:30,color:"var(--text-faint)",fontSize:12}}>No data</div>
              : (() => {
                  const withTotals = agePyramid.map(b => ({ ...b, band: b.band, tot: Math.abs(b.male) + b.female }));
                  const top = withTotals.reduce((a,b)=> b.tot>(a?.tot??-1)?b:a, null);
                  const mTot = agePyramid.reduce((s,b)=>s+Math.abs(b.male),0);
                  const fTot = agePyramid.reduce((s,b)=>s+b.female,0);
                  return (
                    <>
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={agePyramid} layout="vertical" stackOffset="sign" margin={{top:4,right:34,bottom:4,left:30}}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
                          <XAxis type="number" tick={{fontSize:11,fill:"var(--text-faint)"}} tickFormatter={v=>Math.abs(v)} allowDecimals={false} />
                          <YAxis type="category" dataKey="band" tick={{fontSize:11,fill:"var(--text-2)"}} width={110} />
                          <Tooltip formatter={(v,n)=>[Math.abs(v), n]} />
                          <Legend wrapperStyle={{fontSize:12}} />
                          <Bar dataKey="male" name="Male" fill={TEAL} stackId="pyr" radius={[4,0,0,4]}>
                            <LabelList dataKey="male" content={(p)=>{ const {x,y,height,value}=p; if(!value) return null; return <text x={x-5} y={y+height/2} textAnchor="end" dominantBaseline="central" fontSize={10} fontWeight={700} fill={TEAL}>{Math.abs(value)}</text>; }} />
                          </Bar>
                          <Bar dataKey="female" name="Female" fill={PINK} stackId="pyr" radius={[0,4,4,0]}>
                            <LabelList dataKey="female" position="right" formatter={v=>v||""} style={{fontSize:10,fontWeight:700,fill:PINK}} />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                      <div style={{display:"flex",gap:16,flexWrap:"wrap",marginTop:8,fontSize:12,color:"var(--text-muted)"}}>
                        <span><strong style={{color:"var(--text)"}}>{top?.band||"None"}</strong> is the largest band ({top?.tot||0} members)</span>
                        <span>Totals across all bands: <strong style={{color:TEAL}}>{mTot} male</strong>, <strong style={{color:PINK}}>{fTot} female</strong></span>
                      </div>
                    </>
                  );
                })()
            }
          </ChartCard>

          </>)}

          {memberSub === "households" && (<>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:12,marginTop:16,marginBottom:14}}>
            {[
              {icon:<Home size={18}/>, value:householdView.count, label:"Households", sub:`${householdView.avg?householdView.avg.toFixed(1):"0"} avg size`, color:TEAL},
              {icon:<Users size={18}/>, value:householdView.peopleInHouseholds, label:"In a household", sub:`${filteredMembers.length?Math.round(householdView.peopleInHouseholds/filteredMembers.length*100):0}% of members`, color:GREEN},
              {icon:<UserMinus size={18}/>, value:householdView.without, label:"Not linked", sub:"no family set", color:ORANGE},
              {icon:<Baby size={18}/>, value:householdView.withChildren, label:"With children", sub:`${householdView.avgChildren?householdView.avgChildren.toFixed(1):"0"} kids avg`, color:PURPLE},
            ].map((s,i)=>(
              <div key={i} style={{background:"var(--surface)",border:"1px solid var(--border)",borderRadius:12,padding:"14px 16px",display:"flex",alignItems:"center",gap:12}}>
                <div style={{width:40,height:40,borderRadius:10,background:s.color+"18",color:s.color,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{s.icon}</div>
                <div style={{minWidth:0}}>
                  <div style={{fontSize:24,fontWeight:700,color:"var(--text)",lineHeight:1.05}}>{s.value}</div>
                  <div style={{fontSize:12,fontWeight:600,color:"var(--text-2)"}}>{s.label}</div>
                  <div style={{fontSize:10.5,color:"var(--text-faint)"}}>{s.sub}</div>
                </div>
              </div>
            ))}
          </div>
          {householdView.count === 0
            ? <ChartCard title="Households" subtitle="Link families together in the Members tab"><div style={{textAlign:"center",padding:20,color:"var(--text-faint)",fontSize:12}}>No households created yet</div></ChartCard>
            : <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:14}}>
                <ChartCard title="Household Size Distribution" subtitle="How many households of each size">
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={householdView.sizeChart} margin={{top:4,right:8,bottom:4,left:0}}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                      <XAxis dataKey="name" tick={{fontSize:11,fill:"var(--text-faint)"}} />
                      <YAxis tick={{fontSize:11,fill:"var(--text-faint)"}} allowDecimals={false} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="households" name="Households" radius={[6,6,0,0]}>
                        {householdView.sizeChart.map((_,i) => <Cell key={i} fill={CHART_COLORS[i%CHART_COLORS.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
                <ChartCard title="Family Composition" subtitle="Households with children vs adults only">
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                    {[
                      {label:"With children (under 18)", value:householdView.withChildren, color:ORANGE},
                      {label:"Adults only", value:householdView.adultsOnly, color:TEAL},
                      {label:"Avg children per family", value:householdView.avgChildren ? householdView.avgChildren.toFixed(1) : "0", color:GOLD},
                      {label:"Largest household", value:householdView.largest ? householdView.largest.size : 0, color:PURPLE},
                    ].map(s => (
                      <div key={s.label} style={{background:"var(--surface-alt)",border:"1px solid var(--border)",borderRadius:10,padding:12,textAlign:"center"}}>
                        <div style={{fontSize:22,fontWeight:700,color:s.color}}>{s.value}</div>
                        <div style={{fontSize:11,color:"var(--text-faint)",marginTop:2,lineHeight:1.4}}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                  {householdView.largest && (
                    <div style={{marginTop:10,padding:"8px 10px",background:"var(--brand-tint-soft)",borderRadius:8,fontSize:12,color:TEAL,fontWeight:500}}>
                      Largest: {householdView.largest.name} ({householdView.largest.size} members)
                    </div>
                  )}
                </ChartCard>
                <ChartCard title="Largest Households" subtitle="Families with the most members">
                  <div style={{maxHeight:240,overflowY:"auto",display:"flex",flexDirection:"column",gap:12}}>
                    {householdView.list.slice(0,12).map(h => (
                      <div key={h.id}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                          <span style={{fontSize:13,fontWeight:600,color:"var(--text)",display:"inline-flex",alignItems:"center",gap:5}}><Home size={14} color="#2a5357" />{h.name}</span>
                          <span style={{fontSize:12,fontWeight:700,color:TEAL}}>{h.size}</span>
                        </div>
                        <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                          {h.members.map(m => (
                            <span key={m.id} style={{display:"inline-flex",alignItems:"center",gap:5,background:"var(--panel)",border:"1px solid var(--border)",borderRadius:16,padding:"2px 8px 2px 2px",fontSize:11,fontWeight:600,color:"var(--text-navy)"}}>
                              <Avatar member={m} size={18} />{fullName(m)}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </ChartCard>
              </div>
          }
          </>)}
        </div>
      )}

      {/* ── MINISTRY ── */}
      {activeSection === "ministry" && (
        <div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:12,marginBottom:8}}>
            {[
              {icon:<Users size={18}/>, value:filteredMembers.length, label:"Total members", sub:"in current filter", color:TEAL},
              {icon:<Layers size={18}/>, value:ministrySize.length, label:"Ministries", sub:"with members", color:PURPLE},
              {icon:<UserCheck size={18}/>, value:distinctWithRole, label:"Serving", sub:`${filteredMembers.length?Math.round(distinctWithRole/filteredMembers.length*100):0}% of members`, color:GREEN},
              {icon:<UserMinus size={18}/>, value:filteredMembers.filter(m=>!(m.roles||[]).length).length, label:"No ministry", sub:"not yet serving", color:ORANGE},
            ].map((s,i)=>(
              <div key={i} style={{background:"var(--surface)",border:"1px solid var(--border)",borderRadius:12,padding:"14px 16px",display:"flex",alignItems:"center",gap:12}}>
                <div style={{width:40,height:40,borderRadius:10,background:s.color+"18",color:s.color,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{s.icon}</div>
                <div style={{minWidth:0}}>
                  <div style={{fontSize:24,fontWeight:700,color:"var(--text)",lineHeight:1.05}}>{s.value}</div>
                  <div style={{fontSize:12,fontWeight:600,color:"var(--text-2)"}}>{s.label}</div>
                  <div style={{fontSize:10.5,color:"var(--text-faint)"}}>{s.sub}</div>
                </div>
              </div>
            ))}
          </div>

          <SectionTitle>Ministry Size</SectionTitle>
          <ChartCard title="Members per Ministry" subtitle="How many members are in each ministry">
            {ministrySize.length === 0 ? <div style={{textAlign:"center",padding:30,color:"var(--text-faint)",fontSize:12}}>No ministry data</div>
              : <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={ministrySize} margin={{top:4,right:16,bottom:50,left:0}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                    <XAxis dataKey="name" tick={{fontSize:10,fill:"var(--text-faint)"}} angle={-30} textAnchor="end" interval={0} />
                    <YAxis tick={{fontSize:11,fill:"var(--text-faint)"}} allowDecimals={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="value" name="Members" radius={[6,6,0,0]}>
                      {ministrySize.map((_,i) => <Cell key={i} fill={CHART_COLORS[i%CHART_COLORS.length]} />)}
                      <LabelList dataKey="value" position="top" style={{fontSize:10,fontWeight:700,fill:"var(--text-faint)"}} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
            }
          </ChartCard>

          <SectionTitle>Role Distribution</SectionTitle>
          <ChartCard title="Members by Number of Ministries" subtitle="How many ministries each member serves in">
            {multiRoleData.length === 0 ? <div style={{textAlign:"center",padding:30,color:"var(--text-faint)",fontSize:12}}>No data</div>
              : <div style={{display:"flex",alignItems:"center",gap:16,flexWrap:"wrap"}}>
                  <div style={{position:"relative",width:160,height:160,flexShrink:0}}>
                    <ResponsiveContainer width={160} height={160}>
                      <PieChart>
                        <Pie data={multiRoleData} dataKey="value" cx="50%" cy="50%" innerRadius={52} outerRadius={70} paddingAngle={2} stroke="none">
                          {multiRoleData.map((e,i) => <Cell key={i} fill={e.color} />)}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                    <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",pointerEvents:"none"}}>
                      <div style={{fontSize:22,fontWeight:700,color:"var(--text)",lineHeight:1}}>{filteredMembers.length}</div>
                      <div style={{fontSize:9,color:"var(--text-faint)",textTransform:"uppercase",letterSpacing:0.5}}>members</div>
                    </div>
                  </div>
                  <div style={{flex:1,minWidth:180}}>
                    {multiRoleData.map((d,i) => (
                      <div key={i} style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                        <div style={{width:10,height:10,borderRadius:2,background:d.color,flexShrink:0}} />
                        <div style={{fontSize:12,color:"var(--text-2)",flex:1}}>{d.name}</div>
                        <div style={{fontSize:12,fontWeight:700,color:"var(--text)"}}>{d.value}</div>
                        <div style={{fontSize:11,color:"var(--text-faint)"}}>({filteredMembers.length?Math.round(d.value/filteredMembers.length*100):0}%)</div>
                      </div>
                    ))}
                    <div style={{marginTop:10,padding:"8px 10px",background:"var(--brand-tint-soft)",borderRadius:8,fontSize:12,color:TEAL,fontWeight:500}}>
                      {distinctWithRole} of {filteredMembers.length} members serve in at least one ministry
                    </div>
                  </div>
                </div>
            }
          </ChartCard>

          <SectionTitle>Ministry Details</SectionTitle>
          <div style={{background:"var(--surface)",border:"1px solid var(--border)",borderRadius:14,overflow:"hidden",boxShadow:"0 1px 3px #0000000a"}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 80px 80px",padding:"10px 16px",background:"var(--surface-alt)",fontSize:11,fontWeight:700,color:"var(--text-faint)",textTransform:"uppercase",letterSpacing:0.5}}>
              <span>Ministry</span><span style={{textAlign:"right"}}>Members</span><span style={{textAlign:"right"}}>% of Total</span>
            </div>
            {ministrySize.length === 0
              ? <div style={{padding:"20px 16px",color:"var(--text-faint)",fontSize:12,textAlign:"center"}}>No data</div>
              : ministrySize.map((m,i) => (
                <div key={m.name} style={{display:"grid",gridTemplateColumns:"1fr 80px 80px",padding:"11px 16px",borderTop:"1px solid var(--border-divider)",alignItems:"center"}}>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <div style={{width:10,height:10,borderRadius:2,background:CHART_COLORS[i%CHART_COLORS.length],flexShrink:0}} />
                    <div>
                      <div style={{fontSize:13,fontWeight:500,color:"var(--text)"}}>{m.name}</div>
                      <div style={{width:Math.max(20,(m.value/Math.max(...ministrySize.map(x=>x.value),1))*160),height:4,background:CHART_COLORS[i%CHART_COLORS.length],borderRadius:2,marginTop:4,opacity:0.4}} />
                    </div>
                  </div>
                  <div style={{textAlign:"right",fontSize:14,fontWeight:700,color:TEAL}}>{m.value}</div>
                  <div style={{textAlign:"right",fontSize:12,color:"var(--text-faint)"}}>{filteredMembers.length?Math.round(m.value/filteredMembers.length*100):0}%</div>
                </div>
              ))
            }
          </div>

          <SectionTitle>Cross-Ministry Overlap</SectionTitle>
          <ChartCard title="Ministries That Share People" subtitle="Pairs of ministries with members serving in both, highlights overlap and over-stretched volunteers">
            {crossMinistry.length === 0
              ? <div style={{textAlign:"center",padding:24,color:"var(--text-faint)",fontSize:12}}>No members currently serve in more than one ministry</div>
              : <div>
                  {overlapInsights.length > 0 && (
                    <div style={{marginBottom:14,padding:"12px 14px",background:"var(--brand-tint-soft)",borderRadius:10}}>
                      <div style={{fontSize:11,fontWeight:700,color:"var(--text-faint)",textTransform:"uppercase",letterSpacing:0.5,marginBottom:8}}>Strongest overlaps</div>
                      {overlapInsights.map((o,i) => (
                        <div key={i} style={{fontSize:12.5,color:"var(--text-2)",marginBottom:i<overlapInsights.length-1?6:0,lineHeight:1.5}}>
                          <strong style={{color:PURPLE}}>{o.pct}%</strong> of {ministryPeople(o.from)} also {ministryServeClause(o.to)} <span style={{color:"var(--text-faint)"}}>({o.count} {o.count===1?"person":"people"})</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{fontSize:11,fontWeight:700,color:"var(--text-faint)",textTransform:"uppercase",letterSpacing:0.5,marginBottom:4}}>Ministry combinations</div>
                  {crossMinistry.map((p,i) => (
                    <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:i<crossMinistry.length-1?"1px solid var(--border-divider)":"none"}}>
                      <div style={{fontSize:13,color:"var(--text-2)",flex:1,marginRight:8}}>{p.pair}</div>
                      <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
                        <div style={{width:80,height:6,background:"var(--border-divider)",borderRadius:3,overflow:"hidden"}}>
                          <div style={{width:`${(p.count/crossMinistry[0].count)*100}%`,height:"100%",background:PURPLE,borderRadius:3}} />
                        </div>
                        <span style={{fontSize:13,fontWeight:700,color:PURPLE,minWidth:18,textAlign:"right"}}>{p.count}</span>
                      </div>
                    </div>
                  ))}
                </div>
            }
          </ChartCard>

          <SectionTitle>Coverage by Age & Gender</SectionTitle>
          <ChartCard title="Ministry Gender Split" subtitle="Male vs female make-up of each ministry">
            {ministryCoverage.length === 0 ? <div style={{textAlign:"center",padding:30,color:"var(--text-faint)",fontSize:12}}>No ministry data</div>
              : <ResponsiveContainer width="100%" height={Math.max(200, ministryCoverage.length*38)}>
                  <BarChart data={ministryCoverage} layout="vertical" margin={{top:4,right:24,bottom:4,left:30}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
                    <XAxis type="number" tick={{fontSize:11,fill:"var(--text-faint)"}} allowDecimals={false} />
                    <YAxis type="category" dataKey="name" tick={{fontSize:11,fill:"var(--text-2)"}} width={120} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{fontSize:12}} />
                    <Bar dataKey="male" name="Male" stackId="g" fill={TEAL}>
                      <LabelList dataKey="male" position="center" formatter={v=>v||""} style={{fontSize:9,fontWeight:700,fill:"#fff"}} />
                    </Bar>
                    <Bar dataKey="female" name="Female" stackId="g" fill={PINK}>
                      <LabelList dataKey="female" position="center" formatter={v=>v||""} style={{fontSize:9,fontWeight:700,fill:"#fff"}} />
                    </Bar>
                    <Bar dataKey="unknownSex" name="Unknown" stackId="g" fill="#e5e7eb" />
                  </BarChart>
                </ResponsiveContainer>
            }
          </ChartCard>
        </div>
      )}

      {activeSection === "instruments" && (
        <div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:12,marginBottom:8}}>
            {[
              {icon:<Music size={18}/>, value:instrumentData.withInstr, label:"Musicians", sub:"with an instrument recorded", color:TEAL},
              {icon:<Layers size={18}/>, value:instrumentData.instrumentList.length, label:"Different instruments", sub:"played across the church", color:PURPLE},
              {icon:<Users size={18}/>, value:instrumentData.multi, label:"Play 2+ instruments", sub:"multi-instrumentalists", color:ORANGE},
            ].map((s,i)=>(
              <div key={i} style={{background:"var(--surface)",border:"1px solid var(--border)",borderRadius:12,padding:"14px 16px",display:"flex",alignItems:"center",gap:12}}>
                <div style={{width:40,height:40,borderRadius:10,background:s.color+"18",color:s.color,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{s.icon}</div>
                <div style={{minWidth:0}}>
                  <div style={{fontSize:24,fontWeight:700,color:"var(--text)",lineHeight:1.05}}>{s.value}</div>
                  <div style={{fontSize:12,fontWeight:600,color:"var(--text-2)"}}>{s.label}</div>
                  <div style={{fontSize:10.5,color:"var(--text-faint)"}}>{s.sub}</div>
                </div>
              </div>
            ))}
          </div>

          {instrumentData.instrumentList.length === 0
            ? <ChartCard title="Instruments" subtitle="Add instruments to members in the Members tab"><div style={{textAlign:"center",padding:20,color:"var(--text-faint)",fontSize:12}}>No instruments recorded yet</div></ChartCard>
            : <>
                <SectionTitle>Musicians per Instrument</SectionTitle>
                <ChartCard title="Players per Instrument" subtitle="How many musicians play each instrument">
                  <ResponsiveContainer width="100%" height={Math.max(180, instrumentData.instrumentList.length*34)}>
                    <BarChart data={instrumentData.instrumentList} layout="vertical" margin={{top:4,right:44,bottom:4,left:90}}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
                      <XAxis type="number" tick={{fontSize:11,fill:"var(--text-faint)"}} allowDecimals={false} />
                      <YAxis type="category" dataKey="instrument" tick={{fontSize:11,fill:"var(--text-2)"}} width={85} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="count" name="Musicians" radius={[0,6,6,0]} fill={TEAL}>
                        <LabelList dataKey="count" position="right" style={{fontSize:11,fontWeight:700,fill:"var(--text-2)"}} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>

                <SectionTitle>Who Plays What</SectionTitle>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:14}}>
                  {instrumentData.instrumentList.map(it => (
                    <ChartCard key={it.instrument} title={it.instrument} subtitle={`${it.count} musician${it.count!==1?"s":""}`}>
                      <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                        {it.members.map(m => (
                          <span key={m.id} style={{display:"inline-flex",alignItems:"center",gap:5,background:"var(--panel)",border:"1px solid var(--border)",borderRadius:16,padding:"2px 8px 2px 2px",fontSize:11,fontWeight:600,color:"var(--text-navy)"}}>
                            <Avatar member={m} size={18} />{fullName(m)}
                          </span>
                        ))}
                      </div>
                    </ChartCard>
                  ))}
                </div>

                <SectionTitle>Instruments per Musician</SectionTitle>
                <ChartCard title="How Many Instruments Each Musician Plays" subtitle="Count of musicians by number of instruments">
                  <ResponsiveContainer width="100%" height={210}>
                    <BarChart data={instrumentData.distList} margin={{top:16,right:16,bottom:4,left:0}}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                      <XAxis dataKey="name" tick={{fontSize:11,fill:"var(--text-faint)"}} />
                      <YAxis tick={{fontSize:11,fill:"var(--text-faint)"}} allowDecimals={false} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="count" name="Musicians" fill={PURPLE} radius={[6,6,0,0]}>
                        <LabelList dataKey="count" position="top" style={{fontSize:10,fontWeight:700,fill:"var(--text-faint)"}} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>

                <SectionTitle>Musicians by Instrument Count</SectionTitle>
                <div style={{display:"flex",flexDirection:"column",gap:14}}>
                  {instrumentData.byCount.map(g => (
                    <ChartCard key={g.n} title={`Plays ${g.n} instrument${g.n!==1?"s":""}`} subtitle={`${g.players.length} musician${g.players.length!==1?"s":""}`}>
                      <div style={{display:"flex",flexDirection:"column",gap:8}}>
                        {g.players.map(({member,instruments}) => (
                          <div key={member.id} style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                            <span style={{display:"inline-flex",alignItems:"center",gap:6,minWidth:150}}>
                              <Avatar member={member} size={22} />
                              <span style={{fontSize:12.5,fontWeight:600,color:"var(--text)"}}>{fullName(member)}</span>
                            </span>
                            <span style={{display:"flex",flexWrap:"wrap",gap:5}}>
                              {instruments.map(inst => (
                                <span key={inst} style={{fontSize:10.5,fontWeight:600,background:"var(--brand-tint-soft)",color:TEAL,borderRadius:12,padding:"1px 8px"}}>{inst}</span>
                              ))}
                            </span>
                          </div>
                        ))}
                      </div>
                    </ChartCard>
                  ))}
                </div>
              </>
          }
        </div>
      )}
    </div>
  );
}
