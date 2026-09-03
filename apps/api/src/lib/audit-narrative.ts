/**
 * audit-narrative.ts — Visibility Loop v2 (Phase 3): "Since last audit".
 *
 * The founder's complaint the loop exists to fix: the score moves and nobody
 * can say WHY. A diff is data; this turns it into the handful of sentences a
 * customer reads in five seconds — what flipped, on which engine, who showed
 * up, which sources the AI started or stopped leaning on.
 *
 * Rules (the honesty contract):
 *  - every line is derived from the diff; nothing is inferred or rounded into
 *    a story the data does not support;
 *  - when nothing changed, that is said plainly — silence would read as a bug;
 *  - lines are ordered by how much the customer can act on them: citations
 *    first, then competitors, then sources, then the score itself.
 *
 * Pure module: no I/O. The route assembles the snapshots; tests call this.
 */
import type { AuditDiff } from "./audit-diff";

export type NarrativeTone = "gain" | "loss" | "neutral";

export interface NarrativeLine {
  tone: NarrativeTone;
  /** Short headline, product-UI language (EN). */
  text: string;
  /** Optional supporting detail (engine names, domains). */
  detail?: string;
}

export interface AuditNarrative {
  /** Ordered, ready to render. Never empty — see `nothingChanged`. */
  lines: NarrativeLine[];
  /** True when the two runs are identical on every axis we report. */
  nothingChanged: boolean;
  headline: string;
}

const ENGINE_LABEL: Record<string, string> = {
  anthropic: "Claude",
  openai: "ChatGPT",
  google: "Gemini",
  gemini: "Gemini",
  perplexity: "Perplexity",
  dataforseo: "Google AI Overviews",
  serp: "Google AI Overviews",
};

const engine = (p: string): string => ENGINE_LABEL[p] ?? p;

const list = (xs: string[], max = 3): string => {
  const head = xs.slice(0, max);
  const rest = xs.length - head.length;
  return rest > 0 ? `${head.join(", ")} +${rest} more` : head.join(", ");
};

/** Build the "Since last audit" narrative from a computed diff. */
export function buildAuditNarrative(diff: AuditDiff): AuditNarrative {
  const lines: NarrativeLine[] = [];

  // 1. Citations — the thing the customer is actually buying.
  for (const g of diff.citations.gained.slice(0, 5)) {
    lines.push({
      tone: "gain",
      text: `${engine(g.provider)} started citing you for "${g.queryText}"`,
      detail: g.to.rank != null ? `at position ${g.to.rank}` : undefined,
    });
  }
  for (const l of diff.citations.lost.slice(0, 5)) {
    lines.push({
      tone: "loss",
      text: `${engine(l.provider)} stopped citing you for "${l.queryText}"`,
      detail: l.from.rank != null ? `was position ${l.from.rank}` : undefined,
    });
  }
  for (const m of diff.citations.positionChanged.slice(0, 5)) {
    const better = (m.to.rank ?? 99) < (m.from.rank ?? 99);
    lines.push({
      tone: better ? "gain" : "loss",
      text: `${engine(m.provider)} moved you ${better ? "up" : "down"} for "${m.queryText}"`,
      detail: `position ${m.from.rank ?? "—"} → ${m.to.rank ?? "—"}`,
    });
  }

  // 2. Competitors — who arrived, who left.
  const newComers = diff.competitors.changed
    .filter((c) => c.from === null && c.to !== null)
    .map((c) => c.name);
  if (newComers.length > 0) {
    lines.push({
      tone: "loss",
      text: `New competitor${newComers.length === 1 ? "" : "s"} showing up in AI answers`,
      detail: list(newComers),
    });
  }
  const gone = diff.competitors.changed
    .filter((c) => c.to === null && c.from !== null)
    .map((c) => c.name);
  if (gone.length > 0) {
    lines.push({ tone: "gain", text: "Competitors that dropped out of the answers", detail: list(gone) });
  }

  // 3. Sources — where the answers are being built from now.
  if (diff.sources.gained.length > 0) {
    lines.push({
      tone: "neutral",
      text: "AI started leaning on new sources",
      detail: list(diff.sources.gained),
    });
  }
  if (diff.sources.lost.length > 0) {
    lines.push({
      tone: "neutral",
      text: "AI stopped using sources it cited last time",
      detail: list(diff.sources.lost),
    });
  }

  // 4. Off-site presence flips.
  if (diff.offsite.gained.length > 0) {
    lines.push({ tone: "gain", text: "You are now present on", detail: list(diff.offsite.gained) });
  }
  if (diff.offsite.lost.length > 0) {
    lines.push({ tone: "loss", text: "You are no longer present on", detail: list(diff.offsite.lost) });
  }

  // 5. The score, last — it is the consequence, not the news.
  const d = diff.scores.ai.delta;
  if (d !== 0) {
    lines.push({
      tone: d > 0 ? "gain" : "loss",
      text: `Visibility ${d > 0 ? "up" : "down"} ${Math.abs(d)} point${Math.abs(d) === 1 ? "" : "s"}`,
      detail: `${diff.scores.ai.from} → ${diff.scores.ai.to}`,
    });
  }

  // Prompts that only exist on one side are reported, never silently compared.
  if (diff.citations.promptsAdded.length > 0 || diff.citations.promptsRemoved.length > 0) {
    lines.push({
      tone: "neutral",
      text: "The question set changed between these runs",
      detail:
        `${diff.citations.promptsAdded.length} added, ` +
        `${diff.citations.promptsRemoved.length} removed — those are not compared`,
    });
  }

  const nothingChanged = lines.length === 0;
  if (nothingChanged) {
    lines.push({
      tone: "neutral",
      text: "Nothing moved since the last comparable audit",
      detail: `${diff.citations.unchanged} checks came back exactly the same`,
    });
  }

  const gains = lines.filter((l) => l.tone === "gain").length;
  const losses = lines.filter((l) => l.tone === "loss").length;
  const headline = nothingChanged
    ? "No change since the last comparable audit"
    : `${gains} thing${gains === 1 ? "" : "s"} moved your way, ${losses} against you`;

  return { lines, nothingChanged, headline };
}
