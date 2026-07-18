import { useState, useEffect, createContext, useContext } from "react";
import { supabase } from "./supabase";
import { ShieldCheck, KeyRound, Camera, X } from "lucide-react";

// ── Profile photo lightbox (click any member photo to enlarge) ──
export const PhotoLightboxContext = createContext({ open: () => {} });

export function PhotoLightbox({ children }) {
  const [member, setMember] = useState(null);
  useEffect(() => {
    if (!member) return;
    const onKey = e => { if (e.key === "Escape") setMember(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [member]);
  return (
    <PhotoLightboxContext.Provider value={{ open: setMember }}>
      {children}
      {member && member.photo_url && (
        <div onClick={() => setMember(null)} style={{
          position:"fixed", inset:0, background:"rgba(0,0,0,0.85)", zIndex:1000,
          display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
          gap:16, padding:24, cursor:"zoom-out", animation:"fadeIn 0.15s ease",
        }}>
          <img src={member.photo_url} alt={fullName(member)} onClick={e => e.stopPropagation()}
            style={{ maxWidth:"min(92vw,520px)", maxHeight:"78vh", objectFit:"contain", borderRadius:16, boxShadow:"0 8px 50px #000000a0", cursor:"default" }} />
          <div style={{ color:"#fff", fontSize:16, fontWeight:600, fontFamily:"'Inter',sans-serif" }}>{fullName(member)}</div>
          <button onClick={() => setMember(null)} aria-label="Close"
            style={{ position:"absolute", top:20, right:20, width:42, height:42, borderRadius:"50%", background:"rgba(255,255,255,0.15)", border:"none", color:"#fff", fontSize:20, cursor:"pointer" }}><X size={18} /></button>
        </div>
      )}
    </PhotoLightboxContext.Provider>
  );
}

// Downscale + compress an image file client-side before upload (keeps storage small/fast).
// Returns a Blob (JPEG). Max dimension ~512px.
export function resizeImage(file, maxDim = 512, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > height && width > maxDim) { height = Math.round(height * maxDim / width); width = maxDim; }
      else if (height > maxDim) { width = Math.round(width * maxDim / height); height = maxDim; }
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      canvas.toBlob(b => b ? resolve(b) : reject(new Error("Could not process image")), "image/jpeg", quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not read image file")); };
    img.src = url;
  });
}

// ── Two-step verification (TOTP MFA via Supabase Auth) ──

// Renders a QR code whether Supabase returns it as a data-URL/image or raw SVG markup.
function QRCode({ value }) {
  if (!value) return null;
  const isImg = value.startsWith("data:") || value.startsWith("http");
  return isImg
    ? <img src={value} alt="Authenticator QR code" style={{ width: 184, height: 184 }} />
    : <div style={{ width: 184, height: 184 }} dangerouslySetInnerHTML={{ __html: value }} />;
}

// Password field with a Show/Hide toggle so the user can check what they typed.
function PasswordInput({ value, onChange, placeholder, onEnter, autoFocus, small }) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ position: "relative", marginBottom: 8 }}>
      <input
        type={show ? "text" : "password"}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onKeyDown={e => { if (e.key === "Enter" && onEnter) onEnter(); }}
        style={{ width: "100%", padding: small ? "9px 58px 9px 11px" : "10px 58px 10px 12px", border: "1.5px solid #d6dde3", borderRadius: small ? 9 : 10, fontSize: small ? 13.5 : 14 }}
      />
      <button type="button" onClick={() => setShow(s => !s)}
        style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#2a5357", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
        {show ? "Hide" : "Show"}
      </button>
    </div>
  );
}

// Shown after login when the account has 2FA enabled but the session is still at AAL1.
export function MfaChallenge({ onVerified, onCancel }) {
  const [code, setCode] = useState("");
  const [factorId, setFactorId] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.mfa.listFactors().then(({ data }) => {
      const totp = (data?.totp || []).find(f => f.status === "verified")
        || (data?.all || []).find(f => f.factor_type === "totp" && f.status === "verified");
      if (totp) setFactorId(totp.id);
      else setError("No active authenticator was found for this account.");
    }).catch(e => setError(e.message));
  }, []);

  async function submit() {
    if (!/^\d{6}$/.test(code)) { setError("Enter the 6-digit code from your authenticator app."); return; }
    if (!factorId) { setError("No authenticator factor available."); return; }
    setBusy(true); setError("");
    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
      if (error) throw error;
      onVerified();
    } catch (e) {
      setError(e.message || "That code didn't match. Try the latest one.");
      setBusy(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f4f6fa", padding: 20 }}>
      <div style={{ background: "#fff", borderRadius: 14, boxShadow: "0 10px 40px #0000001a", padding: 28, width: "100%", maxWidth: 360, textAlign: "center" }}>
        <div style={{ display:"flex", justifyContent:"center" }}><ShieldCheck size={30} color="#2a5357" /></div>
        <div style={{ fontSize: 17, fontWeight: 700, color: "#111827", margin: "8px 0 4px" }}>Two-step verification</div>
        <div style={{ fontSize: 12.5, color: "#6b7280", lineHeight: 1.6, marginBottom: 16 }}>
          Enter the 6-digit code from your authenticator app to finish signing in.
        </div>
        <input
          value={code}
          onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          onKeyDown={e => e.key === "Enter" && submit()}
          inputMode="numeric" autoFocus placeholder="000000"
          style={{ width: "100%", textAlign: "center", letterSpacing: 8, fontSize: 22, fontWeight: 700, padding: "10px 12px", border: "1.5px solid #d6dde3", borderRadius: 10, fontFamily: "monospace" }}
        />
        {error && <div style={{ color: "#d05050", fontSize: 12, marginTop: 10 }}>{error}</div>}
        <button onClick={submit} disabled={busy}
          style={{ width: "100%", marginTop: 14, background: "#2a5357", color: "#fff", border: "none", borderRadius: 10, padding: "11px", fontSize: 14, fontWeight: 600, cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1 }}>
          {busy ? "Verifying…" : "Verify"}
        </button>
        <button onClick={onCancel}
          style={{ width: "100%", marginTop: 8, background: "none", color: "#6b7280", border: "none", fontSize: 12, cursor: "pointer" }}>
          Cancel and sign out
        </button>
      </div>
    </div>
  );
}

