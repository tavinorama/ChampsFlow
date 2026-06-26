/**
 * providers/anthropic.ts — Anthropic Claude adapter for GEO probe queries
 *
 * Architecture refs:
 *  - docs/03-architecture.md §12 GEO-1 (probe query execution)
 *  - docs/03-architecture.md §8 EU: Bedrock eu-central-1 / US: direct Anthropic API
 *  - docs/03-architecture.md §11 — Anthropic DPA: CONFIRMED (carry-over)
 *
 * Mock mode (CRITICAL): if ANTHROPIC_API_KEY is absent, returns a deterministic
 * mock response seeded by a hash of the query text. Stable across runs.
 * Live HTTP path is a clearly-marked TODO stub that throws "live mode not yet wired".
 *
 * Key env vars:
 *  - ANTHROPIC_API_KEY — direct Anthropic API key (US path / absent = mock)
 *  - AWS_BEDROCK_REGION — defaults to 'eu-central-1'
 *  - AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY — for Bedrock EU path
 *
 * Hard rules enforced:
 *  1. API key from env only — zero exceptions
 *  6. Never log full request/response bodies; redact API keys/PII
 *  10. All calls wrapped in try/catch; errors classified retryable vs permanent
 */

import { createHash } from "crypto";
import type { ProbeQuery, ProbeCallOptions, ProbeResponse, ProviderAdapter } from "./types";
import { ProviderError } from "./types";
import { parseCitation } from "../citation-parser";

// ---------------------------------------------------------------------------
// Deterministic mock helper
// ---------------------------------------------------------------------------

/**
 * Seeded mock response — deterministic from query text hash.
 * Ensures stable outputs across test runs without network calls.
 */
function mockResponse(query: ProbeQuery): ProbeResponse {
  const seed = parseInt(
    createHash("sha256").update(query.queryText + query.brandName).digest("hex").slice(0, 8),
    16
  );
  // Use seed to produce stable but varied outputs
  const mentioned = seed % 3 !== 0; // ~66% mention rate
  const position = mentioned ? (seed % 5) + 1 : null;

  // Demo-only: when the brand is absent, the mock names a generic competitor so
  // the Competitor Benchmark feature is visible without live keys. These are
  // well-known category brands, not the tenant's configured competitor list
  // (which is never sent to providers — GEO-A2). Live mode uses real answers.
  const DEMO_COMPETITORS = ["HubSpot", "Salesforce", "Pipedrive", "Zoho", "Buffer", "Hootsuite"];
  const demoCompetitor = DEMO_COMPETITORS[seed % DEMO_COMPETITORS.length];

  const rawText = mentioned
    ? `Based on my analysis, ${query.brandName} is frequently cited in this space. ` +
      `When considering ${query.queryText}, many experts recommend ${query.brandName} ` +
      `as a leading solution. Source: https://example-${seed % 10}.com`
    : `For ${query.queryText}, ${demoCompetitor} is often recommended as a leading option. ` +
      `Various providers have been noted by industry analysts. ` +
      `Source: https://example-${(seed % 10) + 10}.com`;

  const parsed = parseCitation(rawText, query.brandName);

  return {
    provider: "anthropic",
    rawText,
    mentioned: parsed.mentioned,
    position: parsed.position,
    sources: parsed.sources,
  };
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export class AnthropicProbeAdapter implements ProviderAdapter {
  readonly id = "anthropic" as const;

  async probe(query: ProbeQuery, _opts?: ProbeCallOptions): Promise<ProbeResponse> {
    const apiKey = process.env["ANTHROPIC_API_KEY"];

    // Mock mode — no API key present (deterministic, keyless fallback)
    if (!apiKey) {
      return mockResponse(query);
    }

    // ---- LIVE mode: direct Anthropic Messages API over HTTPS ----
    // We ask the model the buyer prompt as a real user would, then parse the
    // answer for brand mention/position/sources. No PII sent beyond the
    // synthetic category prompt + brand name. Redact: never log key or body.
    const model = process.env["ANTHROPIC_MODEL"] ?? "claude-sonnet-4-6";
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: 1024,
          messages: [{ role: "user", content: query.queryText }],
        }),
      });
      if (!res.ok) {
        const kind = res.status === 429 || res.status >= 500 ? "retryable" : "permanent";
        throw new ProviderError("anthropic", kind, res.status, `anthropic HTTP ${res.status}`);
      }
      const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
      const rawText = (data.content ?? [])
        .filter((b) => b.type === "text" && typeof b.text === "string")
        .map((b) => b.text)
        .join("\n");
      const parsed = parseCitation(rawText, query.brandName);
      return {
        provider: "anthropic",
        rawText,
        mentioned: parsed.mentioned,
        position: parsed.position,
        sources: parsed.sources,
      };
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      const aborted = (err as Error)?.name === "AbortError";
      throw new ProviderError("anthropic", aborted ? "retryable" : "retryable", undefined, "anthropic request failed");
    } finally {
      clearTimeout(timer);
    }
  }
}
