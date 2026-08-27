/**
 * campaign-attribution.test.ts — the fire-test regression (2026-08-27):
 * the lead lands with ?from=, browses to other pages (clean URLs), and buys
 * on a later pageview. Attribution must survive via sessionStorage.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readAttributionFromLocation } from "./campaign-attribution";

type MutableWindow = {
  location: { search: string };
  sessionStorage: {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
  };
};

function fakeWindow(search: string): { win: MutableWindow; store: Map<string, string> } {
  const store = new Map<string, string>();
  const win: MutableWindow = {
    location: { search },
    sessionStorage: {
      getItem: (k) => (store.has(k) ? (store.get(k) as string) : null),
      setItem: (k, v) => {
        store.set(k, v);
      },
    },
  };
  return { win, store };
}

const globalAny = globalThis as { window?: unknown };
let savedWindow: unknown;

beforeEach(() => {
  savedWindow = globalAny.window;
});

afterEach(() => {
  globalAny.window = savedWindow;
});

describe("readAttributionFromLocation", () => {
  it("returns null server-side (no window)", () => {
    delete globalAny.window;
    expect(readAttributionFromLocation()).toBeNull();
  });

  it("reads ?from= and utm_* off the URL and persists them", () => {
    const { win, store } = fakeWindow("?from=cold-atlanta-01&utm_source=email&noise=x");
    globalAny.window = win;
    expect(readAttributionFromLocation()).toEqual({
      from: "cold-atlanta-01",
      utm_source: "email",
    });
    expect(store.get("ozvor_attribution")).toContain("cold-atlanta-01");
  });

  it("fire-test regression: a later clean-URL pageview still returns the stored origin", () => {
    const landing = fakeWindow("?from=teste-cold-01");
    globalAny.window = landing.win;
    readAttributionFromLocation(); // landing pageview stores it

    // Same tab, later pageview with no query string — shares the storage.
    const checkout = fakeWindow("");
    for (const [k, v] of landing.store) checkout.store.set(k, v);
    globalAny.window = checkout.win;
    expect(readAttributionFromLocation()).toEqual({ from: "teste-cold-01" });
  });

  it("a newer link click with params overwrites the stored origin", () => {
    const { win, store } = fakeWindow("?from=old-campaign");
    globalAny.window = win;
    readAttributionFromLocation();
    win.location.search = "?from=new-campaign";
    expect(readAttributionFromLocation()).toEqual({ from: "new-campaign" });
    expect(store.get("ozvor_attribution")).toContain("new-campaign");
  });

  it("ignores tampered storage that fails the allowlist or is not an object", () => {
    const { win, store } = fakeWindow("");
    store.set("ozvor_attribution", JSON.stringify({ evil: "x", from: 42 }));
    globalAny.window = win;
    expect(readAttributionFromLocation()).toBeNull();
    store.set("ozvor_attribution", "not-json{");
    expect(readAttributionFromLocation()).toBeNull();
  });

  it("trims and caps values at 100 chars", () => {
    const long = "a".repeat(150);
    const { win } = fakeWindow(`?from=${long}`);
    globalAny.window = win;
    const out = readAttributionFromLocation();
    expect(out?.from).toHaveLength(100);
  });

  it("returns null when there is nothing anywhere", () => {
    const { win } = fakeWindow("");
    globalAny.window = win;
    expect(readAttributionFromLocation()).toBeNull();
  });
});
