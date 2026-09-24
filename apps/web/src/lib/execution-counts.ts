/**
 * execution-counts.ts — B3 (Codex D14, 23/09).
 *
 * The Verified Execution note listed "6 marked done by you" AND "17 still
 * open". Server-side, OPEN_STATES includes the self-reported states (they
 * still wait on someone: a re-check), so the 6 were inside the 17 and the
 * note read as 23 on an obligation of 17. Nothing was double-counted in the
 * data; the presentation was. This partitions the counts so every fix owed
 * sits in exactly one line and the lines add up to the total owed.
 */
export interface ExecutionCounts {
  total: number;
  denominator: number;
  verified: number;
  inFlight: number;
  selfReported: number;
  open: number;
  notOwed: number;
}

export interface ExecutionPartition {
  verified: number;
  /** Published / indexed / cited: proof exists, outcome not yet re-checked. */
  inFlight: number;
  /** Marked done by the client, no proof attached yet. */
  selfReported: number;
  /** Open and not started by anyone (open minus the self-reported ones). */
  openNotStarted: number;
  /** Everything owed: the four lines above, and only them. */
  owed: number;
}

export function partitionExecutionCounts(c: ExecutionCounts): ExecutionPartition {
  const openNotStarted = Math.max(0, c.open - c.selfReported);
  const owed = c.verified + c.inFlight + c.selfReported + openNotStarted;
  return { verified: c.verified, inFlight: c.inFlight, selfReported: c.selfReported, openNotStarted, owed };
}
