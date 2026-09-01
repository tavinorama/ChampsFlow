/**
 * Unit — the per-client dossier aggregation (apps/api/src/lib/dossier).
 *
 * Fixtures mirror the REAL stored shapes (checked against production rows on
 * 01/09): smartlead_event.payload is a jsonb STRING (double-encoded by the
 * webhook's JSON.stringify + driver serialization), and an EMAIL_REPLY payload
 * carries reply_message.{text,html,time}, preview_text, reply_body and
 * campaign_name. The tests also pin the route's auth guard: every dossier
 * read sits behind requireAuth + requireSuperAdmin like the rest of /admin.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DOSSIER_MAX_ENTRIES,
  buildDossier,
  crmNoteEntries,
  extractCampaignLabel,
  extractReplyText,
  leadCaptureEntries,
  normalizeDossierEmail,
  nurtureEntries,
  orderEntries,
  parseSmartleadPayload,
  smartleadEntries,
  type DossierEntry,
} from "../../../apps/api/src/lib/dossier";

// The real production shape: the payload column holds a JSON *string*.
const REPLY_PAYLOAD_DOUBLE_ENCODED = JSON.stringify({
  event_type: "EMAIL_REPLY",
  campaign_id: 42,
  campaign_name: "GEO cold — lote 3",
  preview_text: "Sounds interesting, tell me more",
  reply_body: "<div>Sounds interesting, <b>tell me more</b></div>",
  reply_message: {
    html: "<div>Sounds interesting, <b>tell me more</b></div>",
    text: "Sounds interesting, tell me more",
    time: "2026-08-20T10:00:00.000Z",
    message_id: "<m1@x>",
  },
  sl_lead_email: "lead@acme.com",
  time_replied: "2026-08-20T10:00:00.000Z",
});

describe("parseSmartleadPayload — tolerates the double-encoded reality", () => {
  it("parses the jsonb-string shape production actually stores", () => {
    const p = parseSmartleadPayload(REPLY_PAYLOAD_DOUBLE_ENCODED);
    expect(p["event_type"]).toBe("EMAIL_REPLY");
  });

  it("accepts a plain object too (if storage is ever fixed)", () => {
    expect(parseSmartleadPayload({ a: 1 })["a"]).toBe(1);
  });

  it("degrades to {} on garbage instead of throwing", () => {
    expect(parseSmartleadPayload("not json")).toEqual({});
    expect(parseSmartleadPayload(null)).toEqual({});
    expect(parseSmartleadPayload(7)).toEqual({});
    expect(parseSmartleadPayload("[1,2]")).toEqual({});
  });
});

describe("extractReplyText — reply content when the payload carries it", () => {
  it("prefers reply_message.text", () => {
    expect(extractReplyText(REPLY_PAYLOAD_DOUBLE_ENCODED)).toBe(
      "Sounds interesting, tell me more"
    );
  });

  it("falls back to preview_text, then stripped reply_body html", () => {
    expect(
      extractReplyText(JSON.stringify({ preview_text: "short preview" }))
    ).toBe("short preview");
    expect(
      extractReplyText(JSON.stringify({ reply_body: "<p>Hi &amp; thanks</p>" }))
    ).toBe("Hi & thanks");
  });

  it("returns null when nothing usable exists (opens, bounces, sends)", () => {
    expect(extractReplyText(JSON.stringify({ event_type: "EMAIL_OPEN" }))).toBeNull();
  });

  it("truncates monster replies so the response stays bounded", () => {
    const long = "x".repeat(5000);
    const out = extractReplyText(JSON.stringify({ reply_message: { text: long } }));
    expect(out?.length).toBeLessThanOrEqual(600);
  });
});

describe("extractCampaignLabel", () => {
  it("prefers campaign_name over the numeric id", () => {
    expect(extractCampaignLabel(REPLY_PAYLOAD_DOUBLE_ENCODED, 42)).toBe("GEO cold — lote 3");
  });
  it("falls back to 'campaign <id>' and then null", () => {
    expect(extractCampaignLabel("{}", 42)).toBe("campaign 42");
    expect(extractCampaignLabel("{}", null)).toBeNull();
  });
});

describe("smartleadEntries — reply detail only for EMAIL_REPLY", () => {
  const rows = [
    {
      event_type: "EMAIL_REPLY",
      campaign_id: 42,
      payload: REPLY_PAYLOAD_DOUBLE_ENCODED,
      received_at: "2026-08-20T10:00:01.000Z",
    },
    {
      event_type: "EMAIL_OPEN",
      campaign_id: 42,
      payload: JSON.stringify({ campaign_name: "GEO cold — lote 3" }),
      received_at: "2026-08-18T09:00:00.000Z",
    },
  ];

  it("maps type, campaign and reply content", () => {
    const entries = smartleadEntries(rows);
    expect(entries[0]).toMatchObject({
      source: "smartlead",
      kind: "EMAIL_REPLY",
      campaign: "GEO cold — lote 3",
      detail: "Sounds interesting, tell me more",
    });
    expect(entries[1].detail).toBeNull();
  });
});

describe("crmNoteEntries — the note field parsed as timeline lines", () => {
  const crm = {
    stage: "contacted",
    note: [
      "[smartlead] EMAIL_OPEN (campaign 42) 2026-08-18",
      "founder: ligou, pediu proposta",
      "[recycle] proposto 2026-09-01 campanha recycle-2026-09-01",
    ].join("\n"),
    updated_at: "2026-09-01T12:00:00.000Z",
  };

  it("dates lines by their embedded ISO date; free text gets updated_at", () => {
    const entries = crmNoteEntries(crm, { skipSmartleadLines: false });
    expect(entries).toHaveLength(3);
    expect(entries[0].at).toBe("2026-08-18T00:00:00.000Z");
    expect(entries[1].at).toBe("2026-09-01T12:00:00.000Z"); // free text
    expect(entries[2].at).toBe("2026-09-01T00:00:00.000Z"); // recycle marker
    expect(entries[2].kind).toBe("recycle_marker");
  });

  it("skips [smartlead] echoes when the event source loaded (no duplicates)", () => {
    const entries = crmNoteEntries(crm, { skipSmartleadLines: true });
    expect(entries.map((e) => e.kind)).toEqual(["note", "recycle_marker"]);
  });

  it("keeps [smartlead] lines when the event source failed — degraded but visible", () => {
    const entries = crmNoteEntries(crm, { skipSmartleadLines: false });
    expect(entries.some((e) => e.kind === "smartlead_note")).toBe(true);
  });

  it("empty note → no entries", () => {
    expect(crmNoteEntries({ ...crm, note: null }, { skipSmartleadLines: true })).toEqual([]);
  });
});

describe("lead capture / orders / nurture entries", () => {
  it("lead capture carries attribution as campaign", () => {
    const [e] = leadCaptureEntries([
      {
        brand: "Acme Roofing",
        source: "invisibility_test",
        origin_from: "aistack-lote3",
        utm_campaign: null,
        created_at: "2026-08-01T00:00:00.000Z",
      },
    ]);
    expect(e).toMatchObject({ source: "test", kind: "invisibility_test", campaign: "aistack-lote3" });
  });

  it("orders name the product and keep paid/delivered in the detail", () => {
    const [kit, audit] = orderEntries([
      { product: "kit", status: "delivered", created_at: "2026-08-02T00:00:00.000Z", paid_at: "2026-08-02T01:00:00.000Z", delivered_at: "2026-08-02T02:00:00.000Z", extra: "Acme" },
      { product: "ai_audit", status: "paid", created_at: "2026-08-03T00:00:00.000Z", paid_at: null, delivered_at: null, extra: null },
    ]);
    expect(kit.title).toContain("Get-Cited Kit");
    expect(kit.detail).toContain("paid 2026-08-02");
    expect(audit.title).toContain("AI Audit");
    expect(audit.source).toBe("purchase");
  });

  it("nurture yields one entry per enrollment plus one per send", () => {
    const entries = nurtureEntries(
      [
        { sequence: "free_to_kit", current_step: 2, total_steps: 5, enrolled_at: "2026-08-05T00:00:00.000Z", suppressed: false, suppressed_reason: null, completed_at: null },
        { sequence: "kit_to_dfy", current_step: 1, total_steps: 3, enrolled_at: "2026-08-06T00:00:00.000Z", suppressed: true, suppressed_reason: "unsubscribed", completed_at: null },
      ],
      [{ sequence: "free_to_kit", step: 1, sent_at: "2026-08-07T00:00:00.000Z" }]
    );
    expect(entries).toHaveLength(3);
    expect(entries[0].title).toContain("step 2/5");
    expect(entries[1].title).toContain("suppressed (unsubscribed)");
    expect(entries[2].kind).toBe("send");
  });
});

describe("buildDossier — merge, newest-first sort, cap", () => {
  const entry = (at: string): DossierEntry => ({
    at,
    source: "crm",
    kind: "note",
    title: "t",
    detail: null,
    campaign: null,
  });

  it("sorts newest first across groups", () => {
    const { entries } = buildDossier([
      [entry("2026-01-01T00:00:00Z")],
      [entry("2026-03-01T00:00:00Z"), entry("2026-02-01T00:00:00Z")],
    ]);
    expect(entries.map((e) => e.at.slice(5, 7))).toEqual(["03", "02", "01"]);
  });

  it("caps at DOSSIER_MAX_ENTRIES and reports truncation honestly", () => {
    const many = Array.from({ length: DOSSIER_MAX_ENTRIES + 10 }, (_, i) =>
      entry(new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString())
    );
    const { entries, truncated } = buildDossier([many]);
    expect(entries).toHaveLength(DOSSIER_MAX_ENTRIES);
    expect(truncated).toBe(true);
    // The cap drops the OLDEST, never the newest.
    expect(entries[0].at).toBe(many[many.length - 1].at);
  });

  it("an invalid timestamp sorts last instead of throwing", () => {
    const { entries } = buildDossier([[entry("garbage"), entry("2026-01-01T00:00:00Z")]]);
    expect(entries[1].at).toBe("garbage");
  });
});

describe("normalizeDossierEmail", () => {
  it("normalizes like the webhook does", () => {
    expect(normalizeDossierEmail("  Lead@Acme.COM ")).toBe("lead@acme.com");
  });
  it("rejects garbage", () => {
    expect(normalizeDossierEmail("")).toBeNull();
    expect(normalizeDossierEmail("no-at-sign")).toBeNull();
    expect(normalizeDossierEmail("@x")).toBeNull();
    expect(normalizeDossierEmail("x@")).toBeNull();
    expect(normalizeDossierEmail("a".repeat(400) + "@x.com")).toBeNull();
  });
});

describe("the dossier route's shape (source-pinned like the webhook tests)", () => {
  const route = readFileSync(
    join(__dirname, "../../../apps/api/src/routes/admin.ts"),
    "utf8"
  );

  it("guards the dossier read with requireAuth + requireSuperAdmin", () => {
    const m = route.match(
      /app\.get\("\/api\/admin\/contacts\/:email\/dossier",\s*requireAuth,\s*requireSuperAdmin/
    );
    expect(m, "dossier route must mirror the admin CRM guard").not.toBeNull();
  });

  it("guards the recycle-batches read the same way", () => {
    const m = route.match(
      /app\.get\("\/api\/admin\/recycle-batches",\s*requireAuth,\s*requireSuperAdmin/
    );
    expect(m).not.toBeNull();
  });

  it("carries the GDPR/LGPD retention note (view creates no new data)", () => {
    expect(route).toContain("creates and retains NO new personal data");
  });

  it("logs counts, never the email (no PII in logs)", () => {
    // lastIndexOf: both paths also appear in the file-header route list.
    const start = route.lastIndexOf("/api/admin/contacts/:email/dossier");
    const end = route.lastIndexOf("/api/admin/recycle-batches");
    const dossierBlock = route.slice(start, end);
    expect(dossierBlock).toContain("admin_dossier_fetched");
    // The fetched-log call must not interpolate the email (the JSON response
    // right after it legitimately does — cut at the logger call's end).
    const fromLog = dossierBlock.slice(dossierBlock.indexOf("admin_dossier_fetched"));
    const logCall = fromLog.slice(0, fromLog.indexOf("});"));
    expect(logCall).not.toContain("email");
  });
});
