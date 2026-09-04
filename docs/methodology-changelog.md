# Methodology changelog (documento interno)

**TL;DR**: Histórico das versões da metodologia de medição GEO da Ozvor (`GEO_METHODOLOGY_VERSION`, em `packages/llm/src/sampling.ts`). Cada versão registra o que mudou, o efeito esperado no score e a flag de rollback. A versão é gravada em `geo_audit.methodology_version` e `citation_check.methodology_version`, e entra na chave do probe cache (`geoprobe:{query_hash}|{engine}|{methodology_version}`), então todo bump invalida o cache das versões anteriores. Regra permanente: scores de versões diferentes **não são comparáveis**; cada bump cria uma nova baseline. A versão em vigor é publicada em `/how-we-measure` (seção "What changed in version 2.1" + tabela de histórico).

---

## Índice

| Versão | Data | Título |
|---|---|---|
| 1.0 | lançamento | Repetição fixa por prompt × motor |
| 2.0 | 2026-07-28 | Amostragem estatística sequencial com Wilson IC 95% + 5 motores com busca web |
| 2.1 | 2026-07-29 | Extração em duas passagens com verificador cego |
| 3.0 | 2026-09-03 | Prompt Universe v2 + quebra honesta de comparabilidade |

---

## 1.0: Repetição fixa por prompt × motor (lançamento)

**O que mudou**
- Protocolo inicial. Cada prompt de comprador era repetido um número fixo de vezes por motor (`GEO_PROBE_REPEAT`, default 3) e a citação era uma taxa de menção sobre essas repetições.
- Extração de citação single-pass: **qualquer** aparição do nome da marca no texto da resposta contava como citação.

**Efeito esperado no score**
- Baseline original. Sem comparação anterior.
- Viés conhecido, corrigido só em 2.1: contava falso positivo (homônimo, negação, menção neutra) como citação, então a taxa era estruturalmente **inflada**.

**Flag de rollback**
- Nenhuma. Era o comportamento padrão. `GEO_PROBE_REPEAT` controlava apenas o número de repetições.

---

## 2.0: Amostragem estatística sequencial + superfícies com busca web (2026-07-28)

**O que mudou**
- **B1 (portfólio por intenção + amostragem sequencial)**: `packages/llm/src/sampling.ts`:
  - base enxuta de **2 runs por formulação** (antes: 3 fixos em tudo); com 2 formulações por intenção, n = 4 runs por intenção × motor;
  - **escalonamento sequencial**: só a intenção × motor com sinal ambíguo (taxa de citação em [0.25, 0.75] e n < 6) ganha +1 run por formulação viva, no máximo 2 rodadas, até n >= 6 ou sair da faixa ambígua;
  - **teto global de gerações** por auditoria (`GEO_MAX_GENS`, default 220); ao atingir o teto, o escalonamento loga e para (fail-safe), e o protocolo base sempre termina;
  - **intervalo de Wilson 95%** em todo agregado por intenção × motor (`packages/llm/src/wilson.ts`); a largura do intervalo nunca é escondida a jusante.
- **Migração** `20260728000001_intent_sampling`: colunas `intent_id`, `formulation_ix`, `methodology_version` (default `'1.0'`) em `citation_check` e `geo_audit`.
- **Probe cache** (`packages/llm/src/probe-cache.ts`): agregado de probe inteiro cacheado, nunca geração individual (senão o IC seria mentira). Probe vindo de cache é unidade congelada: conta para n, mas nunca é re-rodado nem escalonado.
- **B2 (superfícies com busca web)**: os 5 motores passam a ser sondados na superfície **com busca habilitada** (OpenAI web search tool, Anthropic web search tool, Gemini grounding, Perplexity nativo, Google AI Overview via SERP), ou seja, o que o consumidor realmente vê, e não a memória paramétrica do modelo.

**Efeito esperado no score**
- Menos ruído e menos custo por auditoria: a maior parte das intenções resolve com n = 4; só o caso ambíguo paga runs extras.
- Score **não comparável** com 1.0: muda o denominador (número de runs) e a origem da resposta (com busca web em vez de memória do modelo).
- Direção do efeito não é uniforme: marcas com presença web real tendem a **subir** com busca habilitada; marcas que só existiam na memória do modelo tendem a **cair**.

**Flag de rollback**
- `GEO_WEB_SEARCH=0`: volta ao comportamento pré-B2 (chamada sem ferramenta de busca) em todos os providers. Default ON.
- `GEO_PROBE_CACHE=0`: desliga o cache de probes. Default ON.
- `GEO_MAX_GENS`: teto de gerações por auditoria (default 220), ajustável sem deploy.

---

## 2.1: Extração em duas passagens com verificador cego (2026-07-29)

