import { useCallback, useEffect, useState } from "react";
import { api, getToken, setToken } from "./api";
import ContractorDashboard from "./dashboards/ContractorDashboard";
import LandlordDashboard from "./dashboards/LandlordDashboard";
import TenantDashboard from "./dashboards/TenantDashboard";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import SignUp from "./pages/SignUp";

/* ——— ROOT ——— */
export default function App() {
    const initialInviteCode = new URLSearchParams(window.location.search).get("invite") ?? "";
    const [view, setView] = useState(getToken() ? "boot" : initialInviteCode ? "signup" : "landing");
    const [account, setAccount] = useState(null);
    const [requests, setRequests] = useState([]);
    const [notifications, setNotifications] = useState([]);

    const refresh = useCallback(async () => {
        try {
            const [r, n] = await Promise.all([api("/requests"), api("/notifications")]);
            setRequests(r);
            setNotifications(n);
        } catch { /* keep showing the last data if a refresh fails */ }
    }, []);

    const enter = ({ token, user }) => {
        setToken(token);
        setAccount(user);
        setView(`dashboard-${user.role}`);
    };
    const leave = () => {
        setToken(null);
        setAccount(null);
        setRequests([]);
        setNotifications([]);
        setView("landing");
    };

    // Restore the session on page load.
    useEffect(() => {
        if (view !== "boot") return;
        api("/auth/me").then((user) => { setAccount(user); setView(`dashboard-${user.role}`); }).catch(leave);
    }, []);

    // Load data after sign-in, and keep it fresh while the tab is open.
    useEffect(() => {
        if (!account) return;
        refresh();
        const t = setInterval(() => { if (!document.hidden) refresh(); }, 15000);
        return () => clearInterval(t);
    }, [account, refresh]);

    const act = async (fn) => {
        try { await fn(); await refresh(); } catch (e) { window.alert(e.message); }
    };
    const handleSubmitBid = (requestId, price, note, lineItems, estimatedDays, warranty) =>
        act(() => api(`/requests/${requestId}/bids`, { method: "POST", body: { note, lineItems, estimatedDays, warranty } }));
    const handleAcceptBid = (requestId, bidId) => act(() => api(`/requests/${requestId}/bids/${bidId}/accept`, { method: "POST" }));
    const handleDeclineBid = (requestId, bidId) => act(() => api(`/requests/${requestId}/bids/${bidId}/decline`, { method: "POST" }));
    const handleMarkNotifsRead = () => {
        if (!notifications.some((n) => !n.read)) return;
        setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
        api("/notifications/read", { method: "POST" }).catch(() => {});
    };

    if (view === "boot") return null;
    if (view === "landing")
        return <Landing onSignIn={() => setView("login")} onSignUp={() => setView("signup")}/>;
    if (view === "signup")
        return <SignUp onBack={() => setView("landing")} initialInviteCode={initialInviteCode}
            onCreate={async (data) => enter(await api("/auth/register", { method: "POST", body: data }))}/>;
    if (view === "login" || !account)
        return <Login onBack={() => setView("landing")}
            onLogin={async (email, password) => enter(await api("/auth/login", { method: "POST", body: { email, password } }))}/>;
    if (view === "dashboard-tenant")
        return <TenantDashboard account={account} onLogout={leave} onHome={leave} requests={requests} notifications={notifications} onRefresh={refresh}/>;
    if (view === "dashboard-landlord")
        return <LandlordDashboard account={account} onLogout={leave} onHome={leave} requests={requests} onAcceptBid={handleAcceptBid} onDeclineBid={handleDeclineBid} onRefresh={refresh}/>;
    return <ContractorDashboard account={account} onLogout={leave} onHome={leave} requests={requests} notifications={notifications} onSubmitBid={handleSubmitBid} onMarkNotifsRead={handleMarkNotifsRead} onRefresh={refresh}/>;
}
