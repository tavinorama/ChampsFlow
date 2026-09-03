/**
 * mobile-overflow-guards.test.ts — P0-10 regression lock.
 *
 * The real acceptance test is tests/e2e/mobile-overflow.spec.ts, which measures
 * document.documentElement.scrollWidth in a browser. That suite is Playwright,
 * and the Playwright job on this repo has been red-and-invisible (see
 * project notes: "E2E vermelho e invisível"), so a browser-only guard would not
 * actually stop a regression from landing.
 *
 * These are source-level locks on the four mechanisms that were MEASURED to
 * cause overflow on 03/09/2026, so a revert fails the default `npx vitest run`
 * gate. Each assertion names the measurement it protects.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

describe("P0-10 — mobile overflow guards", () => {
  it("marketing navbar hides its secondary links below 900px, not 700px", () => {
    // MEASURED: at a 768px viewport the six centre links were still rendered
    // while the logo block and the whole right cluster are flexShrink:0. The
    // navbar's min-content width came out at 970px, so /, /pricing and /test
    // each produced a 970px document on a 768px screen.
    const src = read("apps/web/src/app/(marketing)/layout.tsx");
    const rule = /@media \(max-width: (\d+)px\) \{\s*\.mk-navlink-hide-sm \{ display: none !important; \}/;
    const m = rule.exec(src);
    expect(m, ".mk-navlink-hide-sm must be hidden by a max-width media query").not.toBeNull();
    expect(Number(m![1])).toBeGreaterThanOrEqual(900);
  });

  it("the /test engine table sits inside a horizontal-scroll wrapper", () => {
    // The only table on the four audited pages without one. Its columns carry
    // competitor domains (unbounded user data) and it is auto-layout, so its
    // min-content floor is data-dependent above 640px.
    const src = read("apps/web/src/app/(marketing)/test/InvisibilityTestClient.tsx");
    expect(src).toContain('<div className="ti-test-engine-table-scroll">');
    expect(src).toMatch(/\.ti-test-engine-table-scroll \{[^}]*overflow-x: auto;/);
    // The wrapper must open immediately before the table it protects.
    const wrapperAt = src.indexOf('<div className="ti-test-engine-table-scroll">');
    const tableAt = src.indexOf('className="ti-test-engine-table"');
    expect(wrapperAt).toBeGreaterThan(-1);
    expect(tableAt).toBeGreaterThan(wrapperAt);
  });

  it("the login card is border-box so its padding cannot widen the document", () => {
    // MEASURED: 320px viewport → 338px card → 329px document, because the card
    // was content-box (width:100% + 2 × var(--space-8) padding added outward).
    const src = read("apps/web/src/app/login/page.tsx");
    const card = /width: "100%", maxWidth: "400px", boxSizing: "border-box"/;
    expect(src).toMatch(card);
  });

  it("dashboard-v3 grid tracks carry an explicit zero minimum", () => {
    // A bare `1fr`/`auto` grid track keeps an automatic min-content minimum, so
    // one wide child (a long brand name, a competitor domain) pushes the whole
    // shell wider than the viewport. minmax(0, …) is invisible at desktop
    // widths and removes that floor.
    const page = read("apps/web/src/app/dashboard-v3/page.tsx");
    expect(page).toContain('gridTemplateColumns: "clamp(200px, 18vw, 240px) minmax(0, 1fr)"');
    const prime = read("apps/web/src/app/dashboard-v3/PrimeTab.tsx");
    expect(prime).toContain('gridTemplateColumns: "minmax(0, 1.3fr) minmax(0, 1fr)"');
  });
});
