/**
 * Unit tests for the public Ozvor Pages LeadForm pure logic helpers
 * (issue #208, PR-6). No snapshot tests. Only pure functions tested here.
 */

import { describe, it, expect } from "vitest";
import {
  isValidLeadEmail,
  buildLeadPayload,
} from "../../apps/web/src/components/landing-public/lead-form-helpers";

describe("isValidLeadEmail", () => {
  it("accepts a simple valid email", () => {
    expect(isValidLeadEmail("user@example.com")).toBe(true);
  });

  it("accepts an email with a plus tag", () => {
    expect(isValidLeadEmail("user+tag@example.com")).toBe(true);
  });

  it("trims surrounding whitespace before validating", () => {
    expect(isValidLeadEmail("  user@example.com  ")).toBe(true);
  });

  it("rejects an empty string", () => {
    expect(isValidLeadEmail("")).toBe(false);
  });

  it("rejects an email without @", () => {
    expect(isValidLeadEmail("notanemail.com")).toBe(false);
  });

  it("rejects an email without a domain", () => {
    expect(isValidLeadEmail("user@")).toBe(false);
  });

  it("rejects an email with spaces", () => {
    expect(isValidLeadEmail("user @example.com")).toBe(false);
  });

  it("rejects an email over the RFC 5321 length cap", () => {
    const longEmail = `${"a".repeat(315)}@x.com`;
    expect(isValidLeadEmail(longEmail)).toBe(false);
  });
});

describe("buildLeadPayload", () => {
  it("builds a full payload with every field populated", () => {
    const payload = buildLeadPayload("Jane Doe", "jane@example.com", "555-0100", "Please call.", true);
    expect(payload).toEqual({
      name: "Jane Doe",
      email: "jane@example.com",
      phone: "555-0100",
      message: "Please call.",
      consent: true,
    });
  });

  it("omits blank optional fields (name/phone/message) after trimming", () => {
    const payload = buildLeadPayload("   ", "jane@example.com", "  ", "", true);
    expect(payload).toEqual({ email: "jane@example.com", consent: true });
    expect(payload).not.toHaveProperty("name");
    expect(payload).not.toHaveProperty("phone");
    expect(payload).not.toHaveProperty("message");
  });

  it("trims email and optional fields", () => {
    const payload = buildLeadPayload("  Jane  ", "  jane@example.com  ", "  555-0100  ", "  hi  ", true);
    expect(payload.email).toBe("jane@example.com");
    expect(payload.name).toBe("Jane");
    expect(payload.phone).toBe("555-0100");
    expect(payload.message).toBe("hi");
  });

  it("passes consent through as-is, including false", () => {
    const payload = buildLeadPayload("Jane", "jane@example.com", "", "", false);
    expect(payload.consent).toBe(false);
  });
});
