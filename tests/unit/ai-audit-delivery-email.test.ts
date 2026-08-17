/**
 * AI Audit Stack delivery email — contract test.
 *
 * Founder rule (2026-08-15): the RESULT lives INSIDE the email (tool name,
 * one-liner, url, why picked, matched pains, honest limitation + withheld
 * count), the link to /ai-audit/:token is "see it on the site", the upsell is
 * OrganicPosts $1.5k (GEO + AI Audit) and, when the buyer never ran it, the
 * free GEO test. Also: the free-test result email now carries the $49 rung.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const sent: Array<Record<string, unknown>> = [];
vi.stubGlobal(
  "fetch",
  vi.fn(async (_url: string, init: { body: string }) => {
    sent.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ id: "test" }), { status: 200 });
  })
);

import {
  renderAiAuditDeliveryEmail,
  sendAiAuditDeliveryEmail,
  type AiAuditDeliveryEmailParams,
} from "../../packages/shared/src/emails/ai-audit-delivery";
import { sendFreeTestResultEmail } from "../../packages/shared/src/emails/free-test-result";
import { sendNurtureAiAudit1Email } from "../../packages/shared/src/emails/nurture-ai-audit-1";
import { sendNurtureAiAudit2Email } from "../../packages/shared/src/emails/nurture-ai-audit-2";

let savedEnv: Record<string, string | undefined>;
beforeEach(() => {
  sent.length = 0;
  savedEnv = { RESEND_API_KEY: process.env["RESEND_API_KEY"], EMAIL_FROM: process.env["EMAIL_FROM"], WEB_ORIGIN: process.env["WEB_ORIGIN"] };
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

const BASE: AiAuditDeliveryEmailParams = {
  to: "buyer@example.com",
  orderToken: "tok_abc123",
  businessType: "dental clinic",
  primaryFocus: "ops",
  pick: { name: "NexHealth", url: "https://nexhealth.example", oneLiner: "Fills your calendar and cuts no-shows.", monthlyCostUsd: 99, setupEffort: "medium", hoursSavedWeekly: 4 },
  reason: "Picked for your dental clinic work in ops. Most teams have not found this one yet.",
  matchedPains: ["No shows", "Appointment scheduling"],
  totalMatched: 7,
  withheldCount: 6,
  limitation: "Your $49 result shows one niche tool and the size of the full picture.",
  estimatesUnverified: true,
  hasFreeTest: false,
};

describe("AI Audit delivery email — the result is INSIDE the email", () => {
  it("renders the pick (name, one-liner, url, why, pains) and the honest limit + withheld count, in text AND html", () => {
    const { subject, text, html } = renderAiAuditDeliveryEmail(BASE);
    expect(subject).toContain("NexHealth");
    for (const body of [text, html]) {
      expect(body).toContain("NexHealth");
      expect(body).toContain("Fills your calendar and cuts no-shows.");
      expect(body).toContain("https://nexhealth.example");
      expect(body).toContain("Picked for your dental clinic work");
      expect(body).toContain("No shows");
      expect(body).toContain("Appointment scheduling");
      expect(body).toContain("We matched 7 tools");
      expect(body).toContain("The other 6 wait in the full audit");
      expect(body).toContain(BASE.limitation);
      expect(body).toContain("estimates");
      // "see it on the site" link
      expect(body).toContain("https://ozvor.com/ai-audit/tok_abc123");
      // upsell: OrganicPosts $1.5k bundle
      expect(body).toContain("https://ozvor.com/organicposts");
      expect(body).toContain("$1,500");
      expect(body).toContain("GEO");
    }
  });

  it("cross-sells the free GEO test ONLY when the buyer has not run it", () => {
    const without = renderAiAuditDeliveryEmail(BASE);
    expect(without.text).toContain("https://ozvor.com/test");
    expect(without.html).toContain("https://ozvor.com/test");
    const withTest = renderAiAuditDeliveryEmail({ ...BASE, hasFreeTest: true });
    expect(withTest.text).not.toContain("https://ozvor.com/test");
    expect(withTest.html).not.toContain("https://ozvor.com/test");
  });

  it("renders the honest empty state when nothing niche-fit matched (book a call)", () => {
    const { subject, text, html } = renderAiAuditDeliveryEmail({ ...BASE, pick: null, reason: "No niche tool clearly fits your answers yet.", totalMatched: 0, withheldCount: 0, matchedPains: [] });
    expect(subject).toBe("Your AI Audit Stack result");
    for (const body of [text, html]) {
      expect(body.toLowerCase()).toContain("no clear niche fit yet");
      expect(body).toContain("https://ozvor.com/book");
      expect(body).not.toContain("NexHealth");
    }
  });

  it("copy rules: no em-dash in the text body, first-person CTAs", () => {
    const { text, html } = renderAiAuditDeliveryEmail(BASE);
    expect(text).not.toContain("—");
    expect(html).not.toContain("—");
    expect(text).toContain("Get my full audit");
    expect(text).toContain("Run my free test");
  });

  it("escapes catalog-provided text in the HTML", () => {
    const { html } = renderAiAuditDeliveryEmail({ ...BASE, pick: { ...BASE.pick!, name: "<script>x</script>Tool" } });
    expect(html).not.toContain("<script>x</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("uses WEB_ORIGIN for the links (staging never points to prod)", () => {
    process.env["WEB_ORIGIN"] = "https://staging.ozvor.com";
    const { text } = renderAiAuditDeliveryEmail(BASE);
    expect(text).toContain("https://staging.ozvor.com/ai-audit/tok_abc123");
  });

  it("sends through Resend with only the recipient as PII, and throws (caller-catchable) without RESEND_API_KEY", async () => {
    await sendAiAuditDeliveryEmail(BASE);
    expect(sent).toHaveLength(1);
    const p = sent[0] as { to: string; from: string; subject: string; text: string; html: string };
    expect(p.to).toBe("buyer@example.com");
    expect(p.from).toBe("Ozvor <hello@ozvor.com>");
    expect(p.subject).toContain("NexHealth");
    delete process.env["RESEND_API_KEY"];
    await expect(sendAiAuditDeliveryEmail(BASE)).rejects.toThrow(/RESEND_API_KEY/);
  });
});

describe("free-test result email — the AI Audit $49 rung sits next to the Kit", () => {
  it("links /ai-audit ($49) AND still links the $29 Kit", async () => {
    await sendFreeTestResultEmail({
      to: "lead@example.com",
      brand: "Demo",
      score: { overall: 40, ai: 40, performance: 40, brand: 40 },
      verdict: "invisible",
      prompt: "best crm",
      engines: [{ engine: "openai", brandCited: false, competitorCited: true, live: true }],
      enginesLive: 1,
      recommendations: [],
      webOrigin: "https://ozvor.com",
    } as never);
    const p = sent[0] as { text: string; html: string };
    expect(p.text).toContain("AI Audit Stack ($49): https://ozvor.com/ai-audit");
    expect(p.text).toContain("Get-Cited Kit ($29): https://ozvor.com/kit");
    expect(p.html).toContain("https://ozvor.com/ai-audit");
    expect(p.html).toContain("$49 AI Audit Stack");
    expect(p.html).toContain("$29 Get-Cited Kit");
  });
});

describe("nurture ai_audit_to_full — the two steps", () => {
  const params = { to: "buyer@example.com", brand: "dental clinic", unsubscribeUrl: "https://ozvor.com/api/nurture/unsubscribe?token=t" };

  it("step 1 sells the OrganicPosts bundle with the buyer's own counts", async () => {
    await sendNurtureAiAudit1Email({ ...params, metadata: { pick: "NexHealth", totalMatched: 7 } });
    const p = sent[0] as { subject: string; text: string; html: string };
    expect(p.text).toContain("NexHealth");
    expect(p.text).toContain("We matched 7 tools");
    expect(p.text).toContain("https://ozvor.com/organicposts");
    expect(p.text).toContain(params.unsubscribeUrl);
    expect(p.text).not.toContain("—");
  });

  it("step 2 picks the free GEO test rung when hasFreeTest=false, book-a-call otherwise", async () => {
    await sendNurtureAiAudit2Email({ ...params, metadata: { hasFreeTest: false } });
    const a = sent[0] as { text: string };
    expect(a.text).toContain("Run my free test: https://ozvor.com/test");
    await sendNurtureAiAudit2Email({ ...params, metadata: { hasFreeTest: true } });
    const b = sent[1] as { text: string };
    expect(b.text).toContain("Book my free call: https://ozvor.com/book");
    expect(b.text).not.toContain("Run my free test");
    for (const x of [a, b]) expect(x.text).toContain(params.unsubscribeUrl);
  });
});
