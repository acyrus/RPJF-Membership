import { useState, useMemo, useRef } from "react";
import { fullName } from "./components";
import { Bell, Camera, Cake, Heart, UserMinus, TrendingDown, ChevronRight, X } from "lucide-react";

// Days until the next occurrence of a date's month/day (0 = today), or null.
function daysUntilNext(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d)) return null;
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const next = new Date(now.getFullYear(), d.getMonth(), d.getDate());
  if (next < now) next.setFullYear(now.getFullYear() + 1);
  return Math.round((next - now) / 86400000);
}

// In-app "needs my attention" centre. Aggregates signals already in the app, gated by the
// tabs each account can reach, and routes each item to the relevant tab.
export default function NotificationCenter({ members = [], services = [], attendance = {}, pendingPhotos = 0, allowedTabs = [], onNavigate }) {
  const [open, setOpen] = useState(false);
  const [panelTop, setPanelTop] = useState(0); // fixed-position top, measured from the bell
  const btnRef = useRef(null);
  const can = k => allowedTabs.includes(k);
  const toggle = () => {
    if (!open && btnRef.current) setPanelTop(btnRef.current.getBoundingClientRect().bottom + 6);
    setOpen(o => !o);
  };

  const items = useMemo(() => {
    const out = [];

    // Photos awaiting approval
    if (can("photos") && pendingPhotos > 0) {
      out.push({ id: "photos", icon: <Camera size={15} />, color: "#7c3aed", tab: "photos",
        text: `${pendingPhotos} photo${pendingPhotos !== 1 ? "s" : ""} awaiting approval` });
    }

    // Birthdays this week
    if (can("celebrations")) {
      const bdays = members.filter(m => m.is_active !== false && (daysUntilNext(m.dob) ?? 99) <= 7);
      if (bdays.length) out.push({ id: "bdays", icon: <Cake size={15} />, color: "#e07830", tab: "celebrations",
        text: `${bdays.length} birthday${bdays.length !== 1 ? "s" : ""} this week` });

      // Anniversaries this week (couples counted once)
      const seen = new Set(); let ann = 0;
      members.filter(m => m.is_active !== false && m.anniversary && (daysUntilNext(m.anniversary) ?? 99) <= 7).forEach(m => {
        if (seen.has(m.id)) return; seen.add(m.id); if (m.spouse_id) seen.add(m.spouse_id); ann++;
      });
      if (ann) out.push({ id: "anns", icon: <Heart size={15} />, color: "#d060a0", tab: "celebrations",
        text: `${ann} anniversar${ann !== 1 ? "ies" : "y"} this week` });
    }

    // Slipping away: attended at least twice but nothing in the last 28 days
    if (can("attendance") && services.length >= 2) {
      const latest = services.map(s => s.service_date).reduce((a, b) => (a > b ? a : b), "");
      const cutoff = new Date(latest + "T12:00:00"); cutoff.setDate(cutoff.getDate() - 28);
      const cutoffStr = cutoff.toISOString().slice(0, 10);
      const dates = {};
      services.forEach(s => (attendance[s.id] || []).forEach(id => (dates[id] = dates[id] || []).push(s.service_date)));
      let slip = 0;
      members.forEach(m => {
        const ds = dates[m.id];
        if (ds && ds.length >= 2 && !ds.some(d => d >= cutoffStr)) slip++;
      });
      if (slip) out.push({ id: "slip", icon: <TrendingDown size={15} />, color: "#c06010", tab: "analytics",
        text: `${slip} member${slip !== 1 ? "s" : ""} slipping away (28+ days)` });
    }

    // Inactive candidates: still active but no attendance in 90+ days
    if (can("members") || can("analytics")) {
      const last = {};
      services.forEach(s => (attendance[s.id] || []).forEach(id => { if (!last[id] || s.service_date > last[id]) last[id] = s.service_date; }));
      const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 90);
      const cutoffStr = cutoff.toISOString().slice(0, 10);
      const inactive = members.filter(m => m.is_active !== false && last[m.id] && last[m.id] < cutoffStr).length;
      if (inactive) out.push({ id: "inactive", icon: <UserMinus size={15} />, color: "#dc2626", tab: "analytics",
        text: `${inactive} active member${inactive !== 1 ? "s" : ""} not seen in 90+ days` });
    }

    return out;
  }, [members, services, attendance, pendingPhotos, allowedTabs]);

  const count = items.length;

  return (
    <div style={{ position: "relative" }}>
      <button ref={btnRef} onClick={toggle} title="Notifications" aria-label="Notifications"
        style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", position: "relative", background: "none", border: "1.5px solid #5edcd155", color: "var(--brand-accent)", padding: "7px 9px", borderRadius: 8, cursor: "pointer" }}>
        <Bell size={14} />
        {count > 0 && <span style={{ position: "absolute", top: -6, right: -6, minWidth: 16, height: 16, padding: "0 4px", borderRadius: 10, background: "#e15700", color: "#fff", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{count}</span>}
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 300 }} />
          <div style={{ position: "fixed", top: panelTop, right: 10, zIndex: 301, width: "min(300px, calc(100vw - 20px))", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, boxShadow: "0 10px 30px #00000026", overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", borderBottom: "1px solid var(--border)" }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>Needs your attention</span>
              <button onClick={() => setOpen(false)} aria-label="Close" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", display: "flex" }}><X size={15} /></button>
            </div>
            {count === 0 ? (
              <div style={{ padding: "26px 16px", textAlign: "center", color: "var(--text-faint)", fontSize: 12.5 }}>You're all caught up.</div>
            ) : (
              <div style={{ maxHeight: 340, overflowY: "auto" }}>
                {items.map((it, i) => (
                  <div key={it.id} onClick={() => { onNavigate && onNavigate(it.tab); setOpen(false); }}
                    style={{ display: "flex", alignItems: "center", gap: 11, padding: "11px 14px", cursor: "pointer", borderTop: i > 0 ? "1px solid var(--border-divider)" : "none" }}
                    onMouseEnter={e => e.currentTarget.style.background = "var(--surface-alt)"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <div style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0, background: it.color + "1f", color: it.color, display: "flex", alignItems: "center", justifyContent: "center" }}>{it.icon}</div>
                    <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: "var(--text-2)", fontWeight: 500 }}>{it.text}</div>
                    <ChevronRight size={15} color="var(--text-faint)" style={{ flexShrink: 0 }} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
