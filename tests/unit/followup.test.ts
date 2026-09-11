/**
 * Unit — the pure half of the reply follow-up loop (5.A.2,
 * apps/api/src/lib/followup.ts).
 *
 * What is pinned here:
 *  - the "[followup] <verbo> <event_id>" marker is the ONLY handled-state
 *    (append-only crm note, no new table): any verb marks the event handled,
 *    and an undecided 'proposto' blocks a second in-flight proposal for the
 *    same contact;
 *  - intent parsing is code over the model's word — unsubscribe outranks
 *    everything (a human no is final), garbage degrades to 'question' (safe:
 *    a question only ever produces a DRAFT that still faces the gate);
 *  - the auto-reply noise pre-filter is deterministic and free;
 *  - the draft validator checks the EXACT text that would be sent (#511):
 *    one link max, strict ?from= allowlist, no bare domains, no template
 *    residue, short sentences;
 *  - the double-encoded jsonb payload (production shape since 10/08) yields
 *    stats_id / message_id / reply text through the same tolerant parser the
 *    dossier uses.
 */
import { describe, it, expect } from "vitest";
import {
  FOLLOWUP_APPROVAL_TIMEOUT_HOURS,
  allowedFollowupLinks,
  buildDraftPrompt,
  buildIntentPrompt,
  draftToHtml,
  extractReplyRouting,
  extractTrilha,
  followupMarkerLine,
  hasFollowupMarker,
  hasHumanText,
  hasOpenFollowupProposal,
  looksLikeAutoReplyNoise,
  parseIntent,
  validateFollowupDraft,
  HUMAN_COURTESY_OPENERS,
} from "../../apps/api/src/lib/followup";
import { extractReplyText, htmlToText } from "../../apps/api/src/lib/dossier";

const NOW = new Date("2026-09-01T12:00:00.000Z");
const EVENT_A = "11111111-2222-3333-4444-555555555555";
const EVENT_B = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

describe("followup markers — the append-only handled-state", () => {
  it("any verb for the event id counts as handled (idempotency key)", () => {
    for (const verb of ["proposto", "enviado", "aprovado", "rejeitado", "expirado", "descartado"] as const) {
      const note = `[smartlead] EMAIL_REPLY (campaign 9) 2026-08-30\n${followupMarkerLine(verb, EVENT_A, NOW)}`;
      expect(hasFollowupMarker(note, EVENT_A), verb).toBe(true);
    }
    expect(hasFollowupMarker(`${followupMarkerLine("proposto", EVENT_A, NOW)}`, EVENT_B)).toBe(false);
    expect(hasFollowupMarker(null, EVENT_A)).toBe(false);
  });

  it("an undecided 'proposto' means an OPEN proposal; any decision closes it", () => {
    const open = followupMarkerLine("proposto", EVENT_A, NOW, "intent=question");
    expect(hasOpenFollowupProposal(open)).toBe(true);
    for (const verb of ["enviado", "aprovado", "rejeitado", "expirado", "descartado"] as const) {
      expect(hasOpenFollowupProposal(`${open}\n${followupMarkerLine(verb, EVENT_A, NOW)}`), verb).toBe(false);
    }
    // A decision for a DIFFERENT event does not close this one.
    expect(hasOpenFollowupProposal(`${open}\n${followupMarkerLine("enviado", EVENT_B, NOW)}`)).toBe(true);
  });

  it("marker line carries verb, event id, date and the extra suffix", () => {
    expect(followupMarkerLine("proposto", EVENT_A, NOW, "intent=interested")).toBe(
      `[followup] proposto ${EVENT_A} 2026-09-01 intent=interested`
    );
  });
});

