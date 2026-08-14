/**
 * grounding-sources — the AI-tool directories the audit researches against, and
 * the legal gate on how each may be used.
 *
 * These tests pin the two things that matter: (1) the two directories the source
 * video names are present and reference-only, and (2) the legal gate holds —
 * There's An AI For That is NEVER ingestible (ToS + EU database rights), and the
 * only ingestible sources are those with an official permissioned API. If a
 * future edit flips a scrape-forbidden source to ingestible, a test breaks.
 */

import { describe, it, expect } from "vitest";
import {
  GROUNDING_SOURCES,
  clientSafeGroundingSources,
  ingestibleSources,
} from "../../apps/api/src/lib/ai-audit/grounding-sources";

describe("grounding sources registry", () => {
  it("names the two directories the source video cites", () => {
    const cited = GROUNDING_SOURCES.filter((s) => s.citedInVideo).map((s) => s.id);
    expect(cited).toContain("theresanaiforthat");
    expect(cited).toContain("futurepedia");
  });

  it("keeps There's An AI For That reference-only (ToS + EU database rights)", () => {
    const taaft = GROUNDING_SOURCES.find((s) => s.id === "theresanaiforthat");
    expect(taaft).toBeDefined();
    expect(taaft!.automatedIngestAllowed).toBe(false);
    expect(taaft!.useAs).toBe("reference");
  });

  it("the legal gate holds: ingestible ⟺ has an official API", () => {
    // No scrape-only source may be flagged ingestible.
    for (const s of GROUNDING_SOURCES) {
      if (s.automatedIngestAllowed) expect(s.hasOfficialApi).toBe(true);
    }
    // And every ingestible source really is ingestible + API-backed.
    for (const s of ingestibleSources()) {
      expect(s.automatedIngestAllowed).toBe(true);
      expect(s.hasOfficialApi).toBe(true);
    }
  });

  it("only Product Hunt is safe for automated ingestion today", () => {
    expect(ingestibleSources().map((s) => s.id)).toEqual(["producthunt"]);
  });

  it("the client-safe view drops every internal legal field", () => {
    for (const s of clientSafeGroundingSources()) {
      expect(s).not.toHaveProperty("legalNote");
      expect(s).not.toHaveProperty("automatedIngestAllowed");
      expect(s).not.toHaveProperty("useAs");
      expect(s.name.length).toBeGreaterThan(0);
      expect(s.url).toMatch(/^https:\/\//);
    }
  });
});
