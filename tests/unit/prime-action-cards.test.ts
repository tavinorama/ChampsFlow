/**
 * prime-action-cards.test.ts — P0-03 / R12, the "3 of 3 vs 5" defect.
 *
 * Two counters described the same reality with different denominators:
 *   - /api/prime/status counted every 'done' plan_task across EVERY plan the
 *     brand had ever had (routes/prime.ts), and
 *   - the OrganicPosts screen then rendered that count against a hard-coded 3,
 *     while the Do Next tab and deriveExecutionProgress (routes/audits.ts) both
 *     scope to the LATEST plan and exclude rejected tasks.
 * So a workspace with a 5-task plan read "3 of 3" — complete — on one screen
 * and "3 of 5" on the other.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { actionCardsRow } from "../../apps/web/src/app/dashboard-v3/prime-progress";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

describe("P0-03 / R12 — one denominator for action cards", () => {
  it("shows the plan's real total, not a hard-coded 3", () => {
    // The exact case the report saw.
    expect(actionCardsRow({ actionCardsDone: 3, actionCardsTotal: 5 })).toEqual({
      label: "Action cards done",
      done: false,
      detail: "3 of 5",
    });
  });

  it("is only 'done' when every card in the plan is done", () => {
    expect(actionCardsRow({ actionCardsDone: 5, actionCardsTotal: 5 }).done).toBe(true);
    expect(actionCardsRow({ actionCardsDone: 4, actionCardsTotal: 5 }).done).toBe(false);
  });

  it("never claims more done than the plan holds", () => {
    // Defensive: a stale count must not render "7 of 5".
    expect(actionCardsRow({ actionCardsDone: 7, actionCardsTotal: 5 }).detail).toBe("5 of 5");
  });

  it("says so plainly when there is no plan", () => {
    const row = actionCardsRow({ actionCardsDone: 0, actionCardsTotal: null });
    expect(row.done).toBe(false);
    expect(row.detail).toBe("no plan yet");
  });

  it("the API scopes to the latest plan and excludes rejected, like Do Next", () => {
    // The structural half of R12: both counters must read the same rows. A
    // behavioural test would need a live DB, so this locks the query shape.
    const src = read("apps/api/src/routes/prime.ts");
    expect(src).toContain("FILTER (WHERE t.status != 'rejected')");
    expect(src).toMatch(/WHERE t\.plan_id = \(\s*SELECT id FROM strategy_plan/);
    expect(src).toMatch(/ORDER BY created_at DESC\s*LIMIT 1/);
    // The old unscoped join must be gone.
    expect(src).not.toContain("JOIN strategy_plan p ON p.id = t.plan_id");
  });
});

describe("P0-03 — one name for the done-for-you product", () => {
  it("the screen says OrganicPosts, the name marketing and the nav use", () => {
    const src = read("apps/web/src/app/dashboard-v3/PrimeTab.tsx");
    expect(src).toContain("What OrganicPosts includes");
    expect(src).not.toContain("What Prime includes");
  });
});
