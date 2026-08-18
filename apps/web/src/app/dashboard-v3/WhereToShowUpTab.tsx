"use client";

/**
 * WhereToShowUpTab — the product-facing half of the Signal Engine integration
 * (docs/signal-engine-integration.md §2). It surfaces the founder's "where to
 * act" queue for the selected brand as action cards the client works through:
 * the keyword, the exact action (comment / start a thread / already covered /
 * no snapshot), the community, the evidence link, the karma or position note,
 * and the why.
 *
 * Honest by construction (memory rule "'Mergeado' não é produção"): the tab
 * NEVER fabricates opportunities. Three real states drive the render:
 *   - connected:false → the radar is not switched on yet (envs not set). We say
 *     so plainly and invite the client to check back. No fake cards.
 *   - connected:true, empty → nothing new this week; we keep checking.
 *   - connected:true, cards → the sorted, bounded list from the engine.
 *
 * Data comes from GET /api/signals/where-to-show-up?brandId=... via apiFetch.
 * Copy: English, short sentences, first-person CTA, no em-dashes. Reuses the V3
 * style tokens, no new design system.
 */

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../../lib/supabase-browser";
import { V3 } from "./v3-styles";

// ---------------------------------------------------------------------------
// Wire types (mirror routes/signals.ts)
// ---------------------------------------------------------------------------

interface Card {
  keyword: string | null;
  action: string | null;
  actionLabel: string;
  cta: string | null;
  actionable: boolean;
  community: string | null;
  evidenceUrl: string | null;
  position: number | null;
  karmaNeeded: number | null;
  reason: string | null;
  checkedAt: string | null;
  source: string | null;
}

interface WhereResponse {
  connected: boolean;
  opportunities: Card[];
  reason: string | null;
  fetchedAt: string | null;
  source: string | null;
  brandId: string | null;
}

type State =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; data: WhereResponse };

function shortWhen(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ---------------------------------------------------------------------------
// Tab
// ---------------------------------------------------------------------------

export function WhereToShowUpTab({ brandId, brandName }: { brandId: string | null; brandName: string | null }) {
  const [state, setState] = useState<State>({ kind: "loading" });

  const load = useCallback(async (id: string | null) => {
    setState({ kind: "loading" });
    try {
      const qs = id ? `?brandId=${encodeURIComponent(id)}` : "";
      const res = await apiFetch(`/api/signals/where-to-show-up${qs}`);
      if (!res.ok) { setState({ kind: "error" }); return; }
      const data = (await res.json()) as WhereResponse;
      setState({ kind: "ready", data });
    } catch {
      setState({ kind: "error" });
    }
  }, []);

  useEffect(() => { void load(brandId); }, [brandId, load]);

  if (state.kind === "loading") return <LoadingSkeleton />;
  if (state.kind === "error") return <ErrorState onRetry={() => void load(brandId)} />;

  const { data } = state;
  if (!data.connected) return <NotConnectedState />;
  if (data.opportunities.length === 0) return <EmptyState fetchedAt={data.fetchedAt} onRefresh={() => void load(brandId)} />;

  return (
    <div>
      <IntroLine
        brandName={brandName}
        count={data.opportunities.length}
        fetchedAt={data.fetchedAt}
        source={data.source}
      />
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
        {data.opportunities.map((c, i) => (
          <OpportunityCard key={`${c.keyword ?? "kw"}-${i}`} card={c} />
        ))}
      </div>
      <p style={V3.note}>
        Every card comes from a real snapshot with its own evidence link. When we have no snapshot for a keyword, we say so
        instead of guessing.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function IntroLine({ brandName, count, fetchedAt, source }: { brandName: string | null; count: number; fetchedAt: string | null; source: string | null }) {
  const when = shortWhen(fetchedAt);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: "var(--space-4)", fontSize: "0.86rem" }}>
      <span style={{ ...V3.pill, background: "var(--color-badge-status-active-bg)", color: "var(--color-badge-status-active-text)" }}>
        {count} {count === 1 ? "opportunity" : "opportunities"}
      </span>
      <span style={{ color: "var(--color-muted)" }}>
        Where {brandName ? `${brandName} can` : "you can"} show up in AI search right now.
        {source ? ` Source: ${source}.` : ""}
        {when ? ` Checked ${when}.` : ""}
      </span>
    </div>
  );
}