describe("parseIntent — code over the model's word", () => {
  it("recognizes each of the six intents", () => {
    for (const t of ["interested", "question", "objection", "not-now", "unsubscribe", "noise"] as const) {
      expect(parseIntent(t)).toBe(t);
      expect(parseIntent(`  ${t.toUpperCase()}  `)).toBe(t);
    }
  });

  it("unsubscribe outranks everything on a mixed answer — a human no is final", () => {
    expect(parseIntent("not-now, maybe unsubscribe")).toBe("unsubscribe");
    expect(parseIntent("unsubscribe (though it reads like a question)")).toBe("unsubscribe");
  });

  it("garbage degrades to 'question' — the only safe default (draft still faces the gate)", () => {
    expect(parseIntent("")).toBe("question");
    expect(parseIntent("the lead seems mildly enthusiastic about tooling")).toBe("question");
  });

  it("reads the first non-empty line of a chatty answer", () => {
    expect(parseIntent("\n\ninterested\nBecause they asked for pricing.")).toBe("interested");
  });
});

describe("looksLikeAutoReplyNoise — deterministic, free, before any LLM", () => {
  it("catches the classic machine shapes", () => {
    for (const t of [
      "I am out of office until Monday.",
      "This is an automatic reply.",
      "Auto-reply: traveling",
      "Delivery Status Notification (Failure)",
      "mailer-daemon: undeliverable",
      "John is no longer with the company.",
      "I'm on parental leave until March.",
    ]) {
      expect(looksLikeAutoReplyNoise(t), t).toBe(true);
    }
  });

  it("lets human replies through", () => {
    expect(looksLikeAutoReplyNoise("How much does the audit cost?")).toBe(false);
    expect(looksLikeAutoReplyNoise("Not interested, please remove me.")).toBe(false);
  });
});

describe("validateFollowupDraft — the exact text that would be sent", () => {
  const good = [
    "Thanks for asking. The audit costs $49.",
    "You answer 5 questions. It takes 60 seconds.",
    "Money back in 30 days if it tells you nothing new.",
    "Here it is: https://ozvor.com/ai-audit?from=followup-aistack",
    "Otavio",
  ].join("\n");

  it("accepts a short, single-allowlisted-link draft", () => {
    expect(validateFollowupDraft(good, "aistack")).toMatchObject({ ok: true });
  });

  it("rejects a second link", () => {
    const two = `${good}\nAlso try https://ozvor.com/test?from=followup-aistack`;
    expect(validateFollowupDraft(two, "aistack").ok).toBe(false);
  });

  it("rejects links outside the allowlist — including a wrong ?from tag", () => {
    expect(validateFollowupDraft("See https://example.com/x\nOtavio", "geo").ok).toBe(false);
    expect(
      validateFollowupDraft("Try https://ozvor.com/ai-audit?from=aistack-2026\nOtavio", "aistack").ok
    ).toBe(false);
  });

  it("rejects a bare domain written outside a link (SmartLead auto-linkifies)", () => {
    expect(validateFollowupDraft("Just search for ozvor.com and see.\nOtavio", null).ok).toBe(false);
  });

  it("rejects template residue, emptiness and run-on sentences", () => {
    expect(validateFollowupDraft("Hi {{first_name}}, thanks!", null).ok).toBe(false);
    expect(validateFollowupDraft("", null).ok).toBe(false);
    const runOn =
      "This is one very long sentence that keeps going and going with far too many words to ever pass the twelve word rule we enforce here";
    expect(validateFollowupDraft(runOn, null).ok).toBe(false);
  });

  it("the allowlist follows the trilha tag (unknown trilha → followup-reply)", () => {
    expect(allowedFollowupLinks("geo")).toContain("https://ozvor.com/test?from=followup-geo");
    expect(allowedFollowupLinks("aistack")).toContain("https://ozvor.com/ai-audit?from=followup-aistack");
    expect(allowedFollowupLinks(null)).toContain("https://ozvor.com/test?from=followup-reply");
  });
});

