"use client";

/**
 * VerifiedCitations — D1. Shows what the two-pass extraction (B3) threw away.
 *
 * The audit already carries this: every mention an engine produced is read
 * twice, once to find it and once by a blind verifier that never sees the
 * first answer. Mentions that fail the second read are dropped. Until now the
 * client only saw the surviving total and had to take our word for it.
 *
 * That is the wrong way round. The rejections are the proof: a competitor's
 * score is inflated by homonyms, negations and hallucinated links, and ours is
 * not, because we can show the ones we refused to count.
 *
 * Renders nothing when the audit predates B3 or ran with extraction disabled —
 * an empty panel would imply "nothing was rejected", which is a different and
 * unearned claim.
 */

export interface ExtractionTelemetry {
  /** two_pass · fallback_single_pass · disabled · mixed */
  mode: string;
  verified_count: number;
  rejected_count: number;
  /** Kind of EVERY mention looked at, verified and rejected alike. */
  by_kind?: Record<string, number> | null;
  /** Up to three concrete false positives this audit refused to count. */
  sample_rejections?: Array<{ reason?: string; text?: string; engine?: string }> | null;
  /** Probes that lost their citation entirely once the rejections were applied. */
  probes_adjusted?: number | null;
  llm_calls?: number | null;
}

/**
 * Keys come from MentionKind in packages/llm/src/extraction.ts. Do not invent
 * new ones here: an unknown key renders raw, which is ugly and therefore gets
 * noticed, and that is better than a friendly label for something else.
 */
const KIND_LABEL: Record<string, string> = {
  direct_recommendation: "Recommended by name",
  cited_source: "Used as a source",
  neutral_mention: "Mentioned, neutrally",
  negative_mention: "Mentioned, negatively",
};

export function VerifiedCitations({ extraction }: { extraction?: ExtractionTelemetry | null }) {
  if (!extraction) return null;
  if (extraction.mode === "disabled") return null;

  const { verified_count: kept, rejected_count: dropped } = extraction;
  const looked = kept + dropped;
  if (looked === 0) return null;

  const kinds = Object.entries(extraction.by_kind ?? {}).filter(([, n]) => n > 0);
  const samples = (extraction.sample_rejections ?? []).slice(0, 3);
  const adjusted = extraction.probes_adjusted ?? 0;

  return (
    <section aria-labelledby="verified-citations-heading" style={{ marginBottom: "var(--space-8)" }}>
      <h2
        id="verified-citations-heading"
        style={{ fontSize: "var(--font-size-h3)", fontWeight: 700, margin: "0 0 var(--space-4) 0" }}
      >
        What we counted, and what we threw away
      </h2>

      <div
        style={{
          backgroundColor: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-lg)",
          padding: "var(--space-6)",
          boxShadow: "var(--shadow-card)",
        }}
      >
        <p style={{ margin: 0, color: "var(--color-muted)", fontSize: "var(--font-size-body-sm)", lineHeight: 1.6 }}>
          Every mention is read twice. The second reader never sees the first
          one&rsquo;s answer, so a guess cannot survive both.{" "}
          <b style={{ color: "var(--color-text)" }}>
            {kept} of {looked} kept.
          </b>
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
            gap: "var(--space-4)",
            marginTop: "var(--space-5)",
          }}
        >
          <Figure n={kept} label="counted" tone="good" />
          <Figure n={dropped} label={dropped === 1 ? "thrown away" : "thrown away"} tone="bad" />
          {adjusted > 0 && (
            <Figure n={adjusted} label={adjusted === 1 ? "question lost its citation" : "questions lost their citation"} />
          )}
        </div>

        {kinds.length > 0 && (
          <>
            {/* by_kind counts EVERY mention the extractor looked at, verified and
                rejected alike (see audit-run.ts). Saying "counted" here would
                claim more than the data supports. */}
            <p
              style={{
                margin: "var(--space-5) 0 0",
                fontSize: "var(--font-size-caption)",
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "var(--color-muted)",
              }}
            >
              Every mention we looked at, by type
            </p>
          <ul
            style={{
              listStyle: "none",
              margin: "var(--space-3) 0 0",
              padding: 0,
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-2)",
            }}
          >
            {kinds.map(([kind, n]) => (
              <li
                key={kind}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "var(--space-3)",
                  fontSize: "var(--font-size-body-sm)",
                  color: "var(--color-muted)",
                }}
              >
                <span>{KIND_LABEL[kind] ?? kind}</span>
                <b style={{ color: "var(--color-text)", fontVariantNumeric: "tabular-nums" }}>{n}</b>
              </li>
            ))}
          </ul>
          </>
        )}

        {samples.length > 0 && (
          <div style={{ marginTop: "var(--space-5)", paddingTop: "var(--space-4)", borderTop: "1px solid var(--color-border)" }}>
            <p
              style={{
                margin: "0 0 var(--space-3)",
                fontSize: "var(--font-size-caption)",
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "var(--color-muted)",
              }}
            >
              Refused to count
            </p>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
              {samples.map((s, i) => (
                <li
                  key={i}
                  style={{
                    fontSize: "var(--font-size-body-sm)",
                    color: "var(--color-muted)",
                    lineHeight: 1.55,
                    paddingLeft: "var(--space-3)",
                    borderLeft: "2px solid var(--color-border)",
                  }}
                >
                  {s.text ? <span style={{ fontStyle: "italic" }}>&ldquo;{trim(s.text)}&rdquo;</span> : null}
                  {s.reason ? (
                    <span style={{ display: "block", color: "var(--color-text)", fontWeight: 600, marginTop: "2px" }}>
                      {s.reason}
                      {s.engine ? <span style={{ fontWeight: 400, color: "var(--color-muted)" }}> · {s.engine}</span> : null}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        )}

        <p style={{ margin: "var(--space-5) 0 0", fontSize: "var(--font-size-caption)", color: "var(--color-muted)" }}>
          A tool that skips this step reports a bigger number than we do.{" "}
          <a href="/how-we-measure" style={{ color: "var(--color-accent-ink)", fontWeight: 600 }}>
            How we measure
          </a>
        </p>
      </div>
    </section>
  );
}

function Figure({ n, label, tone }: { n: number; label: string; tone?: "good" | "bad" }) {
  const color =
    tone === "good" ? "var(--color-accent-ink)" : tone === "bad" ? "var(--color-danger, #bd3b2e)" : "var(--color-text)";
  return (
    <div>
      <div style={{ fontSize: "1.75rem", fontWeight: 800, letterSpacing: "-0.02em", color, fontVariantNumeric: "tabular-nums" }}>
        {n}
      </div>
      <div style={{ fontSize: "var(--font-size-caption)", color: "var(--color-muted)", marginTop: "2px", lineHeight: 1.35 }}>
        {label}
      </div>
    </div>
  );
}

/** Keeps a rejected quote short enough to scan without losing why it failed. */
function trim(text: string, max = 140): string {
  const t = text.trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}
