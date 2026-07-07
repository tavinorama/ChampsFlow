/**
 * Audit probe model selection + DataForSEO depth — contract tests.
 *
 * Added per Hermes review on the audit-cost PR: asserts the env precedence
 * chain (AUDIT_<P>_MODEL → legacy <P>_MODEL → cheap default) for every probe
 * adapter, and that DataForSEO SERP/offsite payloads carry depth 10 (billed
 * per 10 results — default depth 100 paid 10x for discarded data).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { AnthropicProbeAdapter } from "../../../packages/llm/src/providers/anthropic";
import { OpenAIProbeAdapter } from "../../../packages/llm/src/providers/openai";
import { GeminiProbeAdapter } from "../../../packages/llm/src/providers/gemini";
import { PerplexityProbeAdapter } from "../../../packages/llm/src/providers/perplexity";
import { SerpProbeAdapter } from "../../../packages/llm/src/providers/serp";

const QUERY = { queryText: "best crm for smb", brandName: "Ozvor" } as never;

const ENV_KEYS = [
  "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY", "PERPLEXITY_API_KEY", "SERP_API_KEY",
  "AUDIT_ANTHROPIC_MODEL", "ANTHROPIC_MODEL",
  "AUDIT_OPENAI_MODEL", "OPENAI_MODEL",
  "AUDIT_GEMINI_MODEL", "GEMINI_MODEL",
  "AUDIT_PERPLEXITY_MODEL", "PERPLEXITY_MODEL",
];

let saved: Record<string, string | undefined>;
let captured: { url: string; body: unknown }[];

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  captured = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL, init?: { body?: string }) => {
      captured.push({ url: String(url), body: init?.body ? JSON.parse(init.body) : null });
      return new Response(
        JSON.stringify({
          // Superset shape accepted by all adapters' parsers.
          content: [{ type: "text", text: "Ozvor is a leading option." }],
          choices: [{ message: { content: "Ozvor is a leading option." } }],
          candidates: [{ content: { parts: [{ text: "Ozvor is a leading option." }] } }],
          citations: [],
          tasks: [{ result: [{ items: [] }] }],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const [k, v] of Object.entries(saved)) {
    if (typeof v === "string") process.env[k] = v;
    else delete process.env[k];
  }
});

function sentModel(): string {
  const body = captured[0]?.body as { model?: string } | null;
  return body?.model ?? "";
}

describe("audit probe model precedence", () => {
  it("anthropic: cheap default → legacy ANTHROPIC_MODEL → AUDIT_ANTHROPIC_MODEL wins", async () => {
    process.env["ANTHROPIC_API_KEY"] = "test-key";

    await new AnthropicProbeAdapter().probe(QUERY);
    expect(sentModel()).toBe("claude-haiku-4-5");

    captured = [];
    process.env["ANTHROPIC_MODEL"] = "claude-sonnet-4-6";
    await new AnthropicProbeAdapter().probe(QUERY);
    expect(sentModel()).toBe("claude-sonnet-4-6");

    captured = [];
    process.env["AUDIT_ANTHROPIC_MODEL"] = "claude-haiku-4-5";
    await new AnthropicProbeAdapter().probe(QUERY);
    expect(sentModel()).toBe("claude-haiku-4-5");
  });

  it("openai: cheap default → legacy OPENAI_MODEL → AUDIT_OPENAI_MODEL wins", async () => {
    process.env["OPENAI_API_KEY"] = "test-key";

    await new OpenAIProbeAdapter().probe(QUERY);
    expect(sentModel()).toBe("gpt-4o-mini");

    captured = [];
    process.env["OPENAI_MODEL"] = "gpt-4o";
    await new OpenAIProbeAdapter().probe(QUERY);
    expect(sentModel()).toBe("gpt-4o");

    captured = [];
    process.env["AUDIT_OPENAI_MODEL"] = "gpt-4o-mini";
    await new OpenAIProbeAdapter().probe(QUERY);
    expect(sentModel()).toBe("gpt-4o-mini");
  });

  it("gemini: cheap default (flash-lite) → GEMINI_MODEL → AUDIT_GEMINI_MODEL wins (model is in the URL)", async () => {
    process.env["GEMINI_API_KEY"] = "test-key";

    await new GeminiProbeAdapter().probe(QUERY);
    expect(captured[0]?.url).toContain("/models/gemini-2.5-flash-lite:");

    captured = [];
    process.env["GEMINI_MODEL"] = "gemini-2.5-flash";
    await new GeminiProbeAdapter().probe(QUERY);
    expect(captured[0]?.url).toContain("/models/gemini-2.5-flash:");

    captured = [];
    process.env["AUDIT_GEMINI_MODEL"] = "gemini-2.5-flash-lite";
    await new GeminiProbeAdapter().probe(QUERY);
    expect(captured[0]?.url).toContain("/models/gemini-2.5-flash-lite:");
  });

  it("perplexity: sonar default → PERPLEXITY_MODEL → AUDIT_PERPLEXITY_MODEL wins", async () => {
    process.env["PERPLEXITY_API_KEY"] = "test-key";

    await new PerplexityProbeAdapter().probe(QUERY);
    expect(sentModel()).toBe("sonar");

    captured = [];
    process.env["PERPLEXITY_MODEL"] = "sonar-pro";
    await new PerplexityProbeAdapter().probe(QUERY);
    expect(sentModel()).toBe("sonar-pro");

    captured = [];
    process.env["AUDIT_PERPLEXITY_MODEL"] = "sonar";
    await new PerplexityProbeAdapter().probe(QUERY);
    expect(sentModel()).toBe("sonar");
  });
});

describe("DataForSEO depth", () => {
  it("SERP probe sends depth 10 (billed per 10 results)", async () => {
    process.env["SERP_API_KEY"] = "dGVzdDp0ZXN0";
    await new SerpProbeAdapter().probe(QUERY);
    const body = captured[0]?.body as Array<{ depth?: number }>;
    expect(body?.[0]?.depth).toBe(10);
  });
});
