import { useMemo, useState } from "react";
import { Avatar, fullName, daysUntilNext, formatShortDate } from "../components";
import { Cake, Heart, CalendarDays } from "lucide-react";

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

function EventRow({ member, date, type, past, onMemberClick }) {
  const days = daysUntilNext(date);
  const years = calcYears(date);
  const typeColor = type === "birthday" ? "#2a5357" : "#e07830";
  const typeIcon = type === "birthday" ? <Cake size={13} color="#e07830" /> : <Heart size={13} color="#d060a0" />;
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
      background: isToday ? typeColor+"0a" : "#fff",
      border: isToday ? `1.5px solid ${typeColor}33` : "1.5px solid #e4e9f5",
      marginBottom:8, opacity: past ? 0.8 : 1,
    }}
    onMouseEnter={e=>e.currentTarget.style.background=typeColor+"08"}
    onMouseLeave={e=>e.currentTarget.style.background=isToday?typeColor+"0a":"#fff"}>
      <Avatar member={member} size={38} />
      <div style={{flex:1}}>
        <div style={{fontWeight:700, fontSize:14, color:"#111827"}}>{fullName(member)}</div>
        <div style={{fontSize:12, color:"#6b7280", marginTop:2, display:"flex", alignItems:"center", gap:5}}>
          {typeIcon} {formatShortDate(date)}
        </div>
      </div>
      <div style={{textAlign:"right", flexShrink:0}}>
        {isToday
          ? <span style={{background:typeColor+"18",border:`1.5px solid ${typeColor}44`,color:typeColor,borderRadius:20,padding:"3px 10px",fontSize:12,fontWeight:700}}>Today!</span>
          : past
            ? <div style={{fontSize:12, color:"#d1d5db", fontWeight:500}}>Passed</div>
            : <div style={{fontSize:12, fontWeight:600, color:isSoon?typeColor:"#8a96b8"}}>{formatDaysAway(days)}</div>
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
          background: isCurrentMonth ? typeColor : "#f4f6fa",
          color: isCurrentMonth ? "#fff" : "#5a6a8a",
          borderRadius:8, padding:"4px 14px",
          fontSize:12, fontWeight:700,
          border: isCurrentMonth ? "none" : "1.5px solid #e4e9f5",
        }}>
          {MONTH_NAMES[monthIndex]}
        </div>
        <span style={{fontSize:12, color:"#d1d5db", fontWeight:500}}>{count} {noun}</span>
        {isCurrentMonth && <span style={{fontSize:12, color:typeColor, fontWeight:600}}>This Month</span>}
      </div>
      {entries.map(x => (
        <EventRow key={x.member.id} member={x.member} date={x.date} type={type} past={past} onMemberClick={onMemberClick} />
      ))}
    </div>
  );
}

