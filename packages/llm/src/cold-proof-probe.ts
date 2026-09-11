/**
 * cold-proof-probe.ts — LEVA 2 (11/09): o GANCHO COM PROVA do cold outbound.
 *
 * Antes do e-mail 1, cada lead recebe um mini free test: a MESMA máquina do
 * /test (runProbes → motores reais, repeat=1), com UMA pergunta feita para o
 * nicho e a cidade dele — "who do you recommend for <serviço> in <cidade>?".
 * O e-mail 1 abre com o resultado REAL: quem a IA recomendou no lugar dele.
 *
 * Regras da casa aplicadas aqui:
 *  - SEM RESULTADO = SEM LEVA. Se os motores não responderem, se o negócio
 *    JÁ for citado, ou se a resposta não nomear pelo menos 2 concorrentes,
 *    o lead NÃO entra — nunca um placeholder, nunca um nome inventado.
 *  - A extração de nomes é CÓDIGO (parser determinístico), não um segundo
 *    LLM opinando sobre a resposta do primeiro.
 *  - Custo explícito: COLD_PROOF_COST_PER_LEAD_USD é o orçamento por lead, e
 *    o chamador soma o do lote antes de gastar (ver prospect-probe.ts).
 *
 * Este módulo é o único lugar que fabrica as variáveis de merge do SmartLead
 * ({{ai_engine}}, {{competitor_1}}, {{competitor_2}}, {{query}}).
 */

import { runProbes } from "./providers/gateway";
import { parseCitation } from "./citation-parser";
import { createHash } from "node:crypto";
import type { LLMProvider, UserRegion } from "./providers/types";

/**
 * Custo medido do free test (4-5 motores, repeat=1): ≈ US$0,03 por execução
 * (docs/departments/sales + project_ozvor_cost_model: audit $0.80, test $0.03).
 * O probe frio roda UMA pergunta, portanto ≤ o custo do teste completo — é o
 * teto honesto para orçar um lote.
 */
export const COLD_PROOF_COST_PER_LEAD_USD = 0.03;

/** Mínimo de concorrentes nomeados para o gancho do e-mail 1 existir. */
export const COLD_PROOF_MIN_COMPETITORS = 2;

/** Os motores do probe frio — os mesmos do /test. */
const PROOF_PROVIDERS: LLMProvider[] = ["anthropic", "openai", "gemini", "perplexity"];

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

/**
 * A pergunta certa para o nicho/cidade do lead — a pergunta de COMPRA que o
 * cliente final faria. Determinística: a mesma entrada dá a mesma pergunta,
 * então o e-mail e o dossiê nunca divergem.
 */
export function buildProofQuery(service: string, city: string): string {
  const s = service.trim().replace(/\s+/g, " ");
  const c = city.trim().replace(/\s+/g, " ");
  if (!s || !c) return "";
  return `Who do you recommend for ${s} in ${c}?`;
}

/** Frases que um parser ingênuo confundiria com nome de empresa. */
const NOT_A_NAME =
  /^(here|these|the following|top|best|some|popular|options?|based on|if you|for more|note|disclaimer|summary|recommendation|overall|conclusion|i (?:would|can|don|do)|when |you (?:can|should|may)|it |there |this |that |please|contact|check|consider|look|search|visit|call|keep in mind|important|additionally|however|finally|also)\b/i;
const GENERIC_TAIL =
  /\b(company|companies|services?|providers?|contractors?|businesses?|options?|shops?|firms?)$/i;

/**
 * Extrai os nomes de negócio que a resposta RECOMENDOU — parser determinístico.
 *
 * Reconhece os três formatos que os motores de fato usam: item numerado
 * ("1. Acme Roofing — ..."), bullet ("- Acme Roofing: ...") e negrito
 * ("**Acme Roofing**"). O nome do próprio prospect é removido (é ele que
 * queremos provar ausente). Nada de heurística "parece nome próprio": se a
 * resposta não veio em lista, devolve vazio e o lead não entra na leva.
 */
export function extractRecommendedNames(raw: string, selfName: string, cap = 5): string[] {
  if (!raw || !raw.trim()) return [];
  const out: string[] = [];
  const selfTokens = selfName
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 4);

  /**
   * "É ele mesmo?" — TODOS os tokens significativos do nome têm de aparecer.
   * Metade não serve: "Acme Roofing" e "Lone Star Roofing" compartilham
   * "roofing", e o concorrente sumiria como se fosse o próprio prospect.
   */
  const isSelf = (name: string): boolean => {
    if (selfTokens.length === 0) return false;
    const n = name.toLowerCase();
    return selfTokens.every((t) => n.includes(t));
  };

  const push = (candidate: string | undefined): void => {
    if (!candidate) return;
    let name = candidate
      .replace(/^[\s*_#>[\]()-]+/, "")
      .replace(/[\s*_:—–-]+$/, "")
      .replace(/\s+/g, " ")
      .trim();
    // Corta uma cauda descritiva colada por travessão/dois-pontos.
    name = name.split(/\s+[—–-]\s+/)[0]!.split(/:\s/)[0]!.trim();
    if (name.length < 3 || name.length > 60) return;
    if (/https?:|www\.|@/i.test(name)) return;
    if (NOT_A_NAME.test(name)) return;
    if (GENERIC_TAIL.test(name) && name.split(" ").length <= 2) return;
    // Um nome de negócio tem ao menos uma palavra capitalizada.
    if (!/[A-Z]/.test(name)) return;
    if (isSelf(name)) return;
    if (out.some((n) => n.toLowerCase() === name.toLowerCase())) return;
    out.push(name);
  };

  for (const line of raw.split("\n")) {
    if (out.length >= cap) break;
    const trimmed = line.trim();
    if (!trimmed) continue;
    const bold = /^(?:[-*\d.)\s]*)\*\*([^*]{3,60})\*\*/.exec(trimmed);
    if (bold) {
      push(bold[1]);
      continue;
    }
    const numbered = /^\d{1,2}[.)]\s+(.{3,80})$/.exec(trimmed);
    if (numbered) {
      push(numbered[1]);
      continue;
    }
    const bullet = /^[-*•]\s+(.{3,80})$/.exec(trimmed);
    if (bullet) push(bullet[1]);
  }
  return out.slice(0, cap);
}

