import { useEffect, useRef, useState } from "react";
import { api, fileToDataUrl } from "../api";
import { Card, DashboardShell, StatCard, StatusBadge } from "../components/Common";
import { ROLES } from "../config";
/* ——— CONTRACTOR DASHBOARD ——— */
export default function ContractorDashboard({ account, onLogout, onHome, requests, notifications, onSubmitBid, onMarkNotifsRead, onRefresh = () => { } }) {
    const r = ROLES.contractor;
    const [tab, setTab] = useState("jobs");
    const [invoiceBid, setInvoiceBid] = useState(null);
    const [invoiceLines, setInvoiceLines] = useState([]);
    const [jobDetails, setJobDetails] = useState({});
    const getJobDetail = (id) => {
        const j = requests.find((q) => q.id === id)?.job;
        return jobDetails[id] ?? (j ? { completionNotes: j.completionNotes, paymentMethod: j.paymentMethod, paid: j.paid } : { completionNotes: "", paymentMethod: null, paid: false });
    };
    const saveTimers = useRef({});
    const setJobDetail = (id, patch) => {
        setJobDetails((prev) => ({ ...prev, [id]: { ...getJobDetail(id), ...patch } }));
        const wo = requests.find((q) => q.id === id)?.job?.workOrderId;
        if (!wo)
            return;
        const timerKey = `${id}:${"completionNotes" in patch ? "notes" : "other"}`;
        clearTimeout(saveTimers.current[timerKey]);
        const send = () => api(`/work-orders/${wo}/details`, { method: "PUT", body: patch }).then(() => { if ("paid" in patch)
            onRefresh(); }).catch((e) => window.alert(e.message));
        if ("completionNotes" in patch)
            saveTimers.current[timerKey] = setTimeout(send, 600);
        else
            send();
    };
    const [drafts, setDrafts] = useState({});
    const photos = Object.fromEntries(requests.filter((q) => q.job).map((q) => [q.id, { before: q.job.photos.before.map((p) => p.url), after: q.job.photos.after.map((p) => p.url) }]));
    const [lightbox, setLightbox] = useState(null);
    const addPhotos = async (reqId, phase, files) => {
        const wo = requests.find((q) => q.id === reqId)?.job?.workOrderId;
        if (!wo)
            return;
        try {
            for (const file of Array.from(files).slice(0, 6))
                await api(`/work-orders/${wo}/photos`, { method: "POST", body: { phase, dataUrl: await fileToDataUrl(file) } });
        }
        catch (e) {
            window.alert(e.message);
        }
        onRefresh();
    };
    const removePhoto = async (reqId, phase, idx) => {
        const job = requests.find((q) => q.id === reqId)?.job;
        const photo = job?.photos[phase][idx];
        if (!photo)
            return;
        await api(`/work-orders/${job.workOrderId}/photos/${photo.id}`, { method: "DELETE" }).catch((e) => window.alert(e.message));
        onRefresh();
    };
    const [landlords, setLandlords] = useState([]);
    const loadLandlords = () => api("/contractor/landlords").then(setLandlords).catch(() => { });
    useEffect(() => { loadLandlords(); }, [requests.length]);
    const [showAddLandlord, setShowAddLandlord] = useState(false);
    const [landlordCodeInput, setLandlordCodeInput] = useState("");
    const [landlordCodeError, setLandlordCodeError] = useState("");
    const submitLandlordCode = async () => {
        try {
            await api("/contractor/connect", { method: "POST", body: { code: landlordCodeInput.trim() } });
            await loadLandlords();
            onRefresh();
            setShowAddLandlord(false);
            setLandlordCodeInput("");
            setLandlordCodeError("");
        }
        catch (e) {
            setLandlordCodeError(e.message);
        }
    };
    const myId = account.id;
    const myNotifs = notifications.filter((n) => n.contractorId === myId);
    const unread = myNotifs.filter((n) => !n.read).length;
    const openRequests = requests.filter((req) => ["Open", "Bidding"].includes(req.status) && !req.bids.some((b) => b.contractorId === myId));
    const myBids = requests.flatMap((req) => req.bids.filter((b) => b.contractorId === myId).map((b) => ({ ...b, req })));
    const activeJobs = requests.filter((req) => req.acceptedBidId && req.bids.some((b) => b.contractorId === myId && b.id === req.acceptedBidId));
    // Group open requests by landlord based on property address
    const landlordGroups = landlords.map((ll) => ({ llId: ll.id, name: ll.name, jobs: openRequests.filter((req) => ll.properties.includes(req.address)) }));
    const ungroupedJobs = openRequests.filter((req) => !landlords.some((ll) => ll.properties.includes(req.address)));
    const getDraft = (reqId) => drafts[reqId] ?? { lineItems: [{ desc: "", qty: 1, unit: "hr", unitPrice: 0 }], note: "", estimatedDays: "", warranty: "" };
    const setDraft = (reqId, patch) => setDrafts((prev) => ({ ...prev, [reqId]: { ...getDraft(reqId), ...patch } }));
    const setLineItem = (reqId, idx, patch) => {
        const d = getDraft(reqId);
        const items = d.lineItems.map((li, i) => (i === idx ? { ...li, ...patch } : li));
        setDraft(reqId, { lineItems: items });
    };
    const addLineItem = (reqId) => {
        const d = getDraft(reqId);
        setDraft(reqId, { lineItems: [...d.lineItems, { desc: "", qty: 1, unit: "hr", unitPrice: 0 }] });
    };
    const removeLineItem = (reqId, idx) => {
        const d = getDraft(reqId);
        if (d.lineItems.length === 1)
            return;
        setDraft(reqId, { lineItems: d.lineItems.filter((_, i) => i !== idx) });
    };
    const calcTotal = (items) => items.reduce((s, li) => s + li.qty * li.unitPrice, 0);
    const handleSubmit = (reqId) => {
        const d = getDraft(reqId);
        const total = calcTotal(d.lineItems);
        if (total <= 0 || d.lineItems.some((li) => !li.desc.trim()))
            return;
        onSubmitBid(reqId, total, d.note, d.lineItems, d.estimatedDays, d.warranty);
        setDrafts((prev) => { const n = { ...prev }; delete n[reqId]; return n; });
    };
    const invoiceNum = invoiceBid?.req?.job ? `INV-${String(invoiceBid.req.job.workOrderId).padStart(5, "0")}` : `INV-${String(Date.now()).slice(-5)}`;
    const today = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    const printInvoice = async () => {
        try {
            const wo = invoiceBid.req.job?.workOrderId;
            if (wo)
                await api(`/work-orders/${wo}/invoice`, { method: "POST", body: { amount: invoiceLines.reduce((s, li) => s + li.qty * li.unitPrice, 0) } });
        }
        catch { /* printing still works if saving the invoice record fails */ }
        window.print();
    };
    return (<DashboardShell role="contractor" name={account.name} onLogout={onLogout} onHome={onHome} notifCount={unread}>

      {/* ——— Invoice modal ——— */}
      {invoiceBid && (<div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.8)", backdropFilter: "blur(6px)" }} onClick={() => setInvoiceBid(null)}>
          <div className="w-full max-w-2xl rounded-2xl overflow-hidden flex flex-col" style={{ background: "#fff", maxHeight: "90vh" }} onClick={(e) => e.stopPropagation()}>
            {/* Invoice header */}
            <div className="flex items-start justify-between p-8 pb-6" style={{ background: "#0b0f1a" }}>
              <div>
                <div className="text-xs tracking-[0.25em] text-white/30 mb-2" style={{ fontFamily: "'JetBrains Mono', monospace" }}>PROPFLOW · INVOICE</div>
                <div className="text-2xl font-800 text-white" style={{ fontWeight: 800 }}>{invoiceNum}</div>
                <div className="text-sm text-white/40 mt-1">{invoiceBid.req.id} · {invoiceBid.req.issue}</div>
              </div>
              <button onClick={() => setInvoiceBid(null)} className="w-8 h-8 flex items-center justify-center rounded-lg" style={{ color: "rgba(255,255,255,0.4)", background: "rgba(255,255,255,0.08)" }} onMouseEnter={(e) => (e.currentTarget.style.color = "#fff")} onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.4)")}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
            </div>

            <div className="overflow-y-auto flex-1 bg-white">
              {/* From / To / Date */}
              <div className="grid grid-cols-3 gap-6 px-8 py-6 border-b" style={{ borderColor: "#e5e7eb" }}>
                <div>
                  <div className="text-xs text-gray-400 uppercase tracking-widest mb-2" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "9px" }}>From</div>
                  <div className="text-sm font-600 text-gray-900" style={{ fontWeight: 600 }}>{invoiceBid.bid.contractorName}</div>
                  <div className="text-xs text-gray-500 mt-0.5">Licensed Contractor</div>
                </div>
                <div>
                  <div className="text-xs text-gray-400 uppercase tracking-widest mb-2" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "9px" }}>To</div>
                  <div className="text-sm font-600 text-gray-900" style={{ fontWeight: 600 }}>{invoiceBid.req.landlord ?? "Property Manager"}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{invoiceBid.req.address} · {invoiceBid.req.unit}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-400 uppercase tracking-widest mb-2" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "9px" }}>Details</div>
                  <div className="text-xs text-gray-700">
                    <div>Issued: {today}</div>
                    {invoiceBid.bid.estimatedDays && <div className="mt-0.5">Est. duration: {invoiceBid.bid.estimatedDays}</div>}
                    {invoiceBid.bid.warranty && <div className="mt-0.5">Warranty: {invoiceBid.bid.warranty}</div>}
                  </div>
                </div>
              </div>

              {/* Scope */}
              {invoiceBid.bid.note && (<div className="px-8 py-4 border-b" style={{ borderColor: "#e5e7eb", background: "#fafafa" }}>
                  <div className="text-xs text-gray-400 uppercase tracking-widest mb-1" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "9px" }}>Scope of Work</div>
                  <p className="text-sm text-gray-700">{invoiceBid.bid.note}</p>
                </div>)}

              {/* Line items table */}
              <div className="px-8 py-6">
                <div className="grid text-xs text-gray-400 uppercase tracking-widest pb-2 mb-2 border-b" style={{ gridTemplateColumns: "1fr 60px 80px 90px 90px 32px", gap: "0.75rem", fontFamily: "'JetBrains Mono', monospace", fontSize: "9px", borderColor: "#e5e7eb" }}>
                  <span>Description</span>
                  <span className="text-right">Qty</span>
                  <span className="text-right">Unit</span>
                  <span className="text-right">Unit Price</span>
                  <span className="text-right">Total</span>
                  <span />
                </div>
                {invoiceLines.length === 0 && (<p className="text-sm text-gray-400 italic py-4">No line items — all removed.</p>)}
                {invoiceLines.map((li, i) => (<div key={i} className="group grid items-center py-3 border-b" style={{ gridTemplateColumns: "1fr 60px 80px 90px 90px 32px", gap: "0.75rem", borderColor: "#f3f4f6" }}>
                    <span className="text-sm text-gray-800">{li.desc}</span>
                    <span className="text-sm text-gray-600 text-right">{li.qty}</span>
                    <span className="text-sm text-gray-500 text-right">{li.unit}</span>
                    <span className="text-sm text-gray-600 text-right">${li.unitPrice.toLocaleString()}</span>
                    <span className="text-sm font-600 text-gray-900 text-right" style={{ fontWeight: 600 }}>${(li.qty * li.unitPrice).toLocaleString()}</span>
                    <button onClick={() => setInvoiceLines((prev) => prev.filter((_, j) => j !== i))} className="flex items-center justify-center w-6 h-6 rounded-md opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: "#fee2e2", color: "#ef4444" }} title="Remove line">
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                      </svg>
                    </button>
                  </div>))}

                {/* Total */}
                {(() => {
                const invoiceTotal = invoiceLines.reduce((s, li) => s + li.qty * li.unitPrice, 0);
                return (<div className="flex justify-end mt-4">
                      <div className="w-56">
                        <div className="flex justify-between text-sm text-gray-500 mb-2">
                          <span>Subtotal</span>
                          <span>${invoiceTotal.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between text-sm text-gray-500 mb-3">
                          <span>Tax (0%)</span>
                          <span>$0</span>
                        </div>
                        <div className="flex justify-between items-center pt-3 border-t" style={{ borderColor: "#e5e7eb" }}>
                          <span className="text-base font-700 text-gray-900" style={{ fontWeight: 700 }}>Total Due</span>
                          <span className="text-xl font-800 text-gray-900" style={{ fontWeight: 800, fontFamily: "'JetBrains Mono', monospace" }}>${invoiceTotal.toLocaleString()}</span>
                        </div>
                      </div>
                    </div>);
            })()}
              </div>

              <div className="px-8 py-4 text-xs text-gray-400 border-t" style={{ borderColor: "#e5e7eb" }}>
                Payment due within 30 days of job completion. Thank you for your business.
              </div>
            </div>

            {/* Footer actions */}
            <div className="flex justify-end gap-3 px-6 py-4 border-t" style={{ borderColor: "#e5e7eb", background: "#fff" }}>
              <button onClick={() => setInvoiceBid(null)} className="px-4 py-2 rounded-lg text-sm text-gray-500 transition-colors" style={{ background: "#f3f4f6" }} onMouseEnter={(e) => (e.currentTarget.style.background = "#e5e7eb")} onMouseLeave={(e) => (e.currentTarget.style.background = "#f3f4f6")}>
                Close
              </button>
              <button onClick={printInvoice} className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-600 transition-all" style={{ background: r.accent, color: "#000", fontWeight: 600 }}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <rect x="3" y="2" width="10" height="3" rx="1" fill="currentColor" opacity=".4"/>
                  <rect x="3" y="11" width="10" height="3" rx="1" fill="currentColor" opacity=".4"/>
                  <path d="M3 7h10M8 5v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                Print / Save PDF
              </button>
            </div>
          </div>
        </div>)}

      {/* Lightbox */}
      {lightbox && (<div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.9)", backdropFilter: "blur(8px)" }} onClick={() => setLightbox(null)}>
          <div className="relative max-w-3xl w-full" onClick={(e) => e.stopPropagation()}>
            <img src={lightbox.src} alt={lightbox.label} className="w-full rounded-2xl object-contain" style={{ maxHeight: "80vh" }}/>
            <div className="mt-3 flex items-center justify-between">
              <span className="text-sm text-white/50">{lightbox.label}</span>
              <button onClick={() => setLightbox(null)} className="text-xs px-4 py-1.5 rounded-lg" style={{ background: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.7)" }}>
                Close
              </button>
            </div>
          </div>
        </div>)}

      <div className="max-w-4xl mx-auto">
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-3xl font-800 text-white mb-1" style={{ fontWeight: 800 }}>Contractor Portal</h1>
            <p className="text-white/40 text-sm">{account.company || account.name} · ★ 4.8</p>
          </div>
          <button onClick={() => { setShowAddLandlord(true); setLandlordCodeInput(""); setLandlordCodeError(""); }} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-500 transition-all" style={{ background: r.accentDim, color: r.accentLight, border: `1px solid ${r.accent}33`, fontWeight: 500 }} onMouseEnter={(e) => (e.currentTarget.style.background = r.accent + "22")} onMouseLeave={(e) => (e.currentTarget.style.background = r.accentDim)}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <rect x="2" y="4" width="10" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
              <path d="M5 7H9M7 5v4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
            Add Landlord
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          <StatCard label="Active Jobs" value={activeJobs.length} sub="Accepted work"/>
          <StatCard label="My Bids" value={myBids.length} sub="Submitted"/>
          <StatCard label="Open Jobs" value={openRequests.length} sub="Available to bid"/>
          <StatCard label="Earnings" value="$8,340" sub="September 2026"/>
        </div>

        <div className="flex gap-1 mb-6 p-1 rounded-xl w-fit" style={{ background: "rgba(255,255,255,0.05)" }}>
          {[{ id: "jobs", label: "My Jobs & Bids" }, { id: "openJobs", label: "Browse Jobs" }, { id: "notifications", label: "Notifications" }].map((t) => (<button key={t.id} onClick={() => { setTab(t.id); if (t.id === "notifications")
            onMarkNotifsRead(); }} className="px-4 py-2 rounded-lg text-sm font-500 transition-all relative" style={{ fontWeight: 500, background: tab === t.id ? r.accentDim : "transparent", color: tab === t.id ? r.accentLight : "rgba(255,255,255,0.4)", border: tab === t.id ? `1px solid ${r.accent}44` : "1px solid transparent" }}>
              {t.label}
              {t.id === "notifications" && unread > 0 && (<span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full text-xs" style={{ background: r.accent, color: "#000", fontSize: "10px", fontWeight: 700 }}>{unread}</span>)}
            </button>))}
        </div>

        {/* ——— My Jobs & Bids ——— */}
        {tab === "jobs" && (<div className="flex flex-col gap-4">
            {activeJobs.length > 0 && (<div>
                <div className="text-xs text-white/30 uppercase tracking-widest mb-3" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "9px" }}>Active Work Orders</div>
                {activeJobs.map((req) => {
                    const myBid = req.bids.find((b) => b.contractorId === myId && b.id === req.acceptedBidId);
                    const jobPhotos = photos[req.id] ?? { before: [], after: [] };
                    const PhotoZone = ({ phase, label }) => {
                        const list = jobPhotos[phase];
                        const phaseColor = phase === "before" ? "#f59e0b" : "#22c55e";
                        return (<div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs uppercase tracking-widest" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "9px", color: phaseColor }}>
                            {label}
                          </span>
                          {list.length < 6 && (<label className="flex items-center gap-1 text-xs cursor-pointer transition-opacity" style={{ color: phaseColor, opacity: 0.7 }} onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")} onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.7")}>
                              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                                <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                              </svg>
                              Add
                              <input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => e.target.files && addPhotos(req.id, phase, e.target.files)}/>
                            </label>)}
                        </div>
                        {list.length === 0 ? (<label className="flex flex-col items-center justify-center gap-2 w-full py-5 rounded-xl cursor-pointer transition-all" style={{ border: `1.5px dashed ${phaseColor}44`, background: `${phaseColor}08` }} onMouseEnter={(e) => (e.currentTarget.style.background = `${phaseColor}14`)} onMouseLeave={(e) => (e.currentTarget.style.background = `${phaseColor}08`)}>
                            <svg width="22" height="22" viewBox="0 0 22 22" fill="none" style={{ color: phaseColor, opacity: 0.5 }}>
                              <rect x="2" y="5" width="18" height="13" rx="2" stroke="currentColor" strokeWidth="1.4"/>
                              <circle cx="11" cy="11.5" r="3" stroke="currentColor" strokeWidth="1.4"/>
                              <path d="M8 5l1.5-2h3L14 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                            <span className="text-xs" style={{ color: phaseColor, opacity: 0.6 }}>Upload {label.toLowerCase()} photos</span>
                            <input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => e.target.files && addPhotos(req.id, phase, e.target.files)}/>
                          </label>) : (<div className="grid grid-cols-3 gap-1.5">
                            {list.map((src, i) => (<div key={i} className="relative group aspect-square rounded-lg overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
                                <img src={src} alt={`${phase} ${i + 1}`} className="w-full h-full object-cover"/>
                                <div className="absolute inset-0 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: "rgba(0,0,0,0.55)" }}>
                                  <button onClick={() => setLightbox({ src, label: `${label} — Photo ${i + 1}` })} className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: "rgba(255,255,255,0.2)" }}>
                                    <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                                      <circle cx="6" cy="6" r="4" stroke="white" strokeWidth="1.3"/>
                                      <path d="M9.5 9.5L13 13" stroke="white" strokeWidth="1.3" strokeLinecap="round"/>
                                    </svg>
                                  </button>
                                  <button onClick={() => removePhoto(req.id, phase, i)} className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: "rgba(239,68,68,0.7)" }}>
                                    <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                                      <path d="M2 2l8 8M10 2l-8 8" stroke="white" strokeWidth="1.4" strokeLinecap="round"/>
                                    </svg>
                                  </button>
                                </div>
                              </div>))}
                            {list.length < 6 && (<label className="aspect-square rounded-lg flex items-center justify-center cursor-pointer transition-all" style={{ border: `1.5px dashed ${phaseColor}33`, background: `${phaseColor}06` }} onMouseEnter={(e) => (e.currentTarget.style.background = `${phaseColor}12`)} onMouseLeave={(e) => (e.currentTarget.style.background = `${phaseColor}06`)}>
                                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style={{ color: phaseColor, opacity: 0.4 }}>
                                  <path d="M9 2v14M2 9h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                                </svg>
                                <input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => e.target.files && addPhotos(req.id, phase, e.target.files)}/>
                              </label>)}
                          </div>)}
                      </div>);
                    };
                    return (<div key={req.id} className="rounded-2xl overflow-hidden mb-3" style={{ background: "rgba(34,197,94,0.07)", border: "1px solid rgba(34,197,94,0.2)" }}>
                      {/* Job header */}
                      <div className="flex items-center justify-between p-5">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs text-white/30" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{req.id}</span>
                            <StatusBadge status="Accepted" accent={r.accent}/>
                          </div>
                          <div className="text-sm font-600 text-white" style={{ fontWeight: 600 }}>{req.issue}</div>
                          <div className="text-xs text-white/40 mt-0.5">{req.address} · {req.unit}</div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <div className="text-right">
                            <div className="text-xl font-700 text-white" style={{ fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>${myBid?.price.toLocaleString()}</div>
                            <div className="text-xs text-white/30">Your bid</div>
                          </div>
                          {myBid && (<button onClick={() => { setInvoiceBid({ bid: myBid, req }); setInvoiceLines([...myBid.lineItems]); }} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-600 transition-all" style={{ background: r.accentDim, color: r.accentLight, border: `1px solid ${r.accent}44`, fontWeight: 600 }} onMouseEnter={(e) => (e.currentTarget.style.background = r.accent + "33")} onMouseLeave={(e) => (e.currentTarget.style.background = r.accentDim)}>
                              <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                                <rect x="2" y="1" width="10" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
                                <path d="M4.5 4.5h5M4.5 7h5M4.5 9.5h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                              </svg>
                              View Invoice
                            </button>)}
                        </div>
                      </div>

                      {/* Job completion details */}
                      {(() => {
                            const jd = getJobDetail(req.id);
                            return (<div className="px-5 pb-5 pt-4 border-t" style={{ borderColor: "rgba(34,197,94,0.15)" }}>
                            <div className="text-xs uppercase tracking-widest mb-3" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "9px", color: "rgba(255,255,255,0.3)" }}>
                              Job Completion
                            </div>
                            <div className="flex flex-col gap-3">
                              {/* Completion notes */}
                              <div>
                                <label className="block text-xs text-white/30 mb-1.5" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "9px" }}>
                                  COMPLETION NOTES
                                </label>
                                <textarea rows={2} placeholder="Describe what was done, parts used, any follow-up needed…" value={jd.completionNotes} onChange={(e) => setJobDetail(req.id, { completionNotes: e.target.value })} className="w-full px-3 py-2 rounded-lg text-white text-sm outline-none resize-none" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}/>
                              </div>

                              {/* Payment method + paid toggle */}
                              <div className="flex items-center justify-between gap-4">
                                <div>
                                  <div className="text-xs text-white/30 mb-2" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "9px" }}>PAYMENT METHOD</div>
                                  <div className="flex gap-2">
                                    {["cash", "card"].map((method) => (<button key={method} onClick={() => setJobDetail(req.id, { paymentMethod: jd.paymentMethod === method ? null : method })} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-500 transition-all capitalize" style={{
                                        fontWeight: 500,
                                        background: jd.paymentMethod === method ? (method === "cash" ? "rgba(245,158,11,0.2)" : "rgba(59,130,246,0.2)") : "rgba(255,255,255,0.06)",
                                        color: jd.paymentMethod === method ? (method === "cash" ? "#fcd34d" : "#93c5fd") : "rgba(255,255,255,0.4)",
                                        border: `1px solid ${jd.paymentMethod === method ? (method === "cash" ? "rgba(245,158,11,0.4)" : "rgba(59,130,246,0.4)") : "rgba(255,255,255,0.08)"}`,
                                    }}>
                                        {method === "cash" ? (<svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                                            <rect x="1" y="4" width="14" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
                                            <circle cx="8" cy="8.5" r="2" stroke="currentColor" strokeWidth="1.3"/>
                                            <path d="M4 4V3M12 4V3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                                          </svg>) : (<svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                                            <rect x="1" y="3" width="14" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
                                            <path d="M1 6h14" stroke="currentColor" strokeWidth="1.3"/>
                                            <rect x="3" y="9" width="4" height="1.5" rx="0.5" fill="currentColor"/>
                                          </svg>)}
                                        {method}
                                      </button>))}
                                  </div>
                                </div>

                                <button onClick={() => setJobDetail(req.id, { paid: !jd.paid })} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-600 transition-all" style={{
                                    fontWeight: 600,
                                    background: jd.paid ? "rgba(34,197,94,0.2)" : "rgba(255,255,255,0.08)",
                                    color: jd.paid ? "#86efac" : "rgba(255,255,255,0.5)",
                                    border: `1px solid ${jd.paid ? "rgba(34,197,94,0.4)" : "rgba(255,255,255,0.1)"}`,
                                }}>
                                  {jd.paid ? (<>
                                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                                        <path d="M2 7l3.5 3.5L12 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                      </svg>
                                      Payment Received
                                    </>) : (<>
                                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                                        <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.3"/>
                                        <path d="M7 4v3.5l2 2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                                      </svg>
                                      Mark as Paid
                                    </>)}
                                </button>
                              </div>

                              {/* Payment summary pill */}
                              {jd.paid && jd.paymentMethod && (<div className="flex items-center gap-2 px-3 py-2 rounded-lg w-fit" style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)" }}>
                                  <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                                    <path d="M2 7l3.5 3.5L12 4" stroke="#22c55e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                  </svg>
                                  <span className="text-xs" style={{ color: "#86efac" }}>
                                    Paid via {jd.paymentMethod} · {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                                  </span>
                                </div>)}
                            </div>
                          </div>);
                        })()}

                      {/* Photo upload panels */}
                      <div className="grid grid-cols-2 gap-4 px-5 pb-5 pt-1 border-t" style={{ borderColor: "rgba(34,197,94,0.15)" }}>
                        <PhotoZone phase="before" label="Before"/>
                        <PhotoZone phase="after" label="After"/>
                      </div>
                    </div>);
                })}
              </div>)}
            {myBids.length > 0 && (<div>
                <div className="text-xs text-white/30 uppercase tracking-widest mb-3 mt-2" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "9px" }}>Submitted Bids</div>
                {myBids.map((bid) => (<div key={bid.id} className="p-4 rounded-xl flex items-center justify-between gap-4 mb-3" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-white/80">{bid.req.issue}</div>
                      <div className="text-xs text-white/30 mt-0.5">{bid.req.address} · {bid.req.unit}</div>
                      {bid.lineItems.length > 0 && (<div className="text-xs text-white/20 mt-1">{bid.lineItems.length} line item{bid.lineItems.length !== 1 ? "s" : ""}</div>)}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-lg font-700" style={{ fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: r.accentLight }}>${bid.price.toLocaleString()}</span>
                      <StatusBadge status={bid.status} accent={r.accent}/>
                      <button onClick={() => { setInvoiceBid({ bid, req: bid.req }); setInvoiceLines([...bid.lineItems]); }} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-500 transition-all" style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.08)", fontWeight: 500 }} onMouseEnter={(e) => (e.currentTarget.style.color = "#fff")} onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.5)")}>
                        <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                          <rect x="2" y="1" width="10" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
                          <path d="M4.5 4.5h5M4.5 7h5M4.5 9.5h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                        </svg>
                        Invoice
                      </button>
                    </div>
                  </div>))}
              </div>)}
            {activeJobs.length === 0 && myBids.length === 0 && (<div className="text-center text-white/25 py-16">No active jobs or bids yet — browse open jobs to submit a bid.</div>)}
          </div>)}

        {/* ——— Browse Open Jobs ——— */}
        {tab === "openJobs" && (<div className="flex flex-col gap-8">
            {openRequests.length === 0 && <div className="text-center text-white/25 py-16">No open jobs available right now</div>}

            {/* Jobs grouped by connected landlord */}
            {landlordGroups.map((group) => (<div key={group.llId}>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(255,255,255,0.07)" }}>
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                      <rect x="2" y="4" width="12" height="10" rx="1.5" stroke="rgba(255,255,255,0.5)" strokeWidth="1.2"/>
                      <path d="M8 4V2" stroke="rgba(255,255,255,0.5)" strokeWidth="1.2" strokeLinecap="round"/>
                      <rect x="6" y="7" width="1.5" height="1.5" rx="0.4" fill="rgba(255,255,255,0.5)"/>
                      <rect x="8.5" y="7" width="1.5" height="1.5" rx="0.4" fill="rgba(255,255,255,0.5)"/>
                    </svg>
                  </div>
                  <div>
                    <div className="text-sm font-600 text-white" style={{ fontWeight: 600 }}>{group.name}</div>
                    <div className="text-xs text-white/30">{group.jobs.length} open job{group.jobs.length !== 1 ? "s" : ""}</div>
                  </div>
                  <span className="ml-auto text-xs px-2.5 py-1 rounded-full" style={{ background: "rgba(34,197,94,0.12)", color: "#22c55e", fontFamily: "'JetBrains Mono', monospace", fontSize: "9px" }}>CONNECTED</span>
                </div>
                {group.jobs.length === 0
                    ? <p className="text-sm text-white/25 italic px-2">No open jobs from this landlord right now.</p>
                    : <div className="flex flex-col gap-5">{group.jobs.map((req) => {
                            const d = getDraft(req.id);
                            const total = calcTotal(d.lineItems);
                            const canSubmit = total > 0 && d.lineItems.every((li) => li.desc.trim());
                            return (<Card key={req.id}>
                  {/* Job header */}
                  <div className="flex items-start justify-between gap-4 mb-5">
                    <div>
                      <div className="flex items-center gap-3 mb-1">
                        <span className="text-xs text-white/30" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{req.id}</span>
                        <StatusBadge status={req.priority} accent={r.accent}/>
                      </div>
                      <div className="text-base font-600 text-white" style={{ fontWeight: 600 }}>{req.issue}</div>
                      <div className="text-xs text-white/40 mt-0.5">{req.address} · {req.unit}</div>
                    </div>
                    <span className="text-xs text-white/25 shrink-0">{req.bids.length} bid{req.bids.length !== 1 ? "s" : ""}</span>
                  </div>

                  <div className="border-t pt-5" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                    <div className="text-xs text-white/35 uppercase tracking-wider mb-4" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "9px" }}>
                      Build Your Bid
                    </div>

                    {/* Line items */}
                    <div className="flex flex-col gap-2 mb-3">
                      {/* Column labels */}
                      <div className="grid text-white/25 uppercase tracking-widest" style={{ gridTemplateColumns: "1fr 56px 80px 90px 32px", gap: "8px", fontFamily: "'JetBrains Mono', monospace", fontSize: "9px" }}>
                        <span>Description</span>
                        <span className="text-right">Qty</span>
                        <span>Unit</span>
                        <span className="text-right">Unit Price</span>
                        <span />
                      </div>
                      {d.lineItems.map((li, idx) => (<div key={idx} className="grid items-center gap-2" style={{ gridTemplateColumns: "1fr 56px 80px 90px 32px" }}>
                          <input type="text" placeholder="e.g. Labour — drain inspection" value={li.desc} onChange={(e) => setLineItem(req.id, idx, { desc: e.target.value })} className="px-3 py-2 rounded-lg text-white text-sm outline-none" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}/>
                          <input type="number" min="1" placeholder="1" value={li.qty || ""} onChange={(e) => setLineItem(req.id, idx, { qty: parseFloat(e.target.value) || 0 })} className="px-3 py-2 rounded-lg text-white text-sm outline-none text-right" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", fontFamily: "'JetBrains Mono', monospace" }}/>
                          <select value={li.unit} onChange={(e) => setLineItem(req.id, idx, { unit: e.target.value })} className="px-3 py-2 rounded-lg text-white text-sm outline-none" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}>
                            {["hr", "day", "unit", "sqft", "item", "trip"].map((u) => (<option key={u} value={u} style={{ background: "#1a2030" }}>{u}</option>))}
                          </select>
                          <div className="relative">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/30 text-xs">$</span>
                            <input type="number" min="0" placeholder="0" value={li.unitPrice || ""} onChange={(e) => setLineItem(req.id, idx, { unitPrice: parseFloat(e.target.value) || 0 })} className="w-full pl-6 pr-2 py-2 rounded-lg text-white text-sm outline-none text-right" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", fontFamily: "'JetBrains Mono', monospace" }}/>
                          </div>
                          <button onClick={() => removeLineItem(req.id, idx)} className="flex items-center justify-center w-8 h-8 rounded-lg transition-colors" style={{ color: d.lineItems.length === 1 ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.3)" }} disabled={d.lineItems.length === 1} onMouseEnter={(e) => d.lineItems.length > 1 && (e.currentTarget.style.color = "#ef4444")} onMouseLeave={(e) => (e.currentTarget.style.color = d.lineItems.length === 1 ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.3)")}>
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                              <path d="M3 7h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                            </svg>
                          </button>
                        </div>))}
                    </div>

                    <button onClick={() => addLineItem(req.id)} className="flex items-center gap-2 text-xs mb-5 transition-colors" style={{ color: r.accentLight, opacity: 0.7 }} onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")} onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.7")}>
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
                      Add line item
                    </button>

                    {/* Extra details */}
                    <div className="grid grid-cols-2 gap-3 mb-5">
                      <div>
                        <label className="block text-xs text-white/30 mb-1.5 uppercase tracking-widest" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "9px" }}>
                          Est. Duration
                        </label>
                        <input type="text" placeholder="e.g. 2 days" value={d.estimatedDays} onChange={(e) => setDraft(req.id, { estimatedDays: e.target.value })} className="w-full px-3 py-2 rounded-lg text-white text-sm outline-none" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}/>
                      </div>
                      <div>
                        <label className="block text-xs text-white/30 mb-1.5 uppercase tracking-widest" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "9px" }}>
                          Warranty / Guarantee
                        </label>
                        <input type="text" placeholder="e.g. 90-day parts & labour" value={d.warranty} onChange={(e) => setDraft(req.id, { warranty: e.target.value })} className="w-full px-3 py-2 rounded-lg text-white text-sm outline-none" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}/>
                      </div>
                    </div>

                    <div className="mb-5">
                      <label className="block text-xs text-white/30 mb-1.5 uppercase tracking-widest" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "9px" }}>
                        Scope of Work / Notes
                      </label>
                      <textarea rows={2} placeholder="Describe the work to be performed…" value={d.note} onChange={(e) => setDraft(req.id, { note: e.target.value })} className="w-full px-3 py-2 rounded-lg text-white text-sm outline-none resize-none" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}/>
                    </div>

                    {/* Total + submit */}
                    <div className="flex items-center justify-between pt-4 border-t" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
                      <div>
                        <div className="text-xs text-white/30 mb-0.5" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "9px" }}>TOTAL BID</div>
                        <div className="text-2xl font-800 text-white" style={{ fontWeight: 800, fontFamily: "'JetBrains Mono', monospace" }}>
                          ${total > 0 ? total.toLocaleString() : "—"}
                        </div>
                      </div>
                      <button onClick={() => handleSubmit(req.id)} disabled={!canSubmit} className="px-6 py-3 rounded-xl text-sm font-600 transition-all" style={{ background: r.accent, color: "#000", fontWeight: 600, opacity: canSubmit ? 1 : 0.4 }}>
                        Submit Bid
                      </button>
                    </div>
                  </div>
                </Card>);
                        })}</div>}
              </div>))}

            {/* Ungrouped jobs (no connected landlord) */}
            {ungroupedJobs.length > 0 && (<div>
                <div className="flex items-center gap-2 mb-4">
                  <div className="text-xs text-white/30 uppercase tracking-widest" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "9px" }}>Other Available Jobs</div>
                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.3)", fontFamily: "'JetBrains Mono', monospace", fontSize: "9px" }}>{ungroupedJobs.length}</span>
                </div>
                <div className="flex flex-col gap-5">
                  {ungroupedJobs.map((req) => {
                    const d = getDraft(req.id);
                    const total = calcTotal(d.lineItems);
                    const canSubmit = total > 0 && d.lineItems.every((li) => li.desc.trim());
                    return (<Card key={req.id}>
                        <div className="flex items-start justify-between gap-4 mb-5">
                          <div>
                            <div className="flex items-center gap-3 mb-1">
                              <span className="text-xs text-white/30" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{req.id}</span>
                              <StatusBadge status={req.priority} accent={r.accent}/>
                            </div>
                            <div className="text-base font-600 text-white" style={{ fontWeight: 600 }}>{req.issue}</div>
                            <div className="text-xs text-white/40 mt-0.5">{req.address} · {req.unit}</div>
                          </div>
                          <span className="text-xs text-white/25 shrink-0">{req.bids.length} bid{req.bids.length !== 1 ? "s" : ""}</span>
                        </div>
                      </Card>);
                })}
                </div>
              </div>)}
          </div>)}

        {/* ——— Notifications ——— */}
        {tab === "notifications" && (<div className="flex flex-col gap-3">
            {myNotifs.length === 0 && <div className="text-center text-white/25 py-16">No notifications yet</div>}
            {myNotifs.map((notif) => {
                const accepted = notif.type === "accepted";
                const req = requests.find((r) => r.id === notif.requestId);
                return (<div key={notif.id} className="p-5 rounded-2xl flex items-start gap-4" style={{ background: accepted ? "rgba(34,197,94,0.07)" : "rgba(239,68,68,0.07)", border: `1px solid ${accepted ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)"}` }}>
                  <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5" style={{ background: accepted ? "#22c55e22" : "#ef444422" }}>
                    {accepted
                        ? <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8l3.5 3.5L13 5" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        : <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M5 5l6 6M11 5l-6 6" stroke="#ef4444" strokeWidth="2" strokeLinecap="round"/></svg>}
                  </div>
                  <div>
                    <div className="text-sm font-600 text-white mb-1" style={{ fontWeight: 600 }}>
                      {accepted ? "Bid Accepted — Begin Work" : "Bid Declined"}
                    </div>
                    <div className="text-sm text-white/60">{notif.message}</div>
                    {req && <div className="text-xs text-white/30 mt-2" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{req.id} · {req.address} · {req.unit}</div>}
                  </div>
                </div>);
            })}
          </div>)}
      </div>

      {/* Add Landlord modal */}
      {showAddLandlord && (<div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }} onClick={() => setShowAddLandlord(false)}>
          <div className="w-full max-w-sm rounded-2xl overflow-hidden" style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.1)" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-5 border-b" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
              <div>
                <h3 className="text-base font-600 text-white" style={{ fontWeight: 600 }}>Connect to Landlord</h3>
                <p className="text-xs text-white/35 mt-0.5">Enter the 8-digit code from your landlord</p>
              </div>
              <button onClick={() => setShowAddLandlord(false)} className="w-8 h-8 flex items-center justify-center rounded-lg" style={{ color: "rgba(255,255,255,0.4)", background: "rgba(255,255,255,0.06)" }} onMouseEnter={(e) => (e.currentTarget.style.color = "#fff")} onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.4)")}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
              </button>
            </div>
            <div className="px-6 py-6">
              <input value={landlordCodeInput} onChange={(e) => { setLandlordCodeInput(e.target.value.replace(/\D/g, "").slice(0, 8)); setLandlordCodeError(""); }} onKeyDown={(e) => e.key === "Enter" && submitLandlordCode()} placeholder="00000000" maxLength={8} className="w-full text-center text-2xl tracking-widest px-4 py-4 rounded-xl text-white placeholder-white/15 outline-none transition-all" style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${landlordCodeError ? "#ef4444" : "rgba(255,255,255,0.09)"}`, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.25em" }} onFocus={(e) => (e.currentTarget.style.borderColor = r.accent + "88")} onBlur={(e) => (e.currentTarget.style.borderColor = landlordCodeError ? "#ef4444" : "rgba(255,255,255,0.09)")}/>
              {landlordCodeError && (<p className="text-xs mt-2 text-center" style={{ color: "#fca5a5" }}>{landlordCodeError}</p>)}
              <p className="text-xs text-white/20 mt-3 text-center">Ask your landlord for their unique access code found in their portal settings</p>
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button onClick={() => setShowAddLandlord(false)} className="flex-1 py-2.5 rounded-xl text-sm transition-all" style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.4)", border: "1px solid rgba(255,255,255,0.08)" }}>
                Cancel
              </button>
              <button onClick={submitLandlordCode} className="flex-1 py-2.5 rounded-xl text-sm font-600 transition-all" style={{ background: landlordCodeInput.length === 8 ? r.accent : "rgba(255,255,255,0.08)", color: landlordCodeInput.length === 8 ? "#000" : "rgba(255,255,255,0.2)", fontWeight: 600, cursor: landlordCodeInput.length === 8 ? "pointer" : "not-allowed" }}>
                Connect
              </button>
            </div>
          </div>
        </div>)}
    </DashboardShell>);
}
