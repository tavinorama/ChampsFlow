/**
 * B3 — two-pass citation extraction (extractor + blind verifier).
 *
 * What these tests lock down:
 *   1. a real recommendation counts as a citation
 *   2. a source-only mention (URL) counts, but as `cited_source`
 *   3. a homonym company is rejected → no citation
 *   4. an explicit negation is rejected → no citation
 *   5. a mention the extractor hallucinated is rejected WITHOUT a verifier call
 *   6. wrong offsets with real text are repaired, then verified
 *   7. an empty answer never calls the LLM at all (cost rule)
 *   8. competitor recommended + brand absent → brand_cited false
 *   9. more than 8 mentions → cap, remainder kept as UNVERIFIED_CAP
 *  10. malformed extractor JSON (twice) → fallback_single_pass, never throws
 *
 * NO NETWORK: the LLM caller is injected. Every fixture is a realistic engine
 * answer, and the fake model answers with the JSON the real prompts specify.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  extractMentions,
  extractMentionsBatch,
  twoPassExtractionEnabled,
  countsAsCitation,
  MAX_VERIFIED_MENTIONS,
  type ExtractionLLM,
  type ExtractionLLMRequest,
  type MentionKind,
} from "../../../packages/llm/src/extraction";

// ---------------------------------------------------------------------------
// Fake LLM harness
// ---------------------------------------------------------------------------

type ExtractorReply = string | (() => string);

interface FakeOpts {
  /** Reply (raw text) for the PASS 1 call. Array = one per attempt. */
  extractor: ExtractorReply | ExtractorReply[];
  /** Verdict per candidate, keyed by the quoted text. */
  verify?: (quoted: string, entity: string) => {
    verdict: "VERIFIED" | "REJECTED";
    reason: string;
    kind_confirmed: MentionKind;
  };
  /** Make the verifier throw (timeout simulation). */
  verifierThrows?: boolean;
}

interface Fake {
  llm: ExtractionLLM;
  calls: ExtractionLLMRequest[];
  extractorCalls: number;
  verifierCalls: number;
}

function isVerifierCall(req: ExtractionLLMRequest): boolean {
  return req.system.includes("blind verification pass");
}

function makeFake(opts: FakeOpts): Fake {
  const state: Fake = {
    calls: [],
    extractorCalls: 0,
    verifierCalls: 0,
    llm: async (req) => {
      state.calls.push(req);
      if (isVerifierCall(req)) {
        state.verifierCalls += 1;
        if (opts.verifierThrows) throw new Error("verifier timeout");
        const quoted = /- quoted text: (.*)$/m.exec(req.user)?.[1] ?? "";
        const entity = /- claimed company: (.*)$/m.exec(req.user)?.[1] ?? "";
        const parsedQuote = quoted ? (JSON.parse(quoted) as string) : "";
        const verdict = opts.verify
          ? opts.verify(parsedQuote, entity)
          : {
              verdict: "VERIFIED" as const,
              reason: "the answer recommends this company",
              kind_confirmed: "direct_recommendation" as MentionKind,
            };
        return JSON.stringify(verdict);
      }
      const ix = state.extractorCalls;
      state.extractorCalls += 1;
      const replies = Array.isArray(opts.extractor) ? opts.extractor : [opts.extractor];
      const reply = replies[Math.min(ix, replies.length - 1)] ?? "";
      return typeof reply === "function" ? reply() : reply;
    },
  };
  return state;
}

/** Build an extractor payload with offsets computed from the real answer. */
function mentionsPayload(
  answer: string,
  items: Array<{ text: string; entity: string; kind: MentionKind; url?: string; offset?: [number, number] }>
): string {
  return JSON.stringify({
    mentions: items.map((i) => {
      const found = answer.indexOf(i.text);
      const [start, end] = i.offset ?? [found, found + i.text.length];
      return {
        text_exact: i.text,
        offset_start: start,
        offset_end: end,
        entity: i.entity,
        kind: i.kind,
        ...(i.url ? { url: i.url } : {}),
      };
    }),
  });
}

// ---------------------------------------------------------------------------
// Flag
// ---------------------------------------------------------------------------

