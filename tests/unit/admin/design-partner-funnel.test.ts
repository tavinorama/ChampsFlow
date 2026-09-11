/**
 * design-partner-funnel.test.ts — the canal B funnel the weekly report reads.
 *
 * The two failures this guards against are both ways of putting a wrong number
 * in front of the founder on a Monday morning:
 *
 *   1. A funnel that cannot be read rendering as a row of ZEROS. "Nobody has
 *      been contacted" and "the column does not exist yet" look identical in a
 *      report and mean opposite things.
 *   2. A NON-MONOTONIC count. If "conversa feita" only counted people sitting
 *      exactly there, it would drop to 0 the moment the last one moved to
 *      proposal — and read as a collapse in the week it went best.
 */

import { describe, it, expect } from "vitest";
import {
  buildDesignPartnerFunnel,
  unavailableFunnel,
  DESIGN_PARTNER_FUNNEL,
  DESIGN_PARTNER_SOURCE,
  DESIGN_PARTNER_TARGET,
  type FunnelContactRow,
} from "../../../apps/api/src/lib/design-partner-funnel";

const dp = (email: string, stage: string): FunnelContactRow => ({
  email,
  stage,
  source: DESIGN_PARTNER_SOURCE,
});

describe("the funnel is the five steps the founder approved", () => {
  it("is ordered contatado -> marcada -> feita -> proposta -> pago", () => {
    expect(DESIGN_PARTNER_FUNNEL.map((s) => s.key)).toEqual([
      "contacted",
      "call_booked",
      "call_done",
      "proposal",
      "paid",
    ]);
  });

  it("labels are in Portuguese — the founder reads this report", () => {
    expect(DESIGN_PARTNER_FUNNEL.map((s) => s.label)).toEqual([
      "Contatado",
      "Conversa marcada",
      "Conversa feita",
      "Proposta",
      "Pago",
    ]);
  });

  it("carries the canal B target of 5", () => {
    expect(DESIGN_PARTNER_TARGET).toBe(5);
    expect(buildDesignPartnerFunnel([]).target).toBe(5);
  });
});

describe("counts are monotonic — reaching a step counts every step before it", () => {
  const rows = [
    dp("a@x.co", "contacted"),
    dp("b@x.co", "call_booked"),
    dp("c@x.co", "call_done"),
    dp("d@x.co", "proposal"),
    dp("e@x.co", "paid"),
  ];

  it("one contact per step gives 5,4,3,2,1", () => {
    const f = buildDesignPartnerFunnel(rows);
    expect(f.stages.map((s) => s.reached)).toEqual([5, 4, 3, 2, 1]);
  });

  it("atStage still says where each one is right now", () => {
    const f = buildDesignPartnerFunnel(rows);
    expect(f.stages.map((s) => s.atStage)).toEqual([1, 1, 1, 1, 1]);
  });

  it("everyone moving forward never makes an earlier step read as a collapse", () => {
    // The whole cohort advances from call_done to proposal.
    const before = buildDesignPartnerFunnel([dp("a@x.co", "call_done"), dp("b@x.co", "call_done")]);
    const after = buildDesignPartnerFunnel([dp("a@x.co", "proposal"), dp("b@x.co", "proposal")]);
    expect(before.stages[2]!.reached).toBe(2);
    expect(after.stages[2]!.reached).toBe(2); // still 2 — nothing went backwards
    expect(after.stages[2]!.atStage).toBe(0); // nobody is sitting there
    expect(after.stages[3]!.reached).toBe(2);
  });

  it("names who is sitting at each step, so a stall has a face", () => {
    const f = buildDesignPartnerFunnel([dp("z@x.co", "call_booked"), dp("a@x.co", "call_booked")]);
    expect(f.stages[1]!.emails).toEqual(["a@x.co", "z@x.co"]);
  });
});

describe("legacy and edge rows are counted honestly", () => {
  it("'customer' predates the funnel and counts as paid", () => {
    const f = buildDesignPartnerFunnel([dp("old@x.co", "customer")]);
    expect(f.paid).toBe(1);
    expect(f.stages[4]!.reached).toBe(1);
    expect(f.stages[4]!.atStage).toBe(1);
  });

  it("'qualified' counts as contacted but no further", () => {
    const f = buildDesignPartnerFunnel([dp("q@x.co", "qualified")]);
    expect(f.stages[0]!.reached).toBe(1);
    expect(f.stages[1]!.reached).toBe(0);
    // It is not one of the five steps, so nobody is "at" a funnel step.
    expect(f.stages.map((s) => s.atStage)).toEqual([0, 0, 0, 0, 0]);
  });

  it("a lost design partner leaves the funnel and is reported, not hidden", () => {
    const f = buildDesignPartnerFunnel([dp("a@x.co", "paid"), dp("b@x.co", "lost")]);
    expect(f.total).toBe(1);
    expect(f.lost).toBe(1);
    expect(f.stages[0]!.reached).toBe(1);
  });

  it("a stage outside the funnel is surfaced in offFunnel rather than dropped", () => {
    const f = buildDesignPartnerFunnel([dp("n@x.co", "new")]);
    expect(f.offFunnel).toEqual([{ email: "n@x.co", stage: "new" }]);
  });

  it("ignores contacts from other tracks", () => {
    const f = buildDesignPartnerFunnel([
      dp("a@x.co", "paid"),
      { email: "cold@x.co", stage: "paid", source: "cold" },
      { email: "nolabel@x.co", stage: "paid", source: null },
      { email: "nocolumn@x.co", stage: "paid" },
    ]);
    expect(f.total).toBe(1);
    expect(f.paid).toBe(1);
  });

  it("an unlabelled contact is NOT a design partner — a missing label is not a claim", () => {
    const f = buildDesignPartnerFunnel([{ email: "x@x.co", stage: "proposal" }]);
    expect(f.total).toBe(0);
  });

  it("an empty list is available and honestly zero", () => {
    const f = buildDesignPartnerFunnel([]);
    expect(f.available).toBe(true);
    expect(f.total).toBe(0);
    expect(f.stages.every((s) => s.reached === 0)).toBe(true);
  });
});

describe("unavailable is not zero", () => {
  it("says it is unavailable and why", () => {
    const f = unavailableFunnel("migration 20260911000001 has not been applied");
    expect(f.available).toBe(false);
    expect(f.reason).toContain("20260911000001");
  });

  it("is distinguishable from a real, empty funnel by the flag alone", () => {
    const empty = buildDesignPartnerFunnel([]);
    const off = unavailableFunnel("off");
    // The numbers are identical — which is exactly why `available` has to exist.
    expect(off.stages.map((s) => s.reached)).toEqual(empty.stages.map((s) => s.reached));
    expect(off.available).not.toBe(empty.available);
    expect(empty.reason).toBeNull();
  });

  it("still carries the five labelled steps so a renderer never crashes", () => {
    expect(unavailableFunnel("off").stages.map((s) => s.label)).toEqual(
      DESIGN_PARTNER_FUNNEL.map((s) => s.label)
    );
  });
});
