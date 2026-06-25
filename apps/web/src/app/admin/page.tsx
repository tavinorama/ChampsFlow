"use client";

/**
 * /admin — Founder Admin Dashboard
 *
 * Founder-only page (not in BottomNav). Provides a bird's-eye view of the
 * platform: overview KPIs, client list, leads, kit orders, and the
 * OrganicPosts engagement pipeline with inline status management.
 *
 * Access: requires Supabase super_admin app_metadata flag + API-level gate.
 * A 401/403 from /api/admin/overview is shown as a "Not authorized" message.
 */

import { useState, useEffect, useCallback } from "react";
import { apiFetch, getSupabase, isSupabaseConfigured } from "../../lib/supabase-browser";

// ---------------------------------------------------------------------------
// API response types
// ---------------------------------------------------------------------------

interface OverviewData {
  tenants: {
    total: number;
    byTier: {
      starter: number;
      growth: number;
      agency: number;
    };
  };
  leads: { total: number };
  kitOrders: { total: number; revenueUsdCents: number };
  engagements: {
    requested: number;
    contacted: number;
    won: number;
    lost: number;
  };
}

interface Client {
  id: string;
  name: string;
  plan_tier: string;
  created_at: string;
  brand_count: number;
}

interface Lead {
  id: string;
  email: string;
  brand: string;
  category: string;
  region: string;
  source: string;
  created_at: string;
}

interface KitOrder {
  id: string;
  email: string;
  brand: string;
  status: string;
  stripe_session_id: string | null;
  created_at: string;
  paid_at: string | null;
  delivered_at: string | null;
}

type EngagementStatus = "requested" | "contacted" | "won" | "lost";

interface Engagement {
  id: string;
  tenant_id: string;
  brand_id: string;
  sku: string;
  status: EngagementStatus;
  contact_email: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
  brand_name: string;
  tenant_name: string;
}

type TabId = "clients" | "leads" | "kit-orders" | "pipeline";

// ---------------------------------------------------------------------------
// Helper — date formatting
// ---------------------------------------------------------------------------

function fmtMonthYear(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

function fmtShortDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  } catch {
    return "—";
  }
}

// ---------------------------------------------------------------------------
// Tile component (mirrors dashboard pattern)
// ---------------------------------------------------------------------------

function Tile({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div
      style={{
        backgroundColor: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-lg)",
        padding: "var(--space-5)",
        boxShadow: "var(--shadow-card)",
      }}
    >
      <div
        style={{
          fontSize: "clamp(1.75rem, 4vw, 2.25rem)",
          fontWeight: 800,
          letterSpacing: "-0.03em",
          color: "var(--color-text)",
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: "var(--font-size-caption)",
          color: "var(--color-muted)",
          marginTop: "var(--space-1)",
        }}
      >
        {label}
      </div>
      {sub && (
        <div
          style={{
            fontSize: "var(--font-size-caption)",
            color: "var(--color-muted)",
          }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Plan tier badge
// ---------------------------------------------------------------------------

function PlanBadge({ tier }: { tier: string }) {
  const tokenMap: Record<string, { bg: string; color: string }> = {
    free:    { bg: "var(--color-badge-plan-free-bg)",    color: "var(--color-badge-plan-free-text)" },
    starter: { bg: "var(--color-badge-plan-starter-bg)", color: "var(--color-badge-plan-starter-text)" },
    growth:  { bg: "var(--color-badge-plan-growth-bg)",  color: "var(--color-badge-plan-growth-text)" },
    agency:  { bg: "var(--color-badge-plan-agency-bg)",  color: "var(--color-badge-plan-agency-text)" },
  };
  const s = tokenMap[tier.toLowerCase()] ?? tokenMap.free;
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px var(--space-2)",
        borderRadius: "var(--radius-pill)",
        fontSize: "var(--font-size-badge)",
        fontWeight: 600,
        backgroundColor: s.bg,
        color: s.color,
        textTransform: "capitalize",
      }}
    >
      {tier}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Kit order status badge
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  const tokenMap: Record<string, { bg: string; color: string }> = {
    pending:   { bg: "var(--color-badge-status-neutral-bg)", color: "var(--color-badge-status-neutral-text)" },
    paid:      { bg: "var(--color-badge-status-active-bg)",  color: "var(--color-badge-status-active-text)" },
    delivered: { bg: "var(--color-badge-status-info-bg)",    color: "var(--color-badge-status-info-text)" },
    failed:    { bg: "var(--color-badge-status-error-bg)",   color: "var(--color-badge-status-error-text)" },
  };
  const s = tokenMap[status.toLowerCase()] ?? tokenMap.pending;
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px var(--space-2)",
        borderRadius: "var(--radius-pill)",
        fontSize: "var(--font-size-badge)",
        fontWeight: 600,
        backgroundColor: s.bg,
        color: s.color,
        textTransform: "capitalize",
      }}
    >
      {status}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Engagement status badge (read-only variant for display)
// ---------------------------------------------------------------------------

function EngagementBadge({ status }: { status: EngagementStatus }) {
  const tokenMap: Record<EngagementStatus, { bg: string; color: string }> = {
    requested: { bg: "var(--color-badge-status-warn-bg)",   color: "var(--color-badge-status-warn-text)" },
    contacted: { bg: "var(--color-badge-status-info-bg)",   color: "var(--color-badge-status-info-text)" },
    won:       { bg: "var(--color-badge-status-active-bg)", color: "var(--color-badge-status-active-text)" },
    lost:      { bg: "var(--color-badge-status-error-bg)",  color: "var(--color-badge-status-error-text)" },
  };
  const s = tokenMap[status];
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px var(--space-2)",
        borderRadius: "var(--radius-pill)",
        fontSize: "var(--font-size-badge)",
        fontWeight: 600,
        backgroundColor: s.bg,
        color: s.color,
        textTransform: "capitalize",
      }}
    >
      {status}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Table shell — shared wrapper
