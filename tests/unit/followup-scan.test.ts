/**
 * Unit — the follow-up scan job (5.A.2, apps/worker/src/jobs/followup-scan.ts).
 *
 * Fake sql routed on the queries' own /* fu:* *\/ markers (the
 * graph-tick-starvation.test.ts pattern) + injected ports. What is pinned:
 *
 *  - reply → intent → draft → PORTÃO: the approval box carries the SAME
 *    ap:/rj: buttons every graph uses, the proposto marker lands on the CRM
 *    note, and the draft + meta live in Redis artifacts;
 *  - approve → the SmartLead reply API is called EXACTLY once, and a re-scan
 *    sends nothing again (run closed + marker idempotency);
 *  - reject and 96h silence → nothing is ever sent;
 *  - unsubscribe short-circuits: no draft, stage per the webhook's own rule,
 *    silent; auto-reply noise: marked, silent, zero LLM calls;
 *  - missing SMARTLEAD_API_KEY → loud manual delivery with the nominal
 *    unlocking action (never a silent OFF);
 *  - missing HERMES_TASK_TOKEN with replies waiting → loud OFF alarm;
 *  - the stored payload is the production double-encoded jsonb string.
 */
import { describe, it, expect } from "vitest";
import type postgres from "postgres";
import { runFollowupScan, type FollowupPorts } from "../../apps/worker/src/jobs/followup-scan";
import { FOLLOWUP_GRAPH } from "../../apps/api/src/lib/followup";

const NOW = new Date("2026-09-01T12:00:00.000Z");
const EVENT_A = "11111111-2222-3333-4444-555555555555";

/** Production shape: the webhook JSON.stringify's, the driver re-serializes. */
function doubleEncodedPayload(text: string, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    event_type: "EMAIL_REPLY",
    campaign_id: 3888686,
    stats_id: "stats-1",
    reply_message: { message_id: "<m1@x>", text },
    ...extra,
  });
}

const GOOD_DRAFT = [
  "Thanks for asking. The audit costs $49.",
  "You answer 5 questions in 60 seconds.",
  "Money back in 30 days if it tells you nothing new.",
  "Otavio",
].join("\n");

interface ReplyInit {
  id: string;
  email: string;
  campaignId?: number | null;
  payload: unknown;
  stage?: string | null;
  note?: string | null;
}

function makeWorld(init: { replies?: ReplyInit[] }) {
  const contacts = new Map<string, { stage: string | null; note: string | null }>();
  for (const r of init.replies ?? []) {
    contacts.set(r.email, { stage: r.stage ?? "contacted", note: r.note ?? null });
  }
  const replies = (init.replies ?? []).map((r) => ({
    id: r.id,
    lead_email: r.email,
    campaign_id: r.campaignId === undefined ? 3888686 : r.campaignId,
    payload: r.payload,
    received_at: NOW.toISOString(),
  }));

  interface Parked {
    run_id: string;
    step_id: string;
    status: string;
    started_at: string;
  }
  const parked: Parked[] = [];
  const stepDecisions: Array<{ status: string; summary: string; stepId: string }> = [];
  const runFinishes: Array<{ status: string; runId: string }> = [];
  const markers: string[] = [];
  let seq = 0;

  const sql = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join("$");
    if (text.includes("fu:parked")) {
      return parked.filter(() => true);
    }
    if (text.includes("fu:replies")) {
      return replies.map((r) => ({
        ...r,
        stage: contacts.get(r.lead_email)?.stage ?? null,
        note: contacts.get(r.lead_email)?.note ?? null,
      }));
    }
    if (text.includes("fu:mark")) {
      const [email, stageDefault, line, , stageParam] = values as [string, string, string, string, string | null];
      const c = contacts.get(email) ?? { stage: stageDefault, note: null };
      c.note = c.note ? `${c.note}\n${line}` : line;
      if (stageParam) c.stage = stageParam;
      contacts.set(email, c);
      markers.push(line);
      return [];
    }
    if (text.includes("fu:step-decide")) {
      const [status, summary, stepId] = values as [string, string, string];
      stepDecisions.push({ status, summary, stepId });
      const p = parked.find((x) => x.step_id === stepId);
      if (p) p.status = status;
      return [];
    }
    if (text.includes("fu:run-finish")) {
      const [status, runId] = values as [string, string];
      runFinishes.push({ status, runId });
      const i = parked.findIndex((x) => x.run_id === runId);
      if (i >= 0) parked.splice(i, 1); // closed run leaves the parked pool
      return [];
    }
    if (text.includes("fu:run-start")) {
      seq += 1;
      return [{ id: `run-${seq}` }];
    }
    if (text.includes("fu:step-start")) {
      const runId = values[0] as string;
      const stepId = `step-${seq}`;
      parked.push({ run_id: runId, step_id: stepId, status: "waiting", started_at: NOW.toISOString() });
      return [{ id: stepId }];
    }
    throw new Error(`fake sql: unrouted query: ${text.slice(0, 120)}`);
  }) as unknown as postgres.Sql;

  return { sql, contacts, parked, stepDecisions, runFinishes, markers };
}

