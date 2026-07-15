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
 *   6. Resolve the PLATFORM Anthropic key (founder decision, issue #217:
 *      Ozvor Pages generation is platform-funded, NOT customer BYOK — quality
 *      and marginal cost both favor Ozvor controlling the model/key/prompt).
 *      Same env-injection mechanism the audit engine relies on
 *      (packages/shared/src/platform-keys.ts refreshes process.env.
 *      ANTHROPIC_API_KEY at boot + on an interval). No key configured → mock
 *      mode in dev/test ONLY; in production a mock bundle is an HONEST JOB
 *      FAILURE (assertBundleModeHonest, #122). Customer BYOK (`provider_keys`) is
 *      intentionally NEVER read here — it stays reserved for Content Studio /
 *      customer-initiated content generation (routes/system.ts:
 *      resolveProviderKey), a different cost model.
 *   7. buildLandingBundle() — pure, packages/llm/src/landing-generate.ts.
 *   8. Write results: existing page (by page_type+slug, home always exists
 *      from PR-3) → snapshot to landing_page_versions (saved_by='generator',
 *      pruned to VERSION_CAP) then UPDATE; missing page → INSERT, but NEVER
 *      beyond the tenant's max_pages_per_site allowance.
 *   9. Score each page's ai_readiness with content-geo's shared trait scorer
 *      applied to the generated section text (renderSectionsForScoring).
 *  10. ai_generation_log row per page (GEO-A6 convention, feature_id 'GEO-7',
 *      migration 20260710000003 — hashes only, no raw section text).
 *  11. Close consumed plan_task rows (issue #208, PR-7 — the founder's
 *      "audit → rebuild" loop): landing_site_id is stamped on every card
 *      this run consumed; status/evidence/landing_page_id are closed via
 *      closeConsumedGapCards() for cards still 'proposed'/'accepted' — never
 *      a blanket close of every open card for the brand, only the exact set
 *      step 5 loaded (and fed into the bundle).
 *  12. Record estimated platform spend in `api_spend` (op='pages_generate',
 *      issue #217) for real LLM runs only — same visibility-only ledger +
 *      try/catch pattern as audit-run.ts's post-completion spend record.
 *      Mock-mode runs cost nothing and are not recorded.
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
  mockAllowed,
  type ContentProvider,
  type LandingBusinessInput,
  type LandingReviewInput,
  type LandingPhotoInput,
} from "../../../../packages/llm/src/index";
import { guardedFetch, assertPublicUrl } from "../../../../packages/llm/src/ssrf-guard";
import { logger } from "../../../../packages/shared/src/logger";
import { parseJsonbObject } from "../../../../packages/shared/src/jsonb";
import {
  resolvePlaceById,
  googlePlacesConfigured,
  landingPhotoProxyPath,
} from "../../../api/src/lib/google-places";
import { runWithTenant } from "../../../api/src/db/tenant-context";
import { computeLandingAllowance } from "../../../api/src/lib/landing-allowance";
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
// Platform key resolution (issue #217) — Ozvor Pages generation is
// PLATFORM-funded, never customer BYOK. process.env.ANTHROPIC_API_KEY is the
// founder's live platform key, kept current by
// packages/shared/src/platform-keys.ts's applyPlatformKeyOverrides (called
// at worker boot + on a refresh interval — see apps/worker/src/index.ts).
// This is the SAME mechanism the audit engine relies on for its own platform
// probe calls; landing-generate never queries `provider_keys` (customer
// BYOK), which stays reserved for Content Studio / customer-initiated
// content generation (apps/api/src/routes/system.ts:resolveProviderKey).
// No key configured → mock mode in dev/test only; in production that becomes
// an honest job failure at the assertBundleModeHonest gate below (#122).
// ---------------------------------------------------------------------------

export function resolvePlatformAnthropicKey(): { provider: ContentProvider; apiKey: string } | null {
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey || !apiKey.trim()) return null;
  return { provider: "anthropic", apiKey };
}

// resolvePlatformPagesKey — provider selection for Ozvor Pages generation.
// Ozvor Pages runs on OpenAI by default: gpt-4o-mini-class page copy is
// materially cheaper per generation than Claude Sonnet and the founder
// confirmed the output quality is equal-or-better for this structured,
// fact-grounded rewrite (short hero/answer copy, not long-form reasoning).
// So we PREFER the platform OPENAI_API_KEY and fall back to the platform
// ANTHROPIC_API_KEY only when OpenAI has no platform key configured. Both keys
// are the founder's platform keys, kept current in process.env by
// platform-keys.ts (same mechanism as the audit engine) — this never touches
// customer BYOK. OZVOR_PAGES_PROVIDER=anthropic|openai forces one provider
// (ops override / A-B); an unset or unknown value uses the OpenAI-first order.
export function resolvePlatformPagesKey(): { provider: ContentProvider; apiKey: string } | null {
  const openaiKey = process.env["OPENAI_API_KEY"];
  const anthropicKey = process.env["ANTHROPIC_API_KEY"];
  const openai =
    openaiKey && openaiKey.trim() ? { provider: "openai" as ContentProvider, apiKey: openaiKey } : null;
  const anthropic =
    anthropicKey && anthropicKey.trim()
      ? { provider: "anthropic" as ContentProvider, apiKey: anthropicKey }
      : null;

  const forced = process.env["OZVOR_PAGES_PROVIDER"]?.trim().toLowerCase();
  if (forced === "anthropic") return anthropic;
  if (forced === "openai") return openai;

  // Default: OpenAI first (cost + quality), Anthropic as fallback.
  return openai ?? anthropic;
}