**O que mudou** (`packages/llm/src/extraction.ts`, PR #379)
- **Passagem 1 (extrator)**: recebe a resposta bruta, o nome da marca e a lista de concorrentes; devolve JSON estrito com `text_exact`, `offset_start`, `offset_end`, `entity`, `kind`, `url?`.
- **Passagem 2 (verificador cego)**: recebe a resposta bruta e **uma** menção candidata por vez, **sem** saber o que o extrator concluiu, e devolve `{verdict, reason, kind_confirmed}`. Rejeita homônimo, negação, menção alucinada e offset que não bate com o texto.
- **Só conta como citação** a menção que sobrevive ao verificador e cujo `kind_confirmed` está em `CITING_KINDS` = `direct_recommendation` | `cited_source`. `neutral_mention` e `negative_mention` continuam no breakdown mas **não pontuam**.
- **Regra de segurança**: a extração só **remove** citação, nunca cria. A taxa de menção medida é zerada quando o texto retido do probe não tem nenhuma menção citante sobrevivente; taxa que sobrevive fica exatamente como foi medida. Os agregados Wilson por intenção são recalculados a partir dos mesmos números do score.
- **Tetos de custo**: verificador nunca roda em resposta vazia nem com zero menções; candidato cujo `text_exact` não existe no texto é rejeitado localmente (checagem determinística, sem LLM); máximo de **8 menções verificadas por resposta** (as demais ficam `UNVERIFIED_CAP`, nunca descartadas em silêncio); menções da marca do cliente são verificadas primeiro.
- **Fail-open**: JSON malformado → 1 retry com instrução corretiva → ainda malformado ou sem chave de modelo → `extraction_mode: "fallback_single_pass"` (comportamento 2.0). Verificador com timeout ou erro → menção fica `UNVERIFIED` com motivo e a medição é mantida.
- **Novo breakdown** exposto em `GET /audits/:id` como `extraction` (aditivo, `null` em audits pré-B3): `mode`, `verified_count`, `rejected_count`, `by_kind`, `sample_rejections`, `probes_adjusted`, `llm_calls`. `probes_adjusted` = quantos agregados de probe perderam a citação por não sobrar nenhuma menção citante, ou seja, o número de falsos positivos mortos naquela auditoria.

**Efeito esperado no score**
- Citation rate **cai** para a maioria das marcas, e o Visibility Score cai junto (citation rate pesa 50%). Quanto maior a fatia de "visibilidade" feita de menção neutra ou negativa, maior a queda.
- **Isso é correção, não regressão do cliente.** 2.1 é estritamente mais rigoroso que 2.0. Score 2.0 e score 2.1 **não são comparáveis**; a primeira auditoria 2.1 é uma nova baseline.
- O bump 2.0 → 2.1 **invalida todo o probe cache** (a versão está na chave). A primeira auditoria depois do deploy roda 100% ao vivo, com pico pontual de custo.
- Custo extra estimado: ~$0,10 a $0,25 por auditoria (ordem de +15% a +30% sobre ~$0,80), já contabilizado no ledger `api_spend` via `AUDIT_COST_PER_EXTRACTION_CENTS`.

**Flag de rollback**
- `GEO_TWO_PASS_EXTRACTION=0`: volta ao single-pass com semântica 2.0. Default ON. Mesmo padrão de `GEO_WEB_SEARCH` e `GEO_PROBE_CACHE`.
- `AUDIT_EXTRACTION_MODEL`: sobrescreve o modelo de extração/verificação (default: modelo mais barato disponível, `claude-haiku-4-5` ou `gpt-4o-mini`).

**Comunicação ao cliente**
- Página pública: `/how-we-measure`, seção "What changed in version 2.1" + tabela "Methodology version history".
- E-mail de resultado (`packages/shared/src/emails/free-test-result.ts`): uma linha discreta com link para a página de metodologia, em texto e HTML.

---

## 3.0: Prompt Universe v2 + quebra honesta de comparabilidade (2026-09-03)

**Aprovado pelo founder em 03/09/2026**, com a condição explícita: a quebra pode
acontecer, desde que seja **rotulada**. Este é o registo dessa quebra.

### O que motivou

Leitura do banco de produção em 03/09/2026, marca `e74fcbc1-a988-4b5d-b054-87329dc881c0`:

| Run | `methodology_version` | Motores | Brand |
|---|---|---|---|
| 30/06 | 1.0 | **2** (perplexity, dataforseo) | 90 |
| 29/07 09:58 | 1.0 | **1** (dataforseo) | 19 |
| 29/07 14:11 | **2.1** | **5** | 24 |
| 31/08 | 2.1 | **4** (sem anthropic) | — |

A queda divulgada como "71 → 48" liga esses pontos como se fossem uma tendência.
Em parte relevante **não são**: são réguas diferentes. `methodology_version`
sozinha nunca apanharia o caso de 31/08 — mesmo método, painel diferente.

Em paralelo, os prompts padrão perguntavam por "best SaaS for SMBs". A Ozvor não
compete nessa categoria; medíamo-nos num mercado que não é o nosso e líamos o
ruído como tendência.

### O que mudou

- **`PromptDefinition` versionado** (`packages/llm/src/prompt-universe.ts`):
  cohort (`benchmark`|`opportunity`|`customer`), intent, vertical, market,
  locale, funnelStage, demand `{value, source}`, businessValue, relevanceScore,
  branded, expectedCompetitors, validFrom/validUntil, version, approvedBy,
  ownerType, archivedAt/archivedReason.
- **Composição por coorte configurável.** `DEFAULT_COHORT_MIX` = 60/20/20 é um
  **default, não uma lei**. `resolveCohortMix()` aceita override por
  tenant/marca ou env e devolve a mix aplicada + a fonte, que o run grava.
  Quota por largest-remainder; coorte que não enche redistribui **com nota**.
- **Quality gate** (`packages/llm/src/prompt-quality-gate.ts`): piso de
  relevância, dedupe semântico (Jaccard + containment), buyer intent
  obrigatório, coerência idioma×mercado, branded vs non-branded explícito **e**
  consistente com o texto, freshness. Nada é descartado em silêncio.
- **Universo próprio da Ozvor** (`packages/llm/src/prompt-universe-ozvor.ts`):
  os prompts genéricos saem por **arquivamento** (nunca DELETE), cada um com o
  motivo; entram prompts de GEO, AI visibility, brand monitoring, local service
  e agency, em en-US, pt-BR e EU.
- **Badge de comparabilidade**
  (`apps/api/src/lib/methodology-comparability.ts`):
  `Comparable` / `Method changed` / `Prompt set changed` / `Engine changed`,
  mais um quinto estado honesto — `Not comparable — unknown method` — quando um
  dos runs não regista o que usou. **Dado ausente nunca vira "igual".**
  A linha de tendência é cortada em segmentos; pontos incompatíveis nunca são
  ligados. **A variação do conjunto de motores entre runs conta como
  incompatibilidade** — é exatamente o caso de 31/08 e o de 30/06.
- **Migração** `20260903000001_prompt_universe`: colunas do PromptDefinition em
  `audit_prompt`, tabela append-only `prompt_universe_event`, e
  `prompt_set_version` / `prompt_set_hash` / `engine_set` em `geo_audit`.

### Integração, não duplicação

A fase 2 do Visibility Loop v2 (PR #582, `apps/api/src/lib/trend-comparability.ts`)
já decide, **por run**, se ele entra na tendência, via painel pinado + banda de
checks. Este módulo decide, **por transição**, qual badge mostrar e onde a linha
quebra. Os dois compõem-se: as marcas de #582 entram em `panelMarks` e o run
excluído lá é excluído aqui, com a razão **verbatim**. Nada é recalculado nem
contradito. Sem #582 presente, a mudança de painel ainda quebra a linha — o caso
de 31/08 não pode esperar por outro PR para ser dito.

### Efeito esperado no score

- **O score de todas as marcas muda**, porque as perguntas mudam. Não há
  direção uniforme: marca com presença real na categoria certa tende a subir;
  marca que só pontuava em perguntas genéricas tende a cair.
- **Score 2.1 e score 3.0 não são comparáveis.** A primeira auditoria 3.0 é uma
  nova baseline, e o badge diz `Prompt set changed` (ou `Method changed` quando
  ambos mudam) na transição.
- Runs anteriores mantêm `prompt_set_version` NULL e o badge lê `unknown`.

### Política de backfill

**Nenhuma, deliberadamente.** Nenhuma linha histórica é rerrotulada, nenhum score
antigo é recalculado. Rerrotular seria inventar uma continuidade que não existiu
— o defeito que esta versão fecha.

### Flag de rollback

- `OZVOR_COHORT_MIX` (ex.: `benchmark=0.5,opportunity=0.3,customer=0.2`):
  ajusta a composição sem deploy. Env malformada **lança** em vez de cair para o
  default — um typo não pode reformular a medição em silêncio.
- O universo Ozvor é aplicado por script auditável e reversível
  (`npx tsx scripts/migrate-ozvor-prompt-universe.ts --apply` / `--restore`), não por
  deploy. Reverter re-ativa os prompts arquivados e regista o evento `restored`.

### Comunicação ao cliente

- Página pública `/how-we-measure`: entrada 3.0 na tabela de histórico.
- Dashboard: badge visível em toda transição, com a razão em texto humano.

**Estado no momento deste commit:** a migração está em PR separado (merge do
founder). Enquanto ela não for aplicada, o stamp de comparabilidade **está
DESLIGADO** — o worker loga `audit_comparability_stamp_unavailable` nomeando a
migração, o badge lê `unknown`, e a auditoria não falha por isso.

---

## Regras permanentes

1. **Bump de versão quando o resultado deixa de ser comparável.** Mudança de protocolo de amostragem, de superfície do motor ou do que conta como citação = bump. Mudança de copy, de UI ou de performance = não.
2. **Todo bump invalida o probe cache** por construção (a versão está na chave). Planejar o pico de custo da primeira auditoria pós-deploy.
3. **Toda versão nasce com flag de rollback** no padrão `FLAG=0` volta ao comportamento anterior, default ON.
4. **Toda versão que muda o score para baixo exige nota pública** antes ou junto do deploy. Honestidade é o produto: o cliente precisa entender a queda sem susto.
5. **Nunca reescrever entrada histórica** deste arquivo. Só acrescentar versão nova no fim.
