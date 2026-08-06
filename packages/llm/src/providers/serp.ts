/**
 * providers/serp.ts — DataForSEO (SERP/AIO) adapter for GEO probe queries
 *
 * Architecture refs:
 *  - docs/03-architecture.md §12 GEO-2 (PERFORMANCE sub-score — AIO signal)
 *  - docs/03-architecture.md §11 — DataForSEO: EU-hosted endpoint (EU users);
 *    DPA pending Gate 3→4; NOT a GPAI system
 *  - docs/03-architecture.md §13 R4 — SerpAPI is the fallback if DataForSEO unavailable
 *
 * This adapter captures Google AI Overview (AIO) presence signals.
 * Unlike the LLM adapters, this hits a SERP API — no chat completion, no generation.
 * The ProbeResponse.sources[] contains URLs found in the AIO citations (if any).
 *
 * Cross-border data flag (hard rule 9):
 *  EU users: DataForSEO EU-hosted endpoint must be used (not the global endpoint).
 *  This reduces GDPR exposure (intra-EU transfer). DPA pending Gate 3→4.
 *  US users: DataForSEO US endpoint.
 *
 * Mock mode (CRITICAL): if SERP_API_KEY is absent, returns a deterministic
 * mock response seeded by a hash of the query text.
 * Live HTTP path: real DataForSEO organic-SERP call that extracts the Google
 * AI Overview block (text + reference URLs) and detects the brand in it.
 *
 * Key env vars:
 *  - SERP_API_KEY — DataForSEO API key / login:password base64 (absent = mock)
 *
 * Hard rules enforced:
 *  1. API key from env only
 *  6. Never log full request/response bodies; redact SERP API key
 *  9. Cross-border: EU-hosted endpoint required for EU users (documented)
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
    createHash("sha256").update("serp:" + query.queryText + query.brandName).digest("hex").slice(0, 8),
    16
  );
  // AIO presence: brand mentioned in Google AI Overview less frequently (~40%)
  const mentioned = seed % 5 < 2;
  const position = mentioned ? 1 : null; // AIO is a single citation block

  // SERP AIO citations include domain-level source URLs
  const aioSources = mentioned
    ? [
        `https://${query.brandName.toLowerCase().replace(/\s+/g, "-")}.com`,
        `https://aio-ref-${seed % 5}.com`,
      ]
    : [`https://aio-ref-${(seed % 5) + 10}.com`];

  const rawText = mentioned
    ? `Google AI Overview: ${query.brandName} is highlighted as a recommended solution ` +
      `for "${query.queryText}" with strong domain authority signals.`
    : `Google AI Overview for "${query.queryText}" does not prominently feature ` +
      `${query.brandName} in the current snapshot.`;

  const parsed = parseCitation(rawText, query.brandName);

  return {
    provider: "serp",
    rawText,
    mentioned: parsed.mentioned,
    position: parsed.position,
    // SERP AIO citations are domain-level URLs
    sources: aioSources,
  };
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export class SerpProbeAdapter implements ProviderAdapter {
  readonly id = "serp" as const;

  async probe(query: ProbeQuery, opts?: ProbeCallOptions): Promise<ProbeResponse> {
    const apiKey = process.env["SERP_API_KEY"];

    // Mock mode — no API key present
    if (!apiKey) {
      assertLiveOrThrow("serp"); // INTEGRITY: never fabricate in production
      return mockResponse(query);
    }

    const region = opts?.region ?? "US";

    // Live DataForSEO call — Google organic SERP with the AI Overview block.
    // EU users: UK location (2826) keeps it intra-EU-ish; US: 2840. Basic auth
    // = base64(login:password) in SERP_API_KEY. Never log the key or full body.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const res = await fetch("https://api.dataforseo.com/v3/serp/google/organic/live/advanced", {
        method: "POST",
        signal: controller.signal,
        headers: { "content-type": "application/json", authorization: `Basic ${apiKey}` },
        body: JSON.stringify([
          {
            keyword: query.queryText,
            language_code: "en",
            location_code: region === "EU" ? 2826 : 2840,
            depth: 10,
            // Google serves most AI Overviews ASYNCHRONOUSLY now: the SERP HTML
            // ships an empty ai_overview shell and the content arrives after.
            // Without this flag DataForSEO returns that shell as-is, and this
            // adapter extracted "(no extractable text)" from EVERY probe for
            // weeks — which scored as "brand not cited" in every audit and
            // drove the drift battery to pause the engine as "failing". One
            // missing boolean manufactured both a weeks-long false product
            // signal and a false engine-health verdict. Costs +$0.0006/request
            // (~1.3¢ per 11-prompt audit) per DataForSEO's pricing.
            load_async_ai_overview: true,
          },
        ]),
      });
      if (!res.ok) {
        throw new ProviderError("serp", res.status >= 500 || res.status === 429 ? "retryable" : "permanent", res.status, "DataForSEO SERP request failed");
      }
      const data = (await res.json()) as {
        tasks?: Array<{ result?: Array<{ items?: Array<Record<string, unknown>> }> }>;
      };
      const items = data.tasks?.[0]?.result?.[0]?.items ?? [];
      const aio = items.find((it) => it["type"] === "ai_overview");

      let rawText: string;
      let sources: string[] = [];
      // Hoisted: `absent` below needs to know whether any overview TEXT was
      // extracted, not merely whether the block existed — the async shell is a
      // block with nothing inside.
      const parts: string[] = [];
      if (aio) {
        // AI Overview text can live in markdown/text, or split across nested
        // components in items[]; references carry the cited source URLs.
        if (typeof aio["markdown"] === "string") parts.push(aio["markdown"] as string);
        else if (typeof aio["text"] === "string") parts.push(aio["text"] as string);
        const comps = (aio["items"] as Array<Record<string, unknown>> | undefined) ?? [];
        for (const c of comps) {
          if (typeof c["text"] === "string") parts.push(c["text"] as string);
          else if (typeof c["markdown"] === "string") parts.push(c["markdown"] as string);
        }
        const refs = ((aio["references"] as Array<Record<string, unknown>> | undefined) ?? [])
          .map((r) => (typeof r["url"] === "string" ? (r["url"] as string) : null))
          .filter((u): u is string => !!u);
        sources = refs;
        rawText = `Google AI Overview: ${parts.join(" ").slice(0, 4000) || "(no extractable text)"}`;
      } else {
        rawText = `Google AI Overview for "${query.queryText}" — no AI Overview block returned in this snapshot.`;
      }

      // ABSENT covers two cases that are the same claim — "there is no overview
      // text to inspect": Google showed no block at all, or it returned the
      // async shell with nothing extractable inside. The second case was live
      // for weeks: every probe since at least 20/07 stored "(no extractable
      // text)", scored the brand as uncited, and fed the drift battery a
      // failure that was really our missing load_async flag.
      const hasText = !!aio && parts.some((p) => p.trim().length > 0);
      const absent = !hasText;

      // parseCitation runs ONLY on real overview text. Both sentinels are
      // ineligible, and the "no block" one is actively dangerous: it echoes the
      // customer's own query, so a brand name in the QUESTION parsed as a
      // citation. That happened in production — the one serp cited=true on
      // record (20/07, "Is Ozvor a good choice?") was the parser finding
      // "Ozvor" in the echoed question of a sentinel, not in any answer.
      const parsed = absent ? null : parseCitation(rawText, query.brandName);
      return {
        provider: "serp",
        rawText,
        mentioned: parsed?.mentioned ?? false,
        position: parsed?.position ?? null,
        sources: sources.length ? sources : (parsed?.sources ?? []),
        absent,
      };
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      throw new ProviderError("serp", "retryable", undefined, "DataForSEO SERP request failed");
    } finally {
      clearTimeout(timer);
    }
  }
}
