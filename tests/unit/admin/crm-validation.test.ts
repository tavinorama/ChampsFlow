/**
 * Unit — normalizeCrmPatch (admin CRM upsert input handling).
 *
 * Locks the "omitted vs. explicitly cleared" semantics the SQL upsert relies on:
 * an omitted field must leave the stored value untouched, while note:null /
 * nextFollowUp:"" must clear it. Also guards the stage enum, email normalization,
 * and date parsing.
 */
import { describe, it, expect } from "vitest";
import {
  normalizeCrmPatch,
  stageNeedsMigration,
  CRM_STAGES,
  CRM_BASE_STAGES,
  CRM_DESIGN_PARTNER_STAGES,
} from "../../../apps/api/src/lib/crm-validation";

describe("normalizeCrmPatch", () => {
  it("rejects a non-object body", () => {
    expect(normalizeCrmPatch(null)).toMatchObject({ ok: false, code: "INVALID_BODY" });
    expect(normalizeCrmPatch("x")).toMatchObject({ ok: false, code: "INVALID_BODY" });
  });

  it("requires a valid email and normalizes it (trim + lowercase)", () => {
    expect(normalizeCrmPatch({ stage: "new" })).toMatchObject({ ok: false, code: "INVALID_EMAIL" });
    expect(normalizeCrmPatch({ email: "not-an-email", stage: "new" })).toMatchObject({
      ok: false,
      code: "INVALID_EMAIL",
    });
    const r = normalizeCrmPatch({ email: "  Founder@Ozvor.COM ", stage: "new" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.patch.email).toBe("founder@ozvor.com");
  });

  it("accepts every known stage and rejects unknown ones", () => {
    for (const stage of CRM_STAGES) {
      expect(normalizeCrmPatch({ email: "a@b.co", stage }).ok).toBe(true);
    }
    expect(normalizeCrmPatch({ email: "a@b.co", stage: "won" })).toMatchObject({
      ok: false,
      code: "INVALID_STAGE",
    });
  });

  it("distinguishes omitted note from an explicit clear", () => {
    // omitted → not provided (upsert leaves it untouched)
    const omitted = normalizeCrmPatch({ email: "a@b.co", stage: "new" });
    expect(omitted.ok && omitted.patch.noteProvided).toBe(false);
    // null → provided, cleared
    const cleared = normalizeCrmPatch({ email: "a@b.co", note: null });
    expect(cleared.ok && cleared.patch.noteProvided).toBe(true);
    expect(cleared.ok && cleared.patch.note).toBeNull();
    // "" → provided, cleared
    const emptied = normalizeCrmPatch({ email: "a@b.co", note: "" });
    expect(emptied.ok && emptied.patch.note).toBeNull();
    // value → provided, kept
    const set = normalizeCrmPatch({ email: "a@b.co", note: "called, left VM" });
    expect(set.ok && set.patch.note).toBe("called, left VM");
  });

  it("truncates over-long notes instead of rejecting", () => {
    const long = "x".repeat(5000);
    const r = normalizeCrmPatch({ email: "a@b.co", note: long });
    expect(r.ok).toBe(true);
    if (r.ok) expect((r.patch.note ?? "").length).toBe(2000);
  });

  it("parses a valid follow-up date to ISO and clears on null/empty", () => {
    const r = normalizeCrmPatch({ email: "a@b.co", nextFollowUp: "2026-07-20" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.patch.nextFollowUp).toBe(new Date(Date.parse("2026-07-20")).toISOString());

    const cleared = normalizeCrmPatch({ email: "a@b.co", nextFollowUp: "" });
    expect(cleared.ok && cleared.patch.followUpProvided).toBe(true);
    expect(cleared.ok && cleared.patch.nextFollowUp).toBeNull();
  });

  it("rejects an unparseable follow-up date", () => {
    expect(normalizeCrmPatch({ email: "a@b.co", nextFollowUp: "not-a-date" })).toMatchObject({
      ok: false,
      code: "INVALID_DATE",
    });
  });

  it("rejects a patch with no mutable fields", () => {
    expect(normalizeCrmPatch({ email: "a@b.co" })).toMatchObject({ ok: false, code: "NO_FIELDS" });
  });
});

// ---------------------------------------------------------------------------
// Design-partner funnel + origin track (2026-09-11)
// ---------------------------------------------------------------------------

describe("normalizeCrmPatch — design partner fields", () => {
  it("accepts the four new funnel stages", () => {
    for (const stage of CRM_DESIGN_PARTNER_STAGES) {
      const r = normalizeCrmPatch({ email: "a@b.co", stage });
      expect(r.ok, stage).toBe(true);
      if (r.ok) expect(r.patch.stage).toBe(stage);
    }
  });

  it("keeps every pre-existing stage valid — no stored row changes meaning", () => {
    for (const stage of CRM_BASE_STAGES) {
      expect(normalizeCrmPatch({ email: "a@b.co", stage }).ok, stage).toBe(true);
    }
  });

  it("marks exactly the four new stages as needing the migration", () => {
    for (const s of CRM_DESIGN_PARTNER_STAGES) expect(stageNeedsMigration(s)).toBe(true);
    for (const s of CRM_BASE_STAGES) expect(stageNeedsMigration(s)).toBe(false);
  });

  it("still rejects a stage nobody defined", () => {
    expect(normalizeCrmPatch({ email: "a@b.co", stage: "won" })).toMatchObject({
      ok: false,
      code: "INVALID_STAGE",
    });
  });

  it("accepts source from the allowlist and rejects free text", () => {
    const ok = normalizeCrmPatch({ email: "a@b.co", source: "design-partner" });
    expect(ok.ok && ok.patch.source).toBe("design-partner");
    // Free text would silently create a second, empty funnel in the report.
    expect(normalizeCrmPatch({ email: "a@b.co", source: "design partner" })).toMatchObject({
      ok: false,
      code: "INVALID_SOURCE",
    });
  });

  it("source alone is enough to be a patch", () => {
    expect(normalizeCrmPatch({ email: "a@b.co", source: "referral" }).ok).toBe(true);
  });

  it("normalizes an appendNote to one line and caps it", () => {
    const r = normalizeCrmPatch({ email: "a@b.co", appendNote: "  pack sent\n\ncall Tue  " });
    expect(r.ok && r.patch.appendNote).toBe("pack sent call Tue");
    const long = normalizeCrmPatch({ email: "a@b.co", appendNote: "x".repeat(900) });
    expect(long.ok && (long.patch.appendNote ?? "").length).toBe(400);
  });

  it("refuses note and appendNote in the same call", () => {
    expect(normalizeCrmPatch({ email: "a@b.co", note: "a", appendNote: "b" })).toMatchObject({
      ok: false,
      code: "NOTE_CONFLICT",
    });
  });

  it("the NO_FIELDS message names every field that would satisfy it", () => {
    const r = normalizeCrmPatch({ email: "a@b.co" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      for (const field of ["stage", "note", "appendNote", "nextFollowUp", "source"]) {
        expect(r.message).toContain(field);
      }
    }
  });
});