function makePorts(overrides: Partial<FollowupPorts> & { intent?: string; draft?: string } = {}) {
  const telegrams: Array<{ text: string; buttons?: Array<{ text: string; data: string }> }> = [];
  const sends: Array<Record<string, unknown>> = [];
  const artifacts = new Map<string, string>();
  let intentCalls = 0;
  let draftCalls = 0;
  const ports: FollowupPorts = {
    hermes: async (prompt) => {
      if (prompt.includes("One word:")) {
        intentCalls += 1;
        return { ok: true, output: overrides.intent ?? "interested", engineUsed: "claude" };
      }
      draftCalls += 1;
      return { ok: true, output: overrides.draft ?? GOOD_DRAFT, engineUsed: "claude" };
    },
    telegram: async (text, buttons) => {
      telegrams.push({ text, buttons });
    },
    smartleadReply: async (input) => {
      sends.push(input as unknown as Record<string, unknown>);
      return { ok: true, detail: "http_200" };
    },
    artifacts: {
      get: async (k) => artifacts.get(k) ?? null,
      set: async (k, v) => {
        artifacts.set(k, v);
      },
    },
    onceKey: async () => true,
    now: () => NOW,
    hermesToken: "hermes-token",
    smartleadApiKey: "sl-key",
    ...overrides,
  };
  return {
    ports,
    telegrams,
    sends,
    artifacts,
    counts: () => ({ intentCalls, draftCalls }),
  };
}