describe("payload extraction — the double-encoded jsonb production shape", () => {
  // The webhook JSON.stringify's the body and the driver serializes again, so
  // the stored jsonb value is a STRING whose text is the JSON object.
  const doubleEncoded = JSON.stringify({
    event_type: "EMAIL_REPLY",
    campaign_id: 3888686,
    stats_id: "stats-123",
    reply_message: { message_id: "<msg-1@x>", text: "How much is it?" },
  });

  it("extracts reply text through the dossier's tolerant parser", () => {
    expect(extractReplyText(doubleEncoded)).toBe("How much is it?");
  });

  it("extracts stats_id and message_id defensively (both shapes)", () => {
    expect(extractReplyRouting(doubleEncoded)).toEqual({ statsId: "stats-123", messageId: "<msg-1@x>" });
    expect(
      extractReplyRouting({ email_stats_id: "s2", message_id: "m2" })
    ).toEqual({ statsId: "s2", messageId: "m2" });
    expect(extractReplyRouting({ foo: 1 })).toEqual({ statsId: null, messageId: null });
    expect(extractReplyRouting("not json at all")).toEqual({ statsId: null, messageId: null });
  });

  it("reads the trilha from the prospect-batch note line", () => {
    expect(extractTrilha("[prospect-batch] trilha=aistack campanha=aistack-2026-09-08 — achado")).toBe("aistack");
    expect(extractTrilha("[prospect-batch] trilha=geo campanha=geo-x — y")).toBe("geo");
    expect(extractTrilha("founder note, no trilha")).toBeNull();
    expect(extractTrilha(null)).toBeNull();
  });
});

describe("prompts and delivery shape", () => {
  it("the intent prompt embeds the reply and demands one word", () => {
    const p = buildIntentPrompt("Can you call me tomorrow?");
    expect(p).toContain("Can you call me tomorrow?");
    expect(p).toContain("EXACTLY ONE word");
  });

  it("the draft prompt forbids invented facts and pins the link allowlist", () => {
    const p = buildDraftPrompt({ replyText: "price?", intent: "question", trilha: "geo" });
    expect(p).toContain("NEVER invent case studies");
    expect(p).toContain("https://ozvor.com/test?from=followup-geo");
    expect(p).toContain("Sign exactly: Otavio");
  });

  it("draftToHtml escapes and converts newlines only — approved text stays intact", () => {
    expect(draftToHtml("a < b\nc & d")).toBe("a &lt; b<br>c &amp; d");
  });

  it("the approval timeout is 96h — silence is rejection, never approval", () => {
    expect(FOLLOWUP_APPROVAL_TIMEOUT_HOURS).toBe(96);
  });
});

// ---------------------------------------------------------------------------
// INCIDENTE 05-09/09 — a única resposta de interesse real chegou 05/09 18:53
// UTC e o rascunho só nasceu 09/09 19:00 (≈190 varreduras mudas). Postmortem:
// docs/learning/postmortems/2026-09-11-followup-4-dias.md. O texto abaixo é
// SINTÉTICO, com a mesma FORMA da resposta real (HTML de cliente de e-mail +
// abertura de cortesia). Zero PII: nome, e-mail e domínio inventados.
// ---------------------------------------------------------------------------

/** A prosa humana por baixo do markup (sintética, sem PII). */
const REAL_REPLY_HUMAN_TEXT = [
  "Hello there! Thank you so much for taking the time to write me.",
  "We all only have so much time in our lives, and I'm trying to be really intentional with mine.",
  "Right now I'm focused on getting found when people ask AI about roof repair.",
  "Can you tell me what the audit actually looks at?",
].join(" ");

/** Como um cliente de e-mail real embrulha essa prosa (head enorme primeiro). */
const REAL_REPLY_HTML = `<html xmlns:o="urn:schemas-microsoft-com:office:office"><head><meta http-equiv="Content-Type" content="text/html; charset=utf-8"><meta name="Generator" content="Microsoft Word 15 (filtered medium)"><style><!--/* Font Definitions */@font-face {font-family:"Cambria Math"; panose-1:2 4 5 3 5 4 6 3 2 4;}p.MsoNormal, li.MsoNormal, div.MsoNormal {margin:0cm; font-size:11.0pt; font-family:"Calibri",sans-serif;}--></style></head><body lang="EN-GB"><div class="WordSection1"><p class="MsoNormal">${REAL_REPLY_HUMAN_TEXT.replace(/'/g, "&#39;")}</p></div></body></html>`;

