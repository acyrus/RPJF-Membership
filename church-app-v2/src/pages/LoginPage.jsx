import { useState, useEffect } from "react";
import { supabase } from "../supabase";
import { logoFull } from "../logoData";

// ── Failed-login lockout (per email, persisted on the device) ──
const LOCK_PREFIX = "rpjf_lock_";
const FREE_ATTEMPTS = 5;          // no lock for the first 5 misses
const BASE_LOCK = 30;             // seconds after the 5th miss
const MAX_LOCK = 300;             // cap each lock at 5 minutes
const DECAY_MS = 15 * 60 * 1000;  // forget the streak 15 min after a lock clears

function readLock(email) {
  try {
    const raw = localStorage.getItem(LOCK_PREFIX + (email || "").trim().toLowerCase());
    return raw ? JSON.parse(raw) : { attempts: 0, lockUntil: 0 };
  } catch { return { attempts: 0, lockUntil: 0 }; }
}
function writeLock(email, state) {
  try { localStorage.setItem(LOCK_PREFIX + (email || "").trim().toLowerCase(), JSON.stringify(state)); } catch {}
}
function clearLockFor(email) {
  try { localStorage.removeItem(LOCK_PREFIX + (email || "").trim().toLowerCase()); } catch {}
}
// 30s, then doubling each further miss: 30, 60, 120, 240, capped at 300
function lockSeconds(attempts) {
  if (attempts < FREE_ATTEMPTS) return 0;
  return Math.min(BASE_LOCK * Math.pow(2, attempts - FREE_ATTEMPTS), MAX_LOCK);
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetMsg, setResetMsg] = useState("");
  const [lockUntil, setLockUntil] = useState(0);
  const [, setTick] = useState(0); // forces the countdown to re-render each second

  // Reflect the saved lock for whatever email is currently typed.
  useEffect(() => { setLockUntil(readLock(email).lockUntil || 0); }, [email]);

  // Tick once a second while a lock is active.
  useEffect(() => {
    if (!lockUntil) return;
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [lockUntil]);

  const remaining = lockUntil ? Math.max(0, Math.ceil((lockUntil - Date.now()) / 1000)) : 0;
  const locked = remaining > 0;

  async function handleSubmit(e) {
    e.preventDefault();
    if (locked) return;
    setError(""); setResetMsg(""); setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      // load the streak, decaying it if the last lock cleared a while ago
      let st = readLock(email);
      if (st.lockUntil && Date.now() > st.lockUntil + DECAY_MS) st = { attempts: 0, lockUntil: 0 };
      const attempts = (st.attempts || 0) + 1;
      const secs = lockSeconds(attempts);
      const until = secs ? Date.now() + secs * 1000 : 0;
      writeLock(email, { attempts, lockUntil: until });
      setLockUntil(until);
      if (secs) {
        setError(`Too many incorrect attempts. Please wait ${secs} second${secs === 1 ? "" : "s"} before trying again.`);
      } else {
        const left = FREE_ATTEMPTS - attempts;
        setError(`Incorrect email or password.${left <= 2 && left > 0 ? ` ${left} attempt${left === 1 ? "" : "s"} left before a temporary lock.` : ""}`);
      }
    } else {
      clearLockFor(email);
    }
    setLoading(false);
  }

  async function handleForgot() {
    setError(""); setResetMsg("");
    if (!email) { setError("Enter your email address above first, then tap “Forgot password?”"); return; }
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
    if (error) setError(error.message);
    else setResetMsg("If that email has an account, a reset link is on its way. Open it to set a new password.");
  }

  return (
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:20,background:"#f9fafb",position:"relative",overflow:"hidden"}}>
      <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",pointerEvents:"none",zIndex:0}}>
        <img src={logoFull} alt="" style={{width:"75%",maxWidth:700,opacity:0.06,userSelect:"none"}} />
      </div>
      <div style={{width:"100%",maxWidth:400}}>
        <div style={{textAlign:"center",marginBottom:36}}>
          <div style={{width:64,height:64,borderRadius:18,margin:"0 auto 16px",background:"#2a5357",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 4px 16px #2a535730"}}><svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="11" y="2" width="6" height="24" rx="2" fill="white"/><rect x="2" y="9" width="24" height="6" rx="2" fill="white"/></svg></div>
          <div style={{fontFamily:"'Inter',sans-serif",fontSize:22,letterSpacing:0.2,color:"#111827",fontWeight:700}}>RPJF MEMBERSHIP</div>
          <div style={{fontSize:12,color:"#9ca3af",marginTop:4,letterSpacing:0.3,fontWeight:500}}>Membership Management System</div>
        </div>
        <div className="card" style={{padding:36,boxShadow:'0 8px 32px rgba(0,0,0,0.10)',border:'1px solid #e5e7eb'}}>
          <div style={{fontFamily:"'Inter',sans-serif",fontSize:14,color:"#2a5357",letterSpacing:0.2,marginBottom:22,textAlign:"center",fontWeight:600}}>SIGN IN</div>
          <form onSubmit={handleSubmit}>
            <div className="field-group">
              <label className="field-label">Email Address</label>
              <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="your@email.com" autoComplete="email" required />
            </div>
            <div className="field-group">
              <label className="field-label">Password</label>
              <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" required />
            </div>
            {error && <div className="error-msg">{error}</div>}
            {locked && (
              <div style={{background:"#fff4f4",border:"1px solid #f3c0c0",color:"#b5403a",fontSize:12.5,padding:"9px 11px",borderRadius:8,marginTop:10,lineHeight:1.5,textAlign:"center"}}>
                Locked for security. Try again in <strong>{remaining}s</strong>.
              </div>
            )}
            {resetMsg && <div style={{background:"#f0fff8",border:"1px solid #b0e8c8",color:"#2a7a50",fontSize:12,padding:"9px 11px",borderRadius:8,marginTop:10,lineHeight:1.5}}>{resetMsg}</div>}
            <button type="submit" disabled={loading || locked} style={{width:"100%",marginTop:18,padding:13,fontSize:14,background:(loading||locked)?"#9ca3af":"#2a5357",color:"#fff",border:"none",borderRadius:8,fontFamily:"Inter,sans-serif",fontWeight:500,cursor:(loading||locked)?"not-allowed":"pointer",transition:"background 0.15s"}}>
              {locked ? `Try again in ${remaining}s` : loading ? "Signing in…" : "Sign In"}
            </button>
          </form>
          <button onClick={handleForgot} style={{width:"100%",marginTop:12,background:"none",border:"none",color:"#2a5357",fontSize:12.5,fontWeight:500,cursor:"pointer"}}>Forgot password?</button>
        </div>
        <div style={{textAlign:"center",marginTop:16,fontSize:12,color:"#e5e7eb"}}>Church Connect · Secure Member Portal</div>
      </div>
    </div>
  );
}
