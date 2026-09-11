/**
 * intent-question-label.test.ts — P1-07 defect 1, seen on the founder's
 * dashboard on 2026-09-11.
 *
 * "Which question you lose" titled every row
 * `uv_174dd80f-fc21-4622-b2b3-79d03f0cb4a8` instead of the question the row
 * measures. Prompt Universe v2 (#588) keys each prompt as `uv_<prompt id>` and
 * the panel only knew the six legacy intent keys, so it rendered the id.
 *
 * The rule these tests hold: the title is the QUESTION TEXT; when the text
 * cannot be recovered the row says "Archived question"; a uuid never reaches
 * the screen.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  resolveIntentLabel,
  looksLikeInternalId,
  ARCHIVED_QUESTION_LABEL,
} from "../../packages/shared/src/intent-label";

const root = join(__dirname, "../..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

const UV_ID = "uv_174dd80f-fc21-4622-b2b3-79d03f0cb4a8";
const QUESTION = "Which tools track how a brand appears in AI search answers?";

describe("the label of a question is the question", () => {
  it("titles a universe-v2 row with its text, not its uv_ id", () => {
    // The exact row from the founder's screen.
    expect(resolveIntentLabel({ intent: UV_ID, label: QUESTION })).toBe(QUESTION);
  });

  it("never returns a uuid, whatever the row carries", () => {
    const rows = [
      { intent: UV_ID },                                  // v2, text not resolved
      { intent: UV_ID, label: null },
      { intent: UV_ID, label: "   " },                    // whitespace is not a label
      { intent: UV_ID, label: UV_ID },                    // the id smuggled in as a label
      { intent: "174dd80f-fc21-4622-b2b3-79d03f0cb4a8" }, // bare uuid key
      { intent: "custom_3" },
      { intent: "a3f9c1d4e5b6a7c8" },                     // hash-shaped id
    ];
    for (const row of rows) {
      const label = resolveIntentLabel(row);
      expect(label).toBe(ARCHIVED_QUESTION_LABEL);
      expect(label).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/i);
      expect(label).not.toMatch(/^uv_/);
    }
  });

  it("keeps the buyer-facing names for the legacy intents", () => {
    expect(resolveIntentLabel({ intent: "brand_direct" })).toBe(
      "When they ask about you by name"
    );
    expect(resolveIntentLabel({ intent: "comparison", label: null })).toBe(
      "When they compare you to someone"
    );
  });

  it("a real question is never mistaken for an id", () => {
    expect(looksLikeInternalId(QUESTION)).toBe(false);
    expect(looksLikeInternalId(UV_ID)).toBe(true);
    expect(looksLikeInternalId("brand_direct")).toBe(false);
  });
});

describe("the panel and the payload use it", () => {
  it("IntentBreakdown renders resolveIntentLabel and no raw intent key", () => {
    const src = read("apps/web/src/components/IntentBreakdown.tsx");
    expect(src).toContain("resolveIntentLabel(row)");
    // The defect, exactly: falling through to the raw key as a title.
    expect(src).not.toMatch(/INTENT_LABEL\[row\.intent\] \?\? row\.intent/);
    expect(src).toMatch(/label\?: string \| null/);
  });

  it("the breakdown route resolves the text from audit_prompt", () => {
    const src = read("apps/api/src/routes/audits.ts");
    expect(src).toContain("resolveIntentQuestionText");
    expect(src).toContain("FROM audit_prompt WHERE id = ANY($1::uuid[])");
    // Ownership is still scoped — a label lookup is not a way out of the tenant.
    expect(src).toContain("AND brand_id = $2");
    // The old pass-through (no text resolution) must be gone.
    expect(src).not.toMatch(/intents: \(bd as \{ intents\?: unknown \}\)\.intents \?\? \[\]/);
  });

  it("the worker stamps the question text on new audits", () => {
    const src = read("apps/worker/src/jobs/audit-run.ts");
    expect(src).toContain("promptTextByIntent");
    expect(src).toMatch(/const label = promptTextByIntent\.get\(intentId\) \?\? null/);
  });
});