export interface ColdProofResult {
  ok: boolean;
  /** A pergunta feita, palavra por palavra (vai para {{query}} e para o dossiê). */
  query: string;
  /** O motor que produziu a resposta usada ({{ai_engine}} — nome de exibição). */
  engine: string | null;
  /** Nomes que a IA recomendou no lugar dele ({{competitor_1}}, {{competitor_2}}). */
  competitors: string[];
  /** true quando o próprio negócio JÁ é citado — gancho não existe, lead sai. */
  selfCited: boolean;
  /** Motores que responderam de verdade (não-mock). */
  enginesLive: number;
  /** Custo orçado desta execução, em USD. */
  costUsd: number;
  /** Motivo da recusa — vai literal para a linha de DESCARTADOS. */
  reason: string | null;
}

/** Nome de exibição do motor no e-mail (o lead não conhece nossos ids). */
export function engineDisplayName(provider: string): string {
  switch (provider) {
    case "anthropic": return "Claude";
    case "openai": return "ChatGPT";
    case "gemini": return "Gemini";
    case "perplexity": return "Perplexity";
    case "serp": return "Google AI Overview";
    default: return provider;
  }
}

export interface ColdProofDeps {
  /** Injetável para teste — por padrão, o gateway real (mesma via do /test). */
  runProbes?: typeof runProbes;
  region?: UserRegion;
}

/**
 * Roda o probe frio de UM lead. Uma pergunta, repeat=1, motores do /test.
 * Escolhe a resposta que melhor sustenta o gancho: a primeira (em ordem de
 * motor) que NÃO cita o prospect e nomeia ≥2 concorrentes. Se o prospect é
 * citado em todas, devolve ok=false com selfCited — e o lead fica de fora.
 */
export async function runColdProofProbe(
  input: { name: string; service: string; city: string },
  deps: ColdProofDeps = {}
): Promise<ColdProofResult> {
  const query = buildProofQuery(input.service, input.city);
  const base: ColdProofResult = {
    ok: false,
    query,
    engine: null,
    competitors: [],
    selfCited: false,
    enginesLive: 0,
    costUsd: 0,
    reason: null,
  };
  if (!query) {
    return { ...base, reason: "sem nicho/cidade identificados — impossivel fazer a pergunta certa (lead fora da leva)" };
  }

  const probe = deps.runProbes ?? runProbes;
  let result: Awaited<ReturnType<typeof runProbes>>;
  try {
    result = await probe([{ queryHash: sha256(query), queryText: query, brandName: input.name }], {
      region: deps.region ?? "US",
      requestedProviders: PROOF_PROVIDERS,
      repeat: 1,
    });
  } catch (e) {
    return { ...base, reason: `probe falhou: ${e instanceof Error ? e.name : "erro"} (lead fora da leva)` };
  }

  const costUsd = COLD_PROOF_COST_PER_LEAD_USD;
  const responses = result.responses.filter((r) => (r.rawText ?? "").trim().length > 0 && r.absent !== true);
  const enginesLive = responses.length;
  if (enginesLive === 0) {
    return { ...base, costUsd, reason: "nenhum motor respondeu a pergunta do lead (lead fora da leva)" };
  }

  let anySelfCited = false;
  for (const r of responses) {
    const raw = r.rawText ?? "";
    const cited = parseCitation(raw, input.name).mentioned;
    if (cited) {
      anySelfCited = true;
      continue;
    }
    const competitors = extractRecommendedNames(raw, input.name);
    if (competitors.length < COLD_PROOF_MIN_COMPETITORS) continue;
    return {
      ok: true,
      query,
      engine: engineDisplayName(r.provider),
      competitors,
      selfCited: false,
      enginesLive,
      costUsd,
      reason: null,
    };
  }

  if (anySelfCited) {
    return {
      ...base,
      selfCited: true,
      enginesLive,
      costUsd,
      reason: "a IA JA cita o proprio negocio — o gancho da leva 2 nao se aplica (lead fora da leva)",
    };
  }
  return {
    ...base,
    enginesLive,
    costUsd,
    reason: `nenhuma resposta nomeou ${COLD_PROOF_MIN_COMPETITORS}+ concorrentes (sem prova = lead fora da leva)`,
  };
}

/** As variáveis de merge que o SmartLead precisa para o e-mail 1 da leva 2. */
export interface ColdProofMergeVars {
  ai_engine: string;
  competitor_1: string;
  competitor_2: string;
  query: string;
}

/**
 * Converte o resultado do probe nas variáveis de merge. Devolve null quando
 * a prova não existe — o chamador NÃO deve inventar placeholder.
 */
export function proofMergeVars(r: ColdProofResult): ColdProofMergeVars | null {
  if (!r.ok || !r.engine || r.competitors.length < COLD_PROOF_MIN_COMPETITORS) return null;
  return {
    ai_engine: r.engine,
    competitor_1: r.competitors[0]!,
    competitor_2: r.competitors[1]!,
    query: r.query,
  };
}

/** Orçamento explícito de um lote, antes de gastar (regra: custo por lote logado). */
export function coldProofBatchBudgetUsd(leads: number): number {
  return Math.round(Math.max(0, leads) * COLD_PROOF_COST_PER_LEAD_USD * 100) / 100;
}
