/**
 * 5.F.5 — cadência auto-ajustada, a camada MEDIDA (founder-gated).
 *
 * A válvula (channelDailyCap) era só estática: linkedin=2 no código + env
 * CHANNEL_DAILY_CAP_<CANAL>. O que o 5.F.5 adiciona é MEDIÇÃO, nunca ação:
 * por canal, posts/dia vs média de resultado por post — cálculo 100%
 * SQL/código — virando uma linha de RECOMENDAÇÃO no relatório de segunda que
 * o founder já lê. O founder age mudando a env; NENHUM cap é alterado por
 * código (auto-aplicar seria auto-ativação, proibida).
 *
 * O que está pregado aqui:
 *  - computeCadenceSection é código puro: queda de média-por-post >= 30%
 *    entre posts/dia gera "dados sugerem N/dia" com a env nominal;
 *  - guarda de amostra honesta: < 10 posts = "sem amostra suficiente (N)",
 *    nada de estatística com n=3;
 *  - canal sem métrica mapeada / sem variação / sem valor = dito, sem palpite;
 *  - snapshot source 'cadence' roteado por marker (snap:cadence-*) — a
 *    agregação é SQL+código, o LLM nunca vê estes números antes do report;
 *  - NADA muda cap: process.env intocado e channelDailyCap idêntico antes e
 *    depois do cálculo.
 */

import { describe, it, expect } from "vitest";
import type postgres from "postgres";
import { channelDailyCap } from "../../apps/api/src/lib/graph-runner";
import {
  buildSnapshot,
  computeCadenceSection,
  CADENCE_MIN_SAMPLE,
  CADENCE_DROP_THRESHOLD,
  CHANNEL_METRIC_PREFIX,
} from "../../apps/worker/src/jobs/graph-tick";

const pub = (day: string, channel: string, hour = "10"): { summary: string; started_at: string } => ({
  summary: `published via postiz channel=${channel}`,
  started_at: `${day}T${hour}:00:00Z`,
});
const out = (day: string, metric: string, value: number): { metric: string; value_after: string | null; measured_at: string } => ({
  metric,
  value_after: String(value),
  measured_at: `${day}T07:40:00Z`,
});

/**
 * Cenário com queda real: dias com 1 post rendem 100/post; dias com 3 posts
 * rendem 50/post (150 no dia ÷ 3). 10 posts no total = amostra honesta.
 */
function droppingLinkedin() {
  const pubs = [
    pub("2026-08-01", "linkedin"),
    pub("2026-08-05", "linkedin"),
    pub("2026-08-20", "linkedin"),
    pub("2026-08-25", "linkedin"),
    pub("2026-08-10", "linkedin", "09"),
    pub("2026-08-10", "linkedin", "12"),
    pub("2026-08-10", "linkedin", "15"),
    pub("2026-08-15", "linkedin", "09"),
    pub("2026-08-15", "linkedin", "12"),
    pub("2026-08-15", "linkedin", "15"),
  ];
  const outcomes = [
    out("2026-08-02", "linkedinpage_impressions_7d", 100),
    out("2026-08-06", "linkedinpage_impressions_7d", 100),
    out("2026-08-21", "linkedinpage_impressions_7d", 100),
    out("2026-08-26", "linkedinpage_impressions_7d", 100),
    out("2026-08-11", "linkedinpage_impressions_7d", 150),
    out("2026-08-16", "linkedinpage_impressions_7d", 150),
  ];
  return { pubs, outcomes };
}

