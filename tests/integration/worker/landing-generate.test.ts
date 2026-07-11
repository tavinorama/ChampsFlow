/**
 * Integration tests — Ozvor Pages generator PLUMBING against real Postgres.
 *
 * This is the "did the 5-page generation actually run end-to-end?" proof the
 * product never had in production (issue #208 / the create-bug postmortem: no
 * site had ever reached generation, so the write path had never executed
 * against real Postgres). It runs the REAL worker job processor
 * (processLandingGenerateJob) through the REAL RLS-wrapped worker DB client
 * (withRlsContext → drops into app_user), with ONLY the Anthropic HTTP call
 * stubbed — every SQL statement executes against a live Postgres so any
 * type-inference / column / NOT-NULL / RLS bug surfaces here (the same class
 * of "only fails on real Postgres" bug that broke site creation).
 *
 * Two modes:
 *   MOCK — no platform key → deterministic template bundle. Asserts the full
 *          write path: 5 pages, non-empty sections, home overwritten in place
 *          (versioned), ai_generation_log rows, plan_task gap closure
 *          (exercises the COALESCE(null-uuid-param, col) path), and NO
 *          api_spend row (mock runs are free).
 *   LLM  — platform key set + global.fetch stubbed to return a realistic hero
 *          rewrite. Asserts mode='llm', hero rewritten through the LLM path,
 *          the api_spend op='pages_generate' ledger row, and provider on the
 *          compliance log.
 *
 * Requires a live Postgres with migrations applied. Skipped unless
 * POSTGRES_TEST_URL is set — same gating as tests/integration/worker/rls.test.ts.
 *
 * Local: docker run -d -e POSTGRES_PASSWORD=test -e POSTGRES_DB=organic_posts_test \
 *          -p 55432:5432 postgres:16
 *        DATABASE_URL=postgres://postgres:test@127.0.0.1:55432/organic_posts_test \
 *          node packages/db/scripts/migrate.js
 *        POSTGRES_TEST_URL=postgres://postgres:test@127.0.0.1:55432/organic_posts_test \
 *          npx vitest run tests/integration/worker/landing-generate.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import postgres from "postgres";
import { randomUUID } from "node:crypto";
import { withRlsContext } from "../../../apps/worker/src/db/rls-client";
import { processLandingGenerateJob } from "../../../apps/worker/src/jobs/landing-generate";

const POSTGRES_TEST_URL = process.env["POSTGRES_TEST_URL"];
const skipIfNoDb = POSTGRES_TEST_URL ? describe : describe.skip;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySql = any;

// A fake BullMQ Job — the processor only reads `.data`.
function makeJob(data: { tenant_id: string; site_id: string; job_kind: "generate" | "regenerate" }) {
  return { data } as Parameters<typeof processLandingGenerateJob>[0];
}

skipIfNoDb("Ozvor Pages generator — real-Postgres plumbing", () => {
  let seed: AnySql; // privileged connection (RLS bypassed) for fixtures + verification
  let sql: AnySql; // RLS-wrapped worker client — the actual write path under test

  const tenantId = randomUUID();
  const brandId = randomUUID();
  const planId = randomUUID();
  const faqGapId = randomUUID();
  const homeGapId = randomUUID();

  const savedAnthropicKey = process.env["ANTHROPIC_API_KEY"];

  beforeAll(async () => {
    seed = postgres(POSTGRES_TEST_URL as string, { max: 4, idle_timeout: 5, ssl: false });
    sql = withRlsContext(postgres(POSTGRES_TEST_URL as string, { max: 4, idle_timeout: 5, ssl: false }));

    // Clean slate for this tenant.
    await seed`DELETE FROM tenants WHERE id = ${tenantId}`;

    await seed`
      INSERT INTO tenants (id, name, plan, plan_tier, created_at)
      VALUES (${tenantId}, 'Pages Plumbing Co', 'agency', 'growth', NOW())
    `;
    await seed`
      INSERT INTO brands (id, tenant_id, name, region)
      VALUES (${brandId}, ${tenantId}, 'Pages Plumbing Co', 'US')
    `;
    await seed`
      INSERT INTO strategy_plan (id, tenant_id, brand_id, generated_by, created_at)
      VALUES (${planId}, ${tenantId}, ${brandId}, 'rules', NOW())
    `;
    // Two open gaps — one FAQ-shaped (routes to the faq page), one generic
    // (routes to home). Both are 'proposed' so the run consumes + closes them.
    await seed`
      INSERT INTO plan_task (id, tenant_id, plan_id, vector, gap, action, effort, impact, priority, status)
      VALUES
        (${faqGapId}, ${tenantId}, ${planId}, 'ai',
         'Missing FAQ answering "best plumber in Austin"', 'Add an FAQ page', 'low', 'high', 90, 'proposed'),
        (${homeGapId}, ${tenantId}, ${planId}, 'brand',
         'Homepage lacks service-area clarity', 'State the service areas on the home page', 'low', 'medium', 50, 'proposed')
    `;
  });

  afterAll(async () => {
    if (seed) {
      // ai_generation_log.tenant_id is ON DELETE RESTRICT (compliance evidence
      // must survive a tenant delete) — clear it before the tenant cascade.
      await seed`DELETE FROM ai_generation_log WHERE tenant_id = ${tenantId}`;
      await seed`DELETE FROM tenants WHERE id = ${tenantId}`;
      await seed`DELETE FROM api_spend WHERE op = 'pages_generate' AND est_cost_cents = 4242`;
      await seed.end({ timeout: 5 });
    }
    if (sql) await sql.end({ timeout: 5 });
    if (savedAnthropicKey === undefined) delete process.env["ANTHROPIC_API_KEY"];
    else process.env["ANTHROPIC_API_KEY"] = savedAnthropicKey;
  });

  // Helper: seed a fresh draft site + its stub home page (mirrors what
  // POST /api/landing/sites creates). No website → the SSRF crawl is skipped,
  // keeping the run deterministic and network-free (besides the stubbed LLM).
  async function seedDraftSite(opts: { brand?: boolean }): Promise<{ siteId: string; homeId: string; slug: string }> {
    const siteId = randomUUID();
    const homeId = randomUUID();
    const slug = `plumb-${siteId.slice(0, 8)}`;
    const business = {
      name: "Pages Plumbing Co",
      category: "Plumber",
      address: "123 Main St, Austin, TX",
      phone: "(512) 555-0100",
      serviceAreas: ["Austin", "Round Rock"],
      hours: "Mon-Fri 8am-6pm",
    };
    await seed`
      INSERT INTO landing_sites (id, tenant_id, brand_id, slug, status, business, created_at, updated_at)
      VALUES (${siteId}, ${tenantId}, ${opts.brand ? brandId : null}, ${slug}, 'draft',
              ${seed.json(business)}, NOW(), NOW())
    `;
    await seed`
      INSERT INTO landing_pages (id, tenant_id, site_id, page_type, slug, title, created_at, updated_at)
      VALUES (${homeId}, ${tenantId}, ${siteId}, 'home', '', 'Pages Plumbing Co', NOW(), NOW())
    `;
    // One authorized testimonial (used) + one unauthorized (must be ignored).
    await seed`
      INSERT INTO landing_testimonials (id, tenant_id, site_id, author, body, rating, source, authorized)
      VALUES
        (${randomUUID()}, ${tenantId}, ${siteId}, 'Dana R', 'Fast honest plumbing work, fixed our leak same day.', 5, 'manual', TRUE),
        (${randomUUID()}, ${tenantId}, ${siteId}, 'Hidden', 'DO NOT SHOW THIS unauthorized review.', 1, 'manual', FALSE)
    `;
    return { siteId, homeId, slug };
  }

  it("MOCK mode: writes exactly the 5-page bundle with non-empty sections and closes audit gaps", async () => {
    delete process.env["ANTHROPIC_API_KEY"]; // force mock mode

    const { siteId, homeId } = await seedDraftSite({ brand: true });

    const spendBefore = Number(
      (await seed`SELECT COUNT(*)::int AS c FROM api_spend WHERE op = 'pages_generate'`)[0].c
    );

    const result = await processLandingGenerateJob(
      makeJob({ tenant_id: tenantId, site_id: siteId, job_kind: "generate" }),
      sql
    );

    expect(result.mode).toBe("mock");
    expect(result.pages_written).toBe(5);

    // --- exactly 5 pages, expected types, all sections non-empty ---
    const pages = await seed`
      SELECT id, page_type, slug, title, sections, status,
             jsonb_array_length(sections) AS section_count
        FROM landing_pages WHERE site_id = ${siteId} ORDER BY page_type, slug
    `;
    expect(pages).toHaveLength(5);
    const types = pages.map((p: AnySql) => p.page_type).sort();
    expect(types).toEqual(["faq", "home", "proof", "service_city", "service_city"]);
    for (const p of pages) {
      expect(Number(p.section_count)).toBeGreaterThan(0);
    }

    // Home was UPDATED in place (same id the "create" seeded), not duplicated.
    const home = pages.find((p: AnySql) => p.slug === "");
    expect(home).toBeTruthy();
    expect(home.id).toBe(homeId);
    expect(Number(home.section_count)).toBeGreaterThan(0);

    // Unauthorized testimonial body must never appear in any generated section.
    const blob = JSON.stringify(pages);
    expect(blob).not.toContain("DO NOT SHOW THIS");

    // --- ai_generation_log: one GEO-7 row per written page, provider 'internal' ---
    const logRows = await seed`
      SELECT feature_id, provider FROM ai_generation_log WHERE tenant_id = ${tenantId}
    `;
    expect(logRows.length).toBe(5);
    for (const r of logRows) {
      expect(r.feature_id).toBe("GEO-7");
      expect(r.provider).toBe("internal");
    }

    // --- home page previous (empty) content snapshotted by the generator ---
    const versions = await seed`
      SELECT saved_by FROM landing_page_versions WHERE page_id = ${homeId}
    `;
    expect(versions.length).toBeGreaterThanOrEqual(1);
    expect(versions.some((v: AnySql) => v.saved_by === "generator")).toBe(true);

    // --- audit → rebuild loop: both consumed gaps closed with evidence + site link ---
    const gaps = await seed`
      SELECT id, status, landing_site_id, evidence, landing_page_id
        FROM plan_task WHERE id IN (${faqGapId}, ${homeGapId})
    `;
    expect(gaps).toHaveLength(2);
    for (const g of gaps) {
      expect(g.status).toBe("done");
      expect(g.landing_site_id).toBe(siteId);
      expect(g.evidence).toContain("Applied by Ozvor Pages generation");
      expect(g.landing_page_id).toBeTruthy(); // COALESCE(null-uuid-param, col) path OK on real PG
    }

    // --- mock runs cost nothing: no new api_spend row ---
    const spendAfter = Number(
      (await seed`SELECT COUNT(*)::int AS c FROM api_spend WHERE op = 'pages_generate'`)[0].c
    );
    expect(spendAfter).toBe(spendBefore);
  }, 60_000);

  it("LLM mode: stubbed Anthropic call rewrites the hero and records api_spend", async () => {
    process.env["ANTHROPIC_API_KEY"] = "sk-ant-test-stub";
    process.env["LANDING_GENERATE_COST_CENTS"] = "4242"; // sentinel so afterAll can clean it

    const realFetch = global.fetch;
    // Only the Anthropic endpoint is ever hit (no website → no crawl fetch).
    const heroRewrite = [
      { slug: "", headline: "STUBBED-LIVE-HEADLINE", subheadline: "stubbed subheadline from the model" },
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    global.fetch = (async (url: any) => {
      const u = String(url);
      if (u.includes("api.anthropic.com")) {
        return new Response(
          JSON.stringify({ content: [{ type: "text", text: JSON.stringify(heroRewrite) }] }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      throw new Error(`unexpected fetch in test: ${u}`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;

    try {
      const { siteId } = await seedDraftSite({ brand: false });

      const spendBefore = Number(
        (await seed`SELECT COUNT(*)::int AS c FROM api_spend WHERE op = 'pages_generate'`)[0].c
      );

      const result = await processLandingGenerateJob(
        makeJob({ tenant_id: tenantId, site_id: siteId, job_kind: "generate" }),
        sql
      );

      expect(result.mode).toBe("llm");
      expect(result.pages_written).toBe(5);

      // Hero of the home page came through the LLM path (stubbed rewrite).
      const home = (
        await seed`SELECT sections FROM landing_pages WHERE site_id = ${siteId} AND slug = ''`
      )[0];
      const heroSection = (home.sections as Array<Record<string, unknown>>).find(
        (s) => s.type === "hero"
      );
      expect(heroSection?.headline).toBe("STUBBED-LIVE-HEADLINE");

      // api_spend ledger row written for the LLM run (op='pages_generate').
      const spendAfter = Number(
        (await seed`SELECT COUNT(*)::int AS c FROM api_spend WHERE op = 'pages_generate'`)[0].c
      );
      expect(spendAfter).toBe(spendBefore + 1);

      // Compliance log provider is 'anthropic' for the LLM run.
      const logRows = await seed`
        SELECT DISTINCT provider FROM ai_generation_log
          WHERE tenant_id = ${tenantId} AND input_hash IN (
            SELECT input_hash FROM ai_generation_log WHERE tenant_id = ${tenantId}
          )
      `;
      expect(logRows.some((r: AnySql) => r.provider === "anthropic")).toBe(true);
    } finally {
      global.fetch = realFetch;
      delete process.env["LANDING_GENERATE_COST_CENTS"];
    }
  }, 60_000);
});
