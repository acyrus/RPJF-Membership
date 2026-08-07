import { useState, useEffect, useRef, useCallback } from "react";
import "./styles.css";
import { supabase } from "./supabase";
import LoginPage from "./pages/LoginPage";
import MembersPage from "./pages/MembersPage";
import AttendancePage from "./pages/AttendancePage";
import RolesPage from "./pages/RolesPage";
import UsersPage from "./pages/UsersPage";
import CelebrationsPage from "./pages/CelebrationsPage";
import DashboardPage from "./pages/DashboardPage";
import SkillsPage from "./pages/SkillsPage";
import AnalyticsPage from "./pages/AnalyticsPage";
import ChangelogPage from "./pages/ChangelogPage";
import ImportPage from "./pages/ImportPage";
import HouseholdsPage from "./pages/HouseholdsPage";
import PhotoRequestsPage from "./pages/PhotoRequestsPage";
import UncapturedMembersPage from "./pages/UncapturedMembersPage";
import { Spinner, fullName, PhotoLightbox, MfaChallenge, SecurityModal, SetPasswordScreen, OnboardingFlow, ROLES, TAB_LABELS, tabsForProfile, defaultTabForProfile, useIsMobile } from "./components";
import { branding } from "./branding";
import { AlertTriangle, Home, Users, ClipboardList, Camera, Tag, LayoutDashboard, PartyPopper, Zap, BarChart3, UserCog, ScrollText, Upload, ShieldCheck, LogOut, ListChecks, Moon, Sun, Menu, X, PanelLeftClose, PanelLeftOpen } from "lucide-react";