describe("reply → intent → draft → PORTÃO", () => {
  it("proposes exactly one gated draft with the graph-standard ap:/rj: buttons", async () => {
    const world = makeWorld({
      replies: [
        {
          id: EVENT_A,
          email: "owner@rooferco.com",
          payload: doubleEncodedPayload("How much does it cost?"),
          note: "[prospect-batch] trilha=aistack campanha=aistack-2026-09-08 — sem JSON-LD",
        },
      ],
    });
    const f = makePorts({ intent: "question" });
    const res = await runFollowupScan(world.sql, null, f.ports);

    expect(res.proposed).toBe(1);
    // The gate: one waiting approval step, buttons carrying THAT step id.
    const box = f.telegrams.find((t) => t.buttons);
    expect(box).toBeDefined();
    expect(box!.buttons).toEqual([
      { text: "✅ Aprovar e enviar", data: "ap:step-1" },
      { text: "❌ Rejeitar", data: "rj:step-1" },
    ]);
    // The founder sees the lead's reply AND the exact draft.
    expect(box!.text).toContain("How much does it cost?");
    expect(box!.text).toContain(GOOD_DRAFT);
    // Never the raw address — masked only.
    expect(box!.text).not.toContain("owner@rooferco.com");
    expect(box!.text).toContain("o***@r***.com");
    // Artifact discipline: draft + meta stored under the run's keys.
    expect(f.artifacts.get("graphrun:run-1:draft")).toBe(GOOD_DRAFT);
    const meta = JSON.parse(f.artifacts.get("graphrun:run-1:meta")!);
    expect(meta).toMatchObject({
      eventId: EVENT_A,
      email: "owner@rooferco.com",
      campaignId: 3888686,
      statsId: "stats-1",
      intent: "question",
      trilha: "aistack",
    });
    // Marker on the CRM note — the dossier timeline line.
    expect(world.contacts.get("owner@rooferco.com")!.note).toContain(
      `[followup] proposto ${EVENT_A} 2026-09-01 intent=question`
    );
    // Nothing was SENT: the gate is the whole point.
    expect(f.sends).toHaveLength(0);
  });

  it("a re-scan of an already-proposed event proposes nothing (marker idempotency)", async () => {
    const world = makeWorld({
      replies: [{ id: EVENT_A, email: "a@b.com", payload: doubleEncodedPayload("Tell me more") }],
    });
    const f = makePorts();
    await runFollowupScan(world.sql, null, f.ports);
    const before = f.counts();
    const res2 = await runFollowupScan(world.sql, null, f.ports);
    expect(res2.proposed).toBe(0);
    expect(f.counts()).toEqual(before); // zero extra LLM calls
  });
});

describe("approval → send exactly once", () => {
  async function proposeAndDecide(decision: "succeeded" | "failed") {
    const world = makeWorld({
      replies: [{ id: EVENT_A, email: "a@b.com", payload: doubleEncodedPayload("yes, interested!") }],
    });
    const f = makePorts({ intent: "interested" });
    await runFollowupScan(world.sql, null, f.ports);
    // Simulate the founder's button through the SAME state the telegram
    // route writes: the approval step flips status.
    world.parked[0]!.status = decision;
    return { world, f };
  }

  it("approve → SmartLead reply API called once; re-scan never sends again", async () => {
    const { world, f } = await proposeAndDecide("succeeded");
    const res = await runFollowupScan(world.sql, null, f.ports);
    expect(res.sent).toBe(1);
    expect(f.sends).toHaveLength(1);
    expect(f.sends[0]).toMatchObject({ campaignId: 3888686, statsId: "stats-1" });
    // The body sent is the approved draft, html-escaped only.
    expect(String(f.sends[0]!["bodyHtml"])).toContain("The audit costs $49.<br>");
    expect(world.markers.some((m) => m.includes(`enviado ${EVENT_A}`) && m.includes("via=api"))).toBe(true);
    expect(world.runFinishes).toContainEqual({ status: "succeeded", runId: "run-1" });

    // Idempotency: the closed run left the parked pool AND the marker skips
    // the event — a third scan sends nothing and calls no LLM.
    const before = f.counts();
    const res3 = await runFollowupScan(world.sql, null, f.ports);
    expect(res3.sent).toBe(0);
    expect(f.sends).toHaveLength(1);
    expect(f.counts()).toEqual(before);
  });

  it("reject → nothing sent, marker records the decision", async () => {
    const { world, f } = await proposeAndDecide("failed");
    const res = await runFollowupScan(world.sql, null, f.ports);
    expect(res.rejected).toBe(1);
    expect(f.sends).toHaveLength(0);
    expect(world.markers.some((m) => m.includes(`rejeitado ${EVENT_A}`))).toBe(true);
    expect(world.runFinishes).toContainEqual({ status: "failed", runId: "run-1" });
  });

  it("96h of silence → rejection-by-silence: step failed, nothing sent", async () => {
    const { world, f } = await proposeAndDecide("succeeded");
    // Rewind: still waiting, but proposed 100h ago.
    world.parked[0]!.status = "waiting";
    world.parked[0]!.started_at = new Date(NOW.getTime() - 100 * 3600 * 1000).toISOString();
    const res = await runFollowupScan(world.sql, null, f.ports);
    expect(res.expired).toBe(1);
    expect(f.sends).toHaveLength(0);
    expect(world.stepDecisions[0]).toMatchObject({ status: "failed", stepId: "step-1" });
    expect(world.markers.some((m) => m.includes(`expirado ${EVENT_A}`))).toBe(true);
    expect(f.telegrams.some((t) => t.text.includes("EXPIROU"))).toBe(true);
  });

  it("a FRESH waiting approval is left parked — silence has 96h, not 30 minutes", async () => {
    const { world, f } = await proposeAndDecide("succeeded");
    world.parked[0]!.status = "waiting";
    const res = await runFollowupScan(world.sql, null, f.ports);
    expect(res.expired).toBe(0);
    expect(world.parked).toHaveLength(1);
    expect(f.sends).toHaveLength(0);
  });
});

