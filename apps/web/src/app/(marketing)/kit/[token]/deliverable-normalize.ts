export interface Fix {
  vector: string;
  gap: string;
  action: string;
  effort: string;
  impact: string;
  priority: number;
}

export interface Draft {
  contentType: string;
  title: string;
  body: string;
  schemaMarkup: string | null;
  generatedBy: string;
}

export interface FromTest {
  status: string;
  brandEngineCount: number;
  competitorEngineCount: number;
  totalEngines: number;
  verdict: string;
}

export interface Deliverable {
  brand: string;
  generatedAt?: string;
  live: boolean;
  fromTest?: FromTest | null;
  score: { brand: number; performance: number; ai: number; overall: number };
  topFixes: Fix[];
  drafts: Draft[];
  publishChecklist: string[];
  meta: { probesTotal: number; probesCited: number; enginesUsed: string[] };
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isScore(value: unknown): value is Deliverable["score"] {
  if (!value || typeof value !== "object") return false;
  const score = value as Partial<Deliverable["score"]>;
  return (
    isNumber(score.brand) &&
    isNumber(score.performance) &&
    isNumber(score.ai) &&
    isNumber(score.overall)
  );
}

function isMeta(value: unknown): value is Deliverable["meta"] {
  if (!value || typeof value !== "object") return false;
  const meta = value as Partial<Deliverable["meta"]>;
  return (
    isNumber(meta.probesTotal) &&
    isNumber(meta.probesCited) &&
    Array.isArray(meta.enginesUsed)
  );
}

/**
 * Accept a deliverable that is either a proper object OR a legacy JSON string.
 * Some early rows were stored double-encoded in the jsonb column. Parse strings
 * and validate the render-critical shape, so malformed payloads show the
 * graceful error card instead of throwing in <KitView>.
 */
export function normalizeDeliverable(raw: unknown): Deliverable | null {
  let d: unknown = raw;
  if (typeof d === "string") {
    try {
      d = JSON.parse(d);
    } catch {
      return null;
    }
  }

  if (!d || typeof d !== "object") return null;
  const candidate = d as Partial<Deliverable>;

  if (
    typeof candidate.brand !== "string" ||
    typeof candidate.live !== "boolean" ||
    !isScore(candidate.score) ||
    !Array.isArray(candidate.topFixes) ||
    !Array.isArray(candidate.drafts) ||
    !Array.isArray(candidate.publishChecklist) ||
    !isMeta(candidate.meta)
  ) {
    return null;
  }

  return candidate as Deliverable;
}
