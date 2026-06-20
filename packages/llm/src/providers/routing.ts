/**
 * providers/routing.ts — Provider routing gate (GEO-A3)
 *
 * Architecture refs:
 *  - docs/03-architecture.md §12 Provider Routing Gate (GEO-A3)
 *  - docs/03-architecture.md §8 Cross-Region and Data Residency Strategy
 *  - docs/03-architecture.md §11 Sub-Processors — DPA status per provider
 *
 * This is the SINGLE CHOKEPOINT for provider access decisions.
 * No adapter or caller may bypass this gate.
 *
 * Rules (architecture §8 EU User Handling):
 *
 *  EU region:
 *    - anthropic: ALLOWED (Bedrock eu-central-1; no Art. 44 transfer; ZDR confirmed)
 *    - serp (DataForSEO): ALLOWED (EU-hosted endpoint)
 *    - perplexity: BLOCKED unless PERPLEXITY_EU_ENABLED === 'true'
 *      (DPA/SCC unconfirmed — GEO-A3; feature flag lifts when legal confirms)
 *    - openai: BLOCKED unless OPENAI_EU_ENABLED === 'true'
 *      (Azure EU + ZDR enterprise path pending Gate 3→4 confirmation)
 *    - gemini: BLOCKED unless GEMINI_EU_ENABLED === 'true'
 *      (Vertex AI EU region DPA pending Gate 3→4 confirmation)
 *
 *  US region:
 *    - All providers: ALLOWED
 *
 * Observability: provider_routing_gate_blocked_total counter recommended
 * (architecture §10 Metrics) — implement at the call site (gateway.ts).
 */

import type { LLMProvider, UserRegion } from "./types";

// ---------------------------------------------------------------------------
// Feature flags — read from environment at call time (not cached at startup)
// so they can be toggled at runtime without a deployment.
// ---------------------------------------------------------------------------

function perplexityEuEnabled(): boolean {
  return process.env["PERPLEXITY_EU_ENABLED"] === "true";
}

function openaiEuEnabled(): boolean {
  return process.env["OPENAI_EU_ENABLED"] === "true";
}

function geminiEuEnabled(): boolean {
  return process.env["GEMINI_EU_ENABLED"] === "true";
}

// ---------------------------------------------------------------------------
// Core routing gate
// ---------------------------------------------------------------------------

/**
 * routeProvider — returns true if the provider is permitted for the given region.
 *
 * This is a pure function (no I/O, no side effects).
 * The single chokepoint — all provider dispatching must call this first.
 *
 * @param provider   The provider being requested
 * @param region     The tenant's user region (from validated JWT; fallback = 'EU')
 * @returns          true = permitted, false = blocked
 */
export function routeProvider(provider: LLMProvider, region: UserRegion): boolean {
  // US users: all providers permitted
  if (region === "US") {
    return true;
  }

  // EU users: apply provider-specific gates
  switch (provider) {
    case "anthropic":
      // Bedrock eu-central-1; ZDR confirmed; DPA confirmed (carry-over Gate 3→4)
      return true;

    case "serp":
      // DataForSEO EU-hosted endpoint; not a GPAI system; DPA pending but EU-hosted
      return true;

    case "perplexity":
      // BLOCKED: DPA/SCC unconfirmed (GEO-A3; architecture §11)
      // Liftable at runtime via PERPLEXITY_EU_ENABLED=true once legal confirms
      return perplexityEuEnabled();

    case "openai":
      // BLOCKED: Azure EU + ZDR enterprise path pending Gate 3→4 confirmation
      // Liftable at runtime via OPENAI_EU_ENABLED=true once legal confirms
      return openaiEuEnabled();

    case "gemini":
      // BLOCKED: Vertex AI EU region DPA confirmation pending Gate 3→4
      // Liftable at runtime via GEMINI_EU_ENABLED=true once legal confirms
      return geminiEuEnabled();

    default: {
      // Exhaustive check — TypeScript should catch unknown providers at compile time
      const _exhaustive: never = provider;
      return false;
    }
  }
}

// ---------------------------------------------------------------------------
// Batch helper
// ---------------------------------------------------------------------------

/**
 * permittedProviders — filter a list of requested providers to only those
 * permitted for the given region.
 *
 * Usage in gateway.ts:
 *   const allowed = permittedProviders(region, requestedProviders);
 *   // fan-out only to allowed providers
 *
 * @param region             Tenant user region
 * @param requested          List of providers the caller wants to use
 * @returns                  Subset of providers that pass the routing gate
 */
export function permittedProviders(
  region: UserRegion,
  requested: LLMProvider[]
): LLMProvider[] {
  return requested.filter((p) => routeProvider(p, region));
}