describe("short-circuits — no gate, no send", () => {
  it("unsubscribe is FINAL: no draft, stage per the webhook rule, silent", async () => {
    const world = makeWorld({
      replies: [
        { id: EVENT_A, email: "a@b.com", stage: "contacted", payload: doubleEncodedPayload("remove me from your list") },
      ],
    });
    const f = makePorts({ intent: "unsubscribe" });
    const res = await runFollowupScan(world.sql, null, f.ports);
    expect(res.unsubscribed).toBe(1);
    expect(f.counts().draftCalls).toBe(0);
    expect(world.contacts.get("a@b.com")!.stage).toBe("lost");
    expect(world.contacts.get("a@b.com")!.note).toContain("motivo=unsubscribe");
    expect(f.telegrams).toHaveLength(0);
    expect(f.sends).toHaveLength(0);
  });

  it("a human-set stage is never downgraded by the unsubscribe path", async () => {
    const world = makeWorld({
      replies: [
        { id: EVENT_A, email: "vip@b.com", stage: "customer", payload: doubleEncodedPayload("stop emailing me") },
      ],
    });
    const f = makePorts({ intent: "unsubscribe" });
    await runFollowupScan(world.sql, null, f.ports);
    expect(world.contacts.get("vip@b.com")!.stage).toBe("customer");
  });

  it("auto-reply noise is marked silently with ZERO LLM calls", async () => {
    const world = makeWorld({
      replies: [
        { id: EVENT_A, email: "a@b.com", payload: doubleEncodedPayload("I am out of office until Friday.") },
      ],
    });
    const f = makePorts();
    const res = await runFollowupScan(world.sql, null, f.ports);
    expect(res.discarded).toBe(1);
    expect(f.counts()).toEqual({ intentCalls: 0, draftCalls: 0 });
    expect(f.telegrams).toHaveLength(0);
    expect(world.contacts.get("a@b.com")!.note).toContain("motivo=noise");
  });

  it("a 'lost' contact (already unsubscribed) never gets a draft", async () => {
    const world = makeWorld({
      replies: [{ id: EVENT_A, email: "a@b.com", stage: "lost", payload: doubleEncodedPayload("ok but why") }],
    });
    const f = makePorts();
    const res = await runFollowupScan(world.sql, null, f.ports);
    expect(res.discarded).toBe(1);
    expect(f.counts()).toEqual({ intentCalls: 0, draftCalls: 0 });
  });
});

