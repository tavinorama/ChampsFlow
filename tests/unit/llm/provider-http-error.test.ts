/**
 * provider-http-error.test.ts — a status code is not a reason (T0.2, 15/09).
 *
 * From 10/09 to 15/09 the anthropic adapter threw `anthropic HTTP 400` seven
 * times a day and the drift battery recorded "this engine measured nothing
 * today". Every one of those responses carried a body naming the cause; we
 * threw it away. These tests hold:
 *   1. the provider's `error.type` + `error.message` travel in the
 *      ProviderError message, capped and whitespace-collapsed;
 *   2. anything key-shaped is redacted before it can reach a log line, a
 *      verdict or a Telegram alert;
 *   3. classification is unchanged: 4xx permanent, 429/5xx retryable;
 *   4. the real adapter (fetch stubbed) surfaces the reason end to end;
 *   5. no adapter throws a bare `HTTP ${status}` any more.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  providerHttpError,
  redactProviderSecrets,
  ProviderError,
} from "../../../packages/llm/src/providers/types";
import { AnthropicProbeAdapter } from "../../../packages/llm/src/providers/anthropic";

const root = join(__dirname, "../../..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

function res(status: number, body: unknown, json = true): Response {
  return new Response(json ? JSON.stringify(body) : String(body), {
    status,
    headers: { "content-type": json ? "application/json" : "text/plain" },
  });
}

describe("providerHttpError keeps the provider's reason", () => {
  it("renders type and message from an Anthropic-shaped error body", async () => {
    const err = await providerHttpError(
      "anthropic",
      res(400, { type: "error", error: { type: "invalid_request_error", message: "web search is not enabled for this organization" }, request_id: "req_011abc" })
    );
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.kind).toBe("permanent");
    expect(err.statusCode).toBe(400);
    expect(err.message).toBe(
      "anthropic HTTP 400 — invalid_request_error: web search is not enabled for this organization"
    );
  });

  it("falls back to a top-level message, then to raw text, then to the bare status", async () => {
    expect((await providerHttpError("openai", res(400, { message: "model not found" }))).message).toBe(
      "openai HTTP 400 — model not found"
    );
    expect((await providerHttpError("gemini", res(503, "upstream   unavailable\n\nretry later", false))).message).toBe(
      "gemini HTTP 503 — upstream unavailable retry later"
    );
    expect((await providerHttpError("perplexity", res(502, "", false))).message).toBe("perplexity HTTP 502");
  });

  it("caps the detail at 200 characters", async () => {
    const long = "x".repeat(1000);
    const err = await providerHttpError("anthropic", res(400, { error: { type: "invalid_request_error", message: long } }));
    expect(err.message.length).toBeLessThanOrEqual("anthropic HTTP 400 — ".length + 200);
  });

  it("keeps the retryable/permanent split exactly as before", async () => {
    expect((await providerHttpError("anthropic", res(429, {}))).kind).toBe("retryable");
    expect((await providerHttpError("anthropic", res(500, {}))).kind).toBe("retryable");
    expect((await providerHttpError("anthropic", res(529, {}))).kind).toBe("retryable");
    expect((await providerHttpError("anthropic", res(401, {}))).kind).toBe("permanent");
    expect((await providerHttpError("anthropic", res(403, {}))).kind).toBe("permanent");
  });
});

describe("nothing key-shaped survives", () => {
  it("redacts provider keys, bearer tokens and request ids", () => {
    const out = redactProviderSecrets(
      "bad key sk-ant-api03-AbCdEf_123 and sk-proj-ZZZZZZZZZZ and AIzaSyD-1234567890abc and pplx-abc123 Bearer eyJhbGci.xxx req_011CSHoEeqs5C35K2UUqR7Fy"
    );
    expect(out).not.toMatch(/sk-ant-/);
    expect(out).not.toMatch(/sk-proj-/);
    expect(out).not.toMatch(/AIzaSy/);
    expect(out).not.toMatch(/pplx-abc/);
    expect(out).not.toMatch(/eyJhbGci/);
    expect(out).not.toMatch(/req_011/);
    expect(out).toContain("[redacted-key]");
    expect(out).toContain("Bearer [redacted]");
    expect(out).toContain("[request-id]");
  });

  it("is applied inside providerHttpError", async () => {
    const err = await providerHttpError(
      "anthropic",
      res(401, { error: { type: "authentication_error", message: "invalid x-api-key: sk-ant-api03-SECRET" }, request_id: "req_zzz" })
    );
    expect(err.message).toContain("authentication_error");
    expect(err.message).not.toContain("SECRET");
    expect(err.message).not.toContain("req_zzz");
  });
});

describe("the anthropic adapter surfaces the reason end to end", () => {
  const saved: Record<string, string | undefined> = {};
  const KEYS = ["ANTHROPIC_API_KEY", "AUDIT_ANTHROPIC_MODEL", "ANTHROPIC_MODEL", "GEO_WEB_SEARCH"];
  beforeEach(() => {
    for (const k of KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
    process.env["ANTHROPIC_API_KEY"] = "test-key-not-real";
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("a 400 with a body becomes a permanent ProviderError that names the cause", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        res(400, { type: "error", error: { type: "invalid_request_error", message: "Your organization has reached its spend limit." } })
      )
    );
    const adapter = new AnthropicProbeAdapter();
    const err = await adapter
      .probe({ queryHash: "h", queryText: "best crm for smb", brandName: "Ozvor" })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect((err as ProviderError).kind).toBe("permanent");
    expect((err as ProviderError).message).toBe(
      "anthropic HTTP 400 — invalid_request_error: Your organization has reached its spend limit."
    );
  });
});

describe("no adapter throws a bare status code any more", () => {
  for (const name of ["anthropic", "openai", "gemini", "perplexity"]) {
    it(`${name}.ts goes through providerHttpError`, () => {
      const src = read(`packages/llm/src/providers/${name}.ts`);
      expect(src).toContain(`throw await providerHttpError("${name}", res)`);
      expect(src).not.toMatch(new RegExp("`" + name + " HTTP \\$\\{res\\.status\\}`"));
    });
  }

  it("the gateway log line has room for the reason", () => {
    const gateway = read("packages/llm/src/providers/gateway.ts");
    expect(gateway).toContain("err.message.slice(0, 240)");
  });
});
