/**
 * providers/gemini.ts — Google Gemini adapter for GEO probe queries
 *
 * Architecture refs:
 *  - docs/03-architecture.md §12 GEO-1 (probe query execution)
 *  - docs/03-architecture.md §11 — Gemini DPA: PENDING Gate 3→4 (EU BLOCKED)
 *  - docs/03-architecture.md §8 — EU users BLOCKED until Vertex AI EU region DPA confirmed
 *
 * Cross-border data flag (hard rule 9):
 *  Google Gemini via Vertex AI. For EU users this adapter MUST NOT be called —
 *  the routing gate in routing.ts blocks EU access via GEMINI_EU_ENABLED flag
 *  (default false). Once GEMINI_EU_ENABLED=true, the Vertex AI EU region
 *  endpoint must be used (not the global endpoint).
 *
 * Mock mode (CRITICAL): if GEMINI_API_KEY is absent, returns a deterministic
 * mock response seeded by a hash of the query text.
 * Live HTTP path: clearly-marked TODO stub that throws "live mode not yet wired".
 *
 * Key env vars:
 *  - GEMINI_API_KEY — Google AI API key (absent = mock)
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
    createHash("sha256").update("gemini:" + query.queryText + query.brandName).digest("hex").slice(0, 8),
    16
  );
  const mentioned = seed % 5 !== 1; // ~80% mention rate
  const position = mentioned ? (seed % 6) + 1 : null;

  const rawText = mentioned
    ? `My research indicates that ${query.brandName} is a well-regarded solution ` +
      `in the context of ${query.queryText}. User feedback and expert reviews ` +
      `highlight ${query.brandName}'s strengths. Reference: https://g-src-${seed % 7}.com`
    : `When evaluating options for ${query.queryText}, users should consider ` +
      `factors such as integration capabilities, pricing models, and support tiers. ` +
      `Reference: https://g-src-${(seed % 7) + 7}.com`;

  const parsed = parseCitation(rawText, query.brandName);

  return {
    provider: "gemini",
    rawText,
    mentioned: parsed.mentioned,
    position: parsed.position,
    sources: parsed.sources,
  };
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export class GeminiProbeAdapter implements ProviderAdapter {
  readonly id = "gemini" as const;

  async probe(query: ProbeQuery, _opts?: ProbeCallOptions): Promise<ProbeResponse> {
    const apiKey = process.env["GEMINI_API_KEY"];

    // Mock mode — no API key present
    if (!apiKey) {
      assertLiveOrThrow("gemini"); // INTEGRITY: never fabricate in production
      return mockResponse(query);
    }

    // ---- LIVE mode: Google Gemini generateContent (API-key path) ----
    const model = process.env["GEMINI_MODEL"] ?? "gemini-2.5-flash";
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const res = await fetch(url, {
        method: "POST",
        signal: controller.signal,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: query.queryText }] }],
        }),
      });
      if (!res.ok) {
        const kind = res.status === 429 || res.status >= 500 ? "retryable" : "permanent";
        throw new ProviderError("gemini", kind, res.status, `gemini HTTP ${res.status}`);
      }
      const data = (await res.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const rawText = (data.candidates?.[0]?.content?.parts ?? [])
        .map((p) => p.text ?? "")
        .join("\n");
      const parsed = parseCitation(rawText, query.brandName);
      return {
        provider: "gemini",
        rawText,
        mentioned: parsed.mentioned,
        position: parsed.position,
        sources: parsed.sources,
      };
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      throw new ProviderError("gemini", "retryable", undefined, "gemini request failed");
    } finally {
      clearTimeout(timer);
    }
  }
}
