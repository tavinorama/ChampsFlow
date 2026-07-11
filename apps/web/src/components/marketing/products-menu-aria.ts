/**
 * Disclosure-pattern ARIA contract for ProductsMenu (Hermes review, PR #235).
 * Pure module (no JSX) so the contract is unit-testable without a DOM harness.
 */

/** Stable id linking the disclosure trigger to its panel (aria-controls). */
export const PRODUCTS_PANEL_ID = "products-nav-panel";

/** Disclosure-pattern trigger attributes — deliberately NO aria-haspopup. */
export function triggerAria(open: boolean): {
  "aria-expanded": boolean;
  "aria-controls": string;
} {
  return { "aria-expanded": open, "aria-controls": PRODUCTS_PANEL_ID };
}

/** Escape is the only key that closes the disclosure. */
export function shouldCloseOnKey(key: string): boolean {
  return key === "Escape";
}
