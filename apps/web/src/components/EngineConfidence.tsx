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

import { summarizeEngineConfidence, type EngineCheck } from "../lib/engine-confidence-summary";

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

  // B4 (D23): every engine the audit used is on the list; a missing battery
  // is said and counted, never dropped. "All N" only when N were checked.
  const summary = summarizeEngineConfidence(engines);
  if (summary.kind === "silent") return null;

  if (summary.kind === "all_good" || summary.kind === "partial") {
    return (
      <p style={line}>
        <Dot tone={summary.kind === "all_good" ? "good" : "warn"} />
        {summary.text}
      </p>
    );
  }

  return (
    <p style={line}>
      <Dot tone="warn" />
      <span>
        {summary.text}{" "}
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
