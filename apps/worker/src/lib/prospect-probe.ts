/**
 * prospect-probe.ts — the I/O half of the prospect-batch graph (5.A.1 + 2.10).
 *
 * The worker has NO prospect-database API, so the honest v1 split is:
 *  - the hermes engines (callWithFallback upstream — never a pinned engine)
 *    are a SUGGESTION machine: they LIST candidate US businesses for the ICP;
 *  - THIS module is the TRUTH GATE: every candidate's site is fetched for
 *    real — status 200, business name present in the HTML — and whatever
 *    fails verification is DROPPED and counted, never shown as a prospect;
 *  - the mini-GEO-probe (2.10) then reads robots.txt + homepage HTML and the
 *    PURE parsers in apps/api/src/lib/prospecting.ts turn them into 2-3
 *    code-verified findings per prospect — the discovery-audit ammunition.
 *  - contact emails come ONLY from the prospect's own pages (homepage, then
 *    /contact) — an engine-claimed email is never trusted, and a prospect
 *    without a code-extracted email gets no crm_contact row.
 *
 * Every dependency is injected (task fn, fetch fn, clock, env) so the unit
 * tests drive the whole verification pipeline with fake worlds.
 *
 * ICP v1 is static, derived from docs/departments/sales/icp.md (segmento B,
 * local services US). Extension points, documented in
 * docs/departments/sales/discovery-audit-playbook.md:
 *  - env PROSPECT_ICP: overrides the ICP text handed to the engines;
 *  - env PROSPECT_BATCH_CAP: verified-prospects cap per run (default 10).
 */

import {
  parseCandidateList,
  probeSite,
  extractContactEmails,
  nameMatchesHtml,
  renderDualProspectBlock,
  campaignSlug,
  DEFAULT_PROSPECT_ICP,
  DEFAULT_PROSPECT_ICP_AISTACK,
  DEFAULT_PROSPECT_BATCH_CAP,
  PROSPECT_TRACKS,
  type ProspectTrack,
  type TrackBatch,
  type VerifiedProspect,
  type DroppedCandidate,
} from "../../../api/src/lib/prospecting";

export interface FetchTextResult {
  status: number;
  text: string;
}

/** null = network error/timeout — treated as "site did not answer". */
export type FetchTextFn = (url: string, timeoutMs?: number) => Promise<FetchTextResult | null>;

/** Response body cap — a homepage bigger than this is truncated, not trusted. */
const FETCH_TEXT_CAP = 400_000;
const FETCH_TIMEOUT_MS = 8_000;
/** Hard wall-clock budget for the whole verification loop (one tick slot). */
const VERIFY_DEADLINE_MS = 5 * 60_000;
/** How many engine-listed candidates we are willing to probe per run. */
const MAX_CANDIDATES_TO_VERIFY = 16;

export const defaultFetchText: FetchTextFn = async (url, timeoutMs = FETCH_TIMEOUT_MS) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        // An honest, identifiable probe — never a fake browser.
        "user-agent": "Mozilla/5.0 (compatible; OzvorProspectProbe/1.0; +https://ozvor.com)",
        accept: "text/html,text/plain,*/*",
      },
    });
    const text = (await res.text()).slice(0, FETCH_TEXT_CAP);
    return { status: res.status, text };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
};

/**
 * The ICP handed to the engines, per track — env override wins, source always
 * named. Track 'geo' keeps the historic env PROSPECT_ICP; 'aistack' (0.6)
 * reads env PROSPECT_ICP_AISTACK, defaulting to the kit's ICP-2.
 */
export function prospectIcp(
  env: NodeJS.ProcessEnv = process.env,
  track: ProspectTrack = "geo"
): { text: string; source: string } {
  if (track === "aistack") {
    const override = env["PROSPECT_ICP_AISTACK"]?.trim();
    if (override) return { text: override, source: "env PROSPECT_ICP_AISTACK (override do founder)" };
    return {
      text: DEFAULT_PROSPECT_ICP_AISTACK,
      source:
        "docs/departments/sales/aistack-campaign-kit.md (ICP-2 da trilha AI STACK, 01/09; override: env PROSPECT_ICP_AISTACK)",
    };
  }
  const override = env["PROSPECT_ICP"]?.trim();
  if (override) return { text: override, source: "env PROSPECT_ICP (override do founder)" };
  return {
    text: DEFAULT_PROSPECT_ICP,
    source: "docs/departments/sales/icp.md (segmento B local-services US, v1 estatica; override: env PROSPECT_ICP)",
  };
}