export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mfaStatus, setMfaStatus] = useState("checking"); // checking | required | ok
  const [securityOpen, setSecurityOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);        // mobile nav drawer open
  const [navCollapsed, setNavCollapsed] = useState(false); // desktop sidebar collapsed to icons
  const isMobile = useIsMobile();
  const [headerH, setHeaderH] = useState(56);           // measured header height, for the sticky sidebar offset
  useEffect(() => {
    const measure = () => { const hb = document.querySelector(".header-bar"); if (hb) setHeaderH(Math.round(hb.getBoundingClientRect().height)); };
    measure();
    window.addEventListener("resize", measure);
    const id = setInterval(measure, 500); // header only appears after auth; keep re-measuring briefly
    const stop = setTimeout(() => clearInterval(id), 3000);
    return () => { window.removeEventListener("resize", measure); clearInterval(id); clearTimeout(stop); };
  }, []);
  const [recovery, setRecovery] = useState(false); // arrived via password-reset link
  const [passwordSet, setPasswordSet] = useState(false); // just set a password this session (invite/reset)
  const [needs2fa, setNeeds2fa] = useState(false); // logged in but no 2FA factor enrolled
  const [bootedElsewhere, setBootedElsewhere] = useState(false); // signed out because the account logged in on another device
  const [warningVisible, setWarningVisible] = useState(false);
  const inactivityTimer = useRef(null);
  const warningTimer = useRef(null);
  const prevUserId = useRef(null); // tracks who we're signed in as, to spot a GENUINE new login
  const lastClaimAt = useRef(0);   // when this device last claimed the session, for the boot grace window
  const TIMEOUT_MS = 15 * 60 * 1000;  // 15 minutes
  const WARNING_MS = 13 * 60 * 1000;  // warn at 13 minutes (2 min before)

  const [tab, setTabState] = useState(() => {
    // Read from URL hash for persistence
    return window.location.hash.replace("#","") || "dashboard";
  });
  // When a member is clicked on another tab, jump to Members and open that person.
  const [focusMemberId, setFocusMemberId] = useState(null);
  function goToMember(m) {
    if (!allowedTabs.includes("members")) return;
    setFocusMemberId(m.id);
    setTab("members");
  }

  // Manual dark mode. The initial class is set before paint by the inline script in
  // index.html (reads localStorage "rpjf_theme"); this state just mirrors it for the
  // toggle icon. toggleDark flips the class on <html> and persists the choice.
  const [dark, setDark] = useState(() =>
    typeof document !== "undefined" && document.documentElement.classList.contains("dark"));
  function toggleDark() {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    try { localStorage.setItem("rpjf_theme", next ? "dark" : "light"); } catch (e) {}
    setDark(next);
  }

  function setTab(newTab) {
    window.location.hash = newTab;
    setTabState(newTab);
  }

  // Auto-logout on inactivity
  const resetTimers = useCallback(() => {
    setWarningVisible(false);
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    if (warningTimer.current) clearTimeout(warningTimer.current);
    if (!session) return;
    warningTimer.current = setTimeout(() => setWarningVisible(true), WARNING_MS);
    inactivityTimer.current = setTimeout(() => {
      supabase.auth.signOut({ scope: "local" }); // this device only, don't revoke other sessions
      setWarningVisible(false);
    }, TIMEOUT_MS);
  }, [session, TIMEOUT_MS, WARNING_MS]);

  useEffect(() => {
    if (!session) { setWarningVisible(false); return; }
    const events = ["mousemove","mousedown","keypress","touchstart","scroll","click"];
    events.forEach(e => window.addEventListener(e, resetTimers, { passive: true }));
    resetTimers();
    return () => {
      events.forEach(e => window.removeEventListener(e, resetTimers));
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
      if (warningTimer.current) clearTimeout(warningTimer.current);
    };
  }, [session, resetTimers]);

  // Listen for browser back/forward navigation
  useEffect(() => {
    function onHashChange() {
      const hashTab = window.location.hash.replace("#","");
      if (hashTab) setTabState(hashTab);
    }
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);
  const [members, setMembers] = useState([]);
  const [services, setServices] = useState([]);
  const [households, setHouseholds] = useState([]);
  const [pendingPhotos, setPendingPhotos] = useState(0);
  const [attendance, setAttendance] = useState({}); // { serviceId: [memberId, ...] }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      prevUserId.current = session?.user?.id || null; // seed so a restored session isn't seen as a new login
      proceedAfterAuth(session);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      const uid = session?.user?.id || null;
      // Claim the single-session slot ONLY on a genuine new login: SIGNED_IN for a user we
      // weren't already signed in as. supabase-js also re-fires SIGNED_IN on tab focus and
      // token refresh (same uid), and a reload fires INITIAL_SESSION — none of those should
      // re-claim, or an older device would keep stealing the slot back from the newest login.
      if (event === "SIGNED_IN" && uid && uid !== prevUserId.current) claimSession();
      prevUserId.current = uid;
      if (event === "PASSWORD_RECOVERY") { setRecovery(true); setLoading(false); return; }
      // A password change (updateUser) fires USER_UPDATED for the SAME account. Re-running
      // the full post-auth load here flips `loading` on and remounts the onboarding flow
      // mid-step, bouncing a just-created user back to the password screen. Nothing about
      // the account identity changed, so skip it — the session is already refreshed above.
      if (event === "USER_UPDATED") return;
      if (session) proceedAfterAuth(session);
      else { setProfile(null); setMembers([]); setServices([]); setAttendance({}); setMfaStatus("ok"); setLoading(false); }
    });
    return () => subscription.unsubscribe();
  }, []);

  // ---- Single active session ("last login wins") ----
  // Each device stores a random session id and records it as the account's active_session
  // on login (claim_session). A watcher then compares this device's id against the DB; if a
  // newer login has claimed the account, this (older) device signs itself out. Backed by
  // profiles.active_session + claim_session() from supabase_migration_single_session.sql.
  const SESSION_KEY = "rpjf_active_session";

  // Claim this device as the one active session for the account.
  async function claimSession() {
    try {
      setBootedElsewhere(false);
      // Reuse this browser's existing id across reloads/re-logins so the same user on the
      // same device never kicks themselves; only mint one the first time. A genuinely
      // different device has no stored id, generates a new one, and wins.
      let id = localStorage.getItem(SESSION_KEY);
      if (!id) {
        id = (crypto.randomUUID && crypto.randomUUID()) || String(Date.now()) + Math.random();
        localStorage.setItem(SESSION_KEY, id);
      }
      lastClaimAt.current = Date.now(); // open the grace window from the moment we start claiming
      await supabase.rpc("claim_session", { p_session: id });
    } catch (e) { /* if the column/function isn't present, silently no-op */ }
  }

  // Compare this device's stored id against the DB. If another device has since claimed the
  // account, sign this one out and flag it so the login screen can explain why.
  async function checkActiveSession() {
    try {
      // Never boot ourselves right after our own claim: the claim_session write may not
      // have landed yet, so a check that races it would read the PREVIOUS device's id and
      // sign this (newly-logged-in) device out. An older device claimed long ago, so its
      // grace window is well expired and it still boots correctly when a newer login wins.
      if (Date.now() - lastClaimAt.current < 15000) return;
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const localId = localStorage.getItem(SESSION_KEY);
      if (!localId) return; // nothing to compare against yet
      const { data, error } = await supabase.from("profiles").select("active_session").eq("id", session.user.id).single();
      if (error || !data) return;
      if (data.active_session && data.active_session !== localId) {
        localStorage.removeItem(SESSION_KEY);
        setBootedElsewhere(true);
        // LOCAL scope is essential: a global signOut here revokes the account's tokens on
        // EVERY device, so this booted device would also drop the newer login that just
        // claimed the session. Local signs out only this (older) device.
        await supabase.auth.signOut({ scope: "local" });
      }
    } catch (e) { /* best effort */ }
  }

  // Watcher: check on mount, when the tab regains focus, and every ~30s.
  useEffect(() => {
    if (!profile) return;
    checkActiveSession();
    const onVis = () => { if (document.visibilityState === "visible") checkActiveSession(); };
    document.addEventListener("visibilitychange", onVis);
    const iv = setInterval(checkActiveSession, 30000);
    return () => { document.removeEventListener("visibilitychange", onVis); clearInterval(iv); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  // After a session exists, check whether the account still owes a 2FA step.
  // currentLevel aal1 + nextLevel aal2 means: has 2FA enabled but hasn't verified yet.
  async function proceedAfterAuth(session) {
    if (!session) { setMfaStatus("ok"); setNeeds2fa(false); setLoading(false); return; }
    try {
      const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (data && data.currentLevel === "aal1" && data.nextLevel === "aal2") {
        // has 2FA enrolled but hasn't verified this session yet → challenge
        setMfaStatus("required");
        setLoading(false);
        return;
      }
      // nextLevel "aal1" means no 2FA factor is enrolled at all.
      // Force enrollment ONLY if this account still requires 2FA (admin can exempt per user).
      let force = !!data && data.nextLevel === "aal1";
      if (force) {
        try {
          const { data: prof } = await supabase.from("profiles").select("require_2fa").eq("id", session.user.id).single();
          if (prof && prof.require_2fa === false) force = false;
        } catch (e) { /* column missing or query failed → default to requiring 2FA */ }
      }
      setNeeds2fa(force);
    } catch (e) { setNeeds2fa(false); /* if the AAL check fails, load normally */ }
    setMfaStatus("ok");
    loadAll(session.user.id);
  }

  function handleMfaVerified() {
    setMfaStatus("ok");
    setNeeds2fa(false);
    setLoading(true);
    if (session) loadAll(session.user.id);
  }

  function handlePasswordSet() {
    setRecovery(false);
    setPasswordSet(true); // so a brand-new invited account doesn't get asked for a password
                          // AGAIN in onboarding (Supabase rejects reusing the same one)
    setLoading(true);
    if (session) proceedAfterAuth(session);
    else setLoading(false);
  }

  async function handleOnboarded() {
    try { await supabase.rpc("complete_onboarding"); } catch (e) { /* best effort */ }
    setNeeds2fa(false);
    setProfile(p => p ? { ...p, onboarded: true } : p);
  }

  async function loadAll(userId) {
    const [profileRes, membersRes, rolesRes, servicesRes, householdsRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).single(),
      supabase.from("members").select("*").order("last_name").order("first_name"),
      supabase.from("member_roles").select("*"),
      supabase.from("services").select("*").order("service_date", { ascending: false }),
      supabase.from("households").select("*").order("name"),
    ]);
    // A single Supabase select returns at most 1000 rows, and a church's attendance
    // easily exceeds that (it's the whole history). Page through it so counts and the
    // in-memory map are complete — otherwise most service cards read 0 and a background
    // reload blanks the open session.
    const allAtt = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from("attendance").select("service_id, member_id").range(from, from + 999);
      if (error || !data || data.length === 0) break;
      allAtt.push(...data);
      if (data.length < 1000) break;
    }
    const prof = profileRes.data;
    setProfile(prof);
    setHouseholds(householdsRes.data || []);
    // Anyone who can reach the Photos tab gets the pending badge, not just admins —
    // ushers can review submissions now, and a queue you can't see is a queue nobody clears.
    if (tabsForProfile(prof).includes("photos")) {
      supabase.from("photo_submissions").select("id", { count: "exact", head: true }).eq("status", "pending")
        .then(({ count }) => setPendingPhotos(count || 0));
    }
    // Only set default tab if no hash is present in URL.
    // Tabs come from the profile, not the role directly: an admin may have set a
    // per-user override in profiles.tab_access, which falls back to the role default.
    const currentHash = window.location.hash.replace("#","");
    const allowed = tabsForProfile(prof);
    // Use hash tab if this user may see it, otherwise use their landing tab
    if (currentHash && allowed.includes(currentHash)) {
      setTabState(currentHash);
    } else {
      setTab(defaultTabForProfile(prof));
    }
    const roleMap = {};
    const posMap = {}; // member_id -> { role_name: "Leader"/"Co-Leader" }
    (rolesRes.data||[]).forEach(r => {
      if (!ROLES.includes(r.role_name)) return;
      if (!roleMap[r.member_id]) roleMap[r.member_id]=[];
      roleMap[r.member_id].push(r.role_name);
      if (r.position) (posMap[r.member_id] = posMap[r.member_id] || {})[r.role_name] = r.position;
    });
    setMembers((membersRes.data||[]).map(m => ({ ...m, roles: roleMap[m.id]||[], rolePositions: posMap[m.id]||{} })));
    // Count attendance per service for display
    const attCountMap = {};
    const attMap = {};
    allAtt.forEach(a => {
      attCountMap[a.service_id] = (attCountMap[a.service_id]||0)+1;
      if (!attMap[a.service_id]) attMap[a.service_id] = [];
      attMap[a.service_id].push(a.member_id);
    });
    setServices((servicesRes.data||[]).map(s => ({ ...s, attendance_count: attCountMap[s.id]||0 })));
    setAttendance(attMap);
    setLoading(false);
  }

  async function logout() {
    localStorage.removeItem(SESSION_KEY); // deliberate sign-out shouldn't leave a stale claim
    await supabase.auth.signOut({ scope: "local" }); // sign out this device only, not every session
    setTab("members"); setMembers([]); setServices([]); setAttendance([]);
  }

  if (loading) return (
    <div style={{minHeight:"100dvh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:22,background:"var(--bg-body)",padding:24,textAlign:"center"}}>
      <img src={branding.logo.full} alt={branding.fullName} style={{width:"min(340px, 82vw)",height:"auto",display:"block"}} />
      <div style={{fontSize:13,color:"var(--text-muted)",fontWeight:500}}>{branding.motto}</div>
      <div><Spinner /></div>
    </div>
  );
  if (recovery) return <SetPasswordScreen onDone={handlePasswordSet} onCancel={logout} />;
  if (!session) return (
    <>
      {bootedElsewhere && (
        <div style={{position:"fixed",top:0,left:0,right:0,zIndex:100,background:"#fbeaea",color:"#a12b2b",borderBottom:"1.5px solid #eecccc",padding:"10px 16px",fontSize:13,textAlign:"center",fontWeight:600}}>
          You were signed out because this account was used to sign in on another device.
        </div>
      )}
      <LoginPage />
    </>
  );
  if (mfaStatus === "required") return <MfaChallenge onVerified={handleMfaVerified} onCancel={logout} />;
  if (!profile) return (
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:12,color:"var(--text-muted)",padding:20,textAlign:"center",background:"var(--panel)"}}>
      <div style={{display:"flex",justifyContent:"center"}}><AlertTriangle size={28} color="#e0a020" /></div>
      <div style={{fontSize:14,color:"var(--text)",fontWeight:700}}>Account not fully set up</div>
      <div style={{fontSize:12,maxWidth:340,lineHeight:1.7}}>Your login works, but no profile was found. An admin needs to add you to the <code>profiles</code> table in Supabase.</div>
      <button className="btn-ghost" style={{marginTop:8}} onClick={logout}>Sign Out</button>
    </div>
  );

  // New (invited) accounts must set a password + 2FA before using the app.
  // Older accounts have onboarded=true (set in migration v13); if the column is
  // missing entirely (migration not yet run), onboarded is undefined and this is skipped.
  if (profile.onboarded === false) return <OnboardingFlow requirePassword={!passwordSet} onPasswordSet={() => setPasswordSet(true)} require2fa={profile.require_2fa !== false} onComplete={handleOnboarded} onCancel={logout} />;
  // 2FA is mandatory for every account: anyone without a factor must enrol before continuing.
  if (needs2fa) return <OnboardingFlow requirePassword={false} onComplete={()=>setNeeds2fa(false)} onCancel={logout} />;
  const isAdmin = profile.role === "admin";
  const isLeadership = profile.role === "leadership";
  const isUsher = profile.role === "usher";
  const isCelebrations = profile.role === "celebrations";

  // Tab access lives in components.jsx so the nav here and the Users page can never
  // disagree. tabsForProfile applies the admin's per-user override when one is set,
  // and otherwise returns the role default from TAB_ACCESS.
  const allowedTabs = tabsForProfile(profile);

  // Labels come from TAB_LABELS; this list only adds the icon and any badge.
  const ALL_TABS = [
    { key:"dashboard",   Icon: LayoutDashboard },
    { key:"members",     Icon: Users },
    { key:"attendance",  Icon: ClipboardList },
    { key:"uncaptured",  Icon: ListChecks },
    { key:"photos",      Icon: Camera, badge: pendingPhotos },
    { key:"roles",       Icon: Tag },
    { key:"households",  Icon: Home },
    { key:"celebrations",Icon: PartyPopper },
    { key:"skills",      Icon: Zap },
    { key:"analytics",   Icon: BarChart3 },
    { key:"users",       Icon: UserCog },
    { key:"changelog",   Icon: ScrollText },
    { key:"import",      Icon: Upload },
  ].map(t => ({ ...t, label: TAB_LABELS[t.key] }));
  const TABS = ALL_TABS.filter(t => allowedTabs.includes(t.key));

  // Vertical nav item list, shared by the desktop sidebar and the mobile drawer.
  const navList = (drawer) => {
    const showLabels = drawer || !navCollapsed;
    return TABS.map(t => {
      const active = tab === t.key;
      return (
        <a key={t.key} href={`#${t.key}`} title={t.label}
          onClick={e=>{e.preventDefault();setTab(t.key);setNavOpen(false);}}
          onMouseEnter={e=>{ if(!active) e.currentTarget.style.background="var(--surface-alt)"; }}
          onMouseLeave={e=>{ if(!active) e.currentTarget.style.background="transparent"; }}
          style={{display:"flex",alignItems:"center",gap:12,padding:"10px 12px",borderRadius:10,textDecoration:"none",
            color:active?"#fff":"var(--text-2)",background:active?"var(--brand)":"transparent",
            fontSize:13,fontWeight:600,marginBottom:2,whiteSpace:"nowrap",overflow:"hidden",
            justifyContent: showLabels ? "flex-start" : "center"}}>
          <span style={{position:"relative",display:"flex",flexShrink:0}}>
            <t.Icon size={17} strokeWidth={2} />
            {t.badge && !showLabels ? <span style={{position:"absolute",top:-4,right:-6,minWidth:8,height:8,borderRadius:8,background:"#e15700"}} /> : null}
          </span>
          {showLabels && <span style={{flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis"}}>{t.label}</span>}
          {t.badge && showLabels ? <span style={{background:"#e15700",color:"#fff",fontSize:10,fontWeight:700,borderRadius:10,padding:"1px 6px"}}>{t.badge}</span> : null}
        </a>
      );
    });
  };

  return (
    <PhotoLightbox>
    <div style={{minHeight:"100vh",background:"var(--surface-alt)"}}>
      {/* Header */}
      <div className="header-bar" style={{borderBottom:"1.5px solid var(--border-navy)",padding:"0 24px",position:"sticky",top:0,background:"var(--brand)",zIndex:50,boxShadow:"0 2px 8px #00000030"}}>
        <div style={{width:"100%"}}>
          {(() => {
            const navToggle = (
              <button onClick={()=> isMobile ? setNavOpen(true) : setNavCollapsed(c=>!c)} title="Toggle navigation" aria-label="Toggle navigation" style={{display:"inline-flex",alignItems:"center",justifyContent:"center",background:"none",border:"1.5px solid #5edcd155",color:"var(--brand-accent)",padding:"7px 9px",borderRadius:8,cursor:"pointer",flexShrink:0}}>{isMobile ? <Menu size={17}/> : (navCollapsed ? <PanelLeftOpen size={17}/> : <PanelLeftClose size={17}/>)}</button>
            );
            const brand = (
              <div className="header-brand" style={{display:"flex",alignItems:"center",gap:12,minWidth:0}}>
                <img src={branding.logo.mark} alt={branding.shortName} style={{height:40,width:"auto",display:"block",flexShrink:0}} />
                <div style={{minWidth:0}}>
                  <div className="brand-name" style={{fontFamily:"'Space Grotesk','Inter',sans-serif",fontSize:14,letterSpacing:0.2,color:"#ffffff",fontWeight:600,lineHeight:1.25}}>{branding.fullName}</div>
                  <div style={{fontSize:11,color:"var(--brand-accent)",letterSpacing:0.3,fontWeight:500,marginTop:2}}>{branding.motto}</div>
                </div>
              </div>
            );
            const headerActions = (
              <div className="header-actions" style={{display:"flex",alignItems:"center",gap:14,flexShrink:0}}>
                <div className="user-meta" style={{textAlign:"right"}}>
                  <div style={{fontSize:12,fontWeight:700,color:"#ffffff"}}>{profile.name}</div>
                  <div style={{fontSize:11,color:isAdmin?"#2a5357":"#4caf82",textTransform:"uppercase",letterSpacing:0.2,fontWeight:700}}>{profile.role}</div>
                </div>
                <button onClick={toggleDark} title={dark?"Switch to light mode":"Switch to dark mode"} aria-label={dark?"Switch to light mode":"Switch to dark mode"} style={{display:"inline-flex",alignItems:"center",justifyContent:"center",background:"none",border:"1.5px solid #5edcd155",color:"var(--brand-accent)",padding:"7px 9px",borderRadius:8,cursor:"pointer",transition:"all 0.15s"}}>{dark ? <Sun size={13} /> : <Moon size={13} />}</button>
                <button onClick={()=>setSecurityOpen(true)} title="Account security" style={{display:"inline-flex",alignItems:"center",gap:6,fontSize:11,background:"none",border:"1.5px solid #5edcd155",color:"var(--brand-accent)",padding:"7px 12px",borderRadius:8,cursor:"pointer",fontFamily:"Inter,sans-serif",fontWeight:500,transition:"all 0.15s"}}><ShieldCheck size={13} /> <span className="btn-label">Security</span></button>
                <button onClick={logout} title="Sign out" style={{display:"inline-flex",alignItems:"center",gap:6,fontSize:11,background:"none",border:"1.5px solid #5edcd155",color:"var(--brand-accent)",padding:"7px 14px",borderRadius:8,cursor:"pointer",fontFamily:"Inter,sans-serif",fontWeight:500,transition:"all 0.15s"}}><LogOut size={13} /> <span className="btn-label">Sign Out</span></button>
              </div>
            );
            return isMobile ? (
              <div style={{padding:"10px 0 12px"}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10}}>
                  {navToggle}
                  {headerActions}
                </div>
                <div style={{marginTop:12}}>{brand}</div>
              </div>
            ) : (
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",paddingTop:12,paddingBottom:12,gap:10}}>
                <div style={{display:"flex",alignItems:"center",gap:10,minWidth:0}}>{navToggle}{brand}</div>
                {headerActions}
              </div>
            );
          })()}
        </div>
      </div>

      {!isAdmin && (
        <div style={{
          background: isLeadership?"#a040c010":isUsher?"#4caf8210":isCelebrations?"#e0783010":"#8a96b810",
          borderBottom:`1.5px solid ${isLeadership?"#a040c033":isUsher?"#4caf8233":isCelebrations?"#e0783033":"#8a96b833"}`,
          padding:"8px 24px", fontSize:12, fontWeight:600,
          color: isLeadership?"#6020a0":isUsher?"#2a7a50":isCelebrations?"#a05010":"#5a6a8a",
        }}>
          {/* Derived from the tabs this account actually has, so it can't drift out of
              date the way the hand-written usher line did, that still promised only
              attendance, households and celebrations after Uncaptured Members and Photos were added. */}
          {isLeadership && "Leadership access, "}
          {isUsher && "Usher access, "}
          {isCelebrations && "Celebrations access, "}
          {`you can reach ${allowedTabs.map(t => TAB_LABELS[t]).join(", ")}.`}
        </div>
      )}

      <div style={{display:"flex"}}>
        {!isMobile && (
          <nav style={{width:navCollapsed?60:216,flexShrink:0,position:"sticky",top:headerH,alignSelf:"flex-start",height:`calc(100dvh - ${headerH}px)`,overflowY:"auto",background:"var(--surface)",borderRight:"1px solid var(--border)",padding:"12px 8px",transition:"width 0.15s"}}>
            {navList(false)}
          </nav>
        )}
        <div style={{flex:1,minWidth:0}}>
      <div className="main-content" style={{padding:"24px"}}>
        {tab==="dashboard" && allowedTabs.includes("dashboard") && (
          <DashboardPage
            profile={profile}
            members={members}
            services={services}
            attendance={attendance}
            households={households}
            setTab={setTab}
            activityLog={[]}
          />
        )}
        {tab==="members" && allowedTabs.includes("members") && (
          <MembersPage
            profile={profile} members={members} setMembers={setMembers}
            households={households} setHouseholds={setHouseholds}
            services={services} attendance={attendance}
            focusMemberId={focusMemberId} onFocusHandled={()=>setFocusMemberId(null)}
          />
        )}
        {tab==="attendance" && allowedTabs.includes("attendance") && (
          <AttendancePage
            profile={profile} members={members} households={households}
            services={services} setServices={setServices}
            attendance={attendance} setAttendance={setAttendance}
          />
        )}
        {tab==="uncaptured" && allowedTabs.includes("uncaptured") && (
          <UncapturedMembersPage members={members} />
        )}
        {tab==="roles" && allowedTabs.includes("roles") && (
          <RolesPage members={members} households={households} profile={profile} setMembers={setMembers} onMemberClick={goToMember} />
        )}
        {tab==="households" && allowedTabs.includes("households") && (
          <HouseholdsPage
            profile={profile} members={members} setMembers={setMembers}
            households={households} setHouseholds={setHouseholds}
            onMemberClick={goToMember}
          />
        )}
        {tab==="celebrations" && allowedTabs.includes("celebrations") && (
          <CelebrationsPage members={members} onMemberClick={goToMember} />
        )}
        {tab==="skills" && allowedTabs.includes("skills") && (
          <SkillsPage members={members} households={households} onMemberClick={goToMember} />
        )}
        {tab==="analytics" && allowedTabs.includes("analytics") && (
          <AnalyticsPage members={members} services={services} attendance={attendance} households={households} setMembers={setMembers} profile={profile} />
        )}
        {/* These four were gated on isAdmin while every other tab checks allowedTabs.
            That made the nav and the page disagree: an usher given Photos saw the tab
            and the pending badge, then a blank page. Any tab reachable from the nav, 
            role default or per-user override, must render here, so the gate has to be
            the same list the nav is built from. Writes are still governed by RLS. */}
        {tab==="users" && allowedTabs.includes("users") && <UsersPage currentProfile={profile} />}
        {tab==="photos" && allowedTabs.includes("photos") && <PhotoRequestsPage profile={profile} members={members} setMembers={setMembers} setPendingPhotos={setPendingPhotos} />}
        {tab==="changelog" && allowedTabs.includes("changelog") && <ChangelogPage />}
        {tab==="import" && allowedTabs.includes("import") && <ImportPage profile={{...profile, id: session.user.id}} members={members} onImportComplete={loadAll.bind(null, session.user.id)} />}
      </div>
        </div>
      </div>

      {/* Mobile nav drawer */}
      {isMobile && navOpen && (
        <>
          <div onClick={()=>setNavOpen(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",zIndex:300}} />
          <nav className="fade-in" style={{position:"fixed",top:0,left:0,height:"100dvh",width:264,maxWidth:"85vw",background:"var(--surface)",zIndex:301,boxShadow:"4px 0 24px #00000026",overflowY:"auto",padding:"14px 10px"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10,padding:"0 4px"}}>
              <span style={{fontSize:13,fontWeight:700,color:"var(--text)"}}>Menu</span>
              <button onClick={()=>setNavOpen(false)} aria-label="Close menu" style={{background:"none",border:"1px solid var(--border)",borderRadius:8,width:30,height:30,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",color:"var(--text-muted)"}}><X size={15}/></button>
            </div>
            {navList(true)}
          </nav>
        </>
      )}

      {securityOpen && <SecurityModal onClose={()=>setSecurityOpen(false)} />}
    </div>
    </PhotoLightbox>
  );
}
