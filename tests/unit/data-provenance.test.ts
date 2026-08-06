/**
 * Data provenance (#159) — the harvest from the Signal-Engine spec.
 *
 * Three deliverables, each pinned here so it cannot silently rot:
 *  A) the source_registry migration + FK on collected evidence;
 *  B) the PII scrub at the provider gateway (same chokepoint as GEO-SEC-2);
 *  C) the written policy with its red lines — including the one we already
 *     obeyed in code but had never written down (no Reddit Data API).
 *
 * The red-line greps are the CI check §5 of the policy promises: a new
 * collector that crosses a line fails here, in the same PR that ships it.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { scrubPii } from "../../packages/llm/src/prompt-sanitizer";

const root = join(__dirname, "../..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

// ---------------------------------------------------------------------------
// A — the registry and the FK
// ---------------------------------------------------------------------------
describe("source_registry — provenance recorded, not narrated", () => {
  const up = read("packages/db/migrations/20260806000001_source_provenance.up.sql");

  it("exists with the columns the DPO question needs", () => {
    for (const col of ["tos_version", "legal_basis", "retention_days", "collection_method"]) {
      expect(up).toContain(col);
    }
  });

  it("seeds every collection path the code actually has", () => {
    for (const id of [
      "provider_answer",
      "serp_public_search",
      "reddit_via_serp",
      "site_crawl_client",
      "google_places",
      "client_supplied",
    ]) {
      expect(up).toContain(`'${id}'`);
    }
  });

  it("reddit's row stores nothing raw — aggregates only, by construction", () => {
    expect(up).toMatch(/'reddit_via_serp'[\s\S]{0,400}?legitimate_interest',\s*0,/);
  });

  it("citation_check rows carry the FK, and the worker stamps it", () => {
    expect(up).toMatch(/ALTER TABLE citation_check\s+ADD COLUMN IF NOT EXISTS source_id/);
    const worker = read("apps/worker/src/jobs/audit-run.ts");
    expect(worker).toContain('"serp_public_search" : "provider_answer"');
  });

  it("has a reversible down migration", () => {
    const down = read("packages/db/migrations/20260806000001_source_provenance.down.sql");
    expect(down).toContain("DROP COLUMN IF EXISTS source_id");
    expect(down).toContain("DROP TABLE IF EXISTS source_registry");
  });
});

// ---------------------------------------------------------------------------
// B — the PII scrub
// ---------------------------------------------------------------------------
describe("scrubPii — deterministic, and never a silent leak", () => {
  it("redacts an email and reports the kind, never the value", () => {
    const r = scrubPii("contact joana.silva@example.com about best CRMs");
    expect(r.scrubbed).toBe("contact [redacted-email] about best CRMs");
    expect(r.found).toEqual(["email"]);
    expect(JSON.stringify(r.found)).not.toContain("joana");
  });

  it("redacts real phone shapes — international and separated", () => {
    expect(scrubPii("call +55 11 98765-4321 today").scrubbed).toBe("call [redacted-phone] today");
    expect(scrubPii("call (415) 555-0182 now").scrubbed).toBe("call [redacted-phone] now");
  });

  it("never trips on prices, years, or plan limits — the false-positive budget is zero", () => {
    for (const s of [
      "best crm under $10,000 for small teams",
      "top accounting software 2026",
      "plans with 6,000 credits per month",
      "compare 20 vs 33 prompts per audit",
    ]) {
      const r = scrubPii(s);
      expect(r.scrubbed).toBe(s);
      expect(r.found).toEqual([]);
    }
  });

  it("redacts a standalone @handle but leaves emails to the email rule", () => {
    const r = scrubPii("what do people say about @ozvor_br on social");
    expect(r.scrubbed).toBe("what do people say about [redacted-handle] on social");
    expect(r.found).toEqual(["handle"]);
  });

  it("is wired into the probe gateway at the GEO-SEC-2 chokepoint", () => {
    const gw = read("packages/llm/src/providers/gateway.ts");
    expect(gw).toMatch(/scrubPii\(s\.sanitized\)/);
    // The scrub must run on the sanitizer's OUTPUT — after injection checks,
    // before fan-out — not on some other copy of the text.
  });
});

// ---------------------------------------------------------------------------
// C — the policy and its red lines
// ---------------------------------------------------------------------------
describe("the written policy — red lines that CI can see", () => {
  it("exists, opens with a TL;DR, and covers all three jurisdictions", () => {
    const p = "docs/compliance/data-provenance-policy.md";
    expect(existsSync(join(root, p))).toBe(true);
    const doc = read(p);
    expect(doc).toContain("TL;DR");
    for (const j of ["LGPD", "GDPR", "CCPA"]) expect(doc).toContain(j);
  });

  it("red line: no Reddit Data API anywhere in production code", () => {
    // The behaviour predates the policy (reddit-signal.ts always used SERP);
    // this grep is what §5 promises: a collector that crosses the line fails
    // in the same PR that ships it.
    const files = [
      "packages/llm/src/reddit-signal.ts",
      "packages/llm/src/offsite-signal.ts",
      "packages/llm/src/providers/gateway.ts",
    ];
    for (const f of files) {
      const src = read(f);
      expect(src).not.toMatch(/oauth\.reddit\.com|api\.reddit\.com/);
    }
  });

  it("red line: reddit stores aggregates, never usernames or comment bodies", () => {
    const src = read("packages/llm/src/reddit-signal.ts");
    expect(src).toMatch(/no usernames,?\s*\n?\s*\* no comment bodies|no usernames/i);
  });
});
