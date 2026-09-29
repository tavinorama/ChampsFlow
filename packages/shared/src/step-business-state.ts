/**
 * step-business-state.ts — D7 (Codex N16, 28/09).
 *
 * `succeeded` is a TECHNICAL state: the step ran and returned. On 28/09 it
 * covered 8 publishes the scheduler had only accepted, 130 reasoning steps
 * that ran with no external context, and 11 verdicts whose learning is
 * suspended. Counting `succeeded` inflates the sense of autonomy. This module
 * reads what the step itself recorded and says what it means for the
 * business. Nothing is stored: the state is derived from the record.
 */
import { isPublishRecord } from "./publish-marker";

export type BusinessState =
  | "delivered" //            publish confirmed by the scheduler, with or without permalink
  | "accepted_unconfirmed" // scheduler took it; nobody confirmed publication yet
  | "delivery_error" //       scheduler said it failed
  | "delivery_unknown" //     no id to follow, or nobody could confirm in time
  | "context_missing" //      reasoning ran without signals AND without own gaps
  | "learning_suspended" //   verdict/harvest contained by invalid_g03
  | "waiting_human" //        an approval is pending
  | "waiting_window" //       a 48/72 h wait, inside its window
  | "failed"
  | "running"
  | "done";

export interface StepRecord {
  node: string;
  status: string;
  summary: string | null;
}

const CTX_RE = /ctx signals=(\w+) gaps=(\w+)/;

export function businessStateOf(step: StepRecord): BusinessState {
  const s = step.summary ?? "";
  if (step.status === "failed") return "failed";
  if (step.status === "running") return "running";
  if (step.status === "waiting") return /approval/i.test(step.node) ? "waiting_human" : "waiting_window";
  if (isPublishRecord(s)) {
    const m = /postiz_state=([a-z_]+)/.exec(s);
    if (m?.[1] === "published") return "delivered";
    if (m?.[1] === "queued") return "accepted_unconfirmed";
    if (m?.[1] === "error") return "delivery_error";
    return "delivery_unknown";
  }
  if (/invalid_g03/i.test(s)) return "learning_suspended";
  const ctx = CTX_RE.exec(s);
  if (ctx && ctx[1] !== "on" && ctx[2] !== "on") return "context_missing";
  return "done";
}

export type BusinessStateCounts = Record<BusinessState, number>;

export function summarizeBusinessStates(steps: StepRecord[]): BusinessStateCounts {
  const counts: BusinessStateCounts = {
    delivered: 0, accepted_unconfirmed: 0, delivery_error: 0, delivery_unknown: 0, context_missing: 0,
    learning_suspended: 0, waiting_human: 0, waiting_window: 0, failed: 0, running: 0, done: 0,
  };
  for (const st of steps) counts[businessStateOf(st)] += 1;
  return counts;
}

const LABEL_PT: Array<[BusinessState, string]> = [
  ["delivered", "publicados e confirmados"],
  ["accepted_unconfirmed", "aceites pelo agendador, sem confirmacao"],
  ["delivery_error", "publicacao com erro"],
  ["delivery_unknown", "publicacao sem confirmacao possivel"],
  ["context_missing", "raciocinio sem contexto externo"],
  ["learning_suspended", "aprendizado suspenso (G03)"],
  ["waiting_human", "a espera de aprovacao humana"],
  ["waiting_window", "em janela de espera"],
  ["failed", "falhados"],
];

/** Lines for the boletim. Zero counts are left out; "done" is never the headline. */
export function describeBusinessStates(c: BusinessStateCounts): string[] {
  const lines = LABEL_PT.filter(([k]) => c[k] > 0).map(([k, label]) => `- ${label}: ${c[k]}`);
  const published = c.delivered + c.accepted_unconfirmed + c.delivery_error + c.delivery_unknown;
  if (published > 0) lines.unshift(`- publicacoes tentadas: ${published} (confirmadas: ${c.delivered})`);
  return lines;
}
