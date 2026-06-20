/**
 * Unit tests for WaitlistForm pure logic helpers.
 * No snapshot tests. Only pure functions tested here.
 */

import { describe, it, expect } from "vitest";
import { isValidEmail, buildPayload } from "./waitlist-helpers";

describe("isValidEmail", () => {
  it("accepts a simple valid email", () => {
    expect(isValidEmail("user@example.com")).toBe(true);
  });

  it("accepts email with subdomain", () => {
    expect(isValidEmail("user@mail.example.co.uk")).toBe(true);
  });

  it("accepts email with plus sign", () => {
    expect(isValidEmail("user+tag@example.com")).toBe(true);
  });

  it("rejects empty string", () => {
    expect(isValidEmail("")).toBe(false);
  });

  it("rejects email without @", () => {
    expect(isValidEmail("notanemail.com")).toBe(false);
  });

  it("rejects email without domain", () => {
    expect(isValidEmail("user@")).toBe(false);
  });

  it("rejects email with spaces", () => {
    expect(isValidEmail("user @example.com")).toBe(false);
  });

  it("trims surrounding whitespace before validating", () => {
    expect(isValidEmail("  user@example.com  ")).toBe(true);
  });
});

describe("buildPayload", () => {
  it("builds minimal payload with only required fields", () => {
    const result = buildPayload("user@example.com", "", "", false);
    expect(result).toEqual({ email: "user@example.com", opted_in: false });
    expect(result).not.toHaveProperty("name");
    expect(result).not.toHaveProperty("team_size");
  });

  it("includes name when provided", () => {
    const result = buildPayload("user@example.com", "Alice", "", true);
    expect(result.name).toBe("Alice");
  });

  it("trims name whitespace", () => {
    const result = buildPayload("user@example.com", "  Bob  ", "", false);
    expect(result.name).toBe("Bob");
  });

  it("omits name when blank", () => {
    const result = buildPayload("user@example.com", "   ", "", false);
    expect(result).not.toHaveProperty("name");
  });

  it("includes team_size when provided", () => {
    const result = buildPayload("user@example.com", "", "2_10", false);
    expect(result.team_size).toBe("2_10");
  });

  it("omits team_size when empty string", () => {
    const result = buildPayload("user@example.com", "", "", false);
    expect(result).not.toHaveProperty("team_size");
  });

  it("trims email", () => {
    const result = buildPayload("  user@example.com  ", "", "", false);
    expect(result.email).toBe("user@example.com");
  });

  it("preserves opted_in=true", () => {
    const result = buildPayload("user@example.com", "", "", true);
    expect(result.opted_in).toBe(true);
  });
});
