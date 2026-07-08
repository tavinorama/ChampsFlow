/**
 * Regression guard for the 2026-07-08 production incident.
 *
 * The `resend` SDK (v3) lazily imports `@react-email/render`, which imports
 * `react-dom` at SEND time. `apps/api` and `apps/worker` shipped `resend` but
 * NOT `react`/`react-dom`, so every transactional email threw
 * "Cannot find package 'react-dom'" in production — while the delivery-email
 * unit tests stayed green because they `vi.mock("resend")` and never load the
 * real module chain. The first live Kit purchase charged the card but sent no
 * email.
 *
 * This test loads the REAL modules (no mock) so CI fails if the dependency
 * chain regresses (e.g. react/react-dom removed from a service's package.json).
 */

import { describe, it, expect } from "vitest";

describe("email delivery dependency chain (no mock)", () => {
  it("@react-email/render resolves — react-dom is present", async () => {
    const mod = await import("@react-email/render");
    expect(typeof mod.render).toBe("function");
  });

  it("resend SDK instantiates and exposes emails.send", async () => {
    const { Resend } = await import("resend");
    const client = new Resend("re_test_dummy");
    expect(typeof client.emails.send).toBe("function");
  });
});
