/**
 * reply-intent.ts — B9 (Codex D22, 23/09). What a cold-email reply means,
 * decided by CODE at the moment it arrives.
 *
 * The follow-up scan classifies replies with an LLM and drafts an answer.
 * When the engines were down (21–24/09: Claude OAuth expired, Codex timing
 * out) it logged `followup_intent_engines_down` and left nothing in the CRM.
 * Twelve replies sat unclassified; SmartLead showed "0 positives"; the one
 * "Yes Please check" was found by hand two hours later.
 *
 * This is the deterministic first pass. It does not replace the LLM draft;
 * it guarantees that every reply lands in the CRM with a verdict and that a
 * positive one wakes the founder up, engines or no engines.
 *
 * Order matters: a "not interested, remove me" is a STOP, not a negative.
 */
import { looksLikeAutoReplyNoise, looksLikeTextualUnsubscribe } from "./followup";

export type ReplyIntent = "stop" | "out_of_office" | "negative" | "positive" | "question" | "unknown";

const NEGATIVE_RE =
  /\b(not interested|no thanks?|no thank you|we're (good|all set|fine)|we are (good|all set|fine)|already (have|use|work with)|don'?t need|do not need|not (a|the right) fit|not for us|pass on this|não (tenho|temos) interesse|sem interesse|já (temos|tenho))\b/i;

const POSITIVE_RE =
  /\b(yes|yeah|yep|sure|please (check|do|send|go ahead)|go ahead|interested|sounds (good|great|interesting)|let'?s (talk|chat|do it)|call me|book (a|the) (call|time)|schedule|send (me )?(the|more|it|over)|tell me more|would love to|happy to (chat|talk|hear)|what (does it|would it) cost|how much|pode (mandar|enviar|verificar)|tenho interesse|vamos (conversar|falar))\b/i;

const QUESTION_RE = /\?|\b(who (is|are) (this|you)|what is this|how did you (get|find)|where did you)\b/i;

export function classifyReplyIntent(text: string | null | undefined): ReplyIntent {
  const t = (text ?? "").trim();
  if (!t) return "unknown";
  if (looksLikeTextualUnsubscribe(t)) return "stop";
  if (looksLikeAutoReplyNoise(t)) return "out_of_office";
  if (NEGATIVE_RE.test(t)) return "negative";
  if (POSITIVE_RE.test(t)) return "positive";
  if (QUESTION_RE.test(t)) return "question";
  return "unknown";
}

/** The CRM note line for a classified reply. No reply text: the event row keeps it. */
export function replyNoteLine(intent: ReplyIntent, campaignId: number | null, at: Date): string {
  return `[reply] ${intent}${campaignId ? ` (campaign ${campaignId})` : ""} ${at.toISOString().slice(0, 10)}`;
}
