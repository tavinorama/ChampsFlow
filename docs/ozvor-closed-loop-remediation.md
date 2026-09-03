# Ozvor — Closed Loop: mapa de remediação (Discovery Fase 0)

> **Estado:** DISCOVERY / MAPEAMENTO. Nenhuma linha de código de produto foi alterada nesta entrega.
> **Branch:** `docs/closed-loop-discovery` · **Baseline de main:** `8d6a6a9`
> **Relatório de auditoria:** recebido e lido na íntegra (1698 linhas) — ver secção "Relatório × código".

---

## TL;DR

O closed loop está partido em cinco pontos, e o relatório do founder mede exatamente os sintomas que o código explica. **Do Next**: o gerador de `plan_task` esteve morto desde 09/07 porque só existia atrás de um botão da página antiga (`audit-run.ts:1364` documenta a causa); o PR #574, mergeado hoje, religou-o — mas em modo fail-soft, o que significa que se voltar a falhar não vamos saber. **Execution 100%** com zero tarefas abertas é aritmética honesta sobre dados desonestos: `deriveExecutionProgress` (`audits.ts:363`) conta checkboxes, e `PATCH /api/plan-tasks/:id` (`audits.ts:1946`) escreve `done` sem nenhuma verificação. As cinco ações genéricas são enchimento deliberado (`strategy-generator.ts:236`, comentário: *"truly generic"*) para atingir uma quota de 5; confirmei o texto de três delas contra o que o relatório viu. **Content** exige BYOK sem caminho hospedado (`content-studio.ts:520`, 402 em `audits.ts:2168`). **Opportunity Radar** não tem gate nenhum e não tem fonte configurada. **System Health** pinta verde por presença de variável de ambiente, não por sonda (`admin.ts:866`). Comparabilidade de motores já é sinalizada; a de metodologia não existe. Filas: sem dead-letter, sem visibilidade de jobs falhados, e a mesma fila `geo-audit` tem duas políticas de retry conflitantes.

Baseline verde: 2586 testes. Três achados novos e verificados que o relatório não tinha: o "Add your own to-do" viola uma CHECK constraint, retry de audit duplica a série do score, e falha permanente de publish marca o job como concluído.

---

## Como ler este documento

- Toda afirmação factual traz `arquivo:linha`.
- O que não foi verificado está marcado **NÃO VERIFIQUEI**, com todas as letras.
- Dedução que não é leitura direta está marcada **HIPÓTESE A CONFIRMAR**.
- Onde o relatório e o código divergem, o código ganha e a divergência fica escrita.

---

## Baseline de testes (executado nesta branch)

Comando: `npx vitest run` na raiz do worktree, após `npm install`.

```
 Test Files  205 passed | 2 skipped (207)
      Tests  2586 passed | 42 skipped (2628)
   Start at  17:38:12
   Duration  25.65s (transform 1.40s, setup 394ms, import 6.04s, tests 6.60s, environment 9ms)
```

- Suíte unitária/integração verde na íntegra.
- **NÃO VERIFIQUEI** a suíte E2E (`npm run test:e2e`, Playwright): exige app em execução e, conforme histórico do projeto, falha na main sem derrubar o workflow.
- `npx vitest run --reporter=basic` falha no arranque (o reporter `basic` não existe nesta versão do Vitest); o baseline acima usa o reporter padrão.

---

## Relatório × código: sintoma observado → causa confirmada

O relatório declara a sua própria regra (`RELATORIO-AUDITORIA-COMPLETA-OZVOR.md:55`): *"causas internas são hipóteses a validar no código — os sintomas e contradições, porém, foram observados diretamente."* Segui essa regra à letra: os sintomas abaixo são tratados como facto, as causas foram confirmadas, refutadas ou marcadas como não verificadas.

