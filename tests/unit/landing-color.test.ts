/**
 * landing-color.test.ts — brand-colour safety for public Pages chrome
 * (Hermes #259: CSS injection via unvalidated accentColor + WCAG contrast).
 */
import { describe, it, expect } from "vitest";
import { safeHexColor, onAccent } from "../../apps/web/src/components/landing-public/color";

describe("safeHexColor — blocks CSS injection", () => {
  it("passes valid hex (#rgb / #rrggbb / #rrggbbaa)", () => {
    expect(safeHexColor("#0c7d54")).toBe("#0c7d54");
    expect(safeHexColor("#abc")).toBe("#abc");
    expect(safeHexColor("#0c7d5480")).toBe("#0c7d5480");
    expect(safeHexColor("#ABCDEF")).toBe("#ABCDEF");
  });

  it("rejects any value that could break out of a <style> block", () => {
    const fb = "#0c7d54";
    // The exact class of payload Hermes flagged.
    expect(safeHexColor("red} body{background:url(//evil)}")).toBe(fb);
    expect(safeHexColor("#fff}</style><script>alert(1)</script>")).toBe(fb);
    expect(safeHexColor("url(https://evil/x)")).toBe(fb);
    expect(safeHexColor("expression(alert(1))")).toBe(fb);
    // Non-hex CSS colours are also rejected (strict allowlist).
    expect(safeHexColor("red")).toBe(fb);
    expect(safeHexColor("rgb(0,0,0)")).toBe(fb);
    expect(safeHexColor("")).toBe(fb);
    expect(safeHexColor(undefined)).toBe(fb);
    expect(safeHexColor(123 as unknown)).toBe(fb);
  });

  it("honours a custom fallback", () => {
    expect(safeHexColor("garbage", "#123456")).toBe("#123456");
  });
});

describe("onAccent — WCAG-correct foreground", () => {
  it("picks white on dark brands, near-black on light brands", () => {
    expect(onAccent("#000000")).toBe("#ffffff");
    expect(onAccent("#0c7d54")).toBe("#ffffff"); // Ozvor green is dark → white
    expect(onAccent("#ffffff")).toBe("#171717");
    expect(onAccent("#f5f5f5")).toBe("#171717"); // light gray → dark text
  });

  it("uses WCAG contrast (not YIQ): pure red gets near-black, which is higher-contrast", () => {
    // white-on-red ≈ 4.0:1, black-on-red ≈ 5.25:1 → WCAG picks black. (YIQ wrongly
    // returned white here — the bug Hermes flagged.)
    expect(onAccent("#ff0000")).toBe("#171717");
  });

  it("is safe on a garbage colour (falls back, never throws)", () => {
    expect(onAccent("not-a-color")).toBe("#ffffff"); // fallback #0c7d54 → white
  });
});
