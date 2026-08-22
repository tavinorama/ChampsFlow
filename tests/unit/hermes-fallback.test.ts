/**
 * hermes-fallback — the engine chain for Hermes /task (21–22/08: pinned
 * "claude" + one call = 26h of total failure, fallbacks=0, when the Claude
 * OAuth session expired on the VPS). Pins the house rule: a single call
 * without fallback is a design defect; kimi replaces claude AND codex.
 */
import { describe, it, expect } from "vitest";
import {
  callWithFallback,
  parseEngineChain,
  DEFAULT_HERMES_ENGINES,
  errorHead,
} from "../../apps/worker/src/lib/hermes-fallback";

const ok = (engine: string) => ({ ok: true, output: `out-${engine}`, engineUsed: engine, ms: 10 });
const fail = (engine: string, msg: string) => ({ ok: false, output: msg, engineUsed: engine, ms: null });

describe("parseEngineChain", () => {
  it("defaults to claude,codex,kimi and parses an override", () => {
    expect(parseEngineChain(undefined)).toEqual([...DEFAULT_HERMES_ENGINES]);
    expect(parseEngineChain("")).toEqual([...DEFAULT_HERMES_ENGINES]);
    expect(parseEngineChain(" kimi , claude ")).toEqual(["kimi", "claude"]);
  });
});

describe("callWithFallback", () => {
  it("primary works → used, zero fallbacks, no failures", async () => {
    const calls: string[] = [];
    const r = await callWithFallback(["claude", "codex", "kimi"], async (e) => {
      calls.push(e);
      return ok(e);
    });
    expect(r).toMatchObject({ ok: true, engineUsed: "claude", fallbacks: 0, failures: [] });
    expect(calls).toEqual(["claude"]);
  });

  it("the 21/08 case: claude OAuth expired → codex used, failure recorded", async () => {
    const calls: string[] = [];
    const r = await callWithFallback(["claude", "codex", "kimi"], async (e) => {
      calls.push(e);
      if (e === "claude") return fail(e, "Failed to authenticate: OAuth session expired and could not be refreshed");
      return ok(e);
    });
    expect(r.ok).toBe(true);
    expect(r.engineUsed).toBe("codex");
    expect(r.fallbacks).toBe(1);
    expect(r.failures).toEqual([{ engine: "claude", error: expect.stringContaining("OAuth session expired") }]);
    expect(calls).toEqual(["claude", "codex"]);
  });

  it("claude AND codex down → kimi (the universal fallback)", async () => {
    const r = await callWithFallback(["claude", "codex", "kimi"], async (e) =>
      e === "kimi" ? ok(e) : fail(e, "session limit")
    );
    expect(r).toMatchObject({ ok: true, engineUsed: "kimi", fallbacks: 2 });
  });

  it("everything down → honest consolidated failure naming every engine; a throw counts as a failure", async () => {
    const r = await callWithFallback(["claude", "codex", "kimi"], async (e) => {
      if (e === "codex") throw new Error("ECONNRESET");
      return fail(e, "down");
    });
    expect(r.ok).toBe(false);
    expect(r.fallbacks).toBe(3);
    expect(r.output).toContain("all engines failed (3)");
    expect(r.output).toContain("claude: down");
    expect(r.output).toContain("codex: ECONNRESET");
    expect(r.output).toContain("kimi: down");
  });

  it("errorHead is bounded and single-line", () => {
    expect(errorHead("a\n\n  b   c" + "x".repeat(500), 20)).toHaveLength(20);
    expect(errorHead("")).toBe("no output");
  });
});