// Full-screen "set a new password" — shown when a user arrives via a password-reset link.
export function SetPasswordScreen({ onDone, onCancel }) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);
  const [needsMfa, setNeedsMfa] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        // If the account has a verified 2FA factor, this recovery session is only
        // AAL1 and Supabase blocks the password update until 2FA is verified.
        const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (data && data.currentLevel === "aal1" && data.nextLevel === "aal2") setNeedsMfa(true);
      } catch (e) { /* no factor / check failed → go straight to the password step */ }
      setChecking(false);
    })();
  }, []);

  async function submit() {
    if (pw.length < 8) { setError("Use at least 8 characters."); return; }
    if (pw !== pw2) { setError("The two passwords don't match."); return; }
    setBusy(true); setError("");
    try {
      const { error } = await supabase.auth.updateUser({ password: pw });
      if (error) throw error;
      onDone();
    } catch (e) { setError(e.message || "Could not set the password."); setBusy(false); }
  }

  if (checking) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f4f6fa" }}>
      <Spinner />
    </div>
  );

  // 2FA account resetting its password: verify the authenticator code first (reaches AAL2).
  if (needsMfa) return <MfaChallenge onVerified={() => setNeedsMfa(false)} onCancel={onCancel} />;

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f4f6fa", padding: 20 }}>
      <div style={{ background: "#fff", borderRadius: 14, boxShadow: "0 10px 40px #0000001a", padding: 28, width: "100%", maxWidth: 360 }}>
        <div style={{ display:"flex", justifyContent:"center" }}><KeyRound size={30} color="#2a5357" /></div>
        <div style={{ fontSize: 17, fontWeight: 700, color: "#111827", textAlign: "center", margin: "8px 0 4px" }}>Set a new password</div>
        <div style={{ fontSize: 12.5, color: "#6b7280", lineHeight: 1.6, textAlign: "center", marginBottom: 16 }}>
          Choose a password for your account. You'll use it to sign in from now on.
        </div>
        <PasswordInput value={pw} onChange={e => setPw(e.target.value)} placeholder="New password" autoFocus />
        <PasswordInput value={pw2} onChange={e => setPw2(e.target.value)} placeholder="Confirm new password" onEnter={submit} />
        {error && <div style={{ color: "#d05050", fontSize: 12, marginTop: 10 }}>{error}</div>}
        <button onClick={submit} disabled={busy}
          style={{ width: "100%", marginTop: 14, background: "#2a5357", color: "#fff", border: "none", borderRadius: 10, padding: "11px", fontSize: 14, fontWeight: 600, cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1 }}>
          {busy ? "Saving…" : "Save password"}
        </button>
        {onCancel && (
          <button onClick={onCancel} style={{ width: "100%", marginTop: 8, background: "none", color: "#6b7280", border: "none", fontSize: 12, cursor: "pointer" }}>
            Cancel and sign out
          </button>
        )}
      </div>
    </div>
  );
}

// Mandatory onboarding for newly invited users: set a password, then enable 2FA.
export function OnboardingFlow({ onComplete, onCancel, requirePassword = true, require2fa = true }) {
  const [step, setStep] = useState(requirePassword ? 1 : 2);
  // Step 1 — password
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [pwErr, setPwErr] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  // Step 2 — two-step verification
  const [enrolling, setEnrolling] = useState(null); // { id, qr, secret }
  const [code, setCode] = useState("");
  const [mfaErr, setMfaErr] = useState("");
  const [mfaBusy, setMfaBusy] = useState(false);

  // When the password step is skipped (2FA-only mode), begin enrollment immediately.
  useEffect(() => { if (!requirePassword && require2fa) startEnroll(); /* eslint-disable-next-line */ }, []);

  async function savePassword() {
    setPwErr("");
    if (pw.length < 8) { setPwErr("Use at least 8 characters."); return; }
    if (pw !== pw2) { setPwErr("The two passwords don't match."); return; }
    setPwBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pw });
      if (error) throw error;
      if (require2fa) { setStep(2); startEnroll(); }
      else { onComplete(); } // account is exempt from 2FA → finish after password
    } catch (e) { setPwErr(e.message || "Could not set the password."); }
    setPwBusy(false);
  }

  async function startEnroll() {
    setMfaErr("");
    try {
      const { data: list } = await supabase.auth.mfa.listFactors();
      for (const f of (list?.all || [])) {
        if (f.factor_type === "totp" && f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });
      if (error) throw error;
      setEnrolling({ id: data.id, qr: data.totp?.qr_code, secret: data.totp?.secret });
    } catch (e) { setMfaErr(e.message || "Could not start two-step setup."); }
  }

  async function finish() {
    setMfaErr("");
    if (!/^\d{6}$/.test(code)) { setMfaErr("Enter the 6-digit code from your app."); return; }
    setMfaBusy(true);
    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: enrolling.id, code });
      if (error) throw error;
      onComplete();
    } catch (e) { setMfaErr(e.message || "That code didn't match. Try the latest one."); setMfaBusy(false); }
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f4f6fa", padding: 20 }}>
      <div style={{ background: "#fff", borderRadius: 14, boxShadow: "0 10px 40px #0000001a", padding: 28, width: "100%", maxWidth: 400 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#5edcd1", letterSpacing: 0.8, textAlign: "center" }}>{requirePassword ? (require2fa ? `STEP ${step} OF 2` : "SET YOUR PASSWORD") : "REQUIRED SETUP"}</div>

        {step === 1 && (
          <>
            <div style={{ display:"flex", justifyContent:"center", marginTop: 6 }}><KeyRound size={30} color="#2a5357" /></div>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#111827", textAlign: "center", margin: "6px 0 4px" }}>Create your password</div>
            <div style={{ fontSize: 12.5, color: "#6b7280", lineHeight: 1.6, textAlign: "center", marginBottom: 16 }}>
              Welcome! Set a password to secure your account — you'll use it to sign in from now on.
            </div>
            <PasswordInput value={pw} onChange={e => setPw(e.target.value)} placeholder="New password" autoFocus />
            <PasswordInput value={pw2} onChange={e => setPw2(e.target.value)} placeholder="Confirm new password" onEnter={savePassword} />
            {pwErr && <div style={{ color: "#d05050", fontSize: 12, marginTop: 6 }}>{pwErr}</div>}
            <button onClick={savePassword} disabled={pwBusy}
              style={{ width: "100%", marginTop: 14, background: "#2a5357", color: "#fff", border: "none", borderRadius: 10, padding: "11px", fontSize: 14, fontWeight: 600, cursor: pwBusy ? "default" : "pointer", opacity: pwBusy ? 0.6 : 1 }}>
              {pwBusy ? "Saving…" : "Continue"}
            </button>
          </>
        )}

        {step === 2 && (
          <>
            <div style={{ display:"flex", justifyContent:"center", marginTop: 6 }}><ShieldCheck size={30} color="#2a5357" /></div>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#111827", textAlign: "center", margin: "6px 0 4px" }}>Set up two-step verification</div>
            <div style={{ fontSize: 12.5, color: "#6b7280", lineHeight: 1.6, textAlign: "center", marginBottom: 12 }}>
              This is required. Scan the QR code with an authenticator app (Google Authenticator, Authy, 1Password), then enter the 6-digit code it shows.
            </div>
            {!enrolling && !mfaErr && <div style={{ textAlign: "center", color: "#9ca3af", fontSize: 13, padding: "10px 0" }}>Preparing…</div>}
            {enrolling && (
              <div style={{ textAlign: "center" }}>
                <div style={{ display: "flex", justifyContent: "center", margin: "4px 0 8px" }}><QRCode value={enrolling.qr} /></div>
                {enrolling.secret && <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 10 }}>Can't scan? Key: <code style={{ fontSize: 12, color: "#374151", wordBreak: "break-all" }}>{enrolling.secret}</code></div>}
                <input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} onKeyDown={e => e.key === "Enter" && finish()}
                  inputMode="numeric" autoFocus placeholder="000000"
                  style={{ width: 160, textAlign: "center", letterSpacing: 6, fontSize: 20, fontWeight: 700, padding: "9px 10px", border: "1.5px solid #d6dde3", borderRadius: 10, fontFamily: "monospace" }} />
              </div>
            )}
            {mfaErr && <div style={{ color: "#d05050", fontSize: 12, marginTop: 10, textAlign: "center" }}>{mfaErr}</div>}
            <button onClick={finish} disabled={mfaBusy || !enrolling}
              style={{ width: "100%", marginTop: 14, background: "#2a5357", color: "#fff", border: "none", borderRadius: 10, padding: "11px", fontSize: 14, fontWeight: 600, cursor: (mfaBusy || !enrolling) ? "default" : "pointer", opacity: (mfaBusy || !enrolling) ? 0.6 : 1 }}>
              {mfaBusy ? "Verifying…" : "Finish setup"}
            </button>
          </>
        )}

        <button onClick={onCancel} style={{ width: "100%", marginTop: 8, background: "none", color: "#6b7280", border: "none", fontSize: 12, cursor: "pointer" }}>
          Cancel and sign out
        </button>
      </div>
    </div>
  );
}

