/**
 * Ozvor Pages public API unit tests (#208 PR-6) — pure/exported helpers from
 * apps/api/src/routes/landing-public.ts.
 *
 * Covers:
 *  - publicSiteNotFoundBody: the no-oracle 404 contract (missing/draft/
 *    suspended/page-missing/page-draft must ALL render an identical body).
 *  - validateLeadBody: email format, consent === true, length caps.
 *  - validateEventBody: allowed event_type vocabulary, page_slug normalization.
 */

import { describe, it, expect } from "vitest";
import {
  publicSiteNotFoundBody,
  validateLeadBody,
  validateEventBody,
  type PublicNotFoundReason,
} from "../../apps/api/src/routes/landing-public";

describe("publicSiteNotFoundBody — no-oracle 404 contract", () => {
  const reasons: PublicNotFoundReason[] = [
    "site_missing",
    "site_draft",
    "site_suspended",
    "page_missing",
    "page_draft",
  ];

  it("returns an IDENTICAL body regardless of the underlying reason", () => {
    const bodies = reasons.map((r) => publicSiteNotFoundBody(r));
    for (const b of bodies) {
      expect(b).toEqual(bodies[0]);
    }
  });

  it("body shape carries no distinguishing detail (message/code only)", () => {
    const b = publicSiteNotFoundBody("site_suspended");
    expect(Object.keys(b).sort()).toEqual(["code", "message"]);
  });

  it("message never mentions 'suspend', 'draft', or 'exist' (would leak the reason)", () => {
    for (const r of reasons) {
      const b = publicSiteNotFoundBody(r);
      const lower = b.message.toLowerCase();
      expect(lower).not.toContain("suspend");
      expect(lower).not.toContain("draft");
      expect(lower).not.toContain("exist");
    }
  });

  it("code is the generic NOT_FOUND for every reason", () => {
    for (const r of reasons) {
      expect(publicSiteNotFoundBody(r).code).toBe("NOT_FOUND");
    }
  });
});

describe("validateLeadBody — lead capture boundary validation", () => {
  it("accepts a complete, valid submission", () => {
    const result = validateLeadBody({
      name: "Jane Doe",
      email: "jane@example.com",
      phone: "555-0100",
      message: "Please call me back.",
      consent: true,
    });
    expect(result).toEqual({
      name: "Jane Doe",
      email: "jane@example.com",
      phone: "555-0100",
      message: "Please call me back.",
    });
  });

  it("accepts a minimal submission (email + consent only)", () => {
    const result = validateLeadBody({ email: "jane@example.com", consent: true });
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.name).toBe("");
      expect(result.phone).toBe("");
      expect(result.message).toBe("");
    }
  });

  it("rejects a missing email", () => {
    const result = validateLeadBody({ consent: true });
    expect(result).toEqual({ error: "Email is required." });
  });

  it("rejects a malformed email", () => {
    const result = validateLeadBody({ email: "not-an-email", consent: true });
    expect(result).toEqual({ error: "Invalid email." });
  });

  it("rejects an email over the RFC 5321 length cap", () => {
    const longEmail = `${"a".repeat(315)}@x.com`; // > 320 chars
    const result = validateLeadBody({ email: longEmail, consent: true });
    expect(result).toEqual({ error: "Invalid email." });
  });

  it("rejects consent = false (LGPD Art. 7(I) / GDPR Art. 6(1)(a))", () => {
    const result = validateLeadBody({ email: "jane@example.com", consent: false });
    expect("error" in result).toBe(true);
  });

  it("rejects a missing consent field", () => {
    const result = validateLeadBody({ email: "jane@example.com" });
    expect("error" in result).toBe(true);
  });

  it("rejects a truthy-but-not-boolean-true consent value (no type coercion)", () => {
    const result = validateLeadBody({
      email: "jane@example.com",
      consent: "true" as unknown as boolean,
    });
    expect("error" in result).toBe(true);
  });

  it("truncates name/phone/message to their max lengths instead of rejecting", () => {
    const result = validateLeadBody({
      email: "jane@example.com",
      consent: true,
      name: "N".repeat(500),
      phone: "5".repeat(100),
      message: "M".repeat(10_000),
    });
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.name.length).toBe(200);
      expect(result.phone.length).toBe(40);
      expect(result.message.length).toBe(5000);
    }
  });

  it("trims whitespace on every field", () => {
    const result = validateLeadBody({
      email: "  jane@example.com  ",
      consent: true,
      name: "  Jane  ",
      phone: "  555-0100  ",
      message: "  hello  ",
    });
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.email).toBe("jane@example.com");
      expect(result.name).toBe("Jane");
      expect(result.phone).toBe("555-0100");
      expect(result.message).toBe("hello");
    }
  });

  it("ignores non-string name/phone/message values instead of throwing", () => {
    const result = validateLeadBody({
      email: "jane@example.com",
      consent: true,
      name: 12345 as unknown as string,
      phone: {} as unknown as string,
      message: [] as unknown as string,
    });
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.name).toBe("");
      expect(result.phone).toBe("");
      expect(result.message).toBe("");
    }
  });
});

describe("validateEventBody — beacon boundary validation", () => {
  it("accepts page_view", () => {
    const result = validateEventBody({ event_type: "page_view" });
    expect(result).toEqual({ eventType: "page_view", pageSlug: null });
  });

  it("accepts cta_click with a page_slug", () => {
    const result = validateEventBody({ event_type: "cta_click", page_slug: "contact" });
    expect(result).toEqual({ eventType: "cta_click", pageSlug: "contact" });
  });

  it("rejects form_submit — that event_type is written only by the lead route", () => {
    const result = validateEventBody({ event_type: "form_submit" });
    expect("error" in result).toBe(true);
  });

  it("rejects an unknown event_type", () => {
    const result = validateEventBody({ event_type: "made_up_event" });
    expect("error" in result).toBe(true);
  });

  it("rejects a missing event_type", () => {
    const result = validateEventBody({});
    expect("error" in result).toBe(true);
  });

  it("normalizes a blank/whitespace-only page_slug to null", () => {
    const result = validateEventBody({ event_type: "page_view", page_slug: "   " });
    expect(result).toEqual({ eventType: "page_view", pageSlug: null });
  });

  it("truncates an overlong page_slug instead of rejecting", () => {
    const result = validateEventBody({ event_type: "page_view", page_slug: "s".repeat(200) });
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.pageSlug?.length).toBe(80);
    }
  });

  it("ignores a non-string page_slug", () => {
    const result = validateEventBody({ event_type: "page_view", page_slug: 42 as unknown as string });
    expect(result).toEqual({ eventType: "page_view", pageSlug: null });
  });
});
