/**
 * hosted-content-debit.test.ts — P0-08, the money.
 *
 * Three properties, and the report asks for all three by name (RELATORIO §17,
 * "BYOK ausente usa provider hospedado onde plano permite" / "Draft failure
 * cria retry/alerta, não silêncio", and §16 P0-08 items 1, 2, 3, 7):
 *
 *   1. The debit is IDEMPOTENT. Reprocessing the same draft does not charge
 *      twice — and the guard is the database, not a read-then-write check.
 *   2. The ledger stays APPEND-ONLY. No UPDATE, no DELETE, ever, on a credit
 *      row — including on the failure path, where a refund would be tempting.
 *   3. The key CASCADES client → platform, and a failure alerts rather than
 *      going quiet.
 *
 * A fake PostgresClient records every statement, so "append-only" is asserted
 * against the SQL actually issued rather than trusted.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { PostgresClient } from "../../packages/shared/src/db-client";

vi.mock("../../packages/shared/src/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { debitForContentDraft, ContentLedgerNotReadyError } from "../../apps/api/src/lib/credits";
import {
  resolveContentKey,
  draftRefId,
  generateWithRetry,
  recordDraftFailure,
  findExistingDraft,
} from "../../apps/api/src/lib/hosted-content";

const TENANT = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

interface Recorded {
  sql: string;
  params: unknown[];
}

/**
 * A ledger that behaves like the real one: uniq_credit_ref makes a second
 * insert for the same ref a no-op, and SUM(delta) is the balance.
 */
function ledgerDb(opts?: { reasonCheckFails?: boolean }) {
  const rows: Array<{ ref: string; delta: number }> = [];
  const statements: Recorded[] = [];
  const db = {
    setTenantId: async () => {},
    async query(sql: string, params: unknown[] = []) {
      statements.push({ sql, params });
      if (sql.includes("INSERT INTO credit_ledger")) {
        if (opts?.reasonCheckFails) {
          const err = Object.assign(new Error('violates check constraint "credit_ledger_reason_check"'), {
            code: "23514",
            constraint: "credit_ledger_reason_check",
          });
          throw err;
        }
        const ref = String(params[2]);
        if (rows.some((r) => r.ref === ref)) return { rows: [] }; // ON CONFLICT DO NOTHING
        rows.push({ ref, delta: Number(params[1]) });
        return { rows: [{ id: String(rows.length) }] };
      }
      if (sql.includes("SUM(delta)")) {
        return { rows: [{ balance: String(10_000 + rows.reduce((a, r) => a + r.delta, 0)) }] };
      }
      return { rows: [] };
    },
  } as unknown as PostgresClient;
  return { db, rows, statements };
}

