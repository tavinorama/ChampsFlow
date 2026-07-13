/**
 * Unit — upsertCrmContact param wiring (apps/api/src/lib/crm).
 *
 * The admin route and the Hermes operator route share this upsert, so the SQL
 * parameter order must stay correct: an omitted note/follow-up must pass its
 * "provided" flag as false (so the CASE keeps the stored value), and a set value
 * must pass through. Mocks the db — no real Postgres needed.
 */
import { describe, it, expect, vi } from "vitest";
import { upsertCrmContact } from "../../../apps/api/src/lib/crm";
import { normalizeCrmPatch } from "../../../apps/api/src/lib/crm-validation";

function mockDb(row: unknown) {
  const query = vi.fn().mockResolvedValue({ rows: [row] });
  return { db: { query } as never, query };
}

function patchOf(raw: unknown) {
  const r = normalizeCrmPatch(raw);
  if (!r.ok) throw new Error(`unexpected invalid patch: ${r.code}`);
  return r.patch;
}

describe("upsertCrmContact", () => {
  it("stage-only patch: stage param set, note/follow-up NOT provided", async () => {
    const { db, query } = mockDb({ email: "a@b.co", stage: "contacted", note: null, next_follow_up: null, updated_at: "t" });
    await upsertCrmContact(db, patchOf({ email: "a@b.co", stage: "contacted" }), "user-1");
    const params = query.mock.calls[0][1] as unknown[];
    // [email, stage, note, next_follow_up, updatedBy, noteProvided, followUpProvided]
    expect(params[0]).toBe("a@b.co");
    expect(params[1]).toBe("contacted");
    expect(params[4]).toBe("user-1");
    expect(params[5]).toBe(false); // noteProvided
    expect(params[6]).toBe(false); // followUpProvided
  });

  it("note set: value passes through with noteProvided=true", async () => {
    const { db, query } = mockDb({ email: "a@b.co", stage: "new", note: "called", next_follow_up: null, updated_at: "t" });
    await upsertCrmContact(db, patchOf({ email: "a@b.co", note: "called" }), null);
    const params = query.mock.calls[0][1] as unknown[];
    expect(params[2]).toBe("called");
    expect(params[5]).toBe(true);
    expect(params[4]).toBeNull(); // machine actor → updated_by null
  });

  it("explicit clear: note=null still marks noteProvided=true", async () => {
    const { db, query } = mockDb({ email: "a@b.co", stage: "new", note: null, next_follow_up: null, updated_at: "t" });
    await upsertCrmContact(db, patchOf({ email: "a@b.co", note: null }), null);
    const params = query.mock.calls[0][1] as unknown[];
    expect(params[2]).toBeNull();
    expect(params[5]).toBe(true);
  });

  it("returns the upserted row", async () => {
    const row = { email: "a@b.co", stage: "customer", note: null, next_follow_up: null, updated_at: "t" };
    const { db } = mockDb(row);
    const out = await upsertCrmContact(db, patchOf({ email: "a@b.co", stage: "customer" }), null);
    expect(out).toEqual(row);
  });
});
