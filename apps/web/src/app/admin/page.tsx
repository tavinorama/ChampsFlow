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
 *   4. Leads & CRM   (lazy — on tab click; inline stage/note/follow-up per lead)
 *   5. Revenue       (lazy — on tab click, was "Kit Orders"; + subscriber resend)
 *   6. Pipeline      (lazy — on tab click)
 *   7. Opportunities (lazy — on tab click)
 */

import { useState, useEffect, useCallback, useRef } from "react";
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

// Lightweight CRM annotation, keyed by email, overlaid on leads (and reusable
// for any email-identified contact). Fetched from GET /api/admin/crm.
type CrmStage = "new" | "contacted" | "qualified" | "customer" | "lost";

const CRM_STAGES: CrmStage[] = ["new", "contacted", "qualified", "customer", "lost"];

const CRM_STAGE_LABELS: Record<CrmStage, string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  customer: "Customer",
  lost: "Lost",
};

const CRM_STAGE_TOKENS: Record<CrmStage, { bg: string; color: string }> = {
  new:       { bg: "var(--color-badge-status-neutral-bg)", color: "var(--color-badge-status-neutral-text)" },
  contacted: { bg: "var(--color-badge-status-info-bg)",    color: "var(--color-badge-status-info-text)" },
  qualified: { bg: "var(--color-badge-status-warn-bg)",    color: "var(--color-badge-status-warn-text)" },
  customer:  { bg: "var(--color-badge-status-active-bg)",  color: "var(--color-badge-status-active-text)" },
  lost:      { bg: "var(--color-badge-status-error-bg)",   color: "var(--color-badge-status-error-text)" },
};

interface CrmContact {
  email: string;
  stage: CrmStage;
  note: string | null;
  next_follow_up: string | null;
  owner: string | null;
  updated_at: string;
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

type TabId = "system-health" | "analytics" | "clients" | "leads" | "revenue" | "pipeline" | "opportunities" | "assets";

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