// ---------------------------------------------------------------------------

function TableWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        overflowX: "auto",
        borderRadius: "var(--radius-md)",
        border: "1px solid var(--color-border)",
        boxShadow: "var(--shadow-card)",
      }}
    >
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontFamily: "var(--font-family)",
          fontSize: "var(--font-size-body-sm)",
          color: "var(--color-text)",
        }}
      >
        {children}
      </table>
    </div>
  );
}

const TH_STYLE: React.CSSProperties = {
  padding: "var(--space-3) var(--space-4)",
  textAlign: "left",
  fontSize: "var(--font-size-caption)",
  fontWeight: 600,
  color: "var(--color-muted)",
  backgroundColor: "var(--color-surface-muted)",
  borderBottom: "1px solid var(--color-border)",
  whiteSpace: "nowrap",
};

const TD_STYLE: React.CSSProperties = {
  padding: "var(--space-3) var(--space-4)",
  borderBottom: "1px solid var(--color-border)",
  verticalAlign: "middle",
};

// ---------------------------------------------------------------------------
// EngagementRow — manages own update state
// ---------------------------------------------------------------------------

function EngagementRow({
  engagement,
  onStatusChange,
}: {
  engagement: Engagement;
  onStatusChange: (id: string, next: EngagementStatus) => void;
}) {
  const [updating, setUpdating] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);

  async function handleStatusChange(next: EngagementStatus) {
    if (updating) return;
    const prev = engagement.status;
    setUpdating(true);
    setRowError(null);
    // Optimistic update via parent callback
    onStatusChange(engagement.id, next);
    try {
      const res = await apiFetch(`/api/admin/engagements/${engagement.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) {
        onStatusChange(engagement.id, prev);
        setRowError("Update failed — please try again.");
      }
    } catch {
      onStatusChange(engagement.id, prev);
      setRowError("Update failed — please try again.");
    } finally {
      setUpdating(false);
    }
  }

  return (
    <tr
      style={{
        backgroundColor: updating ? "var(--color-surface-muted)" : "var(--color-surface)",
        transition: "background-color 0.15s ease",
      }}
    >
      <td style={TD_STYLE}>{engagement.tenant_name}</td>
      <td style={TD_STYLE}>{engagement.brand_name}</td>
      <td style={{ ...TD_STYLE, fontFamily: "monospace", fontSize: "var(--font-size-caption)" }}>
        {engagement.sku}
      </td>
      <td style={TD_STYLE}>{engagement.contact_email ?? "—"}</td>
      <td style={TD_STYLE}>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
          <select
            value={engagement.status}
            disabled={updating}
            aria-label={`Update status for ${engagement.brand_name} engagement`}
            onChange={(e) => {
              void handleStatusChange(e.target.value as EngagementStatus);
            }}
            style={{
              padding: "var(--space-1) var(--space-2)",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--color-border)",
              backgroundColor: updating ? "var(--color-surface-muted)" : "var(--color-surface)",
              color: "var(--color-text)",
              fontFamily: "var(--font-family)",
              fontSize: "var(--font-size-caption)",
              cursor: updating ? "wait" : "pointer",
              minWidth: "100px",
            }}
          >
            <option value="requested">requested</option>
            <option value="contacted">contacted</option>
            <option value="won">won</option>
            <option value="lost">lost</option>
          </select>
          {updating && (
            <span
              aria-live="polite"
              style={{
                fontSize: "var(--font-size-caption)",
                color: "var(--color-muted)",
              }}
            >
              Saving…
            </span>
          )}
          {rowError && (
            <span
              role="alert"
              style={{
                fontSize: "var(--font-size-caption)",
                color: "var(--color-error)",
              }}
            >
              {rowError}
            </span>
          )}
        </div>
      </td>
      <td
        style={{
          ...TD_STYLE,
          fontSize: "var(--font-size-caption)",
          color: "var(--color-muted)",
          maxWidth: "180px",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        title={engagement.note ?? undefined}
      >
        {engagement.note ?? "—"}
      </td>
      <td
        style={{
          ...TD_STYLE,
          fontSize: "var(--font-size-caption)",
          color: "var(--color-muted)",
          whiteSpace: "nowrap",
        }}
      >
        {fmtShortDate(engagement.created_at)}
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function AdminPage() {
  const [authorized, setAuthorized] = useState<boolean | null>(null); // null = checking
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [kitOrders, setKitOrders] = useState<KitOrder[]>([]);
  const [engagements, setEngagements] = useState<Engagement[]>([]);

  const [loadingOverview, setLoadingOverview] = useState(true);
  const [loadingTab, setLoadingTab] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("clients");
  const [globalError, setGlobalError] = useState<string | null>(null);

  // Check super_admin flag client-side and load overview
  const init = useCallback(async () => {
    setLoadingOverview(true);
    setGlobalError(null);

    // Client-side super_admin check (API enforces the real gate)
    if (isSupabaseConfigured()) {
      try {
        const { data } = await getSupabase().auth.getSession();
        const isSuperAdmin = data.session?.user?.app_metadata?.super_admin === true;
        if (!isSuperAdmin) {
          setAuthorized(false);
          setLoadingOverview(false);
          return;
        }
      } catch {
        setAuthorized(false);
        setLoadingOverview(false);
        return;
      }
    }

    try {
      const res = await apiFetch("/api/admin/overview");
      if (res.status === 401 || res.status === 403) {
        setAuthorized(false);
        setLoadingOverview(false);
        return;
      }
      if (!res.ok) {
        setGlobalError("Could not load admin overview.");
        setAuthorized(true);
        setLoadingOverview(false);
        return;
      }
      const data = (await res.json()) as OverviewData;
      setOverview(data);
      setAuthorized(true);
    } catch {
      setGlobalError("Network error loading overview.");
      setAuthorized(true);
    } finally {
      setLoadingOverview(false);
    }
  }, []);

  useEffect(() => {
    void init();
  }, [init]);

  // Load tab data on demand
  const loadTab = useCallback(
    async (tab: TabId) => {
      if (!authorized) return;
      setLoadingTab(true);
      setGlobalError(null);
      try {
        if (tab === "clients" && clients.length === 0) {
          const res = await apiFetch("/api/admin/clients");
          if (res.ok) {
            const data = (await res.json()) as { clients: Client[] };
            setClients(data.clients ?? []);
          }
        } else if (tab === "leads" && leads.length === 0) {
          const res = await apiFetch("/api/admin/leads");
          if (res.ok) {
            const data = (await res.json()) as { leads: Lead[] };
            setLeads(data.leads ?? []);
          }
        } else if (tab === "kit-orders" && kitOrders.length === 0) {
          const res = await apiFetch("/api/admin/kit-orders");
          if (res.ok) {
            const data = (await res.json()) as { kitOrders: KitOrder[] };
            setKitOrders(data.kitOrders ?? []);
          }
        } else if (tab === "pipeline" && engagements.length === 0) {
          const res = await apiFetch("/api/admin/engagements");
          if (res.ok) {
            const data = (await res.json()) as { engagements: Engagement[] };
            setEngagements(data.engagements ?? []);
          }
        }
      } catch {
        setGlobalError("Could not load tab data. Check your connection.");
      } finally {
        setLoadingTab(false);
      }
    },
    [authorized, clients.length, leads.length, kitOrders.length, engagements.length]
  );

  // Load initial tab on mount (once authorized)
  useEffect(() => {
    if (authorized === true) {
      void loadTab("clients");
    }
  }, [authorized, loadTab]);

  function handleTabChange(tab: TabId) {
    setActiveTab(tab);
    void loadTab(tab);
  }

  // Optimistic status update for engagement rows
  function handleEngagementStatusChange(id: string, next: EngagementStatus) {
    setEngagements((prev) =>
      prev.map((e) => (e.id === id ? { ...e, status: next } : e))
    );
  }

  // ---------------------------------------------------------------------------
  // Render: checking auth
  // ---------------------------------------------------------------------------

  if (authorized === null) {
    return (
      <main
        style={{
          maxWidth: "1100px",
          margin: "0 auto",
          padding: "var(--space-8) var(--space-4) var(--space-12)",
          fontFamily: "var(--font-family)",
          color: "var(--color-text)",
        }}
      >
        <p style={{ color: "var(--color-muted)" }}>Checking authorization&hellip;</p>
      </main>
    );
  }

  // ---------------------------------------------------------------------------
  // Render: not authorized
  // ---------------------------------------------------------------------------

  if (authorized === false) {
    return (
      <main
        style={{
          maxWidth: "1100px",
          margin: "0 auto",
          padding: "var(--space-8) var(--space-4) var(--space-12)",
          fontFamily: "var(--font-family)",
          color: "var(--color-text)",
        }}
      >
        <h1
          style={{
            fontSize: "var(--font-size-h1)",
            fontWeight: 800,
            letterSpacing: "-0.02em",
            margin: "0 0 var(--space-6) 0",
          }}
        >
          Admin
        </h1>
        <div
          role="alert"
          style={{
            padding: "var(--space-5) var(--space-6)",
            backgroundColor: "var(--color-surface-muted)",
            border: "1px solid var(--color-error)",
            borderRadius: "var(--radius-md)",
            color: "var(--color-error)",
            fontSize: "var(--font-size-body-sm)",
            maxWidth: "480px",
          }}
        >
          <strong style={{ display: "block", marginBottom: "var(--space-1)" }}>
            Not authorized
          </strong>
          This page is only accessible to super administrators.
        </div>
      </main>
    );
  }

  // ---------------------------------------------------------------------------
  // Render: authorized — full admin UI
  // ---------------------------------------------------------------------------

  const tabs: { id: TabId; label: string }[] = [
    { id: "clients",    label: "Clients" },
    { id: "leads",      label: "Leads" },
    { id: "kit-orders", label: "Kit Orders" },
    { id: "pipeline",   label: "OrganicPosts Pipeline" },
  ];

  return (
    <>
      <style>{`
        button[role="tab"]:focus-visible {
          outline: var(--focus-outline-width) solid var(--color-focus-outline);
          outline-offset: var(--focus-outline-offset);
        }
      `}</style>
      <main
      style={{
        maxWidth: "1100px",
        margin: "0 auto",
        padding: "var(--space-8) var(--space-4) var(--space-12)",
        fontFamily: "var(--font-family)",
        color: "var(--color-text)",
      }}
    >
      <h1
        style={{
          fontSize: "var(--font-size-h1)",
          fontWeight: 800,
          letterSpacing: "-0.02em",
          margin: "0 0 var(--space-6) 0",
        }}
      >
        Admin
      </h1>

      {/* Global error banner */}
      {globalError && (
        <div
          role="alert"
          style={{
            padding: "var(--space-3) var(--space-4)",
            backgroundColor: "var(--color-surface-muted)",
            border: "1px solid var(--color-error)",
            borderRadius: "var(--radius-md)",
            color: "var(--color-error)",
            fontSize: "var(--font-size-body-sm)",
            marginBottom: "var(--space-6)",
          }}
        >
          {globalError}
        </div>
      )}

      {/* ── Overview KPI tiles ── */}
      <section aria-labelledby="overview-heading">
        <h2
          id="overview-heading"
          style={{
            fontSize: "var(--font-size-h3)",
            fontWeight: 700,
            margin: "0 0 var(--space-4) 0",
            color: "var(--color-text)",
          }}
        >
          Overview
        </h2>

        {loadingOverview ? (
          <p aria-live="polite" style={{ color: "var(--color-muted)" }}>Loading overview&hellip;</p>
        ) : overview ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
              gap: "var(--space-4)",
              marginBottom: "var(--space-8)",
            }}
          >
            <Tile label="Total clients"       value={overview.tenants.total} />
            <Tile label="Paid (Starter)"      value={overview.tenants.byTier.starter} />
            <Tile label="Paid (Growth)"       value={overview.tenants.byTier.growth} />
            <Tile label="Paid (Agency)"       value={overview.tenants.byTier.agency} />
            <Tile label="Total leads"         value={overview.leads.total} />
            <Tile label="Kit orders"          value={overview.kitOrders.total} />
            <Tile label="Pipeline: Requested" value={overview.engagements.requested} />
            <Tile label="Pipeline: Contacted" value={overview.engagements.contacted} />
            <Tile label="Pipeline: Won"       value={overview.engagements.won} />
          </div>
        ) : (
          <div style={{ marginBottom: "var(--space-8)" }}>
            <p style={{ color: "var(--color-muted)", fontSize: "var(--font-size-body-sm)" }}>
              Overview data unavailable.
            </p>
          </div>
        )}
      </section>

      {/* ── Tab navigation ── */}
      <nav
        aria-label="Admin sections"
        style={{ marginBottom: "var(--space-6)" }}
      >
        <div
          role="tablist"
          style={{
            display: "flex",
            gap: "var(--space-2)",
            borderBottom: "2px solid var(--color-border)",
            flexWrap: "wrap",
          }}
        >
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={isActive}
                aria-controls={`tabpanel-${tab.id}`}
                id={`tab-${tab.id}`}
                onClick={() => handleTabChange(tab.id)}
                style={{
                  padding: "var(--space-3) var(--space-4)",
                  background: "none",
                  border: "none",
                  borderBottom: isActive
                    ? "2px solid var(--color-primary)"
                    : "2px solid transparent",
                  marginBottom: "-2px",
                  fontFamily: "var(--font-family)",
                  fontSize: "var(--font-size-body-sm)",
                  fontWeight: isActive ? 700 : 400,
                  color: isActive ? "var(--color-primary)" : "var(--color-muted)",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  borderRadius: "var(--radius-sm) var(--radius-sm) 0 0",
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </nav>

      {/* ── Tab loading indicator ── */}
      {loadingTab && (
        <p
          aria-live="polite"
          style={{
            color: "var(--color-muted)",
            fontSize: "var(--font-size-body-sm)",
            marginBottom: "var(--space-4)",
          }}
        >
          Loading&hellip;
        </p>
      )}

      {/* ── Clients tab ── */}
      <section
        id="tabpanel-clients"
        role="tabpanel"
        aria-labelledby="tab-clients"
        hidden={activeTab !== "clients"}
      >
        <h2
          style={{
            fontSize: "var(--font-size-h3)",
            fontWeight: 700,
            margin: "0 0 var(--space-4) 0",
          }}
        >
          Clients ({clients.length})
        </h2>

        {/* Desktop table */}
        <div style={{ display: "none" }} className="table-hidden-mobile" />
        <div
          style={{
            display: "block",
          }}
        >
          {/* Stacked cards on very small screens, table on wider */}
          <style>{`
            @media (max-width: 600px) {
              .admin-clients-table { display: none !important; }
              .admin-clients-cards { display: flex !important; }
            }
            @media (min-width: 601px) {
              .admin-clients-table { display: block !important; }
              .admin-clients-cards { display: none !important; }
            }
          `}</style>

          {/* Table view */}
          <div className="admin-clients-table">
            <TableWrapper>
              <thead>
                <tr>
                  <th scope="col" style={TH_STYLE}>Name</th>
                  <th scope="col" style={TH_STYLE}>Plan</th>
                  <th scope="col" style={TH_STYLE}>Brands</th>
                  <th scope="col" style={TH_STYLE}>Joined</th>
                </tr>
              </thead>
              <tbody>
                {clients.length === 0 && !loadingTab ? (
                  <tr>
                    <td
                      colSpan={4}
                      style={{
                        ...TD_STYLE,
                        color: "var(--color-muted)",
                        textAlign: "center",
                        padding: "var(--space-8)",
                      }}
                    >
                      No clients yet.
                    </td>
                  </tr>
                ) : (
                  clients.map((c) => (
                    <tr
                      key={c.id}
                      style={{ backgroundColor: "var(--color-surface)" }}
                    >
                      <td style={{ ...TD_STYLE, fontWeight: 600 }}>{c.name}</td>
                      <td style={TD_STYLE}>
                        <PlanBadge tier={c.plan_tier} />
                      </td>
                      <td style={TD_STYLE}>{c.brand_count}</td>
                      <td
                        style={{
                          ...TD_STYLE,
                          color: "var(--color-muted)",
                          fontSize: "var(--font-size-caption)",
                        }}
                      >
                        {fmtMonthYear(c.created_at)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </TableWrapper>
          </div>

          {/* Card view (mobile) */}
          <div
            className="admin-clients-cards"
            style={{
              flexDirection: "column",
              gap: "var(--space-3)",
              display: "none",
            }}
          >
            {clients.map((c) => (
              <div
                key={c.id}
                style={{
                  backgroundColor: "var(--color-surface)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-md)",
                  padding: "var(--space-4)",
                  boxShadow: "var(--shadow-card)",
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: "var(--space-2)" }}>
                  {c.name}
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: "var(--space-3)",
                    alignItems: "center",
                    flexWrap: "wrap",
                    fontSize: "var(--font-size-caption)",
                    color: "var(--color-muted)",
                  }}
                >
                  <PlanBadge tier={c.plan_tier} />
                  <span>{c.brand_count} brand{c.brand_count === 1 ? "" : "s"}</span>
                  <span>Joined {fmtMonthYear(c.created_at)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Leads tab ── */}
      <section
        id="tabpanel-leads"
        role="tabpanel"
        aria-labelledby="tab-leads"
        hidden={activeTab !== "leads"}
      >
        <h2
          style={{
            fontSize: "var(--font-size-h3)",
            fontWeight: 700,
            margin: "0 0 var(--space-4) 0",
          }}
        >
          Leads ({leads.length})
        </h2>
        <TableWrapper>
          <thead>
            <tr>
              <th scope="col" style={TH_STYLE}>Email</th>
              <th scope="col" style={TH_STYLE}>Brand</th>
              <th scope="col" style={TH_STYLE}>Category</th>
              <th scope="col" style={TH_STYLE}>Region</th>
              <th scope="col" style={TH_STYLE}>Source</th>
              <th scope="col" style={TH_STYLE}>Date</th>
            </tr>
          </thead>
          <tbody>
            {leads.length === 0 && !loadingTab ? (
              <tr>
                <td
                  colSpan={6}
                  style={{
                    ...TD_STYLE,
                    color: "var(--color-muted)",
                    textAlign: "center",
                    padding: "var(--space-8)",
                  }}
                >
                  No leads yet.
                </td>
              </tr>
            ) : (
              leads.map((l) => (
                <tr key={l.id} style={{ backgroundColor: "var(--color-surface)" }}>
                  <td style={TD_STYLE}>{l.email}</td>
                  <td style={{ ...TD_STYLE, fontWeight: 600 }}>{l.brand}</td>
                  <td style={{ ...TD_STYLE, color: "var(--color-muted)" }}>{l.category}</td>
                  <td style={{ ...TD_STYLE, color: "var(--color-muted)" }}>{l.region}</td>
                  <td style={{ ...TD_STYLE, color: "var(--color-muted)" }}>{l.source}</td>
                  <td
                    style={{
                      ...TD_STYLE,
                      color: "var(--color-muted)",
                      fontSize: "var(--font-size-caption)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {fmtShortDate(l.created_at)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </TableWrapper>
      </section>

      {/* ── Kit Orders tab ── */}
      <section
        id="tabpanel-kit-orders"
        role="tabpanel"
        aria-labelledby="tab-kit-orders"
        hidden={activeTab !== "kit-orders"}
      >
        <h2
          style={{
            fontSize: "var(--font-size-h3)",
            fontWeight: 700,
            margin: "0 0 var(--space-4) 0",
          }}
        >
          Kit Orders ({kitOrders.length})
        </h2>
        <TableWrapper>
          <thead>
            <tr>
              <th scope="col" style={TH_STYLE}>Email</th>
              <th scope="col" style={TH_STYLE}>Brand</th>
              <th scope="col" style={TH_STYLE}>Status</th>
              <th scope="col" style={TH_STYLE}>Stripe Session</th>
              <th scope="col" style={TH_STYLE}>Paid At</th>
              <th scope="col" style={TH_STYLE}>Delivered At</th>
            </tr>
          </thead>
          <tbody>
            {kitOrders.length === 0 && !loadingTab ? (
              <tr>
                <td
                  colSpan={6}
                  style={{
                    ...TD_STYLE,
                    color: "var(--color-muted)",
                    textAlign: "center",
                    padding: "var(--space-8)",
                  }}
                >
                  No kit orders yet.
                </td>
              </tr>
            ) : (
              kitOrders.map((o) => (
                <tr key={o.id} style={{ backgroundColor: "var(--color-surface)" }}>
                  <td style={TD_STYLE}>{o.email}</td>
                  <td style={{ ...TD_STYLE, fontWeight: 600 }}>{o.brand}</td>
                  <td style={TD_STYLE}>
                    <StatusBadge status={o.status} />
                  </td>
                  <td
                    style={{
                      ...TD_STYLE,
                      fontFamily: "monospace",
                      fontSize: "var(--font-size-caption)",
                      color: "var(--color-muted)",
                    }}
                  >
                    {o.stripe_session_id
                      ? `${o.stripe_session_id.slice(0, 8)}…`
                      : "—"}
                  </td>
                  <td
                    style={{
                      ...TD_STYLE,
                      color: "var(--color-muted)",
                      fontSize: "var(--font-size-caption)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {fmtShortDate(o.paid_at)}
                  </td>
                  <td
                    style={{
                      ...TD_STYLE,
                      color: "var(--color-muted)",
                      fontSize: "var(--font-size-caption)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {fmtShortDate(o.delivered_at)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </TableWrapper>
      </section>

      {/* ── OrganicPosts Pipeline tab ── */}
      <section
        id="tabpanel-pipeline"
        role="tabpanel"
        aria-labelledby="tab-pipeline"
        hidden={activeTab !== "pipeline"}
      >
        <h2
          style={{
            fontSize: "var(--font-size-h3)",
            fontWeight: 700,
            margin: "0 0 var(--space-4) 0",
          }}
        >
          OrganicPosts Pipeline ({engagements.length})
        </h2>
        <TableWrapper>
          <thead>
            <tr>
              <th scope="col" style={TH_STYLE}>Client</th>
              <th scope="col" style={TH_STYLE}>Brand</th>
              <th scope="col" style={TH_STYLE}>SKU</th>
              <th scope="col" style={TH_STYLE}>Contact Email</th>
              <th scope="col" style={TH_STYLE}>Status</th>
              <th scope="col" style={TH_STYLE}>Note</th>
              <th scope="col" style={TH_STYLE}>Requested At</th>
            </tr>
          </thead>
          <tbody>
            {engagements.length === 0 && !loadingTab ? (
              <tr>
                <td
                  colSpan={7}
                  style={{
                    ...TD_STYLE,
                    color: "var(--color-muted)",
                    textAlign: "center",
                    padding: "var(--space-8)",
                  }}
                >
                  No engagements yet.
                </td>
              </tr>
            ) : (
              engagements.map((e) => (
                <EngagementRow
                  key={e.id}
                  engagement={e}
                  onStatusChange={handleEngagementStatusChange}
                />
              ))
            )}
          </tbody>
        </TableWrapper>
      </section>
    </main>
    </>
  );
}