export default function CelebrationsPage({ members, onMemberClick }) {
  const [subtab, setSubtab] = useState("birthdays");
  const [viewMode, setViewMode] = useState("upcoming"); // "upcoming" or "past"

  const today = new Date();
  const currentMonth = today.getMonth();
  const currentDay = today.getDate();
  const currentYear = today.getFullYear();

  const dateField = subtab === "birthdays" ? "dob" : "anniversary";

  // UPCOMING: only dates that haven't happened yet this year (or today)
  // A date is "past" if its month/day has already passed this calendar year
  const upcomingByMonth = useMemo(() => {
    const byMonth = {};
    members
      .filter(m => m[dateField] && m.is_active !== false)
      .forEach(m => {
        const d = new Date(m[dateField] + "T00:00:00");
        const month = d.getUTCMonth();
        const day = d.getUTCDate();
        // Past = already happened this year (month before current, or same month but day already passed)
        const alreadyPassed = month < currentMonth || (month === currentMonth && day < currentDay);
        if (alreadyPassed) return; // goes to Past tab
        if (!byMonth[month]) byMonth[month] = [];
        const days = daysUntilNext(m[dateField]);
        byMonth[month].push({ member: m, date: m[dateField], days, day });
      });
    Object.keys(byMonth).forEach(month => {
      byMonth[month].sort((a, b) => a.day - b.day);
    });
    return byMonth;
  }, [members, dateField, currentMonth, currentDay]);

  // PAST: any date whose month/day has already passed this calendar year
  // Includes days earlier in the current month
  const pastByMonth = useMemo(() => {
    const byMonth = {};
    members
      .filter(m => m[dateField] && m.is_active !== false)
      .forEach(m => {
        const d = new Date(m[dateField] + "T00:00:00");
        const month = d.getUTCMonth();
        const day = d.getUTCDate();
        const alreadyPassed = month < currentMonth || (month === currentMonth && day < currentDay);
        if (!alreadyPassed) return;
        if (!byMonth[month]) byMonth[month] = [];
        byMonth[month].push({ member: m, date: m[dateField], day });
      });
    Object.keys(byMonth).forEach(month => {
      byMonth[month].sort((a, b) => a.day - b.day);
    });
    return byMonth;
  }, [members, dateField, currentMonth, currentDay]);

  const upcomingTotal = Object.values(upcomingByMonth).reduce((s, a) => s + a.length, 0);
  const pastTotal = Object.values(pastByMonth).reduce((s, a) => s + a.length, 0);

  const thisMonthCount = subtab === "birthdays"
    ? members.filter(m => m.dob && m.is_active !== false && new Date(m.dob+"T00:00:00").getUTCMonth() === currentMonth).length
    : members.filter(m => m.anniversary && m.is_active !== false && new Date(m.anniversary+"T00:00:00").getUTCMonth() === currentMonth).length;

  const type = subtab === "birthdays" ? "birthday" : "anniversary";
  const monthsUpcoming = Array.from({length: 12 - currentMonth}, (_, i) => currentMonth + i);  // current month onwards
  const monthsPast = Array.from({length: currentMonth + 1}, (_, i) => i);  // includes current month

  return (
    <div className="fade-in">
      {/* Header */}
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20}}>
        <div>
          <div style={{fontFamily:"'Inter',sans-serif", color:"#111827", fontSize:14, letterSpacing:0.5, fontWeight:700}}>CELEBRATIONS</div>
          <div style={{fontSize:12, color:"#9ca3af", marginTop:3}}>
            {upcomingTotal} {type === "birthday" ? "birthday" : "anniversary"}{upcomingTotal !== 1 ? (type==="birthday"?"s":"ies") : (type==="anniversary"?"":"s")} remaining · {pastTotal} already passed this year
          </div>
        </div>
        <div style={{background:"#f4f6ff",border:"1.5px solid #e4e9f5",borderRadius:10,padding:"8px 14px",textAlign:"center"}}>
          <div style={{fontSize:12,color:"#9ca3af",fontWeight:600}}>This Month</div>
          <div style={{fontSize:20,fontWeight:700,color:"#2a5357"}}>{thisMonthCount}</div>
        </div>
      </div>

      {/* Main sub tabs: Birthdays / Anniversaries */}
      <div style={{display:"flex", gap:4, marginBottom:0, borderBottom:"1.5px solid #e4e9f5"}}>
        {[
          { key:"birthdays", icon:<Cake size={15} />, label:"Birthdays", count: thisMonthCount },
          { key:"anniversaries", icon:<Heart size={15} />, label:"Anniversaries",
            count: members.filter(m => m.anniversary && m.is_active !== false && new Date(m.anniversary+"T00:00:00").getUTCMonth() === currentMonth).length },
        ].map(t => (
          <button key={t.key} onClick={()=>setSubtab(t.key)} style={{
            background:"none", border:"none", cursor:"pointer",
            fontFamily:"'Inter',sans-serif", fontSize:14, fontWeight:600,
            padding:"10px 18px", color: subtab===t.key?"#2a5357":"#8a96b8",
            borderBottom: subtab===t.key?"2px solid #2a5357":"2px solid transparent",
            display:"flex", alignItems:"center", gap:6, transition:"all 0.15s",
          }}>
            {t.icon} {t.label}
            <span style={{
              background: subtab===t.key?"#2a535718":"#f0f2f8",
              border: subtab===t.key?"1.5px solid #2a535744":"1.5px solid #e4e9f5",
              color: subtab===t.key?"#2a5357":"#8a96b8",
              borderRadius:20, padding:"1px 8px", fontSize:12, fontWeight:700,
            }}>{t.count} this month</span>
          </button>
        ))}
      </div>

      {/* Upcoming / Past toggle */}
      <div style={{display:"flex", gap:8, margin:"14px 0 20px", background:"#f4f6fa", borderRadius:10, padding:4, width:"fit-content"}}>
        {[["upcoming","Upcoming"], ["past","Past"]].map(([key, label]) => (
          <button key={key} onClick={()=>setViewMode(key)} style={{
            background: viewMode===key?"#fff":"none",
            border: viewMode===key?"1.5px solid #e4e9f5":"1.5px solid transparent",
            borderRadius:8, padding:"6px 16px", cursor:"pointer",
            fontFamily:"'Inter',sans-serif", fontSize:12, fontWeight:600,
            color: viewMode===key?"#2a3560":"#8a96b8",
            boxShadow: viewMode===key?"0 1px 3px #0000000a":"none",
            transition:"all 0.15s",
          }}>{label}</button>
        ))}
      </div>

      {/* UPCOMING VIEW */}
      {viewMode === "upcoming" && (
        <div>
          {upcomingTotal === 0 ? (
            <div style={{textAlign:"center",padding:"48px 20px",color:"#d1d5db"}}>
              <div style={{fontSize:36,marginBottom:12}}>{subtab==="birthdays"?<Cake size={36} color="#8a96b8" />:<Heart size={36} color="#8a96b8" />}</div>
              <div style={{fontWeight:600,color:"#6b7280",marginBottom:6}}>No upcoming {subtab} for the rest of this year</div>
            </div>
          ) : (
            monthsUpcoming.map(month => {
              const entries = upcomingByMonth[month] || [];
              if (entries.length === 0) return (
                <div key={month} style={{marginBottom:16}}>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
                    <div style={{background:"#f4f6fa",color:"#d1d5db",borderRadius:8,padding:"4px 14px",fontSize:12,fontWeight:700,border:"1.5px solid #e4e9f5"}}>
                      {MONTH_NAMES[month]}
                    </div>
                    <span style={{fontSize:12,color:"#c0c8d8"}}>None</span>
                    {month === currentMonth && <span style={{fontSize:12,color:"#2a5357",fontWeight:600}}>This Month</span>}
                  </div>
                </div>
              );
              return (
                <MonthSection key={month} monthIndex={month} entries={entries} type={type} past={false}
                  onMemberClick={onMemberClick} isCurrentMonth={month === currentMonth} />
              );
            })
          )}
          <div style={{textAlign:"center",padding:"12px",marginTop:4,background:"#f4f6fa",borderRadius:10,fontSize:12,color:"#9ca3af",fontWeight:500}}>
            Showing {MONTH_NAMES[currentMonth]} – December {currentYear}
          </div>
        </div>
      )}

      {/* PAST VIEW */}
      {viewMode === "past" && (
        <div>
          {currentMonth === 0 ? (
            <div style={{textAlign:"center",padding:"48px 20px",color:"#d1d5db"}}>
              <div style={{marginBottom:12,display:"flex",justifyContent:"center"}}><CalendarDays size={36} color="#8a96b8" /></div>
              <div style={{fontWeight:600,color:"#6b7280",marginBottom:6}}>No past {subtab} — it's January!</div>
              <div style={{fontSize:12}}>Past {subtab} will appear here as the year progresses.</div>
            </div>
          ) : pastTotal === 0 ? (
            <div style={{textAlign:"center",padding:"48px 20px",color:"#d1d5db"}}>
              <div style={{marginBottom:12,display:"flex",justifyContent:"center"}}><CalendarDays size={36} color="#8a96b8" /></div>
              <div style={{fontWeight:600,color:"#6b7280",marginBottom:6}}>No past {subtab} recorded</div>
              <div style={{fontSize:12}}>Make sure members have their {type === "birthday" ? "date of birth" : "anniversary date"} entered.</div>
            </div>
          ) : (
            [...monthsPast].reverse().map(month => {  // most recent first
              const entries = pastByMonth[month] || [];
              if (entries.length === 0) return (
                <div key={month} style={{marginBottom:16}}>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
                    <div style={{background:"#f4f6fa",color:"#d1d5db",borderRadius:8,padding:"4px 14px",fontSize:12,fontWeight:700,border:"1.5px solid #e4e9f5"}}>
                      {MONTH_NAMES[month]}
                    </div>
                    <span style={{fontSize:12,color:"#c0c8d8"}}>None</span>
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
            <div style={{textAlign:"center",padding:"12px",marginTop:4,background:"#f4f6fa",borderRadius:10,fontSize:12,color:"#9ca3af",fontWeight:500}}>
              Showing January – {MONTH_NAMES[currentMonth]} {currentYear}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
