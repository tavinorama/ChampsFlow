/**
 * Unit tests for fetchCheckoutUrl — the pure fetch helper extracted from
 * useDirectCheckout. Tests mock globalThis.fetch; no DOM or React required.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchCheckoutUrl } from "../../../apps/web/src/lib/use-direct-checkout";

describe("fetchCheckoutUrl", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns url on successful response", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ url: "https://checkout.stripe.com/c/pay/test" }),
    });
    const result = await fetchCheckoutUrl("growth", "year");
    expect(result).toEqual({ url: "https://checkout.stripe.com/c/pay/test" });
  });

  it("returns error on non-ok response", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      json: async () => ({ message: "Checkout is temporarily unavailable." }),
    });
    const result = await fetchCheckoutUrl("growth", "year");
    expect("error" in result && result.error).toContain("unavailable");
  });

  it("returns error when response ok but url missing", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ error: "CHECKOUT_UNAVAILABLE" }),
    });
    const result = await fetchCheckoutUrl("growth", "year");
    expect("error" in result).toBe(true);
  });

  it("returns error on network failure", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Network error"));
    // fetchCheckoutUrl does not catch — the hook does. Verify it propagates.
    await expect(fetchCheckoutUrl("growth", "year")).rejects.toThrow();
  });

  it("includes email in request body when provided", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ url: "https://checkout.stripe.com/c/pay/test" }),
    });
    await fetchCheckoutUrl("growth", "year", "test@example.com");
    const body = JSON.parse(
      (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body
    ) as Record<string, unknown>;
    expect(body.email).toBe("test@example.com");
  });

  it("omits email from request body when not provided", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ url: "https://checkout.stripe.com/c/pay/test" }),
    });
    await fetchCheckoutUrl("growth", "year");
    const body = JSON.parse(
      (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body
    ) as Record<string, unknown>;
    expect("email" in body).toBe(false);
  });

  it("sends correct plan and interval in request body", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ url: "https://checkout.stripe.com/c/pay/test" }),
    });
    await fetchCheckoutUrl("agency", "month");
    const body = JSON.parse(
      (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body
    ) as Record<string, unknown>;
    expect(body.plan).toBe("agency");
    expect(body.interval).toBe("month");
  });

  it("uses POST method with correct content-type header", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ url: "https://checkout.stripe.com/c/pay/test" }),
    });
    await fetchCheckoutUrl("growth", "year");
    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toBe("/api/checkout/direct");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json"
    );
  });

  it("falls back to default error message when response has no message", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      json: async () => ({}),
    });
    const result = await fetchCheckoutUrl("growth", "year");
    expect("error" in result && result.error).toContain(
      "Checkout is temporarily unavailable"
    );
  });
});