// Self-service panel: change password + turn 2FA on/off.
export function SecurityModal({ onClose }) {
  const [factor, setFactor] = useState(undefined); // undefined = loading, null = none, object = enrolled
  const [enroll, setEnroll] = useState(null);       // { id, qr, secret } during setup
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // Password change
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [pwMsg, setPwMsg] = useState("");
  const [pwErr, setPwErr] = useState("");
  const [pwBusy, setPwBusy] = useState(false);

  async function changePassword() {
    setPwMsg(""); setPwErr("");
    if (pw.length < 8) { setPwErr("Use at least 8 characters."); return; }
    if (pw !== pw2) { setPwErr("The two passwords don't match."); return; }
    setPwBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pw });
      if (error) throw error;
      setPw(""); setPw2(""); setPwMsg("Password updated.");
    } catch (e) { setPwErr(e.message || "Could not update password."); }
    setPwBusy(false);
  }

  async function refresh() {
    try {
      const { data } = await supabase.auth.mfa.listFactors();
      const totp = (data?.totp || []).find(f => f.status === "verified");
      setFactor(totp || null);
    } catch (e) { setError(e.message); setFactor(null); }
  }
  useEffect(() => { refresh(); }, []);

  async function startEnroll() {
    setError(""); setBusy(true);
    try {
      // clear any half-finished (unverified) factors so re-enrolling is clean
      const { data: list } = await supabase.auth.mfa.listFactors();
      for (const f of (list?.all || [])) {
        if (f.factor_type === "totp" && f.status !== "verified") {
          await supabase.auth.mfa.unenroll({ factorId: f.id });
        }
      }
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });
      if (error) throw error;
      setEnroll({ id: data.id, qr: data.totp?.qr_code, secret: data.totp?.secret });
    } catch (e) { setError(e.message); }
    setBusy(false);
  }

  async function confirmEnroll() {
    if (!/^\d{6}$/.test(code)) { setError("Enter the 6-digit code from your app."); return; }
    setBusy(true); setError("");
    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: enroll.id, code });
      if (error) throw error;
      setEnroll(null); setCode(""); await refresh();
    } catch (e) { setError(e.message || "That code didn't match. Try the latest one."); }
    setBusy(false);
  }

  async function disable() {
    setBusy(true); setError("");
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
      if (error) throw error;
      await refresh();
    } catch (e) { setError(e.message); }
    setBusy(false);
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 900, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, padding: 24, width: "100%", maxWidth: 420, maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#111827" }}>Account security</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, color: "#9ca3af", cursor: "pointer" }}><X size={18} /></button>
        </div>

        {/* Password */}
        <div style={{ margin: "12px 0 4px", fontSize: 13, fontWeight: 700, color: "#2a5357" }}>Password</div>
        <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8, lineHeight: 1.5 }}>Set or change the password you use to sign in.</div>
        <PasswordInput value={pw} onChange={e => setPw(e.target.value)} placeholder="New password" small />
        <PasswordInput value={pw2} onChange={e => setPw2(e.target.value)} placeholder="Confirm new password" onEnter={changePassword} small />
        {pwErr && <div style={{ color: "#d05050", fontSize: 12, marginTop: 8 }}>{pwErr}</div>}
        {pwMsg && <div style={{ color: "#2a7a50", fontSize: 12, marginTop: 8 }}>{pwMsg}</div>}
        <button onClick={changePassword} disabled={pwBusy}
          style={{ marginTop: 10, background: "#2a5357", color: "#fff", border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 13, fontWeight: 600, cursor: pwBusy ? "default" : "pointer", opacity: pwBusy ? 0.6 : 1 }}>
          {pwBusy ? "Saving…" : "Save password"}
        </button>

        <div style={{ borderTop: "1px solid #eef2f4", margin: "18px 0 4px" }} />
        <div style={{ margin: "8px 0 4px", fontSize: 13, fontWeight: 700, color: "#2a5357" }}>Two-step verification</div>

        {factor === undefined && <div style={{ color: "#9ca3af", fontSize: 13, padding: "12px 0" }}>Loading…</div>}

        {/* Already enabled */}
        {factor && !enroll && (
          <div>
            <div style={{ background: "#f0fff8", border: "1.5px solid #b0e8c8", borderRadius: 8, padding: "10px 12px", fontSize: 13, color: "#2a7a50", margin: "10px 0" }}>
              Two-step verification is <strong>on</strong> for your account.
            </div>
            <p style={{ fontSize: 12.5, color: "#6b7280", lineHeight: 1.6 }}>
              You'll be asked for a code from your authenticator app each time you sign in. If you lose your device, an admin can remove two-step verification for your account from the Supabase dashboard.
            </p>
          </div>
        )}

        {/* Not enabled, not yet enrolling */}
        {factor === null && !enroll && (
          <div>
            <p style={{ fontSize: 12.5, color: "#6b7280", lineHeight: 1.6, margin: "10px 0" }}>
              Add a second step at sign-in using an authenticator app (Google Authenticator, Authy, 1Password, etc.). This makes your account much harder to break into.
            </p>
            <button onClick={startEnroll} disabled={busy}
              style={{ marginTop: 6, background: "#2a5357", color: "#fff", border: "none", borderRadius: 8, padding: "10px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: busy ? 0.6 : 1 }}>
              {busy ? "Starting…" : "Set up two-step verification"}
            </button>
          </div>
        )}

        {/* Enrolling: show QR + code entry */}
        {enroll && (
          <div style={{ textAlign: "center" }}>
            <p style={{ fontSize: 12.5, color: "#6b7280", lineHeight: 1.6, margin: "10px 0" }}>
              1. Scan this QR code with your authenticator app.
            </p>
            <div style={{ display: "flex", justifyContent: "center", margin: "8px 0" }}><QRCode value={enroll.qr} /></div>
            {enroll.secret && (
              <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 12 }}>
                Can't scan? Enter this key manually:<br />
                <code style={{ fontSize: 12, color: "#374151", wordBreak: "break-all" }}>{enroll.secret}</code>
              </div>
            )}
            <p style={{ fontSize: 12.5, color: "#6b7280", lineHeight: 1.6 }}>2. Enter the 6-digit code it shows:</p>
            <input
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              onKeyDown={e => e.key === "Enter" && confirmEnroll()}
              inputMode="numeric" autoFocus placeholder="000000"
              style={{ width: 160, textAlign: "center", letterSpacing: 6, fontSize: 20, fontWeight: 700, padding: "9px 10px", border: "1.5px solid #d6dde3", borderRadius: 10, fontFamily: "monospace" }}
            />
            <div>
              <button onClick={confirmEnroll} disabled={busy}
                style={{ marginTop: 14, background: "#2a5357", color: "#fff", border: "none", borderRadius: 8, padding: "10px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: busy ? 0.6 : 1 }}>
                {busy ? "Verifying…" : "Verify & turn on"}
              </button>
            </div>
            <button onClick={() => { setEnroll(null); setCode(""); setError(""); }}
              style={{ marginTop: 8, background: "none", border: "none", color: "#9ca3af", fontSize: 12, cursor: "pointer" }}>
              Cancel
            </button>
          </div>
        )}

        {error && <div style={{ color: "#d05050", fontSize: 12, marginTop: 12 }}>{error}</div>}
      </div>
    </div>
  );
}


