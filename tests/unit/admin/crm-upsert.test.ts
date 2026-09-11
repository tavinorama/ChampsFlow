/**
 * Unit — upsertCrmContact param wiring (apps/api/src/lib/crm).
 *
 * The admin route and the Hermes operator route share this upsert, so the SQL
 * parameter order must stay correct: an omitted note/follow-up must pass its
 * "provided" flag as false (so the CASE keeps the stored value), and a set value
 * must pass through. Mocks the db — no real Postgres needed.
 *
 * 2026-09-11 adds three things this file now guards:
 *   - `source` (migration 20260911000001) with a step-down when the column is
 *     not there yet, so a pending migration costs a label and not the write;
 *   - `appendNote`, which ADDS a dossier line instead of replacing the file;
 *   - a refusal, not a silent substitution, when a design-partner stage hits
 *     the old CHECK constraint.
 *
 * The SQL string and the parameter array are built by two functions that must
 * agree exactly — Postgres rejects a bind whose count does not match — so they
 * are asserted against each other here.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  upsertCrmContact,
  buildCrmUpsertSql,
  paramsFor,
  dossierLine,
  CrmStageUnsupportedError,
  CRM_FUNNEL_MIGRATION,
  _resetCrmStateForTests,
} from "../../../apps/api/src/lib/crm";
import { normalizeCrmPatch } from "../../../apps/api/src/lib/crm-validation";

function mockDb(row: unknown) {
  const query = vi.fn().mockResolvedValue({ rows: [row] });
  return { db: { query } as never, query };
}

/** A db whose FIRST call fails with a Postgres error code, then succeeds. */
function mockDbFailingOnce(code: string, row: unknown) {
  const err = Object.assign(new Error("pg"), { code });
  const query = vi.fn().mockRejectedValueOnce(err).mockResolvedValue({ rows: [row] });
  return { db: { query } as never, query };
}

/** A db that always fails with a Postgres error code. */
function mockDbAlwaysFailing(code: string) {
  const err = Object.assign(new Error("pg"), { code });
  const query = vi.fn().mockRejectedValue(err);
  return { db: { query } as never, query };
}

function patchOf(raw: unknown) {
  const r = normalizeCrmPatch(raw);
  if (!r.ok) throw new Error(`unexpected invalid patch: ${r.code}`);
  return r.patch;
}

const ROW = {
  email: "a@b.co",
  stage: "contacted",
  note: null,
  next_follow_up: null,
  source: null,
  updated_at: "t",
};

beforeEach(() => {
  _resetCrmStateForTests();
});

