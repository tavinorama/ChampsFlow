# Playbook — Auditoria-de-Discovery na Prospecção (2.10)

> Owner: VP Sales · Criado: 2026-09-01 · Par de código: grafo `prospect-batch` (5.A.1)
> ICP canônico: [icp.md](icp.md) — este playbook NÃO forka o ICP, só o consome.

## TL;DR

A moção de vendas agora abre com PROVA, não com pitch. Toda quarta 07:30 UTC o
grafo `prospect-batch` entrega um lote de até 10 prospects US **verificados por
código** (site respondeu 200, nome confere no HTML), cada um com 2-3 achados do
**mini-GEO-probe** (robots.txt bloqueando GPTBot/ClaudeBot/PerplexityBot/
Google-Extended, ausência de JSON-LD, homepage magra sem JS, meta description
faltando) e uma sequência fria de 3 e-mails em inglês. **Regra dura, validada
por código: o e-mail 1 tem ZERO links** — texto puro, uma pergunta, um achado
do site do próprio prospect. Links (sempre com `?from=<campanha>`) só nos
toques 2 e 3. **A máquina não envia nada e não toca o CRM sozinha**: o founder
aprova o lote no Telegram (96h; silêncio = rejeição), e só então os contatos
com e-mail extraído do próprio site entram em `crm_contact` como `new`; o
envio é do SmartLead, carregado à mão. Antes de call marcada, o founder
escala o achado raso para a auditoria funda (`/seo audit` + `/seo geo` no
Mac) e chega à conversa com o relatório pronto. Resposta do lead volta ao CRM
pelo webhook SmartLead já em produção.

## 1. O fluxo semanal (o que acontece sozinho)

```
quarta 07:30 UTC — cron prospect-batch (worker)
  prospects   → engines (callWithFallback) SUGEREM candidatos do ICP;
                CÓDIGO verifica cada site (HTTP 200 + nome no HTML),
                roda o mini-GEO-probe e extrai e-mail do próprio site.
                Quem não prova existir é DESCARTADO e contado no artefato.
  draft       → LLM escreve 3 e-mails por prospect (inglês, regras da casa);
                validador de CÓDIGO reprova link no e-mail 1 na hora.
  critic      → lentes com veto (link, dado inventado, tom de mala direta).
  finalize    → aplica vetos; re-validado por código.
  approval    → caixa no Telegram (96h; silêncio = rejeição, lote morre).
  store-crm   → SÓ no sim: linhas em crm_contact (stage 'new', nota com
                lote + achado), parseadas do bloco de CÓDIGO, nunca do LLM.
  report      → o lote inteiro chega no Telegram, pronto para o SmartLead.
```

O que o grafo **nunca** faz: enviar e-mail, tocar o CRM sem aprovação,
inventar prospect, inventar número. Prospect sem achado verificável é
descartado (sem munição honesta, sem cold email). Prospect sem e-mail no
próprio site aparece no lote (o founder pode achar o contato à mão), mas não
ganha linha no CRM — a tabela é chaveada por e-mail.

## 2. A regra do e-mail 1 (founder, 27/08 — deliverability)

- **1º toque frio = texto puro buscando RESPOSTA. Zero URL, zero domínio,
  zero www** — nem ozvor.com, nem o site do próprio prospect por escrito.
- Uma pergunta só, citando UM achado em palavras simples:
  *"Your site tells ChatGPT's crawler to stay out. Was that on purpose?"*
- Correlação do 1º toque é pelo **e-mail do lead**: a resposta dispara o
  webhook SmartLead → `crm_contact` vira `contacted` (já em produção).
- Links entram do 2º toque em diante, **sempre** com `?from=<campanha>`
  (ex.: `https://ozvor.com/ai-audit?from=cold-2026-09-02`).
- Isso não é instrução de prompt: é `validateColdSequenceBatch` em
  `apps/api/src/lib/prospecting.ts`, aplicado pelo runner no draft E no
  finalize. Lote que viola a regra falha antes de chegar à aprovação.

## 3. Como usar os achados do mini-probe na call

Cada achado é verificável pelo prospect em menos de um minuto — esse é o
poder. Roteiro por achado:

