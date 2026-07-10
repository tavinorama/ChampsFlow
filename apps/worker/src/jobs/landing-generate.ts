/**
 * BullMQ landing-generate job processor — Ozvor Pages 5-page bundle generator
 * (issue #208, PR-4).
 *
 * Job payload: { tenant_id, site_id, job_kind } — no PII (IDs + an enum only,
 * same GEO-SEC-3 convention as geo-audit's AuditJobData).
 *
 * Flow (inside withRlsContext(tenant_id), matching audit-run.ts):
 *   1. Load the site (business/theme/brand_id) — bail out gracefully if the
 *      site is suspended or missing a business name (nothing to generate).
 *   2. Load AUTHORIZED testimonials only (unauthorized content must never
 *      render — landing_testimonials.authorized rights attestation).
 *   3. Derive review themes (deterministic keyword extraction) and persist to
 *      landing_sites.review_themes.
 *   4. Best-effort SSRF-guarded crawl of the CLIENT'S OWN site (never Google —
 *      zero googleapis.com/maps|places anywhere). Crawl failure is caught and
 *      logged; it never fails the generation.
 *   5. Load the linked brand's OPEN plan_task rows (status proposed/accepted)
 *      as audit gaps — the audit → rebuild loop (#208).
 *   6. Resolve the client's own BYOK provider key (never a platform key —
 *      content generation is a client-key feature, same as content-studio).
 *      No key configured → mock mode; this is never a failure.
 *   7. buildLandingBundle() — pure, packages/llm/src/landing-generate.ts.
 *   8. Write results: existing page (by page_type+slug, home always exists
 *      from PR-3) → snapshot to landing_page_versions (saved_by='generator',
 *      pruned to VERSION_CAP) then UPDATE; missing page → INSERT, but NEVER
 *      beyond the tenant's max_pages_per_site allowance.
 *   9. Score each page's ai_readiness with content-geo's shared trait scorer
 *      applied to the generated section text (renderSectionsForScoring).
 *  10. ai_generation_log row per page (GEO-A6 convention, feature_id 'GEO-7',
 *      migration 20260710000003 — hashes only, no raw section text).
 *  11. Mark consumed plan_task rows landing_site_id = site_id (status is left
 *      untouched — closing the loop is PR-7's job).
 *
 * Hard rules: parameterized SQL only; ai_generation_log INSERT-only; no raw
 * PII in logs; never fabricate — buildLandingBundle's mock mode only
 * restructures real input facts, and the crawl only ever touches the
 * client's own domain.
 */

import type { Job } from "bullmq";
import postgres from "postgres";
import { createHash, randomUUID } from "node:crypto";
import {
  buildLandingBundle,
  deriveReviewThemes,
  renderSectionsForScoring,
  scorePage,
  computeContentScoreFromTraits,
  type ContentProvider,
  type LandingBusinessInput,
} from "../../../../packages/llm/src/index";
import { guardedFetch, assertPublicUrl } from "../../../../packages/llm/src/ssrf-guard";
import { decryptToken } from "../../../../packages/shared/src/crypto";
import { logger } from "../../../../packages/shared/src/logger";
import { runWithTenant } from "../../../api/src/db/tenant-context";
import { computeLandingAllowance } from "../../../api/src/routes/landing";
import type { PlanTier } from "../../../api/src/integrations/stripe";

export interface LandingGenerateJobData {
  tenant_id: string;
  site_id: string;
  job_kind: "generate" | "regenerate";
}

const VERSION_CAP = 20;

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

/** Maps the packages/llm ContentProvider id to ai_generation_log's provider CHECK values. */
function dbProvider(p: ContentProvider): string {
  if (p === "gemini") return "google";
  return p;
}

// ---------------------------------------------------------------------------
// business JSONB is free-form (set by POST /api/landing/sites as
// `{ name, ...body.business }` — no fixed client-side shape enforced yet).
// These helpers narrow it defensively rather than trusting the shape.
// ---------------------------------------------------------------------------

interface LandingGenerateBusinessRaw {
  name?: unknown;
  category?: unknown;
  address?: unknown;
  phone?: unknown;
  website?: unknown;
  serviceAreas?: unknown;
  service_areas?: unknown;
  hours?: unknown;
}

