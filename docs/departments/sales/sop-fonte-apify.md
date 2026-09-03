# SOP — Fonte Apify do prospect-batch (nova modalidade de prospecção)

> **TL;DR (≤200 palavras).** O prospect-batch ganhou uma segunda fonte de
> candidatos: um actor Apify da classe Google Maps scraper (default sugerido:
> `compass/crawler-google-places`) — dados REAIS com nome, site, telefone,
> categoria, rating e nº de reviews (proxies de fechabilidade), no lugar da
> sugestão de LLM que rendeu 0 e-mails em 02/09 (10.C.17). O resto do pipeline
> é IDÊNTICO: verificação de site por código → mini-GEO-probe → sequências →
> **aprovação do founder no Telegram** → CRM. A máquina continua sem enviar
> nada. **Regra de ouro: NUNCA roda sozinha.** Toda rodada custa dinheiro;
> não há cron. Só duas portas, ambas com estimativa de custo ANTES e
> `confirm` explícito: o workflow `prospect-apify.yml` (Actions →
> workflow_dispatch) e o endpoint `POST /api/v1/operator/prospect-apify`.
> O assistente **sempre pergunta ao founder antes de disparar** e mostra a
> estimativa. Orçamento mensal: `APIFY_MONTHLY_BUDGET_USD` (default $100),
> checado contra o ledger `api_spend` (op `prospect_apify`); estouro = recusa.
> Dedup automático contra `crm_contact` (e-mail e domínio). Ordem do mês:
> **2k créditos do SmartLead lead-finder PRIMEIRO; Apify só para o delta;
> Apollo fora por ora** (regra 01/09).

## 1. Quando usar

1. Início do mês: gastar primeiro os **2.000 créditos do SmartLead
   lead-finder** (só via UI do SmartLead — regra 01/09).
2. Acabaram os créditos e falta volume para a meta? → Apify para o **delta**,
   trilha **GEO primeiro** (decisão 2 de 02/09). AISTACK depois, com outros
   actors, em decisão separada.
3. **Apollo está fora por ora** — não reativar sem decisão do founder.

## 2. Como o assistente dispara (sempre perguntando antes)

O assistente NUNCA chama com `confirm` sem um "sim" do founder na conversa.
Fluxo em dois passos, ambos pelo mesmo endpoint:

**Passo 1 — estimativa (grátis, nada roda):**

```bash
curl -sS -X POST "https://api-production-2052.up.railway.app/api/v1/operator/prospect-apify" \
  -H "Authorization: Bearer $OZVOR_OPERATOR_KEY" -H "Content-Type: application/json" \
  -d '{"track":"geo","queries":["roofing contractor Fort Worth TX","hvac company Plano TX"],"maxPlaces":50}'
```

A resposta traz `estimate` (places pior caso × preço/1k, gasto do mês, teto).
O assistente mostra esses números ao founder e **pergunta**.

**Passo 2 — só após o "sim" do founder,** o mesmo corpo + `"confirm":true`:

```bash
curl -sS -X POST "https://api-production-2052.up.railway.app/api/v1/operator/prospect-apify" \
  -H "Authorization: Bearer $OZVOR_OPERATOR_KEY" -H "Content-Type: application/json" \
  -d '{"track":"geo","queries":["roofing contractor Fort Worth TX","hvac company Plano TX"],"maxPlaces":50,"confirm":true}'
```

`201 ran:true` = spec depositado (mailbox Redis, TTL 48h, um por vez) + run do
prospect-batch iniciado; o worker chama o actor **uma única vez**, registra o
gasto real em `api_spend` e o lote segue até a aprovação no Telegram.
`409` = orçamento estouraria ou já há spec pendente — nada rodou.

Alternativa pela UI: **Actions → "Prospect source Apify" → Run workflow** com
`dry_run=false` e `confirm=yes` (qualquer outra combinação = só estimativa).

## 3. Envs (o que destrava o quê)

| Env | Onde | Efeito |
|---|---|---|
| `APIFY_TOKEN` | Railway **worker** | Sem ela a fonte é INDISPONÍVEL (mensagem honesta no lote; nada silencioso) |
| `APIFY_MAPS_ACTOR` | Railway worker | Actor default (ex.: `compass/crawler-google-places`); o spec pode sobrescrever |
| `APIFY_PRICE_PER_1K_USD` | worker + api | Preço por 1k places para a estimativa (default 5) |
| `APIFY_MONTHLY_BUDGET_USD` | worker + api | Teto mensal (default 100); checado nas DUAS pontas contra `api_spend` |
| `OZVOR_OPERATOR_KEY` (secret Actions) | GitHub | Chave `ozk_` com escopos operator+business para o workflow |
| `OZVOR_API_URL` (var Actions, opcional) | GitHub | Base da api (default Railway) |

## 4. Garantias de código (não de prompt)

- **Sem cron.** As duas portas exigem ação humana; o spec é consumido no read
  (um dispatch = no máximo uma chamada paga).
- **Custo antes.** Estimativa sempre vem primeiro; `confirm` ausente = nada.
- **Orçamento nas duas pontas.** Endpoint (409) e worker (recusa honesta no
  artefato) aplicam o MESMO `decideApifyRun`; ledger ilegível = recusa
  (fail-closed em dinheiro).
- **Dedup.** Candidato com e-mail ou domínio já em `crm_contact` é pulado e
  contado (freemail nunca deduplica por domínio).
- **Fechabilidade no artefato.** FONE/RATING/reviews/categoria viajam no bloco
  `[prospects]` e na nota do `crm_contact`.
- **Portão do founder intacto.** Nada entra no CRM e nada é enviado sem a
  aprovação existente no Telegram; a máquina nunca envia outbound.

## 5. Ligado em produção?

**OFF até `APIFY_TOKEN` existir no worker** — e, mesmo com a env, nada roda
sem um dispatch confirmado. Ação nominal que destrava: founder seta
`APIFY_TOKEN` (+ `APIFY_MAPS_ACTOR`) no Railway worker e cria o secret
`OZVOR_OPERATOR_KEY` nos Actions.
