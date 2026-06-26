/**
 * free-test-email.test.ts — sendFreeTestResultEmail
 *
 * Tests that the email module throws when RESEND_API_KEY is absent,
 * and calls resend.emails.send with the correct parameters when it is present.
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

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("throws when RESEND_API_KEY is not set", async () => {
    delete process.env["RESEND_API_KEY"];

    const { sendFreeTestResultEmail } = await import(
      "../../../packages/shared/src/emails/free-test-result"
    );

    await expect(sendFreeTestResultEmail(SAMPLE_PARAMS)).rejects.toThrow(
      /RESEND_API_KEY/
    );
  });

  it("calls resend.emails.send with correct to, from (EMAIL_FROM), and subject containing the brand", async () => {
    process.env["RESEND_API_KEY"] = "re_test_key_123";
    process.env["EMAIL_FROM"] = "TrustIndex AI <hello@trustindexai.com>";

    // Capture what gets passed to resend.emails.send
    const sendMock = vi.fn().mockResolvedValue({ id: "email_test_id" });

    // Mock 'resend' module — Resend must be a constructor (class-like function)
    vi.doMock("resend", () => {
      function ResendCtor(_apiKey: string) {
        return { emails: { send: sendMock } };
      }
      return { Resend: ResendCtor };
    });

    const { sendFreeTestResultEmail } = await import(
      "../../../packages/shared/src/emails/free-test-result"
    );

    await sendFreeTestResultEmail(SAMPLE_PARAMS);

    expect(sendMock).toHaveBeenCalledOnce();
    const call = sendMock.mock.calls[0]?.[0] as {
      from: string;
      to: string;
      subject: string;
      text: string;
      html: string;
    };

    expect(call.to).toBe("test@example.com");
    expect(call.from).toBe("TrustIndex AI <hello@trustindexai.com>");
    expect(call.subject).toContain("Acme Corp");
    expect(typeof call.text).toBe("string");
    expect(call.text.length).toBeGreaterThan(0);
    expect(typeof call.html).toBe("string");
    expect(call.html.length).toBeGreaterThan(0);
  });

  it("falls back to default EMAIL_FROM when env var is not set", async () => {
    process.env["RESEND_API_KEY"] = "re_test_key_456";
    delete process.env["EMAIL_FROM"];

    const sendMock = vi.fn().mockResolvedValue({ id: "email_test_id_2" });

    vi.doMock("resend", () => {
      function ResendCtor(_apiKey: string) {
        return { emails: { send: sendMock } };
      }
      return { Resend: ResendCtor };
    });

    const { sendFreeTestResultEmail } = await import(
      "../../../packages/shared/src/emails/free-test-result"
    );

    await sendFreeTestResultEmail(SAMPLE_PARAMS);

    expect(sendMock).toHaveBeenCalledOnce();
    const call = sendMock.mock.calls[0]?.[0] as { from: string };
    expect(call.from).toContain("ozvor.com");
  });

  it("includes the prompt text in the HTML body for transparency", async () => {
    process.env["RESEND_API_KEY"] = "re_test_key_789";

    const sendMock = vi.fn().mockResolvedValue({ id: "email_test_id_3" });

    vi.doMock("resend", () => {
      function ResendCtor(_apiKey: string) {
        return { emails: { send: sendMock } };
      }
      return { Resend: ResendCtor };
    });

    const { sendFreeTestResultEmail } = await import(
      "../../../packages/shared/src/emails/free-test-result"
    );

    await sendFreeTestResultEmail(SAMPLE_PARAMS);

    const call = sendMock.mock.calls[0]?.[0] as { html: string; text: string };
    expect(call.html).toContain(SAMPLE_PARAMS.prompt);
    expect(call.text).toContain(SAMPLE_PARAMS.prompt);
  });

  it("includes all scores in the HTML body", async () => {
    process.env["RESEND_API_KEY"] = "re_test_key_scores";

    const sendMock = vi.fn().mockResolvedValue({ id: "email_test_id_4" });

    vi.doMock("resend", () => {
      function ResendCtor(_apiKey: string) {
        return { emails: { send: sendMock } };
      }
      return { Resend: ResendCtor };
    });

    const { sendFreeTestResultEmail } = await import(
      "../../../packages/shared/src/emails/free-test-result"
    );

    await sendFreeTestResultEmail(SAMPLE_PARAMS);

    const call = sendMock.mock.calls[0]?.[0] as { html: string };
    // scores: ai=45, performance=50, brand=40, overall=45
    expect(call.html).toContain("45"); // ai and overall
    expect(call.html).toContain("50"); // performance
    expect(call.html).toContain("40"); // brand
  });
});
