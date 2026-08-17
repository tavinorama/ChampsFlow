"use client";

/**
 * AiAuditResult — renders a delivered $49 AI Audit Stack result: the ONE
 * niche pick, the honest limitation + withheld count, the size of the full
 * picture (counts only), and the upsell ladder. Shared by the /ai-audit/[token]
 * delivery page (its only consumer today; the pre-checkout page never sees a
 * pick). Copy lives in ai-audit-copy.ts (pure, tested for the founder's rules).
 */

import { UpsellLadder } from "../../../components/UpsellLadder";
import { COPY, painLabel, pickedForLine, withheldLine } from "./ai-audit-copy";
import { cardStyle, ghostBtn, primaryBtn, sectionLabel } from "./ai-audit-styles";

// ---------------------------------------------------------------------------
// The stored deliverable shape (subset rendered) — see
// apps/api/src/lib/ai-audit/deliverable.ts
// ---------------------------------------------------------------------------

export interface PickTool {
  name: string;
  url: string;
  oneLiner: string;
  monthlyCostUsd: number;
  setupEffort: string;
  hoursSavedWeekly: number;
}

export interface AiAuditDeliverable {
  businessType: string;
  primaryFocus: string;
  entry: {
    pick: { tool: PickTool; matchedPains: string[] } | null;
    reason: string;
    totalMatched: number;
    withheldCount: number;
    painSummary: string;
    empty: boolean;
  };
  report: {
    matrixCounts: Record<string, number>;
    quickWinCount: number;
    recommendedCount: number;
    hoursReclaimedWeekly: number;
    outcomeSummary: string;
    financialImpact: {
      weeklyTimeReturnedHours: number;
      choresRemoved: number;
      monthlyNetRoiUsd: number;
      totalMonthlyToolCostUsd: number;
      hourlyRateUsd: number;
    };
  };
  upsell: {
    limitation: string;
    fullAudit: { name: string; gets: string; bundledWith: string; price: string; href: string };
    alsoOffer: { text: string; href: string };
  };
  catalog: { source: string; estimatesUnverified: boolean };
}

/** Defensive parse of the API's deliverable (jsonb) — never trust the shape blindly. */
export function normalizeAiAuditDeliverable(raw: unknown): AiAuditDeliverable | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Partial<AiAuditDeliverable>;
  if (!d.entry || typeof d.entry !== "object") return null;
  if (!d.upsell || typeof d.upsell !== "object") return null;
  const entry = d.entry;
  const pick =
    entry.pick && typeof entry.pick === "object" && entry.pick.tool && typeof entry.pick.tool.name === "string"
      ? { tool: entry.pick.tool, matchedPains: Array.isArray(entry.pick.matchedPains) ? entry.pick.matchedPains : [] }
      : null;
  return {
    businessType: typeof d.businessType === "string" ? d.businessType : "",
    primaryFocus: typeof d.primaryFocus === "string" ? d.primaryFocus : "",
    entry: {
      pick,
      reason: typeof entry.reason === "string" ? entry.reason : "",
      totalMatched: Number(entry.totalMatched) || 0,
      withheldCount: Number(entry.withheldCount) || 0,
      painSummary: typeof entry.painSummary === "string" ? entry.painSummary : "",
      empty: pick === null,
    },
    report: {
      matrixCounts: d.report?.matrixCounts ?? {},
      quickWinCount: Number(d.report?.quickWinCount) || 0,
      recommendedCount: Number(d.report?.recommendedCount) || 0,
      hoursReclaimedWeekly: Number(d.report?.hoursReclaimedWeekly) || 0,
      outcomeSummary: typeof d.report?.outcomeSummary === "string" ? d.report.outcomeSummary : "",
      financialImpact: {
        weeklyTimeReturnedHours: Number(d.report?.financialImpact?.weeklyTimeReturnedHours) || 0,
        choresRemoved: Number(d.report?.financialImpact?.choresRemoved) || 0,
        monthlyNetRoiUsd: Number(d.report?.financialImpact?.monthlyNetRoiUsd) || 0,
        totalMonthlyToolCostUsd: Number(d.report?.financialImpact?.totalMonthlyToolCostUsd) || 0,
        hourlyRateUsd: Number(d.report?.financialImpact?.hourlyRateUsd) || 0,
      },
    },
    upsell: {
      limitation: typeof d.upsell.limitation === "string" ? d.upsell.limitation : "",
      fullAudit: {
        name: d.upsell.fullAudit?.name ?? "The full AI Audit Stack",
        gets: d.upsell.fullAudit?.gets ?? "",
        bundledWith: d.upsell.fullAudit?.bundledWith ?? "",
        price: d.upsell.fullAudit?.price ?? "from $1,500",
        href: d.upsell.fullAudit?.href ?? "/organicposts",
      },
      alsoOffer: {
        text: d.upsell.alsoOffer?.text ?? "",
        href: d.upsell.alsoOffer?.href ?? "/test",
      },
    },
    catalog: {
      source: d.catalog?.source ?? "unknown",
      estimatesUnverified: d.catalog?.estimatesUnverified !== false,
    },
  };
}

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <div style={{ border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", padding: "var(--space-3) var(--space-4)", background: "var(--color-surface-muted)", minWidth: 0 }}>
      <p style={{ margin: 0, fontSize: "1.5rem", fontWeight: 800, color: "var(--color-primary)", lineHeight: 1.1 }}>{value}</p>
      <p style={{ margin: "var(--space-1) 0 0 0", fontSize: "var(--font-size-caption)", color: "var(--color-muted)", lineHeight: 1.4 }}>{label}</p>
    </div>
  );
}

