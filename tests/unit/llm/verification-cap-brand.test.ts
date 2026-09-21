/**
 * verification-cap-brand.test.ts — an answer that talks about you a lot must
 * not kill your own audit.
 *
 * 21/09: the weekly audit and a manual re-run both failed with "Citation
 * verification is incomplete. No score was published." The verifier was fine.
 * The client brand shared an 8-mention cap written to bound cost on COMPETITOR
 * noise, so an answer naming the brand nine times returned the ninth as
 * UNVERIFIED_CAP, and the guard treated our own budget decision exactly like a
 * verifier outage.
 */
import { describe, it, expect } from "vitest";
import {
  extractMentions,
  assertBrandVerificationComplete,
  MAX_VERIFIED_MENTIONS,
  MAX_BRAND_VERIFICATIONS,
} from "../../../packages/llm/src/extraction";

/** An answer to "What is <brand> and what does it measure?": the name, n times. */
function brandHeavyAnswer(brand: string, n: number) {
  const answer = Array.from({ length: n }, (_, i) => `Point ${i + 1}: ${brand} measures AI visibility.`).join(" ");
  const mentions: unknown[] = [];
  let from = 0;
  for (let i = 0; i < n; i++) {
    const at = answer.indexOf(brand, from);
    mentions.push({ text_exact: brand, offset_start: at, offset_end: at + brand.length, entity: brand, kind: "direct_recommendation" });
    from = at + brand.length;
  }
  return { answer, mentions };
}

function stubLLM(mentions: unknown[], counter: { verifier: number }) {
  return async (req: { system: string; user: string; maxTokens: number }) => {
    if (req.system.startsWith("You are the extraction pass")) return JSON.stringify({ mentions });
    counter.verifier += 1;
    return JSON.stringify({ verdict: "VERIFIED", reason: "ok", kind_confirmed: "direct_recommendation" });
  };
}

describe("the verification cap never blocks the client brand", () => {
  it("THE 21/09 CASE: eleven brand mentions in one answer are all verified, and the audit is publishable", async () => {
    const { answer, mentions } = brandHeavyAnswer("Ozvor", 11);
    const counter = { verifier: 0 };
    const r = await extractMentions({ rawText: answer, brandName: "Ozvor", competitors: [] },
      { llm: stubLLM(mentions, counter), enabled: true });

    expect(mentions.length).toBeGreaterThan(MAX_VERIFIED_MENTIONS);
    expect(r.extraction_mode).toBe("two_pass");
    expect(r.verified_count).toBe(11);
    expect(r.mentions.filter((m) => m.verdict === "UNVERIFIED_CAP")).toHaveLength(0);
    expect(r.brand_verification_pending).toBe(false);
    expect(() => assertBrandVerificationComplete([r])).not.toThrow();
    expect(counter.verifier).toBe(11);
  });

  it("competitors keep their cap: brand-first, then eight competitors, the rest flagged", async () => {
    const brandName = "Ozvor";
    const answer = "Ozvor is one option. " + Array.from({ length: 12 }, (_, i) => `Rival${i} is another.`).join(" ");
    const mentions: unknown[] = [{ text_exact: "Ozvor", offset_start: 0, offset_end: 5, entity: "Ozvor", kind: "direct_recommendation" }];
    const competitors: string[] = [];
    for (let i = 0; i < 12; i++) {
      const name = `Rival${i}`;
      competitors.push(name);
      const at = answer.indexOf(name);
      mentions.push({ text_exact: name, offset_start: at, offset_end: at + name.length, entity: name, kind: "neutral_mention" });
    }
    const counter = { verifier: 0 };
    const r = await extractMentions({ rawText: answer, brandName, competitors },
      { llm: stubLLM(mentions, counter), enabled: true });

    const capped = r.mentions.filter((m) => m.verdict === "UNVERIFIED_CAP");
    expect(capped).toHaveLength(4); // 12 competitors, 8 verified
    expect(capped.every((m) => m.entity !== brandName)).toBe(true);
    expect(capped[0]?.reason).toContain("competitor mentions per answer");
    expect(r.brand_verification_pending).toBe(false);
    expect(counter.verifier).toBe(1 + MAX_VERIFIED_MENTIONS);
  });

  it("a real verifier outage still refuses to publish, and the message says which cause", async () => {
    const { answer, mentions } = brandHeavyAnswer("Ozvor", 2);
    const llm = async (req: { system: string; user: string; maxTokens: number }) => {
      if (req.system.startsWith("You are the extraction pass")) return JSON.stringify({ mentions });
      throw new Error("anthropic HTTP 429");
    };
    const r = await extractMentions({ rawText: answer, brandName: "Ozvor", competitors: [] }, { llm, enabled: true });

    expect(r.brand_verification_pending).toBe(true);
    expect(() => assertBrandVerificationComplete([r])).toThrow(/unverified_by_error=2/);
    expect(() => assertBrandVerificationComplete([r])).toThrow(/unverified_by_cap=0/);
  });

  it("the brand ceiling exists, and it is far above any real answer", () => {
    expect(MAX_BRAND_VERIFICATIONS).toBeGreaterThan(MAX_VERIFIED_MENTIONS * 4);
  });
});
