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
import { Spinner, fullName, PhotoLightbox, MfaChallenge, SecurityModal, SetPasswordScreen, OnboardingFlow, ROLES } from "./components";
import { logoMark } from "./logoData";
import { AlertTriangle, Home, Users, ClipboardList, Camera, Tag, LayoutDashboard, PartyPopper, Zap, BarChart3, UserCog, ScrollText, Upload, ShieldCheck, LogOut } from "lucide-react";


export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mfaStatus, setMfaStatus] = useState("checking"); // checking | required | ok
  const [securityOpen, setSecurityOpen] = useState(false);
  const [recovery, setRecovery] = useState(false); // arrived via password-reset link
  const [needs2fa, setNeeds2fa] = useState(false); // logged in but no 2FA factor enrolled
  const [bootedElsewhere, setBootedElsewhere] = useState(false); // signed out because account used on another device
  const [warningVisible, setWarningVisible] = useState(false);
  const inactivityTimer = useRef(null);
  const warningTimer = useRef(null);
  const TIMEOUT_MS = 15 * 60 * 1000;  // 15 minutes
  const WARNING_MS = 13 * 60 * 1000;  // warn at 13 minutes (2 min before)

  const [tab, setTabState] = useState(() => {
    // Read from URL hash for persistence
    return window.location.hash.replace("#","") || "dashboard";
  });

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
      supabase.auth.signOut();
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
      proceedAfterAuth(session);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      if (event === "SIGNED_IN") claimSession();
      if (event === "PASSWORD_RECOVERY") { setRecovery(true); setLoading(false); return; }
      if (session) proceedAfterAuth(session);
      else { setProfile(null); setMembers([]); setServices([]); setAttendance({}); setMfaStatus("ok"); setLoading(false); }
    });
    return () => subscription.unsubscribe();
  }, []);

  // ---- Single active session ("last login wins") ----
  const SESSION_KEY = "rpjf_active_session";

  // Claim this device as the one active session for the account.
  async function claimSession() {
    try {
      setBootedElsewhere(false);
      const id = (crypto.randomUUID && crypto.randomUUID()) || String(Date.now()) + Math.random();
      localStorage.setItem(SESSION_KEY, id);
      await supabase.rpc("claim_session", { p_session: id });
    } catch (e) { /* if the column/function isn't present yet, silently no-op */ }
  }

  // Compare this device's stored session id against the one recorded in the DB.
  // If another device has since claimed the account, sign this one out.
  async function checkActiveSession() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const localId = localStorage.getItem(SESSION_KEY);
      if (!localId) return; // nothing to compare against yet
      const { data, error } = await supabase.from("profiles").select("active_session").eq("id", session.user.id).single();
      if (error || !data) return;
      if (data.active_session && data.active_session !== localId) {
        localStorage.removeItem(SESSION_KEY);
        setBootedElsewhere(true);
        await supabase.auth.signOut();
      }
    } catch (e) { /* best effort */ }
  }

  // Watcher: check on mount, when the tab regains focus, and every ~45s.
  useEffect(() => {
    if (!profile) return;
    checkActiveSession();
    const onVis = () => { if (document.visibilityState === "visible") checkActiveSession(); };
    document.addEventListener("visibilitychange", onVis);
    const iv = setInterval(checkActiveSession, 45000);
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
      // nextLevel "aal1" means no 2FA factor is enrolled at all → must enroll (mandatory)
      setNeeds2fa(!!data && data.nextLevel === "aal1");
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
    const [profileRes, membersRes, rolesRes, servicesRes, attRes, householdsRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).single(),
      supabase.from("members").select("*").order("last_name").order("first_name"),
      supabase.from("member_roles").select("*"),
      supabase.from("services").select("*").order("service_date", { ascending: false }),
      supabase.from("attendance").select("service_id, member_id"),
      supabase.from("households").select("*").order("name"),
    ]);
    const prof = profileRes.data;
    setProfile(prof);
    setHouseholds(householdsRes.data || []);
    if (prof?.role === "admin") {
      supabase.from("photo_submissions").select("id", { count: "exact", head: true }).eq("status", "pending")
        .then(({ count }) => setPendingPhotos(count || 0));
    }
    // Only set default tab if no hash is present in URL
    const currentHash = window.location.hash.replace("#","");
    const access = { admin:["dashboard"], leadership:["dashboard"], usher:["attendance"], celebrations:["celebrations"] };
    const TAB_ACCESS_CHECK = {
      admin:        ["dashboard","members","attendance","roles","households","celebrations","skills","analytics","users","photos","changelog","import"],
      leadership:   ["dashboard","members","attendance","roles","households","celebrations","skills","analytics"],
      usher:        ["attendance","households","celebrations"],
      celebrations: ["celebrations"],
    };
    const allowed = TAB_ACCESS_CHECK[prof?.role] || ["celebrations"];
    // Use hash tab if it's valid for this role, otherwise use default
    if (currentHash && allowed.includes(currentHash)) {
      setTabState(currentHash);
    } else {
      const defaultTab = (access[prof?.role] || ["celebrations"])[0];
      setTab(defaultTab);
    }
    const roleMap = {};
    (rolesRes.data||[]).forEach(r => { if (!ROLES.includes(r.role_name)) return; if (!roleMap[r.member_id]) roleMap[r.member_id]=[]; roleMap[r.member_id].push(r.role_name); });
    setMembers((membersRes.data||[]).map(m => ({ ...m, roles: roleMap[m.id]||[] })));
    // Count attendance per service for display
    const attCountMap = {};
    const attMap = {};
    (attRes.data||[]).forEach(a => {
      attCountMap[a.service_id] = (attCountMap[a.service_id]||0)+1;
      if (!attMap[a.service_id]) attMap[a.service_id] = [];
      attMap[a.service_id].push(a.member_id);
    });
    setServices((servicesRes.data||[]).map(s => ({ ...s, attendance_count: attCountMap[s.id]||0 })));
    setAttendance(attMap);
    setLoading(false);
  }

  async function logout() {
    await supabase.auth.signOut();
    setTab("members"); setMembers([]); setServices([]); setAttendance([]);
  }

  if (loading) return <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#f4f6fa"}}><Spinner /></div>;
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
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:12,color:"#6b7280",padding:20,textAlign:"center",background:"#f4f6fa"}}>
      <div style={{display:"flex",justifyContent:"center"}}><AlertTriangle size={28} color="#e0a020" /></div>
      <div style={{fontSize:14,color:"#111827",fontWeight:700}}>Account not fully set up</div>
      <div style={{fontSize:12,maxWidth:340,lineHeight:1.7}}>Your login works, but no profile was found. An admin needs to add you to the <code>profiles</code> table in Supabase.</div>
      <button className="btn-ghost" style={{marginTop:8}} onClick={logout}>Sign Out</button>
    </div>
  );

  // New (invited) accounts must set a password + 2FA before using the app.
  // Older accounts have onboarded=true (set in migration v13); if the column is
  // missing entirely (migration not yet run), onboarded is undefined and this is skipped.
  if (profile.onboarded === false) return <OnboardingFlow onComplete={handleOnboarded} onCancel={logout} />;
  // 2FA is mandatory for every account: anyone without a factor must enrol before continuing.
  if (needs2fa) return <OnboardingFlow requirePassword={false} onComplete={()=>setNeeds2fa(false)} onCancel={logout} />;
  const isAdmin = profile.role === "admin";
  const isLeadership = profile.role === "leadership";
  const isUsher = profile.role === "usher";
  const isCelebrations = profile.role === "celebrations";

  // Tab access per role
  const TAB_ACCESS = {
    admin:        ["dashboard","members","attendance","roles","households","celebrations","skills","analytics","users","photos","changelog","import"],
    leadership:   ["dashboard","members","attendance","roles","households","celebrations","skills","analytics"],
    usher:        ["attendance","households","celebrations"],
    celebrations: ["celebrations"],
  };
  const allowedTabs = TAB_ACCESS[profile.role] || ["celebrations"];

  const ALL_TABS = [
    { key:"dashboard",   label:"Home",         Icon: LayoutDashboard },
    { key:"members",     label:"Members",      Icon: Users },
    { key:"attendance",  label:"Attendance",   Icon: ClipboardList },
    { key:"photos",      label:"Photos",       Icon: Camera, badge: pendingPhotos },
    { key:"roles",       label:"Ministries",   Icon: Tag },
    { key:"households",  label:"Households",    Icon: Home },
    { key:"celebrations",label:"Celebrations", Icon: PartyPopper },
    { key:"skills",      label:"Skills",        Icon: Zap },
    { key:"analytics",   label:"Analytics",     Icon: BarChart3 },
    { key:"users",       label:"Users",         Icon: UserCog },
    { key:"changelog",   label:"Log",           Icon: ScrollText },
    { key:"import",      label:"Import",        Icon: Upload },
  ];
  const TABS = ALL_TABS.filter(t => allowedTabs.includes(t.key));

  return (
    <PhotoLightbox>
    <div style={{minHeight:"100vh",background:"#f9fafb"}}>
      {/* Header */}
      <div className="header-bar" style={{borderBottom:"1.5px solid #e4e9f5",padding:"0 24px",position:"sticky",top:0,background:"#2a5357",zIndex:50,boxShadow:"0 2px 8px #00000030"}}>
        <div style={{maxWidth:1200,margin:"0 auto"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",paddingTop:12,paddingBottom:6,gap:10}}>
            <div className="header-brand" style={{display:"flex",alignItems:"center",gap:12,minWidth:0}}>
              <img src={logoMark} alt="RPJF" style={{height:40,width:"auto",display:"block",flexShrink:0}} />
              <div style={{minWidth:0}}>
                <div className="brand-name" style={{fontFamily:"'Space Grotesk','Inter',sans-serif",fontSize:14,letterSpacing:0.2,color:"#ffffff",fontWeight:600}}>Righteousness Peace and Joy Fellowship</div>
                <div style={{fontSize:11,color:"#5edcd1",letterSpacing:0.3,fontWeight:500}}>Serving God By Families</div>
              </div>
            </div>
            <div className="header-actions" style={{display:"flex",alignItems:"center",gap:14,flexShrink:0}}>
              <div className="user-meta" style={{textAlign:"right"}}>
                <div style={{fontSize:12,fontWeight:700,color:"#ffffff"}}>{profile.name}</div>
                <div style={{fontSize:11,color:isAdmin?"#2a5357":"#4caf82",textTransform:"uppercase",letterSpacing:0.2,fontWeight:700}}>{profile.role}</div>
              </div>
              <button onClick={()=>setSecurityOpen(true)} title="Account security" style={{display:"inline-flex",alignItems:"center",gap:6,fontSize:11,background:"none",border:"1.5px solid #5edcd155",color:"#5edcd1",padding:"7px 12px",borderRadius:8,cursor:"pointer",fontFamily:"Inter,sans-serif",fontWeight:500,transition:"all 0.15s"}}><ShieldCheck size={13} /> <span className="btn-label">Security</span></button>
              <button onClick={logout} title="Sign out" style={{display:"inline-flex",alignItems:"center",gap:6,fontSize:11,background:"none",border:"1.5px solid #5edcd155",color:"#5edcd1",padding:"7px 14px",borderRadius:8,cursor:"pointer",fontFamily:"Inter,sans-serif",fontWeight:500,transition:"all 0.15s"}}><LogOut size={13} /> <span className="btn-label">Sign Out</span></button>
            </div>
          </div>
          <div className="tab-nav" style={{display:"flex",gap:0}}>
            {TABS.map(t=>(
              <a key={t.key} href={`#${t.key}`}
                className={`tab-btn ${tab===t.key?"active":""}`}
                onClick={e=>{e.preventDefault();setTab(t.key);}}
                style={{textDecoration:"none"}}>
                <t.Icon size={15} strokeWidth={2} />
                {t.label}
                {t.badge ? <span style={{marginLeft:2,background:"#e15700",color:"#fff",fontSize:10,fontWeight:700,borderRadius:10,padding:"1px 6px"}}>{t.badge}</span> : null}
              </a>
            ))}
          </div>
        </div>
      </div>

      {!isAdmin && (
        <div style={{
          background: isLeadership?"#a040c010":isUsher?"#4caf8210":isCelebrations?"#e0783010":"#8a96b810",
          borderBottom:`1.5px solid ${isLeadership?"#a040c033":isUsher?"#4caf8233":isCelebrations?"#e0783033":"#8a96b833"}`,
          padding:"8px 24px", fontSize:12, fontWeight:600,
          color: isLeadership?"#6020a0":isUsher?"#2a7a50":isCelebrations?"#a05010":"#5a6a8a",
        }}>
          {isLeadership && "Leadership access — you can view all member information and attendance."}
          {isUsher && "Usher access — you can take attendance, manage households, and view celebrations."}
          {isCelebrations && "Celebrations access — you can view birthdays and anniversaries."}
        </div>
      )}

      <div className="main-content" style={{maxWidth:1100,margin:"0 auto",padding:"24px"}}>
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
          />
        )}
        {tab==="attendance" && allowedTabs.includes("attendance") && (
          <AttendancePage
            profile={profile} members={members}
            services={services} setServices={setServices}
            attendance={attendance} setAttendance={setAttendance}
          />
        )}
        {tab==="roles" && allowedTabs.includes("roles") && (
          <RolesPage members={members} onMemberClick={m=>{ setTab("members"); }} />
        )}
        {tab==="households" && allowedTabs.includes("households") && (
          <HouseholdsPage
            profile={profile} members={members} setMembers={setMembers}
            households={households} setHouseholds={setHouseholds}
          />
        )}
        {tab==="celebrations" && allowedTabs.includes("celebrations") && (
          <CelebrationsPage members={members} onMemberClick={m=>{ allowedTabs.includes("members") && setTab("members"); }} />
        )}
        {tab==="skills" && allowedTabs.includes("skills") && (
          <SkillsPage members={members} onMemberClick={m=>{ allowedTabs.includes("members") && setTab("members"); }} />
        )}
        {tab==="analytics" && allowedTabs.includes("analytics") && (
          <AnalyticsPage members={members} services={services} attendance={attendance} households={households} />
        )}
        {tab==="users" && isAdmin && <UsersPage currentProfile={profile} />}
        {tab==="photos" && isAdmin && <PhotoRequestsPage profile={profile} members={members} setMembers={setMembers} setPendingPhotos={setPendingPhotos} />}
        {tab==="changelog" && isAdmin && <ChangelogPage />}
        {tab==="import" && isAdmin && <ImportPage profile={{...profile, id: session.user.id}} onImportComplete={loadAll.bind(null, session.user.id)} />}
      </div>
      {securityOpen && <SecurityModal onClose={()=>setSecurityOpen(false)} />}
    </div>
    </PhotoLightbox>
  );
}
