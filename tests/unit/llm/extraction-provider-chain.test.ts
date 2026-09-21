/**
 * extraction-provider-chain.test.ts — the citation verifier has a chain.
 *
 * 21/09 06:00Z: the weekly audit failed with "Citation verification is
 * incomplete. No score was published." One verifier call is made per candidate
 * mention; a failed call returns UNVERIFIED, and a single unverified BRAND
 * mention makes the audit refuse to publish (correctly). The defect was that
 * the verifier only ever used ONE provider — OpenAI was reached when the
 * Anthropic KEY was absent, never when the Anthropic CALL failed.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  defaultExtractionLLM,
  ExtractionUnavailableError,
  ExtractionHttpError,
} from "../../../packages/llm/src/extraction";

const REQ = { system: "s", user: "u", maxTokens: 300 };
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response;
const fail = (status: number) => ({ ok: false, status, json: async () => ({}) }) as unknown as Response;
const anthropicBody = { content: [{ type: "text", text: "from-anthropic" }] };
const openaiBody = { choices: [{ message: { content: "from-openai" } }] };
const urlOf = (input: unknown) => String(input);

let realFetch: typeof globalThis.fetch;
beforeEach(() => {
  realFetch = globalThis.fetch;
  process.env["ANTHROPIC_API_KEY"] = "a-key";
  process.env["OPENAI_API_KEY"] = "o-key";
  vi.useFakeTimers({ shouldAdvanceTime: true });
});
afterEach(() => {
  globalThis.fetch = realFetch;
  vi.useRealTimers();
  delete process.env["ANTHROPIC_API_KEY"];
  delete process.env["OPENAI_API_KEY"];
});

describe("the verifier's provider chain", () => {
  it("anthropic answers: openai is never called", async () => {
    const calls: string[] = [];
    globalThis.fetch = vi.fn(async (input: unknown) => {
      calls.push(urlOf(input));
      return ok(anthropicBody);
    }) as unknown as typeof fetch;
    await expect(defaultExtractionLLM(REQ)).resolves.toBe("from-anthropic");
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("anthropic.com");
  });

  it("THE 21/09 CASE: anthropic rate-limits, openai answers — the mention is verified, not left pending", async () => {
    const calls: string[] = [];
    globalThis.fetch = vi.fn(async (input: unknown) => {
      const u = urlOf(input);
      calls.push(u);
      if (u.includes("anthropic.com")) return fail(429);
      return ok(openaiBody);
    }) as unknown as typeof fetch;
    await expect(defaultExtractionLLM(REQ)).resolves.toBe("from-openai");
    // one retry on anthropic (429 is retryable), then the chain moves on
    expect(calls.filter((u) => u.includes("anthropic.com"))).toHaveLength(2);
    expect(calls.filter((u) => u.includes("openai.com"))).toHaveLength(1);
  });

  it("a NON-retryable refusal (401) is not retried on that provider, but the chain still moves on", async () => {
    const calls: string[] = [];
    globalThis.fetch = vi.fn(async (input: unknown) => {
      const u = urlOf(input);
      calls.push(u);
      if (u.includes("anthropic.com")) return fail(401);
      return ok(openaiBody);
    }) as unknown as typeof fetch;
    await expect(defaultExtractionLLM(REQ)).resolves.toBe("from-openai");
    expect(calls.filter((u) => u.includes("anthropic.com"))).toHaveLength(1);
  });

  it("every provider refuses: the error NAMES each one, so the failure is diagnosable", async () => {
    globalThis.fetch = vi.fn(async (input: unknown) =>
      fail(urlOf(input).includes("anthropic.com") ? 429 : 500)
    ) as unknown as typeof fetch;
    await expect(defaultExtractionLLM(REQ)).rejects.toThrow(ExtractionUnavailableError);
    await expect(defaultExtractionLLM(REQ)).rejects.toThrow(/anthropic: anthropic HTTP 429/);
    await expect(defaultExtractionLLM(REQ)).rejects.toThrow(/openai: openai HTTP 500/);
  });

  it("no key at all is still the honest 'unavailable', never a fabricated verdict", async () => {
    delete process.env["ANTHROPIC_API_KEY"];
    delete process.env["OPENAI_API_KEY"];
    globalThis.fetch = vi.fn(async () => ok(anthropicBody)) as unknown as typeof fetch;
    await expect(defaultExtractionLLM(REQ)).rejects.toThrow(/no extraction model key present/);
  });

  it("ExtractionHttpError knows which statuses are worth another try", () => {
    expect(new ExtractionHttpError("anthropic", 429).retryable).toBe(true);
    expect(new ExtractionHttpError("anthropic", 529).retryable).toBe(true);
    expect(new ExtractionHttpError("openai", 400).retryable).toBe(false);
    expect(new ExtractionHttpError("openai", 401).retryable).toBe(false);
  });
});
