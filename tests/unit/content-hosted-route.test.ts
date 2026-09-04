/**
 * content-hosted-route.test.ts — P0-08 end to end, through the real route.
 *
 * This is the test that would have caught the defect. Before this change,
 * POST /api/brands/:id/content answered 402 "Content generation needs an AI
 * key" to every customer without a BYOK key — which is every SMB — and the
 * report's acceptance criterion is exactly this endpoint's behaviour:
 * "BYOK ausente usa provider hospedado onde plano permite" and "Auditoria
 * elegível produz draft sem chave do cliente" (RELATORIO §16 P0-08, §17).
 *
 * Driven through a real Hono app with a fake Postgres, a stand-in auth, and a
 * stubbed generateContent, so nothing here touches a provider, Redis, or a
 * database.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";

vi.mock("../../packages/shared/src/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../../apps/api/src/auth/middleware", () => ({
  requireAuth: async (
    c: { req: { header: (n: string) => string | undefined }; set: (k: string, v: unknown) => void },
    next: () => Promise<void>
  ) => {
    c.set("auth", {
      userId: "u1",
      tenantId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      role: "owner",
      supabaseUid: "s1",
      isSuperAdmin: false,
    });
    await next();
  },
  requireRole: () => async (_c: unknown, next: () => Promise<void>) => next(),
}));

vi.mock("../../apps/api/src/routes/billing", () => ({
  requireNotRestricted: () => async (_c: unknown, next: () => Promise<void>) => next(),
}));

// BYOK resolution is the ONLY thing we vary between the two cost models.
const clientKey = { value: null as string | null };
vi.mock("../../apps/api/src/routes/system", () => ({
  resolveProviderKey: async () => clientKey.value,
}));

// The generator itself is stubbed: this test is about what the ROUTE does with
// the result, not about prompt construction.
const generated = {
  title: "How to choose a CRM",
  body: "A genuinely useful, specific answer about choosing a CRM for a small law firm. ".repeat(6),
  schemaMarkup: null as string | null,
  generatedBy: "llm" as "llm" | "rules" | "error",
  keyUsed: "platform" as "client" | "platform" | "none",
  rationale: null as string | null,
};
vi.mock("../../packages/llm/src/index", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  generateContent: async () => ({ ...generated }),
}));

import { registerAuditRoutes } from "../../apps/api/src/routes/audits";
import type { PostgresClient } from "../../packages/shared/src/db-client";
import { creditsForHostedDraft } from "../../packages/shared/src/hosted-content";

const AUDIT_ID = "dddddddd-dddd-dddd-dddd-dddddddddddd";

interface Statement { sql: string; params: unknown[] }

function makeDb(opts?: {
  balance?: number;
  competitors?: string[];
  existingDraft?: boolean;
}) {
  const statements: Statement[] = [];
  const ledger: number[] = [];
  const refs = new Set<string>();
  const startingBalance = opts?.balance ?? 100_000;

  const db = {
    setTenantId: async () => {},
    async query(sql: string, params: unknown[] = []) {
      statements.push({ sql, params });

      if (sql.includes("FROM brands WHERE id")) {
        return { rows: [{ name: "Acme Law CRM", category: "CRM", domain: "acme.test", market: "US small law firms", region: "US" }] };
      }
      if (sql.includes("FROM geo_audit ga")) {
        return { rows: [{ audit_id: AUDIT_ID, provider_breakdown: {} }] };
      }
      if (sql.includes("FROM citation_check")) {
        return { rows: [{ query_text: "best CRM for small law firms" }] };
      }
      if (sql.includes("FROM content_piece") && sql.includes("generation_key")) {
        return opts?.existingDraft
          ? { rows: [{ id: "cp-existing", content_type: "blog", title: "Old", body: "Old body", schema_markup: null, status: "draft", created_at: "2026-09-01" }] }
          : { rows: [] };
      }
      if (sql.includes("plan_tier FROM tenants")) return { rows: [{ plan_tier: "growth" }] };
      if (sql.includes("FROM competitor WHERE brand_id")) {
        return { rows: (opts?.competitors ?? []).map((name) => ({ name })) };
      }
      if (sql.includes("INSERT INTO credit_ledger")) {
        const ref = String(params[2] ?? "");
        if (sql.includes("'content'")) {
          if (refs.has(ref)) return { rows: [] };
          refs.add(ref);
          ledger.push(Number(params[1]));
          return { rows: [{ id: "l1" }] };
        }
        return { rows: [] }; // monthly grant / expiry: already issued
      }
      if (sql.includes("SUM(delta)")) {
        return { rows: [{ balance: String(startingBalance + ledger.reduce((a, b) => a + b, 0)), purchased: "0" }] };
      }
      if (sql.includes("FROM credit_ledger") && sql.includes("monthly_grant")) {
        return { rows: [{ "?column?": 1 }] }; // grant exists for this period
      }
      return { rows: [] };
    },
  } as unknown as PostgresClient;

  return { db, statements, ledger };
}

function app(db: PostgresClient): Hono {
  const a = new Hono();
  registerAuditRoutes(a, db);
  return a;
}

function post(a: Hono, body: Record<string, unknown> = {}) {
  return a.request("/api/brands/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/content", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content_type: "blog", topic: "How to choose a CRM", ...body }),
  });
}

const PLATFORM_ENV = "ANTHROPIC_API_KEY";
const savedEnv = process.env[PLATFORM_ENV];

beforeEach(() => {
  clientKey.value = null;
  generated.generatedBy = "llm";
  generated.body = "A genuinely useful, specific answer about choosing a CRM for a small law firm. ".repeat(6);
  process.env[PLATFORM_ENV] = "sk-platform";
  delete process.env["TELEGRAM_BOT_TOKEN"];
  delete process.env["TELEGRAM_CHAT_ID"];
});
afterEach(() => {
  if (savedEnv === undefined) delete process.env[PLATFORM_ENV];
  else process.env[PLATFORM_ENV] = savedEnv;
});

describe("POST /api/brands/:id/content — the customer has no API key", () => {
  it("WRITES THE DRAFT ANYWAY, on our key — the P0-08 fix", async () => {
    // Before this change this exact request returned 402 "add an AI key".
    const { db, statements } = makeDb();
    const res = await post(app(db));
    expect(res.status).toBe(201);
    const b = (await res.json()) as { status: string; ai_generated: boolean; keyUsed: string; billing: { charged: boolean } };
    expect(b.status).toBe("draft");
    expect(b.ai_generated).toBe(true);
    expect(statements.some((s) => s.sql.includes("INSERT INTO content_piece"))).toBe(true);
    // And it was OURS that paid — which is the actual change. Without the
    // client→platform cascade this is not billed to the platform at all.
    expect(b.billing.charged).toBe(true);
  });

  it("charges the credit ledger EXACTLY ONCE for it", async () => {
    const { db, ledger } = makeDb();
    const res = await post(app(db));
    const b = (await res.json()) as { billing: { charged: boolean; drafts_left: number | null; message: string } };
    expect(b.billing.charged).toBe(true);
    expect(ledger).toEqual([-creditsForHostedDraft()]);
  });

  it("reports the cost in DRAFTS, never in tokens or credits-per-prompt-audit", async () => {
    const { db } = makeDb();
    const res = await post(app(db));
    const b = (await res.json()) as { billing: { message: string; drafts_left: number | null } };
    expect(b.billing.message).toMatch(/draft/i);
    expect(b.billing.message.toLowerCase()).not.toContain("token");
    expect(typeof b.billing.drafts_left).toBe("number");
  });

  it("does NOT publish — the draft is born for review", async () => {
    // RELATORIO §16 P0-08 item 5. The insert must say 'draft', and nothing in
    // this path may set 'published'.
    const { db, statements } = makeDb();
    await post(app(db));
    const insert = statements.find((s) => s.sql.includes("INSERT INTO content_piece"));
    expect(insert!.sql).toContain("'draft'");
    expect(insert!.sql).not.toContain("published");
  });
});

describe("BYOK survives, and stays free", () => {
  it("uses the client's key and charges NOTHING", async () => {
    clientKey.value = "sk-client";
    const { db, ledger } = makeDb();
    const res = await post(app(db));
    expect(res.status).toBe(201);
    const b = (await res.json()) as { billing: { charged: boolean; message: string } };
    expect(b.billing.charged).toBe(false);
    expect(b.billing.message).toMatch(/your own AI key/i);
    expect(ledger).toHaveLength(0);
  });

  it("does not even read the balance on the BYOK path", async () => {
    clientKey.value = "sk-client";
    const { db, statements } = makeDb({ balance: 0 });
    const res = await post(app(db));
    // A client paying their own provider is not gated by our wallet.
    expect(res.status).toBe(201);
    expect(statements.some((s) => s.sql.includes("INSERT INTO credit_ledger"))).toBe(false);
  });
});

describe("an empty wallet", () => {
  it("refuses HONESTLY, offers the way out, and does not spin or throw a raw error", async () => {
    const { db, statements } = makeDb({ balance: 0 });
    const res = await post(app(db));
    expect(res.status).toBe(402);
    const b = (await res.json()) as { code: string; body: string; credits: { offer: string; drafts_left: number | null } };
    expect(b.code).toBe("insufficient_credits");
    expect(b.body).toMatch(/Nothing was charged/i);
    expect(b.credits.offer).toMatch(/pack/i);
    expect(b.credits.offer).toMatch(/plan/i);
    // The old message told the customer to go get an API key. It must not return.
    expect(b.body).not.toMatch(/AI engines & keys/i);
    // Nothing was generated and nothing was written.
    expect(statements.some((s) => s.sql.includes("INSERT INTO content_piece"))).toBe(false);
  });
});

describe("failure does not charge", () => {
  it("a provider that returns no draft costs the customer nothing, and is NOT silent", async () => {
    // RELATORIO §16 P0-08 item 7 and §17 "Draft failure cria retry/alerta, não
    // silêncio". Debiting up front and refunding would put a compensating
    // UPDATE in an append-only ledger; not spending has no such hole.
    generated.generatedBy = "rules";
    const { db, ledger, statements } = makeDb();
    const res = await post(app(db));
    expect(res.status).toBe(502);
    const b = (await res.json()) as { body: string; attempts: number };
    expect(ledger).toHaveLength(0);
    expect(statements.some((s) => s.sql.includes("INSERT INTO content_piece"))).toBe(false);
    // Retried, and dead-lettered rather than dropped.
    expect(b.attempts).toBe(3);
    expect(statements.some((s) => s.sql.includes("content_generation_failure"))).toBe(true);
    expect(b.body).toMatch(/nothing was charged/i);
  });

  it("a draft that fails the fact-check is thrown away, uncharged, and recorded", async () => {
    generated.body = `${"A useful answer about CRMs. ".repeat(12)}\nowner: hermes\nTODO: numbers`;
    const { db, ledger, statements } = makeDb();
    const res = await post(app(db));
    expect(res.status).toBe(422);
    const b = (await res.json()) as { code: string; body: string };
    expect(b.code).toBe("fact_check_failed");
    expect(ledger).toHaveLength(0);
    expect(statements.some((s) => s.sql.includes("INSERT INTO content_piece"))).toBe(false);
    expect(statements.some((s) => s.sql.includes("content_generation_failure"))).toBe(true);
    expect(b.body).toMatch(/charged you nothing/i);
  });

  it("blocks a draft that names an unvouched competitor", async () => {
    generated.body = `${"A useful answer about CRMs. ".repeat(12)} Unlike Clio, we keep it simple.`;
    const { db, ledger } = makeDb({ competitors: ["Clio"] });
    const res = await post(app(db));
    expect(res.status).toBe(422);
    expect(ledger).toHaveLength(0);
  });
});

describe("reprocessing", () => {
  it("returns the SAME draft and charges nothing when the generation key already exists", async () => {
    // Idempotent by auditId + actionId + artifactType + version.
    const { db, ledger, statements } = makeDb({ existingDraft: true });
    const res = await post(app(db));
    expect(res.status).toBe(200);
    const b = (await res.json()) as { id: string; reused: boolean; billing: { charged: boolean } };
    expect(b.id).toBe("cp-existing");
    expect(b.reused).toBe(true);
    expect(b.billing.charged).toBe(false);
    expect(ledger).toHaveLength(0);
    // No second draft.
    expect(statements.some((s) => s.sql.includes("INSERT INTO content_piece"))).toBe(false);
  });

  it("keys the ledger debit on the generation key, so a retried job cannot double-charge", async () => {
    const { db, ledger } = makeDb();
    const a = app(db);
    await post(a);
    await post(a); // identical request: same audit, same artifact, same version
    expect(ledger).toEqual([-creditsForHostedDraft()]);
  });

  it("an explicit new version IS a new, chargeable draft", async () => {
    const { db, ledger } = makeDb();
    const a = app(db);
    await post(a, { version: 1 });
    await post(a, { version: 2 });
    expect(ledger).toHaveLength(2);
  });
});

describe("the evidence pack reaches the reviewer", () => {
  it("returns the evidence the draft was grounded on, and the fact-check verdict", async () => {
    const { db } = makeDb();
    const res = await post(app(db));
    const b = (await res.json()) as {
      evidence: Array<{ id: string; statement: string; source: string }>;
      fact_check: { ok: boolean; evidenceCount: number };
    };
    expect(b.evidence.length).toBeGreaterThan(0);
    expect(b.evidence.some((e) => e.source === "AI search probe")).toBe(true);
    expect(b.fact_check.ok).toBe(true);
    expect(b.fact_check.evidenceCount).toBe(b.evidence.length);
  });
});
