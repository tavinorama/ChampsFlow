/**
 * providers/perplexity.ts — Perplexity adapter for GEO probe queries
 *
 * Architecture refs:
 *  - docs/03-architecture.md §12 GEO-1 (probe query execution)
 *  - docs/03-architecture.md §11 — Perplexity DPA: UNCONFIRMED — EU BLOCKED (GEO-A3)
 *  - docs/03-architecture.md §8 — "Perplexity: BLOCKED for EU users"
 *  - docs/03-architecture.md §12 Provider Routing Gate
 *
 * Cross-border data flag (hard rule 9):
 *  Perplexity is US-hosted ONLY. There is no EU-region deployment.
 *  EU users are HARD BLOCKED at the routing gate (routing.ts) via
 *  PERPLEXITY_EU_ENABLED=false (default, immutable until legal confirms DPA/SCC).
 *  This adapter MUST NOT be called for EU users.
 *
 *  If this adapter is reached for an EU user, it is a routing gate bypass —
 *  this is a compliance violation (GDPR Art. 44, GEO-A3).
 *
 * Mock mode (CRITICAL): if PERPLEXITY_API_KEY is absent, returns a deterministic
 * mock response seeded by a hash of the query text.
 * Live HTTP path: clearly-marked TODO stub that throws "live mode not yet wired".
 *
 * Key env vars:
 *  - PERPLEXITY_API_KEY — Perplexity API key (absent = mock)
 *
 * Hard rules enforced:
 *  1. API key from env only
 *  6. Never log full request/response bodies
 *  9. Cross-border flag documented — EU BLOCKED at routing gate
 *  10. All calls wrapped in try/catch
 */

import { createHash } from "crypto";
import type { ProbeQuery, ProbeCallOptions, ProbeResponse, ProviderAdapter } from "./types";
import { ProviderError } from "./types";
import { parseCitation } from "../citation-parser";

// ---------------------------------------------------------------------------
// Deterministic mock helper
// ---------------------------------------------------------------------------

function mockResponse(query: ProbeQuery): ProbeResponse {
  const seed = parseInt(
    createHash("sha256").update("perplexity:" + query.queryText + query.brandName).digest("hex").slice(0, 8),
    16
  );
  const mentioned = seed % 2 === 0; // ~50% mention rate
  const position = mentioned ? (seed % 3) + 1 : null;

  // Perplexity typically returns inline citations with source URLs
  const sourceUrls = [
    `https://pplx-src-${seed % 5}.com`,
    `https://pplx-src-${(seed % 5) + 5}.com`,
  ];

  const rawText = mentioned
    ? `${query.brandName} is mentioned as a leading option for ${query.queryText}. ` +
      `Multiple sources confirm its position. [1] [2]`
    : `For ${query.queryText}, the landscape includes several providers. ` +
      `Selection depends on specific requirements. [1] [2]`;

  const parsed = parseCitation(rawText, query.brandName);

  return {
    provider: "perplexity",
    rawText,
    mentioned: parsed.mentioned,
    position: parsed.position,
    // Perplexity returns inline citations — include mock source URLs
    sources: sourceUrls,
  };
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export class PerplexityProbeAdapter implements ProviderAdapter {
  readonly id = "perplexity" as const;

  async probe(query: ProbeQuery, _opts?: ProbeCallOptions): Promise<ProbeResponse> {
    const apiKey = process.env["PERPLEXITY_API_KEY"];

    // Mock mode — no API key present
    if (!apiKey) {
      return mockResponse(query);
    }

    // ---- LIVE mode: Perplexity Chat Completions (online model) ----
    // Perplexity returns real web citations in `citations` — the most valuable
    // source signal we get. EU users are blocked upstream by the routing gate.
    const model = process.env["PERPLEXITY_MODEL"] ?? "sonar";
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25_000);
    try {
      const res = await fetch("https://api.perplexity.ai/chat/completions", {
        method: "POST",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: query.queryText }],
        }),
      });
      if (!res.ok) {
        const kind = res.status === 429 || res.status >= 500 ? "retryable" : "permanent";
        throw new ProviderError("perplexity", kind, res.status, `perplexity HTTP ${res.status}`);
      }
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        citations?: string[];
      };
      const rawText = data.choices?.[0]?.message?.content ?? "";
      const parsed = parseCitation(rawText, query.brandName);
      // Merge Perplexity's structured citations with any inline URLs found.
      const sources = Array.from(new Set([...(data.citations ?? []), ...parsed.sources]));
      return {
        provider: "perplexity",
        rawText,
        mentioned: parsed.mentioned,
        position: parsed.position,
        sources,
      };
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      throw new ProviderError("perplexity", "retryable", undefined, "perplexity request failed");
    } finally {
      clearTimeout(timer);
    }
  }
}