describe("computeCadenceSection (5.F.5) — cálculo puro, recomendações honestas", () => {
  it("queda >= 30% da média por post nos dias com mais posts → 'dados sugerem N/dia' + a env nominal", () => {
    const { pubs, outcomes } = droppingLinkedin();
    const section = computeCadenceSection(pubs, outcomes, 30);
    expect(section).toContain("VALVULA DE CADENCIA");
    // 100/post com 1/dia vs 50/post com 3/dia = queda de 50%.
    expect(section).toContain("- linkedin: dados sugerem 2/dia");
    expect(section).toContain("media por post cai 50% nos dias com 3 posts");
    expect(section).toContain("100 → 50 por post");
    // A ação é do FOUNDER, nominal — o código só recomenda.
    expect(section).toContain("Agir = env CHANNEL_DAILY_CAP_LINKEDIN=2");
    expect(section).toContain("NADA muda sozinho");
  });

  it("guarda de amostra: < 10 posts no canal = 'sem amostra suficiente (N posts)' — sem estatística inventada", () => {
    expect(CADENCE_MIN_SAMPLE).toBe(10);
    const pubs = [pub("2026-08-01", "x"), pub("2026-08-02", "x"), pub("2026-08-03", "x")];
    const outcomes = [out("2026-08-02", "x_impressions_7d", 900)];
    const section = computeCadenceSection(pubs, outcomes, 30);
    expect(section).toContain("- x: sem amostra suficiente (3 post(s) em 30d; minimo 10)");
    expect(section).toContain("sem estatistica inventada");
    // Mesmo com um valor alto colhido, NENHUMA recomendação sai com n=3.
    expect(section).not.toContain("dados sugerem");
  });

  it("média estável (queda < 30%): 'cap atual mantem' — sem recomendação de mudança", () => {
    expect(CADENCE_DROP_THRESHOLD).toBe(0.3);
    const { pubs } = droppingLinkedin();
    // Mesmos posts, mas dias de 3 posts rendem 270 (90/post) — queda de 10%.
    const outcomes = [
      out("2026-08-02", "linkedinpage_impressions_7d", 100),
      out("2026-08-06", "linkedinpage_impressions_7d", 100),
      out("2026-08-21", "linkedinpage_impressions_7d", 100),
      out("2026-08-26", "linkedinpage_impressions_7d", 100),
      out("2026-08-11", "linkedinpage_impressions_7d", 270),
      out("2026-08-16", "linkedinpage_impressions_7d", 270),
    ];
    const section = computeCadenceSection(pubs, outcomes, 30);
    expect(section).toContain("- linkedin: cap atual (2/dia) mantem");
    expect(section).not.toContain("dados sugerem");
  });

  it("canal sem métrica mapeada: dito com todas as letras, sem palpite", () => {
    expect(CHANNEL_METRIC_PREFIX["reddit"]).toBeUndefined();
    const pubs = Array.from({ length: 12 }, (_, i) => pub(`2026-08-${String(i + 1).padStart(2, "0")}`, "reddit"));
    const section = computeCadenceSection(pubs, [], 30);
    expect(section).toContain("- reddit: 12 posts, mas sem metrica mapeada");
    expect(section).toContain("sem recomendacao honesta possivel");
  });

  it("sem variação de posts/dia: nada a comparar — dito, cap mantido", () => {
    const pubs = Array.from({ length: 12 }, (_, i) => pub(`2026-08-${String(i + 1).padStart(2, "0")}`, "linkedin"));
    const outcomes = pubs.map((_, i) => out(`2026-08-${String(i + 2).padStart(2, "0")}`, "linkedinpage_impressions_7d", 100));
    const section = computeCadenceSection(pubs, outcomes, 30);
    expect(section).toContain("sempre 1/dia na janela — sem variacao de cadencia para comparar");
  });

  it("métrica sem valor utilizável na janela: dito, sem recomendação", () => {
    const { pubs } = droppingLinkedin();
    const section = computeCadenceSection(pubs, [], 30);
    expect(section).toContain("nao trouxe valor utilizavel");
  });

  it("nenhum publish = string vazia (o runner vira o SEM DADOS honesto)", () => {
    expect(computeCadenceSection([], [], 30)).toBe("");
  });

  it("NENHUM cap muda por código: process.env intocado e channelDailyCap idêntico antes/depois", () => {
    const envBefore = JSON.stringify(
      Object.fromEntries(Object.entries(process.env).filter(([k]) => k.startsWith("CHANNEL_DAILY_CAP")))
    );
    const capBefore = { linkedin: channelDailyCap("linkedin"), x: channelDailyCap("x") };
    const { pubs, outcomes } = droppingLinkedin();
    computeCadenceSection(pubs, outcomes, 30);
    const envAfter = JSON.stringify(
      Object.fromEntries(Object.entries(process.env).filter(([k]) => k.startsWith("CHANNEL_DAILY_CAP")))
    );
    expect(envAfter).toBe(envBefore);
    expect({ linkedin: channelDailyCap("linkedin"), x: channelDailyCap("x") }).toEqual(capBefore);
    // A válvula em código segue a estática de sempre: linkedin 2, resto sem cap.
    expect(capBefore).toEqual({ linkedin: 2, x: null });
  });
});

// ---------------------------------------------------------------------------
// A agregação é SQL — snapshot source 'cadence' (fake sql roteado por marker).
// ---------------------------------------------------------------------------

function fakeCadenceSql(rows: {
  pubs?: Array<{ summary: string; started_at: string }>;
  outcomes?: Array<{ metric: string; value_after: string | null; measured_at: string }>;
}): postgres.Sql {
  return (async (strings: TemplateStringsArray) => {
    const text = strings.join("$");
    if (text.includes("snap:cadence-publishes")) return rows.pubs ?? [];
    if (text.includes("snap:cadence-outcomes")) return rows.outcomes ?? [];
    throw new Error(`unrouted query in fake cadence sql: ${text.slice(0, 120)}`);
  }) as unknown as postgres.Sql;
}

describe("snapshot source 'cadence' — SQL marcado + código, nunca o modelo", () => {
  it("agrega publishes (channel= do summary) e outcomes da janela nas queries marcadas", async () => {
    const { pubs, outcomes } = droppingLinkedin();
    const snap = await buildSnapshot(fakeCadenceSql({ pubs, outcomes }), "cadence", 30);
    expect(snap).toContain("- linkedin: dados sugerem 2/dia");
    expect(snap).toContain("CHANNEL_DAILY_CAP_LINKEDIN=2");
  });

  it("janela sem publish nenhum = string vazia (o runner vira SEM DADOS)", async () => {
    const snap = await buildSnapshot(fakeCadenceSql({}), "cadence", 30);
    expect(snap).toBe("");
  });
});
