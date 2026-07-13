/**
 * Unit — retrieveCustomerEmail (deliverables-email fallback).
 *
 * The bonus/deliverables email was silently skipped when a completed checkout
 * session had no email on it (observed with a 100%-off subscription: both
 * session.customer_details.email and session.customer_email were null). The fix
 * falls back to the Stripe customer's email. This locks that fallback: resolve
 * from a customer id or object, tolerate deleted/absent, and never throw.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRetrieve = vi.fn();
vi.mock("stripe", () => {
  class StripeMock {
    customers = { retrieve: mockRetrieve };
    static errors = { StripeError: class StripeError extends Error {} };
  }
  return { default: StripeMock };
});

import { retrieveCustomerEmail } from "../../../apps/api/src/integrations/stripe";

describe("retrieveCustomerEmail", () => {
  beforeEach(() => {
    mockRetrieve.mockReset();
    process.env["STRIPE_SECRET_KEY"] = "sk_test_dummy";
    process.env["STRIPE_WEBHOOK_SECRET"] = "whsec_dummy";
  });

  it("resolves the email from a customer id", async () => {
    mockRetrieve.mockResolvedValue({ id: "cus_1", email: "a@b.co" });
    expect(await retrieveCustomerEmail("cus_1")).toBe("a@b.co");
    expect(mockRetrieve).toHaveBeenCalledWith("cus_1");
  });

  it("accepts a customer OBJECT (uses its id)", async () => {
    mockRetrieve.mockResolvedValue({ id: "cus_2", email: "c@d.co" });
    expect(await retrieveCustomerEmail({ id: "cus_2" })).toBe("c@d.co");
  });

  it("returns null for null/undefined/deleted customer, and never throws", async () => {
    expect(await retrieveCustomerEmail(null)).toBeNull();
    expect(await retrieveCustomerEmail(undefined)).toBeNull();
    mockRetrieve.mockResolvedValue({ id: "cus_3", deleted: true });
    expect(await retrieveCustomerEmail("cus_3")).toBeNull();
  });

  it("swallows Stripe errors → null (never breaks the webhook)", async () => {
    mockRetrieve.mockRejectedValue(new Error("stripe down"));
    await expect(retrieveCustomerEmail("cus_4")).resolves.toBeNull();
  });
});
