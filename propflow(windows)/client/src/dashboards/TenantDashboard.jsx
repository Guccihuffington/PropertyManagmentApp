import React, { useCallback, useEffect, useRef, useState } from "react";
import { api, fileToDataUrl } from "../api";
import { Card, DashboardShell, StatCard, StatusBadge } from "../components/Common";
import { ROLES } from "../config";
import { DOC_COLORS, DocRow, sortDocsByRecent } from "../documents";
export default function TenantDashboard({ account, onLogout, onHome, requests = [], onRefresh = () => { } }) {
    const r = ROLES.tenant;
    const firstName = account.name.split(" ")[0];
    const [showAllPayments, setShowAllPayments] = useState(false);
    const [tenantTab, setTenantTab] = useState("home");
    const [showUploadModal, setShowUploadModal] = useState(false);
    const [uploadFile, setUploadFile] = useState(null);
    const [uploadDocType, setUploadDocType] = useState("Lease");
    const tenantFileRef = useRef(null);
    const handleTenantFileChange = (e) => {
        const f = e.target.files?.[0];
        if (!f)
            return;
        setUploadFile(f);
        setShowUploadModal(true);
        e.target.value = "";
    };
    const confirmTenantUpload = async () => {
        if (!uploadFile)
            return;
        try {
            const dataUrl = await fileToDataUrl(uploadFile);
            await api("/documents", { method: "POST", body: { name: uploadFile.name.replace(/\.[^/.]+$/, ""), type: uploadDocType, dataUrl } });
            setUploadFile(null);
            setShowUploadModal(false);
            loadHome();
        }
        catch (e) {
            window.alert(e.message);
        }
    };
    const [showNewRequest, setShowNewRequest] = useState(false);
    const [newReqDesc, setNewReqDesc] = useState("");
    const [newReqPriority, setNewReqPriority] = useState("Medium");
    const [newReqRoom, setNewReqRoom] = useState("");
    const [newReqType, setNewReqType] = useState("");
    const [home, setHome] = useState(null);
    const [docs, setDocs] = useState([]);
    const loadHome = useCallback(() => {
        api("/tenant/home").then(setHome).catch(() => { });
        api("/documents").then(setDocs).catch(() => { });
    }, []);
    useEffect(() => { loadHome(); }, [loadHome, requests.length, tenantTab]);
    useEffect(() => {
        const t = setInterval(() => { if (!document.hidden)
            loadHome(); }, 15000);
        return () => clearInterval(t);
    }, [loadHome]);
    const money = (n) => `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: n % 1 ? 2 : 0 })}`;
    const nextRent = home?.nextRent;
    const balance = home?.balance ?? 0;
    const unitLabel = home?.lease ? `${home.lease.unit} — ${home.lease.address}` : "No unit assigned yet — ask your landlord for an invite code";
    const rentTitle = !home?.lease ? "No active lease" : balance > 0 ? `Rent past due — ${money(balance)}` : nextRent ? `${nextRent.month} rent due ${nextRent.daysUntil <= 0 ? "today" : `in ${nextRent.daysUntil} days`}` : "You're all paid up";
    const rentSub = nextRent || balance > 0 ? `${money(balance > 0 ? balance : nextRent.amount)} · Auto-pay not configured` : "Nothing due right now";
    const payNow = async () => {
        try {
            await api("/tenant/pay", { method: "POST" });
            loadHome();
            onRefresh();
        }
        catch (e) {
            window.alert(e.message);
        }
    };
    const localRequests = requests.map((q) => ({ id: q.id, desc: q.issue, status: q.status, date: q.date }));
    const submitNewRequest = async () => {
        if (!newReqDesc.trim())
            return;
        try {
            await api("/requests", { method: "POST", body: { description: newReqDesc.trim(), priority: newReqPriority, room: newReqRoom, type: newReqType } });
            setNewReqDesc("");
            setNewReqPriority("Medium");
            setNewReqRoom("");
            setNewReqType("");
            setShowNewRequest(false);
            onRefresh();
        }
        catch (e) {
            window.alert(e.message);
        }
    };
    const payments = home?.payments ?? [];
    const recentPayments = payments.slice(0, 3);
    const totalPaid = payments.reduce((s, p) => s + p.amount, 0);
    const lateCount = payments.filter((p) => p.status === "Late").length;
    return (<DashboardShell role="tenant" name={account.name} onLogout={onLogout} onHome={onHome}>
      {/* New maintenance request modal */}
      {showNewRequest && (<div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }} onClick={() => setShowNewRequest(false)}>
          <div className="w-full max-w-md rounded-2xl overflow-hidden" style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.1)" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-5 border-b" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
              <h3 className="text-lg font-600 text-white" style={{ fontWeight: 600 }}>New Maintenance Request</h3>
              <button onClick={() => setShowNewRequest(false)} className="w-8 h-8 flex items-center justify-center rounded-lg" style={{ color: "rgba(255,255,255,0.4)", background: "rgba(255,255,255,0.06)" }} onMouseEnter={(e) => (e.currentTarget.style.color = "#fff")} onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.4)")}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
              </button>
            </div>
            <div className="px-6 py-6 flex flex-col gap-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-white/40 mb-2 uppercase tracking-widest" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "9px" }}>Room / Area</label>
                  <select value={newReqRoom} onChange={(e) => setNewReqRoom(e.target.value)} className="w-full px-3 py-2.5 rounded-xl text-sm text-white outline-none transition-all appearance-none" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", color: newReqRoom ? "#fff" : "rgba(255,255,255,0.25)" }} onFocus={(e) => (e.currentTarget.style.borderColor = r.accent + "66")} onBlur={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.09)")}>
                    <option value="" disabled style={{ background: "#111827" }}>Select room…</option>
                    {["Kitchen", "Bathroom", "Bedroom", "Living Room", "Hallway", "Laundry Room", "Garage", "Basement", "Exterior", "Other"].map((rm) => (<option key={rm} value={rm} style={{ background: "#111827" }}>{rm}</option>))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-white/40 mb-2 uppercase tracking-widest" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "9px" }}>Problem Type</label>
                  <select value={newReqType} onChange={(e) => setNewReqType(e.target.value)} className="w-full px-3 py-2.5 rounded-xl text-sm text-white outline-none transition-all appearance-none" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", color: newReqType ? "#fff" : "rgba(255,255,255,0.25)" }} onFocus={(e) => (e.currentTarget.style.borderColor = r.accent + "66")} onBlur={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.09)")}>
                    <option value="" disabled style={{ background: "#111827" }}>Select type…</option>
                    {["Plumbing", "Electrical", "HVAC / Heating", "Appliance", "Pest Control", "Structural", "Lock / Security", "Water Damage", "Mold", "Noise", "Other"].map((tp) => (<option key={tp} value={tp} style={{ background: "#111827" }}>{tp}</option>))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs text-white/40 mb-2 uppercase tracking-widest" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "9px" }}>Description</label>
                <textarea value={newReqDesc} onChange={(e) => setNewReqDesc(e.target.value)} placeholder="Describe the issue in detail…" rows={3} className="w-full px-4 py-3 rounded-xl text-sm text-white placeholder-white/25 outline-none resize-none transition-all" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)" }} onFocus={(e) => (e.currentTarget.style.borderColor = r.accent + "66")} onBlur={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.09)")}/>
              </div>
              <div>
                <label className="block text-xs text-white/40 mb-2 uppercase tracking-widest" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "9px" }}>Priority</label>
                <div className="flex gap-2">
                  {["Low", "Medium", "High"].map((p) => {
                const colors = { Low: "#22c55e", Medium: "#f59e0b", High: "#ef4444" };
                const active = newReqPriority === p;
                return (<button key={p} onClick={() => setNewReqPriority(p)} className="flex-1 py-2 rounded-xl text-xs font-500 transition-all" style={{ fontWeight: 500, background: active ? colors[p] + "22" : "rgba(255,255,255,0.04)", color: active ? colors[p] : "rgba(255,255,255,0.35)", border: `1px solid ${active ? colors[p] + "55" : "rgba(255,255,255,0.08)"}` }}>
                        {p}
                      </button>);
            })}
                </div>
              </div>
              <div className="text-xs text-white/25 px-1" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                {unitLabel}
              </div>
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button onClick={() => setShowNewRequest(false)} className="flex-1 py-2.5 rounded-xl text-sm transition-all" style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.4)", border: "1px solid rgba(255,255,255,0.08)" }}>
                Cancel
              </button>
              <button onClick={submitNewRequest} className="flex-1 py-2.5 rounded-xl text-sm font-600 transition-all" style={{ background: newReqDesc.trim() ? r.accent : "rgba(255,255,255,0.08)", color: newReqDesc.trim() ? "#000" : "rgba(255,255,255,0.2)", fontWeight: 600, cursor: newReqDesc.trim() ? "pointer" : "not-allowed" }}>
                Submit Request
              </button>
            </div>
          </div>
        </div>)}

      {/* Full payment history modal */}
      {showAllPayments && (<div className="fixed inset-0 z-40 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }} onClick={() => setShowAllPayments(false)}>
          <div className="w-full max-w-2xl rounded-2xl overflow-hidden flex flex-col" style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.1)", maxHeight: "85vh" }} onClick={(e) => e.stopPropagation()}>
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-5 border-b shrink-0" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
              <div>
                <h3 className="text-lg font-600 text-white" style={{ fontWeight: 600 }}>Full Payment History</h3>
                <p className="text-xs text-white/35 mt-0.5">{unitLabel}</p>
              </div>
              <button onClick={() => setShowAllPayments(false)} className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors" style={{ color: "rgba(255,255,255,0.4)", background: "rgba(255,255,255,0.06)" }} onMouseEnter={(e) => (e.currentTarget.style.color = "#fff")} onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.4)")}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
            </div>

            {/* Summary strip */}
            <div className="grid grid-cols-3 gap-px shrink-0" style={{ background: "rgba(255,255,255,0.06)" }}>
              {[
                { label: "Total Paid", value: `$${totalPaid.toLocaleString()}`, color: "rgba(255,255,255,0.8)" },
                { label: "Months on Record", value: payments.length, color: "rgba(255,255,255,0.8)" },
                { label: "Late Payments", value: lateCount, color: lateCount > 0 ? "#fca5a5" : "#86efac" },
            ].map((s) => (<div key={s.label} className="px-5 py-4" style={{ background: "#111827" }}>
                  <div className="text-xs text-white/30 mb-1" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "9px" }}>{s.label}</div>
                  <div className="text-xl font-700" style={{ fontWeight: 700, color: s.color }}>{s.value}</div>
                </div>))}
            </div>

            {/* Scrollable rows */}
            <div className="overflow-y-auto flex-1">
              {/* Column headers */}
              <div className="grid px-6 py-3 text-white/25 uppercase tracking-widest sticky top-0" style={{ gridTemplateColumns: "1fr auto auto auto", gap: "1rem", fontFamily: "'JetBrains Mono', monospace", fontSize: "9px", background: "#111827", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <span>Period</span>
                <span>Method</span>
                <span className="text-right">Amount</span>
                <span className="text-right">Status</span>
              </div>
              <div className="divide-y" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
                {payments.map((p) => (<div key={p.ref} className="grid items-center px-6 py-4 transition-colors" style={{ gridTemplateColumns: "1fr auto auto auto", gap: "1rem", background: "transparent" }} onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.03)")} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                    <div>
                      <div className="text-sm text-white/80">{p.month}</div>
                      <div className="text-xs text-white/30 mt-0.5" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{p.date} · {p.ref}</div>
                    </div>
                    <span className="text-xs text-white/40">{p.method}</span>
                    <span className="text-sm font-600 text-right" style={{ fontWeight: 600, fontFamily: "'JetBrains Mono', monospace", color: p.status === "Late" ? "#fca5a5" : "#86efac" }}>
                      ${p.amount.toLocaleString()}
                    </span>
                    <div className="flex justify-end">
                      <StatusBadge status={p.status === "Late" ? "Late" : "Paid"} accent={r.accent}/>
                    </div>
                  </div>))}
              </div>
            </div>

            <div className="px-6 py-4 border-t shrink-0 flex justify-end" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
              <button className="text-xs px-4 py-2 rounded-lg transition-all" style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.08)" }} onClick={() => setShowAllPayments(false)}>
                Close
              </button>
            </div>
          </div>
        </div>)}

      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-800 text-white mb-1" style={{ fontWeight: 800 }}>Hello, {firstName}.</h1>
          <p className="text-white/40 text-sm">{unitLabel}</p>
        </div>
        {/* Tenant tab bar */}
        <div className="flex gap-1 p-1 rounded-xl mb-8 w-fit" style={{ background: "rgba(255,255,255,0.05)" }}>
          {["home", "documents"].map((t) => (<button key={t} onClick={() => setTenantTab(t)} className="px-5 py-2 rounded-lg text-sm font-500 transition-all capitalize" style={{
                fontWeight: 500,
                background: tenantTab === t ? "rgba(255,255,255,0.1)" : "transparent",
                color: tenantTab === t ? "#fff" : "rgba(255,255,255,0.4)",
                border: tenantTab === t ? "1px solid rgba(255,255,255,0.12)" : "1px solid transparent",
            }}>
              {t === "home" ? "Overview" : "Documents"}
            </button>))}
        </div>

        {tenantTab === "documents" && (<div>
            {/* Upload modal */}
            {showUploadModal && uploadFile && (<div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }} onClick={() => setShowUploadModal(false)}>
                <div className="w-full max-w-sm rounded-2xl overflow-hidden" style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.1)" }} onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-between px-6 py-5 border-b" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
                    <h3 className="text-base font-600 text-white" style={{ fontWeight: 600 }}>Upload Document</h3>
                    <button onClick={() => setShowUploadModal(false)} className="w-8 h-8 flex items-center justify-center rounded-lg" style={{ color: "rgba(255,255,255,0.4)", background: "rgba(255,255,255,0.06)" }} onMouseEnter={(e) => (e.currentTarget.style.color = "#fff")} onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.4)")}>
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                    </button>
                  </div>
                  <div className="px-6 py-6 flex flex-col gap-5">
                    <div className="flex items-center gap-3 px-4 py-3 rounded-xl" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                      <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="3" y="2" width="12" height="14" rx="2" stroke="rgba(255,255,255,0.4)" strokeWidth="1.3"/><path d="M6 6h6M6 9h6M6 12h4" stroke="rgba(255,255,255,0.3)" strokeWidth="1.2" strokeLinecap="round"/></svg>
                      <div className="min-w-0">
                        <div className="text-sm text-white/80 truncate">{uploadFile.name}</div>
                        <div className="text-xs text-white/30 mt-0.5">{Math.round(uploadFile.size / 1024)} KB</div>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-white/40 mb-2 uppercase tracking-widest" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "9px" }}>Document Type</label>
                      <div className="flex flex-wrap gap-2">
                        {["Lease", "Inspection", "Notice", "Receipt", "Addendum", "Renewal"].map((t) => {
                    const active = uploadDocType === t;
                    const color = DOC_COLORS[t];
                    return (<button key={t} onClick={() => setUploadDocType(t)} className="px-3 py-1.5 rounded-lg text-xs font-500 transition-all" style={{ fontWeight: 500, background: active ? color + "22" : "rgba(255,255,255,0.04)", color: active ? color : "rgba(255,255,255,0.35)", border: `1px solid ${active ? color + "55" : "rgba(255,255,255,0.08)"}` }}>
                              {t}
                            </button>);
                })}
                      </div>
                    </div>
                  </div>
                  <div className="px-6 pb-6 flex gap-3">
                    <button onClick={() => setShowUploadModal(false)} className="flex-1 py-2.5 rounded-xl text-sm transition-all" style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.4)", border: "1px solid rgba(255,255,255,0.08)" }}>
                      Cancel
                    </button>
                    <button onClick={confirmTenantUpload} className="flex-1 py-2.5 rounded-xl text-sm font-600 transition-all" style={{ background: r.accent, color: "#000", fontWeight: 600 }}>
                      Upload
                    </button>
                  </div>
                </div>
              </div>)}

            <input ref={tenantFileRef} type="file" className="hidden" onChange={handleTenantFileChange} accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.heic"/>

            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-xl text-white font-700" style={{ fontWeight: 700 }}>My Documents</h2>
                <p className="text-white/35 text-sm mt-0.5">{home?.lease ? `Current tenancy — ${home.lease.unit}, ${home.lease.address}` : "No active tenancy"}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs px-3 py-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.35)", fontFamily: "'JetBrains Mono', monospace" }}>
                  {docs.length} documents
                </span>
                <button onClick={() => tenantFileRef.current?.click()} className="flex items-center gap-1.5 text-xs font-500 px-3 py-1.5 rounded-lg transition-all" style={{ color: r.accentLight, background: r.accentDim, border: `1px solid ${r.accent}33`, fontWeight: 500 }} onMouseEnter={(e) => (e.currentTarget.style.background = r.accent + "22")} onMouseLeave={(e) => (e.currentTarget.style.background = r.accentDim)}>
                  <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                    <path d="M7 10V3M4 6l3-3 3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M2 11h10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                  </svg>
                  Upload
                </button>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              {sortDocsByRecent(docs).map((doc) => <DocRow key={doc.id} doc={doc} accent={r.accent}/>)}
            </div>
            <p className="text-xs text-white/20 mt-6 text-center">Only documents for your current tenancy are shown. Contact your landlord for past documents.</p>
          </div>)}

        {tenantTab === "home" && (<><div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          <StatCard label="Next Rent" value={nextRent ? money(nextRent.amount) : "—"} sub={nextRent ? `Due ${nextRent.date}` : "Nothing due"}/>
          <StatCard label="Balance" value={balance > 0 ? money(balance) : "Clear"} sub={balance > 0 ? "Past due" : "No outstanding"}/>
          <StatCard label="Lease Ends" value={home?.lease?.endMonth ?? "—"} sub={home?.lease?.endDate ?? "No active lease"}/>
          <StatCard label="Open Requests" value={String(requests.filter((q) => q.status !== "Resolved").length)} sub={`${requests.filter((q) => q.status === "In Progress").length} in progress`}/>
        </div>
        <div className="flex items-center justify-between p-6 rounded-2xl mb-8" style={{ background: r.accentDim, border: `1px solid ${r.accent}44` }}>
          <div>
            <div className="text-white font-600 mb-1" style={{ fontWeight: 600 }}>{rentTitle}</div>
            <div className="text-sm text-white/40">{rentSub}</div>
          </div>
          <button onClick={payNow} disabled={!nextRent && !(balance > 0)} className="px-6 py-2.5 rounded-xl font-600 text-sm" style={{ background: r.accent, color: "#000", fontWeight: 600, opacity: nextRent || balance > 0 ? 1 : 0.4 }}>
            Pay Now
          </button>
        </div>
        {(home?.notices ?? []).length > 0 && (<Card className="mb-6">
            <h3 className="font-600 text-white mb-4" style={{ fontWeight: 600 }}>Notices from your landlord</h3>
            <div className="flex flex-col gap-3">
              {home.notices.map((n) => (<div key={n.id}>
                  <div className="text-sm text-white/80" style={{ whiteSpace: "pre-line" }}>{n.message}</div>
                  <div className="text-xs text-white/30 mt-0.5">{n.title} · {n.date}</div>
                </div>))}
            </div>
          </Card>)}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <Card>
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-600 text-white" style={{ fontWeight: 600 }}>Maintenance Requests</h3>
              <button onClick={() => setShowNewRequest(true)} className="flex items-center gap-1 text-xs font-500 px-3 py-1.5 rounded-lg transition-all" style={{ color: r.accentLight, background: r.accentDim, border: `1px solid ${r.accent}33`, fontWeight: 500 }} onMouseEnter={(e) => (e.currentTarget.style.background = r.accent + "22")} onMouseLeave={(e) => (e.currentTarget.style.background = r.accentDim)}>
                + New Request
              </button>
            </div>
            <div className="flex flex-col gap-4">
              {localRequests.map((m) => (<div key={m.id} className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-sm text-white/80">{m.desc}</div>
                    <div className="text-xs text-white/30 mt-0.5" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{m.id} · {m.date}</div>
                  </div>
                  <StatusBadge status={m.status} accent={r.accent}/>
                </div>))}
            </div>
          </Card>
          <Card>
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-600 text-white" style={{ fontWeight: 600 }}>Payment History</h3>
              <button onClick={() => setShowAllPayments(true)} className="flex items-center gap-1.5 text-xs font-500 transition-colors" style={{ color: r.accentLight, fontWeight: 500 }} onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.7")} onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}>
                See all
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M4.5 2.5l3 3-3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>
            <div className="flex flex-col gap-4">
              {recentPayments.map((p) => (<div key={p.ref} className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-white/80">{p.month}</div>
                    <div className="text-xs text-white/30 mt-0.5">${p.amount.toLocaleString()}</div>
                  </div>
                  <StatusBadge status={p.status === "Late" ? "Late" : "Paid"} accent={r.accent}/>
                </div>))}
            </div>
            <button onClick={() => setShowAllPayments(true)} className="w-full mt-5 py-2.5 rounded-xl text-xs font-500 transition-all" style={{ background: r.accentDim, color: r.accentLight, border: `1px solid ${r.accent}33`, fontWeight: 500 }} onMouseEnter={(e) => (e.currentTarget.style.background = r.accent + "22")} onMouseLeave={(e) => (e.currentTarget.style.background = r.accentDim)}>
              View all {payments.length} payments
            </button>
          </Card>
        </div>
        </>)}
      </div>
    </DashboardShell>);
}