export function prospectBatchCap(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env["PROSPECT_BATCH_CAP"];
  if (raw === undefined || raw.trim() === "") return DEFAULT_PROSPECT_BATCH_CAP;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : DEFAULT_PROSPECT_BATCH_CAP;
}

/**
 * 0.6 — the weekly cap SPLITS between the two tracks. Default: half/half of
 * the total (PROSPECT_BATCH_CAP, default 10 → 5+5; odd totals give geo the
 * extra slot). Per-track envs win: PROSPECT_BATCH_CAP_GEO /
 * PROSPECT_BATCH_CAP_AISTACK (0 = track OFF this week, honest and explicit).
 */
export function prospectTrackCaps(env: NodeJS.ProcessEnv = process.env): Record<ProspectTrack, number> {
  const total = prospectBatchCap(env);
  const readTrack = (key: string, fallback: number): number => {
    const raw = env[key];
    if (raw === undefined || raw.trim() === "") return fallback;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
  };
  return {
    geo: readTrack("PROSPECT_BATCH_CAP_GEO", Math.ceil(total / 2)),
    aistack: readTrack("PROSPECT_BATCH_CAP_AISTACK", Math.floor(total / 2)),
  };
}

/** The sourcing ask — candidates only; every claim is verified by code after. */
export function candidateSourcingPrompt(icpText: string): string {
  return [
    "You are a US small-business prospect researcher.",
    `List up to ${MAX_CANDIDATES_TO_VERIFY + 4} REAL, currently-operating US small businesses matching this ICP:`,
    icpText,
    "Only list businesses you are confident actually exist, each with its real public website.",
    "Every entry will be VERIFIED by code (HTTP fetch of the site, name check in the HTML) — invented or dead entries are dropped and waste the slot, so prefer well-established small businesses with live websites.",
    "Do NOT list Fortune-500 companies, franchises' national HQs, directories, or aggregator sites.",
    "Output format, one per line, nothing before or after:",
    "Business Name | https://website.com",
  ].join("\n");
}

export interface ProspectProbeDeps {
  /** The tick's hermes task fn (already callWithFallback-chained upstream). */
  task(prompt: string): Promise<{ ok: boolean; output: string; engineUsed: string | null; ms: number | null }>;
  fetchText?: FetchTextFn;
  now?(): Date;
  env?: NodeJS.ProcessEnv;
}

/**
 * Verify one track's candidate list — the SAME truth gate for both tracks
 * (0.6: "verification/probing identical"). Shared `seenHosts` dedups across
 * tracks (a business must not receive two sequences in one batch); shared
 * `deadline` keeps the whole dual run inside one tick slot.
 */