/**
 * HARD INTEGRITY RULE for Ozvor Pages (task #122 — same rule the audit engine
 * enforces via `mockAllowed()`/PR #90): a paid $99 generation must NEVER
 * silently ship template content as if it were generated. `bundle.mode ===
 * "mock"` after buildLandingBundle means one of its three silent fallbacks
 * fired (no platform key — OPENAI_API_KEY/ANTHROPIC_API_KEY both absent — the
 * LLM call threw, or its output was unusable). In production — with no
 * explicit GEO_ALLOW_MOCK=true opt-in —
 * that is an honest job failure: nothing is written, the job surfaces as
 * failed, and the founder sees a config/provider incident instead of a
 * customer receiving a generic template. Mock stays available for local/dev/
 * test and seeded demos, exactly like the audit path. Exported for unit tests.
 */
export function assertBundleModeHonest(mode: "mock" | "llm", siteId: string): void {
  if (mode === "mock" && !mockAllowed()) {
    logger.error("landing_generate_mock_forbidden_in_production", { site_id: siteId });
    throw new Error(
      "landing_generate_mock_forbidden_in_production: no platform key (OPENAI_API_KEY/ANTHROPIC_API_KEY) or LLM generation failed — refusing to deliver template content for a paid generation"
    );
  }
}

// ---------------------------------------------------------------------------
// Audit → rebuild loop closure (issue #208, PR-7) — "a audit da semana disse
// que precisa de uma FAQ page; quando ele refaz o site, o creator já faz essa
// FAQ page" (founder requirement). PR-4 consumed the open plan_task gaps as
// generator input and stamped landing_site_id; this closes the loop by
// marking those exact cards done, with evidence, linked to the page that
// materialized them. Only the cards THIS run consumed are ever touched here
// — never a blanket close of every open card for the brand.
// ---------------------------------------------------------------------------

export interface ConsumedGapCard {
  id: string;
  gap: string;
  action: string;
}

interface ClosurePageRef {
  id: string;
  title: string;
}

/** Pure — same FAQ/question heuristic strategy-generator.ts's toCalendarTopic
 * already uses to route a recommendation's text to a content shape. */
export function isFaqGap(gap: string, action: string): boolean {
  return /FAQ|question/i.test(`${gap} ${action}`);
}

/** Pure — the one-line evidence note appended when a card closes. */
export function buildClosureEvidenceLine(pageLabel: string, now: Date = new Date()): string {
  return `Applied by Ozvor Pages generation on ${now.toISOString()}: ${pageLabel}`;
}

/**
 * Closes the plan_task rows this run consumed as generator input: for every
 * card still 'proposed'/'accepted' at write time, stamps status='done',
 * appends ONE evidence line, and links landing_page_id to whichever page
 * materialized the gap — FAQ-shaped gaps (isFaqGap) → the faq page,
 * everything else → the home page — when that page is determinable from
 * this run's output (COALESCE leaves landing_page_id untouched otherwise).
 *
 * landing_site_id is stamped on every consumed card regardless of its
 * current status (a separate, unconditional UPDATE) — unchanged PR-4
 * contract: a card that fed this run keeps its site link even if a
 * concurrent action rejected/completed it out of band.
 *
 * The status/evidence/landing_page_id transition uses a SECOND UPDATE
 * guarded by `WHERE status IN ('proposed', 'accepted')` — a card that is not
 * in that set matches zero rows and comes back completely untouched
 * (rejected/done cards never flip, never gain a second evidence line). That
 * same WHERE guard is what makes the RETURNING row count an accurate
 * "did this call actually close it?" signal (unlike an unconditional
 * `RETURNING status`, which would report the row's status whether or not
 * this call changed it). Idempotency for repeated generation runs falls out
 * of this for free too: once a card is 'done' it no longer matches the
 * open-gap SELECT in step 5, so it is never passed in here again.
 *
 * Returns the number of cards actually closed this call (RETURNING-verified,
 * not just the input count) — used for the summary log only.
 */
