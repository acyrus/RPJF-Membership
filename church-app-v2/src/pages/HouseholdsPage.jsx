import { useState, useMemo } from "react";
import { supabase } from "../supabase";
import { Avatar, fullName, calcAge } from "../components";
import { Home, Trash2, X, Heart, Cake, Users, Sparkles, Pencil, Check, Search, Plus } from "lucide-react";

export const FAMILY_TITLES = ["Father","Mother","Husband","Wife","Son","Daughter","Grandfather","Grandmother","Grandson","Granddaughter","Brother","Sister","Uncle","Aunt","Cousin","Guardian","Other"];
export const CHILD_TITLES = ["Son","Daughter","Grandson","Granddaughter"];

// Normalise for the grouping helper (surname + address clustering).
const norm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

// Adult vs child: explicit child title wins; any other title = adult; no title
// falls back to age (under-18 = child, 18+/unknown = adult).
function isChild(m) {
  if (m.household_role && CHILD_TITLES.includes(m.household_role)) return true;
  if (m.household_role) return false;
  const age = calcAge(m.dob);
  return age !== null && age < 18;
}
const monthOf = d => { if (!d) return -1; const x = new Date(d + "T00:00:00"); return isNaN(x) ? -1 : x.getUTCMonth(); };

const badge = { fontSize: 10, fontWeight: 700, color: "var(--brand)", background: "var(--brand-tint)", border: "1px solid var(--brand-accent-border)", borderRadius: 20, padding: "1px 8px", flexShrink: 0, whiteSpace: "nowrap" };
const sectionLabel = { fontSize: 10, fontWeight: 700, color: "var(--text-muted-navy)", textTransform: "uppercase", letterSpacing: 0.5, margin: "0 0 8px" };

