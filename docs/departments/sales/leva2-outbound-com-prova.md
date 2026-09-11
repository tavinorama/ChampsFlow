# Leva 2 do cold outreach — "outbound com prova"

> Owner: VP Sales · Criado: 2026-09-11 (regra do founder do mesmo dia)
> Kits de copy: [geo-campaign-kit.md](geo-campaign-kit.md) · [aistack-campaign-kit.md](aistack-campaign-kit.md)
> Execução no dia: [sop-dia-do-disparo.md](sop-dia-do-disparo.md)

## TL;DR

A leva 1 mandou 3.014 e-mails para ~1.021 negócios e trouxe 1 interesse real (0,1%) contra 12 STOPs. O defeito não foi a copy: foi mandar e-mail para quem não tinha sinal de que compraria, sem nada no e-mail 1 que provasse alguma coisa. A leva 2 muda três coisas, todas em código: (1) **gancho com prova** — antes do e-mail 1 cada lead recebe um mini free test sobre a pergunta do nicho/cidade dele, e o e-mail abre com quem a IA recomendou no lugar dele; sem resultado, o lead não entra; (2) **lista com sinal** — só entra quem tem presença local (Google Business Profile ou JSON-LD LocalBusiness) e sinal de marketing (conteúdo ≤12 meses, review recente ou pixel de anúncio), e hotelaria/clínica de rede ficam fora; (3) **capacidade honesta** — 4 toques em 14 dias, dias úteis, 80 leads novos/dia por campanha (não 1.000) e lista de no máximo 800 por campanha. Nada é enviado pela máquina: as campanhas nascem DRAFTED e o founder aprova.

---

## 1. O diagnóstico da leva 1 (medido, não deduzido)

Rodado em 11/09 pelo modo novo `leads-status` do `smartlead-analysis.yml`
(`gh workflow run smartlead-analysis.yml -f mode=leads-status`), paginando
`/campaigns/{id}/leads` com o offset avançando por `len(rows)`:

| Campanha | Status da campanha | Leads devolvidos pela API | COMPLETED | BLOCKED | STARTED |
|---|---|---|---|---|---|
| aistack-2026-09-08 (3888686) | COMPLETED | 418 | 411 | 7 | **0** |
| OZ-B Local services (3783525) | COMPLETED | 622 | 610 | 12 | **0** |
| OZ-A Agencies (3783524) | DRAFTED | 163 | 0 | 2 | 161 |
| OZ-C SaaS/e-com (3783526) | DRAFTED | 24 | 0 | 0 | 24 |
| Ozvor 1 (3741204) | DRAFTED | 1.400 | 0 | 12 | 1.388 |

**O vocabulário real é `STARTED` / `COMPLETED` / `BLOCKED`** — não existe
`NOT_STARTED` nem `INPROGRESS` nesta conta. E `STARTED` é exatamente o estado
"importada, ainda não começou a receber": as três campanhas DRAFTED, que nunca
enviaram nada, têm 1.573 leads em `STARTED`.

### A resposta com número — e a correção que ela força

**Nas duas campanhas que dispararam, o número de leads que "nunca começaram" é
ZERO.** Não há uma única lead em `STARTED` nelas. Todas as 1.021 devolvidas
estão `COMPLETED` (sequência inteira) e 19 estão `BLOCKED`.

Isso contradiz a premissa de que 2.016 leads ficaram sem o toque 1, e a
contradição se explica no `/campaigns/{id}/analytics` (rodado no mesmo dia):

| Campanha | `sent_count` | `total_count` |
|---|---|---|
| aistack-2026-09-08 | 1.227 | 1.227 |
| OZ-B Local services | 1.787 | 1.787 |

`total_count` **é igual a** `sent_count` em todas as campanhas — ou seja, o
campo que parecia "leads na campanha" é contador de ENVIO. 1.227 + 1.787 =
**3.014**, exatamente o número lido como "3.014 leads carregados". A conta
fecha pelo outro lado também: 1.021 leads × 3 toques = 3.063 ≈ 3.014 e-mails
(a diferença são os leads parados no meio por reply ou bounce).

**Conclusão honesta: a lista nunca teve 3.014 leads. Teve ~1.040, e todos
foram tocados.** O "2.016 sem toque 1" era um campo de API mal nomeado lido
como lead, não uma falha de envio.

Não verifiquei — e a API não permite verificar — se alguma lead foi removida
da campanha depois de importada; o endpoint só devolve as que existem hoje.
O que está provado é que ele DEVOLVE leads não tocadas quando elas existem
(as 1.573 `STARTED` das campanhas DRAFTED), então "não aparecem porque a API
esconde lead não tocada" está descartado pelos próprios dados.