describe("debitForContentDraft — charged exactly once, or not at all", () => {
  it("charges the first time and reports charged:true", async () => {
    const { db, rows } = ledgerDb();
    const r = await debitForContentDraft(db, TENANT, "growth", draftRefId("audit:a1|action:t1|artifact:blog|v:1"), 26);
    expect(r.charged).toBe(true);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.delta).toBe(-26);
  });

  it("REPROCESSING THE SAME DRAFT DOES NOT CHARGE TWICE", async () => {
    // This is the property. Without the deterministic ref + uniq_credit_ref,
    // a retried job bills the customer again for one draft.
    const { db, rows } = ledgerDb();
    const ref = draftRefId("audit:a1|action:t1|artifact:blog|v:1");
    const first = await debitForContentDraft(db, TENANT, "growth", ref, 26);
    const second = await debitForContentDraft(db, TENANT, "growth", ref, 26);
    expect(first.charged).toBe(true);
    expect(second.charged).toBe(false);
    expect(rows).toHaveLength(1);
    // And the balance the customer is shown reflects ONE charge, not two.
    expect(second.balance).toBe(10_000 - 26);
  });

  it("a DIFFERENT version of the same action is a different, chargeable draft", async () => {
    const { db, rows } = ledgerDb();
    await debitForContentDraft(db, TENANT, "growth", draftRefId("audit:a1|action:t1|artifact:blog|v:1"), 26);
    await debitForContentDraft(db, TENANT, "growth", draftRefId("audit:a1|action:t1|artifact:blog|v:2"), 26);
    expect(rows).toHaveLength(2);
  });

  it("NEVER issues an UPDATE or DELETE against credit_ledger", async () => {
    // The ledger is append-only. A compensating UPDATE is how an audit trail
    // becomes an assertion.
    const { db, statements } = ledgerDb();
    const ref = draftRefId("k");
    await debitForContentDraft(db, TENANT, "growth", ref, 26);
    await debitForContentDraft(db, TENANT, "growth", ref, 26);
    const mutating = statements.filter(
      (s) => /credit_ledger/i.test(s.sql) && /\b(UPDATE|DELETE)\b/i.test(s.sql)
    );
    expect(mutating).toHaveLength(0);
  });

  it("refuses a zero or negative amount rather than writing a meaningless row", async () => {
    const { db } = ledgerDb();
    await expect(debitForContentDraft(db, TENANT, "growth", draftRefId("k"), 0)).rejects.toThrow();
    await expect(debitForContentDraft(db, TENANT, "growth", draftRefId("k"), -5)).rejects.toThrow();
  });

  it("reports the migration by NAME when the ledger cannot record 'content'", async () => {
    // "Mergeado não é produção": a feature whose dependency is missing says so,
    // naming the action that switches it on — it does not 500, and it certainly
    // does not carry on generating on our key unmetered.
    const { db } = ledgerDb({ reasonCheckFails: true });
    await expect(
      debitForContentDraft(db, TENANT, "growth", draftRefId("k"), 26)
    ).rejects.toBeInstanceOf(ContentLedgerNotReadyError);
    try {
      await debitForContentDraft(db, TENANT, "growth", draftRefId("k"), 26);
    } catch (e) {
      expect((e as Error).message).toContain("20260904000001");
    }
  });
});

describe("draftRefId", () => {
  it("is a UUID, deterministic, and distinct per generation key", () => {
    const a = draftRefId("audit:a1|action:t1|artifact:blog|v:1");
    const b = draftRefId("audit:a1|action:t1|artifact:blog|v:2");
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(a).toBe(draftRefId("audit:a1|action:t1|artifact:blog|v:1"));
    expect(a).not.toBe(b);
  });
});

describe("resolveContentKey — client first, ours second", () => {
  const ENV = "ANTHROPIC_API_KEY";
  const saved = process.env[ENV];
  beforeEach(() => { delete process.env[ENV]; });
  afterEach(() => { if (saved === undefined) delete process.env[ENV]; else process.env[ENV] = saved; });

  it("prefers the client's BYOK key and marks it as theirs", async () => {
    process.env[ENV] = "sk-platform";
    const r = await resolveContentKey("anthropic", async () => "sk-client");
    expect(r.source).toBe("client");
    expect(r.apiKey).toBe("sk-client");
  });

  it("FALLS BACK TO THE PLATFORM KEY when the client has none — the P0-08 fix", async () => {
    // Before this change, no client key meant no draft. That was the wall.
    process.env[ENV] = "sk-platform";
    const r = await resolveContentKey("anthropic", async () => null);
    expect(r.source).toBe("platform");
    expect(r.apiKey).toBe("sk-platform");
  });

  it("reports 'none' when neither side has a key — an operator problem, stated as one", async () => {
    const r = await resolveContentKey("anthropic", async () => null);
    expect(r.source).toBe("none");
    expect(r.apiKey).toBeNull();
  });

  it("a corrupt BYOK blob does not deny the customer a draft our key could write", async () => {
    process.env[ENV] = "sk-platform";
    const r = await resolveContentKey("anthropic", async () => {
      throw new Error("decrypt failed");
    });
    expect(r.source).toBe("platform");
  });

  it("treats a whitespace-only key as no key", async () => {
    process.env[ENV] = "   ";
    const r = await resolveContentKey("anthropic", async () => "  ");
    expect(r.source).toBe("none");
  });
});