export function AiAuditResult({ d, emailed = true }: { d: AiAuditDeliverable; emailed?: boolean }) {
  const { entry, upsell, catalog, report } = d;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
      {entry.empty || !entry.pick ? (
        <div style={cardStyle} role="status">
          {sectionLabel(COPY.result.kicker)}
          <h2 style={{ margin: 0, fontSize: "var(--font-size-h2)", fontWeight: 800, letterSpacing: "-0.02em", color: "var(--color-text)" }}>
            {COPY.result.emptyTitle}
          </h2>
          <p style={{ margin: 0, fontSize: "var(--font-size-body-sm)", color: "var(--color-muted)", lineHeight: 1.7 }}>
            {COPY.result.emptyBody}
          </p>
          {entry.reason && (
            <p style={{ margin: 0, fontSize: "var(--font-size-body-sm)", color: "var(--color-muted)", lineHeight: 1.7 }}>{entry.reason}</p>
          )}
          <a href="/book" style={primaryBtn(false)}>{COPY.result.emptyCta}</a>
        </div>
      ) : (
        <div style={{ ...cardStyle, borderColor: "rgba(39,201,138,0.45)" }}>
          {sectionLabel(COPY.result.kicker)}
          <p style={{ margin: 0, fontSize: "var(--font-size-caption)", fontWeight: 700, color: "var(--color-muted)" }}>{COPY.result.pickTitle}</p>
          <h2 style={{ margin: 0, fontSize: "var(--font-size-h2)", fontWeight: 800, letterSpacing: "-0.02em", color: "var(--color-text)" }}>
            {entry.pick.tool.name}
          </h2>
          <p style={{ margin: 0, fontSize: "var(--font-size-body)", color: "var(--color-text)", lineHeight: 1.6 }}>{entry.pick.tool.oneLiner}</p>
          <p style={{ margin: 0, fontSize: "var(--font-size-body-sm)", color: "var(--color-muted)", lineHeight: 1.6 }}>
            {pickedForLine(d.businessType)} {entry.reason}
          </p>
          {entry.painSummary && (
            <p style={{ margin: 0, fontSize: "var(--font-size-body-sm)", color: "var(--color-muted)", lineHeight: 1.6 }}>{entry.painSummary}</p>
          )}
          {entry.pick.matchedPains.length > 0 && (
            <div>
              <p style={{ margin: "0 0 var(--space-2) 0", fontSize: "var(--font-size-caption)", fontWeight: 700, color: "var(--color-muted)" }}>
                {COPY.result.matchedPains}
              </p>
              <ul style={{ listStyle: "none", display: "flex", flexWrap: "wrap", gap: "var(--space-2)", margin: 0, padding: 0 }}>
                {entry.pick.matchedPains.map((p) => (
                  <li key={p} style={{ border: "1px solid var(--color-border)", borderRadius: "var(--radius-pill)", padding: "4px 10px", fontSize: "var(--font-size-caption)", fontWeight: 600, color: "var(--color-text)", background: "var(--color-surface-muted)" }}>
                    {painLabel(p)}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p style={{ margin: 0, fontSize: "var(--font-size-caption)", color: "var(--color-muted)", lineHeight: 1.5 }}>
            About {entry.pick.tool.hoursSavedWeekly}h back per week. {entry.pick.tool.setupEffort} setup. About ${entry.pick.tool.monthlyCostUsd}/mo.
          </p>
          <a href={entry.pick.tool.url} target="_blank" rel="noopener noreferrer" style={ghostBtn()}>
            {COPY.result.visitTool}
          </a>
          <p style={{ margin: 0, fontSize: "var(--font-size-body-sm)", color: "var(--color-muted)", lineHeight: 1.6, borderTop: "1px solid var(--color-border)", paddingTop: "var(--space-3)" }}>
            {upsell.limitation} {withheldLine(entry.totalMatched, entry.withheldCount)}
          </p>
          {catalog.estimatesUnverified && (
            <p style={{ margin: 0, fontSize: "var(--font-size-caption)", color: "var(--color-muted)", lineHeight: 1.5 }}>{COPY.result.estimatesNote}</p>
          )}
          {emailed && (
            <p style={{ margin: 0, fontSize: "var(--font-size-caption)", color: "var(--color-muted)", lineHeight: 1.5 }}>{COPY.result.emailedNote}</p>
          )}
        </div>
      )}

      {/* The size of the full picture: counts only, no names. */}
      <div style={cardStyle}>
        {sectionLabel(COPY.result.pictureTitle)}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "var(--space-3)" }}>
          <Stat value={entry.totalMatched} label={COPY.result.pictureMatched} />
          <Stat value={report.quickWinCount} label={COPY.result.pictureQuickWins} />
          <Stat value={report.hoursReclaimedWeekly} label={COPY.result.pictureHours} />
        </div>
        {report.outcomeSummary && (
          <p style={{ margin: 0, fontSize: "var(--font-size-body-sm)", color: "var(--color-muted)", lineHeight: 1.6 }}>{report.outcomeSummary}</p>
        )}
      </div>

      {/* The upsell ladder — same dynamic as every other product. */}
      <UpsellLadder
        heading={COPY.result.upsellTitle}
        primary={{
          title: upsell.fullAudit.name,
          why: `${upsell.fullAudit.gets} ${upsell.fullAudit.bundledWith}`,
          price: upsell.fullAudit.price,
          href: upsell.fullAudit.href,
          accent: "gold",
          ctaAriaLabel: "Get the full AI Audit Stack inside OrganicPosts",
        }}
        secondary={[
          {
            title: "Free GEO test",
            why: upsell.alsoOffer.text || "See how AI engines describe your brand, then fix it.",
            price: "Free",
            href: upsell.alsoOffer.href,
            accent: "ghost",
            ctaAriaLabel: "Run the free GEO test",
          },
          {
            title: "Get-Cited Kit",
            why: "Your full AI visibility audit plus three ready-to-publish drafts.",
            price: "$29",
            href: "/kit",
            accent: "ghost",
            ctaAriaLabel: "Get the Get-Cited Kit for $29",
          },
        ]}
      />
    </div>
  );
}
