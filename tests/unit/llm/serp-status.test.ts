/**
 * serp-status.test.ts — B7 (Codex D04, 23/09).
 * For two days the worker log said "collection_failed: invalid DataForSEO
 * result" and nobody could tell a billing problem from a broken payload.
 */
import { describe, it, expect } from "vitest";
import { classifyDataForSeo, classifyDataForSeoHttp, classifyDataForSeoTransport } from "../../../packages/llm/src/providers/serp";
import { readFileSync } from "node:fs";
import { join } from "node:path";

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

describe("D10 — an HTTP or transport failure names its cause too", () => {
  it("HTTP status maps to a cause and to retryable/permanent", () => {
    expect(classifyDataForSeoHttp(401)).toMatchObject({ cls: "auth", kind: "permanent" });
    expect(classifyDataForSeoHttp(402)).toMatchObject({ cls: "payment_or_quota", kind: "permanent" });
    expect(classifyDataForSeoHttp(429)).toMatchObject({ cls: "rate_limited", kind: "retryable" });
    expect(classifyDataForSeoHttp(503)).toMatchObject({ cls: "unavailable", kind: "retryable" });
    expect(classifyDataForSeoHttp(400)).toMatchObject({ cls: "bad_request", kind: "permanent" });
    expect(classifyDataForSeoHttp(402).message).toBe("collection_failed: payment_or_quota (HTTP 402)");
  });
  it("timeout, bad JSON and network errors are told apart; an odd code is sanitised", () => {
    expect(classifyDataForSeoTransport(Object.assign(new Error("x"), { name: "AbortError" })).message).toContain("timeout");
    expect(classifyDataForSeoTransport(new SyntaxError("Unexpected token <")).message).toContain("not JSON");
    expect(classifyDataForSeoTransport(Object.assign(new Error("x"), { code: "ECONNRESET" })).message).toBe("collection_failed: network (ECONNRESET)");
    expect(classifyDataForSeoTransport(Object.assign(new Error("x"), { code: "a b;<script>" })).message).toBe("collection_failed: network (abscript)");
  });
  it("the generic sentence is gone from the adapter", () => {
    const src = readFileSync(join(__dirname, "../../../packages/llm/src/providers/serp.ts"), "utf8");
    expect(src.split("\n").filter((l) => !/^\s*(\/\/|\*)/.test(l)).join("\n")).not.toContain('"DataForSEO SERP request failed"');
  });
});