function toStringOrUndefined(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function toServiceAreas(business: LandingGenerateBusinessRaw): string[] | undefined {
  const raw = Array.isArray(business.serviceAreas)
    ? business.serviceAreas
    : Array.isArray(business.service_areas)
      ? business.service_areas
      : undefined;
  if (!raw) return undefined;
  const areas = (raw as unknown[])
    .filter((a): a is string => typeof a === "string" && a.trim().length > 0)
    .map((a) => a.trim());
  return areas.length > 0 ? areas : undefined;
}

function toHours(business: LandingGenerateBusinessRaw): string | Record<string, string> | undefined {
  const h = business.hours;
  if (typeof h === "string" && h.trim()) return h.trim();
  if (h && typeof h === "object" && !Array.isArray(h)) {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(h as Record<string, unknown>)) {
      if (typeof v === "string" && v.trim()) out[k] = v.trim();
    }
    return Object.keys(out).length > 0 ? out : undefined;
  }
  return undefined;
}

function toLandingBusiness(raw: LandingGenerateBusinessRaw): LandingBusinessInput | null {
  const name = toStringOrUndefined(raw.name);
  if (!name) return null;
  return {
    name,
    category: toStringOrUndefined(raw.category),
    address: toStringOrUndefined(raw.address),
    phone: toStringOrUndefined(raw.phone),
    website: toStringOrUndefined(raw.website),
    serviceAreas: toServiceAreas(raw),
    hours: toHours(raw),
  };
}

// ---------------------------------------------------------------------------
// Best-effort crawl of the CLIENT'S OWN site — SSRF-guarded, never Google.
// Extracts candidate service names (short h2/h3 headings) and FAQPage JSON-LD
// entries. Returns undefined on any failure — caller treats this as optional.
// ---------------------------------------------------------------------------

const CRAWL_TIMEOUT_MS = 8000;
const CRAWL_MAX_BODY = 512 * 1024;
const CRAWL_UA = "OzvorBot-Crawler/1.0 (+https://ozvor.com/bot)";
const NAV_HEADING_STOPWORDS = new Set([
  "about", "about us", "contact", "contact us", "home", "blog", "privacy",
  "terms", "login", "sign in", "sign up", "cart", "search", "menu",
  "careers", "faq", "faqs", "reviews", "testimonials", "gallery",
]);

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractServiceHeadings(html: string): string[] {
  const out: string[] = [];
  const re = /<h[23][^>]*>([\s\S]*?)<\/h[23]>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null && out.length < 5) {
    const text = stripTags(m[1] ?? "");
    if (!text || text.length > 60) continue;
    if (NAV_HEADING_STOPWORDS.has(text.toLowerCase())) continue;
    if (out.some((o) => o.toLowerCase() === text.toLowerCase())) continue;
    out.push(text);
  }
  return out;
}

function extractFaqsFromJsonLd(html: string): Array<{ q: string; a: string }> {
  const out: Array<{ q: string; a: string }> = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null && out.length < 6) {
    const block = m[1] ?? "";
    if (!/"@type"\s*:\s*"?faqpage"?/i.test(block)) continue;
    try {
      const data = JSON.parse(block) as {
        mainEntity?: Array<{ name?: string; acceptedAnswer?: { text?: string } }>;
      };
      const entities = Array.isArray(data.mainEntity) ? data.mainEntity : [];
      for (const e of entities) {
        if (e.name && e.acceptedAnswer?.text) out.push({ q: e.name, a: e.acceptedAnswer.text });
        if (out.length >= 6) break;
      }
    } catch {
      // Malformed JSON-LD — best-effort only, skip this block.
    }
  }
  return out;
}

async function fetchCrawlBody(url: string): Promise<string | null> {
  try {
    const res = await guardedFetch(url, {
      timeoutMs: CRAWL_TIMEOUT_MS,
      headers: { "User-Agent": CRAWL_UA, Accept: "text/html,application/xml,text/xml,*/*" },
    });
    if (!res.ok) return null;
    return (await res.text()).slice(0, CRAWL_MAX_BODY);
  } catch {
    return null;
  }
}

