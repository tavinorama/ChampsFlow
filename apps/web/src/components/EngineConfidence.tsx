"use client";

/**
 * EngineConfidence — D2. Says whether the engines were steady on the day you
 * were measured.
 *
 * B4 runs a control battery per engine every day: brands that obviously should
 * be named, fictional entities that obviously should not. An engine that stops
 * naming the obvious, or starts describing the fictional as real, is drifting.
 * When that happens a client's score can fall for a reason that has nothing to
 * do with their brand.
 *
 * That distinction is the whole point, and nobody else in the category draws
 * it. Without it, "your score dropped" and "the engine moved" look identical.
 *
 * Silence rules, in order:
 *  - no engines, or none checked → render nothing. A row saying "not checked"
 *    for every engine is noise.
 *  - all healthy → one quiet line. Reassurance, not a banner.
 *  - anything degraded or failing → name the engines. This is the case the
 *    component exists for.
 */

import { useEffect, useState } from "react";
import { apiFetch } from "../lib/supabase-browser";

interface EngineCheck {
  engine: string;
  /** healthy · degraded · failing · null when no battery had run yet */
  status: string | null;
  checked_at: string | null;
}

const ENGINE_LABEL: Record<string, string> = {
  anthropic: "Claude",
  openai: "ChatGPT",
  gemini: "Gemini",
  perplexity: "Perplexity",
  serp: "Google AI Overviews",
};

export function EngineConfidence({ auditId }: { auditId: string | null }) {
  const [engines, setEngines] = useState<EngineCheck[] | null>(null);

  useEffect(() => {
    if (!auditId) return;
    let live = true;
    // apiFetch carries the session and the API base; a raw fetch here would be
    // unauthenticated and always 401.
    apiFetch(`/api/audits/${auditId}/engine-confidence`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { engines?: EngineCheck[] } | null) => {
        if (live && d?.engines) setEngines(d.engines);
      })
      .catch(() => {
        // A missing confidence read must never blank the scorecard around it.
      });
    return () => {
      live = false;
    };
  }, [auditId]);

  if (!engines || engines.length === 0) return null;

  const checked = engines.filter((e) => e.status);
  if (checked.length === 0) return null;

  const shaky = checked.filter((e) => e.status === "degraded" || e.status === "failing");

  if (shaky.length === 0) {
    return (
      <p style={line}>
        <Dot tone="good" />
        All {checked.length} engines passed their control checks on the day of this audit.
      </p>
    );
  }

  return (
    <p style={line}>
      <Dot tone="warn" />
      <span>
        {shaky.map((e) => ENGINE_LABEL[e.engine] ?? e.engine).join(" and ")}{" "}
        {shaky.length === 1 ? "was" : "were"} unstable on the day of this audit, so a fall here may be
        the engine and not your brand.{" "}
        <a href="/how-we-measure" style={{ color: "var(--color-accent-ink)", fontWeight: 600 }}>
          How we check
        </a>
      </span>
    </p>
  );
}

const line: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: "var(--space-2)",
  margin: "var(--space-3) 0 0",
  fontSize: "var(--font-size-caption)",
  color: "var(--color-muted)",
  lineHeight: 1.5,
};

function Dot({ tone }: { tone: "good" | "warn" }) {
  return (
    <span
      aria-hidden="true"
      style={{
        flex: "none",
        width: "8px",
        height: "8px",
        borderRadius: "50%",
        marginTop: "5px",
        background: tone === "good" ? "var(--color-accent-ink)" : "var(--color-warning, #b9781a)",
      }}
    />
  );
}
