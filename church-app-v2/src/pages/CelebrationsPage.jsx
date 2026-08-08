import { useMemo, useState } from "react";
import { Avatar, fullName, daysUntilNext, formatShortDate, MultiSelect } from "../components";
import { Cake, Gem, CalendarDays, Search } from "lucide-react";

function ordinal(n) {
  const s = ["th","st","nd","rd"], v = n%100;
  return n + (s[(v-20)%10] || s[v] || s[0]);
}
function calcYears(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr+"T00:00:00");
  return new Date().getFullYear() - d.getUTCFullYear();
}
function formatDaysAway(days) {
  if (days === 0) return "Today!";
  if (days < 30) return `${days} day${days !== 1 ? "s" : ""} away`;
  const months = Math.floor(days / 30);
  const remaining = days % 30;
  if (remaining === 0) return `${months} month${months !== 1 ? "s" : ""} away`;
  return `${months} month${months !== 1 ? "s" : ""} ${remaining} day${remaining !== 1 ? "s" : ""} away`;
}

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

// Build the month buckets for a date field. For ANNIVERSARIES, spouse-linked members
// share one wedding date, so they'd otherwise appear twice — merge a couple into a single
// entry (partner set) when both are linked, active, and carry the same date. A married
// member whose spouse isn't in the app (no spouse_id, or a mismatched date) shows solo.
// Birthdays are always per-person.
function buildByMonth(members, dateField, currentMonth, currentDay, memberById, wantPast) {
  const byMonth = {};
  const consumed = new Set();
  members.filter(m => m[dateField] && m.is_active !== false).forEach(m => {
    if (consumed.has(m.id)) return;
    const d = new Date(m[dateField] + "T00:00:00");
    const month = d.getUTCMonth();
    const day = d.getUTCDate();
    const alreadyPassed = month < currentMonth || (month === currentMonth && day < currentDay);
    if (wantPast ? !alreadyPassed : alreadyPassed) return;
    let partner = null;
    if (dateField === "anniversary" && m.spouse_id) {
      const s = memberById[m.spouse_id];
      if (s && s.is_active !== false && s.anniversary && s.anniversary === m.anniversary && !consumed.has(s.id)) {
        partner = s; consumed.add(s.id);
      }
    }
    consumed.add(m.id);
    (byMonth[month] = byMonth[month] || []).push({ member: m, partner, date: m[dateField], days: daysUntilNext(m[dateField]), day });
  });
  Object.keys(byMonth).forEach(mo => byMonth[mo].sort((a, b) => a.day - b.day));
  return byMonth;
}

function EventRow({ member, partner, date, type, past, onMemberClick }) {
  const days = daysUntilNext(date);
  const years = calcYears(date);
  const typeColor = type === "birthday" ? "#2a5357" : "#e07830";
  const typeIcon = type === "birthday" ? <Cake size={13} color="#e07830" /> : <Gem size={13} color="#d060a0" />;
  const isToday = days === 0;
  const isSoon = !past && days <= 7;

  // For past events: show "Turned X" or "Xth anniversary"
  const yearLabel = past
    ? (type === "birthday"
        ? (years !== null ? `Turned ${years}` : "")
        : (years !== null && years > 0 ? `${ordinal(years)} anniversary` : ""))
    : (type === "birthday"
        ? (years !== null ? `Turning ${years}` : "")
        : (years !== null && years > 0 ? `${ordinal(years)} anniversary` : ""));

  return (
    <div onClick={() => onMemberClick(member)} style={{
      display:"flex", alignItems:"center", gap:14, padding:"11px 14px",
      borderRadius:10, cursor:"pointer", transition:"background 0.15s",
      background: isToday ? typeColor+"0a" : "var(--surface)",
      border: isToday ? `1.5px solid ${typeColor}33` : "1.5px solid var(--border-navy)",
      marginBottom:8, opacity: past ? 0.8 : 1,
    }}
    onMouseEnter={e=>e.currentTarget.style.background=typeColor+"08"}
    onMouseLeave={e=>e.currentTarget.style.background=isToday?typeColor+"0a":"var(--surface)"}>
      <Avatar member={member} size={38} />
      <div style={{flex:1, minWidth:0}}>
        <div style={{fontWeight:700, fontSize:14, color:"var(--text)"}}>{partner ? `${fullName(member)} & ${fullName(partner)}` : fullName(member)}</div>
        <div style={{fontSize:12, color:"var(--text-muted)", marginTop:2, display:"flex", alignItems:"center", gap:5}}>
          {typeIcon} {formatShortDate(date)}
        </div>
      </div>
      <div style={{textAlign:"right", flexShrink:0}}>
        {isToday
          ? <span style={{background:typeColor+"18",border:`1.5px solid ${typeColor}44`,color:typeColor,borderRadius:20,padding:"3px 10px",fontSize:12,fontWeight:700}}>Today!</span>
          : past
            ? <div style={{fontSize:12, color:"var(--border-strong)", fontWeight:500}}>Passed</div>
            : <div style={{fontSize:12, fontWeight:600, color:isSoon?typeColor:"var(--text-muted-navy)"}}>{formatDaysAway(days)}</div>
        }
      </div>
    </div>
  );
}