async function buildCrawlSummary(
  website: string
): Promise<{ services?: string[]; faqs?: Array<{ q: string; a: string }> } | undefined> {
  const withScheme = /^https?:\/\//i.test(website) ? website : `https://${website}`;
  const parsed = new URL(withScheme); // throws on malformed input — caller catches
  await assertPublicUrl(parsed); // GEO-SEC-1/4 — throws on any SSRF violation
  const html = await fetchCrawlBody(parsed.toString());
  if (!html) return undefined;
  const services = extractServiceHeadings(html);
  const faqs = extractFaqsFromJsonLd(html);
  const summary: { services?: string[]; faqs?: Array<{ q: string; a: string }> } = {};
  if (services.length > 0) summary.services = services;
  if (faqs.length > 0) summary.faqs = faqs;
  return Object.keys(summary).length > 0 ? summary : undefined;
}

// ---------------------------------------------------------------------------
// Client BYOK key resolution — same priority + decrypt pattern as
// apps/api/src/routes/system.ts:resolveProviderKey, adapted for the worker's
// raw postgres-js client (already RLS-scoped by withRlsContext at the caller).
// SERP is excluded — it is a search API, not a content generator (same
// exclusion content-studio.ts's ContentProvider makes).
// ---------------------------------------------------------------------------

const KEY_PROVIDER_PRIORITY: ContentProvider[] = ["anthropic", "openai", "gemini", "perplexity"];

async function resolveClientProviderKey(
  sql: postgres.Sql,
  tenantId: string
): Promise<{ provider: ContentProvider; apiKey: string } | null> {
  try {
    const rows = await sql<{ provider: string; key_encrypted: Buffer | Uint8Array }[]>`
      SELECT provider, key_encrypted FROM provider_keys WHERE tenant_id = ${tenantId}
    `;
    const byProvider = new Map(rows.map((r) => [r.provider, r.key_encrypted]));
    for (const provider of KEY_PROVIDER_PRIORITY) {
      const blob = byProvider.get(provider);
      if (!blob) continue;
      try {
        const apiKey = decryptToken(Buffer.isBuffer(blob) ? blob : Buffer.from(blob));
        return { provider, apiKey };
      } catch {
        continue; // corrupt/old-key-version blob — try the next provider
      }
    }
    return null;
  } catch {
    return null; // provider_keys unreadable for any reason — fall back to mock mode
  }
}

// ---------------------------------------------------------------------------
// Main processor
// ---------------------------------------------------------------------------

