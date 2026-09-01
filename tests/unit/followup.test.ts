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
  hasOpenFollowupProposal,
  looksLikeAutoReplyNoise,
  parseIntent,
  validateFollowupDraft,
} from "../../apps/api/src/lib/followup";
import { extractReplyText } from "../../apps/api/src/lib/dossier";

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
