/**
 * 10.B.14 — correlation id + hashed log ids.
 */
import { describe, it, expect } from "vitest";
import { requestIdFrom, hashId } from "../../apps/api/src/lib/request-context";

const hdr = (m: Record<string, string>) => (n: string) => m[n];

describe("requestIdFrom", () => {
  it("honours an inbound x-request-id", () => {
    expect(requestIdFrom(hdr({ "x-request-id": "abc-123" }))).toBe("abc-123");
  });
  it("falls back to cf-ray when x-request-id is absent", () => {
    expect(requestIdFrom(hdr({ "cf-ray": "8f1a2b3c4d5e6f70-LIS" }))).toBe("8f1a2b3c4d5e6f70-LIS");
  });
  it("generates a UUID when neither header exists", () => {
    const id = requestIdFrom(hdr({}));
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });
  it("rejects junk headers (newlines, oversized) and generates instead", () => {
    const evil = "a\nb";
    const long = "x".repeat(200);
    expect(requestIdFrom(hdr({ "x-request-id": evil }))).toMatch(/^[0-9a-f-]{36}$/);
    expect(requestIdFrom(hdr({ "x-request-id": long }))).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("hashId", () => {
  it("is stable, short, and never the raw id", () => {
    const id = "b3f2b8a0-0000-4000-8000-000000000001";
    const h = hashId(id);
    expect(h).toMatch(/^[0-9a-f]{12}$/);
    expect(h).toBe(hashId(id));
    expect(h).not.toContain(id.slice(0, 8));
  });
  it("null/undefined stay null (no phantom hashes for anonymous requests)", () => {
    expect(hashId(null)).toBeNull();
    expect(hashId(undefined)).toBeNull();
  });
});
