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
import { ProviderError, assertLiveOrThrow, redactProviderSecrets } from "./types";
import { parseCitation } from "../citation-parser";
import { serpMarketFor } from "../serp-market";

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
// B7 (Codex D04) — what DataForSEO actually said
// ---------------------------------------------------------------------------

export interface DataForSeoEnvelope {
  status_code?: number;
  status_message?: string;
  tasks?: Array<{
    status_code?: number;
    status_message?: string;
    result?: Array<{ items?: Array<Record<string, unknown>> }>;
  }>;
}

export type DataForSeoFailureClass =
  | "auth"
  | "payment_or_quota"
  | "bad_request"
  | "vendor_error"
  | "invalid_payload";

export interface DataForSeoFailure {
  cls: DataForSeoFailureClass;
  /** "collection_failed: <class> (<code>): <vendor message>" — no key, ≤200 chars. */
  message: string;
  kind: "permanent" | "retryable";
}

/**
 * DataForSEO answers HTTP 200 with its own status codes: 20000 is success;
 * 401xx authentication; 402xx payment / balance / quota; other 4xxxx a bad
 * request; 5xxxx their side. A payload without an items[] array is malformed
 * whatever the code says. Null = a good envelope.
 */
export function classifyDataForSeo(data: DataForSeoEnvelope): DataForSeoFailure | null {
  const task = data.tasks?.[0];
  const code =
    data.status_code !== undefined && data.status_code !== 20000
      ? data.status_code
      : task?.status_code !== undefined && task.status_code !== 20000
        ? task.status_code
        : null;
  const vendorMsg = redactProviderSecrets(String((code === data.status_code ? data.status_message : task?.status_message) ?? "").replace(/\s+/g, " ").trim()).slice(0, 120);
  const build = (cls: DataForSeoFailureClass, kind: DataForSeoFailure["kind"]): DataForSeoFailure => ({
    cls,
    kind,
    message: `collection_failed: ${cls}${code !== null ? ` (${code})` : ""}${vendorMsg ? `: ${vendorMsg}` : ""}`.slice(0, 200),
  });
  if (code !== null) {
    if (code >= 40100 && code < 40200) return build("auth", "permanent");
    if (code >= 40200 && code < 40300) return build("payment_or_quota", "permanent");
    if (code >= 50000) return build("vendor_error", "retryable");
    return build("bad_request", "permanent");
  }
  if (!Array.isArray(task?.result?.[0]?.items)) {
    return { cls: "invalid_payload", kind: "permanent", message: "collection_failed: invalid_payload: no items[] in the DataForSEO result" };
  }
  return null;
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
    // C09 (P08): the market is an explicit input now — country + language
    // decided once per audit by serpMarketFor() and recorded with the audit.
    // Without it the request is what it always was (EU → UK, US → US, "en").
    const market = opts?.serpMarket ?? serpMarketFor({ region });

    // Live DataForSEO call — Google organic SERP with the AI Overview block.
    // Basic auth = base64(login:password) in SERP_API_KEY. Never log the key
    // or full body.
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
            language_code: market.language_code,
            location_code: market.location_code,
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
      const data = (await res.json()) as DataForSeoEnvelope;
      const task = data.tasks?.[0];
      const items = task?.result?.[0]?.items;
      // HTTP 200 can contain a vendor failure or malformed payload. Neither is
      // evidence that Google chose not to show an overview. B7 (Codex D04,
      // 23/09): for two days the log said only "invalid DataForSEO result"
      // and nobody could tell a billing problem from a broken payload. The
      // vendor's own status code and message now travel with the error,
      // redacted, so the drift verdict and the alert name the cause.
      const failure = classifyDataForSeo(data);
      if (failure || !Array.isArray(items)) {
        const f = failure ?? { kind: "permanent" as const, message: "collection_failed: invalid_payload: no items[] in the DataForSEO result" };
        throw new ProviderError("serp", f.kind, undefined, f.message);
      }
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

      // An empty shell is failed collection, not an editorial absence. Throw
      // through the gateway's failedProviders contract; never score it as zero.
      const hasText = !!aio && parts.some((p) => p.trim().length > 0);
      if (aio && !hasText) {
        throw new ProviderError("serp", "permanent", undefined, "collection_failed: empty AI Overview shell");
      }
      const absent = !aio;

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