export default function HouseholdsPage({ profile, members, setMembers, households = [], setHouseholds = () => {}, onMemberClick = () => {} }) {
  const isAdmin = profile?.role === "admin";
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [editCard, setEditCard] = useState(null);      // family whose members are being edited
  const [editingId, setEditingId] = useState(null);    // family being renamed inline (edit mode)
  const [editName, setEditName] = useState("");
  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  // Grouping helper
  const [showSuggest, setShowSuggest] = useState(false);
  const [suggestions, setSuggestions] = useState([]);

  const memberById = useMemo(() => Object.fromEntries(members.map(m => [m.id, m])), [members]);
  const byHousehold = useMemo(() => {
    const map = {};
    members.forEach(m => { if (m.household_id) (map[m.household_id] = map[m.household_id] || []).push(m); });
    return map;
  }, [members]);
  const unassigned = useMemo(() =>
    members.filter(m => !m.household_id).sort((a, b) => fullName(a).localeCompare(fullName(b)))
  , [members]);
  const sortedHouseholds = useMemo(() =>
    [...households].sort((a, b) => a.name.localeCompare(b.name))
  , [households]);
  const householdName = id => (households.find(h => h.id === id) || {}).name;
  const curMonth = new Date().getMonth();

  // Search filters families by their name or a member's name.
  const ql = q.trim().toLowerCase();
  const shownHouseholds = useMemo(() => {
    if (!ql) return sortedHouseholds;
    return sortedHouseholds.filter(h =>
      h.name.toLowerCase().includes(ql) ||
      (byHousehold[h.id] || []).some(m => fullName(m).toLowerCase().includes(ql)));
  }, [sortedHouseholds, byHousehold, ql]);
  const shownUnassigned = ql ? unassigned.filter(m => fullName(m).toLowerCase().includes(ql)) : unassigned;

  async function createHousehold() {
    const name = newName.trim();
    if (!name) return;
    setCreating(true); setError("");
    const { data, error: e } = await supabase.from("households").insert({ name }).select().single();
    setCreating(false);
    if (e) { setError(e.message); return; }
    setHouseholds(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
    setNewName(""); setShowCreate(false);
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
    if (!confirm("Delete this family? The members stay, they just won't be grouped any more.")) return;
    setError("");
    const { error: e } = await supabase.from("households").delete().eq("id", id);
    if (e) { setError(e.message); return; }
    setHouseholds(prev => prev.filter(h => h.id !== id));
    setMembers(prev => prev.map(m => m.household_id === id ? { ...m, household_id: null } : m));
  }
  async function assignMember(memberId, householdId) {
    setBusy(true); setError("");
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

  function buildSuggestions() {
    const groups = {};
    unassigned.forEach(m => {
      const addr = norm(m.address); if (!addr) return;
      const key = norm(m.last_name) + "|" + addr;
      (groups[key] = groups[key] || []).push(m);
    });
    setSuggestions(Object.entries(groups).filter(([, ms]) => ms.length >= 2).map(([key, ms]) => ({
      key, name: `The ${ms[0].last_name} Family`, ids: ms.map(m => m.id),
      chosen: Object.fromEntries(ms.map(m => [m.id, true])),
    })).sort((a, b) => b.ids.length - a.ids.length));
    setShowSuggest(true);
  }
  async function createFromSuggestion(sug) {
    const ids = sug.ids.filter(id => sug.chosen[id]);
    if (!ids.length) return;
    setBusy(true); setError("");
    const { data, error: e } = await supabase.from("households").insert({ name: sug.name.trim() || "New Family" }).select().single();
    if (e) { setBusy(false); setError(e.message); return; }
    for (const id of ids) {
      const { error: ae } = await supabase.rpc("set_member_household", { p_member_id: id, p_household_id: data.id });
      if (ae) { setBusy(false); setError(ae.message); return; }
    }
    setBusy(false);
    setHouseholds(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
    setMembers(prev => prev.map(m => ids.includes(m.id) ? { ...m, household_id: data.id } : m));
    setSuggestions(prev => prev.filter(s => s.key !== sug.key));
  }

  // ── read-mode people ──
  function Person({ m, align = "left" }) {
    const spouse = m.spouse_id ? memberById[m.spouse_id] : null;
    const spouseHere = spouse && spouse.household_id === m.household_id;
    return (
      <div onClick={() => onMemberClick(m)} title="Open member"
        style={{ display: "flex", alignItems: "center", gap: 9, cursor: "pointer", flexDirection: align === "right" ? "row-reverse" : "row", textAlign: align === "right" ? "right" : "left" }}>
        <Avatar member={m} size={34} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>{fullName(m)}</div>
          {m.household_role && <div style={{ fontSize: 11, color: "var(--brand)", fontWeight: 500 }}>{m.household_role}</div>}
        </div>
      </div>
    );
  }
  function ChildRow({ m }) {
    return (
      <div onClick={() => onMemberClick(m)} title="Open member"
        style={{ display: "flex", alignItems: "center", gap: 9, padding: "7px 10px", background: "var(--surface-alt)", border: "1px solid var(--border)", borderRadius: 10, cursor: "pointer" }}>
        <Avatar member={m} size={30} />
        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{fullName(m)}</span>
        {m.household_role && <span style={badge}>{m.household_role}</span>}
      </div>
    );
  }
  // ── edit-mode row (functional) ──
  function EditRow({ m, hid }) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Avatar member={m} size={28} />
        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "var(--text)", minWidth: 0 }}>{fullName(m)}</span>
        <select value={m.household_role || ""} disabled={busy} onChange={e => setFamilyRole(m.id, e.target.value)}
          title="Family title" style={{ fontSize: 11, padding: "3px 6px", width: 120, flexShrink: 0 }}>
          <option value="">Title…</option>
          {FAMILY_TITLES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <button onClick={() => assignMember(m.id, null)} disabled={busy} title="Remove from family"
          style={{ background: "none", border: "1px solid var(--danger-border)", borderRadius: 6, color: "var(--danger)", cursor: "pointer", padding: "2px 6px", flexShrink: 0 }}><X size={13} /></button>
      </div>
    );
  }

  return (
    <div className="fade-in">
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
        <div>
          <div style={{ fontFamily: "'Inter',sans-serif", color: "var(--text)", fontSize: 14, letterSpacing: 0.2, fontWeight: 600 }}>FAMILIES</div>
          <div style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 3 }}>
            {households.length} famil{households.length !== 1 ? "ies" : "y"} · {members.filter(m => m.household_id).length} of {members.length} linked
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ position: "relative" }}>
            <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-faint)" }} />
            <input placeholder="Search families or names…" value={q} onChange={e => setQ(e.target.value)} style={{ width: 230, paddingLeft: 30 }} />
          </div>
          {isAdmin && unassigned.length > 0 && (
            <button className="btn-ghost" onClick={buildSuggestions} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Sparkles size={14} /> Suggest</button>
          )}
          <button className="btn-primary" onClick={() => { setNewName(""); setShowCreate(true); }} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Plus size={15} /> Create family</button>
        </div>
      </div>

      {error && <div className="error-msg" style={{ marginBottom: 14 }}>{error}</div>}

      {/* Create family modal */}
      {showCreate && (
        <div className="modal-bg" onClick={() => setShowCreate(false)}>
          <div className="modal fade-in" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <h2>Create a family</h2>
            <div className="field-group">
              <label className="field-label">Family name</label>
              <input autoFocus placeholder="e.g. The Clarke Family" value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") createHousehold(); if (e.key === "Escape") setShowCreate(false); }} />
              <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 8, lineHeight: 1.6 }}>
                Create the family first, then add members to it, or use “Suggest” to group members automatically.
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
              <button className="btn-primary" style={{ flex: 1 }} onClick={createHousehold} disabled={creating || !newName.trim()}>{creating ? "Creating…" : "Create family"}</button>
              <button className="btn-ghost" onClick={() => setShowCreate(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Grouping helper */}
      {showSuggest && (
        <div className="card" style={{ padding: 16, marginBottom: 18, borderLeft: "3px solid var(--brand)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text)", display: "flex", alignItems: "center", gap: 6 }}><Sparkles size={15} color="var(--brand)" /> Suggested families</div>
            <button onClick={() => setShowSuggest(false)} style={{ background: "none", border: "none", color: "var(--text-faint)", cursor: "pointer" }}><X size={16} /></button>
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12, lineHeight: 1.6 }}>Members not yet in a family who share a last name and address. Untick anyone who doesn't belong, then create.</div>
          {suggestions.length === 0 ? (
            <div style={{ fontSize: 12, color: "var(--text-faint)" }}>No groups found — members need a shared last name and address to be suggested.</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 12 }}>
              {suggestions.map((sug, si) => (
                <div key={sug.key} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 12, background: "var(--panel)" }}>
                  <input value={sug.name} onChange={e => setSuggestions(prev => prev.map((s, i) => i === si ? { ...s, name: e.target.value } : s))} style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }} />
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
                    {sug.ids.map(id => { const m = memberById[id]; return (
                      <label key={id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, cursor: "pointer" }}>
                        <input type="checkbox" checked={!!sug.chosen[id]} onChange={e => setSuggestions(prev => prev.map((s, i) => i === si ? { ...s, chosen: { ...s.chosen, [id]: e.target.checked } } : s))} style={{ width: 14, height: 14 }} />
                        <Avatar member={m} size={22} /><span style={{ color: "var(--text)", fontWeight: 600 }}>{fullName(m)}</span>
                      </label>
                    ); })}
                  </div>
                  <button className="btn-primary" disabled={busy || !Object.values(sug.chosen).some(Boolean)} onClick={() => createFromSuggestion(sug)} style={{ fontSize: 12, padding: "7px 14px" }}>Create this family</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Family cards */}
      {sortedHouseholds.length === 0 ? (
        <div style={{ textAlign: "center", padding: "48px 20px", color: "var(--border-strong)" }}>
          <div style={{ marginBottom: 12, display: "flex", justifyContent: "center" }}><Home size={36} color="var(--text-muted-navy)" /></div>
          <div style={{ fontWeight: 600, color: "var(--text-muted)", marginBottom: 6 }}>No families yet</div>
          <div style={{ fontSize: 12 }}>Use “Create family”, or “Suggest” to group members automatically.</div>
        </div>
      ) : shownHouseholds.length === 0 ? (
        <div style={{ textAlign: "center", padding: "32px 20px", color: "var(--text-faint)", fontSize: 13 }}>No families or members match “{q}”.</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(420px,1fr))", gap: 16 }}>
          {shownHouseholds.map(h => {
            const fam = byHousehold[h.id] || [];
            const adults = fam.filter(m => !isChild(m)).sort((a, b) => (calcAge(b.dob) ?? -1) - (calcAge(a.dob) ?? -1));
            const kids = fam.filter(isChild).sort((a, b) => (calcAge(b.dob) ?? -1) - (calcAge(a.dob) ?? -1));
            const bdays = fam.filter(m => monthOf(m.dob) === curMonth).length;
            const annis = fam.filter(m => monthOf(m.anniversary) === curMonth).length;
            const editing = editCard === h.id;
            const coupled = adults.length === 2;
            return (
              <div key={h.id} className="card" style={{ padding: 18, borderLeft: "3px solid var(--brand)" }}>
                {/* Header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 2 }}>
                  {editing && editingId === h.id ? (
                    <input autoFocus value={editName} onChange={e => setEditName(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") renameHousehold(h.id); if (e.key === "Escape") setEditingId(null); }}
                      onBlur={() => renameHousehold(h.id)} style={{ flex: 1, fontSize: 16, fontWeight: 700 }} />
                  ) : (
                    <div onClick={() => { if (editing) { setEditingId(h.id); setEditName(h.name); } }} title={editing ? "Click to rename" : ""}
                      style={{ fontWeight: 700, fontSize: 16, color: "var(--text)", flex: 1, minWidth: 0, cursor: editing ? "text" : "default", display: "flex", alignItems: "center", gap: 7 }}>
                      <Home size={16} color="var(--brand)" />{h.name}
                    </div>
                  )}
                  <button onClick={() => { setEditCard(editing ? null : h.id); setEditingId(null); }} title={editing ? "Done" : "Edit family"}
                    style={{ background: editing ? "var(--brand-tint)" : "none", border: "1px solid var(--border-navy-strong)", borderRadius: 6, color: editing ? "var(--brand)" : "var(--text-navy-muted)", cursor: "pointer", fontSize: 12, padding: "3px 8px", flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 4 }}>
                    {editing ? <><Check size={12} /> Done</> : <><Pencil size={12} /> Edit</>}
                  </button>
                  {isAdmin && editing && (
                    <button onClick={() => deleteHousehold(h.id)} title="Delete family" style={{ background: "none", border: "none", color: "var(--danger)", cursor: "pointer", padding: 2, flexShrink: 0 }}><Trash2 size={15} /></button>
                  )}
                </div>
                <div style={{ fontSize: 12, color: "var(--text-faint)", marginBottom: 16, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span>{fam.length} member{fam.length !== 1 ? "s" : ""}{kids.length ? ` · ${kids.length} child${kids.length !== 1 ? "ren" : ""}` : ""}</span>
                  {bdays > 0 && <span style={{ color: "var(--brand)", display: "inline-flex", alignItems: "center", gap: 4 }}><Cake size={12} /> {bdays} this month</span>}
                  {annis > 0 && <span style={{ color: "var(--brand)", display: "inline-flex", alignItems: "center", gap: 4 }}><Heart size={12} /> {annis} this month</span>}
                </div>

                {fam.length === 0 && <div style={{ fontSize: 12, color: "var(--border-strong)", marginBottom: 6 }}>No members yet — click Edit to add someone.</div>}

                {editing ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {fam.map(m => <EditRow key={m.id} m={m} hid={h.id} />)}
                    <select value="" disabled={busy} onChange={e => { if (e.target.value) assignMember(e.target.value, h.id); }} style={{ fontSize: 12, marginTop: 4 }}>
                      <option value="">+ Add member to this family…</option>
                      {members.filter(m => m.household_id !== h.id).sort((a, b) => fullName(a).localeCompare(fullName(b))).map(m => (
                        <option key={m.id} value={m.id}>{fullName(m)}{m.household_id ? `, currently in ${householdName(m.household_id) || "another family"}` : ""}</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <>
                    {adults.length > 0 && (
                      <div style={{ marginBottom: kids.length ? 16 : 0 }}>
                        <div style={sectionLabel}>{coupled ? "Parents" : "Adults"}</div>
                        {coupled ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{ flex: 1, minWidth: 0 }}><Person m={adults[0]} /></div>
                            <Heart size={16} color="var(--brand)" style={{ flexShrink: 0 }} />
                            <div style={{ flex: 1, minWidth: 0 }}><Person m={adults[1]} align="right" /></div>
                          </div>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{adults.map(m => <Person key={m.id} m={m} />)}</div>
                        )}
                      </div>
                    )}
                    {kids.length > 0 && (
                      <div>
                        <div style={sectionLabel}>Children</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{kids.map(m => <ChildRow key={m.id} m={m} />)}</div>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Members not yet in a family */}
      {shownUnassigned.length > 0 && (
        <>
          <div className="section-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Users size={13} /> Members without a family ({shownUnassigned.length})
          </div>
          <div className="card" style={{ padding: 8, maxHeight: 360, overflowY: "auto" }}>
            {shownUnassigned.map(m => (
              <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 8px", borderBottom: "1px solid var(--border-divider)" }}>
                <Avatar member={m} size={32} />
                <div onClick={() => onMemberClick(m)} style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "var(--text)", cursor: "pointer" }}>{fullName(m)}</div>
                {sortedHouseholds.length === 0
                  ? <span style={{ fontSize: 11, color: "var(--border-strong)" }}>Create a family first</span>
                  : <select value="" disabled={busy} onChange={e => { if (e.target.value) assignMember(m.id, e.target.value); }} style={{ width: 200, fontSize: 12 }}>
                      <option value="">Assign to family…</option>
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
