import { useState, useEffect } from "react";
import { supabase } from "../supabase";
import { tabsForRole, tabsForProfile, hasCustomTabs, TAB_ORDER, TAB_LABELS, TAB_ACCESS } from "../components";

// Descriptions are derived from TAB_ACCESS in components.jsx — never hand-written,
// so adding a tab can't leave this page silently out of date.
const ROLE_OPTIONS = [
  { value:"usher", label:"Usher", desc:tabsForRole("usher"), color:"#4caf82" },
  { value:"leadership", label:"Leadership", desc:tabsForRole("leadership"), color:"#a040c0" },
  { value:"celebrations", label:"Celebrations", desc:"Celebrations only", color:"#e07830" },
  { value:"admin", label:"Admin", desc:"Full access to everything", color:"#2a5357" },
];

function RolePill({ role }) {
  const opt = ROLE_OPTIONS.find(r => r.value === role) || { label: role, color: "#8a96b8" };
  return (
    <span style={{
      background: opt.color+"18", border:`1.5px solid ${opt.color}33`,
      color: opt.color, borderRadius:20, padding:"2px 10px",
      fontSize:12, fontWeight:700, display:"inline-block"
    }}>{opt.label}</span>
  );
}

// Per-user tab editor. Opens with whatever the user can currently see — their
// override if they have one, otherwise their role's default — so an admin is always
// editing from the live state rather than an empty box.
function TabAccessModal({ user, onSave, onReset, onClose, saving }) {
  const [picked, setPicked] = useState(() => new Set(tabsForProfile(user)));
  const roleDefault = TAB_ACCESS[user.role] || [];
  const custom = hasCustomTabs(user);
  const matchesRole =
    picked.size === roleDefault.length && roleDefault.every(t => picked.has(t));

  function toggle(key) {
    setPicked(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal fade-in" onClick={e=>e.stopPropagation()}>
        <h2>TAB ACCESS — {user.name.toUpperCase()}</h2>
        <div style={{fontSize:12, color:"#6b7280", marginBottom:14, lineHeight:1.7}}>
          Tick the tabs <strong style={{color:"#111827"}}>{user.name}</strong> should see.
          Leave them on the role default unless there's a reason not to.
        </div>
        <div style={{background:"#fffbf0", border:"1.5px solid #f5d88a", borderRadius:8, padding:"9px 12px", marginBottom:14, fontSize:11, color:"#8a6800", lineHeight:1.6}}>
          This controls <strong>navigation only</strong>. What a user may create, edit or
          delete is still governed by their role in the database.
        </div>

        <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))", gap:6, marginBottom:16}}>
          {TAB_ORDER.map(key => {
            const on = picked.has(key);
            const inRole = roleDefault.includes(key);
            return (
              <label key={key} style={{
                display:"flex", alignItems:"center", gap:7, fontSize:12, cursor:"pointer",
                background: on ? "#2a535712" : "#f7f9fb",
                border:`1px solid ${on ? "#2a535744" : "#e4e9f5"}`,
                borderRadius:8, padding:"7px 10px", color:"#374151",
              }}>
                <input type="checkbox" checked={on} onChange={()=>toggle(key)} />
                <span style={{fontWeight: on ? 600 : 400}}>{TAB_LABELS[key]}</span>
                {!inRole && on && (
                  <span title="Not part of this role's default set" style={{fontSize:10, color:"#e07830", fontWeight:700}}>+</span>
                )}
              </label>
            );
          })}
        </div>

        <div style={{fontSize:11, color:"#9ca3af", marginBottom:14}}>
          {picked.size === 0
            ? "No tabs selected — this user won't be able to see anything."
            : matchesRole
              ? `Matches the ${user.role} default.`
              : `${picked.size} tab${picked.size!==1?"s":""} selected · differs from the ${user.role} default.`}
        </div>

        <div style={{display:"flex", gap:10, flexWrap:"wrap"}}>
          <button className="btn-primary" style={{flex:1, minWidth:130}}
            onClick={()=>onSave([...picked])}
            disabled={saving || picked.size === 0}>
            {saving ? "Saving…" : "Save Tab Access"}
          </button>
          {custom && (
            <button className="btn-ghost" onClick={onReset} disabled={saving}>
              Reset to Role Default
            </button>
          )}
          <button className="btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

export default function UsersPage({ currentProfile }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [resetTarget, setResetTarget] = useState(null);
  const [tabTarget, setTabTarget] = useState(null);
  const [tabColumnMissing, setTabColumnMissing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data: profiles } = await supabase
      .from("user_profiles_with_login")
      .select("*")
      .order("role")
      .order("name");
    let flagMap = {};
    let tabMap = {};
    let missingTabColumn = false;
    // supabase-js RESOLVES with { data, error } instead of throwing, so a try/catch
    // around this catches nothing. If tab_access hasn't been migrated yet the whole
    // select fails — including require_2fa — so ask for it separately on failure.
    // Bundling them meant one missing column silently showed every account as
    // "Require 2FA: on", whatever the database actually said.
    const withTabs = await supabase.from("profiles").select("id, require_2fa, tab_access");
    if (withTabs.error) {
      missingTabColumn = true;
      const { data: flags } = await supabase.from("profiles").select("id, require_2fa");
      (flags || []).forEach(f => { flagMap[f.id] = f.require_2fa; });
    } else {
      (withTabs.data || []).forEach(f => { flagMap[f.id] = f.require_2fa; tabMap[f.id] = f.tab_access; });
    }
    setTabColumnMissing(missingTabColumn);
    setUsers((profiles || []).map(u => ({
      ...u,
      require_2fa: flagMap[u.id] !== false,
      tab_access: tabMap[u.id] || null,
    })));
    setLoading(false);
  }

  // Write an explicit tab list for one user. NULL means "inherit the role default",
  // which is what Reset sends — that way changing a role's defaults later still
  // reaches everyone who hasn't been customised.
  async function saveTabAccess(id, tabs) {
    setSaving(true);
    const { error: err } = await supabase.from("profiles").update({ tab_access: tabs }).eq("id", id);
    setSaving(false);
    if (err) {
      // The most likely cause by far is that the migration hasn't been run, and
      // Postgres's raw wording ("schema cache") doesn't hint at the fix.
      setError(
        /tab_access/.test(err.message)
          ? "Per-user tabs aren't set up on this database yet. Run supabase_migration_tab_access.sql in the Supabase SQL editor, then reload this page."
          : err.message
      );
      setTabTarget(null);
      return;
    }
    setUsers(prev => prev.map(u => u.id === id ? { ...u, tab_access: tabs } : u));
    setTabTarget(null);
    setSuccess(tabs ? "Tab access updated" : "Tab access reset to the role default");
    setTimeout(() => setSuccess(""), 3000);
  }

  async function toggle2fa(id, current) {
    const next = !current;
    await supabase.from("profiles").update({ require_2fa: next }).eq("id", id);
    setUsers(prev => prev.map(u => u.id === id ? { ...u, require_2fa: next } : u));
    setSuccess(next ? "Two-step verification now required for this user" : "Two-step verification made optional for this user");
    setTimeout(() => setSuccess(""), 3000);
  }

  async function deleteUser(id, name) {
    if (!confirm(`Delete account for ${name}? This cannot be undone.`)) return;
    await supabase.from("profiles").delete().eq("id", id);
    setUsers(prev => prev.filter(u => u.id !== id));
    setSuccess(`${name}'s account removed`);
  }

  async function changeRole(id, newRole) {
    await supabase.from("profiles").update({ role: newRole }).eq("id", id);
    setUsers(prev => prev.map(u => u.id === id ? { ...u, role: newRole } : u));
    setSuccess("Role updated");
    setTimeout(() => setSuccess(""), 3000);
  }

  async function sendReset(user) {
    setSaving(true);
    try {
      await supabase.auth.resetPasswordForEmail(user.email);
      setSuccess(`Password reset email sent to ${user.name}`);
      setResetTarget(null);
    } catch(e) { setError(e.message); }
    finally { setSaving(false); }
  }

  const groupedUsers = ROLE_OPTIONS.map(role => ({
    ...role,
    members: users.filter(u => u.role === role.value)
  }));

  return (
    <div className="fade-in">
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18}}>
        <div style={{fontFamily:"'Inter',sans-serif", color:"#111827", fontSize:14, letterSpacing:0.5, fontWeight:700}}>USER MANAGEMENT</div>
        <div style={{fontSize:12, color:"#9ca3af"}}>{users.length} users</div>
      </div>

      {success && <div className="success-msg" style={{marginBottom:14, fontSize:14, padding:"10px 14px", background:"#f0fff8", border:"1.5px solid #b0e8c8", borderRadius:8}}>{success}</div>}
      {error && <div className="error-msg" style={{marginBottom:14}}>{error}</div>}

      {/* Without the migration the Tabs editor looks usable but can't save, so say so
          up front rather than letting an admin find out by losing their work. */}
      {tabColumnMissing && (
        <div style={{background:"#fffbf0", border:"1.5px solid #f5d88a", borderRadius:10, padding:"12px 16px", marginBottom:20, fontSize:12, color:"#8a6800", lineHeight:1.7}}>
          <strong>Per-user tabs aren't enabled on this database yet.</strong> Run{" "}
          <code style={{background:"#0001",padding:"1px 5px",borderRadius:4}}>supabase_migration_tab_access.sql</code>{" "}
          in the Supabase SQL editor, then reload. Until then everyone uses their role's
          default tabs and the <strong>Tabs</strong> button can't save.
        </div>
      )}

      {/* How to add users */}
      <div style={{background:"#fffbf0", border:"1.5px solid #f5d88a", borderRadius:10, padding:"12px 16px", marginBottom:20, fontSize:12, color:"#8a6800", lineHeight:1.7}}>
        <strong>How to add users:</strong> Go to <strong>Supabase Dashboard → Authentication → Users → Add user</strong>,
        create them there, copy their UUID, then add a row to the <code style={{background:"#0001",padding:"1px 5px",borderRadius:4}}>profiles</code> table with their UUID, name, and role.
      </div>

      {/* Role descriptions */}
      <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))", gap:10, marginBottom:24}}>
        {ROLE_OPTIONS.map(r => (
          <div key={r.value} style={{background:r.color+"0a", border:`1.5px solid ${r.color}22`, borderRadius:10, padding:"10px 12px"}}>
            <div style={{fontWeight:700, fontSize:12, color:r.color, marginBottom:3}}>{r.label}</div>
            <div style={{fontSize:12, color:"#6b7280", lineHeight:1.7}}>{r.desc}</div>
          </div>
        ))}
      </div>
      <div style={{fontSize:11, color:"#9ca3af", marginTop:-16, marginBottom:22, lineHeight:1.7}}>
        These are the defaults for each role. Use <strong>Tabs</strong> on any user to give
        them a different set — anyone customised is flagged in their row.
      </div>

      {/* Users grouped by role */}
      {loading ? (
        <div style={{textAlign:"center", color:"#9ca3af", padding:30}}>Loading users…</div>
      ) : (
        groupedUsers.map(({ value, label, color, members: group }) => (
          <div key={value} style={{marginBottom:24}}>
            <div style={{fontSize:12, color:"#9ca3af", letterSpacing:0.8, textTransform:"uppercase", fontWeight:700, marginBottom:10, display:"flex", alignItems:"center", gap:8}}>
              <span style={{color}}>{label}</span>
              <span style={{color:"#e5e7eb"}}>({group.length})</span>
            </div>
            <div className="card" style={{padding:6}}>
              {group.length === 0 && (
                <div style={{padding:"12px 14px", color:"#d1d5db", fontSize:12}}>No {label.split(" ")[1]} users yet</div>
              )}
              {group.map(u => (
                <div key={u.id} className="user-row" style={{display:"flex", alignItems:"center", gap:12, padding:"12px 14px", borderBottom:"1px solid #f0f2f8", flexWrap:"wrap"}}>
                  <div style={{
                    width:38, height:38, borderRadius:"50%", flexShrink:0,
                    background:color+"22", border:`1.5px solid ${color}44`,
                    display:"flex", alignItems:"center", justifyContent:"center",
                    fontSize:14, fontFamily:"'Inter',sans-serif", color, fontWeight:700,
                  }}>
                    {u.name[0].toUpperCase()}
                  </div>
                  <div style={{flex:1, minWidth:150}}>
                    <div style={{fontWeight:700, fontSize:14, color:"#111827", display:"flex", alignItems:"center", gap:8}}>
                      {u.name}
                      {u.id === currentProfile.id && <span style={{fontSize:11, color:"#9ca3af", fontWeight:400}}>(you)</span>}
                    </div>
                    <div style={{fontSize:12, color:"#9ca3af", marginTop:2}}>
                      {u.last_sign_in_at ? `Last login: ${new Date(u.last_sign_in_at).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric",hour:"2-digit",minute:"2-digit"})}` : "Never logged in"}
                    </div>
                    {hasCustomTabs(u) && (
                      <div title={tabsForProfile(u).map(t=>TAB_LABELS[t]).join(", ")}
                        style={{fontSize:11, color:"#e07830", marginTop:3, fontWeight:600}}>
                        Custom tabs: {tabsForProfile(u).map(t=>TAB_LABELS[t]).join(", ")}
                      </div>
                    )}
                  </div>
                  <div className="user-controls" style={{display:"flex", alignItems:"center", gap:8, flexShrink:0}}>
                    <label title="When on, this user is forced to set up two-step verification at login" style={{display:"inline-flex", alignItems:"center", gap:5, fontSize:11, color:"#4a5568", cursor:"pointer"}}>
                      <input type="checkbox" checked={u.require_2fa} onChange={()=>toggle2fa(u.id, u.require_2fa)} />
                      Require 2FA
                    </label>
                    {u.id !== currentProfile.id && (
                      <select
                        value={u.role}
                        onChange={e => changeRole(u.id, e.target.value)}
                        style={{width:130, fontSize:12, padding:"4px 8px"}}>
                        {ROLE_OPTIONS.map(r=><option key={r.value} value={r.value}>{r.label}</option>)}
                      </select>
                    )}
                    <button className="btn-ghost" style={{fontSize:11}}
                      disabled={tabColumnMissing}
                      title={tabColumnMissing ? "Needs supabase_migration_tab_access.sql" : "Choose which tabs this user sees"}
                      onClick={()=>setTabTarget(u)}>Tabs</button>
                    <button className="btn-ghost" style={{fontSize:11}} onClick={()=>setResetTarget(u)}>Reset Password</button>
                    {u.id !== currentProfile.id && (
                      <button className="btn-danger" style={{fontSize:11}} onClick={()=>deleteUser(u.id, u.name)}>Delete</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      {/* Per-user tab access */}
      {tabTarget && (
        <TabAccessModal
          user={tabTarget}
          saving={saving}
          onSave={tabs => saveTabAccess(tabTarget.id, tabs)}
          onReset={() => saveTabAccess(tabTarget.id, null)}
          onClose={() => setTabTarget(null)}
        />
      )}

      {/* Reset password modal */}
      {resetTarget && (
        <div className="modal-bg" onClick={()=>setResetTarget(null)}>
          <div className="modal fade-in" onClick={e=>e.stopPropagation()}>
            <h2>RESET PASSWORD</h2>
            <div style={{fontSize:14, color:"#6b7280", marginBottom:16, lineHeight:1.7}}>
              A password reset email will be sent to <strong style={{color:"#111827"}}>{resetTarget.name}</strong>.
            </div>
            {error && <div className="error-msg">{error}</div>}
            <div style={{display:"flex", gap:10, marginTop:6}}>
              <button className="btn-primary" style={{flex:1}} onClick={()=>sendReset(resetTarget)} disabled={saving}>
                {saving ? "Sending…" : "Send Reset Email"}
              </button>
              <button className="btn-ghost" onClick={()=>setResetTarget(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
