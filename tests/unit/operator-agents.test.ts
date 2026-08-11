/**
 * Operator agent routes (#161b) — the substrate's write door.
 *
 * What these pins hold:
 *  - the privacy boundary survives the network hop: no route field can carry
 *    text into the substrate — hashes are validated as sha256 hex at the edge;
 *  - lift is never accepted from the caller (the lib computes it);
 *  - cost of a run is never accepted from the caller (finishRun sums steps);
 *  - the routes ride the same operator-key auth as the rest of the surface.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const route = readFileSync(
  join(__dirname, "../../apps/api/src/routes/operator-agents.ts"),
  "utf8"
);

describe("the substrate's write door", () => {
  it("every route is behind the operator key", () => {
    const handlers = route.match(/app\.(post|get)\(/g) ?? [];
    const guarded = route.match(/agentsKey/g) ?? [];
    // 1 declaration + 1 use per route.
    expect(guarded.length).toBe(handlers.length + 1);
  });

  it("hashes are validated as sha256 hex — text cannot ride the hash fields", () => {
    expect(route).toContain("asSha256");
    expect(route).toMatch(/\^\[0-9a-f\]\{64\}\$/);
    expect(route).toContain("Never send text.");
  });

  it("lift is not an input anywhere on the surface", () => {
    const code = route.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toContain("lift?");
    expect(code).not.toContain("body.lift");
  });

  it("run cost is not an input — finishRun sums the steps", () => {
    // The run-finish body accepts status + engine_used only.
    const finishRunBlock = route.slice(
      route.indexOf("agent-runs/:id/finish"),
      route.indexOf("agent-steps", route.indexOf("agent-runs/:id/finish"))
    );
    expect(finishRunBlock).not.toContain("cost_cents");
  });

  it("vp_owner is validated against the real org chart", () => {
    for (const vp of ["engineering", "marketing", "sales", "finance", "legal", "cx", "ceo"]) {
      expect(route).toContain(`"${vp}"`);
    }
  });

  it("the loop-is-broken query is exposed for the bulletin", () => {
    expect(route).toContain("missing-outcomes");
    expect(route).toContain("stepsMissingOutcome");
  });

  it("never imports from another route file except the auth guard", () => {
    const imports = route.match(/from "\.\/[^"]+"/g) ?? [];
    expect(imports).toEqual(['from "./api-keys"']);
  });
});