describe("incidente 05-09/09 — a resposta humana que morreu em silêncio", () => {
  it("html de cliente de e-mail vira PROSA, nunca <head> cru", () => {
    const text = htmlToText(REAL_REPLY_HTML);
    expect(text).toContain("Thank you so much for taking the time");
    expect(text).toContain("audit actually looks at");
    expect(text).not.toContain("<");
    expect(text).not.toContain("font-family");
    expect(text).not.toContain("&#39;");
    expect(text).toContain("I'm trying");
  });

  it("o corpo COMPLETO vence o preview truncado (o classificador via 40 chars)", () => {
    // Forma de produção: preview_text é um excerto curto, reply_body é o corpo.
    const payload = JSON.stringify({
      event_type: "EMAIL_REPLY",
      sl_lead_email: "owner@rooferco.example",
      reply_body: REAL_REPLY_HTML,
      preview_text: REAL_REPLY_HUMAN_TEXT.slice(0, 40),
    });
    const text = extractReplyText(payload)!;
    expect(text).toContain("Can you tell me what the audit actually looks at?");
    expect(text.length).toBeGreaterThan(200);
  });

  it("reply_message.text em HTML é lido como texto (era devolvido cru)", () => {
    const payload = JSON.stringify({
      event_type: "EMAIL_REPLY",
      reply_message: { message_id: "<m@x>", text: REAL_REPLY_HTML },
    });
    const text = extractReplyText(payload)!;
    expect(text).toContain("Thank you so much for taking the time");
    expect(text).not.toContain("<head>");
  });

  it("uma fonte sem texto não envenena a leitura — cai para a seguinte", () => {
    const payload = JSON.stringify({
      event_type: "EMAIL_REPLY",
      reply_message: { text: "   " },
      preview_text: "<html><head><style>p {margin:0cm;}</style></head><body></body></html>",
      reply_body: `<div>${REAL_REPLY_HUMAN_TEXT}</div>`,
    });
    expect(extractReplyText(payload)).toContain("audit actually looks at");
  });

  it("payload sem nenhum texto legível devolve null (ilegível, nunca vazio)", () => {
    const payload = JSON.stringify({
      event_type: "EMAIL_REPLY",
      reply_body: '<html><head><style>p {margin:0cm;}</style></head><body><img src="cid:x"></body></html>',
    });
    expect(extractReplyText(payload)).toBeNull();
  });

  it("CORTESIA NUNCA é auto-reply: 'thank you for your email' é como humano abre", () => {
    for (const opener of HUMAN_COURTESY_OPENERS) {
      expect(looksLikeAutoReplyNoise(opener)).toBe(false);
      expect(looksLikeAutoReplyNoise(`${opener} ${REAL_REPLY_HUMAN_TEXT}`)).toBe(false);
    }
    expect(looksLikeAutoReplyNoise(REAL_REPLY_HUMAN_TEXT)).toBe(false);
  });

  it("auto-reply DE VERDADE continua apanhado por código, sem LLM", () => {
    const machine = [
      "Automatic reply: I am away from my desk",
      "Auto-Submitted: auto-replied",
      "X-Autoreply: yes",
      "I am out of the office until Monday.",
      "I am currently away and will reply on my return.",
      "She is on maternity leave until March.",
      "I am on leave until the 20th.",
      "Delivery has failed to these recipients",
      "Your message is undeliverable.",
      "mailer-daemon@example.com",
    ];
    for (const m of machine) expect(looksLikeAutoReplyNoise(m)).toBe(true);
  });

  it("hasHumanText: prosa sim, markup cru e vazio não", () => {
    expect(hasHumanText(REAL_REPLY_HUMAN_TEXT)).toBe(true);
    expect(hasHumanText("Sounds good, tell me more please")).toBe(true);
    expect(hasHumanText(REAL_REPLY_HTML)).toBe(false);
    expect(hasHumanText('p.MsoNormal {margin:0cm; font-family:"Calibri";}')).toBe(false);
    expect(hasHumanText("")).toBe(false);
    expect(hasHumanText(null)).toBe(false);
    expect(hasHumanText("ok")).toBe(false); // curto demais para ser resposta
  });
});
