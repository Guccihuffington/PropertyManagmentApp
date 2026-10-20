import React, { useCallback, useEffect, useRef, useState } from "react";
import { api, fileToDataUrl } from "../api";
import { Card, DashboardShell, StatCard, StatusBadge } from "../components/Common";
import { ROLES } from "../config";
import { DOC_COLORS, DocRow, sortDocsByRecent } from "../documents";
/* ——— LANDLORD DASHBOARD ——— */
export default function LandlordDashboard({ account, onLogout, onHome, requests, onAcceptBid, onDeclineBid, onRefresh = () => { } }) {
    const r = ROLES.landlord;
    const [tab, setTab] = useState("overview");
    const [docSearch, setDocSearch] = useState("");
    const [docTypeFilter, setDocTypeFilter] = useState("All");
    const [docTenantFilter, setDocTenantFilter] = useState("All");
    const [expandedDocBuilding, setExpandedDocBuilding] = useState(null);
    const [expandedDocTenant, setExpandedDocTenant] = useState(null);
    const [landlordUploadedDocs, setLandlordUploadedDocs] = useState({});
    const [landlordUploadModal, setLandlordUploadModal] = useState(null);
    const [landlordUploadType, setLandlordUploadType] = useState("Lease");
    const landlordFileRef = useRef(null);
    const landlordUploadTarget = useRef("");
    const [unitInvites, setUnitInvites] = useState({}); // "address|unit" -> code
    const [copiedCode, setCopiedCode] = useState(null);
    const generateUnitInvite = async (address, unit, unitId) => {
        try {
            const r = await api(`/units/${unitId}/invite`, { method: "POST" });
            setUnitInvites((prev) => ({ ...prev, [`${address}|${unit}`]: r.code }));
        }
        catch (e) {
            showToast(e.message);
        }
    };
    const copyInviteCode = (code) => {
        navigator.clipboard.writeText(code).catch(() => { });
        setCopiedCode(code);
        setTimeout(() => setCopiedCode(null), 2000);
    };
    const handleLandlordFileChange = (e) => {
        const f = e.target.files?.[0];
        if (!f)
            return;
        setLandlordUploadModal({ key: landlordUploadTarget.current, file: f });
        setLandlordUploadType("Lease");
        e.target.value = "";
    };
    const confirmLandlordUpload = async () => {
        if (!landlordUploadModal)
            return;
        const { key, file } = landlordUploadModal;
        try {
            const dataUrl = await fileToDataUrl(file);
            await api("/documents", { method: "POST", body: { leaseId: Number(key), name: file.name.replace(/\.[^/.]+$/, ""), type: landlordUploadType, dataUrl } });
            setLandlordUploadModal(null);
            loadArchive();
        }
        catch (e) {
            showToast(e.message);
        }
    };
    const [maintSubTab, setMaintSubTab] = useState("requests");
    const [blockedContractors, setBlockedContractors] = useState(new Set());
    const [preferredContractors, setPreferredContractors] = useState(new Set());
    const [expanded, setExpanded] = useState(null);
    const [expandedProperty, setExpandedProperty] = useState(null);
    const [propertySearch, setPropertySearch] = useState("");
    const [rentFilter, setRentFilter] = useState("all");
    const [rentSort, setRentSort] = useState("overdue");
    const [rentSortDir, setRentSortDir] = useState("desc");
    const [sentReminders, setSentReminders] = useState({});
    const [toastMsg, setToastMsg] = useState(null);
    const [maintDetailId, setMaintDetailId] = useState(null);
    const [payHistoryTenant, setPayHistoryTenant] = useState(null);
    const pendingBids = requests.filter((req) => req.bids.some((b) => b.status === "Pending")).length;
    const [properties, setProperties] = useState([]);
    const [landlordCode, setLandlordCode] = useState("");
    const [archive, setArchive] = useState([]);
    const loadPortfolio = useCallback(async () => {
        try {
            const d = await api("/portfolio");
            setProperties(d.properties);
            setLandlordCode(d.code);
            setPreferredContractors(new Set(d.preferred));
            setBlockedContractors(new Set(d.blocked));
            setUnitInvites((prev) => {
                const n = { ...prev };
                d.properties.forEach((p) => p.vacant.forEach((v) => { if (v.inviteCode) n[`${p.address}|${v.label}`] = v.inviteCode; }));
                return n;
            });
        }
        catch { /* keep the last data */ }
    }, []);
    const loadArchive = useCallback(() => api("/documents/archive").then(setArchive).catch(() => { }), []);
    useEffect(() => { loadPortfolio(); }, [loadPortfolio, requests.length]);
    useEffect(() => { if (tab === "documents")
        loadArchive(); }, [tab, loadArchive]);
    useEffect(() => {
        const t = setInterval(() => { if (!document.hidden)
            loadPortfolio(); }, 15000);
        return () => clearInterval(t);
    }, [loadPortfolio]);
    const setContractorStatus = async (contractorUserId, status) => {
        try {
            await api(`/landlord/contractors/${contractorUserId}`, { method: "POST", body: { status } });
            setPreferredContractors((prev) => { const n = new Set(prev); status === "preferred" ? n.add(contractorUserId) : n.delete(contractorUserId); return n; });
            setBlockedContractors((prev) => { const n = new Set(prev); status === "blocked" ? n.add(contractorUserId) : n.delete(contractorUserId); return n; });
        }
        catch (e) {
            showToast(e.message);
        }
    };
    const openPayHistory = async (t) => {
        try {
            setPayHistoryTenant({ ...t, history: await api(`/leases/${t.leaseId}/payments`) });
        }
        catch (e) {
            showToast(e.message);
        }
    };
    const removeBuilding = async () => {
        const b = properties.find((p) => p.address === removeBuildingAddress);
        try {
            await api(`/buildings/${b.propertyId}`, { method: "DELETE" });
            if (expandedProperty === removeBuildingAddress)
                setExpandedProperty(null);
            showToast(`${removeBuildingAddress} removed`);
            setRemoveBuildingAddress(null);
            loadPortfolio();
        }
        catch (e) {
            showToast(e.message);
        }
    };
    // Tenant management modals
    const [vacateModal, setVacateModal] = useState(null);
    const [addTenantModal, setAddTenantModal] = useState(null);
    const [newTenantName, setNewTenantName] = useState("");
    const [newTenantRent, setNewTenantRent] = useState("");
    // Add new building modal
    const [addBuildingModal, setAddBuildingModal] = useState(false);
    const [removeBuildingAddress, setRemoveBuildingAddress] = useState(null);
    const [newBldgAddress, setNewBldgAddress] = useState("");
    const [newBldgUnits, setNewBldgUnits] = useState("4");
    const vacateTenant = async () => {
        if (!vacateModal)
            return;
        try {
            await api(`/leases/${vacateModal.tenant.leaseId}/vacate`, { method: "POST" });
            showToast(`${vacateModal.tenant.unit} marked as vacant`);
            setVacateModal(null);
            loadPortfolio();
        }
        catch (e) {
            showToast(e.message);
        }
    };
    const addTenant = async () => {
        if (!addTenantModal || !newTenantName.trim())
            return;
        try {
            await api("/tenants", { method: "POST", body: { unitId: addTenantModal.unitId, name: newTenantName.trim(), rent: parseInt(newTenantRent) || undefined } });
            showToast(`${newTenantName.trim()} added to ${addTenantModal.unit}`);
            setAddTenantModal(null);
            setNewTenantName("");
            setNewTenantRent("");
            loadPortfolio();
        }
        catch (e) {
            showToast(e.message);
        }
    };
    const addBuilding = async () => {
        if (!newBldgAddress.trim())
            return;
        try {
            await api("/buildings", { method: "POST", body: { address: newBldgAddress.trim(), units: parseInt(newBldgUnits) || 4 } });
            showToast(`${newBldgAddress.trim()} added to portfolio`);
            setAddBuildingModal(false);
            setNewBldgAddress("");
            setNewBldgUnits("4");
            loadPortfolio();
        }
        catch (e) {
            showToast(e.message);
        }
    };
    const showToast = (msg) => {
        setToastMsg(msg);
        setTimeout(() => setToastMsg(null), 3000);
    };
    const [reminderModal, setReminderModal] = useState(null);
    const [reminderChannel, setReminderChannel] = useState("email");
    const [reminderMsg, setReminderMsg] = useState("");
    const openReminderModal = (name, key, unit, address, rent, leaseId) => {
        setReminderChannel("email");
        setReminderMsg(`Hi ${name},\n\nThis is a friendly reminder that your rent of $${rent.toLocaleString()} for ${unit} at ${address} is overdue.\n\nPlease arrange payment at your earliest convenience.\n\nThank you.`);
        setReminderModal({ name, key, unit, address, rent, leaseId });
    };
    const sendReminder = async () => {
        if (!reminderModal)
            return;
        try {
            await api("/reminders", { method: "POST", body: { leaseId: reminderModal.leaseId, channel: reminderChannel, message: reminderMsg } });
            setSentReminders((prev) => ({ ...prev, [reminderModal.key]: (prev[reminderModal.key] ?? 0) + 1 }));
            showToast(`${reminderChannel === "email" ? "Email" : "SMS"} reminder sent to ${reminderModal.name}`);
            setReminderModal(null);
        }
        catch (e) {
            showToast(e.message);
        }
    };
    const allProperties = properties.map((p) => ({
        ...p,
        occupied: p.tenants.length,
        rent: p.tenants.reduce((s, t) => s + t.rent, 0),
        maintenance: requests.filter((req) => req.address === p.address),
    }));
    const filteredProperties = propertySearch.trim()
        ? allProperties.filter((p) => p.address.toLowerCase().includes(propertySearch.toLowerCase()))
        : allProperties;
    return (<DashboardShell role="landlord" name={account.name} onLogout={onLogout} onHome={onHome} notifCount={pendingBids}>
      {/* Toast */}
      {toastMsg && (<div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 rounded-xl shadow-xl" style={{ background: "#1a2a1a", border: "1px solid rgba(34,197,94,0.35)", color: "#86efac", fontFamily: "'Outfit', sans-serif", fontSize: "14px" }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M3 8l3.5 3.5L13 5" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          {toastMsg}
        </div>)}

      {/* Landlord document upload */}
      <input ref={landlordFileRef} type="file" className="hidden" onChange={handleLandlordFileChange} accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.heic"/>
      {landlordUploadModal && (<div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }} onClick={() => setLandlordUploadModal(null)}>
          <div className="w-full max-w-sm rounded-2xl overflow-hidden" style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.1)" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-5 border-b" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
              <h3 className="text-base font-600 text-white" style={{ fontWeight: 600 }}>Upload Document</h3>
              <button onClick={() => setLandlordUploadModal(null)} className="w-8 h-8 flex items-center justify-center rounded-lg" style={{ color: "rgba(255,255,255,0.4)", background: "rgba(255,255,255,0.06)" }} onMouseEnter={(e) => (e.currentTarget.style.color = "#fff")} onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.4)")}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
              </button>
            </div>
            <div className="px-6 py-6 flex flex-col gap-5">
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="3" y="2" width="12" height="14" rx="2" stroke="rgba(255,255,255,0.4)" strokeWidth="1.3"/><path d="M6 6h6M6 9h6M6 12h4" stroke="rgba(255,255,255,0.3)" strokeWidth="1.2" strokeLinecap="round"/></svg>
                <div className="min-w-0">
                  <div className="text-sm text-white/80 truncate">{landlordUploadModal.file.name}</div>
                  <div className="text-xs text-white/30 mt-0.5">{Math.round(landlordUploadModal.file.size / 1024)} KB</div>
                </div>
              </div>
              <div>
                <label className="block text-xs text-white/40 mb-2 uppercase tracking-widest" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "9px" }}>Document Type</label>
                <div className="flex flex-wrap gap-2">
                  {["Lease", "Inspection", "Notice", "Receipt", "Addendum", "Renewal"].map((t) => {
                const active = landlordUploadType === t;
                const color = DOC_COLORS[t];
                return (<button key={t} onClick={() => setLandlordUploadType(t)} className="px-3 py-1.5 rounded-lg text-xs font-500 transition-all" style={{ fontWeight: 500, background: active ? color + "22" : "rgba(255,255,255,0.04)", color: active ? color : "rgba(255,255,255,0.35)", border: `1px solid ${active ? color + "55" : "rgba(255,255,255,0.08)"}` }}>
                        {t}
                      </button>);
            })}
                </div>
              </div>
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button onClick={() => setLandlordUploadModal(null)} className="flex-1 py-2.5 rounded-xl text-sm transition-all" style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.4)", border: "1px solid rgba(255,255,255,0.08)" }}>
                Cancel
              </button>
              <button onClick={confirmLandlordUpload} className="flex-1 py-2.5 rounded-xl text-sm font-600 transition-all" style={{ background: r.accent, color: "#000", fontWeight: 600 }}>
                Upload
              </button>
            </div>
          </div>
        </div>)}

      {/* Maintenance detail modal */}
      {maintDetailId && (() => {
            const req = requests.find((r) => r.id === maintDetailId);
            if (!req)
                return null;
            return (<div className="fixed inset-0 z-40 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }} onClick={() => setMaintDetailId(null)}>
            <div className="w-full max-w-lg rounded-2xl overflow-hidden" style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.1)" }} onClick={(e) => e.stopPropagation()}>
              {/* Modal header */}
              <div className="flex items-start justify-between p-6 border-b" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-xs text-white/30" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{req.id}</span>
                    <StatusBadge status={req.status} accent={r.accent}/>
                    <StatusBadge status={req.priority} accent={r.accent}/>
                  </div>
                  <h3 className="text-lg font-600 text-white" style={{ fontWeight: 600 }}>{req.issue}</h3>
                  <p className="text-sm text-white/40 mt-1">{req.address} · {req.unit}</p>
                </div>
                <button onClick={() => setMaintDetailId(null)} className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors" style={{ color: "rgba(255,255,255,0.4)", background: "rgba(255,255,255,0.06)" }} onMouseEnter={(e) => (e.currentTarget.style.color = "#fff")} onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.4)")}>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </button>
              </div>
              {/* Bids */}
              <div className="p-6">
                <h4 className="text-xs text-white/30 uppercase tracking-widest mb-4" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "9px" }}>
                  Contractor Bids ({req.bids.length})
                </h4>
                {req.bids.length === 0
                    ? <p className="text-sm text-white/25 italic">No bids submitted yet</p>
                    : (<div className="flex flex-col gap-3">
                      {req.bids.map((bid) => (<div key={bid.id} className="flex items-center justify-between gap-4 p-4 rounded-xl" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-3 mb-1">
                              <span className="text-sm font-600 text-white" style={{ fontWeight: 600 }}>{bid.contractorName}</span>
                              <StatusBadge status={bid.status} accent={r.accent}/>
                            </div>
                            {bid.note && <p className="text-xs text-white/40">{bid.note}</p>}
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className="text-lg font-700 text-white" style={{ fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>${bid.price}</span>
                            {bid.status === "Pending" && (<div className="flex gap-2">
                                <button onClick={() => { onAcceptBid(req.id, bid.id); setMaintDetailId(null); }} className="px-3 py-1.5 rounded-lg text-xs font-600 transition-all" style={{ background: "#22c55e22", color: "#22c55e", border: "1px solid #22c55e44", fontWeight: 600 }} onMouseEnter={(e) => (e.currentTarget.style.background = "#22c55e44")} onMouseLeave={(e) => (e.currentTarget.style.background = "#22c55e22")}>Accept</button>
                                <button onClick={() => { onDeclineBid(req.id, bid.id); }} className="px-3 py-1.5 rounded-lg text-xs font-600 transition-all" style={{ background: "#ef444422", color: "#ef4444", border: "1px solid #ef444444", fontWeight: 600 }} onMouseEnter={(e) => (e.currentTarget.style.background = "#ef444444")} onMouseLeave={(e) => (e.currentTarget.style.background = "#ef444422")}>Decline</button>
                              </div>)}
                          </div>
                        </div>))}
                    </div>)}
              </div>
            </div>
          </div>);
        })()}
      {/* Tenant payment history modal */}
      {payHistoryTenant && (() => {
            const t = payHistoryTenant;
            const remKey = `${t.address ?? ""}-${t.name}`;
            const reminderCount = sentReminders[remKey] ?? 0;
            const history = t.history ?? [];
            const totalPaid = history.filter((h) => h.status !== "Overdue").reduce((s, h) => s + h.amount, 0);
            const lateCount = history.filter((h) => h.status === "Late").length;
            const overdueTotal = history.filter((h) => h.status === "Overdue").reduce((s, h) => s + h.amount, 0);
            return (<div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }} onClick={() => setPayHistoryTenant(null)}>
            <div className="w-full max-w-lg rounded-2xl overflow-hidden flex flex-col" style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.1)", maxHeight: "85vh" }} onClick={(e) => e.stopPropagation()}>
              {/* Header */}
              <div className="flex items-start justify-between px-6 py-5 border-b shrink-0" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
                <div>
                  <h3 className="text-lg font-600 text-white" style={{ fontWeight: 600 }}>{t.name}</h3>
                  <p className="text-xs text-white/35 mt-0.5">{t.unit}{t.address ? ` · ${t.address}` : ""} · 24-month history</p>
                </div>
                <button onClick={() => setPayHistoryTenant(null)} className="w-8 h-8 flex items-center justify-center rounded-lg" style={{ color: "rgba(255,255,255,0.4)", background: "rgba(255,255,255,0.06)" }} onMouseEnter={(e) => (e.currentTarget.style.color = "#fff")} onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.4)")}>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                </button>
              </div>

              {/* Stats strip */}
              <div className="grid grid-cols-4 gap-px shrink-0" style={{ background: "rgba(255,255,255,0.06)" }}>
                {[
                    { label: "Monthly Rent", value: `$${t.rent.toLocaleString()}`, warn: false },
                    { label: "Total Collected", value: `$${totalPaid.toLocaleString()}`, warn: false },
                    { label: "Overdue Balance", value: overdueTotal > 0 ? `$${overdueTotal.toLocaleString()}` : "None", warn: overdueTotal > 0 },
                    { label: "Reminders Sent", value: reminderCount > 0 ? `${reminderCount}×` : "None", warn: reminderCount >= 3 },
                ].map((s) => (<div key={s.label} className="px-4 py-4" style={{ background: "#111827" }}>
                    <div className="text-xs text-white/30 mb-1" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "9px" }}>{s.label}</div>
                    <div className="text-lg font-700" style={{ fontWeight: 700, color: s.warn ? "#fca5a5" : "rgba(255,255,255,0.8)" }}>{s.value}</div>
                  </div>))}
              </div>

              {/* Late / overdue summary bar */}
              {(lateCount > 0 || t.overdueMonths > 0) && (<div className="flex items-center gap-4 px-5 py-3 border-b shrink-0" style={{ borderColor: "rgba(255,255,255,0.06)", background: "rgba(0,0,0,0.15)" }}>
                  {t.overdueMonths > 0 && (<span className="flex items-center gap-1.5 text-xs" style={{ color: "#fca5a5" }}>
                      <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.3"/><path d="M6 3.5v3M6 8.5v.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
                      Currently {t.overdueMonths} month{t.overdueMonths > 1 ? "s" : ""} overdue — ${(t.rent * t.overdueMonths).toLocaleString()} outstanding
                    </span>)}
                  {lateCount > 0 && (<span className="flex items-center gap-1.5 text-xs" style={{ color: "#fbbf24" }}>
                      <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.3"/><path d="M6 3v3.5l2 1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
                      {lateCount} late payment{lateCount > 1 ? "s" : ""} in history
                    </span>)}
                  {reminderCount > 0 && (<span className="flex items-center gap-1.5 text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
                      <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M6 1v1M6 10v1M1 6h1M10 6h1M2.5 2.5l.5.5M8.8 8.8l.5.5M2.5 9.5l.5-.5M8.8 3.2l.5-.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><circle cx="6" cy="6" r="2" stroke="currentColor" strokeWidth="1.2"/></svg>
                      {reminderCount} reminder{reminderCount > 1 ? "s" : ""} sent
                    </span>)}
                </div>)}

              {/* Table */}
              <div className="overflow-y-auto flex-1">
                <div className="grid px-5 py-3 text-white/25 uppercase tracking-widest sticky top-0" style={{ gridTemplateColumns: "1fr auto auto auto", gap: "1rem", fontFamily: "'JetBrains Mono', monospace", fontSize: "9px", background: "#111827", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  <span>Period</span><span className="text-right">Overdue By</span><span className="text-right">Amount</span><span className="text-right">Status</span>
                </div>
                <div className="divide-y" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
                  {history.map((h) => (<div key={h.month} className="grid items-center px-5 py-3" style={{ gridTemplateColumns: "1fr auto auto auto", gap: "1rem" }}>
                      <span className="text-sm text-white/70">{h.month}</span>
                      <span className="text-xs text-right" style={{ fontFamily: "'JetBrains Mono', monospace", color: h.overdueDays > 0 ? (h.status === "Overdue" ? "#fca5a5" : "#fbbf24") : "rgba(255,255,255,0.15)" }}>
                        {h.overdueDays > 0 ? `${h.overdueDays}d` : "—"}
                      </span>
                      <span className="text-sm text-right" style={{ fontFamily: "'JetBrains Mono', monospace", color: h.status === "Overdue" ? "#fca5a5" : "rgba(255,255,255,0.6)" }}>
                        ${h.amount.toLocaleString()}
                      </span>
                      <StatusBadge status={h.status === "Paid" ? "Paid" : h.status === "Late" ? "Late" : "Overdue"} accent={r.accent}/>
                    </div>))}
                </div>
              </div>

              <div className="px-6 py-4 border-t shrink-0 flex justify-end" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
                <button onClick={() => setPayHistoryTenant(null)} className="text-xs px-4 py-2 rounded-lg" style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  Close
                </button>
              </div>
            </div>
          </div>);
        })()}

      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-800 text-white mb-1" style={{ fontWeight: 800 }}>Portfolio Overview</h1>
          <p className="text-white/40 text-sm">{account.name} · {allProperties.length} properties, {allProperties.reduce((s, p) => s + p.units, 0)} units</p>
        </div>

        <div className="flex gap-1 mb-8 p-1 rounded-xl w-fit" style={{ background: "rgba(255,255,255,0.05)" }}>
          {[
            { id: "overview", label: "Overview" },
            { id: "maintenance", label: "Maintenance" },
            { id: "rent", label: "Rent Tracker" },
            { id: "documents", label: "Documents" },
        ].map((t) => (<button key={t.id} onClick={() => setTab(t.id)} className="px-5 py-2 rounded-lg text-sm font-500 transition-all relative" style={{ fontWeight: 500, background: tab === t.id ? r.accentDim : "transparent", color: tab === t.id ? r.accentLight : "rgba(255,255,255,0.4)", border: tab === t.id ? `1px solid ${r.accent}44` : "1px solid transparent" }}>
              {t.label}
              {t.id === "maintenance" && pendingBids > 0 && (<span className="ml-2 inline-flex items-center justify-center w-4 h-4 rounded-full text-xs" style={{ background: r.accent, color: "#000", fontSize: "10px", fontWeight: 700 }}>{pendingBids}</span>)}
            </button>))}
        </div>

        {tab === "overview" && (<>
            {(() => {
                const totalUnits = allProperties.reduce((s, p) => s + p.units, 0);
                const totalOccupied = allProperties.reduce((s, p) => s + p.occupied, 0);
                const totalRevenue = allProperties.reduce((s, p) => s + p.rent, 0);
                const totalOverdue = allProperties.reduce((s, p) => s + p.tenants.filter((t) => !t.paid).reduce((ss, t) => ss + t.rent * t.overdueMonths, 0), 0);
                const pct = totalUnits > 0 ? Math.round((totalOccupied / totalUnits) * 100) : 0;
                return (<div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
                  <StatCard label="Total Units" value={String(totalUnits)} sub={`${totalOccupied} occupied`}/>
                  <StatCard label="Occupancy" value={`${pct}%`} sub={`${totalUnits - totalOccupied} vacant`}/>
                  <StatCard label="Monthly Revenue" value={`$${(totalRevenue / 1000).toFixed(1)}k`} sub="Across all properties"/>
                  <StatCard label="Outstanding" value={totalOverdue > 0 ? `$${totalOverdue.toLocaleString()}` : "Clear"} sub={totalOverdue > 0 ? "Overdue balance" : "No outstanding"}/>
                </div>);
            })()}
            <Card>
              <div className="flex items-center justify-between gap-4 mb-5">
                <h3 className="font-600 text-white" style={{ fontWeight: 600 }}>Properties</h3>
                <div className="flex items-center gap-3">
                <button onClick={() => setAddBuildingModal(true)} className="flex items-center gap-1.5 text-xs font-500 px-3 py-1.5 rounded-lg transition-all" style={{ color: r.accentLight, background: r.accentDim, border: `1px solid ${r.accent}33`, fontWeight: 500 }} onMouseEnter={(e) => (e.currentTarget.style.background = r.accent + "22")} onMouseLeave={(e) => (e.currentTarget.style.background = r.accentDim)}>
                  + Add Building
                </button>
                <div className="relative">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2" width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ color: "rgba(255,255,255,0.25)" }}>
                    <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5"/>
                    <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                  <input type="text" placeholder="Search by address…" value={propertySearch} onChange={(e) => setPropertySearch(e.target.value)} className="pl-8 pr-4 py-2 rounded-xl text-white text-sm outline-none transition-all w-52" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", fontFamily: "'Inter', sans-serif" }} onFocus={(e) => (e.currentTarget.style.borderColor = r.accent)} onBlur={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)")}/>
                  {propertySearch && (<button onClick={() => setPropertySearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 transition-opacity" style={{ color: "rgba(255,255,255,0.3)" }} onMouseEnter={(e) => (e.currentTarget.style.color = "#fff")} onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.3)")}>
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
                    </button>)}
                </div>
                </div>
              </div>
              {filteredProperties.length === 0 ? (<div className="text-sm text-white/25 py-6 text-center">No properties match &ldquo;{propertySearch}&rdquo;</div>) : (<div className="flex flex-col gap-2">
                  {filteredProperties.map((p) => {
                    const isOpen = expandedProperty === p.address;
                    const openMaint = p.maintenance.filter((m) => m.status !== "Resolved");
                    const totalMaint = p.maintenance.length;
                    const resolvedMaint = p.maintenance.filter((m) => m.status === "Resolved").length;
                    return (<div key={p.address} className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.07)" }}>
                        {/* Row header — clickable */}
                        <div className="w-full flex items-center gap-4 px-4 py-4 text-left transition-all cursor-pointer" role="button" tabIndex={0} style={{ background: isOpen ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.02)" }} onClick={() => setExpandedProperty(isOpen ? null : p.address)} onKeyDown={(e) => e.key === "Enter" && setExpandedProperty(isOpen ? null : p.address)} onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.06)")} onMouseLeave={(e) => (e.currentTarget.style.background = isOpen ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.02)")}>
                          {/* Chevron */}
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0" style={{ color: "rgba(255,255,255,0.25)", transform: isOpen ? "rotate(90deg)" : "none", transition: "transform 0.2s" }}>
                            <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>

                          {/* Address + bars */}
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-500 text-white/85 mb-2.5" style={{ fontWeight: 500 }}>{p.address}</div>
                            <div className="flex flex-col gap-1.5">
                              {/* Occupancy bar */}
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-white/25 w-20 shrink-0" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "9px" }}>OCCUPANCY</span>
                                <div className="flex-1 h-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
                                  <div className="h-full rounded-full transition-all" style={{ width: `${(p.occupied / p.units) * 100}%`, background: r.accent }}/>
                                </div>
                                <span className="text-xs text-white/30 w-10 text-right shrink-0" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{p.occupied}/{p.units}</span>
                              </div>
                              {/* Maintenance bar */}
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-white/25 w-20 shrink-0" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "9px" }}>MAINT.</span>
                                <div className="flex-1 h-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
                                  {totalMaint > 0 && (<div className="h-full rounded-full transition-all" style={{ width: `${(resolvedMaint / totalMaint) * 100}%`, background: resolvedMaint === totalMaint ? "#22c55e" : "#f59e0b" }}/>)}
                                </div>
                                <span className="text-xs text-white/30 w-10 text-right shrink-0" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                                  {openMaint.length > 0 ? `${openMaint.length} open` : totalMaint === 0 ? "—" : "clear"}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Rent */}
                          <div className="text-right shrink-0">
                            <div className="text-sm font-600 text-white" style={{ fontWeight: 600 }}>${p.rent.toLocaleString()}</div>
                            <div className="text-xs text-white/30">/mo</div>
                          </div>

                          {/* Remove button */}
                          <button onClick={(e) => { e.stopPropagation(); setRemoveBuildingAddress(p.address); }} title="Remove building" className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg transition-all" style={{ background: "rgba(239,68,68,0.0)", color: "rgba(255,255,255,0.2)", border: "1px solid rgba(255,255,255,0.07)" }} onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(239,68,68,0.12)"; e.currentTarget.style.color = "#fca5a5"; e.currentTarget.style.borderColor = "rgba(239,68,68,0.25)"; }} onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(239,68,68,0.0)"; e.currentTarget.style.color = "rgba(255,255,255,0.2)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.07)"; }}>
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 3h8M5 3V2h2v1M5 5v4M7 5v4M3 3l.5 7h5L9 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          </button>
                        </div>

                        {/* Expanded detail panel */}
                        {isOpen && (<div className="px-5 pb-5 pt-3 border-t" style={{ borderColor: "rgba(255,255,255,0.06)", background: "rgba(0,0,0,0.15)" }}>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                              {/* Tenants + payment status */}
                              <div>
                                <div className="flex items-center justify-between mb-3">
                                  <div className="text-xs text-white/30 uppercase tracking-widest" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "9px" }}>Tenants</div>
                                  <div className="flex items-center gap-3 text-xs" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "9px" }}>
                                    <span style={{ color: "#22c55e" }}>● {p.tenants.filter((t) => t.paid).length} paid</span>
                                    <span style={{ color: "#ef4444" }}>● {p.tenants.filter((t) => !t.paid).length} overdue</span>
                                  </div>
                                </div>
                                <div className="flex flex-col gap-2">
                                  {p.tenants.map((t) => (<div key={t.name} className="flex items-center gap-2">
                                      <button onClick={() => openPayHistory(t)} className="flex-1 flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-left transition-all" style={{ background: t.paid ? "rgba(34,197,94,0.05)" : "rgba(239,68,68,0.06)", border: `1px solid ${t.paid ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.15)"}` }} onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.8")} onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}>
                                        <div className="flex items-center gap-2 min-w-0">
                                          <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-white font-600" style={{ background: t.paid ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)", fontSize: "9px", fontWeight: 700 }}>
                                            {t.name[0]}
                                          </div>
                                          <div className="min-w-0">
                                            <div className="text-xs font-500 text-white/80 truncate" style={{ fontWeight: 500 }}>{t.name}</div>
                                            <div className="text-xs text-white/30" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "9px" }}>{t.unit}</div>
                                          </div>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                          <div className="text-right">
                                            {t.paid ? (<>
                                                <div className="text-xs font-600" style={{ color: "#22c55e", fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>+${t.rent.toLocaleString()}</div>
                                                <div className="text-xs text-white/25 mt-0.5">{t.paidDate}</div>
                                              </>) : (<>
                                                <div className="text-xs font-600" style={{ color: "#ef4444", fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>−${(t.rent * t.overdueMonths).toLocaleString()}</div>
                                                <div className="text-xs mt-0.5" style={{ color: "#f87171" }}>{t.overdueMonths} mo. overdue</div>
                                              </>)}
                                          </div>
                                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ color: "rgba(255,255,255,0.2)", flexShrink: 0 }}>
                                            <path d="M4.5 2.5l3 3-3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                                          </svg>
                                        </div>
                                      </button>
                                      <button onClick={() => setVacateModal({ address: p.address, tenant: t })} title="Mark unit vacant" className="w-7 h-7 flex items-center justify-center rounded-lg shrink-0 transition-all" style={{ background: "rgba(239,68,68,0.08)", color: "#f87171", border: "1px solid rgba(239,68,68,0.15)" }} onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(239,68,68,0.2)")} onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(239,68,68,0.08)")}>
                                        <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
                                      </button>
                                    </div>))}
                                  {(p.vacant ?? []).map((v, i) => {
                                const unitLabel = v.label;
                                return (<div key={`vacant-${i}`} className="flex flex-col gap-1.5 px-3 py-2.5 rounded-lg" style={{ border: "1px dashed rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.01)" }}>
                                      <div className="flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-2">
                                          <div className="w-5 h-5 rounded-full shrink-0" style={{ background: "rgba(255,255,255,0.04)", border: "1px dashed rgba(255,255,255,0.1)" }}/>
                                          <span className="text-xs text-white/20 italic">Vacant — {unitLabel}</span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                          {!unitInvites[`${p.address}|${unitLabel}`] && (<button onClick={() => generateUnitInvite(p.address, unitLabel, v.unitId)} className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg transition-all" style={{ background: "rgba(99,102,241,0.1)", color: "rgba(165,180,252,0.7)", border: "1px solid rgba(99,102,241,0.2)" }} onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(99,102,241,0.2)")} onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(99,102,241,0.1)")}>
                                              <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M5 2v6M2 5h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
                                              Invite Code
                                            </button>)}
                                          <button onClick={() => { setAddTenantModal({ address: p.address, unit: unitLabel, unitId: v.unitId }); setNewTenantName(""); setNewTenantRent(""); }} className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg transition-all" style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.4)", border: "1px solid rgba(255,255,255,0.1)" }} onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.12)")} onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}>
                                            + Add Tenant
                                          </button>
                                        </div>
                                      </div>
                                      {unitInvites[`${p.address}|${unitLabel}`] && (() => {
                                        const code = unitInvites[`${p.address}|${unitLabel}`];
                                        const link = `${window.location.origin}${window.location.pathname}?invite=${code}`;
                                        const linkKey = `link-${code}`;
                                        return (<>
                                          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg" style={{ background: "rgba(99,102,241,0.07)", border: "1px solid rgba(99,102,241,0.15)" }}>
                                            <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><rect x="2" y="4.5" width="6" height="5" rx="0.8" stroke="rgba(165,180,252,0.5)" strokeWidth="1"/><path d="M3.5 4.5V3.5a1.5 1.5 0 0 1 3 0v1" stroke="rgba(165,180,252,0.5)" strokeWidth="1" strokeLinecap="round"/></svg>
                                            <span className="text-xs text-white/35">Code:</span>
                                            <span className="text-xs font-700 text-indigo-300/80" style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, letterSpacing: "0.18em" }}>{code}</span>
                                            <button onClick={() => copyInviteCode(code)} className="ml-auto text-xs px-2 py-0.5 rounded transition-all" style={{ background: copiedCode === code ? "rgba(34,197,94,0.12)" : "rgba(255,255,255,0.06)", color: copiedCode === code ? "#4ade80" : "rgba(255,255,255,0.3)", border: `1px solid ${copiedCode === code ? "rgba(34,197,94,0.2)" : "rgba(255,255,255,0.08)"}` }}>
                                              {copiedCode === code ? "Copied!" : "Copy"}
                                            </button>
                                          </div>
                                          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                                            <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M4 5.5a2.5 2.5 0 0 0 3.5.5l1-1a2.5 2.5 0 0 0-3.5-3.5l-.6.6" stroke="rgba(255,255,255,0.25)" strokeWidth="1.1" strokeLinecap="round"/><path d="M6 4.5a2.5 2.5 0 0 0-3.5-.5l-1 1a2.5 2.5 0 0 0 3.5 3.5l.6-.6" stroke="rgba(255,255,255,0.25)" strokeWidth="1.1" strokeLinecap="round"/></svg>
                                            <span className="text-xs text-white/20 truncate flex-1" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "9px" }}>{link}</span>
                                            <button onClick={() => { navigator.clipboard.writeText(link).catch(() => { }); setCopiedCode(linkKey); setTimeout(() => setCopiedCode(null), 2000); }} className="shrink-0 text-xs px-2 py-0.5 rounded transition-all" style={{ background: copiedCode === linkKey ? "rgba(34,197,94,0.12)" : "rgba(255,255,255,0.05)", color: copiedCode === linkKey ? "#4ade80" : "rgba(255,255,255,0.25)", border: `1px solid ${copiedCode === linkKey ? "rgba(34,197,94,0.2)" : "rgba(255,255,255,0.07)"}` }}>
                                              {copiedCode === linkKey ? "Copied!" : "Copy link"}
                                            </button>
                                          </div>
                                          </>);
                                    })()}
                                    </div>);
                            })}
                                </div>
                              </div>

                              {/* Maintenance requests */}
                              <div>
                                <div className="text-xs text-white/30 uppercase tracking-widest mb-3" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "9px" }}>Maintenance</div>
                                {p.maintenance.length === 0
                                ? <p className="text-xs text-white/25 italic">No requests</p>
                                : (<div className="flex flex-col gap-2">
                                      {p.maintenance.map((m) => (<button key={m.id} onClick={() => setMaintDetailId(m.id)} className="flex items-start justify-between gap-3 w-full text-left px-3 py-2 rounded-lg transition-all" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }} onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.08)")} onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.03)")}>
                                          <div>
                                            <div className="text-xs text-white/70">{m.issue}</div>
                                            <div className="text-xs text-white/25 mt-0.5" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{m.id} · {m.unit}</div>
                                          </div>
                                          <div className="flex items-center gap-2 shrink-0">
                                            <StatusBadge status={m.status} accent={r.accent}/>
                                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ color: "rgba(255,255,255,0.2)" }}>
                                              <path d="M4.5 2.5l3 3-3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                                            </svg>
                                          </div>
                                        </button>))}
                                    </div>)}
                              </div>
                            </div>
                          </div>)}
                      </div>);
                })}
                </div>)}
            </Card>
          </>)}

        {tab === "maintenance" && (<div className="flex flex-col gap-4">
            {/* Access code bar */}
            {landlordCode && (<div className="flex items-center gap-3 px-4 py-3 rounded-xl" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><rect x="3" y="6" width="8" height="7" rx="1.2" stroke="rgba(255,255,255,0.3)" strokeWidth="1.2"/><path d="M5 6V4.5a2 2 0 0 1 4 0V6" stroke="rgba(255,255,255,0.3)" strokeWidth="1.2" strokeLinecap="round"/></svg>
                <span className="text-xs text-white/35">Contractor access code</span>
                <span className="text-sm font-700 text-white/70" style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, letterSpacing: "0.2em" }}>{landlordCode}</span>
                <span className="text-xs text-white/20 ml-1">— share with contractors to connect</span>
              </div>)}

            {/* Sub-tab switcher */}
            <div className="flex gap-1 p-1 rounded-xl self-start" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
              {[["requests", "Requests"], ["contractors", "Contractors"]].map(([key, label]) => (<button key={key} onClick={() => setMaintSubTab(key)} className="px-4 py-1.5 rounded-lg text-xs font-500 transition-all" style={{ background: maintSubTab === key ? "rgba(255,255,255,0.1)" : "transparent", color: maintSubTab === key ? "#fff" : "rgba(255,255,255,0.35)", fontWeight: maintSubTab === key ? 600 : 400 }}>
                  {label}
                  {key === "contractors" && (() => {
                    const ids = new Set(requests.flatMap((r) => r.bids.map((b) => b.contractorId)));
                    return ids.size > 0 ? <span className="ml-1.5 text-xs px-1.5 py-0.5 rounded-full" style={{ background: "rgba(255,255,255,0.1)", fontSize: "9px" }}>{ids.size}</span> : null;
                })()}
                </button>))}
            </div>

            {/* ——— Contractors sub-tab ——— */}
            {maintSubTab === "contractors" && (() => {
                const contractorMap = {};
                requests.forEach((req) => {
                    req.bids.forEach((bid) => {
                        if (!contractorMap[bid.contractorId])
                            contractorMap[bid.contractorId] = { id: bid.contractorId, name: bid.contractorName, bids: [], jobIds: [] };
                        contractorMap[bid.contractorId].bids.push(bid);
                        if (!contractorMap[bid.contractorId].jobIds.includes(req.id))
                            contractorMap[bid.contractorId].jobIds.push(req.id);
                    });
                });
                const contractors = Object.values(contractorMap);
                const active = contractors.filter((c) => !blockedContractors.has(c.id));
                const blocked = contractors.filter((c) => blockedContractors.has(c.id));
                if (contractors.length === 0) {
                    return (<div className="flex flex-col items-center gap-3 py-16 text-center">
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: "rgba(255,255,255,0.04)" }}>
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><circle cx="9" cy="8" r="3" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5"/><path d="M3 20c0-3.314 2.686-6 6-6s6 2.686 6 6" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" strokeLinecap="round"/><path d="M16 11l2 2 4-4" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </div>
                    <p className="text-sm text-white/25">No contractors yet</p>
                    <p className="text-xs text-white/15">Contractors who bid on your jobs will appear here.</p>
                  </div>);
                }
                const ContractorCard = ({ c }) => {
                    const accepted = c.bids.filter((b) => b.status === "Accepted").length;
                    const declined = c.bids.filter((b) => b.status === "Declined").length;
                    const pending = c.bids.filter((b) => b.status === "Pending").length;
                    const isPreferred = preferredContractors.has(c.id);
                    const isBlocked = blockedContractors.has(c.id);
                    const avgPrice = c.bids.length ? Math.round(c.bids.reduce((s, b) => s + b.price, 0) / c.bids.length) : 0;
                    const initials = c.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
                    return (<div className="p-4 rounded-2xl flex flex-col gap-3" style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${isBlocked ? "rgba(239,68,68,0.15)" : isPreferred ? "rgba(251,191,36,0.2)" : "rgba(255,255,255,0.07)"}` }}>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-sm font-700" style={{ background: isBlocked ? "rgba(239,68,68,0.1)" : isPreferred ? "rgba(251,191,36,0.12)" : "rgba(255,255,255,0.07)", color: isBlocked ? "#fca5a5" : isPreferred ? "#fde68a" : "rgba(255,255,255,0.6)", fontWeight: 700 }}>
                        {initials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-600 text-white truncate" style={{ fontWeight: 600 }}>{c.name}</span>
                          {isPreferred && <span className="text-xs px-2 py-0.5 rounded-full shrink-0" style={{ background: "rgba(251,191,36,0.12)", color: "#fde68a", border: "1px solid rgba(251,191,36,0.2)" }}>★ Preferred</span>}
                          {isBlocked && <span className="text-xs px-2 py-0.5 rounded-full shrink-0" style={{ background: "rgba(239,68,68,0.1)", color: "#fca5a5", border: "1px solid rgba(239,68,68,0.2)" }}>Blocked</span>}
                        </div>
                        <div className="text-xs text-white/30 mt-0.5">{c.jobIds.length} job{c.jobIds.length !== 1 ? "s" : ""} · avg ${avgPrice.toLocaleString()} per bid</div>
                      </div>
                    </div>

                    {/* Stats row */}
                    <div className="grid grid-cols-3 gap-2">
                      {[["Bids", c.bids.length, "rgba(255,255,255,0.5)"], ["Accepted", accepted, "#86efac"], ["Declined", declined, "#fca5a5"]].map(([label, val, color]) => (<div key={label} className="flex flex-col items-center py-2 rounded-lg" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}>
                          <span className="text-base font-700" style={{ color: color, fontWeight: 700 }}>{val}</span>
                          <span className="text-xs text-white/25 mt-0.5">{label}</span>
                        </div>))}
                    </div>
                    {pending > 0 && (<div className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.15)" }}>
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><circle cx="5" cy="5" r="4" stroke="#fde68a" strokeWidth="1"/><path d="M5 3v2.5l1.5 1" stroke="#fde68a" strokeWidth="1" strokeLinecap="round"/></svg>
                        <span className="text-xs" style={{ color: "#fde68a" }}>{pending} pending bid{pending !== 1 ? "s" : ""} awaiting review</span>
                      </div>)}

                    {/* Actions */}
                    <div className="flex gap-2">
                      <button onClick={() => setContractorStatus(c.id, isPreferred ? "connected" : "preferred")} className="flex-1 py-2 rounded-xl text-xs font-500 transition-all" style={{ background: isPreferred ? "rgba(251,191,36,0.15)" : "rgba(255,255,255,0.05)", color: isPreferred ? "#fde68a" : "rgba(255,255,255,0.4)", border: `1px solid ${isPreferred ? "rgba(251,191,36,0.25)" : "rgba(255,255,255,0.08)"}`, fontWeight: 500 }}>
                        {isPreferred ? "★ Preferred" : "☆ Set Preferred"}
                      </button>
                      <button onClick={() => setContractorStatus(c.id, isBlocked ? "connected" : "blocked")} className="flex-1 py-2 rounded-xl text-xs font-500 transition-all" style={{ background: isBlocked ? "rgba(239,68,68,0.1)" : "rgba(255,255,255,0.05)", color: isBlocked ? "#fca5a5" : "rgba(255,255,255,0.4)", border: `1px solid ${isBlocked ? "rgba(239,68,68,0.2)" : "rgba(255,255,255,0.08)"}`, fontWeight: 500 }}>
                        {isBlocked ? "Unblock" : "Block"}
                      </button>
                    </div>
                  </div>);
                };
                return (<div className="flex flex-col gap-4">
                  {active.length > 0 && (<div className="flex flex-col gap-3">
                      <div className="text-xs text-white/30 uppercase tracking-widest" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "9px" }}>Active ({active.length})</div>
                      {active.map((c) => <ContractorCard key={c.id} c={c}/>)}
                    </div>)}
                  {blocked.length > 0 && (<div className="flex flex-col gap-3">
                      <div className="text-xs text-white/30 uppercase tracking-widest" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "9px" }}>Blocked ({blocked.length})</div>
                      {blocked.map((c) => <ContractorCard key={c.id} c={c}/>)}
                    </div>)}
                </div>);
            })()}

            {/* ——— Requests sub-tab ——— */}
            {maintSubTab === "requests" && requests.map((req) => {
                const isOpen = expanded === req.id;
                const pending = req.bids.filter((b) => b.status === "Pending" && !blockedContractors.has(b.contractorId));
                return (<div key={req.id} className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.07)" }}>
                  <div className="w-full flex items-center justify-between p-5 cursor-pointer transition-all" role="button" tabIndex={0} style={{ background: isOpen ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.04)" }} onClick={() => setExpanded(isOpen ? null : req.id)} onKeyDown={(e) => e.key === "Enter" && setExpanded(isOpen ? null : req.id)} onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.07)")} onMouseLeave={(e) => (e.currentTarget.style.background = isOpen ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.04)")}>
                    <div>
                      <div className="flex items-center gap-3 mb-1">
                        <span className="text-xs text-white/30" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{req.id}</span>
                        <StatusBadge status={req.status} accent={r.accent}/>
                        <StatusBadge status={req.priority} accent={r.accent}/>
                      </div>
                      <div className="text-sm font-500 text-white" style={{ fontWeight: 500 }}>{req.issue}</div>
                      <div className="text-xs text-white/30 mt-0.5">{req.address} · {req.unit}</div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 ml-4">
                      {pending.length > 0 && (<span className="px-2.5 py-0.5 rounded-full text-xs font-600" style={{ background: "#a78bfa22", color: "#a78bfa", fontWeight: 600 }}>
                          {pending.length} bid{pending.length > 1 ? "s" : ""}
                        </span>)}
                      <button onClick={(e) => { e.stopPropagation(); setMaintDetailId(req.id); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-500 transition-all" style={{ background: r.accentDim, color: r.accentLight, border: `1px solid ${r.accent}33`, fontWeight: 500 }} onMouseEnter={(e) => (e.currentTarget.style.background = r.accent + "33")} onMouseLeave={(e) => (e.currentTarget.style.background = r.accentDim)}>
                        View details
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                          <path d="M4.5 2.5l3 3-3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                      <span className="w-8 h-8 flex items-center justify-center rounded-lg pointer-events-none" style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.4)" }}>
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ transform: isOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>
                          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </span>
                    </div>
                  </div>

                  {isOpen && (<div className="p-5 pt-0" style={{ background: "rgba(255,255,255,0.02)" }}>
                      <div className="border-t pt-5" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                        <h4 className="text-xs font-500 text-white/40 uppercase tracking-wider mb-4" style={{ fontWeight: 500 }}>Contractor Bids</h4>
                        {(() => {
                            const visibleBids = req.bids.filter((b) => !blockedContractors.has(b.contractorId));
                            const hiddenCount = req.bids.length - visibleBids.length;
                            return visibleBids.length === 0 ? (<div className="flex flex-col gap-2">
                              <p className="text-sm text-white/25 italic">No bids yet</p>
                              {hiddenCount > 0 && (<p className="text-xs text-white/20">{hiddenCount} bid{hiddenCount !== 1 ? "s" : ""} hidden — contractor{hiddenCount !== 1 ? "s" : ""} blocked</p>)}
                            </div>) : (<div className="flex flex-col gap-3">
                              {hiddenCount > 0 && (<p className="text-xs text-white/20 mb-1">{hiddenCount} bid{hiddenCount !== 1 ? "s" : ""} hidden — contractor{hiddenCount !== 1 ? "s" : ""} blocked</p>)}
                              {visibleBids.map((bid) => (<div key={bid.id} className="flex items-center justify-between gap-4 p-4 rounded-xl" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-3 mb-1">
                                      <span className="text-sm font-600 text-white" style={{ fontWeight: 600 }}>{bid.contractorName}</span>
                                      <StatusBadge status={bid.status} accent={r.accent}/>
                                    </div>
                                    {bid.note && <p className="text-xs text-white/40">{bid.note}</p>}
                                  </div>
                                  <div className="flex items-center gap-3 shrink-0">
                                    <span className="text-lg font-700 text-white" style={{ fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>${bid.price}</span>
                                    {bid.status === "Pending" && (<div className="flex gap-2">
                                        <button onClick={() => onAcceptBid(req.id, bid.id)} className="px-3 py-1.5 rounded-lg text-xs font-600 transition-all" style={{ background: "#22c55e22", color: "#22c55e", border: "1px solid #22c55e44", fontWeight: 600 }} onMouseEnter={(e) => (e.currentTarget.style.background = "#22c55e44")} onMouseLeave={(e) => (e.currentTarget.style.background = "#22c55e22")}>Accept</button>
                                        <button onClick={() => onDeclineBid(req.id, bid.id)} className="px-3 py-1.5 rounded-lg text-xs font-600 transition-all" style={{ background: "#ef444422", color: "#ef4444", border: "1px solid #ef444444", fontWeight: 600 }} onMouseEnter={(e) => (e.currentTarget.style.background = "#ef444444")} onMouseLeave={(e) => (e.currentTarget.style.background = "#ef444422")}>Decline</button>
                                      </div>)}
                                  </div>
                                </div>))}
                            </div>);
                        })()}
                      </div>
                    </div>)}
                </div>);
            })}
          </div>)}

        {tab === "rent" && (() => {
            const allTenants = allProperties.flatMap((p) => p.tenants.map((t) => ({ ...t, address: p.address })));
            const filtered = rentFilter === "all" ? allTenants
                : rentFilter === "paid" ? allTenants.filter((t) => t.paid)
                    : allTenants.filter((t) => !t.paid);
            const sorted = [...filtered].sort((a, b) => {
                let cmp = 0;
                if (rentSort === "name")
                    cmp = a.name.localeCompare(b.name);
                else if (rentSort === "amount")
                    cmp = a.rent - b.rent;
                else if (rentSort === "overdue")
                    cmp = a.overdueMonths - b.overdueMonths;
                else if (rentSort === "property")
                    cmp = a.address.localeCompare(b.address);
                return rentSortDir === "asc" ? cmp : -cmp;
            });
            const totalCollected = allTenants.filter((t) => t.paid).reduce((s, t) => s + t.rent, 0);
            const totalOutstanding = allTenants.filter((t) => !t.paid).reduce((s, t) => s + t.rent * t.overdueMonths, 0);
            const overdueCount = allTenants.filter((t) => !t.paid).length;
            const SortBtn = ({ field, label }) => (<button onClick={() => { if (rentSort === field)
                setRentSortDir((d) => d === "asc" ? "desc" : "asc");
            else {
                setRentSort(field);
                setRentSortDir("desc");
            } }} className="flex items-center gap-1 transition-colors text-left" style={{ color: rentSort === field ? r.accentLight : "rgba(255,255,255,0.3)", fontFamily: "'JetBrains Mono', monospace", fontSize: "9px", fontWeight: rentSort === field ? 600 : 400 }}>
              {label}
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ opacity: rentSort === field ? 1 : 0.3 }}>
                {rentSortDir === "asc" && rentSort === field
                    ? <path d="M2 7l3-4 3 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                    : <path d="M2 3l3 4 3-4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>}
              </svg>
            </button>);
            return (<div>
              {/* Summary strip */}
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="p-4 rounded-xl" style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.18)" }}>
                  <div className="text-xs mb-1" style={{ color: "#86efac", fontFamily: "'JetBrains Mono', monospace", fontSize: "9px" }}>COLLECTED THIS MONTH</div>
                  <div className="text-xl font-700 text-white" style={{ fontWeight: 700 }}>${totalCollected.toLocaleString()}</div>
                  <div className="text-xs mt-0.5" style={{ color: "#22c55e" }}>{allTenants.filter((t) => t.paid).length} tenants paid</div>
                </div>
                <div className="p-4 rounded-xl" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.18)" }}>
                  <div className="text-xs mb-1" style={{ color: "#fca5a5", fontFamily: "'JetBrains Mono', monospace", fontSize: "9px" }}>TOTAL OUTSTANDING</div>
                  <div className="text-xl font-700 text-white" style={{ fontWeight: 700 }}>${totalOutstanding.toLocaleString()}</div>
                  <div className="text-xs mt-0.5" style={{ color: "#ef4444" }}>{overdueCount} tenant{overdueCount !== 1 ? "s" : ""} overdue</div>
                </div>
                <div className="p-4 rounded-xl" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                  <div className="text-xs mb-1 text-white/30" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "9px" }}>COLLECTION RATE</div>
                  <div className="text-xl font-700 text-white" style={{ fontWeight: 700 }}>
                    {Math.round((allTenants.filter((t) => t.paid).length / allTenants.length) * 100)}%
                  </div>
                  <div className="mt-2 h-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
                    <div className="h-full rounded-full" style={{ width: `${(allTenants.filter((t) => t.paid).length / allTenants.length) * 100}%`, background: r.accent }}/>
                  </div>
                </div>
              </div>

              {/* Filter + sort controls */}
              <div className="flex items-center justify-between gap-4 mb-4">
                {/* Filter pills */}
                <div className="flex gap-1.5">
                  {[
                    { id: "all", label: `All (${allTenants.length})` },
                    { id: "paid", label: `Paid (${allTenants.filter((t) => t.paid).length})` },
                    { id: "overdue", label: `Overdue (${overdueCount})` },
                ].map((f) => (<button key={f.id} onClick={() => setRentFilter(f.id)} className="px-3 py-1.5 rounded-lg text-xs font-500 transition-all" style={{
                        fontWeight: 500,
                        background: rentFilter === f.id ? (f.id === "overdue" ? "rgba(239,68,68,0.15)" : f.id === "paid" ? "rgba(34,197,94,0.15)" : r.accentDim) : "rgba(255,255,255,0.05)",
                        color: rentFilter === f.id ? (f.id === "overdue" ? "#fca5a5" : f.id === "paid" ? "#86efac" : r.accentLight) : "rgba(255,255,255,0.4)",
                        border: `1px solid ${rentFilter === f.id ? (f.id === "overdue" ? "rgba(239,68,68,0.3)" : f.id === "paid" ? "rgba(34,197,94,0.3)" : r.accent + "44") : "rgba(255,255,255,0.07)"}`,
                    }}>
                      {f.label}
                    </button>))}
                </div>

                {/* Sort controls */}
                <div className="flex items-center gap-4 text-xs uppercase tracking-widest" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "9px" }}>
                  <span className="text-white/20">Sort:</span>
                  <SortBtn field="name" label="Name"/>
                  <SortBtn field="property" label="Property"/>
                  <SortBtn field="amount" label="Amount"/>
                  <SortBtn field="overdue" label="Overdue"/>
                </div>
              </div>

              {/* Table header */}
              <div className="grid gap-4 px-4 pb-2 text-white/25 uppercase tracking-widest" style={{ gridTemplateColumns: "1fr 1fr auto auto auto", fontFamily: "'JetBrains Mono', monospace", fontSize: "9px" }}>
                <span>Tenant</span>
                <span>Property</span>
                <span className="text-right">Amount</span>
                <span className="text-right">Status</span>
                <span className="text-right">Action</span>
              </div>

              {/* Rows */}
              <div className="flex flex-col gap-2">
                {sorted.length === 0 && (<div className="text-center text-white/25 py-10">No tenants match this filter</div>)}
                {sorted.map((t) => (<div key={`${t.address}-${t.name}`} className="grid items-center gap-4 px-4 py-3.5 rounded-xl transition-all" style={{
                        gridTemplateColumns: "1fr 1fr auto auto auto",
                        background: t.paid ? "rgba(34,197,94,0.04)" : "rgba(239,68,68,0.05)",
                        border: `1px solid ${t.paid ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.12)"}`,
                    }}>
                    {/* Tenant — clickable to open payment history */}
                    <button className="flex items-center gap-3 min-w-0 text-left transition-all group" onClick={() => openPayHistory(t)} onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.75")} onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}>
                      <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-700" style={{ background: t.paid ? "rgba(34,197,94,0.18)" : "rgba(239,68,68,0.18)", color: t.paid ? "#86efac" : "#fca5a5", fontWeight: 700 }}>
                        {t.name[0]}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-500 text-white truncate" style={{ fontWeight: 500 }}>{t.name}</span>
                          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" style={{ color: "rgba(255,255,255,0.2)", flexShrink: 0 }}>
                            <path d="M4.5 2.5l3 3-3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </div>
                        <div className="text-xs text-white/30" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "9px" }}>{t.unit}</div>
                      </div>
                    </button>

                    {/* Property */}
                    <div className="text-xs text-white/45 truncate">{t.address}</div>

                    {/* Amount */}
                    <div className="text-right">
                      {t.paid ? (<div>
                          <div className="text-sm font-600" style={{ color: "#22c55e", fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>+${t.rent.toLocaleString()}</div>
                          <div className="text-xs text-white/25 mt-0.5">{t.paidDate}</div>
                        </div>) : (<div>
                          <div className="text-sm font-600" style={{ color: "#ef4444", fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>−${(t.rent * t.overdueMonths).toLocaleString()}</div>
                          <div className="text-xs mt-0.5" style={{ color: "#f87171" }}>
                            ${t.rent.toLocaleString()}/mo × {t.overdueMonths}
                          </div>
                        </div>)}
                    </div>

                    {/* Status + action */}
                    <div className="flex items-center justify-end gap-3">
                      {t.paid ? (<StatusBadge status="Paid" accent={r.accent}/>) : (<>
                          <span className="inline-flex flex-col items-end gap-0.5">
                            <StatusBadge status="Overdue" accent={r.accent}/>
                            <span className="text-xs" style={{ color: "#f87171", fontFamily: "'JetBrains Mono', monospace", fontSize: "9px" }}>
                              {t.overdueMonths} mo.
                            </span>
                          </span>
                          {(() => {
                            const remKey = `${t.address}-${t.name}`;
                            const remCount = sentReminders[remKey] ?? 0;
                            return (<div className="flex flex-col items-end gap-1">
                                <button onClick={() => openReminderModal(t.name, remKey, t.unit, t.address, t.rent, t.leaseId)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-500 transition-all" style={{ background: remCount > 0 ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.12)", color: remCount > 0 ? "#86efac" : "#fca5a5", border: `1px solid ${remCount > 0 ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.22)"}`, fontWeight: 500 }} onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.8")} onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}>
                                  {remCount > 0
                                    ? <><svg width="10" height="10" viewBox="0 0 11 11" fill="none"><path d="M1.5 5.5l3 3L9.5 2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg> Send Again</>
                                    : <><svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M6 1v1M6 10v1M1 6h1M10 6h1M2.5 2.5l.7.7M8.8 8.8l.7.7M2.5 9.5l.7-.7M8.8 3.2l.7-.7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><circle cx="6" cy="6" r="2" stroke="currentColor" strokeWidth="1.2"/></svg> Remind</>}
                                </button>
                                {remCount > 0 && (<span className="text-xs" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "9px", color: "rgba(255,255,255,0.25)" }}>
                                    {remCount}× reminder{remCount > 1 ? "s" : ""} sent
                                  </span>)}
                              </div>);
                        })()}
                        </>)}
                    </div>
                  </div>))}
              </div>
            </div>);
        })()}

        {tab === "documents" && (() => {
            const docTypes = ["All", "Lease", "Inspection", "Notice", "Receipt", "Addendum", "Renewal"];
            const q = docSearch.toLowerCase();
            // Group records by address (building), sort addresses alphabetically
            const addresses = Array.from(new Set(archive.map((r) => r.address))).sort();
            const buildings = addresses.map((addr) => {
                const recs = archive.filter((r) => {
                    if (r.address !== addr)
                        return false;
                    if (docTenantFilter === "current" && !r.current)
                        return false;
                    if (docTenantFilter === "past" && r.current)
                        return false;
                    return true;
                }).map((rec) => ({
                    ...rec,
                    docs: rec.docs.filter((d) => {
                        const matchType = docTypeFilter === "All" || d.type === docTypeFilter;
                        const matchSearch = !q || d.name.toLowerCase().includes(q) || rec.tenantName.toLowerCase().includes(q) || addr.toLowerCase().includes(q);
                        return matchType && matchSearch;
                    }),
                })).map((rec) => ({ ...rec, docs: sortDocsByRecent(rec.docs) }))
                    .filter((rec) => rec.docs.length > 0 || (docTypeFilter === "All" && !q))
                    // current tenants first, then past
                    .sort((a, b) => (b.current ? 1 : 0) - (a.current ? 1 : 0));
                return { address: addr, records: recs, totalDocs: recs.reduce((s, r) => s + r.docs.length, 0) };
            }).filter((b) => b.records.length > 0);
            const totalDocs = archive.reduce((s, r) => s + r.docs.length, 0);
            return (<div>
              {/* Header */}
              <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
                <div>
                  <h2 className="text-xl text-white font-700" style={{ fontWeight: 700 }}>Document Archive</h2>
                  <p className="text-white/35 text-sm mt-0.5">10-year history · grouped by building</p>
                </div>
                <span className="text-xs px-3 py-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.35)", fontFamily: "'JetBrains Mono', monospace" }}>
                  {totalDocs} total documents
                </span>
              </div>

              {/* Search + tenant filter */}
              <div className="flex flex-wrap gap-3 mb-4">
                <div className="relative flex-1 min-w-48">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" width="13" height="13" viewBox="0 0 14 14" fill="none">
                    <circle cx="6" cy="6" r="4" stroke="rgba(255,255,255,0.3)" strokeWidth="1.3"/>
                    <path d="M9.5 9.5L13 13" stroke="rgba(255,255,255,0.3)" strokeWidth="1.3" strokeLinecap="round"/>
                  </svg>
                  <input value={docSearch} onChange={(e) => setDocSearch(e.target.value)} placeholder="Search by document name, tenant, or address…" className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm text-white placeholder-white/25 outline-none transition-all" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }} onFocus={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.2)")} onBlur={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)")}/>
                </div>
                <div className="flex gap-1 p-1 rounded-xl" style={{ background: "rgba(255,255,255,0.04)" }}>
                  {["All", "current", "past"].map((f) => (<button key={f} onClick={() => setDocTenantFilter(f)} className="px-3 py-1.5 rounded-lg text-xs font-500 transition-all" style={{ fontWeight: 500, background: docTenantFilter === f ? "rgba(255,255,255,0.1)" : "transparent", color: docTenantFilter === f ? "#fff" : "rgba(255,255,255,0.4)", border: docTenantFilter === f ? "1px solid rgba(255,255,255,0.12)" : "1px solid transparent" }}>
                      {f === "All" ? "All Tenants" : f === "current" ? "Current" : "Past"}
                    </button>))}
                </div>
              </div>

              {/* Type chips */}
              <div className="flex flex-wrap gap-2 mb-6">
                {docTypes.map((t) => {
                    const active = docTypeFilter === t;
                    const color = t === "All" ? "rgba(255,255,255,0.6)" : DOC_COLORS[t];
                    return (<button key={t} onClick={() => setDocTypeFilter(t)} className="px-3 py-1 rounded-full text-xs font-500 transition-all" style={{ fontWeight: 500, background: active ? (t === "All" ? "rgba(255,255,255,0.12)" : color + "22") : "rgba(255,255,255,0.04)", color: active ? (t === "All" ? "#fff" : color) : "rgba(255,255,255,0.35)", border: `1px solid ${active ? (t === "All" ? "rgba(255,255,255,0.2)" : color + "55") : "rgba(255,255,255,0.08)"}` }}>
                      {t}
                    </button>);
                })}
              </div>

              {buildings.length === 0 ? (<div className="text-center py-16 text-white/25 text-sm">No documents match your filters.</div>) : (<div className="flex flex-col gap-3">
                  {buildings.map((bldg) => {
                        const bldgOpen = docSearch.trim() !== "" || expandedDocBuilding === bldg.address;
                        return (<div key={bldg.address} className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
                        {/* Building header — click to expand */}
                        <button className="w-full flex items-center gap-4 px-5 py-4 text-left transition-all" style={{ background: bldgOpen ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.02)" }} onClick={() => setExpandedDocBuilding(bldgOpen && docSearch.trim() === "" ? null : bldg.address)} onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.07)")} onMouseLeave={(e) => (e.currentTarget.style.background = bldgOpen ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.02)")}>
                          {/* Building icon */}
                          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(255,255,255,0.06)" }}>
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                              <rect x="2" y="4" width="12" height="10" rx="1.5" stroke="rgba(255,255,255,0.5)" strokeWidth="1.2"/>
                              <path d="M5 14V9h6v5" stroke="rgba(255,255,255,0.5)" strokeWidth="1.2" strokeLinejoin="round"/>
                              <path d="M8 4V2" stroke="rgba(255,255,255,0.5)" strokeWidth="1.2" strokeLinecap="round"/>
                              <rect x="6" y="6" width="1.5" height="1.5" rx="0.5" fill="rgba(255,255,255,0.5)"/>
                              <rect x="8.5" y="6" width="1.5" height="1.5" rx="0.5" fill="rgba(255,255,255,0.5)"/>
                            </svg>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-600 text-white truncate" style={{ fontWeight: 600 }}>{bldg.address}</div>
                            <div className="flex items-center gap-3 mt-0.5">
                              <span className="text-xs text-white/30">{bldg.records.length} tenant record{bldg.records.length !== 1 ? "s" : ""}</span>
                              <span className="text-white/15 text-xs">·</span>
                              <span className="text-xs text-white/30" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{bldg.totalDocs} docs</span>
                              {bldg.records.some((rec) => rec.current) && (<span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "rgba(34,197,94,0.12)", color: "#22c55e", fontFamily: "'JetBrains Mono', monospace", fontSize: "9px" }}>OCCUPIED</span>)}
                            </div>
                          </div>
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0" style={{ color: "rgba(255,255,255,0.25)", transform: bldgOpen ? "rotate(90deg)" : "none", transition: "transform 0.2s" }}>
                            <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </button>

                        {/* Expanded: tenants within building */}
                        {bldgOpen && (<div className="border-t" style={{ borderColor: "rgba(255,255,255,0.06)", background: "rgba(0,0,0,0.12)" }}>
                            {bldg.records.map((rec, ri) => {
                                    const tenantKey = String(rec.leaseId);
                                    const tenantOpen = docSearch.trim() !== "" || expandedDocTenant === tenantKey;
                                    return (<div key={tenantKey} className={ri > 0 ? "border-t" : ""} style={{ borderColor: "rgba(255,255,255,0.05)" }}>
                                  {/* Tenant row — click to expand */}
                                  <button className="w-full flex items-center gap-3 px-5 py-3.5 text-left transition-all" style={{ background: tenantOpen ? "rgba(255,255,255,0.04)" : "transparent" }} onClick={() => setExpandedDocTenant(tenantOpen && docSearch.trim() === "" ? null : tenantKey)} onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")} onMouseLeave={(e) => (e.currentTarget.style.background = tenantOpen ? "rgba(255,255,255,0.04)" : "transparent")}>
                                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs shrink-0" style={{ background: rec.current ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.07)", color: rec.current ? "#22c55e" : "rgba(255,255,255,0.4)", fontWeight: 700, fontSize: "10px" }}>
                                      {rec.tenantName.split(" ").map((n) => n[0]).join("")}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2">
                                        <span className="text-sm text-white/80 font-500" style={{ fontWeight: 500 }}>{rec.tenantName}</span>
                                        {rec.current
                                            ? <span className="text-xs px-1.5 py-0.5 rounded-full shrink-0" style={{ background: "rgba(34,197,94,0.12)", color: "#22c55e", fontFamily: "'JetBrains Mono', monospace", fontSize: "9px" }}>CURRENT</span>
                                            : <span className="text-xs px-1.5 py-0.5 rounded-full shrink-0" style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.3)", fontFamily: "'JetBrains Mono', monospace", fontSize: "9px" }}>PAST</span>}
                                      </div>
                                      <div className="text-xs text-white/25 mt-0.5" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "10px" }}>{rec.unit} · {rec.period}</div>
                                    </div>
                                    <div className="flex items-center gap-3 shrink-0">
                                      <span className="text-xs text-white/25" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                                        {rec.docs.length + (landlordUploadedDocs[tenantKey]?.length ?? 0)} doc{rec.docs.length + (landlordUploadedDocs[tenantKey]?.length ?? 0) !== 1 ? "s" : ""}
                                      </span>
                                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ color: "rgba(255,255,255,0.2)", transform: tenantOpen ? "rotate(90deg)" : "none", transition: "transform 0.2s" }}>
                                        <path d="M4.5 2.5l3 3-3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                                      </svg>
                                    </div>
                                  </button>

                                  {/* Tenant document list */}
                                  {tenantOpen && (<div className="px-5 pb-4 pt-2 flex flex-col gap-2" style={{ background: "rgba(0,0,0,0.08)" }}>
                                      {sortDocsByRecent([...rec.docs, ...(landlordUploadedDocs[tenantKey] ?? [])]).map((doc) => <DocRow key={doc.id} doc={doc} accent={ROLES.landlord.accent}/>)}
                                      <button onClick={(e) => { e.stopPropagation(); landlordUploadTarget.current = tenantKey; landlordFileRef.current?.click(); }} className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-xs font-500 transition-all mt-1" style={{ background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.35)", border: "1px dashed rgba(255,255,255,0.12)", fontWeight: 500 }} onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.08)")} onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}>
                                        <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                                          <path d="M7 10V3M4 6l3-3 3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                                          <path d="M2 11h10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                                        </svg>
                                        Upload document for {rec.tenantName}
                                      </button>
                                    </div>)}
                                </div>);
                                })}
                          </div>)}
                      </div>);
                    })}
                </div>)}
            </div>);
        })()}
      </div>

      {/* Vacate confirmation modal */}
      {vacateModal && (<div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }} onClick={() => setVacateModal(null)}>
          <div className="w-full max-w-sm rounded-2xl overflow-hidden" style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.1)" }} onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-6">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4" style={{ background: "rgba(239,68,68,0.12)" }}>
                <svg width="22" height="22" viewBox="0 0 22 22" fill="none"><path d="M4 4l14 14M18 4L4 18" stroke="#ef4444" strokeWidth="2" strokeLinecap="round"/></svg>
              </div>
              <h3 className="text-lg font-600 text-white mb-2" style={{ fontWeight: 600 }}>Mark Unit Vacant?</h3>
              <p className="text-sm text-white/45">This will remove <span className="text-white/80">{vacateModal.tenant.name}</span> from <span className="text-white/80">{vacateModal.tenant.unit}</span> at {vacateModal.address} and mark the unit as vacant.</p>
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button onClick={() => setVacateModal(null)} className="flex-1 py-2.5 rounded-xl text-sm transition-all" style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.4)", border: "1px solid rgba(255,255,255,0.08)" }}>
                Cancel
              </button>
              <button onClick={vacateTenant} className="flex-1 py-2.5 rounded-xl text-sm font-600 transition-all" style={{ background: "#ef444422", color: "#ef4444", border: "1px solid #ef444444", fontWeight: 600 }} onMouseEnter={(e) => (e.currentTarget.style.background = "#ef444444")} onMouseLeave={(e) => (e.currentTarget.style.background = "#ef444422")}>
                Vacate Unit
              </button>
            </div>
          </div>
        </div>)}

      {/* Add tenant modal */}
      {addTenantModal && (<div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }} onClick={() => setAddTenantModal(null)}>
          <div className="w-full max-w-sm rounded-2xl overflow-hidden" style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.1)" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-5 border-b" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
              <div>
                <h3 className="text-base font-600 text-white" style={{ fontWeight: 600 }}>Add Tenant</h3>
                <p className="text-xs text-white/35 mt-0.5">{addTenantModal.unit} · {addTenantModal.address}</p>
              </div>
              <button onClick={() => setAddTenantModal(null)} className="w-8 h-8 flex items-center justify-center rounded-lg" style={{ color: "rgba(255,255,255,0.4)", background: "rgba(255,255,255,0.06)" }} onMouseEnter={(e) => (e.currentTarget.style.color = "#fff")} onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.4)")}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
              </button>
            </div>
            <div className="px-6 py-6 flex flex-col gap-4">
              <div>
                <label className="block text-xs text-white/40 mb-2 uppercase tracking-widest" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "9px" }}>Tenant Full Name</label>
                <input value={newTenantName} onChange={(e) => setNewTenantName(e.target.value)} placeholder="e.g. Jane Smith" className="w-full px-4 py-2.5 rounded-xl text-sm text-white placeholder-white/25 outline-none transition-all" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)" }} onFocus={(e) => (e.currentTarget.style.borderColor = r.accent + "66")} onBlur={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.09)")}/>
              </div>
              <div>
                <label className="block text-xs text-white/40 mb-2 uppercase tracking-widest" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "9px" }}>Monthly Rent ($)</label>
                <input value={newTenantRent} onChange={(e) => setNewTenantRent(e.target.value)} placeholder="e.g. 2150" type="number" min="0" className="w-full px-4 py-2.5 rounded-xl text-sm text-white placeholder-white/25 outline-none transition-all" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)" }} onFocus={(e) => (e.currentTarget.style.borderColor = r.accent + "66")} onBlur={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.09)")}/>
              </div>
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button onClick={() => setAddTenantModal(null)} className="flex-1 py-2.5 rounded-xl text-sm transition-all" style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.4)", border: "1px solid rgba(255,255,255,0.08)" }}>
                Cancel
              </button>
              <button onClick={addTenant} className="flex-1 py-2.5 rounded-xl text-sm font-600 transition-all" style={{ background: newTenantName.trim() ? r.accent : "rgba(255,255,255,0.08)", color: newTenantName.trim() ? "#000" : "rgba(255,255,255,0.2)", fontWeight: 600, cursor: newTenantName.trim() ? "pointer" : "not-allowed" }}>
                Add Tenant
              </button>
            </div>
          </div>
        </div>)}

      {/* Add building modal */}
      {addBuildingModal && (<div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }} onClick={() => setAddBuildingModal(false)}>
          <div className="w-full max-w-sm rounded-2xl overflow-hidden" style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.1)" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-5 border-b" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
              <h3 className="text-base font-600 text-white" style={{ fontWeight: 600 }}>Add Building</h3>
              <button onClick={() => setAddBuildingModal(false)} className="w-8 h-8 flex items-center justify-center rounded-lg" style={{ color: "rgba(255,255,255,0.4)", background: "rgba(255,255,255,0.06)" }} onMouseEnter={(e) => (e.currentTarget.style.color = "#fff")} onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.4)")}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
              </button>
            </div>
            <div className="px-6 py-6 flex flex-col gap-4">
              <div>
                <label className="block text-xs text-white/40 mb-2 uppercase tracking-widest" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "9px" }}>Street Address</label>
                <input value={newBldgAddress} onChange={(e) => setNewBldgAddress(e.target.value)} placeholder="e.g. 500 Oak Avenue" className="w-full px-4 py-2.5 rounded-xl text-sm text-white placeholder-white/25 outline-none transition-all" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)" }} onFocus={(e) => (e.currentTarget.style.borderColor = r.accent + "66")} onBlur={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.09)")}/>
              </div>
              <div>
                <label className="block text-xs text-white/40 mb-2 uppercase tracking-widest" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "9px" }}>Number of Units</label>
                <input value={newBldgUnits} onChange={(e) => setNewBldgUnits(e.target.value)} type="number" min="1" max="200" className="w-full px-4 py-2.5 rounded-xl text-sm text-white placeholder-white/25 outline-none transition-all" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)" }} onFocus={(e) => (e.currentTarget.style.borderColor = r.accent + "66")} onBlur={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.09)")}/>
              </div>
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button onClick={() => setAddBuildingModal(false)} className="flex-1 py-2.5 rounded-xl text-sm transition-all" style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.4)", border: "1px solid rgba(255,255,255,0.08)" }}>
                Cancel
              </button>
              <button onClick={addBuilding} className="flex-1 py-2.5 rounded-xl text-sm font-600 transition-all" style={{ background: newBldgAddress.trim() ? r.accent : "rgba(255,255,255,0.08)", color: newBldgAddress.trim() ? "#000" : "rgba(255,255,255,0.2)", fontWeight: 600, cursor: newBldgAddress.trim() ? "pointer" : "not-allowed" }}>
                Add Building
              </button>
            </div>
          </div>
        </div>)}
      {/* ——— Reminder Modal ——— */}
      {reminderModal && (<div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }}>
          <div className="w-full max-w-md rounded-2xl overflow-hidden" style={{ background: "#131825", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="px-6 pt-6 pb-4 flex items-start justify-between">
              <div>
                <h3 className="text-base font-600 text-white" style={{ fontWeight: 600 }}>Send Reminder</h3>
                <p className="text-xs text-white/35 mt-0.5">{reminderModal.name} · {reminderModal.unit} · ${reminderModal.rent.toLocaleString()}/mo</p>
              </div>
              <button onClick={() => setReminderModal(null)} className="text-white/30 hover:text-white/70 transition-colors mt-0.5">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
              </button>
            </div>

            {/* Channel toggle */}
            <div className="px-6 pb-4">
              <div className="flex gap-2 p-1 rounded-xl" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
                {["email", "sms"].map((ch) => (<button key={ch} onClick={() => {
                    setReminderChannel(ch);
                    if (ch === "sms") {
                        setReminderMsg(`Hi ${reminderModal.name}, your rent of $${reminderModal.rent.toLocaleString()} for ${reminderModal.unit} is overdue. Please arrange payment ASAP. Thank you.`);
                    }
                    else {
                        setReminderMsg(`Hi ${reminderModal.name},\n\nThis is a friendly reminder that your rent of $${reminderModal.rent.toLocaleString()} for ${reminderModal.unit} at ${reminderModal.address} is overdue.\n\nPlease arrange payment at your earliest convenience.\n\nThank you.`);
                    }
                }} className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-500 transition-all" style={{ background: reminderChannel === ch ? "rgba(255,255,255,0.1)" : "transparent", color: reminderChannel === ch ? "#fff" : "rgba(255,255,255,0.35)", fontWeight: reminderChannel === ch ? 600 : 400 }}>
                    {ch === "email"
                    ? <><svg width="13" height="13" viewBox="0 0 14 14" fill="none"><rect x="1" y="3" width="12" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.2"/><path d="M1 4.5l6 4 6-4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg> Email</>
                    : <><svg width="13" height="13" viewBox="0 0 14 14" fill="none"><rect x="3" y="1" width="8" height="12" rx="2" stroke="currentColor" strokeWidth="1.2"/><circle cx="7" cy="10.5" r="0.75" fill="currentColor"/></svg> SMS</>}
                  </button>))}
              </div>
            </div>

            {/* Message */}
            <div className="px-6 pb-4 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label className="text-xs text-white/40">Message</label>
                {reminderChannel === "sms" && (<span className="text-xs" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "9px", color: reminderMsg.length > 160 ? "#fca5a5" : "rgba(255,255,255,0.2)" }}>
                    {reminderMsg.length}/160
                  </span>)}
              </div>
              <textarea value={reminderMsg} onChange={(e) => setReminderMsg(e.target.value)} rows={reminderChannel === "sms" ? 4 : 6} className="w-full px-4 py-3 rounded-xl text-sm text-white/80 outline-none resize-none transition-all" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", fontFamily: "'Inter', sans-serif", lineHeight: 1.6 }}/>
              <p className="text-xs text-white/25">
                {reminderChannel === "email"
                ? `Will be sent to the email on file for ${reminderModal.name}.`
                : `Will be sent as a text to the phone number on file for ${reminderModal.name}.`}
              </p>
            </div>

            <div className="px-6 pb-6 flex gap-3">
              <button onClick={() => setReminderModal(null)} className="flex-1 py-2.5 rounded-xl text-sm transition-all" style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.4)", border: "1px solid rgba(255,255,255,0.08)" }}>
                Cancel
              </button>
              <button onClick={sendReminder} className="flex-1 py-2.5 rounded-xl text-sm font-600 flex items-center justify-center gap-2 transition-all" style={{ background: r.accent, color: "#000", fontWeight: 600 }}>
                <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M1.5 7l10-5-5 10-.5-4.5L1.5 7z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                Send {reminderChannel === "email" ? "Email" : "SMS"}
              </button>
            </div>
          </div>
        </div>)}

      {/* ——— Remove Building Confirmation ——— */}
      {removeBuildingAddress && (() => {
            const building = properties.find((p) => p.address === removeBuildingAddress);
            const tenantCount = building?.tenants.length ?? 0;
            return (<div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }}>
            <div className="w-full max-w-sm rounded-2xl overflow-hidden" style={{ background: "#131825", border: "1px solid rgba(239,68,68,0.2)" }}>
              <div className="px-6 pt-6 pb-5 flex flex-col gap-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(239,68,68,0.1)" }}>
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M4 5h12M8 5V4h4v1M8 8v6M12 8v6M5 5l.8 11h8.4L15 5" stroke="#fca5a5" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </div>
                <div>
                  <h3 className="text-base font-600 text-white mb-1" style={{ fontWeight: 600 }}>Remove Building?</h3>
                  <p className="text-sm text-white/45 leading-relaxed">
                    <span className="text-white/75">{removeBuildingAddress}</span> will be permanently removed from your portfolio.
                  </p>
                  {tenantCount > 0 && (<div className="flex items-start gap-2 mt-3 px-3 py-2.5 rounded-xl" style={{ background: "rgba(251,191,36,0.07)", border: "1px solid rgba(251,191,36,0.18)" }}>
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0 mt-0.5"><path d="M7 2L1.5 12h11L7 2z" stroke="#fde68a" strokeWidth="1.2" strokeLinejoin="round"/><path d="M7 6v3M7 10.5v.5" stroke="#fde68a" strokeWidth="1.2" strokeLinecap="round"/></svg>
                      <p className="text-xs" style={{ color: "#fde68a" }}>
                        This building has <strong>{tenantCount} active tenant{tenantCount !== 1 ? "s" : ""}</strong>. Their records will also be removed.
                      </p>
                    </div>)}
                </div>
              </div>
              <div className="px-6 pb-6 flex gap-3">
                <button onClick={() => setRemoveBuildingAddress(null)} className="flex-1 py-2.5 rounded-xl text-sm transition-all" style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.4)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  Cancel
                </button>
                <button onClick={() => {
                    removeBuilding();
                }} className="flex-1 py-2.5 rounded-xl text-sm font-600 transition-all" style={{ background: "rgba(239,68,68,0.15)", color: "#fca5a5", border: "1px solid rgba(239,68,68,0.25)", fontWeight: 600 }} onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(239,68,68,0.25)")} onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(239,68,68,0.15)")}>
                  Remove Building
                </button>
              </div>
            </div>
          </div>);
        })()}
    </DashboardShell>);
}
