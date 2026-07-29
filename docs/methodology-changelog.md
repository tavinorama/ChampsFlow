# Methodology changelog (documento interno)

**TL;DR**: Histórico das versões da metodologia de medição GEO da Ozvor (`GEO_METHODOLOGY_VERSION`, em `packages/llm/src/sampling.ts`). Cada versão registra o que mudou, o efeito esperado no score e a flag de rollback. A versão é gravada em `geo_audit.methodology_version` e `citation_check.methodology_version`, e entra na chave do probe cache (`geoprobe:{query_hash}|{engine}|{methodology_version}`), então todo bump invalida o cache das versões anteriores. Regra permanente: scores de versões diferentes **não são comparáveis**; cada bump cria uma nova baseline. A versão em vigor é publicada em `/how-we-measure` (seção "What changed in version 2.1" + tabela de histórico).

---

## Índice

| Versão | Data | Título |
|---|---|---|
| 1.0 | lançamento | Repetição fixa por prompt × motor |
| 2.0 | 2026-07-28 | Amostragem estatística sequencial com Wilson IC 95% + 5 motores com busca web |
| 2.1 | 2026-07-29 | Extração em duas passagens com verificador cego |

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

## Regras permanentes

1. **Bump de versão quando o resultado deixa de ser comparável.** Mudança de protocolo de amostragem, de superfície do motor ou do que conta como citação = bump. Mudança de copy, de UI ou de performance = não.
2. **Todo bump invalida o probe cache** por construção (a versão está na chave). Planejar o pico de custo da primeira auditoria pós-deploy.
3. **Toda versão nasce com flag de rollback** no padrão `FLAG=0` volta ao comportamento anterior, default ON.
4. **Toda versão que muda o score para baixo exige nota pública** antes ou junto do deploy. Honestidade é o produto: o cliente precisa entender a queda sem susto.
5. **Nunca reescrever entrada histórica** deste arquivo. Só acrescentar versão nova no fim.