describe("GEO_TWO_PASS_EXTRACTION flag", () => {
  const original = process.env["GEO_TWO_PASS_EXTRACTION"];
  afterEach(() => {
    if (original === undefined) delete process.env["GEO_TWO_PASS_EXTRACTION"];
    else process.env["GEO_TWO_PASS_EXTRACTION"] = original;
  });

  it("defaults ON and rolls back with =0", () => {
    delete process.env["GEO_TWO_PASS_EXTRACTION"];
    expect(twoPassExtractionEnabled()).toBe(true);
    process.env["GEO_TWO_PASS_EXTRACTION"] = "1";
    expect(twoPassExtractionEnabled()).toBe(true);
    process.env["GEO_TWO_PASS_EXTRACTION"] = "0";
    expect(twoPassExtractionEnabled()).toBe(false);
  });

  it("OFF: single-pass behaviour, zero LLM calls, legacy citation semantics", async () => {
    process.env["GEO_TWO_PASS_EXTRACTION"] = "0";
    const answer = "I would not recommend Acme Analytics for a team this small.";
    const fake = makeFake({ extractor: "{}" });
    const res = await extractMentions(
      { rawText: answer, brandName: "Acme Analytics" },
      { llm: fake.llm }
    );
    expect(res.extraction_mode).toBe("disabled");
    expect(fake.calls).toHaveLength(0);
    // Legacy behaviour is exactly the false positive B3 fixes — proving rollback works.
    expect(res.brand_cited).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// The 10 required cases
// ---------------------------------------------------------------------------

describe("two-pass extraction", () => {
  beforeEach(() => {
    delete process.env["GEO_TWO_PASS_EXTRACTION"];
  });

  it("1. clear direct recommendation → VERIFIED and counts as a citation", async () => {
    const answer =
      "For a 10-person B2B team, the strongest option is Northwind CRM: it sets up in " +
      "a day and its pipeline reporting is the best in this price range. Zoho and " +
      "Pipedrive are heavier alternatives.";
    const fake = makeFake({
      extractor: mentionsPayload(answer, [
        { text: "Northwind CRM", entity: "Northwind CRM", kind: "direct_recommendation" },
      ]),
      verify: () => ({
        verdict: "VERIFIED",
        reason: "the answer names it as the strongest option",
        kind_confirmed: "direct_recommendation",
      }),
    });

    const res = await extractMentions(
      { rawText: answer, brandName: "Northwind CRM", competitors: ["Zoho", "Pipedrive"] },
      { llm: fake.llm }
    );

    expect(res.extraction_mode).toBe("two_pass");
    expect(res.verified_count).toBe(1);
    expect(res.rejected_count).toBe(0);
    expect(res.brand_cited).toBe(true);
    expect(res.mentions[0]?.kind_confirmed).toBe("direct_recommendation");
    expect(countsAsCitation(res.mentions[0]!)).toBe(true);
    expect(fake.extractorCalls).toBe(1);
    expect(fake.verifierCalls).toBe(1);
  });

  it("2. brand only as a cited source/URL → counts, but as cited_source", async () => {
    const answer =
      "Adoption of AI search is growing fast across mid-market SaaS, and buyers now " +
      "start their research inside an assistant rather than a search engine. " +
      "Source: https://northwindcrm.com/research/ai-search-2026";
    const fake = makeFake({
      extractor: mentionsPayload(answer, [
        {
          text: "https://northwindcrm.com/research/ai-search-2026",
          entity: "Northwind CRM",
          kind: "cited_source",
          url: "https://northwindcrm.com/research/ai-search-2026",
        },
      ]),
      verify: () => ({
        verdict: "VERIFIED",
        reason: "appears only as the source URL of the claim",
        kind_confirmed: "cited_source",
      }),
    });

    const res = await extractMentions(
      { rawText: answer, brandName: "Northwind CRM" },
      { llm: fake.llm }
    );

    expect(res.mentions[0]?.kind_confirmed).toBe("cited_source");
    expect(res.mentions[0]?.url).toContain("northwindcrm.com");
    expect(res.brand_cited).toBe(true);
  });

  it("3. homonym (a different company with a similar name) → REJECTED, no citation", async () => {
    const answer =
      "Acme Corp has manufactured industrial springs in Ohio since 1948 and supplies " +
      "the automotive aftermarket. It does not sell software.";
    const fake = makeFake({
      extractor: mentionsPayload(answer, [
        { text: "Acme Corp", entity: "Acme Analytics", kind: "neutral_mention" },
      ]),
      verify: () => ({
        verdict: "REJECTED",
        reason: "Acme Corp is an industrial springs maker, not the software company",
        kind_confirmed: "neutral_mention",
      }),
    });

    const res = await extractMentions(
      { rawText: answer, brandName: "Acme Analytics" },
      { llm: fake.llm }
    );

    expect(res.rejected_count).toBe(1);
    expect(res.verified_count).toBe(0);
    expect(res.brand_cited).toBe(false);
    expect(res.mentions[0]?.reason).toContain("springs");
  });

  it("4. explicit negation → REJECTED, no citation (the classic false positive)", async () => {
    const answer =
      "I would not recommend Acme Analytics here: it has no native Shopify " +
      "connector and its reporting stops at 90 days. Look at Fathom instead.";
    const fake = makeFake({
      extractor: mentionsPayload(answer, [
        { text: "Acme Analytics", entity: "Acme Analytics", kind: "negative_mention" },
        { text: "Fathom", entity: "Fathom", kind: "direct_recommendation" },
      ]),
      verify: (quoted) =>
        quoted === "Acme Analytics"
          ? {
              verdict: "REJECTED",
              reason: "the answer explicitly advises against this company",
              kind_confirmed: "negative_mention",
            }
          : {
              verdict: "VERIFIED",
              reason: "recommended as the alternative",
              kind_confirmed: "direct_recommendation",
            },
    });

    const res = await extractMentions(
      { rawText: answer, brandName: "Acme Analytics", competitors: ["Fathom"] },
      { llm: fake.llm }
    );

    expect(res.brand_cited).toBe(false);
    expect(res.rejected_count).toBe(1);
    // The competitor's real recommendation still shows up in the breakdown.
    expect(res.mentions.some((m) => m.entity === "Fathom" && m.verdict === "VERIFIED")).toBe(true);
  });

  it("5. mention hallucinated by the extractor → REJECTED locally, verifier never called", async () => {
    const answer =
      "For small retail teams, Fathom and Lightspeed cover most of what you need out of the box.";
    const fake = makeFake({
      extractor: JSON.stringify({
        mentions: [
          {
            text_exact: "Acme Analytics is the market leader",
            offset_start: 0,
            offset_end: 34,
            entity: "Acme Analytics",
            kind: "direct_recommendation",
          },
        ],
      }),
    });

    const res = await extractMentions(
      { rawText: answer, brandName: "Acme Analytics", competitors: ["Fathom"] },
      { llm: fake.llm }
    );

    expect(fake.verifierCalls).toBe(0); // cost rule: no LLM call for a free check
    expect(res.rejected_count).toBe(1);
    expect(res.brand_cited).toBe(false);
    expect(res.mentions[0]?.reason).toMatch(/not present/i);
  });

  it("6. wrong offsets but the text is really there → offsets repaired, then verified", async () => {
    const answer =
      "Among the smaller vendors, Northwind CRM is the one I would put on your shortlist " +
      "for a services business.";
    const trueStart = answer.indexOf("Northwind CRM");
    const fake = makeFake({
      extractor: mentionsPayload(answer, [
        {
          text: "Northwind CRM",
          entity: "Northwind CRM",
          kind: "direct_recommendation",
          offset: [0, 13], // deliberately wrong
        },
      ]),
      verify: () => ({
        verdict: "VERIFIED",
        reason: "put on the shortlist by the answer",
        kind_confirmed: "direct_recommendation",
      }),
    });

    const res = await extractMentions(
      { rawText: answer, brandName: "Northwind CRM" },
      { llm: fake.llm }
    );

    expect(res.mentions[0]?.offset_start).toBe(trueStart);
    expect(res.mentions[0]?.offset_end).toBe(trueStart + "Northwind CRM".length);
    expect(res.mentions[0]?.verdict).toBe("VERIFIED");
    expect(res.mentions[0]?.reason).toContain("offsets recomputed");
    expect(res.brand_cited).toBe(true);
    expect(fake.verifierCalls).toBe(1);
  });

  it("7. empty answer → zero LLM calls (extractor AND verifier skipped)", async () => {
    const fake = makeFake({ extractor: "{}" });
    const res = await extractMentions(
      { rawText: "   ", brandName: "Northwind CRM" },
      { llm: fake.llm }
    );

    expect(fake.calls).toHaveLength(0);
    expect(res.mentions).toEqual([]);
    expect(res.brand_cited).toBe(false);
    expect(res.extraction_mode).toBe("two_pass");
    expect(res.llm_calls).toBe(0);
    expect(res.notes.join(" ")).toMatch(/empty answer/i);
  });

  it("8. competitor recommended and the brand is absent → brand_cited false", async () => {
    const answer =
      "For a 5-seat agency I would start with Pipedrive: cheapest tier that still has " +
      "automations, and the onboarding is quick.";
    const fake = makeFake({
      extractor: mentionsPayload(answer, [
        { text: "Pipedrive", entity: "Pipedrive", kind: "direct_recommendation" },
      ]),
      verify: () => ({
        verdict: "VERIFIED",
        reason: "recommended as the starting point",
        kind_confirmed: "direct_recommendation",
      }),
    });

    const res = await extractMentions(
      { rawText: answer, brandName: "Northwind CRM", competitors: ["Pipedrive", "Zoho"] },
      { llm: fake.llm }
    );

    expect(res.brand_cited).toBe(false);
    expect(res.verified_count).toBe(1);
    expect(res.mentions[0]?.entity).toBe("Pipedrive");
  });

  it("9. more than 8 mentions → cap honoured, remainder kept as UNVERIFIED_CAP", async () => {
    const names = [
      "Northwind CRM", "Pipedrive", "Zoho", "Fathom", "Lightspeed",
      "Copper", "Insightly", "Nutshell", "Capsule", "Keap", "Salesflare",
    ];
    const answer =
      "Shortlist for SMB CRM in 2026: " + names.join(", ") + ". Each covers the basics.";
    const fake = makeFake({
      extractor: mentionsPayload(
        answer,
        names.map((n) => ({
          text: n,
          entity: n,
          kind: "neutral_mention" as MentionKind,
        }))
      ),
      verify: () => ({
        verdict: "VERIFIED",
        reason: "listed in the shortlist without endorsement",
        kind_confirmed: "neutral_mention",
      }),
    });

    const res = await extractMentions(
      { rawText: answer, brandName: "Northwind CRM", competitors: names.slice(1) },
      { llm: fake.llm }
    );

    expect(fake.verifierCalls).toBe(MAX_VERIFIED_MENTIONS);
    expect(res.mentions).toHaveLength(names.length);
    const capped = res.mentions.filter((m) => m.verdict === "UNVERIFIED_CAP");
    expect(capped).toHaveLength(names.length - MAX_VERIFIED_MENTIONS);
    // Nothing is dropped silently — every capped mention carries its reason.
    for (const m of capped) expect(m.reason).toMatch(/verification cap/i);
    // The client brand is verified FIRST, so it is never the one that gets capped.
    const brandMention = res.mentions.find((m) => m.entity === "Northwind CRM");
    expect(brandMention?.verdict).toBe("VERIFIED");
    // A neutral list mention is NOT a citation.
    expect(res.brand_cited).toBe(false);
  });

  it("10. malformed extractor JSON twice → retry, then fallback_single_pass (never throws)", async () => {
    const answer =
      "Northwind CRM is one of the tools people mention for small services teams.";
    const fake = makeFake({
      extractor: ["Sure! Here are the mentions I found:", "```\nnot json either\n```"],
    });

    const res = await extractMentions(
      { rawText: answer, brandName: "Northwind CRM" },
      { llm: fake.llm }
    );

    expect(fake.extractorCalls).toBe(2); // 1 attempt + 1 corrective retry
    expect(fake.verifierCalls).toBe(0);
    expect(res.extraction_mode).toBe("fallback_single_pass");
    // Fallback = legacy single-pass semantics, so the audit keeps working.
    expect(res.brand_cited).toBe(true);
    expect(res.mentions[0]?.verdict).toBe("UNVERIFIED");
    expect(res.notes.join(" ")).toMatch(/attempt 2 failed/i);
  });

  it("retry succeeds on the second attempt (no fallback needed)", async () => {
    const answer = "Northwind CRM is my pick for a services business under 20 seats.";
    const fake = makeFake({
      extractor: [
        "here you go:",
        mentionsPayload(answer, [
          { text: "Northwind CRM", entity: "Northwind CRM", kind: "direct_recommendation" },
        ]),
      ],
      verify: () => ({
        verdict: "VERIFIED",
        reason: "explicit pick",
        kind_confirmed: "direct_recommendation",
      }),
    });

    const res = await extractMentions(
      { rawText: answer, brandName: "Northwind CRM" },
      { llm: fake.llm }
    );

    expect(fake.extractorCalls).toBe(2);
    expect(res.extraction_mode).toBe("two_pass");
    expect(res.brand_cited).toBe(true);
  });

  it("verifier timeout → UNVERIFIED with a reason, audit keeps the measurement", async () => {
    const answer = "Northwind CRM is the option I would shortlist first.";
    const fake = makeFake({
      extractor: mentionsPayload(answer, [
        { text: "Northwind CRM", entity: "Northwind CRM", kind: "direct_recommendation" },
      ]),
      verifierThrows: true,
    });

    const res = await extractMentions(
      { rawText: answer, brandName: "Northwind CRM" },
      { llm: fake.llm }
    );

    expect(res.mentions[0]?.verdict).toBe("UNVERIFIED");
    expect(res.mentions[0]?.reason).toMatch(/verifier unavailable/i);
    expect(res.verified_count).toBe(0);
    // Fail-open: an unverifiable direct recommendation still counts (no silent loss).
    expect(res.brand_cited).toBe(true);
  });

  it("batch helper keeps results index-aligned with the inputs", async () => {
    const a = "Northwind CRM is the one I would pick.";
    const b = "I would not recommend Northwind CRM for this use case.";
    const fake = makeFake({
      extractor: () => "not json",
    });
    const [ra, rb] = await extractMentionsBatch(
      [
        { rawText: a, brandName: "Northwind CRM" },
        { rawText: b, brandName: "Northwind CRM" },
      ],
      { llm: fake.llm, concurrency: 2 }
    );
    expect(ra?.extraction_mode).toBe("fallback_single_pass");
    expect(rb?.extraction_mode).toBe("fallback_single_pass");
  });
});
