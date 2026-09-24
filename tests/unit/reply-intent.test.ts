/**
 * reply-intent.test.ts — B9 (Codex D22, 23/09).
 * Twelve replies sat unclassified while the engines were down; the only
 * "yes" was found by hand. Code classifies first; the LLM drafts later.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { classifyReplyIntent, replyNoteLine } from "../../apps/api/src/lib/reply-intent";
import { nextStageFor } from "../../apps/api/src/lib/smartlead-stage";

describe("classifyReplyIntent", () => {
  it("the real one: 'Yes Please check' is positive", () => {
    expect(classifyReplyIntent("Yes Please check")).toBe("positive");
    expect(classifyReplyIntent("Sounds interesting, send me more.")).toBe("positive");
    expect(classifyReplyIntent("How much does it cost?")).toBe("positive");
  });
  it("STOP beats everything, including a polite no", () => {
    expect(classifyReplyIntent("STOP")).toBe("stop");
    expect(classifyReplyIntent("Not interested, please remove me from your list.")).toBe("stop");
    expect(classifyReplyIntent("unsubscribe")).toBe("stop");
  });
  it("an out-of-office is nobody answering", () => {
    expect(classifyReplyIntent("Automatic reply: I am out of the office until Monday.")).toBe("out_of_office");
    expect(classifyReplyIntent("I'm on parental leave until October.")).toBe("out_of_office");
  });
  it("a no is a no, and a no with a question mark is still a no", () => {
    expect(classifyReplyIntent("No thanks, we're all set.")).toBe("negative");
    expect(classifyReplyIntent("Not interested. Who gave you my email?")).toBe("negative");
  });
  it("a question, then unknown; empty is unknown", () => {
    expect(classifyReplyIntent("Who is this?")).toBe("question");
    expect(classifyReplyIntent("Received.")).toBe("unknown");
    expect(classifyReplyIntent("")).toBe("unknown");
    expect(classifyReplyIntent(null)).toBe("unknown");
  });
  it("the note carries the verdict, the campaign and the day — never the text", () => {
    expect(replyNoteLine("positive", 3975169, new Date("2026-09-21T16:24:00Z"))).toBe("[reply] positive (campaign 3975169) 2026-09-21");
  });
});

describe("nextStageFor with a reply intent", () => {
  it("a textual STOP moves machine stages to lost", () => {
    expect(nextStageFor("new", "EMAIL_REPLY", "stop")).toBe("lost");
    expect(nextStageFor("contacted", "EMAIL_REPLY", "stop")).toBe("lost");
  });
  it("an out-of-office never promotes", () => {
    expect(nextStageFor("new", "EMAIL_REPLY", "out_of_office")).toBeNull();
  });
  it("positive, negative, question, unknown promote to contacted as before", () => {
    for (const i of ["positive", "negative", "question", "unknown"] as const) expect(nextStageFor("new", "EMAIL_REPLY", i)).toBe("contacted");
  });
  it("still never touches qualified/customer, and never resurrects lost", () => {
    expect(nextStageFor("qualified", "EMAIL_REPLY", "stop")).toBeNull();
    expect(nextStageFor("customer", "EMAIL_REPLY", "positive")).toBeNull();
    expect(nextStageFor("lost", "EMAIL_REPLY", "positive")).toBeNull();
  });
});

describe("the webhook wires it", () => {
  const route = readFileSync(join(__dirname, "../../apps/api/src/routes/webhooks-smartlead.ts"), "utf8");
  it("classifies the reply text by code, writes a [reply] note and passes the intent to the stage machine", () => {
    expect(route).toContain("classifyReplyIntent(extractReplyText(payload))");
    expect(route).toContain("replyNoteLine(intent, campaignId, now)");
    expect(route).toContain("nextStageFor(current, eventType, intent ?? undefined)");
  });
  it("a positive reply goes to the top of the follow-up queue and wakes the founder, without the address", () => {
    expect(route).toContain('const followUpToday = intent === "positive"');
    expect(route).toContain("next_follow_up = CASE WHEN $5 THEN NOW() ELSE crm_contact.next_follow_up END");
    expect(route).toMatch(/alertOps\(\s*`🟢 RESPOSTA POSITIVA/);
    expect(route).not.toMatch(/alertOps\([^)]*leadEmail/);
  });
});
