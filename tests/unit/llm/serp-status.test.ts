/**
 * serp-status.test.ts — B7 (Codex D04, 23/09).
 * For two days the worker log said "collection_failed: invalid DataForSEO
 * result" and nobody could tell a billing problem from a broken payload.
 */
import { describe, it, expect } from "vitest";
import { classifyDataForSeo } from "../../../packages/llm/src/providers/serp";

describe("classifyDataForSeo", () => {
  it("a good envelope is null", () => {
    expect(classifyDataForSeo({ status_code: 20000, tasks: [{ status_code: 20000, result: [{ items: [] }] }] })).toBeNull();
  });
  it("401xx is an auth problem, permanent, with the vendor's words", () => {
    const f = classifyDataForSeo({ status_code: 40101, status_message: "Auth error. Invalid login/password." })!;
    expect(f.cls).toBe("auth");
    expect(f.kind).toBe("permanent");
    expect(f.message).toBe("collection_failed: auth (40101): Auth error. Invalid login/password.");
  });
  it("402xx is payment or quota, permanent — the cause the log never named", () => {
    const f = classifyDataForSeo({ status_code: 20000, tasks: [{ status_code: 40201, status_message: "Not enough money on the account." }] })!;
    expect(f.cls).toBe("payment_or_quota");
    expect(f.message).toContain("(40201): Not enough money");
  });
  it("5xxxx is the vendor's side and retryable", () => {
    const f = classifyDataForSeo({ status_code: 50000, status_message: "Internal error" })!;
    expect(f.cls).toBe("vendor_error");
    expect(f.kind).toBe("retryable");
  });
  it("a 200/20000 envelope with no items[] is a malformed payload, not an absent overview", () => {
    const f = classifyDataForSeo({ status_code: 20000, tasks: [{ status_code: 20000, result: [{}] }] })!;
    expect(f.cls).toBe("invalid_payload");
    expect(f.message).toContain("no items[]");
  });
  it("never lets a key-shaped string through, and caps the message", () => {
    const f = classifyDataForSeo({ status_code: 40101, status_message: "bad key sk-ant-abcdefghijklmnop Bearer xyz " + "x".repeat(300) })!;
    expect(f.message).not.toContain("sk-ant-abcdefghijklmnop");
    expect(f.message).not.toContain("Bearer xyz");
    expect(f.message.length).toBeLessThanOrEqual(200);
  });
});
