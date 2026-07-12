/**
 * kit-session-binding.test.ts — locks the CRITICAL payment-bypass fix (#262).
 *
 * The synchronous /kit/:token/deliver path lets the caller supply session_id.
 * The old check only asked Stripe "is this session paid?" — so a buyer could
 * replay ONE legitimately paid session against ANOTHER Kit order and unlock it
 * for free. evaluateKitSession now requires the session's own metadata (set at
 * creation) to name THIS order + token + product, plus the configured Kit price.
 */
import { describe, it, expect } from "vitest";
import { evaluateKitSession, type KitSessionShape } from "../../../apps/api/src/integrations/stripe";

const PRICE = "price_kit_live_123";

function paidSessionFor(orderId: string, token: string): KitSessionShape {
  return {
    payment_status: "paid",
    mode: "payment",
    metadata: { product: "get_cited_kit", kit_order_id: orderId, order_token: token },
    line_items: { data: [{ price: { id: PRICE } }] },
  };
}

describe("evaluateKitSession — session must be bound to the order", () => {
  const bindA = { orderId: "order-A", orderToken: "tok-A" };
  const bindB = { orderId: "order-B", orderToken: "tok-B" };

  it("accepts a paid session that names this exact order + token + price", () => {
    expect(evaluateKitSession(paidSessionFor("order-A", "tok-A"), bindA, PRICE)).toEqual({ ok: true });
  });

  it("REJECTS replaying order A's paid session against order B (the exploit)", () => {
    const sessionForA = paidSessionFor("order-A", "tok-A");
    expect(evaluateKitSession(sessionForA, bindB, PRICE)).toEqual({ ok: false, reason: "order_mismatch" });
  });

  it("rejects a token mismatch even when the order id matches", () => {
    const s = paidSessionFor("order-A", "someone-elses-token");
    expect(evaluateKitSession(s, bindA, PRICE)).toEqual({ ok: false, reason: "token_mismatch" });
  });

  it("rejects an unpaid or non-payment-mode session", () => {
    expect(evaluateKitSession({ ...paidSessionFor("order-A", "tok-A"), payment_status: "unpaid" }, bindA, PRICE))
      .toEqual({ ok: false, reason: "not_paid" });
    expect(evaluateKitSession({ ...paidSessionFor("order-A", "tok-A"), mode: "subscription" }, bindA, PRICE))
      .toEqual({ ok: false, reason: "wrong_mode" });
  });

  it("rejects a paid session for a DIFFERENT product (e.g. a subscription/pages checkout)", () => {
    const s = paidSessionFor("order-A", "tok-A");
    s.metadata = { ...s.metadata, product: "ozvor_pages_site" };
    expect(evaluateKitSession(s, bindA, PRICE)).toEqual({ ok: false, reason: "wrong_product" });
  });

  it("rejects a cheap unrelated paid session whose line item is not the Kit price", () => {
    const s = paidSessionFor("order-A", "tok-A");
    s.line_items = { data: [{ price: { id: "price_something_cheap" } }] };
    expect(evaluateKitSession(s, bindA, PRICE)).toEqual({ ok: false, reason: "price_mismatch" });
  });

  it("rejects missing/empty metadata", () => {
    expect(evaluateKitSession({ payment_status: "paid", mode: "payment", metadata: null }, bindA, PRICE))
      .toEqual({ ok: false, reason: "wrong_product" });
  });

  it("skips price binding only when no expected price is configured (still order-bound)", () => {
    const s = paidSessionFor("order-A", "tok-A");
    s.line_items = { data: [{ price: { id: "anything" } }] };
    expect(evaluateKitSession(s, bindA, undefined)).toEqual({ ok: true });
    // ...but the order binding still holds without a price.
    expect(evaluateKitSession(s, bindB, undefined)).toEqual({ ok: false, reason: "order_mismatch" });
  });
});