| Achado (código) | Como abrir na call |
|---|---|
| robots.txt bloqueia GPTBot/Claude/Perplexity | "Seu site manda os robôs das IAs embora. Quem pergunta 'best roofer near me' no ChatGPT nunca vai te ver. Quer que eu mostre a linha exata?" (abrir `site.com/robots.txt` ao vivo) |
| Sem JSON-LD / LocalBusiness | "Seu site não se apresenta em formato que máquina lê. Concorrente com schema aparece com nota, telefone e horário — você aparece como texto solto." |
| Homepage magra sem JS (N palavras) | "Sem rodar JavaScript, seu site diz N palavras. É isso que a maioria dos crawlers de IA lê. Seu concorrente entrega a página inteira." |
| Sem meta description / title | "O básico que todo motor lê primeiro está vazio. É a primeira coisa que a gente arruma." |

Regra de honestidade na call: só afirmar o que o probe mediu. Nada de
"garantia de citação" — nunca, em lugar nenhum (regra da casa, icp.md).

## 4. Escalada: do probe raso à auditoria funda (antes da call)

O probe é isca; a call marcada merece o relatório de verdade. No Mac do
founder, antes da conversa:

1. `/seo audit <site do prospect>` — auditoria completa (crawl, técnico,
   conteúdo, schema) com health score.
2. `/seo geo <site do prospect>` — a metade GEO: acessibilidade a AI
   crawlers, citabilidade por passagem, llms.txt, sinais de menção de marca.
3. Levar 2-3 páginas do resultado como PDF/print. A call vira demonstração:
   "isto aqui é o raio-X — o plano de correção é o que a Ozvor faz".

Escada de oferta (icp.md): free test → Kit $29 / Ozvor Pages $99 →
Growth $99/mo → OrganicPosts Sprint (DFY). Local services entram por Pages;
agência entra por Agency $549/mo.

## 5. Carregar o lote no SmartLead (passo humano, sempre)

1. Aprovar o lote no Telegram (a caixa diz exatamente o que o sim faz).
2. Abrir o report `🎯 PROSPECÇÃO DA SEMANA` — as sequências vêm no formato
   `=== PROSPECT ===` / `[EMAIL 1..3]`, prontas para colar.
3. No SmartLead: criar campanha com o slug do lote (`cold-<data>` — o mesmo
   dos links `?from=`), colar os 3 passos, importar os leads (e-mail do
   bloco verificado), conferir que o passo 1 não tem link nem assinatura
   com URL, e agendar.
4. Webhook de replies já aponta para a API (`/api/webhooks/smartlead`) —
   resposta move o CRM sozinha. Unsubscribe move para `lost`.
5. Prospect que respondeu → founder qualifica à mão no /admin (o grafo nunca
   rebaixa stage humano; um lote novo só anexa nota).

## 6. Extensão e operação

- **ICP**: v1 estática, derivada de [icp.md](icp.md) (segmento B
  local-services US + agências pequenas). Override sem deploy:
  `PROSPECT_ICP` (texto livre) no serviço worker.
- **Tamanho do lote**: `PROSPECT_BATCH_CAP` (default 10 verificados).
- **Horário**: `PROSPECT_BATCH_CRON` (default `30 7 * * 3`, quarta 07:30 UTC).
- **Fonte de candidatos**: v1 usa os engines Hermes como sugestão + código
  como verdade. Quando existir uma fonte de dados real (ex.: Signal Engine
  com fila local-US, ou API de prospect), ela entra no snapshot
  `prospects` em `apps/worker/src/lib/prospect-probe.ts` sem mudar o grafo.

## 7. Ligado em produção?

- Código: grafo registrado + cron de quarta no worker (este PR).
- Dependências já vivas em produção: `crm_contact` (migração 20260713000002,
  aplicada 13/07), webhook SmartLead (P34), Telegram, Hermes engines, Redis.
- **DESLIGADO até**: o deploy do worker com este PR subir. Depois disso, o
  primeiro lote sai na quarta seguinte às 07:30 UTC, e a perna CRM se declara
  OFF em voz alta se algo faltar (nada degrada calado).

---

## Handoff

- **Feito**: moção discovery-audit documentada; grafo prospect-batch (5.A.1)
  implementado com validador 27/08 em código, gate humano e CRM fail-soft.
- **Próximo dono**: founder — aprovar o primeiro lote e carregar no SmartLead.
- **Riscos**: qualidade dos candidatos dos engines (mitigado: verificação por
  código descarta e conta); e-mail ausente no site (prospect fica sem linha
  no CRM — achar contato à mão).
