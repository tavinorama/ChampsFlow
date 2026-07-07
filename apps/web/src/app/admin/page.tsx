"use client";

/**
 * /admin — Founder Admin Dashboard (Control Center)
 *
 * Founder-only page (not in BottomNav). Provides a bird's-eye view of the
 * platform: system health, analytics, client list, leads, revenue (kit orders),
 * OrganicPosts engagement pipeline, and upsell opportunities.
 *
 * Access: requires Supabase super_admin app_metadata flag + API-level gate.
 * A 401/403 from /api/admin/overview is shown as a "Not authorized" message.
 *
 * Tab order:
 *   1. System Health (loaded on auth, not lazy)
 *   2. Analytics     (lazy — on tab click)
 *   3. Clients       (lazy — on tab click, loaded initially)
 *   4. Leads         (lazy — on tab click)
 *   5. Revenue       (lazy — on tab click, was "Kit Orders")
 *   6. Pipeline      (lazy — on tab click)
 *   7. Opportunities (lazy — on tab click)
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

// New types for the 3 new tabs

interface SystemHealth {
  engines: Array<{ id: string; label: string; live: boolean }>;
  infrastructure: { postgres: string; redis: string };
  envKeys: Array<{ name: string; set: boolean }>;
  attentionFlags: string[];
  mode: "live" | "demo";
}

interface AnalyticsFunnel {
  totalLeads: number;
  kitOrders: { count: number; revenueUsd: number };
  activeSubscriptions: { growth: number; agency: number; starter: number; total: number };
  mrr: number;
  arr: number;
  engagements: { requested: number; contacted: number; won: number; lost: number; pipelineValueUsd: number };
  nurtureActive: number;
}

interface Analytics {
  funnel: AnalyticsFunnel;
  conversion: { leadToKit: string; leadToSub: string; kitToSub: string };
  churn: { canceled: number; pastDue: number };
  trends: {
    leadsPerWeek: Array<{ week: string; count: number }>;
    kitOrdersPerWeek: Array<{ week: string; count: number }>;
  };
}

interface Opportunities {
  kitBuyersWithoutSub: Array<{ email: string; brand: string; kitPaidAt: string; suggestedAction: string }>;
  hotDfyLeads: Array<{ email: string; brand: string; createdAt: string; suggestedAction: string }>;
  note: string;
}

type TabId = "system-health" | "analytics" | "clients" | "leads" | "revenue" | "pipeline" | "opportunities";

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

function fmtCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
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
              Saving&hellip;
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
// InlineLineChart — pure SVG trend chart (no external library)
// ---------------------------------------------------------------------------

interface WeekDataPoint {
  week: string;
  count: number;
}

function InlineLineChart({
  data,
  title,
  strokeColor,
}: {
  data: WeekDataPoint[];
  title: string;
  strokeColor: string;
}) {
  const hasData = data.length > 0 && data.some((d) => d.count > 0);

  if (!hasData) {
    return (
      <div
        style={{
          height: "200px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "var(--color-surface-muted)",
          borderRadius: "var(--radius-md)",
          border: "1px solid var(--color-border)",
        }}
        aria-label={title}
        role="img"
      >
        <p
          style={{
            color: "var(--color-muted)",
            fontSize: "var(--font-size-caption)",
            margin: 0,
          }}
        >
          No data yet
        </p>
      </div>
    );
  }

  const viewW = 300;
  const viewH = 100;
  const padL = 8;
  const padR = 8;
  const padT = 10;
  const padB = 20;

  const counts = data.map((d) => d.count);
  const maxCount = Math.max(...counts, 1);
  const minCount = 0;

  const chartW = viewW - padL - padR;
  const chartH = viewH - padT - padB;

  const points = data.map((d, i) => {
    const x = padL + (i / Math.max(data.length - 1, 1)) * chartW;
    const y = padT + chartH - ((d.count - minCount) / (maxCount - minCount)) * chartH;
    return { x, y, ...d };
  });

  const polylinePoints = points.map((p) => `${p.x},${p.y}`).join(" ");

  // Area fill path: down to bottom-right, across to bottom-left, back up
  const firstPt = points[0];
  const lastPt = points[points.length - 1];
  const areaPath = `M ${firstPt.x},${firstPt.y} ${points.map((p) => `L ${p.x},${p.y}`).join(" ")} L ${lastPt.x},${padT + chartH} L ${firstPt.x},${padT + chartH} Z`;

  // Pick a sample of labels to avoid crowding (max 6)
  const step = Math.ceil(data.length / 6);
  const labelIndices = data.map((_, i) => i).filter((i) => i % step === 0);

  const fillId = `chart-fill-${title.replace(/\s+/g, "-").toLowerCase()}`;

  return (
    <figure
      style={{ margin: 0 }}
      aria-label={title}
    >
      <figcaption
        style={{
          fontSize: "var(--font-size-caption)",
          fontWeight: 600,
          color: "var(--color-text)",
          marginBottom: "var(--space-2)",
        }}
      >
        {title}
      </figcaption>
      <svg
        viewBox={`0 0 ${viewW} ${viewH}`}
        width="100%"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`${title} trend chart`}
        style={{ display: "block", overflow: "visible" }}
      >
        <defs>
          <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={strokeColor} stopOpacity="0.18" />
            <stop offset="100%" stopColor={strokeColor} stopOpacity="0.01" />
          </linearGradient>
        </defs>

        {/* Y-axis gridlines (3 lines) */}
        {[0, 0.5, 1].map((frac, idx) => {
          const y = padT + chartH - frac * chartH;
          const labelVal = Math.round(minCount + frac * (maxCount - minCount));
          return (
            <g key={idx}>
              <line
                x1={padL}
                y1={y}
                x2={padL + chartW}
                y2={y}
                stroke="var(--color-border)"
                strokeWidth="0.5"
                strokeDasharray="2,2"
              />
              <text
                x={padL - 2}
                y={y + 3}
                fontSize="6"
                textAnchor="end"
                fill="var(--color-muted)"
              >
                {labelVal}
              </text>
            </g>
          );
        })}

        {/* Area fill */}
        <path d={areaPath} fill={`url(#${fillId})`} />

        {/* Line */}
        <polyline
          points={polylinePoints}
          fill="none"
          stroke={strokeColor}
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Data points */}
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="2" fill={strokeColor} />
        ))}

        {/* X-axis labels */}
        {labelIndices.map((i) => (
          <text
            key={i}
            x={points[i].x}
            y={viewH - 4}
            fontSize="5.5"
            textAnchor="middle"
            fill="var(--color-muted)"
          >
            {points[i].week}
          </text>
        ))}
      </svg>
    </figure>
  );
}

