/**
 * proof-feed.ts — the I/O half of the daily proof feed (canal C, 2026-09-11).
 *
 * WHAT IT DOES, once per day, before the LinkedIn cell drafts anything:
 *
 *   1. Is there already a row for today in ops.proof_run? Then return it. The
 *      cost cap is a UNIQUE index, not a flag: a second tick, a retry or a
 *      manual re-run reads the existing row instead of buying a second probe.
 *   2. Pick ONE target from our own untouched outbound pool (crm_contact,
 *      stage 'new', from a prospect-batch note, never used as a proof target).
 *      The order is deterministic per day, so the same day always picks the
 *      same business and "why this one?" has an answer.
 *   3. Read that business's PUBLIC homepage to learn its city and its trade.
 *      Code only — JSON-LD first, page title second, give up third. A wrong
 *      city makes the whole post a lie, so a guess is not an option.
 *   4. Ask the engines ONE local buyer question. The target's NAME IS NEVER
 *      SENT to a provider (the free test's GEO-A2 rule): we ask the market
 *      question a real person would ask, then scan the answers for the name
 *      ourselves. That is what makes "they were not in it" mean something.
 *   5. Write the row, record the spend, return the anonymized block.
 *
 * FAIL-OPEN, EVERYWHERE. Missing migration, empty pool, unreadable homepage,
 * dead engines, too few live engines — every one of them returns null, and the
 * LinkedIn cell drafts exactly as it does today. The alternative (a post with
 * "[number]" in it) is the worst outcome available, so it is not reachable.
 *
 * COST. One prompt across five engines, once a day, capped twice: the per-day
 * UNIQUE row and PROOF_MONTHLY_CENTS_CAP (~US$1.20/month) checked against the
 * api_spend ledger before anything is bought. Ledger rows carry op='li_proof'.
 */

import type postgres from "postgres";
import { runProbes } from "../../../../packages/llm/src/providers/gateway";
import { parseCitation } from "../../../../packages/llm/src/citation-parser";
import { guardedFetch } from "../../../../packages/llm/src/ssrf-guard";
import { recordSpend, execForPostgresJs } from "../../../../packages/llm/src/api-spend";
import { measuredCostCents } from "../../../../packages/llm/src/cost";
import { logger } from "../../../../packages/shared/src/logger";
import {
  PROOF_ENGINES,
  PROOF_MONTHLY_CENTS_CAP,
  PROOF_PAIR_REPEAT_DAYS,
  buildProofPrompt,
  deriveLocality,
  deriveSegment,
  orderCandidatesForDay,
  pairIsFresh,
  proofIsPublishable,
  renderProofBlock,
  summarizeProofEngines,
  type ProofCandidate,
  type ProofFacts,
  type ProofProbeInput,
} from "../../../../packages/shared/src/proof-feed";
import type { LLMProvider } from "../../../../packages/llm/src/providers/types";

/** How many candidates we are willing to inspect before giving up for the day. */
const MAX_CANDIDATES_INSPECTED = 12;
/** Homepage read budget — this is a city lookup, not a crawl. */
const HOMEPAGE_TIMEOUT_MS = 8_000;
const HOMEPAGE_MAX_CHARS = 120_000;

