import { ROLES } from "../config";
/* ——— Utility ——— */
export function StatusBadge({ status, accent }) {
    const colors = {
        Paid: "#22c55e", Resolved: "#22c55e", Completed: "#22c55e", Accepted: "#22c55e",
        "In Progress": "#f59e0b", "En Route": "#f59e0b", Scheduled: "#3b82f6",
        Bidding: "#a78bfa", Open: "#6b7280", Pending: "#6b7280",
        Declined: "#ef4444", Late: "#ef4444", High: "#ef4444", Medium: "#f59e0b", Low: "#6b7280",
    };
    const color = colors[status] || accent;
    return (<span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-500" style={{ background: color + "22", color, fontWeight: 500, fontFamily: "'JetBrains Mono', monospace", whiteSpace: "nowrap" }}>
      {status}
    </span>);
}
export function Card({ children, className = "" }) {
    return (<div className={`rounded-2xl p-6 ${className}`} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
      {children}
    </div>);
}
export function StatCard({ label, value, sub }) {
    return (<div className="p-5 rounded-2xl" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
      <div className="text-white/30 mb-2 tracking-widest uppercase" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "9px" }}>{label}</div>
      <div className="text-2xl font-700 text-white" style={{ fontWeight: 700 }}>{value}</div>
      <div className="text-xs text-white/30 mt-1">{sub}</div>
    </div>);
}
const inputCls = "w-full px-4 py-3 rounded-xl text-white text-sm outline-none transition-all placeholder-white/20";
const inputBase = { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", fontFamily: "'Inter', sans-serif" };
export function InputField({ label, type = "text", value, onChange, placeholder, accent }) {
    return (<div>
      <label className="block text-xs font-500 text-white/35 mb-2 tracking-wider uppercase" style={{ fontWeight: 500 }}>{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={inputCls} style={inputBase} onFocus={(e) => (e.currentTarget.style.borderColor = accent)} onBlur={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)")}/>
    </div>);
}
/* ——— DASHBOARD SHELL ——— */
export function DashboardShell({ role, name, onLogout, onHome, notifCount, children }) {
    const r = ROLES[role];
    return (<div className="min-h-screen flex flex-col" style={{ background: "#0b0f1a", fontFamily: "'Outfit', sans-serif" }}>
      <header className="flex items-center justify-between px-8 py-4 border-b sticky top-0 z-10" style={{ borderColor: "rgba(255,255,255,0.06)", background: "#0b0f1a" }}>
        <div className="flex items-center gap-4">
          <button onClick={onHome} className="flex items-center gap-2 transition-opacity" style={{ opacity: 0.5 }} onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")} onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.5")}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 2L2 7h1.5v6h3.5V9h2v4h3.5V7H14L8 2z" fill="white"/>
            </svg>
            <span className="text-xs text-white font-mono tracking-[0.2em]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>PROPFLOW</span>
          </button>
          <div className="w-px h-4 bg-white/10"/>
          <div className="flex items-center gap-2" style={{ color: r.accent }}>
            {r.icon}
            <span className="text-sm font-500 text-white/60" style={{ fontWeight: 500 }}>{r.label} Portal</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-white/40 hidden sm:block">{name}</span>
          {notifCount !== undefined && notifCount > 0 && (<div className="flex items-center justify-center w-6 h-6 rounded-full text-xs font-700" style={{ background: r.accent, color: "#000", fontWeight: 700 }}>{notifCount}</div>)}
          <button onClick={onLogout} className="text-xs px-4 py-1.5 rounded-lg transition-colors" style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.08)" }} onMouseEnter={(e) => (e.currentTarget.style.color = "#fff")} onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.5)")}>Sign out</button>
        </div>
      </header>
      <main className="flex-1 overflow-auto p-6 sm:p-8">{children}</main>
    </div>);
}
