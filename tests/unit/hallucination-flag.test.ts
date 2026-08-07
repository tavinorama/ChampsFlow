/**
 * P7 — the council's hallucination verdict, pinned (founder-approved
 * 2026-08-07).
 *
 * The verdict's load-bearing choices, each asserted here so a refactor cannot
 * quietly undo them:
 *  1. the flag fires on an ISOLATED negative-control hit, independent of the
 *     engine's composite status (a "healthy" engine that confirmed a fake
 *     brand still flags);
 *  2. the score is NEVER changed — annotation + with/without comparison only;
 *  3. same-day audits BEFORE the battery are backfilled; audits after pick
 *     the flag up at write time;
 *  4. one shared component on BOTH screens (the #163 lesson);
 *  5. no permanent generic banner — the component is silent without a flag.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "../..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

describe("the battery side (worker)", () => {
  const drift = read("apps/worker/src/jobs/drift-control.ts");

  it("flags on negative_rate > 0 — NOT on composite status", () => {
    expect(drift).toMatch(/\.filter\(\(e\) => e\.negative_rate > 0\)/);
    // The one wrong reading this test exists to block: gating the flag on
    // status === 'failing' would let a composite-healthy hallucinator pass.
    expect(drift).not.toMatch(/negative_rate > 0[\s\S]{0,120}status === "failing"/);
  });

  it("backfills the same UTC day's audits and screams on write failure", () => {
    expect(drift).toContain("hallucination_flag_backfilled");
    expect(drift).toContain("hallucination_flag_backfill_failed");
    expect(drift).toMatch(/jsonb_set\([\s\S]{0,200}hallucinationFlags/);
  });

  it("exports the same-day read audit-run stamps from", () => {
    expect(drift).toContain("export async function hallucinatingEnginesToday");
  });
});

describe("the audit side (worker)", () => {
  const audit = read("apps/worker/src/jobs/audit-run.ts");

  it("stamps today's flags at write time, filtered to the engines actually in the panel", () => {
    expect(audit).toContain("hallucinatingEnginesToday");
    expect(audit).toMatch(/hallucinationFlags[\s\S]{0,300}requestedProviders/);
  });
});

describe("the API side", () => {
  const api = read("apps/api/src/routes/audits.ts");

  it("exposes the annotation with the checkable with/without pair", () => {
    expect(api).toContain("citation_rate_without_flagged");
  });

  it("maps battery engine ids to citation_check provider values", () => {
    expect(api).toMatch(/"gemini" \? "google"/);
    expect(api).toMatch(/"serp" \? "dataforseo"/);
  });
});

describe("the screen side — one component, both screens, council copy verbatim", () => {
  const comp = read("apps/web/src/components/HallucinationFlag.tsx");

  it("carries the council's exact language", () => {
    for (const phrase of [
      "answered questions about a company we invented",
      "its own kind of dishonest",
      "stop trusting that engine for new audits",
    ]) {
      expect(comp).toContain(phrase);
    }
  });

  it("is silent without a flag — no permanent generic banner", () => {
    expect(comp).toMatch(/if \(!info \|\| info\.engines\.length === 0\) return null/);
  });

  it("renders on BOTH screens (the #163 lesson)", () => {
    for (const page of [
      "apps/web/src/app/brands/[id]/page.tsx",
      "apps/web/src/app/dashboard-v3/page.tsx",
    ]) {
      const src = read(page);
      expect(src).toMatch(/from "[./]+components\/HallucinationFlag"/);
      expect(src).toContain("<HallucinationFlag");
    }
  });
});