/** Today in UTC, as the DATE column stores it. */
export function proofDateFor(now: Date): string {
  return now.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Reading the pool.
//
// The prospect-batch note is the only place a candidate's public facts live
// (crmNoteFor writes "[prospect-batch] trilha=geo campanha=... rating=4.9
// reviews=300 — <achado> — <site>"). Parsing it here rather than adding
// columns keeps this feature additive: it reads what the sales pipeline
// already wrote, and an older note simply yields fewer facts.
// ---------------------------------------------------------------------------

/** Pull the public bits out of a prospect-batch CRM note. Missing = null. */
export function parseProspectNote(note: string | null): {
  website: string | null;
  name: string | null;
  rating: number | null;
  reviews: number | null;
} {
  if (!note) return { website: null, name: null, rating: null, reviews: null };
  // The note's LAST " — " segment is the website (crmNoteFor's shape).
  const segments = note.split(" — ");
  const tail = segments[segments.length - 1]?.trim() ?? "";
  const website = /^https?:\/\/\S+$/.test(tail) ? tail : null;
  const rating = Number(/\brating=([\d.]+)/.exec(note)?.[1] ?? NaN);
  const reviews = Number(/\breviews=(\d+)/.exec(note)?.[1] ?? NaN);
  const name = /\bnome=([^\n·]{2,80}?)(?:\s+(?:fone|rating|reviews)=|\s+—|$)/.exec(note)?.[1]?.trim() ?? null;
  return {
    website,
    name: name || null,
    rating: Number.isFinite(rating) ? rating : null,
    reviews: Number.isFinite(reviews) ? reviews : null,
  };
}

/**
 * Candidates = untouched leads from the GEO track that have never been a proof
 * target. `stage = 'new'` is the "ainda não foi tocado" the founder specified:
 * the moment he moves someone to 'contacted', they stop being fair game for a
 * public post about their invisibility.
 */
async function readCandidates(sql: postgres.Sql): Promise<ProofCandidate[]> {
  const rows = await sql<{ email: string; note: string | null }[]>`
    /* li-proof:pool */
    SELECT c.email, c.note
      FROM crm_contact c
     WHERE c.stage = 'new'
       AND c.note LIKE '[prospect-batch]%'
       AND c.note LIKE '%trilha=geo%'
       AND NOT EXISTS (
         SELECT 1 FROM ops.proof_run p WHERE lower(p.target_email) = lower(c.email)
       )
     ORDER BY c.updated_at DESC
     LIMIT 500`;
  const out: ProofCandidate[] = [];
  for (const r of rows) {
    const parsed = parseProspectNote(r.note);
    if (!parsed.website) continue; // no site, no measurement
    out.push({
      email: r.email,
      website: parsed.website,
      name: parsed.name,
      category: null,
      rating: parsed.rating,
      reviews: parsed.reviews,
    });
  }
  return out;
}

/** The (segment, city) pairs used in the last week — the anti-repetition read. */
async function readRecentPairs(sql: postgres.Sql): Promise<Array<{ segment: string; city: string }>> {
  return sql<{ segment: string; city: string }[]>`
    /* li-proof:recent-pairs */
    SELECT segment, city
      FROM ops.proof_run
     WHERE proof_date >= (CURRENT_DATE - make_interval(days => ${PROOF_PAIR_REPEAT_DAYS}))`;
}

/** Fetch a target's public homepage. SSRF-guarded; failure is just "no data". */
async function readHomepage(website: string): Promise<string | null> {
  try {
    const res = await guardedFetch(website, {
      timeoutMs: HOMEPAGE_TIMEOUT_MS,
      headers: { "User-Agent": "OzvorBot/1.0 (+https://ozvor.com)", Accept: "text/html,*/*" },
    });
    if (!res.ok) return null;
    return (await res.text()).slice(0, HOMEPAGE_MAX_CHARS);
  } catch {
    return null;
  }
}

/** Business name for the citation scan: the note's, else the registrable label. */
export function targetBrandName(candidate: ProofCandidate, html: string | null): string | null {
  if (candidate.name && candidate.name.length >= 3) return candidate.name;
  const title = html ? /<title[^>]*>([\s\S]{0,200}?)<\/title>/i.exec(html)?.[1]?.trim() : null;
  if (title) {
    // "Acme Roofing | Austin TX Roofers" → "Acme Roofing".
    const head = title.split(/\s*[|–—-]\s*/)[0]?.trim() ?? "";
    if (head.length >= 3 && head.length <= 60) return head;
  }
  try {
    const host = new URL(candidate.website).hostname.replace(/^www\./, "");
    const label = host.split(".")[0] ?? "";
    return label.length >= 4 ? label : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Cost guard.
// ---------------------------------------------------------------------------

/** Proof spend already booked this calendar month, in cents. */
async function monthSpentCents(sql: postgres.Sql): Promise<number> {
  try {
    const rows = await sql<{ c: string }[]>`
      /* li-proof:budget */
      SELECT COALESCE(SUM(est_cost_cents), 0)::text AS c
        FROM api_spend
       WHERE op = 'li_proof'
         AND created_at >= date_trunc('month', NOW())`;
    return Number(rows[0]?.c ?? 0) || 0;
  } catch {
    // No ledger table is not a licence to spend blind, but it is also not a
    // reason to break the feed: the per-day UNIQUE row still caps this at one
    // probe set, which is the binding constraint anyway.
    return 0;
  }
}

// ---------------------------------------------------------------------------
// The job.
// ---------------------------------------------------------------------------

export interface DailyProofResult {
  block: string;
  facts: ProofFacts;
}

/** Rebuild the artifact from a row already in the table (today's re-read). */
function factsFromRow(row: {
  proof_date: string | Date;
  segment: string;
  city: string;
  prompt: string;
  engines: unknown;
  engines_total: number;
  engines_live: number;
  cited_engines: number;
  target_cited: boolean;
  target_rating: string | number | null;
  target_reviews: number | null;
  cited_names: string[] | null;
}): ProofFacts {
  const date = typeof row.proof_date === "string" ? row.proof_date.slice(0, 10) : row.proof_date.toISOString().slice(0, 10);
  return {
    date,
    segment: row.segment,
    city: row.city,
    prompt: row.prompt,
    engines: Array.isArray(row.engines) ? (row.engines as ProofFacts["engines"]) : [],
    enginesTotal: row.engines_total,
    enginesLive: row.engines_live,
    citedEngines: row.cited_engines,
    targetCited: row.target_cited,
    targetRating: row.target_rating == null ? null : Number(row.target_rating),
    targetReviews: row.target_reviews,
    citedNames: row.cited_names,
  };
}

/**
 * Produce (or re-read) today's proof.
 *
 * Returns null for every honest "not today" — and says which one in the log,
 * because "no proof today" with no reason is how a silent degradation starts.
 */
export async function buildDailyProof(
  sql: postgres.Sql,
  now: Date = new Date()
): Promise<DailyProofResult | null> {
  const date = proofDateFor(now);

  // (1) Already measured today? Re-read, never re-buy.
  try {
    const existing = await sql<Parameters<typeof factsFromRow>[0][]>`
      /* li-proof:today */
      SELECT proof_date, segment, city, prompt, engines, engines_total, engines_live,
             cited_engines, target_cited, target_rating, target_reviews, cited_names
        FROM ops.proof_run
       WHERE proof_date = ${date}::date
       LIMIT 1`;
    if (existing.length > 0) {
      const facts = factsFromRow(existing[0]!);
      if (!proofIsPublishable(facts)) {
        logger.warn("li_proof_today_not_publishable", { date, enginesLive: facts.enginesLive });
        return null;
      }
      return { block: renderProofBlock(facts), facts };
    }
  } catch (err) {
    const code = (err as { code?: string }).code ?? "";
    if (code === "42P01") {
      logger.warn("li_proof_table_missing", {
        action: "aplicar a migracao 20260911000001_ops_proof_run em producao (PR separado, sem label)",
      });
    } else {
      logger.warn("li_proof_today_read_failed", { code, message: (err as Error).message?.slice(0, 160) });
    }
    return null; // fail-open: the cell drafts as it does today
  }

  // (2) Budget, before anything is bought.
  const spent = await monthSpentCents(sql);
  if (spent >= PROOF_MONTHLY_CENTS_CAP) {
    logger.warn("li_proof_budget_reached", { spentCents: spent, capCents: PROOF_MONTHLY_CENTS_CAP });
    return null;
  }

  // (3) The pool, ordered deterministically for today.
  let candidates: ProofCandidate[];
  try {
    candidates = orderCandidatesForDay(await readCandidates(sql), date);
  } catch (err) {
    logger.warn("li_proof_pool_read_failed", { message: (err as Error).message?.slice(0, 160) });
    return null;
  }
  if (candidates.length === 0) {
    logger.warn("li_proof_pool_empty", {
      action: "rodar prospect-batch (quarta 07:30 UTC) ou carregar leads geo em crm_contact stage='new'",
    });
    return null;
  }

  const recentPairs = await readRecentPairs(sql).catch(() => [] as Array<{ segment: string; city: string }>);

  // (4) Walk the ordered pool until one target yields a city AND a trade AND a
  // (segment, city) pair we have not already posted about this week.
  let chosen: {
    candidate: ProofCandidate;
    city: string;
    segment: ReturnType<typeof deriveSegment>;
    brand: string;
  } | null = null;
  let inspected = 0;
  for (const c of candidates) {
    if (inspected >= MAX_CANDIDATES_INSPECTED) break;
    inspected += 1;
    const html = await readHomepage(c.website);
    if (!html) continue;
    const city = deriveLocality(html);
    if (!city) continue;
    const segment = deriveSegment({ category: c.category, html });
    if (!segment) continue;
    if (!pairIsFresh({ segment: segment.id, city }, recentPairs)) continue;
    const brand = targetBrandName(c, html);
    if (!brand) continue;
    chosen = { candidate: c, city, segment, brand };
    break;
  }
  if (!chosen || !chosen.segment) {
    logger.warn("li_proof_no_usable_target", { inspected, poolSize: candidates.length });
    return null;
  }

  // (5) Ask the market question. The target's name never leaves this process.
  const prompt = buildProofPrompt(chosen.segment, chosen.city);
  let probes: ProofProbeInput[];
  let costCents = 0;
  try {
    const result = await runProbes(
      [{ queryHash: `li-proof:${date}`, queryText: prompt, brandName: chosen.brand }],
      { region: "US", requestedProviders: [...PROOF_ENGINES] as LLMProvider[], repeat: 1 }
    );
    probes = result.responses.map((r) => {
      const parsed = parseCitation(r.rawText ?? "", chosen!.brand);
      return {
        engine: r.provider,
        // An engine with no key answers from the deterministic mock. Counting
        // those would manufacture a "not cited" out of nothing — the same class
        // of bug as the always-89 audit score — so summarizeProofEngines drops
        // them from every headline number.
        live: providerHasKey(r.provider),
        rawText: r.rawText ?? "",
        cited: parsed.mentioned,
        position: parsed.position,
      };
    });
    // Measured cost when the provider reported usage; silent 0 otherwise, and
    // the monthly cap is the backstop for what we cannot measure.
    for (const r of result.responses) {
      const u = r.usage;
      if (!u) continue;
      costCents +=
        measuredCostCents({
          model: u.model ?? null,
          inputTokens: u.inputTokens ?? null,
          outputTokens: u.outputTokens ?? null,
          provider: r.provider,
          searchRequests: u.searchRequests ?? null,
          requests: 1,
        }) ?? 0;
    }
  } catch (err) {
    logger.warn("li_proof_probe_failed", { message: (err as Error).message?.slice(0, 160) });
    return null;
  }

  const summary = summarizeProofEngines(probes);
  const facts: ProofFacts = {
    date,
    segment: chosen.segment.id,
    city: chosen.city,
    prompt,
    targetRating: chosen.candidate.rating,
    targetReviews: chosen.candidate.reviews,
    ...summary,
  };

  // (6) Persist BEFORE publishing anything downstream. A measurement nobody can
  // re-read is not evidence, and the insert is also what makes the day's cost
  // cap real. ON CONFLICT DO NOTHING: a racing tick loses politely.
  try {
    await sql`
      /* li-proof:store */
      INSERT INTO ops.proof_run (
        proof_date, segment, city, prompt, target_rating, target_reviews,
        engines_total, engines_live, cited_engines, target_cited, engines, cited_names,
        target_domain, target_name, target_email, cost_cents
      ) VALUES (
        ${date}::date, ${facts.segment}, ${facts.city}, ${facts.prompt},
        ${facts.targetRating}, ${facts.targetReviews},
        ${facts.enginesTotal}, ${facts.enginesLive}, ${facts.citedEngines}, ${facts.targetCited},
        ${sql.json(JSON.parse(JSON.stringify(facts.engines)))}, ${facts.citedNames},
        ${chosen.candidate.website}, ${chosen.brand}, ${chosen.candidate.email}, ${costCents}
      )
      ON CONFLICT (proof_date) DO NOTHING`;
  } catch (err) {
    logger.error("li_proof_store_failed", { message: (err as Error).message?.slice(0, 160) });
    return null; // measured but unrecorded: not usable as proof
  }

  // (7) The ledger. op='li_proof' so the monthly cap above can see itself.
  try {
    await recordSpend(execForPostgresJs(sql), {
      op: "li_proof",
      estCents: costCents,
      estSource: "rate",
      ref: `li-proof-${date}`,
      requests: probes.length,
    });
  } catch (err) {
    logger.warn("li_proof_ledger_failed", { message: (err as Error).message?.slice(0, 160) });
  }

  if (!proofIsPublishable(facts)) {
    logger.warn("li_proof_too_few_live_engines", { date, enginesLive: facts.enginesLive });
    return null; // stored for the record, not strong enough to open a post
  }

  logger.info("li_proof_ready", {
    date,
    segment: facts.segment,
    enginesLive: facts.enginesLive,
    citedEngines: facts.citedEngines,
    costCents,
  });
  return { block: renderProofBlock(facts), facts };
}

/** Does this provider have a real key? Mirrors the free test's per-provider check. */
function providerHasKey(provider: string): boolean {
  switch (provider) {
    case "anthropic": return !!process.env["ANTHROPIC_API_KEY"];
    case "openai": return !!process.env["OPENAI_API_KEY"];
    case "gemini": return !!process.env["GEMINI_API_KEY"];
    case "perplexity": return !!process.env["PERPLEXITY_API_KEY"];
    case "serp": return !!process.env["SERP_API_KEY"];
    default: return false;
  }
}
