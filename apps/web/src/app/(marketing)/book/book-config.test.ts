/**
 * book-config.test.ts — /book must never be a dead end.
 *
 * /book is the CTA printed on the Design Partner Pack. Whatever
 * NEXT_PUBLIC_CALENDLY_URL is doing in a given environment, the visitor gets
 * either a working calendar or a working way to reach a person. There is no
 * third outcome, and these tests are what says so.
 *
 * Pure logic, node runner — no JSX, no DOM (the convention for colocated web
 * tests in this repo).
 */

import { describe, it, expect } from "vitest";
import {
  BOOK_CONTACT_EMAIL,
  BOOK_FALLBACK_COPY,
  bookFallbackMailto,
  isUsableCalendlyUrl,
  resolveBookMode,
} from "./book-config";

describe("resolveBookMode", () => {
  it("shows the calendar for a real https Calendly URL", () => {
    expect(resolveBookMode("https://calendly.com/hello-ozvor/20-minute-ozvor")).toBe("calendar");
    expect(isUsableCalendlyUrl("https://calendly.com/hello-ozvor/20-minute-ozvor")).toBe(true);
  });

  it("falls back when the env is missing or blank", () => {
    for (const v of [undefined, null, "", "   "]) {
      expect(resolveBookMode(v)).toBe("email-fallback");
    }
  });

  it("falls back on a value that is set but unusable", () => {
    // Each of these is truthy, so the old Boolean() check would have embedded
    // a widget that could never load.
    for (const v of [
      "/book",
      "calendly.com/hello-ozvor",
      "http://calendly.com/hello-ozvor",
      "PASTE_SEU_LINK_CALENDLY",
      "https://calendly.com/YOUR_HANDLE/20min",
      "not a url at all",
    ]) {
      expect(resolveBookMode(v), v).toBe("email-fallback");
    }
  });
});

describe("the fallback is a working way to reach a person", () => {
  it("is a mailto to the sales inbox, with the subject filled in", () => {
    const href = bookFallbackMailto();
    expect(href.startsWith(`mailto:${BOOK_CONTACT_EMAIL}?subject=`)).toBe(true);
    expect(decodeURIComponent(href.split("subject=")[1]!)).toBe(BOOK_FALLBACK_COPY.subject);
  });

  it("encodes a custom subject instead of breaking the link", () => {
    const href = bookFallbackMailto("Design partner — Acme & Co");
    expect(href).not.toContain(" ");
    expect(decodeURIComponent(href.split("subject=")[1]!)).toBe("Design partner — Acme & Co");
  });

  it("the button label names the address, so it reads as reachable offline too", () => {
    expect(BOOK_FALLBACK_COPY.mailtoLabel).toContain(BOOK_CONTACT_EMAIL);
  });

  it("says what is actually wrong — not 'coming soon'", () => {
    const all = Object.values(BOOK_FALLBACK_COPY).join(" ").toLowerCase();
    expect(all).toContain("calendar is not connected");
    expect(all).not.toContain("coming soon");
  });

  it("respects the house sentence cap of 12 words", () => {
    // Split per string: a heading carries no full stop, so joining them first
    // would fuse the heading into the next sentence and measure a phantom.
    const sentences = [
      BOOK_FALLBACK_COPY.heading,
      BOOK_FALLBACK_COPY.body,
      BOOK_FALLBACK_COPY.secondary,
    ].flatMap((block) =>
      block
        .split(/(?<=[.!?])\s+/)
        .map((s) => s.trim())
        .filter(Boolean)
    );
    for (const s of sentences) {
      expect(s.split(/\s+/).length, s).toBeLessThanOrEqual(12);
    }
  });
});
