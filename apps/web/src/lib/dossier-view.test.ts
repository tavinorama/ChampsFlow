/**
 * Colocated pure-logic tests for the dossier view helpers (no JSX/DOM — the
 * runner is node; see vitest.config.ts).
 */
import { describe, it, expect } from "vitest";
import {
  dossierSourceLabel,
  dossierSourceTokens,
  formatDossierWhen,
  recycleBatchCsv,
} from "./dossier-view";

describe("dossier source badges", () => {
  it("labels every known source, PT where the founder reads PT", () => {
    expect(dossierSourceLabel("smartlead")).toBe("SmartLead");
    expect(dossierSourceLabel("purchase")).toBe("Compra");
    expect(dossierSourceLabel("crm")).toBe("CRM");
    expect(dossierSourceLabel("nurture")).toBe("Nurture");
    expect(dossierSourceLabel("test")).toBe("Test");
  });

  it("an unknown source still renders (label passthrough, CRM colors)", () => {
    expect(dossierSourceLabel("future_thing")).toBe("future_thing");
    expect(dossierSourceTokens("future_thing")).toEqual(dossierSourceTokens("crm"));
  });

  it("every source resolves to theme tokens, never raw colors", () => {
    for (const s of ["smartlead", "crm", "purchase", "nurture", "test"]) {
      const t = dossierSourceTokens(s);
      expect(t.bg).toMatch(/^var\(--/);
      expect(t.color).toMatch(/^var\(--/);
    }
  });
});

describe("formatDossierWhen", () => {
  it("shows date only for the synthetic midnight-UTC note dates", () => {
    expect(formatDossierWhen("2026-08-18T00:00:00.000Z")).toBe("2026-08-18");
  });
  it("shows date + time for real event timestamps", () => {
    expect(formatDossierWhen("2026-08-20T10:07:01.000Z")).toBe("2026-08-20 10:07 UTC");
  });
  it("passes garbage through instead of throwing", () => {
    expect(formatDossierWhen("garbage")).toBe("garbage");
  });
});

describe("recycleBatchCsv", () => {
  it("header + one address per line, trailing newline (SmartLead-loadable)", () => {
    expect(
      recycleBatchCsv({ slug: "recycle-2026-09-01", proposedOn: "2026-09-01", emails: ["a@x.com", "b@y.io"] })
    ).toBe("email\na@x.com\nb@y.io\n");
  });
  it("neutralizes formula-leading addresses (CSV injection guard)", () => {
    const csv = recycleBatchCsv({ slug: "s", proposedOn: "d", emails: ["=cmd()@evil.com"] });
    expect(csv).toContain("'=cmd()@evil.com");
  });
});
