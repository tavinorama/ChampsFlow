/**
 * tests/unit/llm/routing.test.ts — Provider routing gate tests
 *
 * Architecture refs:
 *  - docs/03-architecture.md §12 Provider Routing Gate (GEO-A3)
 *  - docs/03-architecture.md §8 EU User Handling — Perplexity BLOCKED,
 *    OpenAI BLOCKED, Gemini BLOCKED for EU until flags lifted
 *
 * Test coverage:
 *  - EU region excludes Perplexity / OpenAI / Gemini by default
 *  - US region allows all providers
 *  - Feature flags (PERPLEXITY_EU_ENABLED, OPENAI_EU_ENABLED, GEMINI_EU_ENABLED)
 *    lift the respective blocks when set to 'true'
 *  - Anthropic and serp always allowed in both regions
 *  - permittedProviders() batch helper
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { routeProvider, permittedProviders } from "../../../packages/llm/src/providers/routing";

// ---------------------------------------------------------------------------
// Env variable backup/restore helpers
// ---------------------------------------------------------------------------

function setEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

let savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  savedEnv = {
    PERPLEXITY_EU_ENABLED: process.env["PERPLEXITY_EU_ENABLED"],
    OPENAI_EU_ENABLED: process.env["OPENAI_EU_ENABLED"],
    GEMINI_EU_ENABLED: process.env["GEMINI_EU_ENABLED"],
  };
  // Default state: all EU flags off
  delete process.env["PERPLEXITY_EU_ENABLED"];
  delete process.env["OPENAI_EU_ENABLED"];
  delete process.env["GEMINI_EU_ENABLED"];
});

afterEach(() => {
  setEnv("PERPLEXITY_EU_ENABLED", savedEnv["PERPLEXITY_EU_ENABLED"]);
  setEnv("OPENAI_EU_ENABLED", savedEnv["OPENAI_EU_ENABLED"]);
  setEnv("GEMINI_EU_ENABLED", savedEnv["GEMINI_EU_ENABLED"]);
});

// ---------------------------------------------------------------------------
// EU region — default blocked providers
// ---------------------------------------------------------------------------

describe("routeProvider — EU region defaults", () => {
  it("blocks Perplexity for EU by default", () => {
    expect(routeProvider("perplexity", "EU")).toBe(false);
  });

  it("blocks OpenAI for EU by default", () => {
    expect(routeProvider("openai", "EU")).toBe(false);
  });

  it("blocks Gemini for EU by default", () => {
    expect(routeProvider("gemini", "EU")).toBe(false);
  });

  it("allows Anthropic for EU always", () => {
    expect(routeProvider("anthropic", "EU")).toBe(true);
  });

  it("allows serp (DataForSEO) for EU always", () => {
    expect(routeProvider("serp", "EU")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// US region — all providers allowed
// ---------------------------------------------------------------------------

describe("routeProvider — US region allows all", () => {
  it("allows Perplexity for US", () => {
    expect(routeProvider("perplexity", "US")).toBe(true);
  });

  it("allows OpenAI for US", () => {
    expect(routeProvider("openai", "US")).toBe(true);
  });

  it("allows Gemini for US", () => {
    expect(routeProvider("gemini", "US")).toBe(true);
  });

  it("allows Anthropic for US", () => {
    expect(routeProvider("anthropic", "US")).toBe(true);
  });

  it("allows serp for US", () => {
    expect(routeProvider("serp", "US")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Feature flags — lift EU blocks when set to 'true'
// ---------------------------------------------------------------------------

describe("routeProvider — EU feature flags flip behavior", () => {
  it("allows Perplexity for EU when PERPLEXITY_EU_ENABLED=true", () => {
    process.env["PERPLEXITY_EU_ENABLED"] = "true";
    expect(routeProvider("perplexity", "EU")).toBe(true);
  });

  it("keeps Perplexity blocked for EU when PERPLEXITY_EU_ENABLED=false", () => {
    process.env["PERPLEXITY_EU_ENABLED"] = "false";
    expect(routeProvider("perplexity", "EU")).toBe(false);
  });

  it("keeps Perplexity blocked for EU when PERPLEXITY_EU_ENABLED is unset", () => {
    delete process.env["PERPLEXITY_EU_ENABLED"];
    expect(routeProvider("perplexity", "EU")).toBe(false);
  });

  it("allows OpenAI for EU when OPENAI_EU_ENABLED=true", () => {
    process.env["OPENAI_EU_ENABLED"] = "true";
    expect(routeProvider("openai", "EU")).toBe(true);
  });

  it("keeps OpenAI blocked for EU when OPENAI_EU_ENABLED=false", () => {
    process.env["OPENAI_EU_ENABLED"] = "false";
    expect(routeProvider("openai", "EU")).toBe(false);
  });

  it("allows Gemini for EU when GEMINI_EU_ENABLED=true", () => {
    process.env["GEMINI_EU_ENABLED"] = "true";
    expect(routeProvider("gemini", "EU")).toBe(true);
  });

  it("keeps Gemini blocked for EU when GEMINI_EU_ENABLED=false", () => {
    process.env["GEMINI_EU_ENABLED"] = "false";
    expect(routeProvider("gemini", "EU")).toBe(false);
  });

  it("flags are independent — enabling one does not affect others", () => {
    process.env["PERPLEXITY_EU_ENABLED"] = "true";
    // OpenAI and Gemini remain blocked
    expect(routeProvider("openai", "EU")).toBe(false);
    expect(routeProvider("gemini", "EU")).toBe(false);
    // Perplexity is now allowed
    expect(routeProvider("perplexity", "EU")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// permittedProviders() batch helper
// ---------------------------------------------------------------------------

describe("permittedProviders — batch filtering", () => {
  it("EU: returns only anthropic and serp from a full list", () => {
    const all = ["anthropic", "openai", "gemini", "perplexity", "serp"] as const;
    const permitted = permittedProviders("EU", [...all]);
    expect(permitted.sort()).toEqual(["anthropic", "serp"]);
  });

  it("US: returns all providers from a full list", () => {
    const all = ["anthropic", "openai", "gemini", "perplexity", "serp"] as const;
    const permitted = permittedProviders("US", [...all]);
    expect(permitted.sort()).toEqual(["anthropic", "gemini", "openai", "perplexity", "serp"]);
  });

  it("EU with flags: returns anthropic + serp + whichever flags are enabled", () => {
    process.env["PERPLEXITY_EU_ENABLED"] = "true";
    const all = ["anthropic", "openai", "gemini", "perplexity", "serp"] as const;
    const permitted = permittedProviders("EU", [...all]);
    expect(permitted.sort()).toEqual(["anthropic", "perplexity", "serp"]);
  });

  it("handles empty requested list", () => {
    const permitted = permittedProviders("EU", []);
    expect(permitted).toEqual([]);
  });

  it("handles single permitted provider", () => {
    const permitted = permittedProviders("EU", ["anthropic"]);
    expect(permitted).toEqual(["anthropic"]);
  });

  it("handles single blocked provider", () => {
    const permitted = permittedProviders("EU", ["perplexity"]);
    expect(permitted).toEqual([]);
  });
});