function MonthSection({ monthIndex, entries, type, past, onMemberClick, isCurrentMonth }) {
  const typeColor = type === "birthday" ? "#2a5357" : "#e07830";
  const count = entries.length;
  const noun = type === "birthday"
    ? (count !== 1 ? "birthdays" : "birthday")
    : (count !== 1 ? "anniversaries" : "anniversary");

  return (
    <div style={{marginBottom:24}}>
      <div style={{display:"flex", alignItems:"center", gap:10, marginBottom:12}}>
        <div style={{
          background: isCurrentMonth ? typeColor : "var(--panel)",
          color: isCurrentMonth ? "#fff" : "var(--text-navy-muted)",
          borderRadius:8, padding:"4px 14px",
          fontSize:12, fontWeight:700,
          border: isCurrentMonth ? "none" : "1.5px solid var(--border-navy)",
        }}>
          {MONTH_NAMES[monthIndex]}
        </div>
        <span style={{fontSize:12, color:"var(--border-strong)", fontWeight:500}}>{count} {noun}</span>
        {isCurrentMonth && <span style={{fontSize:12, color:typeColor, fontWeight:600}}>This Month</span>}
      </div>
      {entries.map(x => (
        <EventRow key={x.member.id} member={x.member} partner={x.partner} date={x.date} type={type} past={past} onMemberClick={onMemberClick} />
      ))}
    </div>
  );
}

