/**
 * followup.ts — pure logic of the reply follow-up loop (5.A.2:
 * resposta → intenção → rascunho → PORTÃO → envia).
 *
 * When a cold lead REPLIES, the webhook already promotes them to 'contacted'
 * — and then nothing happened. This module is the decisions half of the loop
 * that closes that gap: classify the reply's intent, draft a SHORT English
 * answer grounded ONLY in known facts, and gate EVERYTHING behind the
 * founder's explicit Telegram approval. Decisions only, no I/O — imported by
 * apps/worker/src/jobs/followup-scan.ts and unit-tested directly (the same
 * split as recycle.ts / smartlead-stage.ts).
 *
 * Hard rules encoded here:
 *   - NOTHING is sent without the founder approving THAT exact message; the
 *     validator checks the exact text that will be sent (anti-pattern #511:
 *     "o que se valida é exatamente o que se envia").
 *   - unsubscribe intent is FINAL (a human no): no draft, stage per the
 *     existing webhook rules, stop.
 *   - bounce/auto-reply noise: marked handled, silent, no Telegram.
 *   - the model only CLASSIFIES and WRITES; every decision, marker and
 *     validation is code ("vigia também mente").
 *   - handled-state is an append-only crm_contact note marker (same
 *     mechanism as the recycle loop) — NO new table.
 *   - links: at most ONE, from a strict allowlist with ?from= correlation
 *     (allowed here because this is a reply to an engaged human, never a
 *     cold first touch).
 */

import { parseSmartleadPayload } from "./dossier";
import { CONTENT_LESSONS, ANTI_GENERIC_SALES_RULE } from "./graph-prompts";

export const FOLLOWUP_GRAPH = "followup-reply";
/** Approval timeout — silence is rejection, never approval (18-20/08 lesson). */
export const FOLLOWUP_APPROVAL_TIMEOUT_HOURS = 96;
/**
 * 10.C.13 — new proposals PER DAY (UTC), not per scan. The old cap was 5 per
 * 30-min scan = 240/day on paper; the flood control was an illusion. The scan
 * counts today's followup-reply runs and proposes at most the remainder.
 * Env FOLLOWUP_BATCH_CAP overrides; the number is a DAILY budget.
 */
export const FOLLOWUP_DAILY_CAP_DEFAULT = 20;
export function followupDailyCap(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env["FOLLOWUP_BATCH_CAP"];
  if (raw === undefined || raw.trim() === "") return FOLLOWUP_DAILY_CAP_DEFAULT;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : FOLLOWUP_DAILY_CAP_DEFAULT;
}
/** Only replies this recent are scanned — bounds retries AND LLM spend. */
export const FOLLOWUP_LOOKBACK_DAYS = 14;

// ---------------------------------------------------------------------------
// Markers — the append-only handled-state on crm_contact.note (no new table).
// One line per decision: "[followup] <verbo> <event_id> <YYYY-MM-DD>[ extra]".
// ---------------------------------------------------------------------------

export type FollowupMarkerVerb =
  | "proposto" // draft parked at the founder's gate
  | "enviado" // approved AND delivered through the SmartLead API
  | "aprovado" // approved, delivered to the founder to paste (manual path)
  | "rejeitado" // founder pressed reject
  | "expirado" // 96h of silence = rejection, nothing sent
  | "descartado"; // no gate: noise / unsubscribe / undeliverable draft

const FOLLOWUP_MARKER_RE = /\[followup\] (\S+) ([0-9a-f-]{36})(?: (\d{4}-\d{2}-\d{2}))?/gi;

export function followupMarkerLine(
  verb: FollowupMarkerVerb,
  eventId: string,
  now: Date,
  extra?: string
): string {
  const date = now.toISOString().slice(0, 10);
  return `[followup] ${verb} ${eventId} ${date}${extra ? ` ${extra}` : ""}`;
}

