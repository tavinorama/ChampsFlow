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
  /**
   * WHY citations were discarded, in the customer's language, with counts.
   * P1-07: the API sends this instead of the verifier's own lines — those read
   * "WRONG OFFSET - characters 811-818 are 'services' not 'Ozvor's'" and are
   * kept for the admin trace (GET /api/admin/audits/:id/extraction).
   */
  rejections?: Array<{ code?: string; reason?: string; count?: number | null }> | null;
  /** False when the audit predates the per-class tally: counts are omitted. */
  rejections_itemised?: boolean | null;
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
  const rejections = (extraction.rejections ?? []).filter((r) => r.reason);
  const itemised = extraction.rejections_itemised === true;
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

        {rejections.length > 0 && (
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
              Why we refused to count them
            </p>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
              {rejections.map((r, i) => (
                <li
                  key={r.code ?? i}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "var(--space-3)",
                    fontSize: "var(--font-size-body-sm)",
                    color: "var(--color-muted)",
                    lineHeight: 1.55,
                    paddingLeft: "var(--space-3)",
                    borderLeft: "2px solid var(--color-border)",
                  }}
                >
                  <span>{r.reason}</span>
                  {/* A missing count stays missing. Printing 0 next to a
                      rejection we DID make would be a new lie. */}
                  {typeof r.count === "number" ? (
                    <b style={{ color: "var(--color-text)", fontVariantNumeric: "tabular-nums" }}>{r.count}</b>
                  ) : null}
                </li>
              ))}
            </ul>
            {!itemised && (
              <p style={{ margin: "var(--space-3) 0 0", fontSize: "var(--font-size-caption)", color: "var(--color-muted)" }}>
                This audit ran before we counted the reasons one by one, so they
                are listed without their split. {dropped} were thrown away in
                total.
              </p>
            )}
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