// Self-contained photo upload control used inside the member form
export function PhotoUploader({ value, onChange }) {
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");

  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting same file
    if (!file) return;
    if (!file.type.startsWith("image/")) { setErr("Please choose an image file"); return; }
    setErr(""); setUploading(true);
    try {
      const blob = await resizeImage(file);
      const path = `members/${crypto.randomUUID()}.jpg`;
      const { error } = await supabase.storage.from("member-photos").upload(path, blob, { contentType: "image/jpeg", upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from("member-photos").getPublicUrl(path);
      onChange(data.publicUrl);
    } catch (e2) {
      setErr(e2.message?.includes("Bucket not found") ? "Storage bucket 'member-photos' not set up yet — see deployment notes." : (e2.message || "Upload failed"));
    } finally { setUploading(false); }
  }

  return (
    <div style={{display:"flex",alignItems:"center",gap:14}}>
      <div style={{width:64,height:64,borderRadius:"50%",background:"#f0f2f8",border:"1.5px solid #e4e9f5",display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden",flexShrink:0}}>
        {value ? <img src={value} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}} /> : <span style={{display:"flex",color:"#c0c8e0"}}><Camera size={24} /></span>}
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:6}}>
        <label className="btn-ghost" style={{cursor:"pointer",fontSize:12,display:"inline-block"}}>
          {uploading ? "Uploading…" : value ? "Change Photo" : "Upload Photo"}
          <input type="file" accept="image/*" onChange={handleFile} disabled={uploading} style={{display:"none"}} />
        </label>
        {value && !uploading && (
          <button type="button" className="btn-ghost" style={{fontSize:11,color:"#e05050"}} onClick={()=>onChange("")}>Remove</button>
        )}
        {err && <div style={{color:"#e05050",fontSize:11,maxWidth:200}}>{err}</div>}
      </div>
    </div>
  );
}