      {/* Platform provider keys — founder rotation (write-only) */}
      <ProviderKeysPanel />
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
// ProviderKeysPanel — rotate platform LLM/API keys without touching Railway.
// Write-only by design: the UI shows source + last4 only; a stored key value
// is never displayed again. Paste a new key → active in the API immediately,
// worker within 60s. Removing an override reverts to the Railway env key.
// ---------------------------------------------------------------------------

interface ProviderKeyStatus {
  provider: string;
  env_var: string;
  env_configured: boolean;
  override: { last4: string; rotated_at: string } | null;
  active_source: "dashboard" | "railway_env" | "none";
}

const PROVIDER_KEY_LABELS: Record<string, string> = {
  anthropic: "Anthropic (Claude)",
  openai: "OpenAI (GPT)",
  gemini: "Google (Gemini)",
  perplexity: "Perplexity",
  serp: "DataForSEO (AI Overview)",
};

function ProviderKeysPanel() {
  const [keys, setKeys] = useState<ProviderKeyStatus[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await apiFetch("/api/admin/provider-keys");
      if (res.ok) {
        const data = (await res.json()) as { keys: ProviderKeyStatus[] };
        setKeys(data.keys);
      }
    } catch {
      // keep previous state
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function replaceKey(provider: string) {
    const draft = (drafts[provider] ?? "").trim();
    if (!draft) return;
    setBusy(provider);
    setMessage("");
    try {
      const res = await apiFetch(`/api/admin/provider-keys/${provider}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: draft }),
      });
      const data = (await res.json()) as { message?: string; note?: string; last4?: string };
      if (res.ok) {
        setDrafts((d) => ({ ...d, [provider]: "" }));
        setMessage(`${PROVIDER_KEY_LABELS[provider] ?? provider}: key replaced (…${data.last4}). ${data.note ?? ""}`);
        await load();
      } else {
        setMessage(`${PROVIDER_KEY_LABELS[provider] ?? provider}: ${data.message ?? "replace failed"}`);
      }
    } catch {
      setMessage("Network error — key NOT replaced.");
    } finally {
      setBusy(null);
    }
  }

  async function removeOverride(provider: string) {
    setBusy(provider);
    setMessage("");
    try {
      const res = await apiFetch(`/api/admin/provider-keys/${provider}`, { method: "DELETE" });
      const data = (await res.json()) as { note?: string; message?: string };
      setMessage(
        res.ok
          ? `${PROVIDER_KEY_LABELS[provider] ?? provider}: ${data.note ?? "override removed"}`
          : `${PROVIDER_KEY_LABELS[provider] ?? provider}: ${data.message ?? "remove failed"}`
      );
      await load();
    } catch {
      setMessage("Network error — nothing changed.");
    } finally {
      setBusy(null);
    }
  }

  const sourceBadge = (k: ProviderKeyStatus) => {
    const map = {
      dashboard: { label: "Dashboard override", color: "var(--color-primary)" },
      railway_env: { label: "Railway env", color: "var(--color-success)" },
      none: { label: "Not configured", color: "var(--color-error)" },
    } as const;
    const s = map[k.active_source];
    return (
      <span
        style={{
          fontSize: "var(--font-size-caption)",
          fontWeight: 700,
          color: s.color,
          border: `1px solid ${s.color}`,
          borderRadius: "var(--radius-pill)",
          padding: "1px var(--space-2)",
          whiteSpace: "nowrap",
        }}
      >
        {s.label}
      </span>
    );
  };

  return (
    <section aria-labelledby="provider-keys-heading">
      <h3
        id="provider-keys-heading"
        style={{
          fontSize: "var(--font-size-h4)",
          fontWeight: 700,
          margin: "0 0 var(--space-2) 0",
        }}
      >
        Provider keys
      </h3>
      <p
        style={{
          margin: "0 0 var(--space-4) 0",
          fontSize: "var(--font-size-body-sm)",
          color: "var(--color-muted)",
        }}
      >
        Rotate a platform key without touching Railway. Keys are write-only: paste a new one and it
        goes live in the API immediately (worker within 60s). Stored values are never shown again.
      </p>
      {message && (
        <p
          role="status"
          aria-live="polite"
          style={{
            margin: "0 0 var(--space-3) 0",
            fontSize: "var(--font-size-body-sm)",
            color: "var(--color-text)",
            fontWeight: 600,
          }}
        >
          {message}
        </p>
      )}
      {!keys ? (
        <p style={{ color: "var(--color-muted)", fontSize: "var(--font-size-body-sm)" }}>Loading…</p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          {keys.map((k) => (
            <li
              key={k.provider}
              style={{
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-md)",
                padding: "var(--space-3) var(--space-4)",
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: "var(--space-3)",
              }}
            >
              <div style={{ minWidth: "200px", flex: "1 1 200px" }}>
                <p style={{ margin: 0, fontWeight: 700, fontSize: "var(--font-size-body-sm)" }}>
                  {PROVIDER_KEY_LABELS[k.provider] ?? k.provider}
                </p>
                <p style={{ margin: "2px 0 0 0", fontSize: "var(--font-size-caption)", color: "var(--color-muted)" }}>
                  {sourceBadge(k)}{" "}
                  {k.override
                    ? `…${k.override.last4} · rotated ${new Date(k.override.rotated_at).toLocaleDateString()}`
                    : k.env_configured
                      ? `from ${k.env_var}`
                      : "no key anywhere"}
                </p>
              </div>
              <input
                type="password"
                autoComplete="off"
                placeholder="Paste new key"
                aria-label={`New key for ${PROVIDER_KEY_LABELS[k.provider] ?? k.provider}`}
                value={drafts[k.provider] ?? ""}
                onChange={(e) => setDrafts((d) => ({ ...d, [k.provider]: e.target.value }))}
                style={{
                  flex: "2 1 240px",
                  height: "36px",
                  padding: "0 var(--space-3)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-md)",
                  backgroundColor: "var(--color-surface)",
                  color: "var(--color-text)",
                  fontFamily: "var(--font-family)",
                  fontSize: "var(--font-size-body-sm)",
                }}
              />
              <button
                type="button"
                disabled={busy !== null || !(drafts[k.provider] ?? "").trim()}
                onClick={() => void replaceKey(k.provider)}
                style={{
                  height: "36px",
                  padding: "0 var(--space-4)",
                  border: "none",
                  borderRadius: "var(--radius-md)",
                  backgroundColor: "var(--color-primary)",
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: "var(--font-size-body-sm)",
                  cursor: busy !== null ? "not-allowed" : "pointer",
                  opacity: busy !== null || !(drafts[k.provider] ?? "").trim() ? 0.5 : 1,
                }}
              >
                {busy === k.provider ? "Saving…" : "Replace"}
              </button>
              {k.override && (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void removeOverride(k.provider)}
                  style={{
                    height: "36px",
                    padding: "0 var(--space-3)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-md)",
                    backgroundColor: "transparent",
                    color: "var(--color-muted)",
                    fontSize: "var(--font-size-body-sm)",
                    cursor: busy !== null ? "not-allowed" : "pointer",
                  }}
                >
                  Remove override
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// AssetsTab — the asset library: client deliverables, brand kit, GTM content.
// Static manifest served by GET /api/admin/assets (same data Hermes reads via
// the operator API). publicPath = live artifact; repoPath = editable source.
// ---------------------------------------------------------------------------

interface OzvorAssetRow {
  id: string;
  title: string;
  category: "client-deliverable" | "brand" | "content-gtm";
  format: string;
  description: string;
  publicPath?: string;
  repoPath?: string;
  deliveredVia?: "kit-email" | "bonus-email" | "internal";
  deliveredOn?: string;
}

const DELIVERY_LABELS: Record<
  NonNullable<OzvorAssetRow["deliveredVia"]>,
  { text: string; bg: string; fg: string }
> = {
  "kit-email": { text: "Kit email", bg: "var(--color-badge-ai-bg)", fg: "var(--color-badge-ai-text)" },
  "bonus-email": { text: "Growth/Agency email", bg: "var(--color-accent-soft, #dcf0e6)", fg: "var(--color-accent-ink, #0c7d54)" },
  internal: { text: "Internal / ops", bg: "var(--color-surface-muted)", fg: "var(--color-muted)" },
};

const ASSET_CATEGORY_LABELS: Record<OzvorAssetRow["category"], string> = {
  "client-deliverable": "Client deliverables",
  brand: "Brand kit",
  "content-gtm": "Content & GTM pack",
};

function AssetsTab(): React.ReactElement {
  const [assets, setAssets] = useState<OzvorAssetRow[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const res = await apiFetch("/api/admin/assets");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { assets: OzvorAssetRow[] };
        setAssets(data.assets);
      } catch {
        setError("Could not load the asset library.");
      }
    })();
  }, []);

  if (error) {
    return <p role="alert" style={{ color: "var(--color-error)", fontSize: "var(--font-size-body-sm)" }}>{error}</p>;
  }
  if (!assets) {
    return <p style={{ color: "var(--color-muted)", fontSize: "var(--font-size-body-sm)" }}>Loading&hellip;</p>;
  }

  const categories: OzvorAssetRow["category"][] = ["client-deliverable", "brand", "content-gtm"];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
      <p style={{ margin: 0, fontSize: "var(--font-size-body-sm)", color: "var(--color-muted)", maxWidth: "68ch" }}>
        Every deliverable, brand file and GTM document in one place. Download links serve the live
        artifact; the source path is where it gets improved (edit → PR → regenerate). Hermes reads
        this same library via the operator API.
      </p>
      {categories.map((cat) => (
        <section key={cat} aria-label={ASSET_CATEGORY_LABELS[cat]}>
          <h3 style={{ fontSize: "var(--font-size-h4)", fontWeight: 700, margin: "0 0 var(--space-3) 0" }}>
            {ASSET_CATEGORY_LABELS[cat]}
          </h3>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
            {assets.filter((a) => a.category === cat).map((a) => (
              <li
                key={a.id}
                style={{
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-md)",
                  padding: "var(--space-3) var(--space-4)",
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "baseline",
                  gap: "var(--space-2) var(--space-4)",
                }}
              >
                <div style={{ flex: "1 1 260px" }}>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: "var(--font-size-body-sm)" }}>
                    {a.title}{" "}
                    <span style={{ fontWeight: 400, color: "var(--color-muted)", fontSize: "var(--font-size-caption)", textTransform: "uppercase" }}>
                      {a.format}
                    </span>
                  </p>
                  <p style={{ margin: "2px 0 0 0", fontSize: "var(--font-size-caption)", color: "var(--color-muted)" }}>
                    {a.description}
                  </p>
                  {a.deliveredVia && (
                    <p style={{ margin: "6px 0 0 0", display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                      <span
                        style={{
                          fontSize: "var(--font-size-caption)",
                          fontWeight: 700,
                          padding: "1px 8px",
                          borderRadius: "999px",
                          backgroundColor: DELIVERY_LABELS[a.deliveredVia].bg,
                          color: DELIVERY_LABELS[a.deliveredVia].fg,
                        }}
                      >
                        {DELIVERY_LABELS[a.deliveredVia].text}
                      </span>
                      {a.deliveredOn && (
                        <span style={{ fontSize: "var(--font-size-caption)", color: "var(--color-muted)" }}>
                          {a.deliveredOn}
                        </span>
                      )}
                    </p>
                  )}
                  {a.repoPath && (
                    <p style={{ margin: "4px 0 0 0", fontSize: "var(--font-size-caption)", color: "var(--color-muted)" }}>
                      source: <code style={{ fontSize: "inherit" }}>{a.repoPath}</code>
                    </p>
                  )}
                </div>
                {a.publicPath && (
                  <a
                    href={a.publicPath}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      color: "var(--color-primary)",
                      fontSize: "var(--font-size-body-sm)",
                      fontWeight: 600,
                      whiteSpace: "nowrap",
                    }}
                  >
                    Download ↗
                  </a>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
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
// CRM helpers + components (lightweight sales layer on the Leads tab)
// ---------------------------------------------------------------------------

/** ISO → YYYY-MM-DD for <input type="date">; "" when absent/invalid. */
function toDateInputValue(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return new Date(iso).toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

/** True when a follow-up date is today or in the past (i.e. it is due). */
function isFollowUpDue(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return false;
  // Compare on calendar day: due if the follow-up day <= today.
  const day = new Date(t);
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  return day.getTime() <= today.getTime();
}

function CrmStageBadge({ stage }: { stage: CrmStage }) {
  const s = CRM_STAGE_TOKENS[stage];
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
      }}
    >
      {CRM_STAGE_LABELS[stage]}
    </span>
  );
}

type CrmPatch = { stage?: CrmStage; note?: string | null; nextFollowUp?: string | null };

// A single lead row with inline CRM controls (stage / follow-up / note). Each
// control autosaves via onSave; note saves on blur only when it changed.
function LeadRow({
  lead,
  crm,
  onSave,
}: {
  lead: Lead;
  crm: CrmContact | undefined;
  onSave: (email: string, patch: CrmPatch) => Promise<boolean>;
}) {
  const email = (lead.email ?? "").trim();
  const stage: CrmStage = crm?.stage ?? "new";
  const [noteDraft, setNoteDraft] = useState(crm?.note ?? "");
  const [busy, setBusy] = useState<null | "stage" | "note" | "follow">(null);
  const [flash, setFlash] = useState<null | "stage" | "note" | "follow">(null);
  const [rowError, setRowError] = useState(false);

  // Keep the note draft in sync when the annotation changes elsewhere.
  useEffect(() => {
    setNoteDraft(crm?.note ?? "");
  }, [crm?.note]);

  function flashOk(which: "stage" | "note" | "follow") {
    setFlash(which);
    setTimeout(() => setFlash((f) => (f === which ? null : f)), 1400);
  }

  async function run(which: "stage" | "note" | "follow", patch: CrmPatch) {
    if (!email) return;
    setBusy(which);
    setRowError(false);
    const ok = await onSave(email, patch);
    setBusy(null);
    if (ok) flashOk(which);
    else setRowError(true);
  }

  const due = isFollowUpDue(crm?.next_follow_up);

  // Leads captured without an email cannot be tracked — show a hint instead.
  const noEmail = !email;

  return (
    <tr style={{ backgroundColor: "var(--color-surface)" }}>
      <td style={TD_STYLE}>
        <div style={{ fontWeight: 600 }}>{email || "—"}</div>
        <div style={{ fontSize: "var(--font-size-caption)", color: "var(--color-muted)" }}>
          {[lead.region, lead.source].filter(Boolean).join(" · ") || "—"}
        </div>
      </td>
      <td style={{ ...TD_STYLE, fontWeight: 600 }}>{lead.brand}</td>
      <td style={{ ...TD_STYLE, color: "var(--color-muted)" }}>{lead.category}</td>

      {/* Stage */}
      <td style={TD_STYLE}>
        {noEmail ? (
          <span style={{ color: "var(--color-muted)", fontSize: "var(--font-size-caption)" }}>—</span>
        ) : (
          <select
            value={stage}
            disabled={busy === "stage"}
            aria-label={`Stage for ${email}`}
            onChange={(e) => void run("stage", { stage: e.target.value as CrmStage })}
            style={{
              padding: "var(--space-1) var(--space-2)",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--color-border)",
              backgroundColor: "var(--color-surface)",
              color: "var(--color-text)",
              fontFamily: "var(--font-family)",
              fontSize: "var(--font-size-caption)",
              cursor: busy === "stage" ? "wait" : "pointer",
            }}
          >
            {CRM_STAGES.map((s) => (
              <option key={s} value={s}>
                {CRM_STAGE_LABELS[s]}
              </option>
            ))}
          </select>
        )}
        {flash === "stage" && (
          <span style={{ marginLeft: 6, color: "var(--color-success)", fontSize: "var(--font-size-caption)" }}>✓</span>
        )}
      </td>

      {/* Next follow-up */}
      <td style={{ ...TD_STYLE, whiteSpace: "nowrap" }}>
        {noEmail ? (
          <span style={{ color: "var(--color-muted)", fontSize: "var(--font-size-caption)" }}>—</span>
        ) : (
          <input
            type="date"
            value={toDateInputValue(crm?.next_follow_up)}
            disabled={busy === "follow"}
            aria-label={`Next follow-up for ${email}`}
            onChange={(e) => void run("follow", { nextFollowUp: e.target.value === "" ? "" : e.target.value })}
            style={{
              padding: "var(--space-1) var(--space-2)",
              borderRadius: "var(--radius-sm)",
              border: due ? "1px solid var(--color-error)" : "1px solid var(--color-border)",
              backgroundColor: "var(--color-surface)",
              color: due ? "var(--color-error)" : "var(--color-text)",
              fontFamily: "var(--font-family)",
              fontSize: "var(--font-size-caption)",
            }}
          />
        )}
        {flash === "follow" && (
          <span style={{ marginLeft: 6, color: "var(--color-success)", fontSize: "var(--font-size-caption)" }}>✓</span>
        )}
      </td>

      {/* Note (saves on blur) */}
      <td style={TD_STYLE}>
        {noEmail ? (
          <span style={{ color: "var(--color-muted)", fontSize: "var(--font-size-caption)" }}>—</span>
        ) : (
          <input
            type="text"
            value={noteDraft}
            placeholder="Add note…"
            disabled={busy === "note"}
            aria-label={`Note for ${email}`}
            onChange={(e) => setNoteDraft(e.target.value)}
            onBlur={() => {
              if (noteDraft !== (crm?.note ?? "")) {
                void run("note", { note: noteDraft === "" ? null : noteDraft });
              }
            }}
            style={{
              width: "180px",
              maxWidth: "100%",
              padding: "var(--space-1) var(--space-2)",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--color-border)",
              backgroundColor: "var(--color-surface)",
              color: "var(--color-text)",
              fontFamily: "var(--font-family)",
              fontSize: "var(--font-size-caption)",
            }}
          />
        )}
        {flash === "note" && (
          <span style={{ marginLeft: 6, color: "var(--color-success)", fontSize: "var(--font-size-caption)" }}>✓</span>
        )}
        {rowError && (
          <span role="alert" style={{ marginLeft: 6, color: "var(--color-error)", fontSize: "var(--font-size-caption)" }}>
            save failed
          </span>
        )}
      </td>

      <td
        style={{
          ...TD_STYLE,
          color: "var(--color-muted)",
          fontSize: "var(--font-size-caption)",
          whiteSpace: "nowrap",
        }}
      >
        {fmtShortDate(lead.created_at)}
      </td>
    </tr>
  );
}

// "Who needs a follow-up" summary — the reason a CRM exists. Lists contacts with
// a scheduled follow-up, due ones first.
function FollowUpsDue({ contacts }: { contacts: CrmContact[] }) {
  const scheduled = contacts
    .filter((c) => c.next_follow_up)
    .sort((a, b) => Date.parse(a.next_follow_up ?? "") - Date.parse(b.next_follow_up ?? ""));
  const dueCount = scheduled.filter((c) => isFollowUpDue(c.next_follow_up)).length;

  if (scheduled.length === 0) return null;

  return (
    <div
      style={{
        border: dueCount > 0 ? "1px solid var(--color-error)" : "1px solid var(--color-border)",
        borderRadius: "var(--radius-md)",
        padding: "var(--space-3) var(--space-4)",
        marginBottom: "var(--space-4)",
        backgroundColor: dueCount > 0 ? "var(--color-badge-status-warn-bg)" : "var(--color-surface)",
      }}
    >
      <p style={{ margin: "0 0 var(--space-2) 0", fontWeight: 700, fontSize: "var(--font-size-body-sm)" }}>
        Follow-ups{dueCount > 0 ? ` — ${dueCount} due now` : ""}
      </p>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
        {scheduled.slice(0, 8).map((c) => {
          const due = isFollowUpDue(c.next_follow_up);
          return (
            <li
              key={c.email}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--space-3)",
                fontSize: "var(--font-size-caption)",
                flexWrap: "wrap",
              }}
            >
              <span style={{ color: due ? "var(--color-error)" : "var(--color-muted)", fontWeight: 600, minWidth: "84px" }}>
                {fmtShortDate(c.next_follow_up)}
              </span>
              <CrmStageBadge stage={c.stage} />
              <span style={{ color: "var(--color-text)" }}>{c.email}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// Resend the Growth/Agency bonus-deliverables email to any address. Fills the
// gap the Revenue → Kit Orders "Resend email" button does NOT cover:
// subscriptions never appear there, so a subscriber who missed the bonus email
// (e.g. a $0 100%-off checkout) had no recovery path in the UI.
function ResendDeliverablesForm() {
  const [email, setEmail] = useState("");
  const [plan, setPlan] = useState<"growth" | "agency">("growth");
  const [annual, setAnnual] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const emailValid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());

  async function send() {
    if (!emailValid || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await apiFetch("/api/billing/resend-deliverables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), plan, annual }),
      });
      if (res.ok) {
        setMsg({ kind: "ok", text: `Deliverables email sent to ${email.trim()} (${plan}).` });
        setEmail("");
      } else {
        const data = (await res.json().catch(() => ({}))) as { code?: string; message?: string };
        setMsg({ kind: "err", text: data.message ?? data.code ?? "Send failed." });
      }
    } catch {
      setMsg({ kind: "err", text: "Network error — nothing was sent." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-labelledby="resend-deliverables-heading"
      style={{
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-md)",
        padding: "var(--space-4) var(--space-5)",
        marginBottom: "var(--space-6)",
        backgroundColor: "var(--color-surface)",
        boxShadow: "var(--shadow-card)",
      }}
    >
      <h3
        id="resend-deliverables-heading"
        style={{ fontSize: "var(--font-size-h4)", fontWeight: 700, margin: "0 0 var(--space-1) 0" }}
      >
        Resend Growth / Agency deliverables
      </h3>
      <p style={{ margin: "0 0 var(--space-3) 0", fontSize: "var(--font-size-caption)", color: "var(--color-muted)" }}>
        Subscriptions don’t appear in Kit Orders. Use this to re-send the bonus-deliverables email to a
        subscriber who didn’t receive it.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-3)", alignItems: "center" }}>
        <input
          type="email"
          value={email}
          placeholder="subscriber@email.com"
          aria-label="Subscriber email"
          onChange={(e) => setEmail(e.target.value)}
          style={{
            flex: "2 1 240px",
            height: "36px",
            padding: "0 var(--space-3)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-md)",
            backgroundColor: "var(--color-surface)",
            color: "var(--color-text)",
            fontFamily: "var(--font-family)",
            fontSize: "var(--font-size-body-sm)",
          }}
        />
        <select
          value={plan}
          aria-label="Plan"
          onChange={(e) => setPlan(e.target.value as "growth" | "agency")}
          style={{
            height: "36px",
            padding: "0 var(--space-2)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-md)",
            backgroundColor: "var(--color-surface)",
            color: "var(--color-text)",
            fontFamily: "var(--font-family)",
            fontSize: "var(--font-size-body-sm)",
          }}
        >
          <option value="growth">Growth</option>
          <option value="agency">Agency</option>
        </select>
        <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "var(--font-size-caption)", color: "var(--color-muted)" }}>
          <input type="checkbox" checked={annual} onChange={(e) => setAnnual(e.target.checked)} />
          Annual
        </label>
        <button
          type="button"
          disabled={!emailValid || busy}
          onClick={() => void send()}
          style={{
            height: "36px",
            padding: "0 var(--space-4)",
            border: "none",
            borderRadius: "var(--radius-md)",
            backgroundColor: "var(--color-primary)",
            color: "#fff",
            fontWeight: 700,
            fontSize: "var(--font-size-body-sm)",
            cursor: !emailValid || busy ? "not-allowed" : "pointer",
            opacity: !emailValid || busy ? 0.5 : 1,
          }}
        >
          {busy ? "Sending…" : "Send"}
        </button>
      </div>
      {msg && (
        <p
          role="status"
          aria-live="polite"
          style={{
            margin: "var(--space-3) 0 0 0",
            fontSize: "var(--font-size-body-sm)",
            fontWeight: 600,
            color: msg.kind === "ok" ? "var(--color-success)" : "var(--color-error)",
          }}
        >
          {msg.text}
        </p>
      )}
    </section>
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
  const [resendState, setResendState] = useState<Record<string, "idle" | "sending" | "sent" | "error">>({});
  const [engagements, setEngagements] = useState<Engagement[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunities | null>(null);
  const [crmMap, setCrmMap] = useState<Record<string, CrmContact>>({});
  const [crmMigrationPending, setCrmMigrationPending] = useState(false);

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

  // CRM annotations (email-keyed). Kept in a ref too so the optimistic patch can
  // read the pre-edit value for rollback without a stale closure.
  const crmMapRef = useRef(crmMap);
  useEffect(() => {
    crmMapRef.current = crmMap;
  }, [crmMap]);

  const loadCrm = useCallback(async () => {
    try {
      const res = await apiFetch("/api/admin/crm");
      if (res.ok) {
        const data = (await res.json()) as { contacts: CrmContact[]; migrationPending?: boolean };
        const map: Record<string, CrmContact> = {};
        for (const contact of data.contacts ?? []) {
          map[contact.email.toLowerCase()] = contact;
        }
        setCrmMap(map);
        setCrmMigrationPending(data.migrationPending === true);
      }
    } catch {
      // Non-fatal — CRM controls just start blank.
    }
  }, []);

  const patchCrm = useCallback(async (email: string, patch: CrmPatch): Promise<boolean> => {
    const key = email.trim().toLowerCase();
    if (!key) return false;
    const prev = crmMapRef.current[key];

    // Optimistic apply.
    setCrmMap((m) => {
      const base: CrmContact =
        m[key] ?? { email: key, stage: "new", note: null, next_follow_up: null, owner: null, updated_at: "" };
      const next: CrmContact = { ...base };
      if (patch.stage !== undefined) next.stage = patch.stage;
      if (patch.note !== undefined) next.note = patch.note;
      if (patch.nextFollowUp !== undefined) next.next_follow_up = patch.nextFollowUp === "" ? null : patch.nextFollowUp;
      return { ...m, [key]: next };
    });

    try {
      const res = await apiFetch("/api/admin/crm", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: key, ...patch }),
      });
      if (!res.ok) throw new Error("patch failed");
      const data = (await res.json()) as { contact?: CrmContact };
      if (data.contact) {
        setCrmMap((m) => ({ ...m, [key]: data.contact as CrmContact }));
      }
      return true;
    } catch {
      // Roll back to the pre-edit value.
      setCrmMap((m) => {
        const n = { ...m };
        if (prev) n[key] = prev;
        else delete n[key];
        return n;
      });
      return false;
    }
  }, []);

  useEffect(() => {
    void init();
  }, [init]);

  // Load system health + CRM once authorized
  useEffect(() => {
    if (authorized === true) {
      void loadSystemHealth();
      void loadCrm();
    }
  }, [authorized, loadSystemHealth, loadCrm]);

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
    { id: "assets",        label: "Assets" },
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

        {/* ── Assets tab ── */}
        <section
          id="tabpanel-assets"
          role="tabpanel"
          aria-labelledby="tab-assets"
          hidden={activeTab !== "assets"}
        >
          <h2
            style={{
              fontSize: "var(--font-size-h3)",
              fontWeight: 700,
              margin: "0 0 var(--space-4) 0",
            }}
          >
            Assets
          </h2>
          {activeTab === "assets" && <AssetsTab />}
        </section>

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
            Leads &amp; CRM ({leads.length})
          </h2>

          {/* Follow-ups due first — the reason the CRM exists. */}
          <FollowUpsDue contacts={Object.values(crmMap)} />

          {crmMigrationPending && (
            <p
              role="status"
              style={{
                margin: "0 0 var(--space-4) 0",
                padding: "var(--space-2) var(--space-3)",
                borderRadius: "var(--radius-sm)",
                backgroundColor: "var(--color-surface-muted)",
                color: "var(--color-muted)",
                fontSize: "var(--font-size-caption)",
              }}
            >
              CRM fields are read-only until the <code>crm_contact</code> migration is applied.
            </p>
          )}

          <TableWrapper>
            <thead>
              <tr>
                <th scope="col" style={TH_STYLE}>Contact</th>
                <th scope="col" style={TH_STYLE}>Brand</th>
                <th scope="col" style={TH_STYLE}>Category</th>
                <th scope="col" style={TH_STYLE}>Stage</th>
                <th scope="col" style={TH_STYLE}>Next follow-up</th>
                <th scope="col" style={TH_STYLE}>Note</th>
                <th scope="col" style={TH_STYLE}>Date</th>
              </tr>
            </thead>
            <tbody>
              {leads.length === 0 && !loadingTab ? (
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
                    No leads yet.
                  </td>
                </tr>
              ) : (
                leads.map((l) => (
                  <LeadRow
                    key={l.id}
                    lead={l}
                    crm={crmMap[(l.email ?? "").trim().toLowerCase()]}
                    onSave={patchCrm}
                  />
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

          {/* Growth/Agency subscriptions never appear in Kit Orders — this form
              covers re-sending their deliverables email. */}
          <ResendDeliverablesForm />

          <TableWrapper>
            <thead>
              <tr>
                <th scope="col" style={TH_STYLE}>Email</th>
                <th scope="col" style={TH_STYLE}>Brand</th>
                <th scope="col" style={TH_STYLE}>Status</th>
                <th scope="col" style={TH_STYLE}>Stripe Session</th>
                <th scope="col" style={TH_STYLE}>Paid At</th>
                <th scope="col" style={TH_STYLE}>Delivered At</th>
                <th scope="col" style={TH_STYLE}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {kitOrders.length === 0 && !loadingTab ? (
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
                    <td style={TD_STYLE}>
                      {o.status === "paid" || o.status === "delivered" ? (
                        <button
                          type="button"
                          disabled={resendState[o.id] === "sending"}
                          onClick={() => {
                            setResendState((s) => ({ ...s, [o.id]: "sending" }));
                            apiFetch(`/api/admin/kit-orders/${o.id}/resend-email`, { method: "POST" })
                              .then((r) => setResendState((s) => ({ ...s, [o.id]: r.ok ? "sent" : "error" })))
                              .catch(() => setResendState((s) => ({ ...s, [o.id]: "error" })));
                          }}
                          style={{
                            padding: "4px 10px",
                            fontSize: "var(--font-size-caption)",
                            fontWeight: 600,
                            borderRadius: "var(--radius-sm)",
                            border: "1px solid var(--color-border)",
                            background: "var(--color-surface)",
                            color: "var(--color-text)",
                            cursor: resendState[o.id] === "sending" ? "default" : "pointer",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {resendState[o.id] === "sending"
                            ? "Sending…"
                            : resendState[o.id] === "sent"
                              ? "Sent ✓"
                              : resendState[o.id] === "error"
                                ? "Failed — retry"
                                : "Resend email"}
                        </button>
                      ) : (
                        <span style={{ color: "var(--color-muted)", fontSize: "var(--font-size-caption)" }}>—</span>
                      )}
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
