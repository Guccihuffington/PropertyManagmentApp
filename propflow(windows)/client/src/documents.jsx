import { downloadDoc } from "./api";
/* ——— Document data ——— */
export const DOC_ICONS = {
    Lease: <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="2" y="1" width="10" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.2"/><path d="M4.5 4.5h5M4.5 7h5M4.5 9.5h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>,
    Inspection: <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="6" cy="6" r="4" stroke="currentColor" strokeWidth="1.2"/><path d="M9.5 9.5L13 13" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>,
    Notice: <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 2v5M7 9.5v1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.2"/></svg>,
    Receipt: <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 1h10v11l-2-1.5L8 12l-1-1.5L6 12l-2-1.5L2 12V1z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/><path d="M4.5 5h5M4.5 7.5h3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/></svg>,
    Addendum: <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="2" y="1" width="10" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.2"/><path d="M5 7h4M7 5v4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>,
    Renewal: <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 7a5 5 0 0 1 9-3M12 7a5 5 0 0 1-9 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><path d="M11 4l2-1-1 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
};
export const DOC_COLORS = {
    Lease: "#3b82f6", Inspection: "#a78bfa", Notice: "#f59e0b", Receipt: "#22c55e", Addendum: "#ec4899", Renewal: "#06b6d4",
};
export const parseDocDate = (s) => new Date(s).getTime() || 0;
export const sortDocsByRecent = (docs) => [...docs].sort((a, b) => parseDocDate(b.date) - parseDocDate(a.date));
export function DocRow({ doc, accent }) {
    const color = DOC_COLORS[doc.type];
    return (<div className="flex items-center justify-between gap-4 px-4 py-3 rounded-xl transition-all" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }} onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.07)")} onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.03)")}>
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: color + "22", color }}>
          {DOC_ICONS[doc.type]}
        </div>
        <div className="min-w-0">
          <div className="text-sm text-white/80 truncate">{doc.name}</div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs" style={{ color, fontFamily: "'JetBrains Mono', monospace", fontSize: "9px" }}>{doc.type.toUpperCase()}</span>
            <span className="text-white/20 text-xs">·</span>
            <span className="text-xs text-white/30">{doc.date}</span>
            <span className="text-white/20 text-xs">·</span>
            <span className="text-xs text-white/25" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{doc.size}</span>
          </div>
        </div>
      </div>
      <button onClick={() => downloadDoc(doc)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-500 shrink-0 transition-all" style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.08)", fontWeight: 500 }} onMouseEnter={(e) => (e.currentTarget.style.color = "#fff")} onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.5)")}>
        <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
          <path d="M7 2v7M4 6l3 3 3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M2 11h10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
        </svg>
        Download
      </button>
    </div>);
}
