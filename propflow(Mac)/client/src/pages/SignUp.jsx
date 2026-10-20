import React, { useEffect, useState } from "react";
import { api } from "../api";
import { InputField } from "../components/Common";
import { ROLES } from "../config";
/* ——— SIGN UP ——— */
export default function SignUp({ onBack, onCreate, initialInviteCode = "" }) {
    const prefilled = /^\d{8}$/.test(initialInviteCode) ? initialInviteCode : "";
    const [step, setStep] = useState(prefilled ? "details" : "role");
    const [selectedRole, setSelectedRole] = useState(prefilled ? "tenant" : null);
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [company, setCompany] = useState("");
    const [phone, setPhone] = useState("");
    const [inviteCode, setInviteCode] = useState(prefilled);
    const [inviteResolved, setInviteResolved] = useState(null);
    useEffect(() => {
        if (prefilled)
            api(`/invites/${prefilled}`).then(setInviteResolved).catch(() => setInviteCode(""));
    }, []);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [verifyCode, setVerifyCode] = useState("");
    const [verifyInput, setVerifyInput] = useState("");
    const [verifyError, setVerifyError] = useState("");
    const [resendCooldown, setResendCooldown] = useState(0);
    const accent = selectedRole ? ROLES[selectedRole].accent : "#fff";
    const handleRoleSelect = (role) => {
        setSelectedRole(role);
        setStep("details");
    };
    const handleInviteCodeChange = (code) => {
        setInviteCode(code);
        const normalized = code.trim();
        if (normalized.length === 8)
            api(`/invites/${normalized}`).then(setInviteResolved).catch(() => setInviteResolved(null));
        else
            setInviteResolved(null);
    };
    const sendVerification = async () => {
        setLoading(true);
        try {
            const r = await api("/auth/send-code", { method: "POST", body: { email: email.trim().toLowerCase(), purpose: "verify" } });
            setVerifyCode(r.devCode || "");
            setVerifyInput("");
            setVerifyError("");
            startResendCooldown();
            return true;
        }
        catch (e) {
            setError(e.message);
            return false;
        }
        finally {
            setLoading(false);
        }
    };
    const finish = async (extra = {}) => {
        setLoading(true);
        try {
            await onCreate({ name: name.trim(), email: email.trim().toLowerCase(), password, role: selectedRole, phone: phone.trim(), company: company.trim() || undefined, inviteCode: inviteCode.trim() || undefined, ...extra });
        }
        catch (e) {
            if (e.message.startsWith("Incorrect or expired"))
                setVerifyError(e.message);
            else {
                setError(e.message);
                setStep("details");
            }
            setLoading(false);
        }
    };
    const startResendCooldown = () => {
        setResendCooldown(30);
        const t = setInterval(() => setResendCooldown((n) => { if (n <= 1) {
            clearInterval(t);
            return 0;
        } return n - 1; }), 1000);
    };
    const handleSubmit = (e) => {
        e.preventDefault();
        if (!name.trim()) {
            setError("Please enter your name.");
            return;
        }
        if (!email.trim()) {
            setError("Please enter your email.");
            return;
        }
        if (selectedRole === "tenant" && !phone.trim()) {
            setError("Please enter your phone number.");
            return;
        }
        if (selectedRole === "tenant" && inviteCode.trim() && !inviteResolved) {
            setError("Invalid invite code. Please check and try again.");
            return;
        }
        if (password.length < 6) {
            setError("Password must be at least 6 characters.");
            return;
        }
        if (password !== confirm) {
            setError("Passwords do not match.");
            return;
        }
        setError("");
        if (selectedRole === "tenant") {
            sendVerification().then((ok) => ok && setStep("verify"));
            return;
        }
        finish();
    };
    const handleVerify = () => finish({ verifyCode: verifyInput.trim() });
    return (<div className="min-h-screen flex flex-col items-center justify-center px-6 py-16" style={{ background: "#0b0f1a", fontFamily: "'Outfit', sans-serif" }}>
      <div className="w-full max-w-md">
        {/* Back */}
        {step !== "verify" && (<button onClick={step === "details" ? () => setStep("role") : onBack} className="flex items-center gap-2 text-sm mb-10 transition-opacity" style={{ color: "rgba(255,255,255,0.4)", opacity: 1 }} onMouseEnter={(e) => (e.currentTarget.style.color = "#fff")} onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.4)")}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M14 8H2M6 4L2 8l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {step === "details" ? "Choose role" : "Back to home"}
          </button>)}

        {/* Step indicator */}
        {step !== "verify" && (<div className="flex items-center gap-3 mb-8">
          {(selectedRole === "tenant" ? ["role", "details", "verify"] : ["role", "details"]).map((s, i, arr) => (<div key={s} className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-700" style={{ fontWeight: 700, background: step === s || (s !== "verify" && arr.indexOf(step) > i) ? accent : "rgba(255,255,255,0.08)", color: step === s || (s !== "verify" && arr.indexOf(step) > i) ? "#000" : "rgba(255,255,255,0.3)" }}>
                  {s !== "verify" && arr.indexOf(step) > i ? (<svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>) : i + 1}
                </div>
                <span className="text-xs text-white/40">{s === "role" ? "Choose role" : s === "details" ? "Your details" : "Verify email"}</span>
              </div>
              {i < arr.length - 1 && <div className="w-8 h-px bg-white/10"/>}
            </div>))}
        </div>)}

        {step === "role" && (<div>
            <h2 className="text-3xl font-800 text-white mb-2" style={{ fontWeight: 800 }}>Create your account</h2>
            <p className="text-white/40 mb-8">Select the role that describes you</p>
            <div className="flex flex-col gap-3">
              {["tenant", "landlord", "contractor"].map((role) => {
                const r = ROLES[role];
                return (<button key={role} onClick={() => handleRoleSelect(role)} className="flex items-center gap-4 p-5 rounded-2xl text-left transition-all" style={{ background: r.accentDim, border: "1px solid rgba(255,255,255,0.06)" }} onMouseEnter={(e) => { e.currentTarget.style.background = r.bg; e.currentTarget.style.borderColor = r.accent; }} onMouseLeave={(e) => { e.currentTarget.style.background = r.accentDim; e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)"; }}>
                    <div style={{ color: r.accent }}>{r.icon}</div>
                    <div className="flex-1">
                      <div className="text-base font-600 text-white" style={{ fontWeight: 600 }}>{r.label}</div>
                      <div className="text-xs text-white/40 mt-0.5">{r.desc}</div>
                    </div>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ color: r.accent }}>
                      <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>);
            })}
            </div>
          </div>)}

        {step === "details" && selectedRole && (<div>
            <div className="flex items-center gap-3 mb-6">
              <div style={{ color: ROLES[selectedRole].accent }}>{ROLES[selectedRole].icon}</div>
              <div>
                <h2 className="text-3xl font-800 text-white leading-tight" style={{ fontWeight: 800 }}>Your details</h2>
                <p className="text-white/40 text-sm">Signing up as <span style={{ color: ROLES[selectedRole].accentLight }}>{ROLES[selectedRole].label}</span></p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <InputField label="Full Name" value={name} onChange={setName} placeholder="Jane Smith" accent={accent}/>
              <InputField label="Email" type="email" value={email} onChange={setEmail} placeholder="you@example.com" accent={accent}/>
              {selectedRole === "tenant" && (<InputField label="Phone Number" type="tel" value={phone} onChange={setPhone} placeholder="+1 (555) 000-0000" accent={accent}/>)}
              {selectedRole === "tenant" && (<div className="flex flex-col gap-1.5">
                  <label className="text-xs font-500 text-white/50" style={{ fontWeight: 500 }}>
                    Landlord Invite Code <span className="text-white/25">(optional)</span>
                  </label>
                  <div className="relative">
                    <input value={inviteCode} onChange={(e) => handleInviteCodeChange(e.target.value.replace(/\D/g, "").slice(0, 8))} placeholder="8-digit code from your landlord" maxLength={8} className="w-full px-4 py-3 rounded-xl text-sm text-white outline-none transition-all" style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${inviteResolved ? "#22c55e" : inviteCode.length === 8 && !inviteResolved ? "#ef4444" : "rgba(255,255,255,0.1)"}`, fontFamily: inviteCode ? "'JetBrains Mono', monospace" : "inherit", letterSpacing: inviteCode ? "0.18em" : "normal" }}/>
                    {inviteResolved && (<div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" fill="rgba(34,197,94,0.2)" stroke="#22c55e" strokeWidth="1.2"/><path d="M5 8l2 2 4-4" stroke="#22c55e" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      </div>)}
                  </div>
                  {inviteResolved && (<div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: "rgba(34,197,94,0.07)", border: "1px solid rgba(34,197,94,0.2)" }}>
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 5.5l3 3 5-5" stroke="#22c55e" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      <span className="text-xs" style={{ color: "#4ade80" }}>
                        Linked to <strong>{inviteResolved.unit}</strong> at {inviteResolved.address}
                      </span>
                    </div>)}
                </div>)}
              {selectedRole === "contractor" && (<InputField label="Company Name (optional)" value={company} onChange={setCompany} placeholder="Smith Repairs LLC" accent={accent}/>)}
              <InputField label="Password" type="password" value={password} onChange={setPassword} placeholder="Min. 6 characters" accent={accent}/>
              <InputField label="Confirm Password" type="password" value={confirm} onChange={setConfirm} placeholder="Repeat password" accent={accent}/>

              {error && (<div className="text-xs px-4 py-3 rounded-xl" style={{ background: "rgba(239,68,68,0.1)", color: "#f87171", border: "1px solid rgba(239,68,68,0.2)" }}>
                  {error}
                </div>)}

              <button type="submit" disabled={loading} className="w-full py-3.5 rounded-xl font-600 text-sm mt-2 transition-all" style={{ background: accent, color: "#000", fontWeight: 600, opacity: loading ? 0.7 : 1 }}>
                {loading ? "Creating account…" : "Create Account"}
              </button>
            </form>
          </div>)}

        {step !== "verify" && (<p className="mt-8 text-center text-xs text-white/20">
            Already have an account?{" "}
            <button className="underline" style={{ color: "rgba(255,255,255,0.45)" }} onClick={onBack}>Sign in instead</button>
          </p>)}

        {/* ——— Verify email step ——— */}
        {step === "verify" && (<div className="flex flex-col items-center text-center gap-6">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: `${accent}18`, border: `1px solid ${accent}33` }}>
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                <rect x="2" y="6" width="24" height="16" rx="3" stroke={accent} strokeWidth="1.6"/>
                <path d="M2 9l12 8 12-8" stroke={accent} strokeWidth="1.6" strokeLinecap="round"/>
              </svg>
            </div>
            <div>
              <h2 className="text-2xl font-800 text-white mb-2" style={{ fontWeight: 800 }}>Verify your email</h2>
              <p className="text-sm text-white/40 leading-relaxed">
                We sent a 6-digit code to<br />
                <span className="text-white/70">{email}</span>
              </p>
            </div>

            {/* Demo hint */}
            {verifyCode && (<div className="w-full flex items-center gap-3 px-4 py-3 rounded-xl" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="6" stroke="rgba(255,255,255,0.2)" strokeWidth="1.2"/><path d="M7 6v4M7 4.5v.5" stroke="rgba(255,255,255,0.2)" strokeWidth="1.2" strokeLinecap="round"/></svg>
              <span className="text-xs text-white/30">Demo mode — your code is </span>
              <span className="text-xs font-700 text-white/60" style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, letterSpacing: "0.18em" }}>{verifyCode}</span>
            </div>)}

            {/* Code input */}
            <div className="w-full flex flex-col gap-2">
              <input value={verifyInput} onChange={(e) => { setVerifyInput(e.target.value.replace(/\D/g, "").slice(0, 6)); setVerifyError(""); }} onKeyDown={(e) => e.key === "Enter" && verifyInput.length === 6 && handleVerify()} placeholder="— — — — — —" maxLength={6} className="w-full text-center text-2xl font-700 py-4 rounded-xl text-white outline-none transition-all" style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${verifyError ? "#ef4444" : verifyInput.length === 6 ? accent : "rgba(255,255,255,0.1)"}`, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, letterSpacing: "0.35em" }}/>
              {verifyError && (<p className="text-xs text-red-400">{verifyError}</p>)}
            </div>

            <button onClick={handleVerify} disabled={verifyInput.length !== 6 || loading} className="w-full py-3.5 rounded-xl font-600 text-sm transition-all" style={{ background: verifyInput.length === 6 ? accent : "rgba(255,255,255,0.07)", color: verifyInput.length === 6 ? "#000" : "rgba(255,255,255,0.2)", fontWeight: 600, cursor: verifyInput.length === 6 ? "pointer" : "not-allowed", opacity: loading ? 0.7 : 1 }}>
              {loading ? "Verifying…" : "Verify & Create Account"}
            </button>

            <div className="flex flex-col items-center gap-1">
              <p className="text-xs text-white/25">Didn{"'"}t receive the email?</p>
              {resendCooldown > 0
                ? <p className="text-xs text-white/20">Resend in {resendCooldown}s</p>
                : <button onClick={() => { sendVerification(); }} className="text-xs underline transition-colors" style={{ color: "rgba(255,255,255,0.4)" }} onMouseEnter={(e) => (e.currentTarget.style.color = "#fff")} onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.4)")}>
                    Resend code
                  </button>}
              <button onClick={() => setStep("details")} className="text-xs underline mt-1 transition-colors" style={{ color: "rgba(255,255,255,0.25)" }} onMouseEnter={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.5)")} onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.25)")}>
                Wrong email? Go back
              </button>
            </div>
          </div>)}
      </div>
    </div>);
}
/* ——— LOGIN ——— */
