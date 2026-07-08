/**
 * free-test-email.test.ts — sendFreeTestResultEmail
 *
 * Tests that the email module throws when RESEND_API_KEY is absent, and POSTs
 * the correct payload to the Resend REST API when it is present. (The modules
 * send via `fetch` now, not the `resend` SDK — see resend-send.ts.)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const SAMPLE_PARAMS = {
  to: "test@example.com",
  brand: "Acme Corp",
  score: { ai: 45, performance: 50, brand: 40, overall: 45 },
  verdict: "Acme Corp is cited on 2 of 4 engines.",
  prompt: "What is the best CRM for small businesses?",
  engines: [
    { engine: "anthropic", brandCited: true, competitorCited: false, live: false },
    { engine: "openai", brandCited: false, competitorCited: false, live: false },
  ],
  enginesLive: 0,
  recommendations: [
    { plan: "kit", reason: "Get cited fast.", href: "/kit" },
    { plan: "call", reason: "Sprint call.", href: "/book" },
  ],
  webOrigin: "https://trustindexai.com",
};

describe("sendFreeTestResultEmail", () => {
  const originalEnv = process.env;
  let lastBody: Record<string, string> | null;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
    lastBody = null;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: { body: string }) => {
        lastBody = JSON.parse(init.body);
        return new Response(JSON.stringify({ id: "email_test_id" }), { status: 200 });
      })
    );
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function importSend() {
    const mod = await import("../../../packages/shared/src/emails/free-test-result");
    return mod.sendFreeTestResultEmail;
  }

  it("throws when RESEND_API_KEY is not set", async () => {
    delete process.env["RESEND_API_KEY"];
    const send = await importSend();
    await expect(send(SAMPLE_PARAMS)).rejects.toThrow(/RESEND_API_KEY/);
  });

  it("posts with correct to, from (EMAIL_FROM), and subject containing the brand", async () => {
    process.env["RESEND_API_KEY"] = "re_test_key_123";
    process.env["EMAIL_FROM"] = "Ozvor <hello@ozvor.com>";
    const send = await importSend();
    await send(SAMPLE_PARAMS);

    expect(lastBody).not.toBeNull();
    const call = lastBody as unknown as { from: string; to: string; subject: string; text: string; html: string };
    expect(call.to).toBe("test@example.com");
    expect(call.from).toBe("Ozvor <hello@ozvor.com>");
    expect(call.subject).toContain("Acme Corp");
    expect(typeof call.text).toBe("string");
    expect(call.text.length).toBeGreaterThan(0);
    expect(typeof call.html).toBe("string");
    expect(call.html.length).toBeGreaterThan(0);
  });

  it("falls back to default EMAIL_FROM when env var is not set", async () => {
    process.env["RESEND_API_KEY"] = "re_test_key_456";
    delete process.env["EMAIL_FROM"];
    const send = await importSend();
    await send(SAMPLE_PARAMS);
    expect((lastBody as unknown as { from: string }).from).toContain("ozvor.com");
  });

  it("includes the prompt text in the HTML body for transparency", async () => {
    process.env["RESEND_API_KEY"] = "re_test_key_789";
    const send = await importSend();
    await send(SAMPLE_PARAMS);
    const call = lastBody as unknown as { html: string; text: string };
    expect(call.html).toContain(SAMPLE_PARAMS.prompt);
    expect(call.text).toContain(SAMPLE_PARAMS.prompt);
  });

  it("includes all scores in the HTML body", async () => {
    process.env["RESEND_API_KEY"] = "re_test_key_scores";
    const send = await importSend();
    await send(SAMPLE_PARAMS);
    const call = lastBody as unknown as { html: string };
    // scores: ai=45, performance=50, brand=40, overall=45
    expect(call.html).toContain("45"); // ai and overall
    expect(call.html).toContain("50"); // performance
    expect(call.html).toContain("40"); // brand
  });
});