export const ROLES = ["Usher","Musician","Worship Team","Youth Worship Team","Minister","Elder","Youth Leader","Sunday School Teacher","Social Media","Audio and Media","Board Member","Finances","Dancer","Communion Preparation","After Church Sanitation"];
// ── Tab access, single source of truth ───────────────────────────────────────
// App.jsx (nav + routing) and UsersPage.jsx (the "who can see what" cards) both
// read from these. Add a tab in ONE place and everywhere stays in step — the
// Roster tab got missed on the Users page precisely because this was duplicated.
export const TAB_LABELS = {
  dashboard:"Home", members:"Members", attendance:"Attendance", roster:"Roster",
  photos:"Photos", roles:"Ministries", households:"Households", celebrations:"Celebrations",
  skills:"Skills", analytics:"Analytics", users:"Users", changelog:"Log", import:"Import",
};

export const TAB_ACCESS = {
  admin:        ["dashboard","members","attendance","roster","roles","households","celebrations","skills","analytics","users","photos","changelog","import"],
  leadership:   ["dashboard","members","attendance","roster","roles","households","celebrations","skills","analytics"],
  usher:        ["attendance","roster","households","celebrations"],
  celebrations: ["celebrations"],
};

// The tab each role lands on after signing in.
// Ushers land on Roster: the printed attendance list is what they actually work from
// at the door, so it's the first thing they need rather than Attendance.
export const DEFAULT_TAB = { admin:"dashboard", leadership:"dashboard", usher:"roster", celebrations:"celebrations" };

// Human-readable list of what a role can reach, e.g. "Attendance, Roster, Households, Celebrations".
export const tabsForRole = role =>
  (TAB_ACCESS[role] || []).map(k => TAB_LABELS[k] || k).join(", ");

// The order tabs appear in the nav. TAB_ACCESS lists and per-user overrides are
// both sorted through this, so a customised user's tabs don't come out shuffled.
export const TAB_ORDER = Object.keys(TAB_LABELS);

// Resolve the tabs a profile may see.
// profiles.tab_access is an optional admin-set override; NULL/empty falls back to
// the role default, which is what every account does until an admin customises it.
// Unknown keys are dropped so a renamed tab can't strand someone on a dead nav item.
export function tabsForProfile(profile) {
  const custom = profile?.tab_access;
  const base = Array.isArray(custom) && custom.length
    ? custom
    : (TAB_ACCESS[profile?.role] || ["celebrations"]);
  const allowed = base.filter(t => TAB_ORDER.includes(t));
  const ordered = TAB_ORDER.filter(t => allowed.includes(t));
  return ordered.length ? ordered : ["celebrations"];
}

// Where this profile lands after signing in: the role's usual landing tab when they
// still have it, otherwise the first tab they do have. Without this fallback an admin
// could untick someone's default tab and drop them onto a page they can't open.
export function defaultTabForProfile(profile) {
  const allowed = tabsForProfile(profile);
  const preferred = DEFAULT_TAB[profile?.role];
  return preferred && allowed.includes(preferred) ? preferred : allowed[0];
}

// True when this user has been given something other than their role's default set.
export const hasCustomTabs = profile =>
  Array.isArray(profile?.tab_access) && profile.tab_access.length > 0;

export const MARITAL_OPTIONS = ["Single","Married"];
export const SEX_OPTIONS = ["Male","Female"];

export const TRINIDAD_CITIES = [
  "Arima","Barataria","Bon Accord","Carapachiama","Caroni","Chaguanas",
  "Chaguaramas","Claxton Bay","Couva","Cunupia","D'Abadie","Diego Martin",
  "El Dorado","Freeport","Fyzabad","Gasparillo","Grand Bazaar","Laventille",
  "Longdenville","Marabella","Maraval","Mon Repos","Morvant","Point Fortin",
  "Port of Spain","Princes Town","Preysal","Rio Claro","Roxborough",
  "San Fernando","San Juan","Sangre Grande","Santa Cruz","Siparia",
  "Tabaquite","Tacarigua","Tunapuna","Valencia","Wallerfield","Woodbrook"
];

export const ROLE_COLORS = {
  "Usher":"#e8a020","Musician":"#3a8fd0","Worship Team":"#a040c0","Youth Worship Team":"#7048b8","Minister":"#2a5357",
  "Elder":"#c06030","Youth Leader":"#20a070","Sunday School Teacher":"#8060c0",
  "Social Media":"#3a7ab8","Audio and Media":"#7c5cd0","Board Member":"#c04060","Finances":"#2a8a50","Dancer":"#e05090",
  "Communion Preparation":"#9a3a6a","After Church Sanitation":"#0f8a8a",
};
export const MARITAL_COLORS = { "Single":"#3a8fd0","Married":"#4caf82" };
export const SEX_COLORS = { "Male":"#3a8fd0","Female":"#d060a0" };
export const SKILLS_LIST = [
  "Accounting","Administration","Audio Engineering","Carpentry","Childcare",
  "Coaching","Cooking","Counselling","Data Analysis","Design (Graphic)",
  "Design (Interior)","Drama/Acting","Education/Teaching","Electrical Work",
  "Event Planning","Finance/Budgeting","First Aid/Medical","Fundraising",
  "Human Resources","IT/Tech Support","Journalism/Writing","Language Translation",
  "Law/Legal","Leadership","Marketing","Media Production","Singing","Music (Acoustic Guitar)",
  "Music (Electric Guitar)","Music (Keyboard/Piano)","Music (Drums)","Music (Bass Guitar)",
  "Music (Violin)","Music (Other)","Painting/Art","Photography","Plumbing","Project Management",
  "Public Speaking","Sanitary Services","Security","Social Media Management","Software Development",
  "Sound Mixing","Translation","Videography","Web Design","Welding/Fabrication"
];

export const SERVICE_NAMES = ["Sunday Morning Service","Friday Night Service (General)","Men's Meeting","Women's Meeting","Youth Meeting","Special Service"];

export const INSTRUMENTS = ["Acoustic Guitar","Electric Guitar","Keyboard/Piano","Drums","Bass Guitar","Violin","Saxophone","Clarinet","Trumpet","Other"];

export const BLANK_MEMBER = {
  first_name:"", middle_name:"", last_name:"",
  phone:"", email:"", dob:"", sex:"", marital_status:"",
  address:"", city:"", anniversary:"", skill1:"", skill2:"", skill3:"", other_skills:"", instruments:"", is_active: true,
  join_date:"", notes:"", roles:[], spouse_id:"", household_id:"", new_household_name:"", photo_url:""
};

