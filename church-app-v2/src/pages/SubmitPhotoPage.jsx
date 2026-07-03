import { useState } from "react";
import "../styles.css";
import { supabase } from "../supabase";
import { resizeImage } from "../components";
import { Check, User, ShieldCheck } from "lucide-react";

const TEAL = "#2a5357";

export default function SubmitPhotoPage() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) { setError("Please choose an image file (JPG or PNG)."); return; }
    setError(""); setUploading(true);
    try {
      const blob = await resizeImage(file);
      const path = `submissions/${crypto.randomUUID()}.jpg`;
      const { error: upErr } = await supabase.storage.from("photo-submissions").upload(path, blob, { contentType: "image/jpeg", upsert: true });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from("photo-submissions").getPublicUrl(path);
      setPhotoUrl(data.publicUrl);
    } catch (err) {
      setError(err.message?.includes("Bucket not found")
        ? "Photo uploads aren't set up yet. Please let the church office know."
        : (err.message || "Upload failed. Please try again."));
    } finally { setUploading(false); }
  }

  async function submit() {
    setError("");
    if (!firstName.trim() || !lastName.trim()) { setError("Please enter your first and last name."); return; }
    if (!photoUrl) { setError("Please add a photo before submitting."); return; }
    setSubmitting(true);
    try {
      const { error: insErr } = await supabase.from("photo_submissions").insert({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        photo_url: photoUrl,
        status: "pending",
      });
      if (insErr) throw insErr;
      setDone(true);
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally { setSubmitting(false); }
  }

  const page = {
    minHeight: "100vh", background: "#f4f6fa", display: "flex",
    flexDirection: "column", alignItems: "center", padding: "0 0 40px",
    fontFamily: "'Inter',system-ui,sans-serif",
  };
  const card = {
    width: "100%", maxWidth: 420, background: "#fff", minHeight: "100vh",
    boxShadow: "0 0 40px #0000000d",
  };

  if (done) {
    return (
      <div style={page}>
        <div style={card}>
          <div style={{ background: TEAL, padding: "22px 22px 20px" }}>
            <div style={{ fontSize: 12, color: "#9fe1cb", letterSpacing: 0.3 }}>Righteousness Peace and Joy Fellowship</div>
            <div style={{ fontSize: 20, color: "#fff", fontWeight: 700, marginTop: 3 }}>Photo submitted</div>
          </div>
          <div style={{ padding: 28, textAlign: "center" }}>
            <div style={{ width: 72, height: 72, borderRadius: "50%", background: "#e1f5ee", display: "flex", alignItems: "center", justifyContent: "center", margin: "10px auto 18px", }}><Check size={36} color="#2a7a50" /></div>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#111827", marginBottom: 8 }}>Thank you, {firstName}!</div>
            <div style={{ fontSize: 14, color: "#6b7280", lineHeight: 1.7, maxWidth: 320, margin: "0 auto" }}>
              Your photo has been sent to the church office. An administrator will review and approve it, and then it will appear on your membership record.
            </div>
            <button
              onClick={() => { setFirstName(""); setLastName(""); setPhotoUrl(""); setDone(false); }}
              style={{ marginTop: 26, background: "none", border: `1.5px solid ${TEAL}55`, color: TEAL, padding: "10px 20px", borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              Submit another photo
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={page}>
      <div style={card}>
        <div style={{ background: TEAL, padding: "22px 22px 20px" }}>
          <div style={{ fontSize: 12, color: "#9fe1cb", letterSpacing: 0.3 }}>Righteousness Peace and Joy Fellowship</div>
          <div style={{ fontSize: 20, color: "#fff", fontWeight: 700, marginTop: 3 }}>Submit your photo</div>
          <div style={{ fontSize: 13, color: "#cdeae3", marginTop: 5, lineHeight: 1.5 }}>Add a photo to your membership record.</div>
        </div>

        <div style={{ padding: 22 }}>
          {/* Step 1 — name */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <span style={{ width: 22, height: 22, borderRadius: "50%", background: "#e1f5ee", color: "#0f6e56", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>1</span>
            <span style={{ fontSize: 15, fontWeight: 700, color: "#111827" }}>Your name</span>
          </div>
          <div style={{ display: "flex", gap: 10, marginBottom: 6 }}>
            <div style={{ width: "50%" }}>
              <label className="field-label">First name</label>
              <input placeholder="First" value={firstName} onChange={e => setFirstName(e.target.value)} />
            </div>
            <div style={{ width: "50%" }}>
              <label className="field-label">Last name</label>
              <input placeholder="Last" value={lastName} onChange={e => setLastName(e.target.value)} />
            </div>
          </div>
          <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 6, lineHeight: 1.5 }}>
            Used only to match you to your record — never shown publicly.
          </div>

          {/* Step 2 — photo */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "22px 0 8px" }}>
            <span style={{ width: 22, height: 22, borderRadius: "50%", background: "#e1f5ee", color: "#0f6e56", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>2</span>
            <span style={{ fontSize: 15, fontWeight: 700, color: "#111827" }}>Your photo</span>
          </div>
          <div style={{ fontSize: 12.5, color: "#6b7280", marginBottom: 12, lineHeight: 1.5 }}>
            A clear head-and-shoulders photo of just yourself works best.
          </div>

          <div style={{ border: "1.5px dashed #cbd5e1", borderRadius: 14, padding: 20, textAlign: "center" }}>
            <div style={{ width: 96, height: 96, borderRadius: "50%", background: photoUrl ? "transparent" : "#eef1f6", border: "1px solid #e4e9f5", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", margin: "0 auto 14px" }}>
              {photoUrl
                ? <img src={photoUrl} alt="Your preview" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                : <span style={{ display:"flex", color: "#c0c8e0" }}><User size={40} /></span>}
            </div>
            <label style={{ display: "inline-block", background: TEAL, color: "#fff", padding: "10px 18px", borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
              {uploading ? "Uploading…" : photoUrl ? "Change photo" : "Take or choose a photo"}
              <input type="file" accept="image/*" onChange={handleFile} disabled={uploading} style={{ display: "none" }} />
            </label>
            {photoUrl && !uploading && (
              <button onClick={() => setPhotoUrl("")} style={{ display: "block", margin: "10px auto 0", background: "none", border: "none", color: "#e05050", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Remove</button>
            )}
            <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 12 }}>JPG or PNG · automatically resized for you</div>
          </div>

          {/* Review note */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8, background: "#eef6ff", border: "1px solid #d6e4fb", borderRadius: 10, padding: "11px 13px", marginTop: 18 }}>
            <span style={{ display:"flex", flexShrink: 0 }}><ShieldCheck size={16} color="#4caf82" /></span>
            <span style={{ fontSize: 12.5, color: "#345", lineHeight: 1.55 }}>An administrator reviews and approves every photo before it appears.</span>
          </div>

          {error && (
            <div style={{ background: "#fdecec", border: "1px solid #f5c4c4", color: "#b91c1c", borderRadius: 10, padding: "10px 13px", marginTop: 14, fontSize: 13, lineHeight: 1.5 }}>
              {error}
            </div>
          )}

          <button
            onClick={submit}
            disabled={submitting || uploading}
            style={{ width: "100%", marginTop: 18, background: TEAL, color: "#fff", border: "none", padding: 13, fontSize: 15, fontWeight: 700, borderRadius: 11, cursor: submitting ? "default" : "pointer", opacity: (submitting || uploading) ? 0.7 : 1, fontFamily: "inherit" }}>
            {submitting ? "Submitting…" : "Submit photo"}
          </button>
        </div>
      </div>
    </div>
  );
}