### Hipótese de causa, nas três opções levantadas

- **Limite de novos leads/dia (`max_new_leads_per_day: 1000`)** — *não foi a
  causa*: 1.000 é maior que a capacidade real (~500/dia), então nunca chegou a
  ser teto. É uma configuração inútil, não um estrangulamento. Continua sendo
  um defeito de projeto: um teto acima da capacidade não protege nada.
- **Prioridade de follow-up** — *não foi a causa nesta leva*, porque não
  sobrou lead por iniciar. Mas é o risco que EXPLODE na leva 2: com 4 toques,
  cada lead consome 4 envios, e o SmartLead serve follow-up antes de lead
  nova. Numa lista maior, o follow-up come 100% do cano e o início de leads
  novas para — sem nenhum alarme, porque a campanha simplesmente vira
  `COMPLETED`. É contra isso que o teto de 80/dia existe.
- **Leads sem campo obrigatório** — *causa dos 19 `BLOCKED`* (1,8% dos 1.040),
  e nada além disso.

**O defeito real da leva 1, então, é outro:** a lista inteira queimou em 8
dias (E1 02-03/09, E2 05-06, E3 09-10), com 3 toques, sem nada atrás; e
converteu 1 interesse real em 1.021 negócios (0,1%) com 12 STOPs — 15× abaixo
do mínimo da régua. Lista errada e e-mail sem prova, não infraestrutura.

---

## 2. O que muda na configuração da leva 2

| | Leva 1 | Leva 2 |
|---|---|---|
| Toques | 3 (dias 0/3/7) | **4 (dias 0/3/7/14)** |
| Dias de envio | todos, incluindo fim de semana | **seg-sex** |
| `max_new_leads_per_day` | 1.000 (acima da capacidade) | **80 por campanha** |
| Tamanho da lista | livre | **≤ 800 por campanha** |
| Lista | qualquer site que responde | **presença local + sinal de marketing** |
| E-mail 1 | argumento genérico | **prova real do mini free test** |
| Verticais | todas | **sem hotelaria, sem clínica de rede** |

### A conta do 80/dia

```
throughput real observado na leva 1   ≈ 500 e-mails/dia
÷ 4 toques (cada lead consome 4 envios ao longo da vida)
÷ 2 campanhas simultâneas
≈ 62 leads novos/dia por campanha   ← regime permanente estrito
```

**80 é o teto, não a meta.** O regime estrito supõe que todo lead recebe os 4
toques; na prática o stop-on-reply, os bounces e o fim de semana sem envio
derrubam a carga ~20%, e 62-80 é a faixa honesta. Se o vigia de envio
(`smartlead-send-watch.yml`) apontar leads travadas em `STARTED` por mais de
48h, o teto desce para 60 — esse é o sintoma de follow-up comendo o cano.

**Lista ≤800 por campanha** sai da mesma conta: 80/dia × 10 dias úteis = 800,
que é o que faz a régua "lista 100% tocada em ≤10 dias" fechar.

---

## 3. Gancho com prova — como funciona

1. O `prospect-batch` verifica o site (200 + nome no HTML), como sempre.
2. **Filtro de sinal** (`apps/api/src/lib/prospect-signal.ts`): presença local
   E sinal de marketing, verticais excluídas fora. Reprovado = descartado com
   motivo escrito no lote.
3. **A pergunta certa** (`inferServiceAndCity`): nicho e cidade saem do próprio
   site (JSON-LD `PostalAddress`, endereço visível, `@type`, texto). Sem os
   dois, não há pergunta certa e o lead sai.
4. **O probe** (`packages/llm/src/cold-proof-probe.ts`): uma execução, mesma
   via do `/test`, `repeat=1`, pergunta
   `Who do you recommend for <serviço> in <cidade>?`. Um parser determinístico
   lê quem a IA recomendou. **US$0,03 por lead**, orçado antes de gastar.
5. **Sem prova, sem leva**: motores mudos, resposta em prosa, menos de 2
   concorrentes nomeados, ou negócio JÁ citado pela IA → lead descartado com
   motivo. Nunca um placeholder.
6. A prova vai para o dossiê: o bloco do lote traz `PERGUNTA`, `MOTOR`,
   `RECOMENDADOS NO SEU LUGAR` e a linha `VARS` com as variáveis de merge; o
   `crm_contact.note` (coluna TEXT que já existe — **zero migração**) guarda a
   mesma prova.

### Variáveis de merge para o SmartLead

