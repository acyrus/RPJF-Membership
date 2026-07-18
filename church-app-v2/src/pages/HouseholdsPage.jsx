import { useState, useMemo } from "react";
import { supabase } from "../supabase";
import { Avatar, fullName } from "../components";
import { Home, Trash2, X } from "lucide-react";

export const FAMILY_TITLES = ["Father","Mother","Husband","Wife","Son","Daughter","Grandfather","Grandmother","Grandson","Granddaughter","Brother","Sister","Uncle","Aunt","Cousin","Guardian","Other"];
export const CHILD_TITLES = ["Son","Daughter","Grandson","Granddaughter"];

export default function HouseholdsPage({ profile, members, setMembers, households = [], setHouseholds = () => {} }) {
  const isAdmin = profile?.role === "admin";
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [busy, setBusy] = useState(false);

  const byHousehold = useMemo(() => {
    const map = {};
    members.forEach(m => { if (m.household_id) (map[m.household_id] = map[m.household_id] || []).push(m); });
    Object.values(map).forEach(list => list.sort((a, b) => fullName(a).localeCompare(fullName(b))));
    return map;
  }, [members]);

  const unassigned = useMemo(() =>
    members.filter(m => !m.household_id).sort((a, b) => fullName(a).localeCompare(fullName(b)))
  , [members]);

  const sortedHouseholds = useMemo(() =>
    [...households].sort((a, b) => a.name.localeCompare(b.name))
  , [households]);

  const householdName = id => (households.find(h => h.id === id) || {}).name;

  async function createHousehold() {
    const name = newName.trim();
    if (!name) return;
    setCreating(true); setError("");
    const { data, error: e } = await supabase.from("households").insert({ name }).select().single();
    setCreating(false);
    if (e) { setError(e.message); return; }
    setHouseholds(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
    setNewName("");
  }

  async function renameHousehold(id) {
    const name = editName.trim();
    if (!name) { setEditingId(null); return; }
    setError("");
    const { error: e } = await supabase.from("households").update({ name }).eq("id", id);
    if (e) { setError(e.message); return; }
    setHouseholds(prev => prev.map(h => h.id === id ? { ...h, name } : h).sort((a, b) => a.name.localeCompare(b.name)));
    setEditingId(null);
  }

  async function deleteHousehold(id) {
    if (!confirm("Delete this household? The members stay — they just won't be grouped any more.")) return;
    setError("");
    const { error: e } = await supabase.from("households").delete().eq("id", id);
    if (e) { setError(e.message); return; }
    setHouseholds(prev => prev.filter(h => h.id !== id));
    setMembers(prev => prev.map(m => m.household_id === id ? { ...m, household_id: null } : m));
  }

  async function assignMember(memberId, householdId) {    setBusy(true); setError("");
    const { error: e } = await supabase.rpc("set_member_household", { p_member_id: memberId, p_household_id: householdId });
    setBusy(false);
    if (e) { setError(e.message); return; }
    setMembers(prev => prev.map(m => m.id === memberId ? { ...m, household_id: householdId } : m));
  }

  async function setFamilyRole(memberId, role) {
    setBusy(true); setError("");
    const { error: e } = await supabase.from("members").update({ household_role: role || null }).eq("id", memberId);
    setBusy(false);
    if (e) { setError(e.message); return; }
    setMembers(prev => prev.map(m => m.id === memberId ? { ...m, household_role: role || null } : m));
  }

  return (
    <div className="fade-in">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 18 }}>
        <div>
          <div style={{ fontFamily: "'Inter',sans-serif", color: "#111827", fontSize: 14, letterSpacing: 0.2, fontWeight: 600 }}>HOUSEHOLDS</div>
          <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 3 }}>
            {households.length} household{households.length !== 1 ? "s" : ""} · {members.filter(m => m.household_id).length} of {members.length} members linked
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            placeholder="New household name, e.g. The Clarke Family"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") createHousehold(); }}
            style={{ width: 260 }}
          />
          <button className="btn-primary" onClick={createHousehold} disabled={creating || !newName.trim()}>
            {creating ? "Adding…" : "+ Create"}
          </button>
        </div>
      </div>

      <div style={{ background: "#eef6f6", border: "1.5px solid #c9e3e1", borderRadius: 10, padding: "10px 14px", fontSize: 12, color: "#2a5357", marginBottom: 18, lineHeight: 1.6 }}>
        To build a family from scratch: create the household above, then add each member to it below — even the very first person can be added before anyone else exists.
      </div>

      {error && <div className="error-msg" style={{ marginBottom: 14 }}>{error}</div>}

      {/* Household cards */}
      {sortedHouseholds.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 20px", color: "#d1d5db" }}>
          <div style={{ marginBottom: 12, display:"flex", justifyContent:"center" }}><Home size={36} color="#8a96b8" /></div>
          <div style={{ fontWeight: 600, color: "#6b7280", marginBottom: 6 }}>No households yet</div>
          <div style={{ fontSize: 12 }}>Create one above to start grouping families together.</div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 14 }}>
          {sortedHouseholds.map(h => {
            const fam = byHousehold[h.id] || [];
            const addable = members.filter(m => m.household_id !== h.id).sort((a, b) => fullName(a).localeCompare(fullName(b)));
            return (
              <div key={h.id} className="card" style={{ padding: 16, borderLeft: "3px solid #2a5357" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  {editingId === h.id ? (
                    <input
                      autoFocus
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") renameHousehold(h.id); if (e.key === "Escape") setEditingId(null); }}
                      onBlur={() => renameHousehold(h.id)}
                      style={{ flex: 1, fontSize: 14, fontWeight: 700 }}
                    />
                  ) : (
                    <div
                      onClick={() => { setEditingId(h.id); setEditName(h.name); }}
                      title="Click to rename"
                      style={{ fontWeight: 700, fontSize: 14, color: "#111827", cursor: "pointer", flex: 1 }}
                    >
                      <span style={{display:"inline-flex",alignItems:"center",gap:6}}><Home size={15} color="#2a5357" />{h.name}</span>
                    </div>
                  )}
                  {editingId !== h.id && (
                    <button onClick={() => { setEditingId(h.id); setEditName(h.name); }} title="Rename household"
                      style={{ background: "none", border: "1px solid #d0d7e8", borderRadius: 6, color: "#5a6a8a", cursor: "pointer", fontSize: 12, padding: "3px 8px", flexShrink: 0 }}>Rename</button>
                  )}
                  <span style={{ background: "#2a535718", border: "1.5px solid #2a535744", color: "#2a5357", borderRadius: 20, padding: "2px 10px", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{fam.length}</span>
                  {isAdmin && (
                    <button onClick={() => deleteHousehold(h.id)} title="Delete household" style={{ background: "none", border: "none", color: "#e0a0a0", cursor: "pointer", fontSize: 15, padding: 2, flexShrink: 0 }}><Trash2 size={15} /></button>
                  )}
                </div>

                {fam.length === 0
                  ? <div style={{ fontSize: 12, color: "#d1d5db", marginBottom: 10 }}>No members yet</div>
                  : <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
                      {fam.map(m => (
                        <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <Avatar member={m} size={26} />
                          <div style={{ flex: 1, fontSize: 12, color: "#1f2937", fontWeight: 600, minWidth: 0 }}>{fullName(m)}</div>
                          <select value={m.household_role || ""} disabled={busy} onChange={e => setFamilyRole(m.id, e.target.value)}
                            title="Family role" style={{ fontSize: 11, padding: "3px 6px", width: 120, flexShrink: 0 }}>
                            <option value="">Role…</option>
                            {FAMILY_TITLES.map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                          <button onClick={() => assignMember(m.id, null)} disabled={busy} title="Remove from household"
                            style={{ background: "none", border: "1px solid #f0d0d0", borderRadius: 6, color: "#e05050", cursor: "pointer", fontSize: 11, padding: "2px 7px", flexShrink: 0 }}><X size={14} /></button>
                        </div>
                      ))}
                    </div>
                }

                <select value="" disabled={busy} onChange={e => { if (e.target.value) assignMember(e.target.value, h.id); }} style={{ fontSize: 12 }}>
                  <option value="">+ Add member to this household…</option>
                  {addable.map(m => (
                    <option key={m.id} value={m.id}>
                      {fullName(m)}{m.household_id ? ` — currently in ${householdName(m.household_id) || "another household"}` : ""}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
      )}

      {/* Unassigned members */}
      {unassigned.length > 0 && (
        <>
          <div className="section-title">
            Members without a household ({unassigned.length})
          </div>
          <div className="card" style={{ padding: 8 }}>
            {unassigned.map(m => (
              <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 8px", borderBottom: "1px solid #f3f4f6" }}>
                <Avatar member={m} size={32} />
                <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "#111827" }}>{fullName(m)}</div>
                {sortedHouseholds.length === 0
                  ? <span style={{ fontSize: 11, color: "#d1d5db" }}>Create a household first</span>
                  : <select value="" disabled={busy} onChange={e => { if (e.target.value) assignMember(m.id, e.target.value); }} style={{ width: 200, fontSize: 12 }}>
                      <option value="">Assign to household…</option>
                      {sortedHouseholds.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
                    </select>
                }
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
