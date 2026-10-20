/* ——— Role config ——— */
export const ROLES = {
    tenant: {
        label: "Tenant",
        desc: "Rent payments, maintenance requests, and lease info",
        bg: "#0f2137",
        accent: "#3b82f6",
        accentLight: "#93c5fd",
        accentDim: "rgba(59,130,246,0.12)",
        icon: (<svg width="24" height="24" viewBox="0 0 28 28" fill="none">
        <path d="M14 3L2 12h3v12h7v-7h4v7h7V12h3L14 3z" fill="currentColor"/>
      </svg>),
    },
    landlord: {
        label: "Landlord",
        desc: "Manage properties, tenants, and maintenance bids",
        bg: "#0d2318",
        accent: "#22c55e",
        accentLight: "#86efac",
        accentDim: "rgba(34,197,94,0.12)",
        icon: (<svg width="24" height="24" viewBox="0 0 28 28" fill="none">
        <rect x="3" y="14" width="7" height="11" rx="1" fill="currentColor"/>
        <rect x="10.5" y="8" width="7" height="17" rx="1" fill="currentColor"/>
        <rect x="18" y="3" width="7" height="22" rx="1" fill="currentColor"/>
      </svg>),
    },
    contractor: {
        label: "Contractor",
        desc: "Browse open jobs, submit bids, and track work orders",
        bg: "#1f1200",
        accent: "#f59e0b",
        accentLight: "#fcd34d",
        accentDim: "rgba(245,158,11,0.12)",
        icon: (<svg width="24" height="24" viewBox="0 0 28 28" fill="none">
        <path d="M17 4a1 1 0 0 1 .707.293l6 6A1 1 0 0 1 24 11c0 .265-.105.52-.293.707l-12 12A1 1 0 0 1 11 24H5a1 1 0 0 1-1-1v-6a1 1 0 0 1 .293-.707l12-12A1 1 0 0 1 17 4z" fill="currentColor"/>
      </svg>),
    },
};