O CSV de importação de cada lead precisa destas colunas, todas produzidas por
código:

| Variável | O que é |
|---|---|
| `{{ai_engine}}` | motor que respondeu (ChatGPT, Claude, Gemini, Perplexity) |
| `{{competitor_1}}` | primeiro nome que a IA recomendou |
| `{{competitor_2}}` | segundo nome |
| `{{query}}` | a pergunta feita, palavra por palavra |
| `{{report_url}}` | link do relatório dele, já percent-encoded (4º toque) |

`{{report_url}}` é montado em código (`proofReportUrl`) porque um nome de
empresa com espaço ou `&` quebraria um href montado no template do SmartLead.
Ele leva ao `/test` com marca, site e concorrente já preenchidos (o prefill
lê `b` / `d` / `c` / `cat` da query string). **Só dado público de negócio entra
na URL** — e-mail continua sendo digitado pelo lead, e o prefill não dispara
teste nenhum sozinho.

### Orçamento do probe

`COLD_PROOF_BUDGET_USD`, default **US$1,50** por lote (= 50 leads a US$0,03).
O gasto é orçado antes de chamar os motores; esgotou, o lote para de probar e
**escreve "ORCAMENTO ESGOTADO no lote" no bloco** — não degrada calado.
`COLD_PROOF_ENABLED=0` desliga a leva 2 e volta ao comportamento da leva 1 (o
bloco declara isso na cara).

---

## 4. As duas sequências (4 toques, 14 dias)

Estão em código, no `smartlead-campaign.yml` (`leva=2`), com o rodapé de
opt-out anexado a todos os toques e `%signature%` antes dele. O validador do
próprio workflow derruba o job se o e-mail 1 tiver link/domínio, se fugir da
janela de tamanho, ou se não tiver pergunta.

### `oz-local-2026-09-14` (trilha GEO/local)

| Toque | Dia | Assunto | Conteúdo |
|---|---|---|---|
| 1 | 0 | `{{ai_engine}} named someone else` | sem link: a pergunta que fiz, os dois nomes que vieram, e o dele que não veio. Uma pergunta |
| 2 | 3 | `the exact words` | o resto da resposta + free test `?from=oz-local-2026-09-14` |
| 3 | 7 | `why it happens` | por que acontece (páginas que a IA consegue ler e citar) + link |
| 4 | 14 | `your report, nothing to type` | `{{report_url}}` — o relatório dele, sem digitar nada |

### `aistack-2026-09-14` (trilha AI Stack)

| Toque | Dia | Assunto | Conteúdo |
|---|---|---|---|
| 1 | 0 | `{{ai_engine}} answered with two names` | sem link: a prova + a pergunta sobre a ferramenta que fecha o gap |
| 2 | 3 | `the one tool for {{company_name}}` | AI Stack Audit $49 `?from=aistack-2026-09-14` |
| 3 | 7 | `a hundred hours` | a conta das horas + link |
| 4 | 14 | `your report, nothing to type` | `{{report_url}}` (o free test é a parte grátis antes do audit) |

O e-mail 1 cita a pergunta entre aspas (a prova) e faz **uma** pergunta ao
lead. O rodapé é literal: *"P.S. If you'd rather not hear from me, just reply
STOP and I won't write again."* — **sem endereço postal**, mantendo a decisão
do founder de 02/09 (risco CAN-SPAM §5(a)(5) aceito e registrado no SOP).
Endereço postal continua sendo decisão do founder; o código não inventa um.

---

## 5. Onde está cada peça

| Peça | Arquivo |
|---|---|
| Probe com prova + parser + orçamento | `packages/llm/src/cold-proof-probe.ts` |
| Filtro de sinal + nicho/cidade | `apps/api/src/lib/prospect-signal.ts` |
| Dossiê (bloco, VARS, nota do CRM) | `apps/api/src/lib/prospecting.ts` |
| Integração no lote | `apps/worker/src/lib/prospect-probe.ts` |
| Prefill do relatório | `apps/web/src/app/(marketing)/test/InvisibilityTestClient.tsx` |
| Criação das campanhas (DRAFTED) | `.github/workflows/smartlead-campaign.yml` |
| Diagnóstico por status | `.github/workflows/smartlead-analysis.yml` (`mode=leads-status`) |
| Testes | `tests/unit/prospect-leva2.test.ts` |

---

*Criado 2026-09-11. Padrões: cold sem link no 1º e-mail (27/08) · copy 15-17 anos · English-first · dois ICPs separados-e-conectados (01/09) · nada degrada calado · "pronto" exige prova.*
