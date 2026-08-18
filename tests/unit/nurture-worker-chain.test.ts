/**
 * nurture-worker-chain.test.ts — apps/worker/src/jobs/nurture-send.ts
 *
 * Pins:
 *   - inter-step delay written by the worker == founder rule (0/1/2/2)
 *   - chain: last kit_to_growth step sent + no paid plan → kit_to_dfy enrolled at 0d
 *   - chain skipped when the email already has a paid plan
 *   - chain tolerates the CHECK constraint (nurture_sequence_not_allowed, no throw)
 *   - other sequences never chain
 *   - dispatchEmail routes catalog sequences to the catalog sender
 *
 * The postgres-js `sql` tagged template is faked: every call records the
 * joined SQL text + interpolated values, and answers from a small script.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const logged = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock("../../packages/shared/src/logger", () => ({ logger: logged }));

const catalogSend = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("../../packages/shared/src/emails/nurture-catalog", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../../packages/shared/src/emails/nurture-catalog")>();
  return { ...orig, sendNurtureCatalogEmail: catalogSend };
});
const growth1 = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("../../packages/shared/src/emails/nurture-growth-1", () => ({
  sendNurtureGrowth1Email: growth1,
}));

import {
  processNurtureJobs,
  enrollChainedSequence,
  hasPaidSubscription,
  dispatchEmail,
} from "../../apps/worker/src/jobs/nurture-send";

const DAY = 24 * 60 * 60 * 1000;

interface Call {
  text: string;
  values: unknown[];
}

/** Fake postgres-js client: sql`...` returns whatever `answer(text)` says. */
function makeSql(answer: (text: string, values: unknown[]) => unknown[]) {
  const calls: Call[] = [];
  const sql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.raw.join("?").replace(/\s+/g, " ").trim();
    calls.push({ text, values });
    return Promise.resolve(answer(text, values));
  }) as unknown as import("postgres").Sql & { _calls: Call[] };
  (sql as unknown as { json: (v: unknown) => unknown }).json = (v: unknown) => ({ __json: v });
  (sql as unknown as { _calls: Call[] })._calls = calls;
  return sql;
}

const growthRowLastStep = {
  id: "enr-1",
  email: "buyer@example.com",
  sequence: "kit_to_growth" as const,
  current_step: 2, // last of 3
  total_steps: 3,
  unsubscribe_token: "tok",
  brand: "Acme",
  metadata: { orderId: "kit-1" },
};

beforeEach(() => {
  logged.info.mockClear();
  logged.warn.mockClear();
  logged.error.mockClear();
  catalogSend.mockClear();
  growth1.mockClear();
  process.env.RESEND_API_KEY = "re_test";
});

describe("chain kit_to_growth → kit_to_dfy", () => {
  it("enrolls kit_to_dfy at 0d when the buyer has no paid plan", async () => {
    const sql = makeSql((text) => {
      if (text.includes("FROM users u JOIN tenants t")) return []; // no paid plan
      if (text.startsWith("INSERT INTO nurture_enrollment")) return [{ id: "enr-2" }];
      return [];
    });
    await enrollChainedSequence(sql, growthRowLastStep);
    const insert = sql._calls.find((c) => c.text.startsWith("INSERT INTO nurture_enrollment"));
    expect(insert).toBeDefined();
    expect(insert!.values[0]).toBe("buyer@example.com");
    expect(insert!.values[1]).toBe("kit_to_dfy");
    expect(insert!.values[2]).toBe(3); // total_steps of kit_to_dfy
    expect(insert!.text).toContain("next_send_at, suppressed"); // column present
    expect(insert!.text).toContain("NOW(), FALSE"); // next_send_at = NOW() → 0d
    expect(insert!.text).toContain("ON CONFLICT (email, sequence) DO NOTHING");
    const ev = logged.info.mock.calls.find(([e]) => e === "nurture_chain_enrolled");
    expect(ev).toBeDefined();
    expect((ev![1] as { to: string }).to).toBe("kit_to_dfy");
  });

  it("skips the chain when the email already has a paid plan", async () => {
    const sql = makeSql((text) => {
      if (text.includes("FROM users u JOIN tenants t")) return [{ one: 1 }];
      return [];
    });
    await enrollChainedSequence(sql, growthRowLastStep);
    expect(sql._calls.some((c) => c.text.startsWith("INSERT INTO nurture_enrollment"))).toBe(false);
    expect(logged.info.mock.calls.some(([e]) => e === "nurture_chain_skipped_converted")).toBe(true);
  });

  it("CHECK constraint not widened yet → nurture_sequence_not_allowed, no throw", async () => {
    const sql = makeSql((text) => {
      if (text.includes("FROM users u JOIN tenants t")) return [];
      if (text.startsWith("INSERT INTO nurture_enrollment")) {
        const err = new Error("violates check constraint \"nurture_enrollment_sequence_check\"") as Error & {
          code: string;
        };
        err.code = "23514";
        throw err;
      }
      return [];
    });
    await expect(enrollChainedSequence(sql, growthRowLastStep)).resolves.toBeUndefined();
    const ev = logged.error.mock.calls.find(([e]) => e === "nurture_sequence_not_allowed");
    expect(ev).toBeDefined();
    expect((ev![1] as { sequence: string }).sequence).toBe("kit_to_dfy");
  });

  it("only kit_to_growth chains; a completed free_to_kit does nothing", async () => {
    const sql = makeSql(() => []);
    await enrollChainedSequence(sql, { ...growthRowLastStep, sequence: "free_to_kit", total_steps: 4, current_step: 3 });
    expect(sql._calls).toHaveLength(0);
  });

  it("hasPaidSubscription: true only when tenants.plan_tier <> 'free'", async () => {
    const yes = makeSql(() => [{ one: 1 }]);
    const no = makeSql(() => []);
    expect(await hasPaidSubscription(yes, "a@b.c")).toBe(true);
    expect(await hasPaidSubscription(no, "a@b.c")).toBe(false);
    expect(yes._calls[0]!.text).toContain("t.plan_tier <> 'free'");
  });
});