describe("upsertCrmContact", () => {
  it("stage-only patch: stage param set, note/follow-up NOT provided", async () => {
    const { db, query } = mockDb(ROW);
    await upsertCrmContact(db, patchOf({ email: "a@b.co", stage: "contacted" }), "user-1");
    const params = query.mock.calls[0][1] as unknown[];
    // [email, stage, note, next_follow_up, updatedBy, noteProvided, followUpProvided, source]
    expect(params[0]).toBe("a@b.co");
    expect(params[1]).toBe("contacted");
    expect(params[4]).toBe("user-1");
    expect(params[5]).toBe(false); // noteProvided
    expect(params[6]).toBe(false); // followUpProvided
  });

  it("note set: value passes through with noteProvided=true", async () => {
    const { db, query } = mockDb({ ...ROW, note: "called" });
    await upsertCrmContact(db, patchOf({ email: "a@b.co", note: "called" }), null);
    const params = query.mock.calls[0][1] as unknown[];
    expect(params[2]).toBe("called");
    expect(params[5]).toBe(true);
    expect(params[4]).toBeNull(); // machine actor → updated_by null
  });

  it("explicit clear: note=null still marks noteProvided=true", async () => {
    const { db, query } = mockDb(ROW);
    await upsertCrmContact(db, patchOf({ email: "a@b.co", note: null }), null);
    const params = query.mock.calls[0][1] as unknown[];
    expect(params[2]).toBeNull();
    expect(params[5]).toBe(true);
  });

  it("returns the upserted row alongside what was (or was not) recorded", async () => {
    const { db } = mockDb({ ...ROW, stage: "customer" });
    const out = await upsertCrmContact(db, patchOf({ email: "a@b.co", stage: "customer" }), null);
    expect(out.contact).toEqual({ ...ROW, stage: "customer" });
    expect(out.degraded).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// SQL and params must agree — Postgres rejects a mismatched bind count
// ---------------------------------------------------------------------------

describe("the SQL and its parameters are built as a pair", () => {
  const cases: [string, boolean, boolean, unknown][] = [
    ["replace, with source", true, false, { email: "a@b.co", note: "x", source: "design-partner" }],
    ["replace, no source column", false, false, { email: "a@b.co", note: "x" }],
    ["append, with source", true, true, { email: "a@b.co", appendNote: "x", source: "design-partner" }],
    ["append, no source column", false, true, { email: "a@b.co", appendNote: "x" }],
  ];

  it.each(cases)("%s: every placeholder is supplied, and no extras", (_label, withSource, append, raw) => {
    const sql = buildCrmUpsertSql(withSource, append);
    const params = paramsFor(patchOf(raw), null, withSource);
    const placeholders = [...sql.matchAll(/\$(\d+)/g)].map((m) => Number(m[1]));
    const highest = Math.max(...placeholders);
    expect(highest, `SQL references $${highest} but ${params.length} params were supplied`).toBe(
      params.length
    );
    // Every index from 1..highest must actually appear, or the numbering lies.
    const used = new Set(placeholders);
    for (let i = 1; i <= highest; i++) {
      expect(used.has(i), `$${i} is never referenced in the SQL`).toBe(true);
    }
  });

  it("the source column only appears in the with-source variant", () => {
    expect(buildCrmUpsertSql(true, false)).toContain("source");
    expect(buildCrmUpsertSql(false, false)).not.toContain("source");
    expect(buildCrmUpsertSql(true, true)).toContain("source");
    expect(buildCrmUpsertSql(false, true)).not.toContain("source");
  });

  it("append concatenates onto the stored note; replace overwrites it", () => {
    expect(buildCrmUpsertSql(true, true)).toContain("CONCAT_WS");
    expect(buildCrmUpsertSql(true, false)).not.toContain("CONCAT_WS");
  });
});

// ---------------------------------------------------------------------------
// The dossier line — append, never replace
// ---------------------------------------------------------------------------

describe("appendNote writes a dated dossier line", () => {
  it("is tagged and dated so lib/dossier reads it as an entry", () => {
    const line = dossierLine("pack sent, call booked for Tue", new Date("2026-09-11T10:00:00Z"));
    expect(line).toBe("[design-partner] 2026-09-11 pack sent, call booked for Tue");
  });

  it("passes the built line as the note parameter", async () => {
    const { db, query } = mockDb(ROW);
    await upsertCrmContact(db, patchOf({ email: "a@b.co", appendNote: "pack sent" }), null);
    const params = query.mock.calls[0][1] as unknown[];
    expect(String(params[2])).toContain("[design-partner]");
    expect(String(params[2])).toContain("pack sent");
  });

  it("refuses note and appendNote together instead of guessing an order", () => {
    const r = normalizeCrmPatch({ email: "a@b.co", note: "x", appendNote: "y" });
    expect(r).toMatchObject({ ok: false, code: "NOTE_CONFLICT" });
  });

  it("refuses a blank append rather than writing an empty dated line", () => {
    expect(normalizeCrmPatch({ email: "a@b.co", appendNote: "   " })).toMatchObject({
      ok: false,
      code: "INVALID_APPEND",
    });
  });
});

// ---------------------------------------------------------------------------
// Pending migration: degrade on the label, REFUSE on the stage
// ---------------------------------------------------------------------------

describe("when migration 20260911000001 has not run", () => {
  it("retries without `source` and says the label was not stored", async () => {
    const { db, query } = mockDbFailingOnce("42703", ROW);
    const out = await upsertCrmContact(
      db,
      patchOf({ email: "a@b.co", stage: "contacted", source: "design-partner" }),
      null
    );
    expect(query).toHaveBeenCalledTimes(2);
    // The retry drops the source column AND its parameter.
    expect(String(query.mock.calls[1][0])).not.toContain("source");
    expect(out.contact).toEqual(ROW);
    expect(out.sourceRecorded).toBe(false);
    expect(out.degraded).toContain(CRM_FUNNEL_MIGRATION);
  });

  it("the stage/note write still lands — one label is cheaper than the row", async () => {
    const { db, query } = mockDbFailingOnce("42703", { ...ROW, note: "called" });
    const out = await upsertCrmContact(
      db,
      patchOf({ email: "a@b.co", stage: "contacted", note: "called", source: "cold" }),
      null
    );
    expect(out.contact?.note).toBe("called");
    expect(query.mock.calls[1][1]).toHaveLength(7); // no source param
  });

  it("REFUSES a funnel stage rather than storing a different one", async () => {
    const { db } = mockDbAlwaysFailing("23514");
    await expect(
      upsertCrmContact(db, patchOf({ email: "a@b.co", stage: "proposal" }), null)
    ).rejects.toBeInstanceOf(CrmStageUnsupportedError);
  });

  it("the refusal names the stage, the migration and says nothing was written", async () => {
    const { db } = mockDbAlwaysFailing("23514");
    await upsertCrmContact(db, patchOf({ email: "a@b.co", stage: "paid" }), null).then(
      () => {
        throw new Error("should have thrown");
      },
      (err: CrmStageUnsupportedError) => {
        expect(err.code).toBe("CRM_STAGE_MIGRATION_PENDING");
        expect(err.stage).toBe("paid");
        expect(err.message).toContain(CRM_FUNNEL_MIGRATION);
        expect(err.message).toContain("Nothing was written");
      }
    );
  });

  it("a CHECK violation on a PRE-EXISTING stage is a real error, not a migration excuse", async () => {
    const { db } = mockDbAlwaysFailing("23514");
    await expect(
      upsertCrmContact(db, patchOf({ email: "a@b.co", stage: "qualified" }), null)
    ).rejects.not.toBeInstanceOf(CrmStageUnsupportedError);
  });

  it("still catches the funnel stage when the CHECK only fires on the retry", async () => {
    // Column missing AND constraint old: first call 42703, retry 23514.
    const colErr = Object.assign(new Error("pg"), { code: "42703" });
    const checkErr = Object.assign(new Error("pg"), { code: "23514" });
    const query = vi.fn().mockRejectedValueOnce(colErr).mockRejectedValueOnce(checkErr);
    await expect(
      upsertCrmContact(
        { query } as never,
        patchOf({ email: "a@b.co", stage: "call_booked", source: "design-partner" }),
        null
      )
    ).rejects.toBeInstanceOf(CrmStageUnsupportedError);
  });

  it("an unrelated Postgres error is not swallowed", async () => {
    const { db } = mockDbAlwaysFailing("23505");
    await expect(
      upsertCrmContact(db, patchOf({ email: "a@b.co", stage: "contacted" }), null)
    ).rejects.toThrow("pg");
  });
});
