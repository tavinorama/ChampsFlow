"use client";

/**
 * IntentBreakdown — D5. Which question you lose, and who wins it.
 *
 * Every audit since B1 carries this and no screen has ever read it: per
 * intent, the citation rate with its Wilson interval, and per engine the
 * share of voice plus the competitors who took the answer.
 *
 * That difference matters more than the headline. "You are invisible" is a
 * verdict a customer can do nothing with. "You are invisible when someone
 * asks who to hire, and these two get named instead" is a content brief.
 *
 * Sorted worst first, because the worst intent is where the next piece of
 * writing should go.
 */

export interface IntentEngine {
  engine: string;
  n: number;
  citationRate: number;
  ciLow: number;
  ciHigh: number;
  shareOfVoice: number;
  topCompetitors?: Array<{ name: string; mentions?: number } | string> | null;
}

export interface IntentRow {
  intent: string;
  overall: { n: number; citationRate: number; ciLow: number; ciHigh: number } | null;
  engines?: IntentEngine[] | null;
}

/** Buyer-facing names. An unknown key renders raw so it gets noticed. */
const INTENT_LABEL: Record<string, string> = {
  brand_direct: "When they ask about you by name",
  category_discovery: "When they ask who does this",
  comparison: "When they compare you to someone",
  problem_solution: "When they describe the problem",
  local_intent: "When they ask for someone nearby",
  best_of: "When they ask for the best",
};

const ENGINE_LABEL: Record<string, string> = {
  anthropic: "Claude",
  openai: "ChatGPT",
  gemini: "Gemini",
  perplexity: "Perplexity",
  serp: "Google AI Overviews",
  dataforseo: "Google AI Overviews",
};

export function IntentBreakdown({ intents }: { intents?: IntentRow[] | null }) {
  const rows = (intents ?? []).filter((r) => r.overall && r.overall.n > 0);
  if (rows.length === 0) return null;

  // Worst first: the question you lose hardest is the one to write for next.
  const sorted = [...rows].sort(
    (a, b) => (a.overall?.citationRate ?? 0) - (b.overall?.citationRate ?? 0)
  );

  return (
    <section aria-labelledby="intent-breakdown-heading" style={{ marginBottom: "var(--space-8)" }}>
      <h2
        id="intent-breakdown-heading"
        style={{ fontSize: "var(--font-size-h3)", fontWeight: 700, margin: "0 0 var(--space-2)" }}
      >
        Which question you lose
      </h2>
      <p
        style={{
          margin: "0 0 var(--space-4)",
          color: "var(--color-muted)",
          fontSize: "var(--font-size-body-sm)",
          lineHeight: 1.6,
        }}
      >
        Your customers ask in different ways, and you are not equally visible in
        all of them. Worst first — that is where the next piece of writing goes.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
        {sorted.map((row) => {
          const pct = Math.round((row.overall?.citationRate ?? 0) * 100);
          // Never show a rate without its width. The larger side, rounded up:
          // understating uncertainty is the one thing we do not do.
          const margin = row.overall
            ? Math.ceil(
                Math.max(
                  row.overall.citationRate - row.overall.ciLow,
                  row.overall.ciHigh - row.overall.citationRate
                ) * 100
              )
            : 0;
          const rivals = topRivals(row.engines);

          return (
            <div
              key={row.intent}
              style={{
                background: "var(--color-surface)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-lg)",
                padding: "var(--space-5)",
                boxShadow: "var(--shadow-card)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  gap: "var(--space-3)",
                  flexWrap: "wrap",
                }}
              >
                <h3 style={{ margin: 0, fontSize: "var(--font-size-body)", fontWeight: 700 }}>
                  {INTENT_LABEL[row.intent] ?? row.intent}
                </h3>
                <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>
                  {pct}%{" "}
                  <span style={{ fontWeight: 400, color: "var(--color-muted)", fontSize: "var(--font-size-body-sm)" }}>
                    &plusmn; {margin} · {row.overall?.n} runs
                  </span>
                </span>
              </div>

              <div
                role="presentation"
                style={{
                  height: "6px",
                  borderRadius: "var(--radius-pill)",
                  background: "var(--color-surface-muted)",
                  overflow: "hidden",
                  margin: "var(--space-3) 0",
                }}
              >
                <div
                  style={{
                    width: `${pct}%`,
                    height: "100%",
                    background: "linear-gradient(90deg,#27c98a,#0c7d54)",
                    borderRadius: "var(--radius-pill)",
                  }}
                />
              </div>

              {rivals.length > 0 ? (
                <p style={{ margin: 0, fontSize: "var(--font-size-body-sm)", color: "var(--color-muted)", lineHeight: 1.55 }}>
                  Named instead of you:{" "}
                  <b style={{ color: "var(--color-text)" }}>{rivals.join(", ")}</b>
                </p>
              ) : (
                <p style={{ margin: 0, fontSize: "var(--font-size-caption)", color: "var(--color-muted)" }}>
                  No competitor took this one consistently.
                </p>
              )}

              {(row.engines ?? []).length > 0 && (
                <ul
                  style={{
                    listStyle: "none",
                    margin: "var(--space-3) 0 0",
                    padding: "var(--space-3) 0 0",
                    borderTop: "1px solid var(--color-border)",
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "var(--space-2) var(--space-5)",
                  }}
                >
                  {(row.engines ?? []).map((e) => (
                    <li
                      key={e.engine}
                      style={{ fontSize: "var(--font-size-caption)", color: "var(--color-muted)" }}
                    >
                      {ENGINE_LABEL[e.engine] ?? e.engine}{" "}
                      <b style={{ color: "var(--color-text)", fontVariantNumeric: "tabular-nums" }}>
                        {Math.round(e.citationRate * 100)}%
                      </b>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** Competitor names across engines, most frequent first, de-duplicated. */
function topRivals(engines?: IntentEngine[] | null): string[] {
  const count = new Map<string, number>();
  for (const e of engines ?? []) {
    for (const c of e.topCompetitors ?? []) {
      const name = typeof c === "string" ? c : c?.name;
      if (!name) continue;
      count.set(name, (count.get(name) ?? 0) + (typeof c === "string" ? 1 : c.mentions ?? 1));
    }
  }
  return [...count.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name]) => name);
}
