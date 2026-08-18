/**
 * nurture-send.test.ts — apps/worker/src/jobs/nurture-send.ts (dispatch guard)
 *
 * This is the test that would have caught the bug class that hid all week:
 * a nurture sequence enrolled by a webhook, then never sent because the worker
 * had no sender wired for that (sequence, step) pair — it threw
 * "Unknown nurture step", the row was retried forever, and NOTHING screamed.
 *
 * It drives the REAL dispatchEmail over EVERY (sequence, step) pair for ALL 9
 * sequences, across the full step range declared by nurtureTotalSteps(), and
 * proves:
 *   1. no pair throws "Unknown nurture step" — every enrolled step has a sender;
 *   2. every pair routes to EXACTLY ONE sender (no silent fall-through);
 *   3. catalog sequences reach the catalog sender with (sequence, step);
 *      bespoke sequences reach their dedicated sender;
 *   4. a step BEYOND the declared range still throws the guard (the guard works);
 *   5. the inter-step delay the worker uses is nurtureNextStepDelayMs() and
 *      matches the founder 0/1/2/2 cadence;
 *   6. NURTURE_CHAIN chaining (kit_to_growth → kit_to_dfy) enrolls the next rung.
 *
 * Every email sender is mocked to a no-op spy so nothing sends and no
 * RESEND_API_KEY is needed. The senders are stubbed, but dispatchEmail itself
 * is the real function — the throw it can produce is exactly what we assert on.
 *
 * Deeper chain / poll / idempotency coverage lives in nurture-worker-chain.test.ts;
 * this file owns the exhaustive (sequence, step) routing matrix.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// --- logger: silence -------------------------------------------------------
const logged = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock("../../packages/shared/src/logger", () => ({ logger: logged }));

// --- catalog sender: stub the send, keep isCatalogSequence real ------------
const catalogSend = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("../../packages/shared/src/emails/nurture-catalog", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../../packages/shared/src/emails/nurture-catalog")>();
  return { ...orig, sendNurtureCatalogEmail: catalogSend };
});

// --- bespoke senders: one distinct spy each --------------------------------
const free1 = vi.hoisted(() => vi.fn(async () => {}));
const free2 = vi.hoisted(() => vi.fn(async () => {}));
const free3 = vi.hoisted(() => vi.fn(async () => {}));
const free4 = vi.hoisted(() => vi.fn(async () => {}));
const kit1 = vi.hoisted(() => vi.fn(async () => {}));
const kit2 = vi.hoisted(() => vi.fn(async () => {}));
const kit3 = vi.hoisted(() => vi.fn(async () => {}));
const growth1 = vi.hoisted(() => vi.fn(async () => {}));
const growth2 = vi.hoisted(() => vi.fn(async () => {}));
const growth3 = vi.hoisted(() => vi.fn(async () => {}));
const aiAudit1 = vi.hoisted(() => vi.fn(async () => {}));
const aiAudit2 = vi.hoisted(() => vi.fn(async () => {}));

vi.mock("../../packages/shared/src/emails/nurture-free-1", () => ({ sendNurtureFree1Email: free1 }));
vi.mock("../../packages/shared/src/emails/nurture-free-2", () => ({ sendNurtureFree2Email: free2 }));
vi.mock("../../packages/shared/src/emails/nurture-free-3", () => ({ sendNurtureFree3Email: free3 }));
vi.mock("../../packages/shared/src/emails/nurture-free-4", () => ({ sendNurtureFree4Email: free4 }));
vi.mock("../../packages/shared/src/emails/nurture-kit-1", () => ({ sendNurtureKit1Email: kit1 }));
vi.mock("../../packages/shared/src/emails/nurture-kit-2", () => ({ sendNurtureKit2Email: kit2 }));
vi.mock("../../packages/shared/src/emails/nurture-kit-3", () => ({ sendNurtureKit3Email: kit3 }));
vi.mock("../../packages/shared/src/emails/nurture-growth-1", () => ({ sendNurtureGrowth1Email: growth1 }));
vi.mock("../../packages/shared/src/emails/nurture-growth-2", () => ({ sendNurtureGrowth2Email: growth2 }));
vi.mock("../../packages/shared/src/emails/nurture-growth-3", () => ({ sendNurtureGrowth3Email: growth3 }));
vi.mock("../../packages/shared/src/emails/nurture-ai-audit-1", () => ({ sendNurtureAiAudit1Email: aiAudit1 }));
vi.mock("../../packages/shared/src/emails/nurture-ai-audit-2", () => ({ sendNurtureAiAudit2Email: aiAudit2 }));

import { dispatchEmail, enrollChainedSequence } from "../../apps/worker/src/jobs/nurture-send";
import {
  ALL_NURTURE_SEQUENCES,
  FOUNDER_CADENCE_MS,
  NURTURE_CHAIN,
  nurtureNextStepDelayMs,
  nurtureTotalSteps,
  type NurtureSequence,
} from "../../packages/shared/src/nurture-cadence";
import { isCatalogSequence } from "../../packages/shared/src/emails/nurture-catalog";

const DAY = 24 * 60 * 60 * 1000;

const ALL_SPIES = [
  free1, free2, free3, free4,
  kit1, kit2, kit3,
  growth1, growth2, growth3,
  aiAudit1, aiAudit2,
  catalogSend,
];

function totalSpyCalls(): number {
  return ALL_SPIES.reduce((sum, s) => sum + s.mock.calls.length, 0);
}

function clearAllSpies(): void {
  for (const s of ALL_SPIES) s.mockClear();
}

const PARAMS = { to: "buyer@example.com", brand: "Acme", unsubscribeUrl: "https://ozvor.com/u?token=t" };

beforeEach(() => {
  logged.info.mockClear();
  logged.warn.mockClear();
  logged.error.mockClear();
  clearAllSpies();
  // Deliberately NO RESEND_API_KEY: senders are stubbed, nothing must send.
  delete process.env.RESEND_API_KEY;
});

describe("dispatchEmail routes EVERY (sequence, step) pair — the silent-failure guard", () => {
  it("covers all 9 sequences and no pair throws 'Unknown nurture step'", async () => {
    // Sanity: the catalog said there are 9 sequences.
    expect(ALL_NURTURE_SEQUENCES).toHaveLength(9);
    expect(new Set(ALL_NURTURE_SEQUENCES).size).toBe(9);

    let pairs = 0;
    for (const sequence of ALL_NURTURE_SEQUENCES) {
      const steps = nurtureTotalSteps(sequence);
      for (let step = 0; step < steps; step++) {
        clearAllSpies();
        // The core assertion: a real (sequence, step) NEVER throws.
        await expect(
          dispatchEmail(sequence, step, PARAMS),
          `${sequence}#${step} must route to a sender, not throw`
        ).resolves.toBeUndefined();
        // Exactly one sender fired — no silent fall-through, no double dispatch.
        expect(totalSpyCalls(), `${sequence}#${step} routed to exactly one sender`).toBe(1);
        pairs++;
      }
    }
    // 4+3+3+2+3+2+2+3+2 = 24 enrolled steps across the 9 sequences.
    const expectedPairs = ALL_NURTURE_SEQUENCES.reduce((n, s) => n + nurtureTotalSteps(s), 0);
    expect(pairs).toBe(expectedPairs);
    expect(pairs).toBe(24);
  });

  it("catalog sequences reach the catalog sender with the same (sequence, step)", async () => {
    for (const sequence of ALL_NURTURE_SEQUENCES) {
      if (!isCatalogSequence(sequence)) continue;
      const steps = nurtureTotalSteps(sequence);
      for (let step = 0; step < steps; step++) {
        clearAllSpies();
        await dispatchEmail(sequence, step, PARAMS);
        expect(catalogSend, `${sequence}#${step}`).toHaveBeenCalledTimes(1);
        const [seqArg, stepArg] = catalogSend.mock.calls[0] as unknown[];
        expect(seqArg).toBe(sequence);
        expect(stepArg).toBe(step);
      }
    }
  });

  it("bespoke sequences reach their dedicated senders in step order", async () => {
    const expected: Record<string, ReturnType<typeof vi.fn>[]> = {
      free_to_kit: [free1, free2, free3, free4],
      kit_to_growth: [growth1, growth2, growth3],
      kit_to_dfy: [kit1, kit2, kit3],
      ai_audit_to_full: [aiAudit1, aiAudit2],
    };
    for (const [sequence, senders] of Object.entries(expected)) {
      // These are the non-catalog sequences; make sure the table stays honest.
      expect(isCatalogSequence(sequence as NurtureSequence)).toBe(false);
      expect(senders).toHaveLength(nurtureTotalSteps(sequence as NurtureSequence));
      for (let step = 0; step < senders.length; step++) {
        clearAllSpies();
        await dispatchEmail(sequence as NurtureSequence, step, PARAMS);
        expect(senders[step], `${sequence}#${step}`).toHaveBeenCalledTimes(1);
        expect(catalogSend).not.toHaveBeenCalled();
      }
    }
  });

  it("a step BEYOND the declared range throws the guard (the guard actually fires)", async () => {
    // Bespoke sequences fall through to the throw in dispatchEmail itself.
    await expect(dispatchEmail("free_to_kit", 4, PARAMS)).rejects.toThrow(/Unknown nurture step/);
    await expect(dispatchEmail("kit_to_growth", 3, PARAMS)).rejects.toThrow(/Unknown nurture step/);
    await expect(dispatchEmail("kit_to_dfy", 9, PARAMS)).rejects.toThrow(/Unknown nurture step/);
    await expect(dispatchEmail("ai_audit_to_full", 2, PARAMS)).rejects.toThrow(/Unknown nurture step/);
  });
});

describe("inter-step delays: worker uses nurtureNextStepDelayMs() == founder 0/1/2/2 cadence", () => {
  it("every sequence's per-step delay equals the prefix of the founder rule", () => {
    for (const sequence of ALL_NURTURE_SEQUENCES) {
      const steps = nurtureTotalSteps(sequence);
      for (let sentStep = 0; sentStep < steps - 1; sentStep++) {
        expect(
          nurtureNextStepDelayMs(sequence, sentStep),
          `${sequence} after step ${sentStep}`
        ).toBe(FOUNDER_CADENCE_MS[sentStep + 1]);
      }
    }
  });

  it("representative values: step 0 → step 1 is +1 day; step 1 → step 2 is +2 days", () => {
    // credit_pack_bought only has the first hop.
    expect(nurtureNextStepDelayMs("credit_pack_bought", 0)).toBe(DAY);
    // three-step sequences have both hops.
    expect(nurtureNextStepDelayMs("kit_to_growth", 0)).toBe(DAY);
    expect(nurtureNextStepDelayMs("kit_to_growth", 1)).toBe(2 * DAY);
    expect(nurtureNextStepDelayMs("subscriber_onboarding", 0)).toBe(DAY);
    expect(nurtureNextStepDelayMs("subscriber_onboarding", 1)).toBe(2 * DAY);
  });

  it("out-of-range cursor never returns 0 (a bad cursor must not flood)", () => {
    expect(nurtureNextStepDelayMs("free_to_kit", 99)).toBe(2 * DAY);
  });
});

describe("NURTURE_CHAIN: last step of kit_to_growth enrolls kit_to_dfy", () => {
  interface Call { text: string; values: unknown[] }
  function makeSql(answer: (text: string) => unknown[]) {
    const calls: Call[] = [];
    const sql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.raw.join("?").replace(/\s+/g, " ").trim();
      calls.push({ text, values });
      return Promise.resolve(answer(text));
    }) as unknown as import("postgres").Sql & { _calls: Call[] };
    (sql as unknown as { json: (v: unknown) => unknown }).json = (v) => ({ __json: v });
    (sql as unknown as { _calls: Call[] })._calls = calls;
    return sql;
  }

  const completedGrowth = {
    id: "enr-1",
    email: "buyer@example.com",
    sequence: "kit_to_growth" as const,
    current_step: 2,
    total_steps: 3,
    unsubscribe_token: "tok",
    brand: "Acme",
    metadata: {},
  };

  it("chain target and step count come from the cadence, not a literal", async () => {
    expect(NURTURE_CHAIN.kit_to_growth).toBe("kit_to_dfy");
    const sql = makeSql((text) => {
      if (text.includes("FROM users u JOIN tenants t")) return []; // no paid plan
      if (text.startsWith("INSERT INTO nurture_enrollment")) return [{ id: "enr-2" }];
      return [];
    });
    await enrollChainedSequence(sql, completedGrowth);
    const insert = sql._calls.find((c) => c.text.startsWith("INSERT INTO nurture_enrollment"));
    expect(insert).toBeDefined();
    expect(insert!.values[1]).toBe("kit_to_dfy");
    // Interpolated values: [email, next, total_steps, brand, metadata] — the
    // literal current_step `0` is not interpolated, so total_steps is index 2.
    expect(insert!.values[2]).toBe(nurtureTotalSteps("kit_to_dfy"));
  });

  it("a sequence with no chain entry enrolls nothing", async () => {
    const sql = makeSql(() => []);
    await enrollChainedSequence(sql, {
      ...completedGrowth,
      sequence: "credit_pack_bought",
      total_steps: 2,
      current_step: 1,
    });
    expect(sql._calls).toHaveLength(0);
  });
});
