import React, { useState } from "react";
import { InputField } from "../components/Common";
import { ROLES } from "../config";
import { api } from "../api";
/* ——— LOGIN ——— */
function ForgotPanel({ onBack }) {
    const [step, setStep] = useState("email");
    const [email, setEmail] = useState("");
    const [code, setCode] = useState("");
    const [devCode, setDevCode] = useState("");
    const [pw, setPw] = useState("");
    const [err, setErr] = useState("");
    const [busy, setBusy] = useState(false);
    const run = (fn) => async (e) => {
        e.preventDefault();
        setErr("");
        setBusy(true);
        try { await fn(); } catch (x) { setErr(x.message); } finally { setBusy(false); }
    };
    const send = run(async () => {
        const r = await api("/auth/send-code", { method: "POST", body: { email: email.trim(), purpose: "reset" } });
        setDevCode(r.devCode || "");
        setStep("code");
    });
    const reset = run(async () => {
        await api("/auth/reset", { method: "POST", body: { email: email.trim(), code: code.trim(), password: pw } });
        setStep("done");
    });
    const btn = { background: "#fff", color: "#0b0f1a", fontWeight: 600 };
    return (<div className="flex flex-col gap-4">
      <h3 className="text-xl text-white" style={{ fontWeight: 700 }}>Reset your password</h3>
      {step === "email" && (<form onSubmit={send} className="flex flex-col gap-4">
          <p className="text-sm text-white/40">Enter your account email and we{"'"}ll send you a 6-digit code.</p>
          <InputField label="Email" type="email" value={email} onChange={setEmail} placeholder="you@example.com" accent="#fff"/>
          <button type="submit" disabled={busy || !email.trim()} className="w-full py-3.5 rounded-xl text-sm" style={btn}>{busy ? "Sending…" : "Send code"}</button>
        </form>)}
      {step === "code" && (<form onSubmit={reset} className="flex flex-col gap-4">
          <p className="text-sm text-white/40">If that email has an account, a code is on its way.</p>
          {devCode && (<div className="px-4 py-3 rounded-xl text-xs text-white/40" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>Demo mode — your code is <span className="text-white/70" style={{ fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.18em", fontWeight: 700 }}>{devCode}</span></div>)}
          <InputField label="6-digit code" value={code} onChange={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))} placeholder="123456" accent="#fff"/>
          <InputField label="New password" type="password" value={pw} onChange={setPw} placeholder="At least 6 characters" accent="#fff"/>
          <button type="submit" disabled={busy || code.length !== 6 || pw.length < 6} className="w-full py-3.5 rounded-xl text-sm" style={{ ...btn, opacity: code.length === 6 && pw.length >= 6 ? 1 : 0.5 }}>{busy ? "Saving…" : "Set new password"}</button>
        </form>)}
      {step === "done" && (<p className="text-sm" style={{ color: "#86efac" }}>Password updated. You can sign in now.</p>)}
      {err && (<div className="text-xs px-4 py-3 rounded-xl" style={{ background: "rgba(239,68,68,0.1)", color: "#f87171", border: "1px solid rgba(239,68,68,0.2)" }}>{err}</div>)}
      <button type="button" onClick={onBack} className="text-xs text-white/40 hover:text-white/70 transition-colors w-fit">← Back to sign in</button>
    </div>);
}
export default function Login({ onBack, onLogin }) {
    const [forgot, setForgot] = useState(false);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");
        setLoading(true);
        try {
            await onLogin(email.trim(), password);
        }
        catch (x) {
            setError(x.message);
            setLoading(false);
        }
    };
    return (<div className="min-h-screen flex" style={{ fontFamily: "'Outfit', sans-serif", background: "#0b0f1a" }}>
      {/* Left */}
      <div className="flex-1 flex flex-col justify-between p-10 lg:p-14 max-w-lg">
        <button onClick={onBack} className="flex items-center gap-2 text-sm w-fit transition-colors" style={{ color: "rgba(255,255,255,0.35)" }} onMouseEnter={(e) => (e.currentTarget.style.color = "#fff")} onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.35)")}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M14 8H2M6 4L2 8l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Back
        </button>

        <div>
          <div className="mb-10">
            <div className="text-xs font-mono tracking-[0.3em] text-white/25 mb-5" style={{ fontFamily: "'JetBrains Mono', monospace" }}>PROPFLOW</div>
            <h2 className="text-4xl font-800 text-white mb-2" style={{ fontWeight: 800 }}>Welcome back.</h2>
            <p className="text-white/35">Sign in to your account — tenant, landlord, or contractor.</p>
          </div>

          {forgot ? <ForgotPanel onBack={() => setForgot(false)}/> : (<form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <InputField label="Email" type="email" value={email} onChange={setEmail} placeholder="you@example.com" accent="#fff"/>
            <InputField label="Password" type="password" value={password} onChange={setPassword} placeholder="••••••••" accent="#fff"/>

            <div className="flex justify-end">
              <button type="button" onClick={() => setForgot(true)} className="text-xs text-white/30 hover:text-white/60 transition-colors">Forgot password?</button>
            </div>

            {error && (<div className="text-xs px-4 py-3 rounded-xl" style={{ background: "rgba(239,68,68,0.1)", color: "#f87171", border: "1px solid rgba(239,68,68,0.2)" }}>
                {error}
              </div>)}

            <button type="submit" disabled={loading} className="w-full py-3.5 rounded-xl font-600 text-sm mt-1 transition-all" style={{ background: "#fff", color: "#0b0f1a", fontWeight: 600, opacity: loading ? 0.7 : 1 }}>
              {loading ? "Signing in…" : "Sign In"}
            </button>
          </form>)}

          <p className="mt-6 text-center text-xs text-white/20">
            Don&apos;t have an account?{" "}
            <button className="underline text-white/45 hover:text-white/70 transition-colors" onClick={onBack}>
              Create one
            </button>
          </p>

        </div>

        <p className="text-white/15 text-xs" style={{ fontFamily: "'JetBrains Mono', monospace" }}>PROPFLOW · Secure Login</p>
      </div>

      {/* Right — graphic */}
      <div className="hidden lg:flex flex-1 flex-col items-center justify-center p-14" style={{ background: "rgba(255,255,255,0.02)", borderLeft: "1px solid rgba(255,255,255,0.05)" }}>
        <div className="w-full max-w-xs flex flex-col gap-4">
          {["tenant", "landlord", "contractor"].map((role) => {
            const r = ROLES[role];
            return (<div key={role} className="flex items-center gap-4 p-4 rounded-2xl" style={{ background: r.accentDim, border: `1px solid ${r.accent}33` }}>
                <div style={{ color: r.accent }}>{r.icon}</div>
                <div>
                  <div className="text-sm font-600 text-white" style={{ fontWeight: 600 }}>{r.label}</div>
                  <div className="text-xs text-white/35">{r.desc}</div>
                </div>
              </div>);
        })}
          <p className="text-center text-white/20 text-xs mt-4">One login for any role</p>
        </div>
      </div>
    </div>);
}