describe("generateWithRetry", () => {
  const noSleep = async () => {};

  it("returns the artifact on the first success without retrying", async () => {
    const attempt = vi.fn(async () => ({ value: "draft", reason: null }));
    const r = await generateWithRetry<string>(attempt, { sleep: noSleep });
    expect(r.value).toBe("draft");
    expect(r.attempts).toBe(1);
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it("retries a transient failure and succeeds", async () => {
    let n = 0;
    const r = await generateWithRetry<string>(
      async () => (++n < 3 ? { value: null, reason: "provider_no_draft" } : { value: "draft", reason: null }),
      { sleep: noSleep }
    );
    expect(r.value).toBe("draft");
    expect(r.attempts).toBe(3);
  });

  it("gives up after the attempt budget and reports WHY", async () => {
    const r = await generateWithRetry<string>(
      async () => ({ value: null, reason: "provider_no_draft" }),
      { sleep: noSleep }
    );
    expect(r.value).toBeNull();
    expect(r.reason).toBe("provider_no_draft");
    expect(r.attempts).toBe(3);
  });

  it("does NOT retry a permanent refusal — re-asking spends money to fail identically", async () => {
    const attempt = vi.fn(async () => ({ value: null, reason: "fact_check_failed" }));
    const r = await generateWithRetry<string>(attempt, { sleep: noSleep });
    expect(attempt).toHaveBeenCalledTimes(1);
    expect(r.reason).toBe("fact_check_failed");
  });

  it("treats a thrown provider error as a failed attempt, not a crashed request", async () => {
    let n = 0;
    const r = await generateWithRetry<string>(
      async () => {
        if (++n === 1) throw new Error("ECONNRESET");
        return { value: "draft", reason: null };
      },
      { sleep: noSleep }
    );
    expect(r.value).toBe("draft");
  });

  it("waits between attempts, exponentially", async () => {
    const waits: number[] = [];
    await generateWithRetry<string>(async () => ({ value: null, reason: "provider_no_draft" }), {
      sleep: async (ms) => { waits.push(ms); },
    });
    expect(waits).toEqual([2000, 4000]);
  });
});

describe("recordDraftFailure — no silence", () => {
  it("writes a dead-letter row AND alerts, and records whether the alert LEFT the process", async () => {
    // Telegram not configured → alertOps returns false. The row must record
    // alerted:false, not the intention to alert. "Vigia também mente" (30/07).
    delete process.env["TELEGRAM_BOT_TOKEN"];
    delete process.env["TELEGRAM_CHAT_ID"];
    const inserts: Recorded[] = [];
    const db = {
      setTenantId: async () => {},
      async query(sql: string, params: unknown[] = []) {
        inserts.push({ sql, params });
        return { rows: [] };
      },
    } as unknown as PostgresClient;

    const r = await recordDraftFailure(db, {
      tenantId: TENANT,
      brandId: "b1",
      generationKey: "audit:a1|action:t1|artifact:blog|v:1",
      reason: "provider_no_draft",
      attempts: 3,
      keySource: "platform",
    });
    expect(r.persisted).toBe(true);
    expect(r.alerted).toBe(false);
    const dl = inserts.find((s) => s.sql.includes("content_generation_failure"));
    expect(dl).toBeDefined();
    expect(dl!.params).toContain("provider_no_draft");
    expect(dl!.params).toContain(false); // alerted
  });

  it("NEVER throws — a dead-letter writer that can 500 loses the record it exists to keep", async () => {
    const db = {
      setTenantId: async () => {},
      async query() {
        throw new Error('relation "content_generation_failure" does not exist');
      },
    } as unknown as PostgresClient;
    const r = await recordDraftFailure(db, {
      tenantId: TENANT,
      brandId: null,
      generationKey: "k",
      reason: "provider_no_draft",
      attempts: 3,
      keySource: "platform",
    });
    expect(r.persisted).toBe(false);
  });
});

describe("findExistingDraft", () => {
  it("returns the existing draft for a known generation key", async () => {
    const db = {
      setTenantId: async () => {},
      async query() {
        return { rows: [{ id: "cp1", content_type: "blog", title: "T", body: "B", schema_markup: null, status: "draft", created_at: "now" }] };
      },
    } as unknown as PostgresClient;
    const d = await findExistingDraft(db, TENANT, "k");
    expect(d && d.id).toBe("cp1");
  });

  it("returns UNDEFINED (unknown), not null, when the column is missing", async () => {
    // undefined means "we could not check", and the route must not read that as
    // "no draft exists". Dado ausente nunca vira zero.
    const db = {
      setTenantId: async () => {},
      async query() {
        throw new Error('column "generation_key" does not exist');
      },
    } as unknown as PostgresClient;
    expect(await findExistingDraft(db, TENANT, "k")).toBeUndefined();
  });
});
