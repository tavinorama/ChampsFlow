/**
 * smartlead-stage.ts — the pure stage machine of the P34 webhook.
 *
 * Separate from the route on purpose: the route imports config (which
 * validates env and exits), so anything a unit test needs must live where a
 * test can import it — the same reason credits math lives apart from the DB
 * side. No imports at all: this file is decisions, not I/O.
 */

/** Stages the webhook may write. Human-set stages outrank all of them. */
const MACHINE_STAGES = ["new", "contacted", "lost"] as const;
export type Stage = "new" | "contacted" | "qualified" | "customer" | "lost";

/**
 * Pure stage transition — exported for the unit tests.
 *
 * Returns the stage to write, or null to leave the row untouched. The rule
 * that matters: this function can only ever move BETWEEN machine stages;
 * 'qualified' and 'customer' are human judgments and are never overwritten.
 */
export function nextStageFor(current: Stage | null, eventType: string): Stage | null {
  const cur: Stage = current ?? "new";
  if (!MACHINE_STAGES.includes(cur as (typeof MACHINE_STAGES)[number])) return null;
  switch (eventType) {
    case "EMAIL_REPLY":
      // A reply is the signal the whole pipeline exists for.
      return cur === "lost" ? null : "contacted";
    case "LEAD_UNSUBSCRIBED":
      return "lost";
    default:
      // Opens/bounces/sends annotate (note line) but never move the stage.
      return null;
  }
}