export default function CelebrationsPage({ members, households = [], onMemberClick }) {
  const [subtab, setSubtab] = useState("birthdays");
  const [viewMode, setViewMode] = useState("upcoming"); // "upcoming" or "past"
  const [person, setPerson] = useState("");             // filter by name
  const [famSelected, setFamSelected] = useState([]);   // multi-select households

  const today = new Date();
  const currentMonth = today.getMonth();
  const currentDay = today.getDate();
  const currentYear = today.getFullYear();

  const dateField = subtab === "birthdays" ? "dob" : "anniversary";

  const sortedHouseholds = useMemo(() => [...households].sort((a, b) => a.name.localeCompare(b.name)), [households]);
  // Partner lookup must see everyone, so build the id map from the full list.
  const memberById = useMemo(() => Object.fromEntries(members.map(m => [m.id, m])), [members]);

  // Person / family filters narrow which celebrations are shown.
  const filterActive = !!person.trim() || famSelected.length > 0;
  const filteredMembers = useMemo(() => {
    const pq = person.trim().toLowerCase();
    if (!pq && famSelected.length === 0) return members;
    return members.filter(m =>
      (!pq || fullName(m).toLowerCase().includes(pq)) &&
      (famSelected.length === 0 || famSelected.includes(m.household_id))
    );
  }, [members, person, famSelected]);

  // Upcoming = date hasn't passed yet this year; Past = already passed. Anniversaries
  // merge spouse couples into one entry (see buildByMonth).
  const upcomingByMonth = useMemo(() => buildByMonth(filteredMembers, dateField, currentMonth, currentDay, memberById, false), [filteredMembers, dateField, currentMonth, currentDay, memberById]);
  const pastByMonth = useMemo(() => buildByMonth(filteredMembers, dateField, currentMonth, currentDay, memberById, true), [filteredMembers, dateField, currentMonth, currentDay, memberById]);

  const upcomingTotal = Object.values(upcomingByMonth).reduce((s, a) => s + a.length, 0);
  const pastTotal = Object.values(pastByMonth).reduce((s, a) => s + a.length, 0);

  // This-month count: anniversaries are deduped by spouse so a couple counts once.
  const thisMonthCount = useMemo(() => {
    const inMonth = m => m[dateField] && m.is_active !== false && new Date(m[dateField] + "T00:00:00").getUTCMonth() === currentMonth;
    if (subtab === "birthdays") return filteredMembers.filter(inMonth).length;
    const consumed = new Set(); let n = 0;
    filteredMembers.filter(inMonth).forEach(m => {
      if (consumed.has(m.id)) return;
      consumed.add(m.id);
      if (m.spouse_id) { const s = memberById[m.spouse_id]; if (s && s.anniversary === m.anniversary) consumed.add(s.id); }
      n++;
    });
    return n;
  }, [filteredMembers, subtab, dateField, currentMonth, memberById]);

  const type = subtab === "birthdays" ? "birthday" : "anniversary";
  const monthsUpcoming = Array.from({length: 12 - currentMonth}, (_, i) => currentMonth + i);  // current month onwards
  const monthsPast = Array.from({length: currentMonth + 1}, (_, i) => i);  // includes current month

  return (
    <div className="fade-in">
      {/* Header */}
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16, flexWrap:"wrap", gap:12}}>
        <div>
          <div style={{fontFamily:"'Inter',sans-serif", color:"var(--text)", fontSize:14, letterSpacing:0.5, fontWeight:700}}>CELEBRATIONS</div>
          <div style={{fontSize:12, color:"var(--text-faint)", marginTop:3}}>
            {upcomingTotal} {type === "birthday" ? "birthday" : "anniversary"}{upcomingTotal !== 1 ? (type==="birthday"?"s":"ies") : (type==="anniversary"?"":"s")} remaining · {pastTotal} already passed this year
          </div>
        </div>
        <div style={{background:"var(--panel)",border:"1.5px solid var(--border-navy)",borderRadius:10,padding:"8px 14px",textAlign:"center",flexShrink:0}}>
          <div style={{fontSize:12,color:"var(--text-faint)",fontWeight:600}}>This Month</div>
          <div style={{fontSize:20,fontWeight:700,color:"var(--brand)"}}>{thisMonthCount}</div>
        </div>
      </div>

      {/* Person / family filters */}
      <div style={{display:"flex", gap:8, flexWrap:"wrap", alignItems:"center", marginBottom:18}}>
        <div style={{position:"relative"}}>
          <Search size={13} style={{position:"absolute", left:9, top:"50%", transform:"translateY(-50%)", color:"var(--text-faint)"}} />
          <input placeholder="Search person…" value={person} onChange={e=>setPerson(e.target.value)} style={{width:170, paddingLeft:28, fontSize:12}} />
        </div>
        <MultiSelect label="All families" width={170}
          options={sortedHouseholds.map(h => ({ value: h.id, label: h.name }))}
          selected={famSelected} onChange={setFamSelected} />
        {filterActive && (
          <button onClick={()=>{setPerson("");setFamSelected([]);}} style={{background:"none", border:"1px solid var(--border-navy-strong)", borderRadius:20, color:"var(--text-faint)", cursor:"pointer", fontSize:12, padding:"4px 12px", fontWeight:500}}>Clear filters</button>
        )}
      </div>

      {/* Main sub tabs: Birthdays / Anniversaries */}
      <div style={{display:"flex", gap:4, marginBottom:0, borderBottom:"1.5px solid var(--border-navy)", flexWrap:"wrap"}}>
        {[
          { key:"birthdays", icon:<Cake size={15} />, label:"Birthdays", count: thisMonthCount },
          { key:"anniversaries", icon:<Gem size={15} />, label:"Anniversaries",
            count: filteredMembers.filter(m => m.anniversary && m.is_active !== false && new Date(m.anniversary+"T00:00:00").getUTCMonth() === currentMonth).length },
        ].map(t => (
          <button key={t.key} onClick={()=>setSubtab(t.key)} style={{
            background:"none", border:"none", cursor:"pointer",
            fontFamily:"'Inter',sans-serif", fontSize:14, fontWeight:600,
            padding:"10px 18px", color: subtab===t.key?"#2a5357":"var(--text-muted-navy)",
            borderBottom: subtab===t.key?"2px solid var(--brand)":"2px solid transparent",
            display:"flex", alignItems:"center", gap:6, transition:"all 0.15s",
          }}>
            {t.icon} {t.label}
            <span style={{
              background: subtab===t.key?"#2a535718":"var(--panel)",
              border: subtab===t.key?"1.5px solid #2a535744":"1.5px solid var(--border-navy)",
              color: subtab===t.key?"#2a5357":"var(--text-muted-navy)",
              borderRadius:20, padding:"1px 8px", fontSize:12, fontWeight:700,
            }}>{t.count}</span>
          </button>
        ))}
      </div>

      {/* Upcoming / Past toggle */}
      <div style={{display:"flex", gap:8, margin:"14px 0 20px", background:"var(--panel)", borderRadius:10, padding:4, width:"fit-content"}}>
        {[["upcoming","Upcoming"], ["past","Past"]].map(([key, label]) => (
          <button key={key} onClick={()=>setViewMode(key)} style={{
            background: viewMode===key?"var(--surface)":"none",
            border: viewMode===key?"1.5px solid var(--border-navy)":"1.5px solid transparent",
            borderRadius:8, padding:"6px 16px", cursor:"pointer",
            fontFamily:"'Inter',sans-serif", fontSize:12, fontWeight:600,
            color: viewMode===key?"var(--text-navy)":"var(--text-muted-navy)",
            boxShadow: viewMode===key?"0 1px 3px var(--shadow-card)":"none",
            transition:"all 0.15s",
          }}>{label}</button>
        ))}
      </div>

      {/* UPCOMING VIEW */}
      {viewMode === "upcoming" && (
        <div>
          {upcomingTotal === 0 ? (
            <div style={{textAlign:"center",padding:"48px 20px",color:"var(--border-strong)"}}>
              <div style={{fontSize:36,marginBottom:12}}>{subtab==="birthdays"?<Cake size={36} color="var(--text-muted-navy)" />:<Gem size={36} color="var(--text-muted-navy)" />}</div>
              <div style={{fontWeight:600,color:"var(--text-muted)",marginBottom:6}}>No upcoming {subtab} for the rest of this year</div>
            </div>
          ) : (
            monthsUpcoming.map(month => {
              const entries = upcomingByMonth[month] || [];
              if (entries.length === 0) return (
                <div key={month} style={{marginBottom:16}}>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
                    <div style={{background:"var(--panel)",color:"var(--border-strong)",borderRadius:8,padding:"4px 14px",fontSize:12,fontWeight:700,border:"1.5px solid var(--border-navy)"}}>
                      {MONTH_NAMES[month]}
                    </div>
                    <span style={{fontSize:12,color:"var(--border-navy-strong)"}}>None</span>
                    {month === currentMonth && <span style={{fontSize:12,color:"var(--brand)",fontWeight:600}}>This Month</span>}
                  </div>
                </div>
              );
              return (
                <MonthSection key={month} monthIndex={month} entries={entries} type={type} past={false}
                  onMemberClick={onMemberClick} isCurrentMonth={month === currentMonth} />
              );
            })
          )}
          <div style={{textAlign:"center",padding:"12px",marginTop:4,background:"var(--panel)",borderRadius:10,fontSize:12,color:"var(--text-faint)",fontWeight:500}}>
            Showing {MONTH_NAMES[currentMonth]} – December {currentYear}
          </div>
        </div>
      )}

      {/* PAST VIEW */}
      {viewMode === "past" && (
        <div>
          {currentMonth === 0 ? (
            <div style={{textAlign:"center",padding:"48px 20px",color:"var(--border-strong)"}}>
              <div style={{marginBottom:12,display:"flex",justifyContent:"center"}}><CalendarDays size={36} color="var(--text-muted-navy)" /></div>
              <div style={{fontWeight:600,color:"var(--text-muted)",marginBottom:6}}>No past {subtab}, it's January!</div>
              <div style={{fontSize:12}}>Past {subtab} will appear here as the year progresses.</div>
            </div>
          ) : pastTotal === 0 ? (
            <div style={{textAlign:"center",padding:"48px 20px",color:"var(--border-strong)"}}>
              <div style={{marginBottom:12,display:"flex",justifyContent:"center"}}><CalendarDays size={36} color="var(--text-muted-navy)" /></div>
              <div style={{fontWeight:600,color:"var(--text-muted)",marginBottom:6}}>No past {subtab} recorded</div>
              <div style={{fontSize:12}}>Make sure members have their {type === "birthday" ? "date of birth" : "anniversary date"} entered.</div>
            </div>
          ) : (
            [...monthsPast].reverse().map(month => {  // most recent first
              const entries = pastByMonth[month] || [];
              if (entries.length === 0) return (
                <div key={month} style={{marginBottom:16}}>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
                    <div style={{background:"var(--panel)",color:"var(--border-strong)",borderRadius:8,padding:"4px 14px",fontSize:12,fontWeight:700,border:"1.5px solid var(--border-navy)"}}>
                      {MONTH_NAMES[month]}
                    </div>
                    <span style={{fontSize:12,color:"var(--border-navy-strong)"}}>None</span>
                  </div>
                </div>
              );
              return (
                <MonthSection key={month} monthIndex={month} entries={entries} type={type} past={true}
                  onMemberClick={onMemberClick} isCurrentMonth={false} />
              );
            })
          )}
          {pastTotal > 0 && (
            <div style={{textAlign:"center",padding:"12px",marginTop:4,background:"var(--panel)",borderRadius:10,fontSize:12,color:"var(--text-faint)",fontWeight:500}}>
              Showing January – {MONTH_NAMES[currentMonth]} {currentYear}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
