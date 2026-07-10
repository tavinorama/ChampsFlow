/**
 * Ozvor Pages API unit tests (#208 PR-3) — the entitlement matrix + slug rules.
 *
 * The founder's isolation requirement ("comprador avulso não pode mexer nos
 * recursos pagos") is enforced server-side: allowance = plan base + purchased
 * credits, re-checked on every create. These tests pin that math for every
 * plan/credit combination, plus the slug validation that guards the public
 * /l/[slug] namespace (reserved words, shape) and the deterministic slugify.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import {
  computeLandingAllowance,
  validateSiteSlug,
  slugify,
  RESERVED_SITE_SLUGS,
  PAGE_TYPES,
  containsPlaceholder,
  registerLandingRoutes,
} from "../../apps/api/src/routes/landing";

describe("computeLandingAllowance — the plan/credit access matrix", () => {
  it("free WITHOUT credit: 0 sites (builder locked — the founder's guarantee)", () => {
    expect(computeLandingAllowance("free", 0)).toEqual({ maxSites: 0, maxPagesPerSite: 6 });
  });

  it("free WITH one $99 credit: exactly 1 site (the standalone buyer)", () => {
    expect(computeLandingAllowance("free", 1).maxSites).toBe(1);
  });

  it("growth: 1 site included", () => {
    expect(computeLandingAllowance("growth", 0).maxSites).toBe(1);
  });

  it("growth + purchased credit stacks: 2 sites", () => {
    expect(computeLandingAllowance("growth", 1).maxSites).toBe(2);
  });

  it("agency: 25 sites (1 per brand)", () => {
    expect(computeLandingAllowance("agency", 0).maxSites).toBe(25);
  });

  it("negative credit values never subtract from the plan base", () => {
    expect(computeLandingAllowance("growth", -5).maxSites).toBe(1);
  });

  it("every tier caps pages per site at 6 (5-page deliverable + campaign slot)", () => {
    for (const tier of ["free", "growth", "agency"] as const) {
      expect(computeLandingAllowance(tier, 0).maxPagesPerSite).toBe(6);
    }
  });
});

describe("validateSiteSlug — guards the public /l/[slug] namespace", () => {
  it("accepts a normal business slug", () => {
    expect(validateSiteSlug("joes-plumbing-austin")).toBeNull();
  });

  it("rejects reserved words that would shadow real routes", () => {
    for (const reserved of ["admin", "api", "login", "pricing", "l", "ozvor"]) {
      expect(RESERVED_SITE_SLUGS.has(reserved)).toBe(true);
      expect(validateSiteSlug(reserved)).toMatch(/reserved/i);
    }
  });

  it("rejects malformed slugs (shape, length, hyphen edges, case)", () => {
    for (const bad of ["ab", "-leading", "trailing-", "UPPER", "with space", "a".repeat(65)]) {
      expect(validateSiteSlug(bad)).not.toBeNull();
    }
  });
});

describe("slugify — deterministic, matches the DB CHECK constraint", () => {
  it("lowercases, strips diacritics, hyphenates", () => {
    expect(slugify("Café São João Encanadores")).toBe("cafe-sao-joao-encanadores");
  });

  it("collapses repeats and trims hyphen edges", () => {
    expect(slugify("  Joe's --- Plumbing!  ")).toBe("joe-s-plumbing");
  });

  it("output passes validateSiteSlug for realistic names", () => {
    for (const name of ["Acme CRM", "Müller & Söhne GmbH", "Pizzaria do Zé 24h"]) {
      const s = slugify(name);
      expect(validateSiteSlug(s)).toBeNull();
    }
  });
});

describe("PAGE_TYPES — the 5-page bundle vocabulary", () => {
  it("contains the bundle types + campaign", () => {
    for (const t of ["home", "service_city", "service", "area", "faq", "proof", "campaign"]) {
      expect(PAGE_TYPES.has(t)).toBe(true);
    }
    expect(PAGE_TYPES.has("anything_else")).toBe(false);
  });
});

describe("containsPlaceholder — the publish guard (#208 PR-5)", () => {
  it("detects the generator's exact marker (packages/llm/src/landing-generate.ts faqFromGap)", () => {
    const sections = [
      { type: "hero", headline: "Acme Plumbing" },
      {
        type: "faq",
        items: [
          {
            q: "Do you offer 24/7 emergency service?",
            a: "Acme Plumbing answers this in Austin: [PLACEHOLDER: 2–3 sentences with your specific answer]. Call 555-0100 for details.",
          },
        ],
      },
    ];
    expect(containsPlaceholder(sections)).toBe(true);
  });

  it("is false for fully-written sections", () => {
    const sections = [
      { type: "hero", headline: "Acme Plumbing", subheadline: "Serving Austin" },
      { type: "cta", heading: "Ready to talk?", phone: "555-0100" },
    ];
    expect(containsPlaceholder(sections)).toBe(false);
  });

  it("handles empty/undefined/null input without throwing", () => {
    expect(containsPlaceholder(undefined)).toBe(false);
    expect(containsPlaceholder(null)).toBe(false);
    expect(containsPlaceholder([])).toBe(false);
  });

  it("does not false-positive on unrelated mentions of the word placeholder", () => {
    expect(containsPlaceholder([{ type: "text", body: "This is a placeholder-free page." }])).toBe(false);
  });

  it("handles a circular value defensively (never throws)", () => {
    const circular: Record<string, unknown> = { type: "text" };
    circular.self = circular;
    expect(() => containsPlaceholder([circular])).not.toThrow();
    expect(containsPlaceholder([circular])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// GET /api/landing/sites/:id/leads (#208 PR-8) — the tenant's read-only view
// of end-customer form submissions. Uses the DEV_AUTH_BYPASS pattern
// (tests/unit/agency.test.ts) with an in-memory mock of PostgresClient.
// ---------------------------------------------------------------------------

describe("GET /api/landing/sites/:id/leads", () => {
  const TENANT_ID = "11111111-1111-1111-1111-111111111111";
  const SITE_ID = "22222222-2222-2222-2222-222222222222";
  const OTHER_SITE_ID = "33333333-3333-3333-3333-333333333333";

  interface MockRow {
    [key: string]: unknown;
  }

  function makeMockDb(
    queryImpl?: (sql: string, params?: unknown[]) => Promise<{ rows: MockRow[] }>
  ) {
    const query = async (sql: string, params?: unknown[]) =>
      queryImpl ? queryImpl(sql, params) : { rows: [] as MockRow[] };
    return {
      query,
      setTenantId: async () => {},
      transaction: async () => undefined,
    };
  }

  function buildApp(db: ReturnType<typeof makeMockDb>): Hono {
    const app = new Hono();
    registerLandingRoutes(app, db as never);
    return app;
  }

  const originalEnv = process.env;
  beforeEach(() => {
    process.env = {
      ...originalEnv,
      NODE_ENV: "test",
      DEV_AUTH_BYPASS: "1",
      DEV_TENANT_ID: TENANT_ID,
    };
  });

  it("returns 404 when the site does not belong to this tenant (ownership check)", async () => {
    const db = makeMockDb(async (sql) => {
      if (sql.includes("FROM landing_sites")) return { rows: [] }; // siteOwnedByTenant → not found
      return { rows: [] };
    });
    const app = buildApp(db);
    const res = await app.request(`/api/landing/sites/${OTHER_SITE_ID}/leads`, {
      headers: { Authorization: "Bearer dev" },
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toMatch(/not found/i);
  });

  it("returns leads scoped to the site, newest first, with the expected row shape", async () => {
    const leadRows = [
      {
        id: "aaaaaaaa-0000-0000-0000-000000000001",
        name: "Jane Doe",
        email: "jane@example.com",
        phone: "555-0100",
        message: "Interested in a quote.",
        consent: true,
        created_at: "2026-07-10T12:00:00Z",
      },
      {
        id: "aaaaaaaa-0000-0000-0000-000000000002",
        name: "",
        email: "anon@example.com",
        phone: "",
        message: "",
        consent: false,
        created_at: "2026-07-09T09:00:00Z",
      },
    ];
    const db = makeMockDb(async (sql) => {
      if (sql.includes("FROM landing_sites")) return { rows: [{ id: SITE_ID }] };
      if (sql.includes("FROM landing_leads")) return { rows: leadRows };
      return { rows: [] };
    });
    const app = buildApp(db);
    const res = await app.request(`/api/landing/sites/${SITE_ID}/leads`, {
      headers: { Authorization: "Bearer dev" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.leads).toHaveLength(2);
    expect(body.leads[0]).toEqual(leadRows[0]);
    expect(body.leads[0]).not.toHaveProperty("ip_trunc");
    expect(body.leads[0]).not.toHaveProperty("user_agent");
    expect(body.leads[0]).not.toHaveProperty("tenant_id");
  });

  it("returns an empty array when the site has no leads", async () => {
    const db = makeMockDb(async (sql) => {
      if (sql.includes("FROM landing_sites")) return { rows: [{ id: SITE_ID }] };
      if (sql.includes("FROM landing_leads")) return { rows: [] };
      return { rows: [] };
    });
    const app = buildApp(db);
    const res = await app.request(`/api/landing/sites/${SITE_ID}/leads`, {
      headers: { Authorization: "Bearer dev" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.leads).toEqual([]);
  });

  it("queries with a LIMIT 200 and ORDER BY created_at DESC (limit shape)", async () => {
    let capturedSql = "";
    const db = makeMockDb(async (sql) => {
      if (sql.includes("FROM landing_sites")) return { rows: [{ id: SITE_ID }] };
      if (sql.includes("FROM landing_leads")) {
        capturedSql = sql;
        return { rows: [] };
      }
      return { rows: [] };
    });
    const app = buildApp(db);
    await app.request(`/api/landing/sites/${SITE_ID}/leads`, {
      headers: { Authorization: "Bearer dev" },
    });
    expect(capturedSql).toMatch(/ORDER BY created_at DESC/i);
    expect(capturedSql).toMatch(/LIMIT 200/i);
  });

  it("returns 401 when no auth header (production mode — no bypass)", async () => {
    const savedBypass = process.env.DEV_AUTH_BYPASS;
    process.env.DEV_AUTH_BYPASS = "";
    try {
      const db = makeMockDb();
      const app = buildApp(db);
      const res = await app.request(`/api/landing/sites/${SITE_ID}/leads`);
      expect(res.status).toBe(401);
    } finally {
      process.env.DEV_AUTH_BYPASS = savedBypass;
    }
  });
});

// ---------------------------------------------------------------------------
// open_fixes — the audit → rebuild loop state (#208 PR-7). GET routes only
// (no BullMQ/queue path involved), so no bullmq/ioredis mocking is needed —
// same DEV_AUTH_BYPASS + mock-PostgresClient pattern as
// tests/unit/cost-control.test.ts, adapted for landing.ts's two GET routes.
// ---------------------------------------------------------------------------

const TENANT_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const USER_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const BRAND_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const SITE_ID = "dddddddd-dddd-dddd-dddd-dddddddddddd";

const originalEnv = process.env;
beforeEach(() => {
  process.env = {
    ...originalEnv,
    NODE_ENV: "test",
    DEV_AUTH_BYPASS: "1",
    DEV_TENANT_ID: TENANT_ID,
    DEV_USER_ID: USER_ID,
  };
});

interface MockRow {
  [key: string]: unknown;
}
type RouteQueryHandler = (sql: string, params?: unknown[]) => MockRow[] | null;

function makeRouteDb(handler: RouteQueryHandler) {
  const queries: string[] = [];
  const params: unknown[][] = [];
  const query = async (sql: string, p?: unknown[]) => {
    queries.push(sql);
    params.push(p ?? []);
    const result = handler(sql, p);
    return { rows: result ?? [] };
  };
  return {
    query,
    setTenantId: async () => {},
    transaction: async () => undefined,
    _queries: queries,
    _params: params,
  };
}

function landingApp(db: ReturnType<typeof makeRouteDb>): Hono {
  const app = new Hono();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  registerLandingRoutes(app, db as any);
  return app;
}

describe("GET /api/landing/sites/:id — open_fixes (#208 PR-7)", () => {
  it("returns the count of proposed/accepted plan_task rows for the site's linked brand", async () => {
    const db = makeRouteDb((sql) => {
      if (sql.includes("FROM landing_sites s WHERE")) {
        return [
          {
            id: SITE_ID,
            brand_id: BRAND_ID,
            slug: "joes-plumbing",
            status: "draft",
            business: {},
            theme: {},
            review_themes: [],
            created_at: "2026-07-01T00:00:00Z",
            updated_at: "2026-07-01T00:00:00Z",
            open_fixes: "3",
          },
        ];
      }
      if (sql.includes("FROM landing_pages WHERE site_id")) return [];
      return [];
    });
    const res = await landingApp(db).request(`/api/landing/sites/${SITE_ID}`, {
      headers: { Authorization: "Bearer dev" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { site: { open_fixes: number } };
    expect(body.site.open_fixes).toBe(3);
  });

  it("returns 0 when the site has no linked brand", async () => {
    const db = makeRouteDb((sql) => {
      if (sql.includes("FROM landing_sites s WHERE")) {
        return [
          {
            id: SITE_ID,
            brand_id: null,
            slug: "joes-plumbing",
            status: "draft",
            business: {},
            theme: {},
            review_themes: [],
            created_at: "2026-07-01T00:00:00Z",
            updated_at: "2026-07-01T00:00:00Z",
            open_fixes: "0",
          },
        ];
      }
      if (sql.includes("FROM landing_pages WHERE site_id")) return [];
      return [];
    });
    const res = await landingApp(db).request(`/api/landing/sites/${SITE_ID}`, {
      headers: { Authorization: "Bearer dev" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { site: { open_fixes: number } };
    expect(body.site.open_fixes).toBe(0);
  });

  it("the open_fixes subquery joins plan_task through strategy_plan, filtered to proposed/accepted", async () => {
    let capturedSql = "";
    const db = makeRouteDb((sql) => {
      if (sql.includes("FROM landing_sites s WHERE")) {
        capturedSql = sql;
        return [
          {
            id: SITE_ID,
            brand_id: BRAND_ID,
            slug: "x",
            status: "draft",
            business: {},
            theme: {},
            review_themes: [],
            created_at: "now",
            updated_at: "now",
            open_fixes: "1",
          },
        ];
      }
      return [];
    });
    await landingApp(db).request(`/api/landing/sites/${SITE_ID}`, { headers: { Authorization: "Bearer dev" } });
    expect(capturedSql).toContain("FROM plan_task pt");
    expect(capturedSql).toContain("JOIN strategy_plan sp ON sp.id = pt.plan_id");
    expect(capturedSql).toContain("pt.status IN ('proposed', 'accepted')");
  });

  it("404s when the site isn't found (never queries open_fixes for a nonexistent site)", async () => {
    const db = makeRouteDb(() => []);
    const res = await landingApp(db).request(`/api/landing/sites/${SITE_ID}`, {
      headers: { Authorization: "Bearer dev" },
    });
    expect(res.status).toBe(404);
  });
});

describe("GET /api/landing/sites — open_fixes per site (#208 PR-7)", () => {
  it("includes open_fixes alongside page_count for every listed site, one round trip", async () => {
    const db = makeRouteDb((sql) => {
      if (sql.includes("FROM landing_sites s") && sql.includes("ORDER BY s.created_at DESC")) {
        return [
          {
            id: SITE_ID,
            slug: "a",
            status: "draft",
            business: {},
            created_at: "now",
            updated_at: "now",
            page_count: "5",
            open_fixes: "2",
          },
          {
            id: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
            slug: "b",
            status: "published",
            business: {},
            created_at: "now",
            updated_at: "now",
            page_count: "5",
            open_fixes: "0",
          },
        ];
      }
      return [];
    });
    const res = await landingApp(db).request("/api/landing/sites", { headers: { Authorization: "Bearer dev" } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { sites: Array<{ open_fixes: number }> };
    expect(body.sites).toHaveLength(2);
    expect(body.sites[0]?.open_fixes).toBe(2);
    expect(body.sites[1]?.open_fixes).toBe(0);
    // Exactly one query issued for the whole list — no N+1.
    expect(db._queries.filter((q) => q.includes("FROM landing_sites"))).toHaveLength(1);
  });
});