// ---------------------------------------------------------------------------
// ConversionFunnel — pure CSS bar visualization
// ---------------------------------------------------------------------------

function ConversionFunnel({ analytics }: { analytics: Analytics }) {
  const { funnel, conversion } = analytics;
  const total = funnel.totalLeads || 1; // avoid division by zero

  const steps: Array<{ label: string; count: number; convRate?: string }> = [
    { label: "Leads", count: funnel.totalLeads },
    { label: "Kits", count: funnel.kitOrders.count, convRate: conversion.leadToKit },
    { label: "Subs", count: funnel.activeSubscriptions.total, convRate: conversion.leadToSub },
    { label: "DFY Won", count: funnel.engagements.won, convRate: undefined },
  ];

  return (
    <div
      role="img"
      aria-label="Conversion funnel: Leads to Kit orders to Subscriptions to DFY Won"
      style={{ marginTop: "var(--space-4)" }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${steps.length}, 1fr)`,
          gap: "var(--space-3)",
          alignItems: "end",
        }}
      >
        {steps.map((step, i) => {
          const pct = Math.max((step.count / total) * 100, 2);
          return (
            <div key={i} style={{ textAlign: "center" }}>
              <div
                style={{
                  fontSize: "var(--font-size-caption)",
                  fontWeight: 700,
                  color: "var(--color-text)",
                  marginBottom: "var(--space-1)",
                }}
              >
                {step.count.toLocaleString()}
              </div>
              <div
                style={{
                  height: `${Math.max(pct * 1.2, 8)}px`,
                  backgroundColor: "var(--color-primary)",
                  borderRadius: "var(--radius-sm) var(--radius-sm) 0 0",
                  opacity: 1 - i * 0.15,
                  transition: "height 0.3s ease",
                  minHeight: "8px",
                }}
              />
              <div
                style={{
                  fontSize: "var(--font-size-caption)",
                  color: "var(--color-muted)",
                  marginTop: "var(--space-1)",
                  fontWeight: 600,
                }}
              >
                {step.label}
              </div>
              {step.convRate && (
                <div
                  style={{
                    fontSize: "var(--font-size-badge)",
                    color: "var(--color-muted)",
                    marginTop: "2px",
                  }}
                >
                  {step.convRate}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SystemHealthTab — loaded eagerly on auth
// ---------------------------------------------------------------------------

function SystemHealthTab({ health }: { health: SystemHealth | null; loading: boolean }) {
  if (!health) {
    return (
      <p
        aria-live="polite"
        style={{ color: "var(--color-muted)", fontSize: "var(--font-size-body-sm)" }}
      >
        System health data unavailable.
      </p>
    );
  }

  const isLive = health.mode === "live";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
      {/* Mode badge */}
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "var(--space-1)",
            padding: "var(--space-1) var(--space-3)",
            borderRadius: "var(--radius-pill)",
            fontSize: "var(--font-size-body-sm)",
            fontWeight: 700,
            letterSpacing: "0.06em",
            backgroundColor: isLive
              ? "var(--color-badge-status-active-bg)"
              : "var(--color-badge-status-warn-bg)",
            color: isLive
              ? "var(--color-badge-status-active-text)"
              : "var(--color-badge-status-warn-text)",
            border: isLive
              ? "1px solid var(--color-success)"
              : "1px solid var(--color-accent-amber)",
          }}
        >
          <span
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              backgroundColor: isLive
                ? "var(--color-badge-status-active-text)"
                : "var(--color-badge-status-warn-text)",
              display: "inline-block",
              flexShrink: 0,
            }}
          />
          {isLive ? "LIVE MODE" : "DEMO MODE"}
        </span>
      </div>

      {/* Needs Attention */}
      {health.attentionFlags.length > 0 ? (
        <div
          role="alert"
          style={{
            border: "1px solid var(--color-error)",
            borderRadius: "var(--radius-md)",
            padding: "var(--space-4) var(--space-5)",
            backgroundColor: "var(--color-badge-status-warn-bg)",
          }}
        >
          <p
            style={{
              margin: "0 0 var(--space-2) 0",
              fontWeight: 700,
              fontSize: "var(--font-size-body-sm)",
              color: "var(--color-error)",
            }}
          >
            Needs Attention
          </p>
          <ul
            style={{
              margin: 0,
              paddingLeft: "var(--space-5)",
              fontSize: "var(--font-size-body-sm)",
              color: "var(--color-text)",
            }}
          >
            {health.attentionFlags.map((flag, i) => (
              <li key={i} style={{ marginBottom: "var(--space-1)" }}>
                {flag}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div
          style={{
            border: "1px solid var(--color-success)",
            borderRadius: "var(--radius-md)",
            padding: "var(--space-3) var(--space-4)",
            backgroundColor: "var(--color-success-surface)",
            color: "var(--color-success)",
            fontSize: "var(--font-size-body-sm)",
            fontWeight: 600,
          }}
        >
          All systems OK
        </div>
      )}

      {/* AI Engines */}
      <section aria-labelledby="health-engines-heading">
        <h3
          id="health-engines-heading"
          style={{
            fontSize: "var(--font-size-h4)",
            fontWeight: 700,
            color: "var(--color-text)",
            margin: "0 0 var(--space-3) 0",
          }}
        >
          AI Engines
        </h3>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: "var(--space-3)",
          }}
        >
          {health.engines.map((engine) => (
            <div
              key={engine.id}
              style={{
                backgroundColor: "var(--color-surface)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-md)",
                padding: "var(--space-4)",
                boxShadow: "var(--shadow-card)",
                display: "flex",
                alignItems: "center",
                gap: "var(--space-3)",
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: "10px",
                  height: "10px",
                  borderRadius: "50%",
                  backgroundColor: engine.live
                    ? "var(--color-success)"
                    : "var(--color-error)",
                  flexShrink: 0,
                }}
              />
              <div>
                <div
                  style={{
                    fontSize: "var(--font-size-body-sm)",
                    fontWeight: 600,
                    color: "var(--color-text)",
                  }}
                >
                  {engine.label}
                </div>
                <div
                  style={{
                    fontSize: "var(--font-size-badge)",
                    color: engine.live ? "var(--color-success)" : "var(--color-muted)",
                    fontWeight: 600,
                    letterSpacing: "0.04em",
                  }}
                >
                  {engine.live ? "LIVE" : "MOCK"}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Infrastructure */}
      <section aria-labelledby="health-infra-heading">
        <h3
          id="health-infra-heading"
          style={{
            fontSize: "var(--font-size-h4)",
            fontWeight: 700,
            color: "var(--color-text)",
            margin: "0 0 var(--space-3) 0",
          }}
        >
          Infrastructure
        </h3>
        <div
          style={{
            display: "flex",
            gap: "var(--space-6)",
            flexWrap: "wrap",
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-md)",
            padding: "var(--space-4) var(--space-5)",
            boxShadow: "var(--shadow-card)",
          }}
        >
          {[
            { label: "Postgres", status: health.infrastructure.postgres },
            { label: "Redis", status: health.infrastructure.redis },
          ].map(({ label, status }) => {
            const ok = ["ok", "connected", "up"].includes(status.toLowerCase());
            return (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                <span
                  aria-hidden="true"
                  style={{
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    backgroundColor: ok ? "var(--color-success)" : "var(--color-error)",
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    fontSize: "var(--font-size-body-sm)",
                    fontWeight: 600,
                    color: "var(--color-text)",
                  }}
                >
                  {label}
                </span>
                <span
                  style={{
                    fontSize: "var(--font-size-caption)",
                    color: ok ? "var(--color-success)" : "var(--color-error)",
                    fontWeight: 500,
                  }}
                >
                  {status}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* API Keys checklist */}
      <section aria-labelledby="health-keys-heading">
        <h3
          id="health-keys-heading"
          style={{
            fontSize: "var(--font-size-h4)",
            fontWeight: 700,
            color: "var(--color-text)",
            margin: "0 0 var(--space-3) 0",
          }}
        >
          API Keys
        </h3>
        <div
          style={{
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-md)",
            boxShadow: "var(--shadow-card)",
            overflow: "hidden",
          }}
        >
          <ul
            role="list"
            style={{
              listStyle: "none",
              margin: 0,
              padding: 0,
            }}
          >
            {health.envKeys.map((key, i) => (
              <li
                key={key.name}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "var(--space-3) var(--space-4)",
                  borderBottom: i < health.envKeys.length - 1 ? "1px solid var(--color-border)" : "none",
                  gap: "var(--space-4)",
                }}
              >
                <span
                  style={{
                    fontFamily: "monospace",
                    fontSize: "var(--font-size-caption)",
                    color: "var(--color-text)",
                    flex: 1,
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {key.name}
                </span>
                <span
                  aria-label={key.set ? "Set" : "Not set"}
                  style={{
                    fontSize: "var(--font-size-body-sm)",
                    fontWeight: 700,
                    color: key.set ? "var(--color-success)" : "var(--color-error)",
                    flexShrink: 0,
                  }}
                >
                  {key.set ? "✓" : "✗"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Hermes operator access — machine key for the operations agent */}
      <HermesOperatorPanel />
    </div>
  );
}

// ---------------------------------------------------------------------------
// HermesOperatorPanel — mint the read-only operator API key for the Hermes
// agent (VPS). Rotation semantics: generating a new key revokes the previous
// one. The plaintext is shown exactly once. Operator endpoints are PII-free
// (engine liveness, infra status, audit outcomes — no customer data).
// ---------------------------------------------------------------------------

function HermesOperatorPanel() {
  const [minted, setMinted] = useState<{ key: string; endpoints: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function mint() {
    if (
      !window.confirm(
        "Generate a new Hermes operator key? The previous operator key (if any) will be revoked immediately."
      )
    ) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await apiFetch("/api/admin/operator-key", { method: "POST" });
      const data = (await res.json()) as { key?: string; endpoints?: string[]; message?: string };
      if (res.ok && data.key) {
        setMinted({ key: data.key, endpoints: data.endpoints ?? [] });
      } else {
        setError(data.message ?? "Failed to generate the operator key.");
      }
    } catch {
      setError("Network error — no key was generated.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="hermes-operator-heading">
      <h3
        id="hermes-operator-heading"
        style={{ fontSize: "var(--font-size-h4)", fontWeight: 700, margin: "0 0 var(--space-2) 0" }}
      >
        Hermes operator access
      </h3>
      <p
        style={{
          margin: "0 0 var(--space-3) 0",
          fontSize: "var(--font-size-body-sm)",
          color: "var(--color-muted)",
        }}
      >
        Read-only machine key for the Hermes agent: engine liveness, infra status and audit
        outcomes — no customer data, billing, or secrets. Generating a new key revokes the previous
        one.
      </p>
      {error && (
        <p role="alert" style={{ margin: "0 0 var(--space-3) 0", color: "var(--color-error)", fontSize: "var(--font-size-body-sm)" }}>
          {error}
        </p>
      )}
      {minted ? (
        <div
          style={{
            border: "1px solid var(--color-success)",
            borderRadius: "var(--radius-md)",
            padding: "var(--space-4)",
            backgroundColor: "var(--color-success-surface)",
          }}
        >
          <p style={{ margin: "0 0 var(--space-2) 0", fontWeight: 700, fontSize: "var(--font-size-body-sm)", color: "var(--color-success)" }}>
            Operator key generated — copy it NOW, it will not be shown again:
          </p>
          <code
            style={{
              display: "block",
              padding: "var(--space-2) var(--space-3)",
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-md)",
              fontSize: "var(--font-size-body-sm)",
              wordBreak: "break-all",
              userSelect: "all",
            }}
          >
            {minted.key}
          </code>
          <p style={{ margin: "var(--space-3) 0 0 0", fontSize: "var(--font-size-caption)", color: "var(--color-muted)" }}>
            Paste it into the Hermes VPS config as{" "}
            <code>Authorization: Bearer &lt;key&gt;</code>. Endpoints:{" "}
            {minted.endpoints.join(" · ")}
          </p>
        </div>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => void mint()}
          style={{
            height: "38px",
            padding: "0 var(--space-5)",
            border: "none",
            borderRadius: "var(--radius-md)",
            backgroundColor: "var(--color-primary)",
            color: "#fff",
            fontWeight: 700,
            fontSize: "var(--font-size-body-sm)",
            cursor: busy ? "not-allowed" : "pointer",
            opacity: busy ? 0.6 : 1,
          }}
        >
          {busy ? "Generating…" : "Generate Hermes operator key"}
        </button>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// AnalyticsTab
// ---------------------------------------------------------------------------

function AnalyticsTab({ analytics }: { analytics: Analytics | null }) {
  if (!analytics) {
    return (
      <p
        style={{ color: "var(--color-muted)", fontSize: "var(--font-size-body-sm)" }}
      >
        Analytics data unavailable.
      </p>
    );
  }

  const churnTotal = analytics.churn.canceled + analytics.churn.pastDue;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-8)" }}>
      {/* KPI tiles */}
      <section aria-labelledby="analytics-kpi-heading">
        <h3
          id="analytics-kpi-heading"
          style={{
            fontSize: "var(--font-size-h4)",
            fontWeight: 700,
            color: "var(--color-text)",
            margin: "0 0 var(--space-4) 0",
          }}
        >
          Key Metrics
        </h3>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
            gap: "var(--space-4)",
          }}
        >
          <Tile label="MRR" value={`${fmtCurrency(analytics.funnel.mrr)}/mo`} />
          <Tile label="ARR" value={`${fmtCurrency(analytics.funnel.arr)}/yr`} />
          <Tile label="Active Subs" value={analytics.funnel.activeSubscriptions.total} />
          <Tile label="Leads" value={analytics.funnel.totalLeads} />
          <Tile label="Kit Revenue" value={fmtCurrency(analytics.funnel.kitOrders.revenueUsd)} />
          <Tile label="Pipeline Value" value={fmtCurrency(analytics.funnel.engagements.pipelineValueUsd)} />
          <Tile label="Churn" value={churnTotal} sub={`${analytics.churn.canceled} canceled, ${analytics.churn.pastDue} past due`} />
        </div>
      </section>

      {/* Conversion funnel */}
      <section aria-labelledby="analytics-funnel-heading">
        <h3
          id="analytics-funnel-heading"
          style={{
            fontSize: "var(--font-size-h4)",
            fontWeight: 700,
            color: "var(--color-text)",
            margin: "0 0 var(--space-2) 0",
          }}
        >
          Conversion Funnel
        </h3>
        <p
          style={{
            fontSize: "var(--font-size-caption)",
            color: "var(--color-muted)",
            margin: "0 0 var(--space-4) 0",
          }}
        >
          Lead-to-Kit: {analytics.conversion.leadToKit} &middot; Lead-to-Sub: {analytics.conversion.leadToSub} &middot; Kit-to-Sub: {analytics.conversion.kitToSub}
        </p>
        <div
          style={{
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-md)",
            padding: "var(--space-5)",
            boxShadow: "var(--shadow-card)",
          }}
        >
          <ConversionFunnel analytics={analytics} />
        </div>
      </section>

      {/* Weekly trend charts */}
      <section aria-labelledby="analytics-trends-heading">
        <h3
          id="analytics-trends-heading"
          style={{
            fontSize: "var(--font-size-h4)",
            fontWeight: 700,
            color: "var(--color-text)",
            margin: "0 0 var(--space-4) 0",
          }}
        >
          Weekly Trends
        </h3>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: "var(--space-4)",
          }}
        >
          <div
            style={{
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-md)",
              padding: "var(--space-5)",
              boxShadow: "var(--shadow-card)",
            }}
          >
            <InlineLineChart
              data={analytics.trends.leadsPerWeek}
              title="Leads per week"
              strokeColor="var(--color-primary)"
            />
          </div>
          <div
            style={{
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-md)",
              padding: "var(--space-5)",
              boxShadow: "var(--shadow-card)",
            }}
          >
            <InlineLineChart
              data={analytics.trends.kitOrdersPerWeek}
              title="Kit orders per week"
              strokeColor="var(--color-badge-status-active-text)"
            />
          </div>
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// OpportunitiesTab
// ---------------------------------------------------------------------------

function OpportunitiesTab({ opportunities }: { opportunities: Opportunities | null }) {
  if (!opportunities) {
    return (
      <p
        style={{ color: "var(--color-muted)", fontSize: "var(--font-size-body-sm)" }}
      >
        Opportunities data unavailable.
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-8)" }}>
      {/* Kit buyers without subscription */}
      <section aria-labelledby="opp-upsell-heading">
        <h3
          id="opp-upsell-heading"
          style={{
            fontSize: "var(--font-size-h4)",
            fontWeight: 700,
            color: "var(--color-text)",
            margin: "0 0 var(--space-4) 0",
          }}
        >
          Upsell opportunities &mdash; Kit buyers without subscription
        </h3>
        <TableWrapper>
          <thead>
            <tr>
              <th scope="col" style={TH_STYLE}>Email</th>
              <th scope="col" style={TH_STYLE}>Brand</th>
              <th scope="col" style={TH_STYLE}>Kit Paid At</th>
              <th scope="col" style={TH_STYLE}>Suggested Action</th>
            </tr>
          </thead>
          <tbody>
            {opportunities.kitBuyersWithoutSub.length === 0 ? (
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
                  No upsell opportunities right now.
                </td>
              </tr>
            ) : (
              opportunities.kitBuyersWithoutSub.map((item, i) => (
                <tr key={i} style={{ backgroundColor: "var(--color-surface)" }}>
                  <td style={TD_STYLE}>{item.email}</td>
                  <td style={{ ...TD_STYLE, fontWeight: 600 }}>{item.brand}</td>
                  <td
                    style={{
                      ...TD_STYLE,
                      color: "var(--color-muted)",
                      fontSize: "var(--font-size-caption)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {fmtShortDate(item.kitPaidAt)}
                  </td>
                  <td style={{ ...TD_STYLE, color: "var(--color-muted)" }}>
                    {item.suggestedAction}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </TableWrapper>
      </section>

      {/* Hot DFY leads */}
      <section aria-labelledby="opp-dfy-heading">
        <h3
          id="opp-dfy-heading"
          style={{
            fontSize: "var(--font-size-h4)",
            fontWeight: 700,
            color: "var(--color-text)",
            margin: "0 0 var(--space-4) 0",
          }}
        >
          Hot DFY leads
        </h3>
        <TableWrapper>
          <thead>
            <tr>
              <th scope="col" style={TH_STYLE}>Email</th>
              <th scope="col" style={TH_STYLE}>Brand</th>
              <th scope="col" style={TH_STYLE}>Date</th>
              <th scope="col" style={TH_STYLE}>Suggested Action</th>
            </tr>
          </thead>
          <tbody>
            {opportunities.hotDfyLeads.length === 0 ? (
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
                  No hot DFY leads right now.
                </td>
              </tr>
            ) : (
              opportunities.hotDfyLeads.map((item, i) => (
                <tr key={i} style={{ backgroundColor: "var(--color-surface)" }}>
                  <td style={TD_STYLE}>{item.email}</td>
                  <td style={{ ...TD_STYLE, fontWeight: 600 }}>{item.brand}</td>
                  <td
                    style={{
                      ...TD_STYLE,
                      color: "var(--color-muted)",
                      fontSize: "var(--font-size-caption)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {fmtShortDate(item.createdAt ?? null)}
                  </td>
                  <td style={{ ...TD_STYLE, color: "var(--color-muted)" }}>
                    {item.suggestedAction}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </TableWrapper>
      </section>

      {opportunities.note && (
        <p
          style={{
            fontSize: "var(--font-size-caption)",
            color: "var(--color-muted)",
            margin: 0,
          }}
        >
          {opportunities.note}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function AdminPage() {
  const [authorized, setAuthorized] = useState<boolean | null>(null); // null = checking
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [kitOrders, setKitOrders] = useState<KitOrder[]>([]);
  const [engagements, setEngagements] = useState<Engagement[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunities | null>(null);

  const [loadingOverview, setLoadingOverview] = useState(true);
  const [loadingHealth, setLoadingHealth] = useState(false);
  const [loadingTab, setLoadingTab] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("system-health");
  const [globalError, setGlobalError] = useState<string | null>(null);

  // Tracks which tabs have already fetched data (to avoid re-fetching)
  const [fetchedTabs, setFetchedTabs] = useState<Set<TabId>>(new Set());

  // Check super_admin flag client-side and load overview + system health
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

  // Load system health eagerly once authorized
  const loadSystemHealth = useCallback(async () => {
    if (fetchedTabs.has("system-health")) return;
    setLoadingHealth(true);
    try {
      const res = await apiFetch("/api/admin/system-health");
      if (res.ok) {
        const data = (await res.json()) as SystemHealth;
        setSystemHealth(data);
        setFetchedTabs((prev) => new Set([...prev, "system-health"]));
      }
    } catch {
      // Health load failure is non-fatal — tab will show "unavailable"
    } finally {
      setLoadingHealth(false);
    }
  }, [fetchedTabs]);

  useEffect(() => {
    void init();
  }, [init]);

  // Load system health once authorized
  useEffect(() => {
    if (authorized === true) {
      void loadSystemHealth();
    }
  }, [authorized, loadSystemHealth]);

  // Load tab data on demand
  const loadTab = useCallback(
    async (tab: TabId) => {
      if (!authorized) return;
      if (fetchedTabs.has(tab)) return;

      setLoadingTab(true);
      setGlobalError(null);
      try {
        if (tab === "clients") {
          const res = await apiFetch("/api/admin/clients");
          if (res.ok) {
            const data = (await res.json()) as { clients: Client[] };
            setClients(data.clients ?? []);
          }
        } else if (tab === "leads") {
          const res = await apiFetch("/api/admin/leads");
          if (res.ok) {
            const data = (await res.json()) as { leads: Lead[] };
            setLeads(data.leads ?? []);
          }
        } else if (tab === "revenue") {
          const res = await apiFetch("/api/admin/kit-orders");
          if (res.ok) {
            const data = (await res.json()) as { kitOrders: KitOrder[] };
            setKitOrders(data.kitOrders ?? []);
          }
        } else if (tab === "pipeline") {
          const res = await apiFetch("/api/admin/engagements");
          if (res.ok) {
            const data = (await res.json()) as { engagements: Engagement[] };
            setEngagements(data.engagements ?? []);
          }
        } else if (tab === "analytics") {
          const res = await apiFetch("/api/admin/analytics");
          if (res.ok) {
            const data = (await res.json()) as Analytics;
            setAnalytics(data);
          }
        } else if (tab === "opportunities") {
          const res = await apiFetch("/api/admin/opportunities");
          if (res.ok) {
            const data = (await res.json()) as Opportunities;
            setOpportunities(data);
          }
        }
        setFetchedTabs((prev) => new Set([...prev, tab]));
      } catch {
        setGlobalError("Could not load tab data. Check your connection.");
      } finally {
        setLoadingTab(false);
      }
    },
    [authorized, fetchedTabs]
  );

  // Load initial tab (clients) on mount once authorized
  useEffect(() => {
    if (authorized === true) {
      void loadTab("clients");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authorized]);

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
  // Render: authorized — full admin control center
  // ---------------------------------------------------------------------------

  const tabs: { id: TabId; label: string }[] = [
    { id: "system-health", label: "System Health" },
    { id: "analytics",     label: "Analytics" },
    { id: "clients",       label: "Clients" },
    { id: "leads",         label: "Leads" },
    { id: "revenue",       label: "Revenue" },
    { id: "pipeline",      label: "Pipeline" },
    { id: "opportunities", label: "Opportunities" },
  ];

  return (
    <>
      <style>{`
        button[role="tab"]:focus-visible {
          outline: var(--focus-outline-width) solid var(--color-focus-outline);
          outline-offset: var(--focus-outline-offset);
        }
        @media (max-width: 600px) {
          .admin-clients-table { display: none !important; }
          .admin-clients-cards { display: flex !important; }
        }
        @media (min-width: 601px) {
          .admin-clients-table { display: block !important; }
          .admin-clients-cards { display: none !important; }
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
            onKeyDown={(e) => {
              const currentIndex = tabs.findIndex((t) => t.id === activeTab);
              let nextIndex: number | null = null;
              if (e.key === "ArrowRight") {
                e.preventDefault();
                nextIndex = (currentIndex + 1) % tabs.length;
              } else if (e.key === "ArrowLeft") {
                e.preventDefault();
                nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
              } else if (e.key === "Home") {
                e.preventDefault();
                nextIndex = 0;
              } else if (e.key === "End") {
                e.preventDefault();
                nextIndex = tabs.length - 1;
              }
              if (nextIndex !== null) {
                const nextTab = tabs[nextIndex];
                handleTabChange(nextTab.id);
                document.getElementById(`tab-${nextTab.id}`)?.focus();
              }
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
                  tabIndex={isActive ? 0 : -1}
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
        {(loadingTab || (activeTab === "system-health" && loadingHealth)) && (
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

        {/* ── System Health tab ── */}
        <section
          id="tabpanel-system-health"
          role="tabpanel"
          aria-labelledby="tab-system-health"
          hidden={activeTab !== "system-health"}
        >
          <h2
            style={{
              fontSize: "var(--font-size-h3)",
              fontWeight: 700,
              margin: "0 0 var(--space-4) 0",
            }}
          >
            System Health
          </h2>
          <SystemHealthTab health={systemHealth} loading={loadingHealth} />
        </section>

        {/* ── Analytics tab ── */}
        <section
          id="tabpanel-analytics"
          role="tabpanel"
          aria-labelledby="tab-analytics"
          hidden={activeTab !== "analytics"}
        >
          <h2
            style={{
              fontSize: "var(--font-size-h3)",
              fontWeight: 700,
              margin: "0 0 var(--space-4) 0",
            }}
          >
            Analytics
          </h2>
          <AnalyticsTab analytics={analytics} />
        </section>

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

          {/* Table view (desktop) */}
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

        {/* ── Revenue tab (was Kit Orders) ── */}
        <section
          id="tabpanel-revenue"
          role="tabpanel"
          aria-labelledby="tab-revenue"
          hidden={activeTab !== "revenue"}
        >
          <h2
            style={{
              fontSize: "var(--font-size-h3)",
              fontWeight: 700,
              margin: "0 0 var(--space-4) 0",
            }}
          >
            Revenue &mdash; Kit Orders ({kitOrders.length})
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

        {/* ── Opportunities tab ── */}
        <section
          id="tabpanel-opportunities"
          role="tabpanel"
          aria-labelledby="tab-opportunities"
          hidden={activeTab !== "opportunities"}
        >
          <h2
            style={{
              fontSize: "var(--font-size-h3)",
              fontWeight: 700,
              margin: "0 0 var(--space-4) 0",
            }}
          >
            Opportunities
          </h2>
          <OpportunitiesTab opportunities={opportunities} />
        </section>
      </main>
    </>
  );
}
