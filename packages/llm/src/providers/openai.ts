/**
 * providers/openai.ts — OpenAI adapter for GEO probe queries
 *
 * Surface (B2): Responses API (/v1/responses) with the `web_search` tool —
 * measures the search-enabled ChatGPT consumer surface. GEO_WEB_SEARCH=0
 * rolls back to the legacy no-search Chat Completions call.
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
import { ProviderError, assertLiveOrThrow, webSearchEnabled } from "./types";
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

    // ---- LIVE mode ----
    // Cheap tier by design for audit/free-test probes (AUDIT_OPENAI_MODEL overrides).
    const model = process.env["AUDIT_OPENAI_MODEL"] ?? process.env["OPENAI_MODEL"] ?? "gpt-4o-mini";
    // B2 surface honesty: default path is the Responses API with the web_search
    // tool, so the probe measures what a ChatGPT user actually sees (browsing
    // on), not the model's parametric memory. GEO_WEB_SEARCH=0 rolls back to
    // the legacy no-search Chat Completions call.
    const webSearch = webSearchEnabled();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    try {
      const url = webSearch
        ? "https://api.openai.com/v1/responses"
        : "https://api.openai.com/v1/chat/completions";
      const body = webSearch
        ? {
            model,
            max_output_tokens: 1024,
            input: query.queryText,
            tools: [{ type: "web_search" }],
          }
        : {
            model,
            max_tokens: 1024,
            messages: [{ role: "user", content: query.queryText }],
          };
      const res = await fetch(url, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const kind = res.status === 429 || res.status >= 500 ? "retryable" : "permanent";
        throw new ProviderError("openai", kind, res.status, `openai HTTP ${res.status}`);
      }
      const data = (await res.json()) as {
        // Chat Completions shape (GEO_WEB_SEARCH=0 fallback)
        choices?: Array<{ message?: { content?: string } }>;
        // Responses API shape: output[] carries web_search_call + message items;
        // message content blocks are output_text with url_citation annotations.
        output?: Array<{
          type?: string;
          content?: Array<{
            type?: string;
            text?: string;
            annotations?: Array<{ type?: string; url?: string }>;
          }>;
        }>;
      };

      let rawText: string;
      const searchSources: string[] = [];
      if (webSearch) {
        const messageBlocks = (data.output ?? [])
          .filter((item) => item.type === "message")
          .flatMap((item) => item.content ?? []);
        rawText = messageBlocks
          .filter((c) => c.type === "output_text" && typeof c.text === "string")
          .map((c) => c.text)
          .join("\n");
        // url_citation annotations = the pages the search-enabled answer cites.
        for (const c of messageBlocks) {
          for (const a of c.annotations ?? []) {
            if (a.type === "url_citation" && typeof a.url === "string") searchSources.push(a.url);
          }
        }
      } else {
        rawText = data.choices?.[0]?.message?.content ?? "";
      }

      const parsed = parseCitation(rawText, query.brandName);
      return {
        provider: "openai",
        rawText,
        mentioned: parsed.mentioned,
        position: parsed.position,
        sources: [...new Set([...parsed.sources, ...searchSources])],
      };
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      throw new ProviderError("openai", "retryable", undefined, "openai request failed");
    } finally {
      clearTimeout(timer);
    }
  }
}
