/**
 * Unit tests for PagesBuyForm pure logic helpers (#208 PR-8, /local-pages).
 * No snapshot tests. Only pure functions tested here.
 */

import { describe, it, expect } from "vitest";
import { validatePagesBuyEmail } from "../../apps/web/src/app/(marketing)/local-pages/pages-buy-helpers";

describe("validatePagesBuyEmail", () => {
  it("accepts a simple valid email", () => {
    expect(validatePagesBuyEmail("user@example.com")).toBeNull();
  });

  it("accepts an email with a subdomain", () => {
    expect(validatePagesBuyEmail("user@mail.example.co.uk")).toBeNull();
  });

  it("accepts an email with a plus tag", () => {
    expect(validatePagesBuyEmail("user+tag@example.com")).toBeNull();
  });

  it("trims surrounding whitespace before validating", () => {
    expect(validatePagesBuyEmail("  user@example.com  ")).toBeNull();
  });

  it("rejects an empty string", () => {
    expect(validatePagesBuyEmail("")).toBe("Email is required.");
  });

  it("rejects a whitespace-only string", () => {
    expect(validatePagesBuyEmail("   ")).toBe("Email is required.");
  });

  it("rejects an email without @", () => {
    expect(validatePagesBuyEmail("notanemail.com")).toMatch(/valid email/i);
  });

  it("rejects an email without a domain", () => {
    expect(validatePagesBuyEmail("user@")).toMatch(/valid email/i);
  });

  it("rejects an email with a space", () => {
    expect(validatePagesBuyEmail("user @example.com")).toMatch(/valid email/i);
  });

  it("rejects an email without a TLD", () => {
    expect(validatePagesBuyEmail("user@example")).toMatch(/valid email/i);
  });
});
