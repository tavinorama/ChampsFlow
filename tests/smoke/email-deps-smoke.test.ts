/**
 * Regression guard for the 2026-07-08 production email outage.
 *
 * Transactional emails were sent via the `resend` SDK, which transitively
 * imports `@react-email/render` → `react-dom` at send time. `react-dom` was not
 * present in the API's production Docker image, so EVERY email threw
 * "Cannot find package 'react-dom'" — while the SDK-mocking unit tests stayed
 * green. The fix replaced the SDK with a dependency-free Resend REST call
 * (`sendResendEmail`). This test locks that in: it must POST to the Resend REST
 * endpoint (no SDK, no react-dom), surface the API error on failure, and refuse
 * to send without a key.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { sendResendEmail } from "../../packages/shared/src/emails/resend-send";

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env["RESEND_API_KEY"];
});

describe("Resend REST send (no SDK / no react-dom)", () => {
  it("POSTs to the Resend REST API and returns the message id", async () => {
    process.env["RESEND_API_KEY"] = "re_test";
    let calledUrl = "";
    let authHeader = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: { headers: Record<string, string> }) => {
        calledUrl = String(url);
        authHeader = init.headers["Authorization"];
        return new Response(JSON.stringify({ id: "msg_123" }), { status: 200 });
      })
    );
    const res = await sendResendEmail({
      from: "Ozvor <hello@ozvor.com>",
      to: "b@x.com",
      subject: "s",
      html: "<p>h</p>",
      text: "t",
    });
    expect(calledUrl).toBe("https://api.resend.com/emails");
    expect(authHeader).toBe("Bearer re_test");
    expect(res.id).toBe("msg_123");
  });

  it("throws with the Resend error body on a non-2xx response (e.g. domain not verified)", async () => {
    process.env["RESEND_API_KEY"] = "re_test";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("The ozvor.com domain is not verified", { status: 403 }))
    );
    await expect(
      sendResendEmail({ from: "x", to: "b@x.com", subject: "s", html: "h", text: "t" })
    ).rejects.toThrow(/Resend API 403/);
  });

  it("refuses to send without RESEND_API_KEY", async () => {
    await expect(
      sendResendEmail({ from: "x", to: "b@x.com", subject: "s", html: "h", text: "t" })
    ).rejects.toThrow(/RESEND_API_KEY/);
  });
});