/** Has THIS reply event already been handled (any verb)? Idempotency key. */
export function hasFollowupMarker(note: string | null | undefined, eventId: string): boolean {
  if (!note) return false;
  for (const m of note.matchAll(FOLLOWUP_MARKER_RE)) {
    if (m[2]!.toLowerCase() === eventId.toLowerCase()) return true;
  }
  return false;
}

/**
 * Is some OTHER reply from this contact still parked at the gate? A contact
 * gets ONE in-flight follow-up at a time — two approvals for the same person
 * risk two messages landing in one inbox.
 */
export function hasOpenFollowupProposal(note: string | null | undefined): boolean {
  if (!note) return false;
  const proposed = new Set<string>();
  const decided = new Set<string>();
  for (const m of note.matchAll(FOLLOWUP_MARKER_RE)) {
    const verb = m[1]!.toLowerCase();
    const id = m[2]!.toLowerCase();
    if (verb === "proposto") proposed.add(id);
    else decided.add(id);
  }
  for (const id of proposed) if (!decided.has(id)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Intent — the model classifies, THIS code decides what each intent means.
// ---------------------------------------------------------------------------

export type FollowupIntent =
  | "interested"
  | "question"
  | "objection"
  | "not-now"
  | "unsubscribe"
  | "noise";

export const DRAFTABLE_INTENTS: readonly FollowupIntent[] = [
  "interested",
  "question",
  "objection",
  "not-now",
];

const INTENT_TOKENS: readonly FollowupIntent[] = [
  "unsubscribe",
  "noise",
  "interested",
  "objection",
  "not-now",
  "question",
];

/**
 * Parse the classifier's output into one intent. Checked in a fixed priority
 * order (unsubscribe first: a "not interested, remove me" that mentions both
 * must land on the FINAL no). Unrecognized output degrades to 'question' —
 * the safe default, because a question only ever produces a DRAFT that still
 * has to pass the founder's gate; it can never send or suppress anything.
 */
export function parseIntent(raw: string): FollowupIntent {
  const text = (raw || "").toLowerCase();
  const firstLine = text.split("\n").find((l) => l.trim() !== "") ?? "";
  for (const t of INTENT_TOKENS) {
    if (firstLine.includes(t)) return t;
  }
  for (const t of INTENT_TOKENS) {
    if (text.includes(t)) return t;
  }
  return "question";
}

/**
 * Deterministic pre-filter for machine noise — free, code-only, runs BEFORE
 * any LLM call. Catches the obvious auto-responder / delivery-failure shapes;
 * everything else goes to the classifier.
 */
export function looksLikeAutoReplyNoise(replyText: string): boolean {
  const t = replyText.toLowerCase();
  return (
    /\bout of (the )?office\b/.test(t) ||
    /\bauto[- ]?repl(y|ied)\b/.test(t) ||
    /\bautomatic reply\b/.test(t) ||
    /\bautoresponder\b/.test(t) ||
    /\bdelivery (status notification|has failed)\b/.test(t) ||
    /\bmailer-daemon\b/.test(t) ||
    /\bundeliverable\b/.test(t) ||
    /\bno longer with (the company|us)\b/.test(t) ||
    /\bon (parental|maternity|paternity) leave\b/.test(t) ||
    /\bvacation respon(se|der)\b/.test(t)
  );
}

/**
 * Adendo 03/09 (founder olhou as 8-9 respostas reais: todas OOO ou "STOP"):
 * pedido de saída TEXTUAL é decidido por CÓDIGO, ANTES de qualquer LLM —
 * gratuito, determinístico, e o pedido do lead é soberano. Cobre o "reply
 * STOP" do CAN-SPAM (10.D.1) e as formas comuns de opt-out. O caminho de
 * unsubscribe rebaixa contacted→lost via nextStageFor (contacted é estágio de
 * MÁQUINA — o webhook promoveu errado; qualified/customer humanos seguem
 * intocáveis por aquela regra).
 */
export function looksLikeTextualUnsubscribe(replyText: string): boolean {
  const t = (replyText || "").trim();
  const s = t.toLowerCase();
  return (
    /^stop\b/i.test(t) ||
    /^unsubscribe\b/.test(s) ||
    /\bstop (emailing|contacting|messaging|sending)\b/.test(s) ||
    /\bunsubscribe\b/.test(s) ||
    /\bremove me\b/.test(s) ||
    /\btake me off\b/.test(s) ||
    /\bdo not (email|contact) me\b/.test(s) ||
    /\bdon'?t (email|contact) me\b/.test(s) ||
    /\bopt me out\b/.test(s)
  );
}

// ---------------------------------------------------------------------------
// Payload extraction (beyond what dossier.ts already gives us).
// ---------------------------------------------------------------------------

/**
 * The SmartLead "reply from master inbox" API needs email_stats_id (and,
 * optionally, the message id being answered). Read both defensively from the
 * stored (double-encoded) payload — SmartLead's shapes vary by account age.
 * Null when absent: the caller then falls back to manual delivery, never to
 * a guessed id.
 */
export function extractReplyRouting(payload: unknown): {
  statsId: string | null;
  messageId: string | null;
} {
  const p = parseSmartleadPayload(payload);
  const pick = (obj: Record<string, unknown>, keys: string[]): string | null => {
    for (const k of keys) {
      const v = obj[k];
      if ((typeof v === "string" && v.trim() !== "") || typeof v === "number") {
        return String(v).trim();
      }
    }
    return null;
  };
  const statsId = pick(p, ["stats_id", "email_stats_id", "sl_email_stats_id", "statsId"]);
  let messageId: string | null = null;
  const rm = p["reply_message"];
  if (rm !== null && typeof rm === "object" && !Array.isArray(rm)) {
    messageId = pick(rm as Record<string, unknown>, ["message_id", "id"]);
  }
  if (!messageId) messageId = pick(p, ["message_id", "reply_message_id"]);
  return { statsId, messageId };
}

/**
 * BUG DE PRODUÇÃO 03/09 (700 enviados, 8 respostas reais, proposed=0): no
 * payload REAL de EMAIL_REPLY o e-mail do lead vem em `sl_lead_email` — a
 * chave `lead_email` NÃO existe, e `to_email` numa RESPOSTA é a NOSSA caixa
 * remetente (o webhook gravava a caixa errada na coluna). Este extractor lê o
 * lead VERDADEIRO do payload, na ordem sl_lead_email → lead_email → email;
 * to_email fica de fora de propósito num reply. Null quando nada resolve —
 * o chamador conta como `unparseable`, nunca engole.
 */
export function extractReplyLeadEmail(payload: unknown): string | null {
  const p = parseSmartleadPayload(payload);
  for (const key of ["sl_lead_email", "lead_email", "email"]) {
    const v = p[key];
    if (typeof v === "string" && v.includes("@")) return v.trim().toLowerCase();
  }
  return null;
}

/**
 * The contact's trilha, read from the prospect-batch note line
 * "[prospect-batch] trilha=geo|aistack campanha=… — …". Null when the note
 * carries none (manually added contacts).
 */
export function extractTrilha(note: string | null | undefined): "geo" | "aistack" | null {
  if (!note) return null;
  const m = /trilha=(geo|aistack)\b/i.exec(note);
  return m ? (m[1]!.toLowerCase() as "geo" | "aistack") : null;
}

// ---------------------------------------------------------------------------
// House facts + prompts. The draft is grounded ONLY in: the lead's reply,
// their trilha, and these facts — sourced from
// docs/departments/sales/aistack-campaign-kit.md. NEVER invented case
// studies, numbers or clients.
// ---------------------------------------------------------------------------

export const HOUSE_FACTS = [
  "Ozvor checks how AI search (ChatGPT, Perplexity, Gemini, Google AI) sees a business.",
  "Free test: 60 seconds, shows how AI engines see their site. No card.",
  "AI Stack Audit: $49. 5 questions, 60 seconds. Finds the ONE right AI tool for their worst bottleneck. 30-day money-back if it tells them nothing new.",
  "Get-Cited Kit: $29. Templates to get a site cited by AI engines.",
  "OrganicPosts by Ozvor: done-for-you content service, $1.5k. We do the work, the client does not.",
  "Sender is Otavio, the founder. He answers personally.",
] as const;

/** The ONLY links a follow-up may carry — exact strings, ?from= included. */
export function allowedFollowupLinks(trilha: "geo" | "aistack" | null): string[] {
  const tag = `followup-${trilha ?? "reply"}`;
  return [`https://ozvor.com/test?from=${tag}`, `https://ozvor.com/ai-audit?from=${tag}`];
}

export function buildIntentPrompt(replyText: string): string {
  return [
    "You classify ONE email reply to a cold outreach email from Ozvor (AI search visibility for small businesses).",
    "Answer with EXACTLY ONE word from this list, nothing else:",
    "interested | question | objection | not-now | unsubscribe | noise",
    "Rules:",
    "- unsubscribe: any form of 'stop emailing me', 'remove me', 'not interested, leave me alone'. A human no is final.",
    "- noise: auto-replies, out-of-office, bounces, delivery failures, mailing-list confirmations — anything not written by the person right now.",
    "- not-now: a human said 'maybe later', 'busy this month', 'circle back'.",
    "- objection: a human pushed back (price, trust, 'we already have this').",
    "- question: a human asked something.",
    "- interested: a human wants to know more / try it / buy.",
    "",
    "The reply:",
    "---",
    replyText.slice(0, 1500),
    "---",
    "One word:",
  ].join("\n");
}

export function buildDraftPrompt(input: {
  replyText: string;
  intent: FollowupIntent;
  trilha: "geo" | "aistack" | null;
  /** 10.C.6 — as últimas respostas REALMENTE enviadas/propostas (lidas do registro por código). */
  recent?: string | null;
}): string {
  const links = allowedFollowupLinks(input.trilha);
  return [
    "Write a SHORT reply email in ENGLISH to a small-business owner who answered our cold email.",
    `Their reply was classified as: ${input.intent}.`,
    `Their trilha (origin track): ${input.trilha ?? "unknown"} (geo = AI-visibility pain, free test is the offer; aistack = wrong-tools pain, the $49 audit is the offer).`,
    "",
    "HARD RULES:",
    "- Ground the reply ONLY in their reply text and the FACTS below. NEVER invent case studies, clients, numbers or features.",
    "- Every sentence 12 words or fewer. Jargon is forbidden — plain 15-year-old English.",
    "- At most 110 words. No greeting fluff. Honest. Answer what they actually said.",
    "- At most ONE link, and ONLY one of these exact URLs (or none):",
    `  ${links.join("\n  ")}`,
    "- No other URLs, no other domains, no email addresses.",
    "- Sign exactly: Otavio",
    "- Output ONLY the email body text. No subject line, no commentary.",
    "",
    "FACTS (the only facts you may use):",
    ...HOUSE_FACTS.map((f) => `- ${f}`),
    "",
    // 10.C.6 — as réguas da casa chegam ao follow-up como chegam aos grafos:
    // [__lessons__] (constante em código) + anti-genérico de vendas + o bloco
    // [__recent__] quando o chamador o leu do registro.
    `[__lessons__]\n${CONTENT_LESSONS}`,
    ANTI_GENERIC_SALES_RULE,
    ...(input.recent && input.recent.trim() ? ["", `[__recent__]\n${input.recent.trim().slice(0, 2000)}`] : []),
    "",
    "Their reply:",
    "---",
    input.replyText.slice(0, 1500),
    "---",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Draft validation — code checks the EXACT text that will be sent.
// ---------------------------------------------------------------------------

export const DRAFT_MAX_CHARS = 900;
const DRAFT_MAX_WORDS = 130;
/** Prompt demands ≤12-word sentences; code rejects at >16 (URL/name headroom). */
const SENTENCE_HARD_MAX_WORDS = 16;
const URL_RE = /https?:\/\/[^\s<>")]+/gi;

export interface DraftValidation {
  ok: boolean;
  errors: string[];
}

export function validateFollowupDraft(
  draft: string,
  trilha: "geo" | "aistack" | null
): DraftValidation {
  const errors: string[] = [];
  const text = (draft || "").trim();
  if (text === "") errors.push("rascunho vazio");
  if (text.length > DRAFT_MAX_CHARS) errors.push(`rascunho > ${DRAFT_MAX_CHARS} chars`);
  if (text.includes("{{") || text.includes("}}")) errors.push("residuo de template {{...}}");

  // 10.C.9 — a regra "sem travessão" também é código aqui: o que se valida é
  // exatamente o que se envia.
  if (/[—–]/.test(text)) errors.push("travessao no texto (regra da casa)");

  const urls = text.match(URL_RE) ?? [];
  if (urls.length > 1) errors.push(`mais de um link (${urls.length})`);
  const allowed = new Set(allowedFollowupLinks(trilha));
  for (const u of urls) {
    const clean = u.replace(/[.,;!?]+$/, "");
    if (!allowed.has(clean)) errors.push(`link fora da allowlist: ${clean.slice(0, 80)}`);
  }
  // Any domain written outside a full URL (e.g. "ozvor.com") slips the URL
  // check — catch bare domains that are not part of an allowed URL.
  const noUrls = text.replace(URL_RE, " ");
  if (/\b[\w-]+\.(com|ai|io|net|org)\b/i.test(noUrls)) {
    errors.push("dominio escrito fora de link permitido");
  }

  const words = noUrls.split(/\s+/).filter(Boolean);
  if (words.length > DRAFT_MAX_WORDS) errors.push(`> ${DRAFT_MAX_WORDS} palavras`);
  for (const sentence of noUrls.split(/[.!?\n]+/)) {
    const n = sentence.split(/\s+/).filter(Boolean).length;
    if (n > SENTENCE_HARD_MAX_WORDS) {
      errors.push(`frase com ${n} palavras (max ${SENTENCE_HARD_MAX_WORDS})`);
      break;
    }
  }
  return { ok: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// GEO-D7 (decisão do founder, 02/09): ZERO PII de prospect no Telegram. O
// portão de follow-up mandava o texto INTEGRAL da resposta do lead para o
// chat — e-mails, telefones, o que fosse. Agora o Telegram recebe um RESUMO
// MASCARADO (intent + primeiros 80 chars com e-mails/telefones redigidos);
// o texto completo fica só no dossiê (crm/smartlead_event, dentro do banco).
// ---------------------------------------------------------------------------

export const REPLY_PREVIEW_MAX_CHARS = 80;
const EMAIL_IN_TEXT_RE = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
/** Sequências telefônicas: 7+ dígitos com separadores comuns. */
const PHONE_IN_TEXT_RE = /\+?\d[\d\s().\/-]{5,}\d/g;

/**
 * O resumo que PODE ir ao Telegram: uma linha, e-mails → [email] e telefones
 * → [tel], cortada em REPLY_PREVIEW_MAX_CHARS. Nunca o texto integral.
 */
export function maskedReplyPreview(replyText: string): string {
  const oneLine = (replyText || "").replace(/\s+/g, " ").trim();
  const masked = oneLine.replace(EMAIL_IN_TEXT_RE, "[email]").replace(PHONE_IN_TEXT_RE, "[tel]");
  return masked.length > REPLY_PREVIEW_MAX_CHARS ? `${masked.slice(0, REPLY_PREVIEW_MAX_CHARS)}…` : masked;
}

/** The SmartLead API sends HTML; the founder approved plain text. Minimal, lossless. */
export function draftToHtml(draft: string): string {
  return draft
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");
}