export function fullName(m) {
  if (!m) return "";
  return [m.first_name, m.last_name].filter(Boolean).join(" ");
}

export function fullNameFull(m) {
  if (!m) return "";
  return [m.first_name, m.middle_name, m.last_name].filter(Boolean).join(" ");
}
export function initials(m) {
  const f = (m.first_name||"")[0]||"";
  const l = (m.last_name||"")[0]||"";
  return (f+l).toUpperCase() || "?";
}
export function calcAge(dob) {
  if (!dob) return null;
  const b = new Date(dob), t = new Date();
  let a = t.getFullYear()-b.getUTCFullYear();
  if (t.getMonth()<b.getUTCMonth()||(t.getMonth()===b.getUTCMonth()&&t.getDate()<b.getUTCDate())) a--;
  return a;
}
export function formatDob(dob) {
  if (!dob) return "—";
  return new Date(dob).toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric",timeZone:"UTC"});
}
export function formatShortDate(d) {
  if (!d) return "—";
  return new Date(d+"T12:00:00").toLocaleDateString("en-US",{month:"long",day:"numeric"});
}

// Formats days into "X months Y days" or just "X days" if < 30 days
export function formatDaysAway(days) {
  if (days === 0) return "Today!";
  if (days < 30) return `${days} day${days !== 1 ? "s" : ""} away`;
  const months = Math.floor(days / 30);
  const remaining = days % 30;
  if (remaining === 0) return `${months} month${months !== 1 ? "s" : ""} away`;
  return `${months} month${months !== 1 ? "s" : ""} ${remaining} day${remaining !== 1 ? "s" : ""} away`;
}

// Returns days until next occurrence of a date (birthday/anniversary)
export function daysUntilNext(dateStr) {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0,0,0,0);
  const d = new Date(dateStr+"T00:00:00");
  let next = new Date(today.getFullYear(), d.getUTCMonth(), d.getUTCDate());
  if (next < today) next.setFullYear(today.getFullYear() + 1);
  return Math.round((next - today) / 864e5);
}

export function isBirthdayThisWeek(dob) {
  const d = daysUntilNext(dob);
  return d !== null && d >= 0 && d <= 7;
}

// ============ VALIDATION HELPERS ============
export function validateMember(form) {
  const errors = {};
  const today = new Date().toISOString().slice(0,10);

  if (!form.first_name?.trim()) errors.first_name = "First name is required";
  if (!form.last_name?.trim()) errors.last_name = "Last name is required";

  if (form.email && form.email.trim()) {
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test(form.email.trim())) errors.email = "Invalid email format";
  }
  if (form.phone && form.phone.trim()) {
    const phoneRe = /^[0-9\s\+\-\(\)]{7,20}$/;
    if (!phoneRe.test(form.phone.trim())) errors.phone = "Phone must be 7-20 digits, spaces, +, -, ( ) only";
  }
  if (form.dob) {
    if (form.dob > today) errors.dob = "Date of birth cannot be in the future";
    const age = calcAge(form.dob);
    if (age !== null && age > 120) errors.dob = "Please enter a valid date of birth";
  }
  if (form.anniversary) {
    if (form.anniversary > today) errors.anniversary = "Anniversary cannot be in the future";
    if (form.marital_status === "Single") errors.anniversary = "Anniversary should only be set for married members";
  }
  if (form.join_date && form.join_date > today) errors.join_date = "Church join date cannot be in the future";

  // Duplicate skill check
  const skills = [form.skill1, form.skill2, form.skill3].filter(Boolean);
  if (new Set(skills).size !== skills.length) errors.skills = "Please select different skills — no duplicates";

  return errors;
}

export function ValidationMsg({ errors, field }) {
  if (!errors[field]) return null;
  return <div style={{color:"#e05050",fontSize:12,marginTop:3,fontWeight:500}}>{errors[field]}</div>;
}

export function Avatar({ member, size=40 }) {
  const { open } = useContext(PhotoLightboxContext);
  const name = fullName(member);
  const colors = { "Male":"#3a8fd0","Female":"#d060a0" };
  const fallback = ["#2a5357","#3a8fd0","#4caf82","#c06030","#a040c0","#20a070"];
  const color = member.sex && colors[member.sex] ? colors[member.sex] : fallback[name.charCodeAt(0)%fallback.length];
  if (member.photo_url) {
    return (
      <img src={member.photo_url} alt={name}
        onClick={(e) => { e.stopPropagation(); open(member); }}
        title="Click to enlarge"
        style={{width:size,height:size,borderRadius:"50%",objectFit:"cover",flexShrink:0,cursor:"zoom-in",
          opacity:member.is_active===false?0.6:1, background:"#e5e7eb",
          filter:member.is_active===false?"grayscale(0.6)":"none"}} />
    );
  }
  return (
    <div style={{width:size,height:size,borderRadius:"50%",background:member.is_active===false?"#b0b8c8":color,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:700,fontSize:size*0.36,fontFamily:"'Inter',sans-serif",flexShrink:0,opacity:member.is_active===false?0.7:1}}>
      {initials(member)}
    </div>
  );
}
export function RoleBadge({ role, small }) {
  const c = ROLE_COLORS[role]||"#888";
  return <span style={{background:c+"18",border:`1.5px solid ${c}44`,color:c,borderRadius:20,padding:small?"2px 8px":"3px 10px",fontSize:small?10:11,fontWeight:700,letterSpacing:0.3,display:"inline-block"}}>{role}</span>;
}
export function MaritalBadge({ status }) {
  if (!status) return null;
  const c = MARITAL_COLORS[status]||"#888";
  return <span style={{background:c+"18",border:`1.5px solid ${c}44`,color:c,borderRadius:20,padding:"3px 10px",fontSize:12,fontWeight:700,display:"inline-block"}}>{status}</span>;
}
export function SexBadge({ sex }) {
  if (!sex) return null;
  const c = SEX_COLORS[sex]||"#888";
  return <span style={{background:c+"18",border:`1.5px solid ${c}44`,color:c,borderRadius:20,padding:"3px 10px",fontSize:12,fontWeight:700,display:"inline-block"}}>{sex}</span>;
}
export function StatusBadge({ active }) {
  return active === false
    ? <span style={{background:"#f0f0f8",border:"1.5px solid #c0c8e0",color:"#9ca3af",borderRadius:20,padding:"3px 10px",fontSize:12,fontWeight:700,display:"inline-block"}}>Inactive</span>
    : <span style={{background:"#e8f8f0",border:"1.5px solid #a0dfc0",color:"#2a8a50",borderRadius:20,padding:"3px 10px",fontSize:12,fontWeight:700,display:"inline-block"}}>Active</span>;
}
export function InfoRow({ icon, label, value }) {
  return (
    <div style={{display:"flex",alignItems:"flex-start",gap:8,marginBottom:10}}>
      <span style={{fontSize:14,marginTop:1}}>{icon}</span>
      <div>
        <div style={{fontSize:11,color:"#9ca3af",letterSpacing:0.5,textTransform:"uppercase",fontWeight:700}}>{label}</div>
        <div style={{fontSize:14,color:"#111827",marginTop:2}}>{value}</div>
      </div>
    </div>
  );
}
export function EmptyState({ icon, title, subtitle, action, onAction }) {
  return (
    <div style={{
      display:"flex", flexDirection:"column", alignItems:"center",
      justifyContent:"center", padding:"56px 20px", textAlign:"center",
    }}>
      <div style={{
        width:64, height:64, borderRadius:16, background:"#f3f4f6",
        display:"flex", alignItems:"center", justifyContent:"center",
        fontSize:28, marginBottom:16,
      }}>{icon}</div>
      <div style={{fontSize:16, fontWeight:600, color:"#111827", marginBottom:6}}>{title}</div>
      {subtitle && <div style={{fontSize:14, color:"#9ca3af", maxWidth:280, lineHeight:1.6, marginBottom: action?20:0}}>{subtitle}</div>}
      {action && onAction && (
        <button className="btn-primary" onClick={onAction} style={{marginTop:4}}>{action}</button>
      )}
    </div>
  );
}

