/**
 * publish-receipt-reconcile.test.ts — C15-b / P14 (25/09).
 *
 * "Agendado e não publicado → hoje conta como publicado." The receipt now
 * carries a state: queued at acceptance, published only after the scheduler
 * confirms by id, error when it says so. These tests pin the flip, the
 * permalink, that unknown never becomes published, and that a missing port
 * is reported, not swallowed.
 */
import { describe, it, expect } from "vitest";
import { reconcilePublishReceipts, publishReceipt, type PostizStatus, type PublishReceiptRow } from "../../apps/api/src/lib/graph-runner";

const row = (stepId: string, id: string): PublishReceiptRow => ({
  stepId,
  summary: `published via postiz channel=linkedin${publishReceipt(JSON.stringify({ postId: id }))}`,
  startedAt: "2026-09-25T10:00:00Z",
});

function world(rows: PublishReceiptRow[], answers: Record<string, PostizStatus | Error>) {
  const updates: Array<{ stepId: string; summary: string }> = [];
  const asked: string[] = [];
  const ports = {
    hermes: {
      task: async () => ({ ok: true, output: "", engineUsed: null, ms: null }),
      publish: async () => ({ ok: true, detail: "" }),
      postStatus: async (id: string) => {
        asked.push(id);
        const a = answers[id];
        if (a instanceof Error) throw a;
        return a ?? { ok: false, state: "unknown" as const, url: null, detail: "http_404" };
      },
    },
    substrate: {
      recentPublishReceipts: async () => rows,
      updateStepSummary: async (stepId: string, summary: string) => {
        updates.push({ stepId, summary });
      },
    } as never,
  };
  return { ports, updates, asked };
}

describe("reconcilePublishReceipts — queued → published | error; unknown stays queued", () => {
  it("acceptance is queued, never published", () => {
    expect(publishReceipt('{"postId":"cm1"}')).toBe(" postiz_id=cm1 postiz_state=queued");
    expect(publishReceipt("{}")).toBe(" postiz_id=none postiz_state=unknown");
  });

  it("published with the permalink, error with the reason, unknown untouched, throw untouched", async () => {
    const w = world([row("s1", "cm1"), row("s2", "cm2"), row("s3", "cm3"), row("s4", "cm4")], {
      cm1: { ok: true, state: "published", url: "https://www.linkedin.com/feed/update/urn:li:share:1", detail: "" },
      cm2: { ok: true, state: "error", url: null, detail: "token expired <x>" },
      cm3: { ok: true, state: "queued", url: null, detail: "" },
      cm4: new Error("timeout"),
    });
    const rep = await reconcilePublishReceipts(w.ports);
    expect(rep).toEqual({ checked: 4, published: 1, errored: 1, stillQueued: 2, skipped: null });
    expect(w.asked).toEqual(["cm1", "cm2", "cm3", "cm4"]);
    expect(w.updates).toHaveLength(2);
    expect(w.updates[0]).toEqual({ stepId: "s1", summary: "published via postiz channel=linkedin postiz_id=cm1 postiz_state=published url=https://www.linkedin.com/feed/update/urn:li:share:1" });
    expect(w.updates[1]!.summary).toBe("published via postiz channel=linkedin postiz_id=cm2 postiz_state=error postiz_error=token_expired__x_");
    // the valve's marker survives every rewrite
    for (const u of w.updates) expect(u.summary.startsWith("published via postiz channel=linkedin")).toBe(true);
  });

  it("a row without an id or already reconciled is not asked again", async () => {
    const w = world(
      [
        { stepId: "s0", summary: "published via postiz channel=x postiz_id=none postiz_state=unknown", startedAt: "" },
        { stepId: "s9", summary: "published via postiz channel=x postiz_id=cm9 postiz_state=published url=https://x.com/p/1", startedAt: "" },
      ],
      {}
    );
    expect(await reconcilePublishReceipts(w.ports)).toMatchObject({ checked: 0 });
    expect(w.asked).toEqual([]);
  });

  it("no postStatus port = skipped with the reason, nothing rewritten", async () => {
    const w = world([row("s1", "cm1")], {});
    const { postStatus: _omit, ...hermes } = w.ports.hermes;
    const rep = await reconcilePublishReceipts({ hermes, substrate: w.ports.substrate });
    expect(rep.skipped).toContain("postStatus");
    expect(w.updates).toEqual([]);
  });
});
