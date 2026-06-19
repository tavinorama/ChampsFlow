/**
 * ssrf-redirect.test.ts — GEO-SEC-4: guardedFetch must re-validate EVERY redirect
 * hop, defeating redirect-to-internal / DNS-rebinding. fetch is stubbed so no
 * real network is hit; the first hop is a public IP literal (no DNS), the
 * redirect Location points at the cloud-metadata IP and must be refused.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { guardedFetch } from "../../packages/llm/src/ssrf-guard";

function fakeResponse(init: { status: number; location?: string; body?: string }) {
  return {
    status: init.status,
    ok: init.status >= 200 && init.status < 300,
    headers: { get: (h: string) => (h.toLowerCase() === "location" ? init.location ?? null : null) },
    body: { cancel: async () => {} },
    text: async () => init.body ?? "",
  } as unknown as Response;
}

afterEach(() => vi.unstubAllGlobals());

describe("guardedFetch — redirect re-validation (GEO-SEC-4)", () => {
  it("refuses a redirect whose Location is an internal/metadata IP", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => fakeResponse({ status: 302, location: "http://169.254.169.254/latest/meta-data/" })));
    await expect(
      guardedFetch("http://8.8.8.8/", { timeoutMs: 1000 })
    ).rejects.toThrow(/ssrf-guard/);
  });

  it("refuses a redirect to a private RFC-1918 host", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => fakeResponse({ status: 301, location: "http://10.0.0.5/admin" })));
    await expect(guardedFetch("http://8.8.8.8/", { timeoutMs: 1000 })).rejects.toThrow(/ssrf-guard/);
  });

  it("follows a redirect to another public target and returns the final response", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      calls.push(url);
      if (calls.length === 1) return fakeResponse({ status: 302, location: "http://8.8.4.4/final" });
      return fakeResponse({ status: 200, body: "ok" });
    }));
    const res = await guardedFetch("http://8.8.8.8/", { timeoutMs: 1000 });
    expect(res.status).toBe(200);
    expect(calls.length).toBe(2);
  });

  it("stops after too many redirects", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => fakeResponse({ status: 302, location: "http://8.8.4.4/loop" })));
    await expect(guardedFetch("http://8.8.8.8/", { timeoutMs: 2000 })).rejects.toThrow(/too many redirects/i);
  });
});
