/**
 * providers/openai.ts — OpenAI GPT-4o adapter for GEO probe queries
 *
 * Architecture refs:
 *  - docs/03-architecture.md §12 GEO-1 (probe query execution)
 *  - docs/03-architecture.md §11 — OpenAI DPA: PENDING Gate 3→4 (EU BLOCKED)
 *  - docs/03-architecture.md §8 — EU users BLOCKED until Azure EU + ZDR enterprise confirmed
 *
 * Cross-border data flag (hard rule 9):
 *  OpenAI is US-hosted. For EU users this adapter MUST NOT be called directly —
 *  the routing gate in routing.ts blocks EU access via OPENAI_EU_ENABLED flag
 *  (default false). This is a compliance requirement (GEO-A3).
 *  If OPENAI_EU_ENABLED is set to true, the caller (gateway.ts) is responsible
 *  for ensuring Azure EU + ZDR enterprise path is active.
 *
 * Mock mode (CRITICAL): if OPENAI_API_KEY is absent, returns a deterministic
 * mock response seeded by a hash of the query text.
 * Live HTTP path: clearly-marked TODO stub that throws "live mode not yet wired".
 *
 * Key env vars:
 *  - OPENAI_API_KEY — OpenAI API key (absent = mock)
 *
 * Hard rules enforced:
 *  1. API key from env only
 *  6. Never log full request/response bodies
 *  9. Cross-border flag: EU users blocked at routing gate
 *  10. All calls wrapped in try/catch
 */

import { createHash } from "crypto";
import type { ProbeQuery, ProbeCallOptions, ProbeResponse, ProviderAdapter } from "./types";
import { ProviderError, assertLiveOrThrow } from "./types";
import { parseCitation } from "../citation-parser";

// ---------------------------------------------------------------------------
// Deterministic mock helper
// ---------------------------------------------------------------------------

function mockResponse(query: ProbeQuery): ProbeResponse {
  const seed = parseInt(
    createHash("sha256").update("openai:" + query.queryText + query.brandName).digest("hex").slice(0, 8),
    16
  );
  const mentioned = seed % 4 !== 0; // ~75% mention rate (different from other providers)
  const position = mentioned ? (seed % 4) + 1 : null;

  const rawText = mentioned
    ? `According to recent data, ${query.brandName} stands out as a top choice ` +
      `for ${query.queryText}. Industry benchmarks consistently place ` +
      `${query.brandName} in the top tier. See: https://ref-${seed % 8}.io`
    : `For ${query.queryText}, organizations typically evaluate multiple vendors. ` +
      `Selection criteria include cost, support, and scalability. ` +
      `See: https://ref-${(seed % 8) + 8}.io`;

  const parsed = parseCitation(rawText, query.brandName);

  return {
    provider: "openai",
    rawText,
    mentioned: parsed.mentioned,
    position: parsed.position,
    sources: parsed.sources,
  };
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export class OpenAIProbeAdapter implements ProviderAdapter {
  readonly id = "openai" as const;

  async probe(query: ProbeQuery, _opts?: ProbeCallOptions): Promise<ProbeResponse> {
    const apiKey = process.env["OPENAI_API_KEY"];

    // Mock mode — no API key present
    if (!apiKey) {
      assertLiveOrThrow("openai"); // INTEGRITY: never fabricate in production
      return mockResponse(query);
    }

    // ---- LIVE mode: OpenAI Chat Completions API over HTTPS ----
    const model = process.env["OPENAI_MODEL"] ?? "gpt-4o";
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          max_tokens: 1024,
          messages: [{ role: "user", content: query.queryText }],
        }),
      });
      if (!res.ok) {
        const kind = res.status === 429 || res.status >= 500 ? "retryable" : "permanent";
        throw new ProviderError("openai", kind, res.status, `openai HTTP ${res.status}`);
      }
      const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const rawText = data.choices?.[0]?.message?.content ?? "";
      const parsed = parseCitation(rawText, query.brandName);
      return {
        provider: "openai",
        rawText,
        mentioned: parsed.mentioned,
        position: parsed.position,
        sources: parsed.sources,
      };
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      throw new ProviderError("openai", "retryable", undefined, "openai request failed");
    } finally {
      clearTimeout(timer);
    }
  }
}
