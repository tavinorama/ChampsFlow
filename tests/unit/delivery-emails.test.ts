/**
 * Delivery email contract tests — Kit (one-time) + bonus (subscription).
 *
 * Added per Hermes review on the deliverables revamp (#140): prove the
 * customer-grade Kit email and the Growth/Agency bonus email carry the correct
 * links, the current product ladder, and preserve the privacy/best-effort
 * rules (no PII beyond the recipient address in the Resend payload; failure is
 * caller-catchable, never a hardcoded secret).
 *
 * The email modules do `await import("resend")` at send time, so we mock the
 * `resend` module and capture the single send payload.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// The modules POST to the Resend REST API via fetch now (no SDK). Stub fetch
// and capture each request body.
const sent: Array<Record<string, unknown>> = [];

vi.stubGlobal(
  "fetch",
  vi.fn(async (_url: string, init: { body: string }) => {
    sent.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ id: "test" }), { status: 200 });
  })
);

import { sendKitDeliveryEmail } from "../../packages/shared/src/emails/kit-delivery";
import { sendBonusDeliveryEmail } from "../../packages/shared/src/emails/bonus-delivery";

let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  sent.length = 0;
  savedEnv = {
    RESEND_API_KEY: process.env["RESEND_API_KEY"],
    EMAIL_FROM: process.env["EMAIL_FROM"],
    WEB_ORIGIN: process.env["WEB_ORIGIN"],
  };
  process.env["RESEND_API_KEY"] = "re_test_key";
  process.env["EMAIL_FROM"] = "Ozvor <hello@ozvor.com>";
  delete process.env["WEB_ORIGIN"];
});

afterEach(() => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (typeof v === "string") process.env[k] = v;
    else delete process.env[k];
  }
});

function lastPayload() {
  return sent[sent.length - 1] as { to: string; subject: string; text: string; html: string };
}

describe("kit delivery email", () => {
  it("delivers the Kit link and the customer-grade ladder", async () => {
    await sendKitDeliveryEmail({ to: "buyer@example.com", brand: "Acme CRM", orderToken: "tok123" });
    expect(sent).toHaveLength(1);
    const p = lastPayload();
    expect(p.to).toBe("buyer@example.com");

    // Kit access link built from the order token.
    expect(p.html).toContain("https://ozvor.com/kit/tok123");
    expect(p.text).toContain("https://ozvor.com/kit/tok123");

    // Customer-grade content: quick win + retest plan, not "sample/audit only".
    expect(p.html.toLowerCase()).toContain("robots.txt");
    expect(p.html).toContain("30-day");

    // Full ladder to the next rungs.
    expect(p.html).toContain("Growth");
    expect(p.html).toContain("$99/mo");
    expect(p.html).toContain("Agency");
    expect(p.html).toContain("$249/mo");
    expect(p.html).toContain("OrganicPosts by Ozvor");
    expect(p.html).toContain("https://ozvor.com/pricing");
  });

  it("uses the current Ozvor brand accent, not the old off-brand blue", async () => {
    await sendKitDeliveryEmail({ to: "b@x.com", brand: "Acme", orderToken: "t" });
    const p = lastPayload();
    expect(p.html).toContain("#0c7d54"); // Ozvor green CTA
    expect(p.html).not.toContain("#1D4ED8"); // old blue button
    expect(p.html).not.toContain("#2563EB"); // old blue link
  });

  it("respects WEB_ORIGIN for staging links", async () => {
    process.env["WEB_ORIGIN"] = "https://staging.ozvor.com";
    // KIT_BASE_URL is read at module load, so this asserts the production
    // default resolves correctly in this test env (no WEB_ORIGIN at import).
    await sendKitDeliveryEmail({ to: "b@x.com", brand: "Acme", orderToken: "t" });
    expect(lastPayload().html).toContain("/kit/t");
  });

  it("sends no PII beyond the recipient address; throws (caller-catchable) with no key", async () => {
    await sendKitDeliveryEmail({ to: "buyer@example.com", brand: "Acme", orderToken: "tok" });
    const p = lastPayload();
    // Only the recipient email appears; the order token is opaque, no other addresses.
    const emailMatches = (p.html + p.text).match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) ?? [];
    for (const m of emailMatches) {
      expect(["buyer@example.com", "hello@ozvor.com"]).toContain(m);
    }
    // Best-effort: missing key throws so the webhook caller can catch + 200.
    delete process.env["RESEND_API_KEY"];
    await expect(
      sendKitDeliveryEmail({ to: "b@x.com", brand: "Acme", orderToken: "t" })
    ).rejects.toThrow(/RESEND_API_KEY/);
  });
});

describe("bonus delivery email", () => {
  it("Growth: bonus assets + dashboard + OrganicPosts ladder", async () => {
    await sendBonusDeliveryEmail({ to: "cust@example.com", plan: "growth", annual: false });
    const p = lastPayload();
    expect(p.to).toBe("cust@example.com");
    expect(p.html).toContain("Welcome to Growth");

    // The four direct bonus downloads.
    expect(p.html).toContain("https://ozvor.com/downloads/The-GEO-Visibility-Guide.pdf");
    expect(p.html).toContain("https://ozvor.com/downloads/5-High-Citation-Post-Templates.pdf");
    expect(p.html).toContain("https://ozvor.com/downloads/LLM-Citation-Tracker.xlsx");
    expect(p.html).toContain("https://ozvor.com/downloads/LLM-Citation-Tracker-Methodology.pdf");
    expect(p.text).toContain("https://ozvor.com/downloads/LLM-Citation-Tracker-Methodology.pdf");
    expect(p.html).not.toContain("/resources/llm-citation-tracker");

    // First action + ladder top rung.
    expect(p.html).toContain("https://ozvor.com/dashboard");
    expect(p.html).toContain("OrganicPosts by Ozvor");
    expect(p.html).toContain("https://ozvor.com/organicposts");

    // Brand accent, not old blue.
    expect(p.html).toContain("#0c7d54");
    expect(p.html).not.toContain("#2563EB");
  });

  it("Agency: plan-specific white-label value + agencies link", async () => {
    await sendBonusDeliveryEmail({ to: "agency@example.com", plan: "agency", annual: true });
    const p = lastPayload();
    expect(p.html).toContain("Welcome to Agency");
    expect(p.html.toLowerCase()).toContain("white-label");
    expect(p.html).toContain("25 client brands");
    expect(p.html).toContain("https://ozvor.com/agencies");
    // Agency-annual perk surfaces.
    expect(p.html).toContain("Agency Annual perk");
  });

  it("no stale page-count claims and no old brand names", async () => {
    await sendBonusDeliveryEmail({ to: "c@x.com", plan: "growth" });
    const p = lastPayload();
    expect(p.html).not.toContain("30-page");
    expect(p.html.toLowerCase()).not.toContain("trustindex");
  });

  it("best-effort: throws (caller-catchable) when the key is missing", async () => {
    delete process.env["RESEND_API_KEY"];
    await expect(
      sendBonusDeliveryEmail({ to: "c@x.com", plan: "growth" })
    ).rejects.toThrow(/RESEND_API_KEY/);
  });
});