| # | Sintoma do relatório (facto) | Causa no código | Veredito |
|---|---|---|---|
| R1 | Execution **100** com **0 tarefas abertas e 5 concluídas**, mensagem "All caught up" | `apps/api/src/routes/audits.ts:363` conta `done / (total não-rejected)` → 5/5 = 100. Estado vazio em `apps/web/src/app/dashboard-v3/page.tsx:1395`. | **CONFIRMADO** |
| R2 | As **5 recomendações genéricas** listadas no relatório | `packages/llm/src/strategy-generator.ts:236`–`:260`, array `evergreen` com o comentário *"Evergreen cards have no evidence/metric — they are truly generic"* e o loop de enchimento `if (recs.length >= 5) break`. Confirmei o texto: "Audit name, logo, description, and website URL across all public profiles" (`:239`), "Publish or refresh one citation-worthy article per week" (`:246`), "Enable weekly monitoring" (`:253`) — batem com 3 das 5 que o relatório viu. | **CONFIRMADO** |
| R3 | Checkbox aumenta Execution sem nada publicado | `PATCH /api/plan-tasks/:id` (`apps/api/src/routes/audits.ts:1946`) valida auth, papel, tenant e enum — e escreve o status direto (`:1991`). **Zero verificação.** | **CONFIRMADO** |
| R4 | Do Next vazio apesar de score baixo | Gerador só corria pelo botão legado; `apps/worker/src/jobs/audit-run.ts:1364` documenta: *"dashboard-v3 and the cron audits never called it, so Do Next went dead after 2026-07-09."* | **CONFIRMADO — e já corrigido no `8d6a6a9` (#574)**, com ressalvas (secção 1) |
| R5 | Content depende de BYOK, sem chave configurada, alerta fraco | `packages/llm/src/content-studio.ts:516` (`if (!apiKey)` → `generatedBy: "error"`), `apps/api/src/routes/audits.ts:2168` → HTTP 402. Sem fallback de plataforma, por decisão escrita em `audits.ts:2125`. | **CONFIRMADO** |
| R6 | Opportunity Radar vendido como sinal ao vivo, mas desligado | `apps/api/src/routes/signals.ts:78` devolve `not_configured` sem `SIGNAL_ENGINE_URL`/`_API_KEY`; essas vars não existem em `.env.example` (0 ocorrências). | **CONFIRMADO — e pior do que o relatório diz:** não há feature gate nenhum (secção 5), a aba aparece a todos os planos, incluindo Free |
| R7 | System Health verde porque mede infra, não entrega | `apps/api/src/routes/admin.ts:866` decide "live" por presença de env var, sem pingar provider nenhum. Só Postgres (`:859`) e Redis (`:921`) são sondados. | **CONFIRMADO** |
| R8 | Score **71→48** (Brand **90→34**) entre 30/06 e 02/09 | Mecanismos existem e são vários: metodologia 2.1 é estritamente mais rígida e o próprio código diz que *"Rates from 2.0 and 2.1 are NOT comparable"* (`packages/llm/src/sampling.ts:36`, constante em `:54`); provider que falha é removido do conjunto (`packages/llm/src/providers/gateway.ts:309`); falha parcial encolhe o denominador (`gateway.ts:277`). **Qual destes causou a queda concreta exige ler `methodology_version` e `providers_used` das linhas reais — NÃO VERIFIQUEI contra a base.** | Mecanismo CONFIRMADO, instância NÃO VERIFICADA |
| R9 | **Duas auditorias no mesmo dia 29/07** com Overall 24 e 41 | `apps/worker/src/jobs/audit-run.ts:651`–`:676` documenta explicitamente um incidente de **2026-07-29** de cobertura de motores, e foi por causa dele que nasceu o guard `MIN_ENGINE_COVERAGE = 0.5` (`:203`) e o portão de publicação (`:679`). A data bate exatamente. | **CONFIRMADO** (mesma data, mesmo mecanismo) |
| R10 | **Três auditorias incompletas em 17/08** | Dois mecanismos possíveis: (a) falha de cobertura marca `status='failed'` com mensagem (`audit-run.ts:691`); (b) **não há `catch` de topo** à volta do corpo do job (`audit-run.ts:332`–`1751`), logo um throw inesperado depois de `status='running'` (`:346`) deixa a linha presa em `running` para sempre — e **não existe reaper**. Qual dos dois produziu as três de 17/08: **NÃO VERIFIQUEI**. | Mecanismo CONFIRMADO, instância NÃO VERIFICADA |
| R11 | **10 vs 15 marcas** | `packages/shared/src/plan-limits.ts:107` impõe `max_brands: 10`. Cinco sítios anunciam 15 — ver o mapa do funil, secção "conflitos". **CONFIRMADO e pior:** a constraint de sites tem **três** números diferentes (10 imposto, 15 anunciado, 25 num comentário em `apps/api/src/routes/landing.ts:8`). | **CONFIRMADO** |
| R12 | "3/3 vs 5 ações concluídas" no ecrã Prime/OrganicPosts | Existe um contador independente em `apps/api/src/routes/prime.ts:113` (`actionCardsDone`) que consulta `plan_task` com um filtro diferente do de `deriveExecutionProgress` (`audits.ts:363`). Dois denominadores para a mesma realidade. **Não confirmei os números 3 e 5 concretos — NÃO VERIFIQUEI** contra dados. | Causa estrutural CONFIRMADA, números NÃO VERIFICADOS |
| R13 | Viewport 390px renderizando documento de **631px** em home, pricing, test e dashboard | **Não existe nenhuma largura mínima literal partilhada.** Verifiquei por grep em `apps/web/src/styles/tokens.css`, `apps/web/src/app/layout.tsx`, `CookieConsent.tsx`, `ChatWidget.tsx`: zero ocorrências de 600–640px fora de media queries. Ver secção 8 para os candidatos e porque o número é intrínseco, não literal. | **HIPÓTESE A CONFIRMAR — exige medição em runtime** |
| R14 | 38 títulos `\| Ozvor \| Ozvor`, 5 rotas sem canonical, 11 sem OG | **NÃO VERIFIQUEI.** Fora do escopo dos nove itens encomendados; não abri o template de metadata. Fica listado abaixo. | NÃO VERIFICADO |
| R15 | Admin diz 10 blog posts, blog ao vivo tem 19 | **NÃO VERIFIQUEI.** | NÃO VERIFICADO |
| R16 | 9 pedidos de Kit contra 2 no analytics | **NÃO VERIFIQUEI** — exige dados de produção, não código. | NÃO VERIFICADO |
| R17 | Visibility 42±7, Citation Readiness 54, vários intents em 0% | **NÃO VERIFIQUEI** — são valores de tenant, não constantes de código. | NÃO VERIFICADO |

### Onde o relatório está incompleto (não errado)

1. **R4 já foi corrigido.** O relatório tem data de corte 03/09 e o PR #574 mergeou no mesmo dia. O gerador não está morto agora — mas o modo fail-soft com que voltou é um risco novo, descrito na secção 1.
2. **R6 subestima o problema.** O relatório diz "esconder ou lançar MVP". O código mostra que não há sequer um mecanismo de gate para esconder por plano — a aba é incondicional.
3. **R2/R3 juntos são pior do que a soma.** O relatório trata "ações genéricas" e "checkbox sem prova" como dois problemas. No código são um só ciclo: o enchimento cria 5 cards sem evidência, o cliente marca as 5, a Execution vai a 100, o Do Next fica vazio e o painel celebra. Nenhum passo é um bug isolado; o ciclo é o defeito.

### Itens do relatório que NÃO consegui confirmar no código — não verifiquei

Digo com todas as letras: **não verifiquei** nenhum dos seguintes, e nenhum deles é afirmado neste documento como facto.

- Os valores Visibility 42±7 e Citation Readiness 54 (R17).
- A instância concreta da queda 71→48 / Brand 90→34 (R8) — só o mecanismo.
- Quais foram as três auditorias incompletas de 17/08 e por que motivo (R10).
- Os números 3/3 vs 5 do ecrã Prime (R12) — só a existência de dois contadores.
- Os 38 títulos duplicados, 5 canonicals em falta, 11 OG em falta (R14).
- A divergência 10 vs 19 blog posts no admin (R15).
- Os 9 pedidos de Kit vs 2 no analytics (R16).
- O número exato de 631px e qual elemento o produz (R13) — só os candidatos.
- Todas as contradições legais da secção 12 do relatório (Privacy vs Sub-processors vs DPA vs Terms).
- O incidente do post LinkedIn com nota interna (secção 11 do relatório).
- Todo o benchmark competitivo (secção 13) e toda a Parte II (posicionamento, dois funis, modelo de MRR) — são estratégia, não código.
- Que a base de produção corresponde às migrações do repositório. Isto é uma premissa de tudo o que se segue.

---

## 1. Do Next: "All caught up", estado vazio e o gerador de `plan_task`

### Correção à premissa: deixou de estar morto hoje

A encomenda diz que o gerador está morto desde 09/07. Era verdade e deixou de ser no commit `8d6a6a9` (PR #574), que é o HEAD de `origin/main` a partir do qual esta branch nasceu. A causa raiz está escrita no próprio código, `apps/worker/src/jobs/audit-run.ts:1364`:

```
// Root cause this fixes: plan_task generation only ever ran from a manual
// button on the legacy brand page (POST /api/audits/:id/plan); dashboard-v3
// and the cron audits never called it, so "Do Next" went dead after 2026-07-09.
```

O gerador nunca esteve apagado — estava acessível **apenas** pelo botão da página antiga de marca (`apps/web/src/app/brands/[id]/page.tsx:2508`). O `dashboard-v3` nunca teve essa chamada (a sua única escrita é `addTask`, `apps/web/src/app/dashboard-v3/page.tsx:503`) e os audits do cron também não. Quem migrou para o v3 ficou com o Do Next congelado — que é exatamente o que o relatório fotografou.

### Onde vive

- **Renderer:** `apps/web/src/app/dashboard-v3/page.tsx:1367` (`DoNextTab`); divisão aberto/feito em `:1376`.
- **Dois estados vazios diferentes**, e a distinção importa:
  - `:1385` — nenhuma linha: *"No plan yet — add your own to-dos above, or run an audit from the Overview tab to generate one."*
  - `:1395` — há linhas, nenhuma aberta: *"All caught up — every fix is done. Nice work. 🎉"*
- Fonte de dados: `apps/web/src/app/dashboard-v3/page.tsx:476` → `GET /api/brands/:id/plan` (`apps/api/src/routes/audits.ts:1880`, SELECT em `:1913`/`:1920`).
- **Cinco escritores de `plan_task`:** `apps/worker/src/jobs/audit-run.ts:1417` (novo, corre em todo audit completo), `apps/api/src/routes/audits.ts:1807` (botão legado), `:1869` (to-do do utilizador), `:1992` (PATCH), `apps/worker/src/jobs/landing-generate.ts:459`/`:466` (UPDATE apenas).
- **Cadeia de chamada, agora registada:** `buildLoopCandidates`/`reconcileLoopTasks` em `packages/llm/src/visibility-loop.ts` (exportados em `packages/llm/src/index.ts:299`, `:307`, `:318`) → importados em `apps/worker/src/jobs/audit-run.ts:64` → invocados em `:1390`/`:1405` → INSERT em `:1417`. Chamador `processAuditJob`, registado como worker BullMQ `geo-audit` em `apps/worker/src/index.ts:134`, arrancado em `:150`; gatilho agendado `processDailyMonitoredBrands` em `:851` (24h) e no boot em `:859`.
- **Migrações:** `packages/db/migrations/20260531000004_strategy_plan.up.sql:36`–`:62` (criação, RLS `:56`, índice `:59`, grants `:61`); `20260627000002_action_card_fields.up.sql:11`; `20260709000001_plan_task_due_date.up.sql:9`; `20260710000001_ozvor_pages_schema.up.sql:210`.

### Defeitos que restam depois do #574

**D1.1 — falha silenciosa do loop.** O bloco inteiro é `try/catch` fail-soft (`apps/worker/src/jobs/audit-run.ts:1436`): em erro regista `visibility_loop_failed` com `effect: "audit delivered but Do Next cards NOT refreshed this run"` e o audit **reporta sucesso**. Uma falha persistente é invisível para o cliente, que volta a ver "All caught up" sem nada estar resolvido. É o padrão "nada degrada calado", agora no caminho novo — e é exatamente o sintoma que o relatório fotografou, com uma causa diferente.

**D1.2 — zero cards sem erro nenhum.** `audit-run.ts:1389` só gera `if (loopProbes.length > 0)`; os probes são filtrados em `:1378`–`:1380` por `r.queryText` não vazio. Se `queryText` não vier populado, escrevem-se **zero cards e não se regista erro**. Silêncio indistinguível de "não há nada a fazer".

**D1.3 — "Add your own to-do" está partido (ACHADO NOVO, verificado no código).** `apps/api/src/routes/audits.ts:1869` insere `vector = 'custom'`:
```sql
INSERT INTO plan_task (tenant_id, plan_id, vector, gap, action, effort, impact, priority, owner, status, created_at)
VALUES ($1, $2, 'custom', $3, $3, 'medium', 'medium', 50, 'you', 'accepted', NOW())
```
A única CHECK constraint em todas as migrações é `packages/db/migrations/20260531000004_strategy_plan.up.sql:48`:
```sql
CONSTRAINT plan_task_vector_check CHECK (vector IN ('brand', 'performance', 'ai')),
```
Verificação executada: `grep -rn "vector" packages/db/migrations/ | grep -iE "check|drop constraint|custom"` devolve **essa linha e mais nenhuma** — nenhuma migração relaxa ou remove a constraint. O endpoint deve falhar com violação de constraint. **NÃO VERIFIQUEI contra a base de produção** (pode haver drift face às migrações); é a primeira coisa a confirmar com uma query. Isto significa que a via de escape que o próprio estado vazio sugere ao utilizador ("add your own to-dos above") **não funciona**.

**D1.4 — ambiguidade do estado vazio.** "All caught up" e "o loop falhou / não gerou" são visualmente idênticos: ambos resultam em zero cards abertas. O painel nunca diz quando foi a última geração bem-sucedida. É precisamente o invariante que o relatório exige (`RELATORIO:100`–`:110`).

### Migração necessária
Só D1.3 exige schema: adicionar `'custom'` à CHECK constraint (par `up`/`down` simples) **ou** mudar o INSERT para um vector válido — a segunda opção é preferível, porque `'custom'` não tem semântica de vector. Para D1.1/D1.2/D1.4: gravar em cada plano o carimbo da última geração e a sua causa (`ok` / `falhou` / `sem evidência`) e mostrá-lo no estado vazio, para "All caught up" só aparecer quando é verdade. Isso satisfaz o invariante P0-01 do relatório.

### Teste existente / faltante
Existente: `tests/unit/visibility-loop.test.ts` (234 linhas, adicionado no #574), cobre a geração determinística. **Faltante:** teste de que `POST /api/brands/:id/tasks` não viola a constraint (não existe — foi por isso que o bug passou); teste de que `loopProbes` vazio produz log e não silêncio; teste de que "All caught up" não aparece quando a última geração falhou.

### Risco e rollback
D1.3: risco BAIXO, correção mecânica; rollback = migração `down`. D1.1/D1.2/D1.4: BAIXO, aditivo. O maior risco é o próprio #574 — código novo no caminho quente do audit, protegido por fail-soft, o que significa que **se falhar não vamos saber pelos números**. A primeira métrica a instrumentar é a contagem de `visibility_loop_failed`.

---

## 2. Execution % — atividade a fingir-se de execução verificada

### Onde vive
- Cálculo: `apps/api/src/routes/audits.ts:354` (`deriveExecutionProgress`). Escolhe o `strategy_plan` mais recente (`:356`), depois `:363`:
```sql
SELECT COUNT(*) FILTER (WHERE status != 'rejected') AS total,
       COUNT(*) FILTER (WHERE status = 'done')      AS done
  FROM plan_task WHERE plan_id = $1
```
`:372` — `return total > 0 ? Math.round((done / total) * 100) : null;`
- Chamadores: `apps/api/src/routes/audits.ts:2294` e `:2550`.
- Contrato: `packages/llm/src/scoring.ts:214`–`:265`; `:235` diz *"Computed live from plan_task — never stored as a snapshot."*
- Render: `apps/web/src/components/OzvorScorecard.tsx:234`, `apps/web/src/app/dashboard-v3/page.tsx:1041`, `apps/web/src/app/brands/[id]/page.tsx:193`; copy pública em `apps/web/src/app/(marketing)/how-we-measure/page.tsx:637`.

### O defeito — o checkbox do cliente é a única fonte de verdade
- Cliente: `apps/web/src/app/dashboard-v3/page.tsx:599` (`toggleTask`, otimista) → checkbox em `:1400`.
- Servidor: `apps/api/src/routes/audits.ts:1946`. Faz auth (`requireAuth`), papel (`requireRole(["owner","editor"])`), isolamento de tenant (`:1985`, `:1993`) e whitelist de enum (`:1966`). E depois escreve o status diretamente (`:1991`).

**Não existe passo de verificação nenhum** — sem re-probe, sem crawl, sem re-audit, sem evidência de que a correção aconteceu. Marcar `status = 'done'` é uma afirmação do cliente, e essa afirmação alimenta: a Execution % mostrada como métrica de produto, o contador da checklist Prime (`apps/api/src/routes/prime.ts:113`) e a prontidão do Ozvor Pages (`apps/api/src/routes/landing.ts:474`, `:712`).

**O mecanismo certo já existe, noutro caminho.** `packages/llm/src/visibility-loop.ts:380`–`:390` marca uma card `done` com carimbo `VERIFIED_PREFIX` **só quando o audit seguinte mostra a query citada**. É verificação medida. O produto mistura os dois conceitos sob o mesmo número — que é a definição exata de P0-02 no relatório.

Defeitos secundários:
- `catch { return null }` nu em `apps/api/src/routes/audits.ts:373` — tabela partida lê-se como "ainda não começou". Degradação silenciosa.
- Divergência doc × implementação: `packages/llm/src/scoring.ts:220` diz "accepted rows", mas o denominador SQL inclui todas as não-`rejected`, incluindo `proposed`.

### Migração necessária
Separar dois números, não corrigir um: **Activity %** (o que o cliente diz que fez — o número atual) e **Verified execution %** (o que o audit seguinte confirmou, usando o carimbo que já existe em `visibility-loop.ts:380`). Migração de schema **SIM**: o carimbo hoje existe só em texto de evidência e não é consultável; é preciso uma coluna booleana ou um estado adicional. Isto também é o pré-requisito para os estados que o relatório pede (`Proposed → … → Verified`, `RELATORIO:270`–`:277`).

### Teste existente / faltante
Existente: `tests/unit/visibility-loop.test.ts` cobre o caminho verificado. **Faltante:** teste de `deriveExecutionProgress` (nenhum encontrado); teste de que o checkbox não move o número verificado; teste de que erro de BD não devolve `null` silenciosamente.

### Risco e rollback
MÉDIO-ALTO **comercialmente**: o número verificado será muito mais baixo que o atual (o relatório viu 100; o verificado partiria perto de 0) e clientes vão notar a queda. Exige decisão do founder sobre comunicação — está na lista final. Tecnicamente BAIXO. **Rollback:** manter as duas colunas e reverter a que a UI lê; nenhum dado se perde.

---

## 3. As cinco ações genéricas e os prompts SaaS por defeito

### 3a. As cinco ações genéricas — enchimento deliberado
- Gerador: `packages/llm/src/strategy-generator.ts:79` (`generateStrategy`), puro e determinístico, com **um único chamador**: `apps/api/src/routes/audits.ts:1797` (o botão manual legado).
- Recomendações com evidência são empilhadas em `:87`, `:100`, `:114`, `:139`, `:150`, `:167`, `:181`, `:196`, `:206`, `:223`.
- **O array genérico chapado** está em `packages/llm/src/strategy-generator.ts:236`–`:255`, com o comentário em `:234` a admiti-lo:
```
// Always ensure at least 5 recommendations (AC-C3-1) — add evergreen GEO plays.
// Evergreen cards have no evidence/metric — they are truly generic.
```
As três entradas, verbatim do código: *"Audit name, logo, description, and website URL across all public profiles for exact consistency"* (`:239`), *"Publish or refresh one citation-worthy article per week"* (`:246`), *"Enable weekly monitoring in Ozvor AI Visibility"* (`:253`). **Batem com três das cinco que o relatório listou** (`RELATORIO:78`–`:82`). O enchimento está em `:257`:
```js
for (const e of evergreen) { if (recs.length >= 5) break; recs.push(e); }
```
Uma marca com poucos gaps detetados acaba com a lista enchida até 5. A quota de 5 tem até um identificador de critério de aceite no comentário (`AC-C3-1`) — foi um requisito, não um acidente.
- **O gerador novo não enche.** `packages/llm/src/visibility-loop.ts` constrói apenas candidatos com evidência (`:180`, `:204`, `:245`, `:401`, `:433`) e limita a 12 cards abertas (`LOOP_OPEN_CAP`, `:63`, imposto em `:425`).

**Defeito.** O caminho de enchimento continua a existir e continua acessível pelo botão legado (`audits.ts:1797`). Dois geradores com filosofias opostas — um enche com genérico para bater uma quota, o outro recusa-se a inventar — escrevem para a **mesma tabela**, e nem a UI nem o cálculo de Execution os distinguem.

### 3b. Os prompts por defeito
- Fonte única: `packages/llm/src/prompt-portfolio.ts:47`–`:62` (`buildIntentPortfolio(brandName, category)`), 10 prompts. O que o founder identificou está em `:51`:
```js
{ text: `What is the best ${cat} for small businesses?`, intentId: "local_best", formulationIx: 0 },
```
E `:49` faz `category` vazia cair para o literal `"solution"`.
- **Estes prompts NÃO são seedados na base de dados.** São computados em tempo de leitura — `apps/api/src/routes/prompts.ts:11` di-lo: *"same buildPromptPortfolio() logic as the audit worker — no DB row, no deletion."* Wrapper em `:37`, devolvidos em `:107` como `{ defaults, custom }`.
- O único INSERT na tabela de prompts é para prompts custom do utilizador: `apps/api/src/routes/prompts.ts:181`.
- Consumo no worker: `apps/worker/src/jobs/audit-run.ts:376`, com custom anexados em `:378`–`:407`.
- **NÃO ENCONTRADO:** qualquer seeding de prompts no onboarding ou na criação de marca, qualquer `DEFAULT_PROMPTS`/`PROMPT_TEMPLATES`/`seedPrompts`, e qualquer geração de prompts por LLM no onboarding. As ocorrências de "seed" que aparecem são de outro domínio (`apps/api/src/lib/ai-audit/seed-catalog.ts:24`, `apps/api/src/lib/graph-runner.ts:76`).

**Defeito.** O portfólio por defeito é uma função da **categoria em texto livre da marca**, e essa categoria não é validada nem sugerida em lado nenhum. Um workspace com categoria vazia recebe literalmente *"What is the best solution for small businesses?"*. Nada é específico da categoria real, do mercado ou do ICP — é isto que produz o "best SaaS for SMBs" no workspace da própria Ozvor, e confirma a hipótese 1 do relatório (`RELATORIO:167`).

### Migração necessária
Nenhuma de schema (os defaults nem sequer são linhas). Duas peças: (a) derivar prompts do que o audit realmente mediu — quem foi citado, com que queries, em que domínios — em vez de um template de categoria; (b) no onboarding, propor os prompts e exigir confirmação humana antes do primeiro audit, para a categoria nunca ficar vazia. Decidir também o destino do enchimento em `strategy-generator.ts:236`. As coortes 60/20/20 que o relatório propõe (`RELATORIO:179`–`:183`) exigem schema novo por prompt (intenção, mercado, idioma, demanda, fonte, versão) — é trabalho de P0-06, maior do que este documento cobre.

### Teste existente / faltante
Existente: `tests/unit/llm/prompt-portfolio.test.ts` (4 testes, passam). **Faltante:** teste de que categoria vazia não produz prompt genérico entregável; teste de que o gerador de estratégia não enche com evergreen quando há evidência suficiente.

### Risco e rollback
BAIXO tecnicamente. **ALTO em metodologia**: mudar os prompts por defeito muda os scores de todas as marcas — é uma alteração de metodologia, tem de bumpar `GEO_METHODOLOGY_VERSION` (`packages/llm/src/sampling.ts:54`) e cai na secção 7. **Rollback:** os defaults são função pura; reverter repõe o comportamento exato, mas os scores medidos no intervalo ficam não-comparáveis para sempre.

---

## 4. BYOK para gerar conteúdo — existe caminho hospedado?

**Onde vive.** Há **dois sistemas de chave**, e confundi-los é a origem de metade da confusão:

| Sistema | Tabela | Dono | Uso |
|---|---|---|---|
| Chaves de plataforma | `platform_provider_key` | founder/super_admin | rotaciona `ANTHROPIC_API_KEY` etc. para `process.env` |
| **BYOK do cliente** | `provider_keys` | tenant | **só** geração de conteúdo |

- CRUD do BYOK: `apps/api/src/routes/system.ts:59` (GET, presença apenas), `:74` (POST, AES-256-GCM), `:112` (DELETE). Providers aceites em `:52`.
- Único ponto de decifra: `apps/api/src/routes/system.ts:28` (`resolveProviderKey`), com **um único chamador em todo o repo**: `apps/api/src/routes/audits.ts:2134`.
- UI: `apps/web/src/app/account/integrations/page.tsx:129`, `apps/web/src/app/dashboard-v3/page.tsx:1970`, `:2199`, `:2206`.
- Rotação de chaves de plataforma (adjacente): `packages/shared/src/platform-keys.ts:21`, `:90`, `:162`.

**O que faz hoje.** `POST /api/brands/:id/content` (`apps/api/src/routes/audits.ts:2008`) exige chave do cliente. O guard está em `packages/llm/src/content-studio.ts:516`:
```ts
const apiKey = opts?.apiKey;
// No client key for the chosen provider → graceful, provider-specific error.
if (!apiKey) { ... generatedBy: "error", keyUsed: "none",
```
A rota converte em **HTTP 402** (`apps/api/src/routes/audits.ts:2168`) com *"Content generation needs an AI key. Add one in Account → AI engines & keys."* Nada é persistido. O modelo é intencional e está escrito (`audits.ts:2125`): *"BYOK cost model: content generation runs on the CLIENT's own key … no platform fallback."*

**Existe caminho hospedado?** Existe para outros produtos, nunca para o Content Studio:
- Kit $29 usa chave de plataforma: `packages/llm/src/kit-deliverable.ts:266`, `:274`.
- Landing pages é financiada pela plataforma e **proibida** de consultar BYOK: `apps/worker/src/jobs/landing-generate.ts:27`, `:279`, `:302`; sem chave em produção o job falha duro (`:382`).
- Audits/probes rodam em chave de plataforma (`apps/worker/src/jobs/audit-run.ts:582`).

**O defeito.**
1. **Não há caminho hospedado para conteúdo.** Um Growth/Agency pagante sem chave própria não consegue gerar o conteúdo que comprou. O 402 é honesto, mas é uma parede — e o relatório está certo ao chamar-lhe fricção incompatível com "we do the work" (`RELATORIO:123`).
2. **Não há gate de créditos no caminho BYOK.** `grep` por `consumeCredit|credits_remaining|INSUFFICIENT_CREDITS|hasCredits|creditGate` em `apps/api/src`, `apps/worker/src`, `packages` → **zero ocorrências**.
3. **Documentação contradiz o código, em duas direções opostas:** `docs/CLIENT-JOURNEY-AND-OPERATIONS.md:26` diz que a chave *"nunca é decifrada nem usada"* (falso, `audits.ts:2134`); `docs/COST-MODEL.md:11` diz que o conteúdo *"cai para a sua chave caso contrário"* (falso, não há fallback).

**Migração necessária.** Caminho hospedado com medidor: (a) resolver a chave em cascata `cliente → plataforma` quando o plano incluir conteúdo hospedado; (b) debitar `credit_ledger` no caminho hospedado — o ledger já existe e é idempotente (`apps/api/src/lib/credits.ts:172`, `ON CONFLICT (tenant_id, ref_type, ref_id)`); (c) manter BYOK como opção de custo-zero. **Sem migração de schema.** É o P0-08 do relatório.

**Teste existente / faltante.** Existente: `tests/unit/llm/content-studio-gemini-model.test.ts` (1 teste). **Faltante:** teste do caminho hospedado; teste de que o débito acontece exatamente uma vez; teste de que BYOK continua a não debitar. O relatório pede isto explicitamente (`RELATORIO:734`).

**Risco.** ALTO em custo: abrir hospedado sem medidor transfere custo de LLM para nós sem teto — e o histórico de custos do projeto já mostra Agency com margem negativa. **Rollback:** flag que desliga a cascata e volta ao 402; uma condição, sem estado persistido a reverter.

---

## 5. Opportunity Radar — feature gate e fonte de dados

**Onde vive.**
- Rota: `apps/api/src/routes/signals.ts:62` — `GET /api/signals/where-to-show-up`.
- Normalizador puro: `apps/api/src/lib/signals/where-to-show-up.ts:120`, ordenação `:108`, cap `:151`.
- Cliente HTTP do serviço externo: `packages/llm/src/signal-engine.ts:67`, chamada `GET /me/opportunities` em `:99`.
- UI: `apps/web/src/app/dashboard-v3/WhereToShowUpTab.tsx` (fetch `:78`, estado vazio `:197`, texto *"Your opportunity radar isn't switched on yet"* `:201`); montado em `apps/web/src/app/dashboard-v3/page.tsx:915`, navegação `:783`.

**Feature gate: NÃO EXISTE.** Sem verificação de plano, entitlement ou flag.
- A rota tem apenas `requireAuth` + rate limit (`apps/api/src/routes/signals.ts:62`, `:70`).
- A aba é renderizada incondicionalmente (`apps/web/src/app/dashboard-v3/page.tsx:783`; o mapa de migração em `:188` define `whereToShowUp: true` chapado).

O gate *de facto* é ambiente, `apps/api/src/routes/signals.ts:78`:
```ts
const url = process.env["SIGNAL_ENGINE_URL"]?.trim() ?? "";
const apiKey = process.env["SIGNAL_ENGINE_API_KEY"]?.trim() ?? "";
if (!url || !apiKey) { ... reason: "not_configured" ... }   // HTTP 200
```

**Fonte de dados: real, ligada a nada.** Não há branch de dados falsos — o código é honesto. Mas: `SIGNAL_ENGINE_*` não aparece em `.env.example` (0 ocorrências), nem em `docker-compose.yml`, nem em `.github/`; o serviço de provisionamento que a doc especifica (`apps/api/src/lib/signals/provisioning.ts`, per `docs/signal-engine-collectors-and-provisioning.md:33`) **não existe** — a pasta contém apenas `where-to-show-up.ts`; e `docs/company/STATE.md:56` confirma ("GATED, envs built, off").

**Defeito.** A aba aparece a **todos** os utilizadores, incluindo Free, e devolve sempre o estado vazio. O relatório diz "feature vazia não pode permanecer na navegação de um plano Agency" (`RELATORIO:138`) — o código mostra que está pior: está na navegação de *todos* os planos, e não existe mecanismo para a esconder por plano. Nota adicional: `signals.ts:64` aceita `brandId` mas ele é **puramente cosmético** — não há mapeamento por marca.

**Migração necessária.** Nenhuma de schema. Duas decisões de produto (lista final): esconder até haver fonte, ou manter como teaser com gate. Se com gate, é preciso **criar** a verificação de tier na rota e na renderização — ela não existe hoje.

**Teste existente / faltante.** Existente: `tests/unit/llm/reddit-signal.test.ts` (6), `tests/unit/llm/offsite-signal.test.ts` (3) — cobrem normalização. **Faltante:** teste de que a aba não aparece sem entitlement (não pode existir hoje).

**Risco.** BAIXO tecnicamente, MÉDIO comercialmente. **Rollback:** trivial, é uma condição de renderização.

---

## 6. System Health — quem decide verde/amarelo/vermelho

Há **três superfícies de saúde independentes**, com semânticas diferentes. Isso por si só é o defeito: "está verde" não tem significado único.

### 6a. `/healthz` — infra, sondas REAIS, binário
`apps/api/src/index.ts:240`:
```ts
try { await sql`SELECT 1`; checks["postgres"] = "ok"; } catch { checks["postgres"] = "error"; }
try { await redis.ping();  checks["redis"]    = "ok"; } catch { checks["redis"]    = "error"; }
const allOk = Object.values(checks).every((v) => v === "ok");
```
Sem amarelo. Proxy web fail-closed em `apps/web/src/app/healthz/route.ts:54`, timeout 4000ms em `:33`.

### 6b. `/api/v1/agent-org/liveness` — real, mas só reporta
`apps/api/src/routes/liveness.ts:36`, público, **fail-open** (`:41`, `:76`). O limiar não vive aqui por decisão explícita (`liveness.ts:14`: *"this route only REPORTS … the vigia is the one who decides to scream"*). Limiares reais do alarme: `apps/worker/src/jobs/graph-tick.ts:99` (`STARVED_RUN_HOURS = 24`), `:115` (`STARVATION_ALARM_HOURS = 2`).

### 6c. Aba admin "System Health" — 2 sondas reais, o resto é presença de env
`apps/api/src/routes/admin.ts:857`.
- Postgres: sonda real, `:859`. Redis: sonda real com timeout 2s, `:921`.
- **Motores de IA: NÃO é sonda.** `admin.ts:866`:
```ts
const anthropicLive  = present("ANTHROPIC_API_KEY") || present("AWS_ACCESS_KEY_ID");
const openaiLive     = present("OPENAI_API_KEY");
```
`present()` (`apps/api/src/routes/system.ts:47`) é apenas "a env var não está vazia".
- Modo live/demo: `admin.ts:904` — `mode = anyAiLive ? "live" : "demo"`.

Cor na UI (`apps/web/src/app/admin/page.tsx`): `:887` `isLive = health.mode === "live"` → verde vs âmbar (`:904`); motores `:1022` verde/vermelho com rótulo `LIVE`/`MOCK`; infra `:1083`:
```ts
const ok = ["ok", "connected", "up"].includes(status.toLowerCase());
```
→ `"not_configured"` pinta **vermelho**, igual a `"down"`.

**O defeito central.** Uma chave revogada, expirada ou sem crédito continua a mostrar **verde / LIVE**, porque ninguém pinga o provider. O único amarelo existente significa "modo demo", não "degradado". O cliente vê ainda menos: `apps/web/src/app/account/system-status/page.tsx:142` decide o badge só por `cap.mode === "live"`. Confirma R7 do relatório e explica por que o painel esteve verde durante os incidentes de entrega.

### 6d. A exceção que funciona: engine drift
`packages/llm/src/drift-control.ts:206`:
```ts
export const DRIFT_THRESHOLDS = {
  positiveDegradedBelow: 0.75, positiveFailingBelow: 0.5,
  negativeDegradedAbove: 0.1,  negativeFailingAbove: 0.25,
} as const;
```
Decisão em `:550`–`:625`; controles negativos são **advisory only** (`:607`) por causa de um incidente real documentado em `:592`. Tipo em `:294`. **É o modelo a copiar** para o Delivery Health que o relatório pede (`RELATORIO:142`–`:153`, P0-09).

**Migração necessária.** Substituir presença-de-env por sonda real por motor (chamada barata, cache curto) e unificar as três superfícies num estado de 3 níveis com o vocabulário do drift-control. Sem migração de schema para isto; os SLOs de entrega que o relatório pede (`RELATORIO:617`–`:630`) exigem tabelas novas e são trabalho maior.

**Teste existente / faltante.** Existente: `tests/smoke/api-boot-smoke.test.ts` (3). **Faltante:** teste de que chave inválida produz vermelho/amarelo — hoje impossível, o código não sabe distinguir.

**Risco.** MÉDIO: sondas reais custam chamadas e latência no painel. **Rollback:** manter a coluna de presença-de-env ao lado da sonda e voltar a ela por flag.

---

## 7. `methodology_version`, `providers_used` e comparabilidade do score

**Correção à premissa da encomenda:** o código **já sinaliza** quando os motores mudam entre runs. O que não existe é o sinal para mudança de metodologia.

### 7a. `methodology_version`
- Definida em `packages/llm/src/sampling.ts:54` — `export const GEO_METHODOLOGY_VERSION = "2.1";`. O cabeçalho (`:36`) já diz: *"Rates from 2.0 and 2.1 are NOT comparable (2.1 is strictly stricter)"* — o que é a explicação mais provável para a queda 71→48 do relatório, mas **NÃO VERIFIQUEI** contra as linhas reais.
- Existe uma **segunda constante independente**: `packages/llm/src/extraction.ts:131` — `EXTRACTION_METHODOLOGY_VERSION = "1.0"`. O comentário em `:127` diz "bumped with GEO_METHODOLOGY_VERSION", mas **nada o impõe** — são dois literais soltos.
- Migrações: `packages/db/migrations/20260728000001_intent_sampling.up.sql:49` e `:52` (default `'1.0'`); `20260729000001_engine_drift_check.up.sql:64`.
- **Não existe coluna `methodology_version` em `geo_score`** — chega à UI só dentro do blob JSONB `provider_breakdown`.
- Escrita: `apps/worker/src/jobs/audit-run.ts:1355`, num **UPDATE separado, depois** do de conclusão (`:1343`). Uma falha entre os dois deixa um audit `complete` carimbado com o default `'1.0'`. Também `:1226` (blob, chave camelCase, a que a UI lê) e `:929` (por probe).
- Leitura: `apps/api/src/routes/audits.ts:1483`; UI em `apps/web/src/app/brands/[id]/page.tsx:564` e `apps/web/src/app/dashboard-v3/page.tsx:1069`.

### 7b. `providers_used`
- Coluna: `packages/db/migrations/20260530000001_geo_audit_engine.up.sql:148`.
- Cálculo: `apps/worker/src/jobs/audit-run.ts:717` — derivado de **quem respondeu**, não de quem foi perguntado.
- Escrita: `:1349` (coluna) e `:1182` (blob).
- Leitura: contagem em `apps/web/src/app/brands/[id]/page.tsx:528`; **diff entre runs** em `apps/api/src/lib/audit-diff.ts:179`–`:196`; aviso renderizado em `apps/web/src/app/brands/[id]/page.tsx:4370` — *"Engines measured changed between these audits … reflect coverage, not performance."*

### 7c. Os motores variam entre runs? Sim — por três vias
1. Provider que lança exceção é **removido** de `responses`: `packages/llm/src/providers/gateway.ts:309`–`:334`.
2. Falha parcial dentro de um provider **encolhe o denominador em silêncio**: `gateway.ts:277` (se a 1ª run falha propaga; se uma posterior falha mantém o agregado parcial); `mentionRate = mentions / okRuns` em `:285`.
3. Routing por região e pausa por drift removem providers antes do probe: `packages/llm/src/sampling.ts:198`, `apps/worker/src/jobs/audit-run.ts:526`.

**Mas o guard de agregado funciona** — `audit-run.ts:203` (`MIN_ENGINE_COVERAGE = 0.5`), `computeEngineCoverage` em `:246`, painel congelado **antes** da pausa por drift em `:516`, e o portão em `:679`:
```ts
if (result.responses.length === 0 || cov.ratio < MIN_ENGINE_COVERAGE) {
  logger.warn("audit_insufficient_engine_coverage", { ... });
  await sql`UPDATE geo_audit SET status = 'failed', error_message = ...`;
  throw new Error("insufficient_engine_coverage");
}
```
O comentário em `:651` documenta o incidente de **2026-07-29** — a mesma data das duas auditorias divergentes (24 e 41) que o relatório observou. Isso liga R9 a uma causa nomeada.

### 7d. O defeito que resta
- **Comparabilidade de metodologia entre runs: NÃO EXISTE.** `AuditSnapshot` (`apps/api/src/lib/audit-diff.ts:30`) tem `providersUsed` mas nenhum campo de metodologia; `compareAudits` nunca lê um.
- A única superfície é a legenda de audit único, e é um literal `startsWith("2.1")` chapado (`apps/web/src/app/brands/[id]/page.tsx:573`, `apps/web/src/app/dashboard-v3/page.tsx:1071`). **Um bump para 2.2 apaga a legenda em silêncio** — o pior comportamento possível para um aviso de comparabilidade.
- A linha de tendência do score não é filtrada nem anotada por `methodology_version` em lado nenhum. É exatamente o badge *Comparable / Method changed / Prompt set changed / Engine changed* que o relatório exige (`RELATORIO:213`).
- Duas constantes de versão sem ligação mecânica (`sampling.ts:54` vs `extraction.ts:131`).
- Carimbo de metodologia em UPDATE separado do de conclusão (`audit-run.ts:1343` vs `:1355`).

**Migração necessária.** (a) `methodology_version` no `AuditSnapshot` e no diff, com aviso análogo ao de providers; (b) substituir o `startsWith("2.1")` por comparação real contra o run anterior; (c) anotar/quebrar a linha de tendência quando a versão muda; (d) fundir o carimbo no mesmo UPDATE da conclusão; (e) derivar `EXTRACTION_METHODOLOGY_VERSION` de `GEO_METHODOLOGY_VERSION`, ou teste que falhe quando divergirem. Schema **opcional** (coluna em `geo_score`); (a)–(e) não a exigem.

**Teste existente / faltante.** Existente: `tests/unit/output-hash.test.ts` (7), `tests/unit/llm/prompt-portfolio.test.ts` (4) — nenhum cobre comparabilidade. **Faltante:** teste de que o diff sinaliza mudança de metodologia; teste que falha se as duas constantes divergirem; teste do bump 2.2 (a legenda tem de continuar a aparecer). O relatório pede o primeiro em `RELATORIO:733`.

**Risco.** BAIXO (aditivo, não altera scores). **Rollback:** reverter o commit.

---

## 8. Overflow mobile — o elemento que força largura mínima

### Enquadramento que muda a abordagem
**Este código não usa Tailwind.** Zero ocorrências de `min-w-[...]`, `w-[NNNpx]`, `min-w-max` em `apps/web/src`. O estilo é `apps/web/src/styles/tokens.css` (folha global única) + objetos de estilo inline + blocos `<style>` injetados por página. Qualquer plano formulado como "remover uma classe Tailwind" não se aplica.

Segundo: `/dashboard` não é uma página — `apps/web/src/app/dashboard/page.tsx:16` é `redirect("/dashboard-v3")`. O dashboard real é o v3, que **não partilha layout** com as três páginas de marketing.

### Não existe largura mínima literal partilhada (verificado)
Executei: `grep -rn "600px|610px|620px|630px|631|640px|min-width: 6|minWidth: 6"` em `apps/web/src/styles/tokens.css`, `apps/web/src/components/CookieConsent.tsx`, `apps/web/src/components/ChatWidget.tsx`, `apps/web/src/app/layout.tsx`. **Todas as ocorrências de 640px são media queries**, nenhuma é uma largura imposta. Não há `box-sizing: border-box` global nem `overflow-x: hidden` global em lado nenhum — confirmado nesses mesmos ficheiros.

Conclusão: **o 631px não vem de um literal. É uma largura mínima intrínseca (min-content), e por isso depende dos dados renderizados** — o que explica um número tão preciso e não redondo.

### Candidatos, por probabilidade

**C1 — tabela de resultados do `/test`, sem `overflow-x` (melhor candidato para um 631 específico).**
- `apps/web/src/app/(marketing)/test/InvisibilityTestClient.tsx:490` — `<table className="ti-test-engine-table">`, embrulhada apenas por um `<div>` nu em `:487`.
- `:146`–`:152` — `.ti-test-engine-table { display: table; width: 100%; }`, **sem `table-layout: fixed`**.
- Escondida abaixo de 640px em `:156`, portanto só morde a partir de 641px.
- É **a única tabela das quatro páginas-alvo sem wrapper `overflow-x: auto`** — todas as outras têm (`pricing/page.tsx:71`, `vs/[competitor]/page.tsx:59`, `legal/cookies/page.tsx:96`). Cinco colunas, a última com domínios de concorrentes: dados do utilizador, sem `word-break`. Tabela auto-layout não encolhe abaixo do min-content → o piso é data-dependente.

**C2 — navbar de marketing, itens flex que não encolhem (partilhada por `/`, `/pricing`, `/test`).**
- `apps/web/src/app/(marketing)/layout.tsx:495`–`:508` — `<nav>` flex cujos dois filhos têm `flexShrink: 0` (`:517` e `:580`); `.mk-cta-primary` tem `white-space: nowrap` em `:249`.
- As mitigações só disparam a ≤480px (`:400`) e ≤700px (`:398`), deixando a banda **481–700px** com wordmark, rótulo completo do CTA, "Log in" e theme toggle todos rígidos ao mesmo tempo.
- Os comentários `#kit-overflow` em `:257` e `:396` confirmam que esta navbar já causou exatamente esta classe de bug.
- É o **candidato partilhado mais forte** entre as três páginas de marketing, e importa porque o conteúdo próprio delas já está defendido: `.film { overflow-x: clip }` em `apps/web/src/components/film/filmStyles.ts:75`, e a tabela de 720px do pricing é trocada por cards abaixo de 719px (`pricing/page.tsx:83`).

**C3 — `dashboard-v3`, shell sem uma única media query (causa separada).**
- `apps/web/src/app/dashboard-v3/page.tsx:2426` — `gridTemplateColumns: "clamp(200px, 18vw, 240px) 1fr"`. A 375px, `18vw` = 67,5px, elevado pelo clamp a **200px** fixos, deixando ~175px de conteúdo.
- `grep -n "@media"` em `dashboard-v3/page.tsx` devolve **nada**, e não há `matchMedia`/`innerWidth`/`isMobile` em nenhum ficheiro v3. O shell não tem forma mobile.
- `apps/web/src/app/dashboard-v3/PrimeTab.tsx:137` — `gridTemplateColumns: "1.3fr 1fr"` sem `minmax(0, …)`; `fr` carrega mínimo auto e não colapsa.
- Pisos internos: `page.tsx:2482` (`minmax(300px, 1fr)`), `:2478` (`minmax(220px, 1fr)`), `:2488` (`"150px 1fr 42px"`), `:2447` (`minWidth: 150`).
- **Ressalva não verificada:** o shell usa `height: 100dvh` + `overflow: hidden`, e `main` (`:2437`) tem `overflowY: "auto"` — o que faz `overflow-x` computar como `auto` e zera o mínimo automático do grid item. Estaticamente, isso sugere que o v3 rola **internamente** em vez de gerar scroll de documento. Ou seja: é quase de certeza um bug mobile grave, mas possivelmente **não é a mesma medição** que o founder tirou. **NÃO VERIFIQUEI em runtime.**

**C4 — resets globais em falta (amplificador, não a causa do 631).** Sem `box-sizing: border-box` global, todo elemento é `content-box`: qualquer `width: 100%` com padding horizontal transborda o pai pelo padding. Exemplo vivo: `apps/web/src/components/film/filmStyles.ts:441`–`:450`, `.film-form input { width: 100%; padding: 14px 15px }` transborda 30px.

### Descartados (com razão)
- `apps/web/src/app/(marketing)/pricing/page.tsx:72` — `.pr-table { min-width: 720px }` parece o culpado óbvio, mas `:83`–`:87` esconde a tabela abaixo de 719px e mostra cards.
- `CookieConsent.tsx:761` e `ChatWidget.tsx:84` — ambos `position: fixed`, que não contribui para o `scrollWidth` do documento. São os únicos componentes verdadeiramente partilhados pelas quatro páginas, e por isso **não podem ser o mecanismo** — o que reforça que o 631 tem causas diferentes por página, não uma só.
- `apps/web/src/styles/tokens.css:258` — `grid-template-columns: 292px minmax(0, 1fr)` está dentro de `@media (min-width: 960px)`.

### Defeito, migração, teste, risco
**Defeito:** ausência de defesa sistémica (sem reset global, sem teste de overflow em CI), o que faz cada página falhar à sua maneira. **Migração:** nenhuma de schema; (a) `box-sizing: border-box` global, (b) wrapper `overflow-x: auto` na tabela do `/test`, (c) permitir encolhimento na navbar entre 481–700px, (d) dar forma mobile ao shell do v3. **Teste faltante:** o teste de aceitação que o relatório pede (`RELATORIO:755`–`:756`) — sem overflow horizontal a 320/375/390/768/1024/1440px, em CI. Não existe nenhum hoje. **Risco:** um `box-sizing` global mexe em todo o layout do site e pode ter regressões visuais em massa — deve ir sozinho, num PR próprio, com screenshots antes/depois. **Rollback:** por commit isolado.

**Antes de qualquer correção:** medir em runtime, a 390px, comparando o `scrollWidth` de cada elemento contra `document.documentElement.clientWidth`, página a página. Isso distingue C1 de C2 numa passagem e diz se o v3 rola no documento ou internamente. **Não fiz esta medição.**

---

## 9. Filas e jobs: retries, dead-letter, observabilidade

**Implementação.** BullMQ sobre ioredis. A convenção de conexão (`maxRetriesPerRequest: null`) está **duplicada em quatro sítios**: `apps/worker/src/index.ts:54`, `apps/api/src/routes/audits.ts:294`, `apps/api/src/routes/landing.ts:349`, `apps/api/src/routes/schedules.ts:55`.

**Registo dos workers:** `apps/worker/src/index.ts` — 21 workers, entre eles `publish` (`:71`, conc. 5), `geo-audit` (`:134`, conc. 3, `autorun:false`), `geo-drift` (`:188`), `landing-generate` (`:775`, conc. 5), `monitor-reconcile` (`:886`). Os dependentes de chaves só arrancam depois do primeiro refresh (`:150`, `:681`).

### 9a. Audit
- Fila `geo-audit`; jobs `"run-audit"` e `"scheduled-audit"`. Enfileirados em `apps/api/src/routes/audits.ts:1202` (manual), `:1278` (semanal repetível), `apps/worker/src/jobs/audit-run.ts:1775` (varrimento diário).
- Retries — `apps/api/src/routes/audits.ts:301`:
```ts
defaultJobOptions: {
  attempts: 3,
  backoff: { type: "exponential", delay: 30_000 },
  removeOnComplete: { count: 1000 },
  removeOnFail: { count: 5000 },
}
```
- **D9.1 — duas políticas de retry na mesma fila.** O cliente do worker (`apps/worker/src/jobs/audit-run.ts:1742`) é `new Queue("geo-audit", { connection: redis })` **sem `defaultJobOptions`**: os audits do monitor diário correm com o default do BullMQ (`attempts: 1`, sem backoff). O audit agendado — o que o cliente nunca vê falhar — é o que tem menos retries. **HIPÓTESE A CONFIRMAR:** é candidato forte a explicar as três auditorias incompletas de 17/08 (R10).
- Idempotência: `{ jobId: auditId }` (`audits.ts:1205`); semanal `jobId: monitor:${brandId}` (`:1282`); **diário deliberadamente não deduplicado** — `daily-monitor:${brand.id}:${Date.now()}` (`audit-run.ts:1777`).
- **D9.2 — audits presos em `running` para sempre (ACHADO NOVO).** Não há `catch` de topo à volta do corpo de `runWithTenant` (`audit-run.ts:332`–`1751`); um throw inesperado depois de `status='running'` (`:346`) deixa a linha em `running` após esgotar tentativas. **Não existe reaper.** É o segundo candidato para R10.
- **D9.3 — retry duplica o histórico do score (ACHADO NOVO).** O INSERT em `geo_score` (`audit-run.ts:1334`) **não tem `ON CONFLICT` em `audit_id`**; um retry insere uma segunda linha na série temporal. **HIPÓTESE A CONFIRMAR:** pode explicar parte da instabilidade que o relatório vê na linha 71→48, e as duas auditorias do mesmo dia 29/07 (R9) — mas o mecanismo de R9 já tem explicação melhor em 7c.

### 9b. Geração de conteúdo (landing)
- Fila `landing-generate`, job `"generate"`; enfileirado em `apps/api/src/routes/landing.ts:1240`.
- Retries — `:356`: `attempts: 3`, backoff exponencial 30s, `removeOnFail: { count: 2000 }`.
- **É a melhor idempotência do repo:** `jobId` estável (`:1149`), verificação de in-flight com 409 `GENERATE_ALREADY_RUNNING` (`:1155`), remoção de job settled (`:1171`) e **reembolso de quota** se o enqueue falhar (`:1246`). É o padrão a copiar para as outras filas.

### 9c. E-mail / nurture — não é fila nenhuma
`apps/worker/src/index.ts:812` — um `setInterval` com polling à BD de 5 em 5 minutos:
```ts
const nurtureInterval = setInterval(() => {
  void processNurtureJobs(getNurtureSql()).catch(...)
}, NURTURE_POLL_INTERVAL_MS);
```
Retry **implícito e ilimitado**: um erro não avança o cursor e o poll seguinte tenta outra vez, para sempre (`apps/worker/src/jobs/nurture-send.ts:16`). Sem contador de tentativas, sem backoff, sem desistência. Idempotência via `nurture_send_log` (`:159`, skip em `:309`).

### 9d. Publish — o caminho mais completo, e com um bug
- Fila `publish`; retries em `apps/api/src/routes/schedules.ts:66`: `attempts: 5`, backoff exponencial 60s.
- **D9.4 — falha permanente marca o job como concluído (ACHADO NOVO).** Falha permanente escreve `status='failed'` + `audit_log` (`apps/worker/src/jobs/publish.ts:546`) e **retorna sem rethrow** (`:585`). O comentário adjacente diz *"BullMQ will mark as failed"* — está errado: retornar normalmente marca o job **completed**. Qualquer métrica de falha de publish está corrompida por construção.

### 9e. Score
Sem fila nem job próprio — `computeGeoScore` corre inline dentro do processador `geo-audit` (`apps/worker/src/jobs/audit-run.ts:1152`). Consequência já listada em D9.3.

### 9f. Dead-letter e observabilidade
- **Dead-letter: não existe em nenhuma fila.** `removeOnFail: { count: N }` apenas retém jobs falhados em Redis; nada os drena, reprocessa ou conta.
- **Métricas:** sem Prometheus no worker — `apps/worker/src/jobs/publish.ts:56` diz que os contadores em memória (`:67`) serão substituídos "when prom-client is added". O único `/metrics` está na API, super-admin (`apps/api/src/routes/drafts.ts:1008`), e **não expõe profundidade de fila nem jobs falhados**.
- **Alerta:** Telegram existe (`apps/worker/src/jobs/graph-tick.ts:155`, usado em `:1342`, `:1917`, `:1997`, `:2045`, `:2173`) mas **nunca para falhas de fila**. Nenhum alerta em nenhum evento `*_job_failed`.
- **Visibilidade admin de jobs falhados: NÃO EXISTE.** `apps/api/src/routes/admin.ts` só faz ping de liveness ao Redis (`:918`). Nenhum `getFailed()`/`getFailedCount()`/Bull-Board em todo o repo. `GET /api/admin/agent-ops` (`admin.ts:1417`) cobre `ops.agent_run`, não BullMQ.
- **O que chega ao utilizador:** audit falhado mostra string genérica — `apps/web/src/app/brands/[id]/page.tsx:311`: *"The audit failed. Please run it again."* O `error_message` detalhado escrito em `audit-run.ts:693` ("Only N of M AI engines answered…") **nunca é renderizado** — o cliente não tem como saber que o problema foi de cobertura. Publish falhado é mostrado (`apps/web/src/app/schedule/page.tsx:505`). Landing-generate e nurture: só log.
- **D9.5 — shutdown incompleto (ACHADO INCIDENTAL).** `apps/worker/src/index.ts:983` fecha ~11 dos 21 workers antes do `process.exit(0)` em `:1046`. `graphWorker`, `brainDailyWorker`, `brainWeeklyWorker`, `incidentPostmortemWorker`, `promptTunerWorker`, `followupScanWorker`, `discoveryWorker`, `sphereStartWorker` e as filas correspondentes nunca são drenados: em SIGTERM os jobs em voo são mortos, não terminados.

**Migração necessária.** Nenhuma de schema. Por ordem de retorno: (1) `defaultJobOptions` num único módulo partilhado, consumido pelos quatro sítios — mata D9.1; (2) reaper de audits presos em `running` — D9.2; (3) `ON CONFLICT` no INSERT de `geo_score` — D9.3; (4) corrigir o rethrow em `publish.ts:585` — D9.4; (5) rota admin de jobs falhados + alerta Telegram em `*_job_failed`; (6) renderizar `error_message` do audit ao utilizador; (7) completar o `shutdown()` — D9.5.

**Teste existente / faltante.** Existente: `tests/unit/agent-ops.test.ts` (5), `tests/unit/operator-agents.test.ts` (7). **Faltante:** teste de que ambos os produtores de `geo-audit` usam a mesma política de retry; teste de que retry não duplica `geo_score`; teste de que falha permanente de publish marca o job falhado. O relatório pede o alerta em `RELATORIO:735` ("Draft failure cria retry/alerta, não silêncio").

**Risco.** (1)(3)(4) BAIXO. (2) MÉDIO — um reaper mal calibrado mata audit legítimo e lento; mitigar com margem generosa e log alto, atrás de flag. **Rollback:** cada item é um commit independente e revertível.

---

## Achados novos que o relatório não tinha

Estes saíram do código, não do relatório, e todos foram verificados:

1. **`POST /api/brands/:id/tasks` viola a CHECK constraint** (`audits.ts:1869` vs `20260531000004_strategy_plan.up.sql:48`) — a via de escape que o estado vazio sugere ao utilizador não funciona. Não verifiquei contra a base de produção.
2. **Duas políticas de retry na mesma fila `geo-audit`** (`audits.ts:301` vs `audit-run.ts:1742`) — o audit agendado tem 1 tentativa, o manual tem 3.
3. **Audits podem ficar presos em `running` para sempre** — sem catch de topo, sem reaper (`audit-run.ts:332`–`1751`).
4. **Retry de audit duplica a série temporal do score** — INSERT sem `ON CONFLICT` (`audit-run.ts:1334`).
5. **Falha permanente de publish marca o job como concluído** (`publish.ts:585`) — métrica de falhas corrompida.
6. **Opportunity Radar não tem gate nenhum** — não é "gated e desligado", é aberto a todos os planos e sem fonte.
7. **`shutdown()` do worker fecha metade dos workers** (`index.ts:983` vs 21 registados).
8. **Duas constantes de versão de metodologia sem ligação mecânica** (`sampling.ts:54` vs `extraction.ts:131`).
9. **Limite de sites com três números diferentes:** 10 imposto (`plan-limits.ts:108`), 15 anunciado em cinco sítios, 25 num comentário (`landing.ts:8`).
