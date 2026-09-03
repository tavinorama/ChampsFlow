/**
 * opportunity-radar-gate.test.ts — P0-03.
 *
 * The audit report said "a feature this empty must not stay in the navigation
 * of an Agency plan". The code was worse than that: there was no entitlement
 * check anywhere, so the tab sat in the navigation of EVERY plan, Free
 * included, and always rendered the same empty state because the source was
 * never connected.
 *
 * These tests lock the two halves of the fix — the surface is off, and the
 * route refuses regardless of environment — plus the removal of the claim.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { OPPORTUNITY_RADAR_ENABLED } from "../../apps/api/src/routes/signals";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

describe("P0-03 — Opportunity Radar is off until it has a cleared source", () => {
  it("the API flag is off", () => {
    // Reddit is compliance_state=blocked for commercial use until a direct
    // contract or a counsel-reviewed licensed vendor exists. Flipping this
    // without that contract is the thing the block exists to prevent.
    expect(OPPORTUNITY_RADAR_ENABLED).toBe(false);
  });

  it("the web flag mirrors it", () => {
    const src = read("apps/web/src/lib/feature-flags.ts");
    expect(src).toMatch(/export const OPPORTUNITY_RADAR_ENABLED = false;/);
  });

  it("the route refuses BEFORE it reads SIGNAL_ENGINE_* env", () => {
    // Load order is the whole point: if the env check came first, setting a key
    // in Railway would silently re-open a commercially blocked feature. The
    // gate must be legal, not operational.
    const src = read("apps/api/src/routes/signals.ts");
    // The check reads a local resolved from the constant (`radarEnabled`),
    // which exists only so the wire-contract tests can force the connected
    // path. Its DEFAULT is the constant, and the constant is false.
    expect(src).toContain("opts.radarEnabled ?? OPPORTUNITY_RADAR_ENABLED");
    const gateAt = src.indexOf("if (!radarEnabled)");
    const envAt = src.indexOf('process.env["SIGNAL_ENGINE_URL"]');
    expect(gateAt).toBeGreaterThan(-1);
    expect(envAt).toBeGreaterThan(-1);
    expect(gateAt).toBeLessThan(envAt);
  });

  it("the dashboard neither shows the nav entry nor mounts the tab", () => {
    const src = read("apps/web/src/app/dashboard-v3/page.tsx");
    // Nav entry is behind the flag…
    expect(src).toMatch(
      /\{OPPORTUNITY_RADAR_ENABLED && \(\s*<NavItem label="Where to show up"/
    );
    // …and so is the render branch, so a stale/deep-linked tab id cannot
    // resurrect it.
    expect(src).toContain('tab === "whereToShowUp" && OPPORTUNITY_RADAR_ENABLED ?');
  });

  it("the 'Live Reddit openings' claim is gone", () => {
    const src = read("apps/web/src/app/dashboard-v3/page.tsx");
    expect(src).not.toContain("Live Reddit & AI-search openings");
    // And nothing anywhere in the web app re-states it.
    expect(src).not.toMatch(/Live Reddit/i);
  });
});