export function Spinner() {
  return <div style={{display:"flex",alignItems:"center",justifyContent:"center",padding:40,color:"#9ca3af",fontSize:13}}>Loading…</div>;
}

export function MemberForm({ value, onChange, onSubmit, onCancel, submitLabel="Save", saving, errors={}, members=[], households=[] }) {
  const u = k => e => onChange({...value,[k]:e.target.value});
  const tr = r => onChange({...value,roles:value.roles.includes(r)?value.roles.filter(x=>x!==r):[...value.roles,r]});
  const spouseCandidates = members
    .filter(m => m.id && m.id !== value.id)
    .slice()
    .sort((a,b) => fullName(a).localeCompare(fullName(b)));
  return (
    <>
      <div className="field-group">
        <label className="field-label">Member Photo</label>
        <div style={{fontSize:11,color:"#b0b8d0",marginTop:2}}>A clear head-and-shoulders photo works best.</div>
        <div style={{marginTop:6}}>
          <PhotoUploader value={value.photo_url||""} onChange={url => onChange({...value, photo_url: url})} />
        </div>
      </div>

      <div className="field-row-3">
        <div><label className="field-label">First Name *</label><input placeholder="First" value={value.first_name} onChange={u("first_name")} style={{borderColor:errors.first_name?"#e05050":""}} />{errors.first_name&&<div style={{color:"#e05050",fontSize:12,marginTop:3}}>{errors.first_name}</div>}</div>
        <div><label className="field-label">Middle Name</label><input placeholder="Middle" value={value.middle_name} onChange={u("middle_name")} /></div>
        <div><label className="field-label">Last Name *</label><input placeholder="Last" value={value.last_name} onChange={u("last_name")} style={{borderColor:errors.last_name?"#e05050":""}} />{errors.last_name&&<div style={{color:"#e05050",fontSize:12,marginTop:3}}>{errors.last_name}</div>}</div>
      </div>

      {/* Status toggle */}
      <div className="field-group">
        <label className="field-label">Member Status</label>
        <div style={{display:"flex",gap:8,marginTop:6}}>
          {[["Active", true], ["Inactive", false]].map(([label, val]) => (
            <button key={label}
              className={`marital-btn ${value.is_active === val ? "on" : ""}`}
              onClick={() => onChange({...value, is_active: val})}
              style={{flex:1, color: val ? undefined : "#8a96b8"}}>
              {val ? "Active" : "Inactive"}
            </button>
          ))}
        </div>
      </div>

      <div className="field-row">
        <div><label className="field-label">Gender</label>
          <div style={{display:"flex",gap:8,marginTop:6}}>
            {["Male","Female"].map(s=>(
              <button key={s} className={`sex-btn ${value.sex===s?"on":""}`} onClick={()=>onChange({...value,sex:value.sex===s?"":s})} style={{flex:1}}>
                {s==="Male"?"Male":"Female"}
              </button>
            ))}
          </div>
        </div>
        <div><label className="field-label">Marital Status</label>
          <div style={{display:"flex",gap:8,marginTop:6}}>
            {["Single","Married"].map(s=>(
              <button key={s} className={`marital-btn ${value.marital_status===s?"on":""}`} onClick={()=>onChange({...value,marital_status:value.marital_status===s?"":s})} style={{flex:1}}>{s}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="field-row">
        <div><label className="field-label">Date of Birth</label><input type="date" value={value.dob} onChange={u("dob")} style={{borderColor:errors.dob?"#e05050":""}}/>{errors.dob&&<div style={{color:"#e05050",fontSize:12,marginTop:3}}>{errors.dob}</div>}</div>
        <div><label className="field-label">Wedding Anniversary</label><input type="date" value={value.anniversary} onChange={u("anniversary")} style={{borderColor:errors.anniversary?"#e05050":""}}/>{errors.anniversary&&<div style={{color:"#e05050",fontSize:12,marginTop:3}}>{errors.anniversary}</div>}</div>
      </div>

      {value.marital_status === "Married" && (
        <div className="field-group">
          <label className="field-label">Spouse <span style={{color:"#d1d5db",fontWeight:400,fontSize:10}}>(links two members together)</span></label>
          <select value={value.spouse_id||""} onChange={u("spouse_id")}>
            <option value="">— Not linked —</option>
            {spouseCandidates.map(m => {
              const taken = m.spouse_id && m.spouse_id !== value.id;
              return <option key={m.id} value={m.id}>{fullName(m)}{taken ? " — already linked" : ""}</option>;
            })}
          </select>
          <div style={{fontSize:11,color:"#b0b8d0",marginTop:4}}>Selecting a spouse automatically links them back to this member.</div>
        </div>
      )}

      <div className="field-group">
        <label className="field-label">Household / Family <span style={{color:"#d1d5db",fontWeight:400,fontSize:10}}>(groups a whole family)</span></label>
        <select value={value.household_id||""} onChange={e=>onChange({...value, household_id:e.target.value, new_household_name: e.target.value==="__new__" ? (value.new_household_name||"") : ""})}>
          <option value="">— No household —</option>
          {households.slice().sort((a,b)=>a.name.localeCompare(b.name)).map(h => {
            const count = members.filter(m => m.household_id === h.id && m.id !== value.id).length + (value.household_id===h.id?1:0);
            return <option key={h.id} value={h.id}>{h.name}{count?` (${count})`:""}</option>;
          })}
          <option value="__new__">+ Create new household…</option>
        </select>
        {value.household_id === "__new__" && (
          <input style={{marginTop:8}} placeholder="Household name, e.g. The Clarke Family" value={value.new_household_name||""} onChange={e=>onChange({...value, new_household_name:e.target.value})} />
        )}
      </div>

      <div className="field-row">
        <div><label className="field-label">Phone</label><input placeholder="555-0000" value={value.phone} onChange={u("phone")} style={{borderColor:errors.phone?"#e05050":""}}/>{errors.phone&&<div style={{color:"#e05050",fontSize:12,marginTop:3}}>{errors.phone}</div>}</div>
        <div><label className="field-label">Email Address</label><input type="email" placeholder="email@example.com" value={value.email} onChange={u("email")} style={{borderColor:errors.email?"#e05050":""}}/>{errors.email&&<div style={{color:"#e05050",fontSize:12,marginTop:3}}>{errors.email}</div>}</div>
      </div>

      <div className="field-row">
        <div><label className="field-label">Church Join Date</label><input type="date" value={value.join_date} onChange={u("join_date")} /></div>
        <div><label className="field-label">Home Address</label><input placeholder="123 Main St, City" value={value.address} onChange={u("address")} /></div>
      </div>

      <div className="field-group">
        <label className="field-label">Skills (up to 3)</label>
        <div style={{display:"flex",flexDirection:"column",gap:6,marginTop:4}}>
          {errors.skills&&<div style={{color:'#e05050',fontSize:12,marginBottom:6}}>{errors.skills}</div>}
        {[["skill1","Primary Skill"],["skill2","Secondary Skill"],["skill3","Additional Skill"]].map(([key,placeholder])=>{
            // A skill picked in another slot is disabled here, so the same person can't
            // be recorded with one skill twice (which duplicated their name on the
            // Skills page). The current slot's own value stays selectable.
            const takenElsewhere = new Set(
              ["skill1","skill2","skill3"].filter(k=>k!==key).map(k=>value[k]).filter(Boolean)
            );
            return (
              <select key={key} value={value[key]||""} onChange={e=>onChange({...value,[key]:e.target.value})}>
                <option value="">{placeholder} (optional)</option>
                {SKILLS_LIST.map(s=>(
                  <option key={s} value={s} disabled={takenElsewhere.has(s)}>
                    {s}{takenElsewhere.has(s) ? " (already selected)" : ""}
                  </option>
                ))}
              </select>
            );
          })}
        </div>
      </div>

      <div className="field-group">
        <label className="field-label">Instruments <span style={{color:"#9ca3af",fontWeight:400,fontSize:10}}>(for musicians, choose any)</span></label>
        <div style={{display:"flex",flexWrap:"wrap",gap:8,marginTop:4}}>
          {INSTRUMENTS.map(inst=>{
            const sel = (value.instruments||"").split(",").map(s=>s.trim()).filter(Boolean);
            const on = sel.includes(inst);
            return (
              <label key={inst} style={{display:"inline-flex",alignItems:"center",gap:6,fontSize:12,color:"#374151",background:on?"#2a535712":"#f7f9fb",border:`1px solid ${on?"#2a535744":"#e4e9f5"}`,borderRadius:8,padding:"5px 10px",cursor:"pointer"}}>
                <input type="checkbox" checked={on} onChange={e=>{
                  const next = sel.filter(x=>x!==inst);
                  if (e.target.checked) next.push(inst);
                  onChange({...value, instruments: next.join(", ")});
                }} />
                {inst}
              </label>
            );
          })}
        </div>
      </div>

      <div className="field-group">
        <label className="field-label">City</label>
        <select value={value.city||""} onChange={u("city")}>
          <option value="">— Select City —</option>
          {TRINIDAD_CITIES.map(c=><option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div className="field-group">
        <label className="field-label">Other Skills <span style={{color:"#d1d5db",fontWeight:400,fontSize:10}}>(not in list above)</span></label>
        <input placeholder="e.g. Beekeeping, Sign Language, Pottery…" value={value.other_skills||""} onChange={u("other_skills")} />
      </div>

      <div className="field-group">
        <label className="field-label">Notes</label>
        <textarea rows={2} value={value.notes} onChange={u("notes")} style={{resize:"none"}} />
      </div>

      <div className="field-group">
        <label className="field-label">Roles & Ministries</label>
        <div style={{display:"flex",flexWrap:"wrap",gap:4,marginTop:6}}>
          {ROLES.map(r=>(
            <button key={r} className={`role-toggle ${value.roles.includes(r)?"on":""}`} onClick={()=>tr(r)}>
              {r}
            </button>
          ))}
        </div>
      </div>

      <div style={{display:"flex",gap:10,marginTop:6}}>
        <button className="btn-primary" style={{flex:1}} onClick={onSubmit} disabled={saving}>{saving?"Saving…":submitLabel}</button>
        <button className="btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </>
  );
}
