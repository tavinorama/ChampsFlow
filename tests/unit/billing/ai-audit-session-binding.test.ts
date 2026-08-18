/**
 * ai-audit-session-binding.test.ts — the AI Audit Stack ($49) mirrors the Kit's
 * CRITICAL payment-bypass fix (#262/#263): the synchronous
 * /api/ai-audit/order/:token/deliver path lets the caller supply session_id, so
 * evaluateAiAuditSession must require the session's own metadata to name THIS
 * order + token + product, and the single line item to be the configured
 * price (missing price config → reject, fail-closed).
 */
import { describe, it, expect } from "vitest";
import {
  evaluateAiAuditSession,
  evaluateKitSession,
  type KitSessionShape,
} from "../../../apps/api/src/integrations/stripe";

const PRICE = "price_ai_audit_live_49";

function paidSessionFor(orderId: string, token: string): KitSessionShape {
  return {
    payment_status: "paid",
    mode: "payment",
    metadata: { product: "ai_audit_stack", ai_audit_order_id: orderId, order_token: token },
    line_items: { data: [{ price: { id: PRICE } }] },
  };
}

describe("evaluateAiAuditSession — session must be bound to the order", () => {
  const bindA = { orderId: "order-A", orderToken: "tok-A" };
  const bindB = { orderId: "order-B", orderToken: "tok-B" };

  it("accepts a paid session that names this exact order + token + price", () => {
    expect(evaluateAiAuditSession(paidSessionFor("order-A", "tok-A"), bindA, PRICE)).toEqual({ ok: true });
  });

  it("REJECTS replaying order A's paid session against order B", () => {
    expect(evaluateAiAuditSession(paidSessionFor("order-A", "tok-A"), bindB, PRICE)).toEqual({ ok: false, reason: "order_mismatch" });
  });

  it("rejects a token mismatch even when the order id matches", () => {
    expect(evaluateAiAuditSession(paidSessionFor("order-A", "someone-elses-token"), bindA, PRICE)).toEqual({ ok: false, reason: "token_mismatch" });
  });

  it("rejects an unpaid or non-payment-mode session", () => {
    expect(evaluateAiAuditSession({ ...paidSessionFor("order-A", "tok-A"), payment_status: "unpaid" }, bindA, PRICE))
      .toEqual({ ok: false, reason: "not_paid" });
    expect(evaluateAiAuditSession({ ...paidSessionFor("order-A", "tok-A"), mode: "subscription" }, bindA, PRICE))
      .toEqual({ ok: false, reason: "wrong_mode" });
  });

  it("rejects a paid KIT session (a different product) — and the Kit check rejects an AI Audit session", () => {
    const kitLike = paidSessionFor("order-A", "tok-A");
    kitLike.metadata = { product: "get_cited_kit", kit_order_id: "order-A", order_token: "tok-A" };
    expect(evaluateAiAuditSession(kitLike, bindA, PRICE)).toEqual({ ok: false, reason: "wrong_product" });
    expect(evaluateKitSession(paidSessionFor("order-A", "tok-A"), bindA, PRICE)).toEqual({ ok: false, reason: "wrong_product" });
  });

  it("rejects a cheap unrelated paid session whose line item is not the AI Audit price", () => {
    const s = paidSessionFor("order-A", "tok-A");
    s.line_items = { data: [{ price: { id: "price_something_cheap" } }] };
    expect(evaluateAiAuditSession(s, bindA, PRICE)).toEqual({ ok: false, reason: "price_mismatch" });
  });

  it("FAILS CLOSED when STRIPE_PRICE_ID_AI_AUDIT is not configured", () => {
    expect(evaluateAiAuditSession(paidSessionFor("order-A", "tok-A"), bindA, null)).toEqual({ ok: false, reason: "price_unconfigured" });
    expect(evaluateAiAuditSession(paidSessionFor("order-A", "tok-A"), bindA, undefined)).toEqual({ ok: false, reason: "price_unconfigured" });
  });

  it("rejects a session carrying two line items even if one is the right price", () => {
    const s = paidSessionFor("order-A", "tok-A");
    s.line_items = { data: [{ price: { id: PRICE } }, { price: { id: "price_extra" } }] };
    expect(evaluateAiAuditSession(s, bindA, PRICE)).toEqual({ ok: false, reason: "price_mismatch" });
  });
});
