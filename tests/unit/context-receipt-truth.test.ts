/**
 * context-receipt-truth.test.ts — D2 (Codex N05 + my own finding, 28/09).
 *
 * 130 steps in three days said `ctx signals=empty gaps=empty` on a worker
 * that had no Signal Engine and no own-brand id configured. "empty" means
 * "connected, found nothing"; the truth was "not connected". The port alone
 * cannot tell them apart (it returns null for both), so the substrate now
 * says whether each connector is configured.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("../../packages/shared/src/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { readContextPort, contextReceipt } from "../../apps/api/src/lib/graph-runner";

describe("readContextPort — four truths, never confused", () => {
  it("not configured: not_wired, and the port is NOT called", async () => {
    const port = vi.fn(async () => "x");
    expect(await readContextPort(port, false)).toEqual({ state: "not_wired", text: null });
    expect(port).not.toHaveBeenCalled();
    expect(await readContextPort(undefined, true)).toEqual({ state: "not_wired", text: null });
  });
  it("configured and nothing found: empty", async () => {
    expect(await readContextPort(async () => null, true)).toEqual({ state: "empty", text: null });
    expect(await readContextPort(async () => "", true)).toEqual({ state: "empty", text: null });
  });
  it("configured and text: on; configured and throws: error", async () => {
    expect(await readContextPort(async () => "sinais", true)).toEqual({ state: "on", text: "sinais" });
    expect(await readContextPort(async () => { throw new Error("down"); }, true)).toEqual({ state: "error", text: null });
  });
  it("a substrate that cannot tell keeps the old behaviour (present port = assumed wired)", async () => {
    expect((await readContextPort(async () => null, undefined)).state).toBe("empty");
  });
  it("the receipt of an unconfigured worker says not_wired", async () => {
    const s = (await readContextPort(async () => null, false)).state;
    const g = (await readContextPort(async () => null, false)).state;
    expect(contextReceipt({ signals: s, gaps: g })).toContain("signals=not_wired gaps=not_wired");
  });
});

describe("wiring", () => {
  const root = join(__dirname, "../..");
  it("the worker derives wiring from the same env the ports read", () => {
    const src = readFileSync(join(root, "apps/worker/src/jobs/graph-tick.ts"), "utf8");
    expect(src).toContain("contextWiring()");
    expect(src).toContain("signals: Boolean(SE_URL && SE_KEY), gaps: Boolean(OWN_BRAND_ID)");
  });
  it("the runner no longer decides the state inline", () => {
    const src = readFileSync(join(root, "apps/api/src/lib/graph-runner.ts"), "utf8");
    expect(src).not.toContain('signalsState = sig ? "on" : "empty"');
    expect(src).not.toContain('gapsState = gaps ? "on" : "empty"');
  });
});