describe("fail-soft OFF — loud, with the nominal unlocking action", () => {
  it("approved draft + missing SMARTLEAD_API_KEY → manual delivery, no API call", async () => {
    const world = makeWorld({
      replies: [{ id: EVENT_A, email: "a@b.com", payload: doubleEncodedPayload("interested!") }],
    });
    const f = makePorts({ intent: "interested", smartleadApiKey: "" });
    await runFollowupScan(world.sql, null, f.ports);
    world.parked[0]!.status = "succeeded";
    const res = await runFollowupScan(world.sql, null, f.ports);
    expect(res.manual).toBe(1);
    expect(f.sends).toHaveLength(0);
    const manual = f.telegrams.find((t) => t.text.includes("ENVIO MANUAL"));
    expect(manual).toBeDefined();
    expect(manual!.text).toContain("SMARTLEAD_API_KEY");
    expect(manual!.text).toContain("Railway");
    expect(manual!.text).toContain(GOOD_DRAFT); // the founder gets the text to paste
    expect(world.markers.some((m) => m.includes(`aprovado ${EVENT_A}`) && m.includes("entrega=manual"))).toBe(true);
  });

  it("payload without stats_id → manual delivery (never a guessed thread id)", async () => {
    const world = makeWorld({
      replies: [
        {
          id: EVENT_A,
          email: "a@b.com",
          payload: JSON.stringify({ event_type: "EMAIL_REPLY", reply_message: { text: "sounds good" } }),
        },
      ],
    });
    const f = makePorts({ intent: "interested" });
    await runFollowupScan(world.sql, null, f.ports);
    world.parked[0]!.status = "succeeded";
    const res = await runFollowupScan(world.sql, null, f.ports);
    expect(res.manual).toBe(1);
    expect(f.sends).toHaveLength(0);
  });

  it("SmartLead API failure → manual fallback, NEVER an automatic retry", async () => {
    const world = makeWorld({
      replies: [{ id: EVENT_A, email: "a@b.com", payload: doubleEncodedPayload("interested!") }],
    });
    const f = makePorts({
      intent: "interested",
      smartleadReply: async () => ({ ok: false, detail: "http_500 waf" }),
    });
    await runFollowupScan(world.sql, null, f.ports);
    world.parked[0]!.status = "succeeded";
    const res = await runFollowupScan(world.sql, null, f.ports);
    expect(res.manual).toBe(1);
    expect(res.sent).toBe(0);
    // The run is CLOSED (delivered manually) — a re-scan must not re-call the API.
    const res3 = await runFollowupScan(world.sql, null, f.ports);
    expect(res3.manual).toBe(0);
    expect(f.telegrams.some((t) => t.text.includes("não re-tenta"))).toBe(true);
  });

  it("replies waiting + missing HERMES_TASK_TOKEN → loud OFF, zero classification", async () => {
    const world = makeWorld({
      replies: [{ id: EVENT_A, email: "a@b.com", payload: doubleEncodedPayload("how much?") }],
    });
    const f = makePorts({ hermesToken: "" });
    const res = await runFollowupScan(world.sql, null, f.ports);
    expect(res.proposed).toBe(0);
    expect(f.counts()).toEqual({ intentCalls: 0, draftCalls: 0 });
    const off = f.telegrams.find((t) => t.text.includes("HERMES_TASK_TOKEN"));
    expect(off).toBeDefined();
    expect(off!.text).toContain("DESLIGADO");
  });

  it("an invalid draft after the redraft attempt is delivered as a hand-off, never gated", async () => {
    const world = makeWorld({
      replies: [{ id: EVENT_A, email: "a@b.com", payload: doubleEncodedPayload("price?") }],
    });
    const f = makePorts({ intent: "question", draft: "Visit https://evil.example.com now\nOtavio" });
    const res = await runFollowupScan(world.sql, null, f.ports);
    expect(res.proposed).toBe(0);
    expect(res.discarded).toBe(1);
    expect(f.counts().draftCalls).toBe(2); // one redraft attempt happened
    expect(f.telegrams.some((t) => t.text.includes("SEM RASCUNHO VÁLIDO"))).toBe(true);
    expect(world.markers.some((m) => m.includes("motivo=rascunho-invalido"))).toBe(true);
  });
});

describe("the run rides the real graph substrate", () => {
  it("uses the followup-reply graph slug (outside GRAPH_REGISTRY, tick-invisible)", async () => {
    expect(FOLLOWUP_GRAPH).toBe("followup-reply");
  });
});