async function verifyCandidates(input: {
  candidates: Array<{ name: string; website: string }>;
  cap: number;
  fetchText: FetchTextFn;
  deadline: number;
  seenHosts: Set<string>;
}): Promise<{ verified: VerifiedProspect[]; dropped: DroppedCandidate[] }> {
  const { candidates, cap, fetchText, deadline, seenHosts } = input;
  const verified: VerifiedProspect[] = [];
  const dropped: DroppedCandidate[] = [];
  let attempted = 0;

  for (const candidate of candidates) {
    if (verified.length >= cap) break;
    if (attempted >= MAX_CANDIDATES_TO_VERIFY) break;
    if (Date.now() > deadline) {
      dropped.push({ name: candidate.name, website: candidate.website, reason: "tempo de verificacao esgotado (deadline do tick)" });
      continue;
    }
    let host = candidate.website;
    try {
      host = new URL(candidate.website).hostname.toLowerCase();
    } catch {
      /* parseCandidateList already normalized; keep as-is */
    }
    if (seenHosts.has(host)) {
      dropped.push({ name: candidate.name, website: candidate.website, reason: "mesmo site ja verificado na outra trilha deste lote" });
      continue;
    }
    attempted += 1;

    const home = await fetchText(candidate.website);
    if (!home || home.status !== 200 || !home.text.trim()) {
      dropped.push({
        name: candidate.name,
        website: candidate.website,
        reason: home ? `site respondeu ${home.status}` : "site nao respondeu (timeout/erro de rede)",
      });
      continue;
    }
    if (!nameMatchesHtml(candidate.name, home.text)) {
      dropped.push({ name: candidate.name, website: candidate.website, reason: "nome do negocio nao aparece no HTML do site" });
      continue;
    }

    let origin = candidate.website;
    try {
      origin = new URL(candidate.website).origin;
    } catch {
      /* keep as-is; the homepage already fetched fine */
    }
    const robots = await fetchText(`${origin}/robots.txt`);
    const robotsTxt = robots && robots.status === 200 ? robots.text : null;
    const { findings } = probeSite({ html: home.text, robotsTxt });
    if (findings.length === 0) {
      // No honest ammunition = no cold email. Better a smaller batch.
      dropped.push({ name: candidate.name, website: candidate.website, reason: "sem achado de GEO verificavel na homepage (sem municao honesta)" });
      continue;
    }

    let emails = extractContactEmails(home.text);
    if (emails.length === 0) {
      const contact = await fetchText(`${origin}/contact`);
      if (contact && contact.status === 200) emails = extractContactEmails(contact.text);
    }

    seenHosts.add(host);
    verified.push({
      name: candidate.name,
      website: candidate.website,
      email: emails[0] ?? null,
      findings,
    });
  }
  return { verified, dropped };
}

/**
 * Build the [prospects] artifact — now DUAL-TRACK (0.6): engines are asked
 * per track (geo ICP + aistack ICP-2), code verifies both lists with the
 * SAME gate, and the block separates the tracks with per-prospect TRILHA +
 * CAMPANHA lines. Every number comes from this function, never from a model.
 * Zero verified prospects across both tracks renders the honest EMPTY
 * sentinel first line — downstream degrades honestly.
 */
export async function buildProspectBatchBlock(deps: ProspectProbeDeps): Promise<string> {
  const fetchText = deps.fetchText ?? defaultFetchText;
  const now = deps.now ?? ((): Date => new Date());
  const env = deps.env ?? process.env;
  const caps = prospectTrackCaps(env);
  const deadline = Date.now() + VERIFY_DEADLINE_MS;
  const seenHosts = new Set<string>();
  const batches: TrackBatch[] = [];

  for (const track of PROSPECT_TRACKS) {
    const icp = prospectIcp(env, track);
    const campaign = campaignSlug(now(), track);
    const cap = caps[track];
    if (cap === 0) {
      batches.push({
        track,
        campaign,
        icpSource: icp.source,
        listed: 0,
        verified: [],
        dropped: [{ name: "(trilha)", website: "-", reason: `trilha desligada por env (cap 0)` }],
      });
      continue;
    }
    const sourced = await deps.task(candidateSourcingPrompt(icp.text));
    if (!sourced.ok || !sourced.output.trim()) {
      batches.push({
        track,
        campaign,
        icpSource: icp.source,
        listed: 0,
        verified: [],
        dropped: [{ name: "(sourcing)", website: "-", reason: `engines indisponiveis: ${sourced.output.slice(0, 120) || "sem saida"}` }],
      });
      continue;
    }
    const candidates = parseCandidateList(sourced.output, MAX_CANDIDATES_TO_VERIFY + 8);
    const { verified, dropped } = await verifyCandidates({ candidates, cap, fetchText, deadline, seenHosts });
    batches.push({ track, campaign, icpSource: icp.source, listed: candidates.length, verified, dropped });
  }

  return renderDualProspectBlock(batches);
}