describe("processNurtureJobs: delays follow the founder rule and the chain fires end to end", () => {
  it("after step 0 of kit_to_growth, next_send_at = +1d", async () => {
    const row = { ...growthRowLastStep, current_step: 0 };
    const sql = makeSql((text) => {
      if (text.startsWith("SELECT id, email, sequence")) return [row];
      if (text.startsWith("SELECT id FROM nurture_send_log")) return [];
      if (text.startsWith("SELECT suppressed FROM nurture_enrollment")) return [{ suppressed: false }];
      return [];
    });
    await processNurtureJobs(sql);
    expect(growth1).toHaveBeenCalledTimes(1);
    const upd = sql._calls.find((c) => c.text.includes("next_send_at = NOW() + ("));
    expect(upd).toBeDefined();
    expect(upd!.values).toContain(String(DAY)); // +1 day after step 0
  });

  it("last step of kit_to_growth sent → completed_at set → kit_to_dfy enrolled", async () => {
    // Step 2 of kit_to_growth uses nurture-growth-3 (real module, needs fetch); mock via env-less throw
    // is not what we want here, so route through the catalog by using a catalog sequence instead:
    // subscriber_onboarding has no chain, so we test the chain by driving kit_to_growth's last step
    // with the growth-3 sender stubbed at the fetch level.
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "msg_1" }), { status: 200 }) as never
    );
    const sql = makeSql((text) => {
      if (text.startsWith("SELECT id, email, sequence")) return [growthRowLastStep];
      if (text.startsWith("SELECT id FROM nurture_send_log")) return [];
      if (text.startsWith("SELECT suppressed FROM nurture_enrollment")) return [{ suppressed: false }];
      if (text.includes("FROM users u JOIN tenants t")) return []; // not converted
      if (text.startsWith("INSERT INTO nurture_enrollment")) return [{ id: "enr-2" }];
      return [];
    });
    await processNurtureJobs(sql);
    fetchSpy.mockRestore();
    expect(sql._calls.some((c) => c.text.includes("completed_at = NOW()"))).toBe(true);
    const insert = sql._calls.find((c) => c.text.startsWith("INSERT INTO nurture_enrollment"));
    expect(insert).toBeDefined();
    expect(insert!.values[1]).toBe("kit_to_dfy");
    expect(logged.info.mock.calls.some(([e]) => e === "nurture_step_sent")).toBe(true);
  });

  it("catalog sequence (credit_pack_bought) dispatches through the catalog sender and waits +1d", async () => {
    const row = {
      ...growthRowLastStep,
      id: "enr-cp",
      sequence: "credit_pack_bought" as const,
      current_step: 0,
      total_steps: 2,
    };
    const sql = makeSql((text) => {
      if (text.startsWith("SELECT id, email, sequence")) return [row];
      if (text.startsWith("SELECT id FROM nurture_send_log")) return [];
      if (text.startsWith("SELECT suppressed FROM nurture_enrollment")) return [{ suppressed: false }];
      return [];
    });
    await processNurtureJobs(sql);
    expect(catalogSend).toHaveBeenCalledTimes(1);
    expect((catalogSend.mock.calls[0] as unknown[])[0]).toBe("credit_pack_bought");
    expect((catalogSend.mock.calls[0] as unknown[])[1]).toBe(0);
    const upd = sql._calls.find((c) => c.text.includes("next_send_at = NOW() + ("));
    expect(upd!.values).toContain(String(DAY));
  });
});

describe("dispatchEmail routing", () => {
  it("routes every catalog sequence/step to sendNurtureCatalogEmail", async () => {
    const params = { to: "a@b.c", brand: "X", unsubscribeUrl: "u" };
    await dispatchEmail("pages_bought", 1, params);
    await dispatchEmail("ai_audit_bought", 2, params);
    await dispatchEmail("book_to_dfy", 0, params);
    await dispatchEmail("subscriber_onboarding", 2, params);
    expect(catalogSend).toHaveBeenCalledTimes(4);
  });
  it("legacy sequences keep their dedicated senders", async () => {
    await dispatchEmail("kit_to_growth", 0, { to: "a@b.c", brand: "X", unsubscribeUrl: "u" });
    expect(growth1).toHaveBeenCalledTimes(1);
    expect(catalogSend).not.toHaveBeenCalled();
  });
});
