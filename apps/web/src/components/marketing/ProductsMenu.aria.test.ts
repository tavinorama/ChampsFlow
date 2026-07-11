/**
 * ProductsMenu ARIA contract tests (disclosure pattern — Hermes review, PR #235).
 *
 * The component is a client leaf without a DOM test harness in this repo, so
 * the accessibility CONTRACT lives in pure exported helpers that the JSX
 * consumes directly (`{...triggerAria(open)}`, `shouldCloseOnKey(e.key)`,
 * `id={PRODUCTS_PANEL_ID}`). Testing the helpers therefore tests exactly the
 * attributes/behavior the rendered widget gets:
 *  - trigger exposes aria-expanded (state) + aria-controls (panel id)
 *  - trigger never declares aria-haspopup (no ARIA-menu promise)
 *  - Escape (and only Escape) closes the disclosure
 * Keyboard reachability of the items needs no assertion: they render as
 * plain <Link> anchors (natively tabbable).
 */
import { describe, expect, it } from "vitest";

import {
  PRODUCTS_PANEL_ID,
  shouldCloseOnKey,
  triggerAria,
} from "./products-menu-aria";

describe("ProductsMenu disclosure ARIA contract", () => {
  it("closed trigger: aria-expanded=false and aria-controls targets the panel", () => {
    expect(triggerAria(false)).toEqual({
      "aria-expanded": false,
      "aria-controls": PRODUCTS_PANEL_ID,
    });
  });

  it("open trigger: aria-expanded=true, same aria-controls target", () => {
    expect(triggerAria(true)).toEqual({
      "aria-expanded": true,
      "aria-controls": PRODUCTS_PANEL_ID,
    });
  });

  it("never declares aria-haspopup (disclosure, not ARIA menu)", () => {
    expect(Object.keys(triggerAria(false))).not.toContain("aria-haspopup");
    expect(Object.keys(triggerAria(true))).not.toContain("aria-haspopup");
  });

  it("panel id is the stable disclosure target", () => {
    expect(PRODUCTS_PANEL_ID).toBe("products-nav-panel");
  });

  it("Escape closes the disclosure", () => {
    expect(shouldCloseOnKey("Escape")).toBe(true);
  });

  it("other keys do not close it (Tab must keep traversing the links)", () => {
    for (const key of ["Tab", "Enter", " ", "ArrowDown", "a"]) {
      expect(shouldCloseOnKey(key)).toBe(false);
    }
  });
});