export async function processLandingGenerateJob(
  job: Job<LandingGenerateJobData>,
  sql: postgres.Sql
): Promise<{ site_id: string; pages_written: number; mode: "mock" | "llm" }> {
  const { tenant_id, site_id } = job.data;

  return runWithTenant(tenant_id, async () => {
    // 1. Load the site.
    const siteRows = await sql<
      { id: string; brand_id: string | null; status: string; business: unknown }[]
    >`SELECT id, brand_id, status, business FROM landing_sites WHERE id = ${site_id}`;
    const site = siteRows[0];
    if (!site) {
      throw new Error("site_not_found");
    }
    if (site.status === "suspended") {
      // Defensive: the API route already blocks this, but a suspend landing
      // between enqueue and processing must not silently generate content.
      logger.warn("landing_generate_skipped_suspended", { site_id });
      return { site_id, pages_written: 0, mode: "mock" as const };
    }

    const business = toLandingBusiness((site.business ?? {}) as LandingGenerateBusinessRaw);
    if (!business) {
      logger.warn("landing_generate_skipped_no_business_name", { site_id });
      return { site_id, pages_written: 0, mode: "mock" as const };
    }

    // 2. Authorized testimonials only.
    const testimonialRows = await sql<
      { author: string; body: string; rating: number | null }[]
    >`SELECT author, body, rating FROM landing_testimonials
        WHERE site_id = ${site_id} AND authorized = TRUE
        ORDER BY created_at DESC LIMIT 20`;

    // Normalize DB rows (rating: number|null) to the generator's input shape
    // (rating?: number|undefined) once, reused for theme derivation + the bundle.
    const testimonials = testimonialRows.map((t) => ({
      author: t.author,
      body: t.body,
      rating: t.rating ?? undefined,
    }));

    // 3. Derive + persist review themes.
    const reviewThemes = deriveReviewThemes(testimonials);
    await sql`UPDATE landing_sites SET review_themes = ${sql.json(reviewThemes)}, updated_at = NOW() WHERE id = ${site_id}`;

    // 4. Best-effort SSRF-guarded crawl of the client's OWN site. Failure is
    //    caught here and MUST NOT fail generation.
    let crawlSummary: { services?: string[]; faqs?: Array<{ q: string; a: string }> } | undefined;
    if (business.website) {
      try {
        crawlSummary = await buildCrawlSummary(business.website);
      } catch (err) {
        logger.warn("landing_generate_crawl_failed", {
          site_id,
          message: (err as Error).message?.slice(0, 160),
        });
      }
    }

    // 5. Open audit gaps for the linked brand (audit → rebuild loop, #208).
    let auditGaps: string[] = [];
    let consumedTaskIds: string[] = [];
    if (site.brand_id) {
      try {
        const gapRows = await sql<{ id: string; gap: string; action: string }[]>`
          SELECT pt.id, pt.gap, pt.action
            FROM plan_task pt
            JOIN strategy_plan sp ON sp.id = pt.plan_id
           WHERE sp.brand_id = ${site.brand_id}
             AND pt.status IN ('proposed', 'accepted')
           ORDER BY pt.priority DESC, pt.created_at ASC
           LIMIT 6
        `;
        auditGaps = gapRows.map((r) => `${r.gap} — ${r.action}`);
        consumedTaskIds = gapRows.map((r) => r.id);
      } catch (err) {
        logger.warn("landing_generate_gaps_load_failed", {
          site_id,
          message: (err as Error).message?.slice(0, 160),
        });
      }
    }

    // 6. Client's own BYOK key — never a platform key (content is client-key,
    //    same cost model as content-studio.ts). Absent → mock mode, not a failure.
    const clientKey = await resolveClientProviderKey(sql, tenant_id);

    // 7. Build the bundle (pure — packages/llm/src/landing-generate.ts).
    const bundle = await buildLandingBundle(
      {
        business,
        reviewThemes,
        testimonials,
        crawlSummary,
        auditGaps,
      },
      clientKey ? { mode: "llm", apiKey: clientKey.apiKey, provider: clientKey.provider } : { mode: "mock" }
    );

    // 8. Load existing pages + the tenant's page allowance (never exceed the cap).
    const existingRows = await sql<{ id: string; page_type: string; slug: string }[]>`
      SELECT id, page_type, slug FROM landing_pages WHERE site_id = ${site_id}
    `;
    const existingByKey = new Map(existingRows.map((r) => [`${r.page_type}:${r.slug}`, r.id]));
    let pageCount = existingRows.length;

    const tenantRows = await sql<{ plan_tier: string | null; extra_landing_sites: number | null }[]>`
      SELECT plan_tier, extra_landing_sites FROM tenants WHERE id = ${tenant_id}
    `;
    const planTier = (tenantRows[0]?.plan_tier ?? "free") as PlanTier;
    const allowance = computeLandingAllowance(planTier, tenantRows[0]?.extra_landing_sites ?? 0);

    // zdr_confirmed / routing context — from the linked brand's region if set;
    // EU default otherwise (safest, same convention as audit-run.ts).
    let region: "EU" | "US" = "EU";
    if (site.brand_id) {
      try {
        const brandRows = await sql<{ region: string }[]>`SELECT region FROM brands WHERE id = ${site.brand_id}`;
        if (brandRows[0]?.region === "US") region = "US";
      } catch {
        // keep EU default
      }
    }

    const logProvider = bundle.mode === "llm" && clientKey ? dbProvider(clientKey.provider) : "internal";
    const modelVersion =
      bundle.mode === "llm" && clientKey
        ? process.env[`${clientKey.provider.toUpperCase()}_MODEL`] ?? clientKey.provider
        : "mock-template-v1";

    let pagesWritten = 0;
    for (const page of bundle.pages) {
      const traits = scorePage(renderSectionsForScoring(page.sections));
      const contentScore = computeContentScoreFromTraits({
        statistics: traits.statistics ? 1 : 0,
        quotations: traits.quotations ? 1 : 0,
        sourcedClaims: traits.sourcedClaims ? 1 : 0,
        answerShaped: traits.answerShaped ? 1 : 0,
        depth: traits.depth ? 1 : 0,
      });
      // JSON.parse(JSON.stringify(...)) below: sql.json()'s JSONValue type requires
      // a plain-indexable shape; our strongly-typed section/seo/traits objects
      // don't structurally match it even though they ARE valid JSON — same
      // workaround audit-run.ts uses for provider_breakdown.
      const aiReadiness = { score: contentScore, traits, computed_at: new Date().toISOString() };

      const key = `${page.page_type}:${page.slug}`;
      const existingId = existingByKey.get(key);

      if (existingId) {
        // Snapshot the PREVIOUS content before overwriting (saved_by='generator'),
        // same versioning contract as the PATCH route in landing.ts.
        const currentRows = await sql<{ sections: unknown; seo: unknown }[]>`
          SELECT sections, seo FROM landing_pages WHERE id = ${existingId}
        `;
        const current = currentRows[0];
        if (current) {
          await sql`
            INSERT INTO landing_page_versions (id, tenant_id, page_id, version, sections, seo, saved_by, created_at)
            VALUES (${randomUUID()}, ${tenant_id}, ${existingId},
                    COALESCE((SELECT MAX(version) FROM landing_page_versions WHERE page_id = ${existingId}), 0) + 1,
                    ${sql.json(JSON.parse(JSON.stringify(current.sections ?? [])))},
                    ${sql.json(JSON.parse(JSON.stringify(current.seo ?? {})))}, 'generator', NOW())
          `;
          await sql`
            DELETE FROM landing_page_versions
             WHERE page_id = ${existingId}
               AND version <= (SELECT MAX(version) FROM landing_page_versions WHERE page_id = ${existingId}) - ${VERSION_CAP}
          `;
        }
        await sql`
          UPDATE landing_pages
             SET title = ${page.title},
                 sections = ${sql.json(JSON.parse(JSON.stringify(page.sections)))},
                 seo = ${sql.json(JSON.parse(JSON.stringify(page.seo)))},
                 ai_readiness = ${sql.json(JSON.parse(JSON.stringify(aiReadiness)))},
                 updated_at = NOW()
           WHERE id = ${existingId}
        `;
        pagesWritten += 1;
      } else {
        if (pageCount >= allowance.maxPagesPerSite) {
          // Never create beyond the plan's page cap — skip and log; the site
          // keeps whatever pages it already has.
          logger.warn("landing_generate_page_cap_reached", {
            site_id,
            page_type: page.page_type,
            slug: page.slug,
          });
          continue;
        }
        const newId = randomUUID();
        await sql`
          INSERT INTO landing_pages
            (id, tenant_id, site_id, page_type, slug, title, sections, seo, ai_readiness, created_at, updated_at)
          VALUES
            (${newId}, ${tenant_id}, ${site_id}, ${page.page_type}, ${page.slug}, ${page.title},
             ${sql.json(JSON.parse(JSON.stringify(page.sections)))},
             ${sql.json(JSON.parse(JSON.stringify(page.seo)))},
             ${sql.json(JSON.parse(JSON.stringify(aiReadiness)))}, NOW(), NOW())
        `;
        pageCount += 1;
        pagesWritten += 1;
      }

      // Append-only compliance log per page (GEO-A6 convention; feature_id
      // 'GEO-7', migration 20260710000003). Hashes only — no raw section text.
      await sql`
        INSERT INTO ai_generation_log
          (tenant_id, feature_id, input_hash, provider, model_version, output_hash, zdr_confirmed, latency_ms, timestamp)
        VALUES
          (${tenant_id}, 'GEO-7', ${sha256(`${site_id}|${page.page_type}|${page.slug}`)},
           ${logProvider}, ${modelVersion}, ${sha256(JSON.stringify(page.sections))},
           ${region === "EU"}, ${0}, NOW())
      `;
    }

    // 9. Link consumed plan_task rows to this site (status untouched — PR-7 closes the loop).
    for (const taskId of consumedTaskIds) {
      await sql`UPDATE plan_task SET landing_site_id = ${site_id} WHERE id = ${taskId}`;
    }

    logger.info("landing_generate_completed", {
      site_id,
      pages_written: pagesWritten,
      mode: bundle.mode,
    });

    return { site_id, pages_written: pagesWritten, mode: bundle.mode };
  });
}
