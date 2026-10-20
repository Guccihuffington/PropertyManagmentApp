import { ROLES } from "../config";
/* ——— LANDING ——— */
export default function Landing({ onSignIn, onSignUp }) {
    return (<div className="min-h-screen flex flex-col items-center justify-center px-6 py-16" style={{ background: "#0b0f1a", fontFamily: "'Outfit', sans-serif" }}>
      <div className="text-center mb-14 max-w-lg">
        <div className="text-xs font-mono tracking-[0.3em] text-white/25 mb-6" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
          PROPFLOW
        </div>
        <h1 className="text-6xl font-800 text-white tracking-tight leading-none mb-5" style={{ fontWeight: 800 }}>
          Property<br />Management,<br />Simplified.
        </h1>
        <p className="text-white/35 text-lg leading-relaxed">
          One platform for tenants, landlords, and contractors to manage every aspect of a property.
        </p>
      </div>

      <div className="flex gap-3 mb-20">
        <button onClick={onSignUp} className="px-8 py-3.5 rounded-xl font-600 text-sm tracking-wide transition-all" style={{ background: "#fff", color: "#0b0f1a", fontWeight: 600 }} onMouseEnter={(e) => (e.currentTarget.style.background = "#e5e7eb")} onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}>
          Create Account
        </button>
        <button onClick={onSignIn} className="px-8 py-3.5 rounded-xl font-600 text-sm tracking-wide transition-all" style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.8)", fontWeight: 600, border: "1px solid rgba(255,255,255,0.1)" }} onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.12)")} onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.08)")}>
          Sign In
        </button>
      </div>

      {/* Role preview cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-2xl">
        {["tenant", "landlord", "contractor"].map((role) => {
            const r = ROLES[role];
            return (<div key={role} className="p-5 rounded-2xl" style={{ background: r.accentDim, border: "1px solid rgba(255,255,255,0.06)" }}>
              <div className="mb-3" style={{ color: r.accent }}>{r.icon}</div>
              <div className="text-sm font-600 text-white mb-1" style={{ fontWeight: 600 }}>{r.label}</div>
              <div className="text-xs text-white/35 leading-relaxed">{r.desc}</div>
            </div>);
        })}
      </div>

      <p className="mt-14 text-white/15 text-xs" style={{ fontFamily: "'JetBrains Mono', monospace" }}>PROPFLOW v2.1 · © 2026</p>
    </div>);
}
