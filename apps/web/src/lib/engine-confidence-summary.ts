/**
 * engine-confidence-summary.ts — B4 (Codex D23, 23/09).
 *
 * The dashboard line under the score used to filter out engines with a null
 * status and then say "All {checked} engines passed". With two engines
 * coming back null (an alias bug in the route), a five-engine audit read
 * "All 3 engines passed". Two engines vanished from the certification.
 *
 * Rules: an engine with no battery on the day is NOT CHECKED, and it is said
 * so and counted. "All N passed" only when every engine the audit used was
 * checked and healthy.
 */
import { engineLabel } from "@organic-posts/shared";

export interface EngineCheck {
  engine: string;
  label?: string | null;
  /** healthy · degraded · failing · null when no battery had run yet */
  status: string | null;
  checked_at?: string | null;
}

export type ConfidenceSummary =
  | { kind: "silent" }
  | { kind: "all_good"; text: string }
  | { kind: "partial"; text: string }
  | { kind: "shaky"; text: string };

export function summarizeEngineConfidence(engines: readonly EngineCheck[] | null | undefined): ConfidenceSummary {
  if (!engines || engines.length === 0) return { kind: "silent" };
  const name = (e: EngineCheck) => (e.label && e.label.trim()) || engineLabel(e.engine);
  const total = engines.length;
  const checked = engines.filter((e) => e.status);
  const notChecked = engines.filter((e) => !e.status);
  const shaky = checked.filter((e) => e.status === "degraded" || e.status === "failing");

  if (shaky.length > 0) {
    const who = shaky.map(name).join(" and ");
    const tail =
      notChecked.length > 0
        ? ` ${notChecked.map(name).join(" and ")} ${notChecked.length === 1 ? "was" : "were"} not checked that day.`
        : "";
    return {
      kind: "shaky",
      text: `${who} ${shaky.length === 1 ? "was" : "were"} unstable on the day of this audit, so a fall here may be the engine and not your brand.${tail}`,
    };
  }
  if (checked.length === 0) return { kind: "silent" };
  if (notChecked.length === 0) {
    return { kind: "all_good", text: `All ${total} engines passed their control checks on the day of this audit.` };
  }
  return {
    kind: "partial",
    text: `${checked.length} of ${total} engines passed their control checks on the day of this audit; ${notChecked.map(name).join(" and ")} ${notChecked.length === 1 ? "was" : "were"} not checked that day.`,
  };
}