export async function closeConsumedGapCards(
  sql: postgres.Sql,
  siteId: string,
  cards: ConsumedGapCard[],
  pageIdByType: Map<string, ClosurePageRef>,
  now: Date = new Date()
): Promise<number> {
  let closed = 0;
  for (const card of cards) {
    await sql`UPDATE plan_task SET landing_site_id = ${siteId} WHERE id = ${card.id}`;

    const faq = isFaqGap(card.gap, card.action);
    const target = faq ? pageIdByType.get("faq") : pageIdByType.get("home");
    const pageLabel = target?.title || (faq ? "FAQ page" : "Home page");
    const evidenceLine = buildClosureEvidenceLine(pageLabel, now);
    const rows = await sql<{ id: string }[]>`
      UPDATE plan_task
         SET landing_page_id = COALESCE(${target?.id ?? null}, landing_page_id),
             evidence = CASE WHEN evidence IS NULL OR evidence = '' THEN ${evidenceLine}
                         ELSE evidence || E'\n' || ${evidenceLine} END,
             status = 'done'
       WHERE id = ${card.id}
         AND status IN ('proposed', 'accepted')
       RETURNING id
    `;
    if (rows.length > 0) closed += 1;
  }
  return closed;
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
      {
        id: string;
        brand_id: string | null;
        status: string;
        business: unknown;
        place_id: string | null;
        theme: unknown;
      }[]
    >`SELECT id, brand_id, status, business, place_id, theme FROM landing_sites WHERE id = ${site_id}`;
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

    // Legacy rows may hold `business` DOUBLE-JSON-encoded — a jsonb *string
    // scalar* like `"{\"name\":\"Ozvor\"...}"` rather than a jsonb object —
    // from the pre-fix write path (postgres.js re-encoded a pre-stringified
    // param). postgres.js hands those back as a JS string, so `.name` reads
    // undefined and generation would wrongly skip. Parse a string form
    // (twice-defensively) so any historical site still generates; the data
    // migration heals the rows at rest, this heals them in flight.
    const rawBusiness = parseJsonbObject(site.business);
    const business = toLandingBusiness((rawBusiness ?? {}) as LandingGenerateBusinessRaw);
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
    //    gapCards keeps the full row (id/gap/action) so step 9 below can
    //    decide FAQ-vs-home routing and close each card with evidence.
    let auditGaps: string[] = [];
    let gapCards: ConsumedGapCard[] = [];
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
        gapCards = gapRows;
      } catch (err) {
        logger.warn("landing_generate_gaps_load_failed", {
          site_id,
          message: (err as Error).message?.slice(0, 160),
        });
      }
    }

    // 6. Platform key (issue #217) — never customer BYOK for Ozvor Pages
    //    generation. OpenAI-first for cost + quality, Anthropic fallback (see
    //    resolvePlatformPagesKey). Absent → mock mode in dev/test; in
    //    production the integrity gate after buildLandingBundle fails the job
    //    honestly (#122).
    const platformKey = resolvePlatformPagesKey();

    // 6b. Rich Google Maps enrichment (reviews, photos, rating, category) —
    //     fetched FRESH here, once per generation, so reviews respect the ToS
    //     freshness rule. Wrapped so ANY failure just generates without the
    //     rich extras (never fails, never fabricates). Photos become proxy URLs
    //     (bytes streamed at serve time; the API key never reaches the browser).
    let googleReviews: LandingReviewInput[] | undefined;
    let photos: LandingPhotoInput[] | undefined;
    if (site.place_id && googlePlacesConfigured()) {
      try {
        const place = await resolvePlaceById(site.place_id, { rich: true });
        if (typeof place.rating === "number") business.rating = place.rating;
        if (typeof place.reviewCount === "number") business.reviewCount = place.reviewCount;
        if (place.priceLevel) business.priceLevel = place.priceLevel;
        if (!business.category && place.category) business.category = place.category;
        if (!business.description && place.description) business.description = place.description;
        if (place.lat != null && place.lng != null) {
          business.lat = place.lat;
          business.lng = place.lng;
        }
        googleReviews = place.reviews.map((r) => ({
          author: r.author,
          body: r.text,
          rating: r.rating ?? undefined,
          relativeTime: r.relativeTime ?? undefined,
        }));
        photos = place.photos.map((p) => ({
          src: landingPhotoProxyPath(p.name),
          alt: `${business.name}${place.category ? ` — ${place.category}` : ""}`,
          attribution: p.attribution ?? undefined,
        }));
        logger.info("landing_generate_places_enriched", {
          site_id,
          reviews: googleReviews.length,
          photos: photos.length,
          has_rating: typeof place.rating === "number",
        });
      } catch (err) {
        logger.warn("landing_generate_places_enrich_failed", {
          site_id,
          message: (err as Error).message?.slice(0, 160),
        });
      }
    }

    // Brand colour: the owner's saved theme.primary drives the light+brand
    // palette; absent → the generator falls back to the pastel default.
    const siteTheme = parseJsonbObject(site.theme);
    const brandColor =
      typeof siteTheme["primary"] === "string" ? (siteTheme["primary"] as string) : undefined;

    // 7. Build the bundle (pure — packages/llm/src/landing-generate.ts).
    const bundle = await buildLandingBundle(
      {
        business,
        reviewThemes,
        testimonials,
        googleReviews,
        photos,
        brandColor,
        crawlSummary,
        auditGaps,
      },
      platformKey
        ? { mode: "llm", apiKey: platformKey.apiKey, provider: platformKey.provider }
        : { mode: "mock" }
    );

    // 7a. Integrity gate (#122) — BEFORE anything is persisted. In production
    //     a mock bundle is an honest failure, never a silent template delivery.
    assertBundleModeHonest(bundle.mode, site_id);

    // 7b. Persist the derived theme (light base + brand/pastel) so the public
    //     renderer themes the site. Merge over any existing theme fields to keep
    //     owner customizations, then stamp base/primary/isDefault.
    await sql`UPDATE landing_sites SET theme = ${sql.json({ ...siteTheme, ...bundle.theme })}, updated_at = NOW() WHERE id = ${site_id}`;

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

    const logProvider = bundle.mode === "llm" && platformKey ? dbProvider(platformKey.provider) : "internal";
    const modelVersion =
      bundle.mode === "llm" && platformKey
        ? process.env[`${platformKey.provider.toUpperCase()}_MODEL`] ?? platformKey.provider
        : "mock-template-v1";

    let pagesWritten = 0;
    // page_type -> the page that now carries it, for step 9's FAQ-vs-home
    // gap-closure routing below (isFaqGap → 'faq' page, else 'home').
    const pageIdByType = new Map<string, ClosurePageRef>();
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

      // GEO/SEO structured data travels inside `seo.json_ld` so the public
      // renderer can emit <script type="application/ld+json"> without a schema
      // change. Only present when the generator built real schema (LocalBusiness
      // / FAQPage) from real facts.
      const seoOut = page.jsonLd ? { ...page.seo, json_ld: page.jsonLd } : page.seo;

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
                 seo = ${sql.json(JSON.parse(JSON.stringify(seoOut)))},
                 ai_readiness = ${sql.json(JSON.parse(JSON.stringify(aiReadiness)))},
                 updated_at = NOW()
           WHERE id = ${existingId}
        `;
        pageIdByType.set(page.page_type, { id: existingId, title: page.title });
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
             ${sql.json(JSON.parse(JSON.stringify(seoOut)))},
             ${sql.json(JSON.parse(JSON.stringify(aiReadiness)))}, NOW(), NOW())
        `;
        pageIdByType.set(page.page_type, { id: newId, title: page.title });
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

    // 9. Close consumed plan_task rows (issue #208, PR-7 — the founder's
    //    "audit → rebuild" requirement): every card this run fed into the
    //    bundle gets landing_site_id stamped, and — when still open —
    //    status='done' + one evidence line + landing_page_id. Never a
    //    blanket close of every open card for the brand: only gapCards, the
    //    exact set loaded (and consumed) in step 5.
    if (gapCards.length > 0 && pagesWritten > 0) {
      const closedCount = await closeConsumedGapCards(sql, site_id, gapCards, pageIdByType);
      logger.info("landing_cards_closed", { count: closedCount, site_id });
    }

    // 10. Record estimated platform spend (issue #217) — visibility only, same
    // ledger + try/catch pattern as audit-run.ts's post-completion spend
    // record. Only real LLM runs cost anything against the platform key;
    // mock-mode runs are free and are not recorded.
    if (bundle.mode === "llm") {
      try {
        const landingGenerateCostCents = Number(process.env["LANDING_GENERATE_COST_CENTS"] ?? 15);
        await sql`INSERT INTO api_spend (op, est_cost_cents) VALUES ('pages_generate', ${landingGenerateCostCents})`;
      } catch (err) {
        logger.warn("landing_generate_spend_record_failed", { message: (err as Error).message });
      }
    }

    // 11. Stamp the site's first successful generation (#121). COALESCE keeps
    //     the FIRST timestamp forever; no API route ever writes this column,
    //     so the free-initial-generation signal cannot be reset by emptying
    //     sections or deleting pages.
    if (pagesWritten > 0) {
      await sql`UPDATE landing_sites
                   SET generated_at = COALESCE(generated_at, NOW())
                 WHERE id = ${site_id}`;
    }

    logger.info("landing_generate_completed", {
      site_id,
      pages_written: pagesWritten,
      mode: bundle.mode,
    });

    return { site_id, pages_written: pagesWritten, mode: bundle.mode };
  });
}
