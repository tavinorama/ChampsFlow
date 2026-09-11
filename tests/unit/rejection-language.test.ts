/**
 * rejection-language.test.ts — P1-07 defect 2, seen on the founder's dashboard
 * on 2026-09-11.
 *
 * "Refused to count" printed the verifier's own working notes at the customer:
 *
 *   WRONG OFFSET - characters 811-818 are 'services' not 'Ozvor's'
 *   (offsets recomputed from text_exact)
 *
 * RELATORIO §6: "Remover raw verifier errors/provider leakage da UI. Debug fica
 * em admin/observability com trace ID."
 *
 * What these tests hold:
 *   1. the customer gets a sentence in their language plus a count;
 *   2. NOTHING carrying OFFSET / offsets / text_exact / provider / a stack /
 *      an internal id reaches the customer payload — the sanitizer is an
 *      allowlist, so a future telemetry field cannot leak by being added;
 *   3. the raw line is not deleted, it MOVED: it is still written by the
 *      worker and read at GET /api/admin/audits/:id/extraction;
 *   4. a count we do not have stays null — never 0.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  classifyRejection,
  sanitizeExtractionForClient,
  leaksInternalVocabulary,
  REJECTION_SENTENCE,
} from "../../packages/shared/src/rejection-language";

const root = join(__dirname, "../..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

/** The exact telemetry shape the worker writes, junk and all. */
const RAW_EXTRACTION = {
  mode: "two_pass",
  verified_count: 9,
  rejected_count: 5,
  by_kind: { direct_recommendation: 6, neutral_mention: 8 },
  probes_adjusted: 2,
  llm_calls: 14,
  rejection_classes: { quote_mismatch: 3, different_company: 1, not_in_answer: 1 },
  sample_rejections: [
    {
      text: "Ozvor's services are listed",
      reason:
        "WRONG OFFSET - characters 811-818 are 'services' not 'Ozvor's' (offsets recomputed from text_exact)",
    },
    {
      text: "OZVOR LTDA",
      reason: "HOMONYM - the text names a different organisation",
    },
    {
      text: "hallucinated link",
      reason: "text_exact not present in the answer (extractor hallucination)",
    },
  ],
  // A field nobody thought about — the allowlist must drop it anyway.
  provider_debug: { provider: "gemini", stack: "at run (audit-run.ts:1042:7)" },
};

describe("the customer payload carries no engine-room text", () => {
  const client = sanitizeExtractionForClient(RAW_EXTRACTION);

  it("produces a sentence plus a count for each reason", () => {
    expect(client).not.toBeNull();
    expect(client!.rejections_itemised).toBe(true);
    const mismatch = client!.rejections.find((r) => r.code === "quote_mismatch");
    expect(mismatch?.count).toBe(3);
    expect(mismatch?.reason).toBe(
      "The citation did not match the text of the answer, so we discarded it."
    );
    // Every rejection in the run is accounted for, not just the three samples.
    const total = client!.rejections.reduce((s, r) => s + (r.count ?? 0), 0);
    expect(total).toBe(RAW_EXTRACTION.rejected_count);
  });

  it("leaks no OFFSET, offsets, text_exact, provider, stack or internal id", () => {
    const payload = JSON.stringify(client);
    for (const banned of [
      "OFFSET",
      "offsets",
      "text_exact",
      "provider",
      "HOMONYM",
      "hallucination",
      "extractor",
      "verifier",
      "characters 811-818",
      "audit-run.ts",
    ]) {
      expect(payload.toLowerCase()).not.toContain(banned.toLowerCase());
    }
    expect(leaksInternalVocabulary(payload)).toBe(false);
  });

  it("every customer sentence is plain language", () => {
    for (const sentence of Object.values(REJECTION_SENTENCE)) {
      expect(leaksInternalVocabulary(sentence)).toBe(false);
      expect(sentence).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/i);
    }
  });

  it("an unknown telemetry field cannot ride along (allowlist, not filter)", () => {
    const withJunk = {
      ...RAW_EXTRACTION,
      future_field: "ECONNRESET at provider gemini",
      trace: "at verify (extraction.ts:696:11)",
    };
    const payload = JSON.stringify(sanitizeExtractionForClient(withJunk));
    expect(payload).not.toContain("ECONNRESET");
    expect(payload).not.toContain("extraction.ts");
    expect(payload).not.toContain("future_field");
  });

  it("classifies the real verifier lines", () => {
    expect(
      classifyRejection(
        "WRONG OFFSET - characters 811-818 are 'services' not 'Ozvor's' (offsets recomputed from text_exact)"
      )
    ).toBe("quote_mismatch");
    expect(
      classifyRejection("text_exact not present in the answer (extractor hallucination)")
    ).toBe("not_in_answer");
    expect(classifyRejection("HOMONYM - names a different organisation")).toBe(
      "different_company"
    );
    expect(classifyRejection("NEGATION - the answer advises against them")).toBe(
      "not_a_recommendation"
    );
    expect(classifyRejection(null)).toBe("unconfirmed");
  });

  it("an audit with no per-class tally reports reasons without inventing counts", () => {
    const legacy = { ...RAW_EXTRACTION, rejection_classes: undefined };
    const out = sanitizeExtractionForClient(legacy)!;
    expect(out.rejections_itemised).toBe(false);
    expect(out.rejections.length).toBeGreaterThan(0);
    // A count we do not have is null — NEVER zero.
    for (const r of out.rejections) expect(r.count).toBeNull();
    expect(JSON.stringify(out)).not.toContain("text_exact");
  });
});

describe("the raw line moved, it was not deleted", () => {
  it("the worker still writes the raw samples, and now a full tally", () => {
    const src = read("apps/worker/src/jobs/audit-run.ts");
    expect(src).toContain("sample_rejections: extractionRejections");
    expect(src).toContain("rejection_classes: extractionRejectionClasses");
    expect(src).toContain("classifyRejection(m.reason)");
  });

  it("the customer route sanitises instead of forwarding", () => {
    const src = read("apps/api/src/routes/audits.ts");
    expect(src).toContain(
      "extraction: sanitizeExtractionForClient((bd as { extraction?: unknown }).extraction)"
    );
    expect(src).not.toMatch(/extraction: \(bd as \{ extraction\?: unknown \}\)\.extraction \?\? null/);
  });

  it("the admin keeps the verbatim detail, keyed by the audit id as trace id", () => {
    const src = read("apps/api/src/routes/admin.ts");
    expect(src).toContain('app.get("/api/admin/audits/:id/extraction"');
    expect(src).toContain("requireSuperAdmin");
    expect(src).toContain("trace_id: auditId");
  });

  it("the panel renders the sentences, not the samples", () => {
    const src = read("apps/web/src/components/VerifiedCitations.tsx");
    expect(src).toContain("extraction.rejections");
    expect(src).not.toMatch(/extraction\.sample_rejections \?\? \[\]/);
    // A missing count must not render as 0.
    expect(src).toContain('typeof r.count === "number"');
  });
});
