import { useState, useEffect, useMemo } from "react";
import { supabase } from "../supabase";
import { Avatar, fullName } from "../components";
import { Inbox } from "lucide-react";

export default function PhotoRequestsPage({ profile, members, setMembers, setPendingPhotos = () => {} }) {
  const [subs, setSubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [choice, setChoice] = useState({}); // submissionId -> memberId
  const [busy, setBusy] = useState(null);    // submissionId being actioned

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true); setError("");
    const { data, error: e } = await supabase
      .from("photo_submissions")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: true });
    if (e) { setError(e.message); setLoading(false); return; }
    setSubs(data || []);
    setPendingPhotos((data || []).length);
    // Pre-select an exact name match where there's exactly one
    const pre = {};
    (data || []).forEach(s => {
      const matches = members.filter(m =>
        (m.first_name || "").trim().toLowerCase() === s.first_name.trim().toLowerCase() &&
        (m.last_name || "").trim().toLowerCase() === s.last_name.trim().toLowerCase()
      );
      if (matches.length === 1) pre[s.id] = matches[0].id;
    });
    setChoice(pre);
    setLoading(false);
  }

  const sortedMembers = useMemo(() =>
    [...members].sort((a, b) => fullName(a).localeCompare(fullName(b)))
  , [members]);

  function matchInfo(s) {
    const matches = members.filter(m =>
      (m.first_name || "").trim().toLowerCase() === s.first_name.trim().toLowerCase() &&
      (m.last_name || "").trim().toLowerCase() === s.last_name.trim().toLowerCase()
    );
    if (matches.length === 1) return { kind: "one", text: `Matched to ${fullName(matches[0])}` };
    if (matches.length > 1) return { kind: "many", text: `${matches.length} members share this name — pick the right one` };
    return { kind: "none", text: "No member with this exact name — choose manually" };
  }

  async function approve(s) {
    const memberId = choice[s.id];
    if (!memberId) { setError("Pick which member this photo belongs to first."); return; }
    setBusy(s.id); setError("");
    try {
      const { error: mErr } = await supabase.from("members").update({ photo_url: s.photo_url }).eq("id", memberId);
      if (mErr) throw mErr;
      const { error: sErr } = await supabase.from("photo_submissions")
        .update({ status: "approved", member_id: memberId, reviewed_by: profile.id, reviewed_at: new Date().toISOString() })
        .eq("id", s.id);
      if (sErr) throw sErr;
      setMembers(prev => prev.map(m => m.id === memberId ? { ...m, photo_url: s.photo_url } : m));
      const who = members.find(m => m.id === memberId);
      logPhotoActivity("photo_approved", `Approved photo for ${who ? fullName(who) : "a member"}`);
      removeFromQueue(s.id);
    } catch (e) { setError(e.message); }
    finally { setBusy(null); }
  }

  async function reject(s) {
    if (!confirm("Reject this photo? It won't be added to any member.")) return;
    setBusy(s.id); setError("");
    try {
      const { error: e } = await supabase.from("photo_submissions")
        .update({ status: "rejected", reviewed_by: profile.id, reviewed_at: new Date().toISOString() })
        .eq("id", s.id);
      if (e) throw e;
      logPhotoActivity("photo_rejected", `Rejected photo submitted for ${(s.first_name||"").trim()} ${(s.last_name||"").trim()}`.trim());
      removeFromQueue(s.id);
    } catch (e) { setError(e.message); }
    finally { setBusy(null); }
  }

  async function logPhotoActivity(action_type, description) {
    try {
      await supabase.from("activity_log").insert({ action_type, description, user_id: profile.id, user_name: profile.name });
    } catch { /* logging is best-effort; never block the action */ }
  }

  function removeFromQueue(id) {
    setSubs(prev => {
      const next = prev.filter(s => s.id !== id);
      setPendingPhotos(next.length);
      return next;
    });
  }

  return (
    <div className="fade-in">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 18 }}>
        <div>
          <div style={{ fontFamily: "'Inter',sans-serif", color: "#111827", fontSize: 14, letterSpacing: 0.2, fontWeight: 600 }}>PHOTO REQUESTS</div>
          <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 3 }}>
            {loading ? "Loading…" : `${subs.length} photo${subs.length !== 1 ? "s" : ""} awaiting review`}
          </div>
        </div>
        <button className="btn-ghost" onClick={load} disabled={loading}>Refresh</button>
      </div>

      {error && <div className="error-msg" style={{ marginBottom: 14 }}>{error}</div>}

      {!loading && subs.length === 0 ? (
        <div style={{ textAlign: "center", padding: "48px 20px", color: "#d1d5db" }}>
          <div style={{ marginBottom: 12, display:"flex", justifyContent:"center" }}><Inbox size={36} color="#8a96b8" /></div>
          <div style={{ fontWeight: 600, color: "#6b7280", marginBottom: 6 }}>No photos waiting</div>
          <div style={{ fontSize: 12 }}>Submissions from the public photo page will appear here.</div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(320px,1fr))", gap: 14 }}>
          {subs.map(s => {
            const info = matchInfo(s);
            const infoColor = info.kind === "one" ? "#2a8a50" : info.kind === "many" ? "#a05010" : "#9ca3af";
            const infoBg = info.kind === "one" ? "#e8f8f0" : info.kind === "many" ? "#fdf3e7" : "#f3f4f6";
            return (
              <div key={s.id} className="card" style={{ padding: 16 }}>
                <div style={{ display: "flex", gap: 14, marginBottom: 12 }}>
                  <img src={s.photo_url} alt="Submitted" style={{ width: 72, height: 72, borderRadius: 12, objectFit: "cover", background: "#eef1f6", flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#111827" }}>{s.first_name} {s.last_name}</div>
                    <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>
                      Submitted {new Date(s.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </div>
                    <div style={{ display: "inline-block", marginTop: 8, background: infoBg, color: infoColor, fontSize: 11, fontWeight: 700, borderRadius: 20, padding: "3px 10px" }}>
                      {info.text}
                    </div>
                  </div>
                </div>

                <label className="field-label">Attach to member</label>
                <select value={choice[s.id] || ""} onChange={e => setChoice(c => ({ ...c, [s.id]: e.target.value }))} style={{ marginTop: 4 }}>
                  <option value="">— Select member —</option>
                  {sortedMembers.map(m => (
                    <option key={m.id} value={m.id}>{fullName(m)}{m.photo_url ? " (has a photo)" : ""}</option>
                  ))}
                </select>

                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <button className="btn-primary" style={{ flex: 1, fontSize: 13 }} disabled={busy === s.id} onClick={() => approve(s)}>
                    {busy === s.id ? "Saving…" : "Approve & attach"}
                  </button>
                  <button className="btn-danger" style={{ fontSize: 13 }} disabled={busy === s.id} onClick={() => reject(s)}>Reject</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