function OpportunityCard({ card }: { card: Card }) {
  const when = shortWhen(card.checkedAt);
  const notes: string[] = [];
  if (card.position != null) notes.push(`Google position ${card.position}`);
  if (card.karmaNeeded != null) notes.push(`needs ${card.karmaNeeded} karma`);
  if (card.community) notes.push(card.community);

  return (
    <div style={{ ...V3.card, padding: "var(--space-5)" }} data-testid="wtsu-card">
      <div style={{ display: "flex", alignItems: "baseline", gap: "var(--space-2)", flexWrap: "wrap" }}>
        <span
          style={{
            ...V3.imp,
            background: card.actionable ? "var(--color-primary)" : "var(--color-surface-muted)",
            color: card.actionable ? "#fff" : "var(--color-muted)",
          }}
        >
          {card.actionLabel}
        </span>
        {card.keyword && <b style={{ fontSize: "1rem", letterSpacing: "-0.01em" }}>{card.keyword}</b>}
      </div>

      {notes.length > 0 && (
        <div style={{ marginTop: "var(--space-3)", display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
          {notes.map((n) => (
            <span key={n} style={{ ...V3.pill, background: "var(--color-surface-muted)", color: "var(--color-muted)" }}>{n}</span>
          ))}
        </div>
      )}

      {card.reason && <p style={{ ...V3.actWhy, marginTop: "var(--space-3)" }}>{card.reason}</p>}

      <div style={{ marginTop: "var(--space-4)", display: "flex", alignItems: "center", gap: "var(--space-3)", flexWrap: "wrap" }}>
        {card.evidenceUrl && card.cta && (
          <a href={card.evidenceUrl} target="_blank" rel="noopener noreferrer" style={V3.btnPri}>{card.cta}</a>
        )}
        {card.evidenceUrl && !card.cta && (
          <a href={card.evidenceUrl} target="_blank" rel="noopener noreferrer" style={V3.btnGhost}>See the evidence</a>
        )}
        {when && <span style={{ fontSize: "0.76rem", color: "var(--color-muted)" }}>Snapshot {when}</span>}
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }} role="status" aria-live="polite">
      <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>Loading opportunities…</span>
      {[0, 1, 2].map((i) => (
        <div key={i} style={{ ...V3.card, padding: "var(--space-5)" }} aria-hidden="true">
          <div style={{ height: 14, width: `${40 + i * 12}%`, background: "var(--color-border)", borderRadius: 6 }} />
          <div style={{ height: 10, width: "80%", background: "var(--color-border)", borderRadius: 6, marginTop: 12 }} />
          <div style={{ height: 10, width: "60%", background: "var(--color-border)", borderRadius: 6, marginTop: 8 }} />
        </div>
      ))}
    </div>
  );
}

function NotConnectedState() {
  return (
    <div style={{ ...V3.card, padding: "var(--space-6)", textAlign: "center" }} data-testid="wtsu-not-connected">
      <div aria-hidden="true" style={{ fontSize: "1.8rem" }}>📡</div>
      <h2 style={{ margin: "8px 0 6px", fontSize: "1.1rem", fontWeight: 800, letterSpacing: "-0.01em" }}>Your opportunity radar isn&apos;t switched on yet</h2>
      <p style={{ margin: "0 auto", maxWidth: 460, color: "var(--color-muted)", fontSize: "0.9rem", lineHeight: 1.6 }}>
        We&apos;re wiring live Reddit and AI-search signals to your brand. Once it&apos;s on, you&apos;ll see exactly where to show up and
        what to do. Check back soon.
      </p>
    </div>
  );
}

function EmptyState({ fetchedAt, onRefresh }: { fetchedAt: string | null; onRefresh: () => void }) {
  const when = shortWhen(fetchedAt);
  return (
    <div style={{ ...V3.card, padding: "var(--space-6)", textAlign: "center" }} data-testid="wtsu-empty">
      <div aria-hidden="true" style={{ fontSize: "1.8rem" }}>✅</div>
      <h2 style={{ margin: "8px 0 6px", fontSize: "1.1rem", fontWeight: 800, letterSpacing: "-0.01em" }}>No new opportunities this week</h2>
      <p style={{ margin: "0 auto var(--space-4)", maxWidth: 460, color: "var(--color-muted)", fontSize: "0.9rem", lineHeight: 1.6 }}>
        We check continuously. When a fresh opening shows up in AI search, it lands here.{when ? ` Last checked ${when}.` : ""}
      </p>
      <button type="button" onClick={onRefresh} style={V3.btnGhost}>Check again</button>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div style={{ ...V3.card, padding: "var(--space-6)", textAlign: "center" }} role="alert" data-testid="wtsu-error">
      <h2 style={{ margin: "0 0 6px", fontSize: "1.05rem", fontWeight: 800 }}>We couldn&apos;t load your opportunities</h2>
      <p style={{ margin: "0 auto var(--space-4)", maxWidth: 420, color: "var(--color-muted)", fontSize: "0.9rem", lineHeight: 1.6 }}>
        Something went wrong on our side. Try again in a moment.
      </p>
      <button type="button" onClick={onRetry} style={V3.btnGhost}>Try again</button>
    </div>
  );
}
