/**
 * Unit — cancelSubscriptionAtPeriodEnd (retention-flow backend).
 *
 * Cancels at period end (consumer-friendly: keeps paid access), forwards the
 * optional survey reason as Stripe cancellation_details, and returns a stable
 * shape across Stripe API versions (current_period_end on the subscription OR
 * on its first item). Never adds delay — this is called only when the user has
 * already reached "Confirm cancellation".
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockUpdate = vi.fn();
vi.mock("stripe", () => {
  class StripeMock {
    subscriptions = { update: mockUpdate };
    static errors = { StripeError: class StripeError extends Error {} };
  }
  return { default: StripeMock };
});

import { cancelSubscriptionAtPeriodEnd } from "../../../apps/api/src/integrations/stripe";

describe("cancelSubscriptionAtPeriodEnd", () => {
  beforeEach(() => {
    mockUpdate.mockReset();
    process.env["STRIPE_SECRET_KEY"] = "sk_test_dummy";
    process.env["STRIPE_WEBHOOK_SECRET"] = "whsec_dummy";
  });

  it("sets cancel_at_period_end and forwards feedback + comment", async () => {
    mockUpdate.mockResolvedValue({ cancel_at_period_end: true, current_period_end: 1790000000 });
    const r = await cancelSubscriptionAtPeriodEnd("sub_123", "too_expensive", "  bit pricey  ");
    const [id, params] = mockUpdate.mock.calls[0]!;
    expect(id).toBe("sub_123");
    expect(params.cancel_at_period_end).toBe(true);
    expect(params.cancellation_details).toEqual({ feedback: "too_expensive", comment: "bit pricey" });
    expect(r).toEqual({ cancel_at_period_end: true, current_period_end: 1790000000 });
  });

  it("omits cancellation_details entirely when no reason is given", async () => {
    mockUpdate.mockResolvedValue({ cancel_at_period_end: true, current_period_end: 1 });
    await cancelSubscriptionAtPeriodEnd("sub_123");
    const [, params] = mockUpdate.mock.calls[0]!;
    expect(params.cancellation_details).toBeUndefined();
  });

  it("reads current_period_end off the subscription item when absent on the sub", async () => {
    mockUpdate.mockResolvedValue({
      cancel_at_period_end: true,
      items: { data: [{ current_period_end: 1795000000 }] },
    });
    const r = await cancelSubscriptionAtPeriodEnd("sub_123");
    expect(r.current_period_end).toBe(1795000000);
  });

  it("wraps Stripe errors with a stable code", async () => {
    const StripeMod = (await import("stripe")).default as unknown as {
      errors: { StripeError: new (m: string) => Error };
    };
    const e = new StripeMod.errors.StripeError("boom") as Error & { type?: string };
    e.type = "api_error";
    mockUpdate.mockRejectedValue(e);
    await expect(cancelSubscriptionAtPeriodEnd("sub_123")).rejects.toMatchObject({
      code: "stripe_api_error",
    });
  });
});
