# Campanha SmartLead — Trilha GEO (free test → Growth)

## TL;DR

A trilha GEO é o primeiro ICP da casa: negócio local/organic-dependent dos EUA que vive de ser achado — e a IA não fala dele. Este kit fecha o gap apontado em 10.D.6 (só a trilha AI Stack tinha kit): definição do lote, sequência de 3 e-mails em inglês nos mesmos padrões da casa (1º e-mail SEM nenhum link, uma pergunta só, um achado real do site do prospect; links com `?from=cold-<lote>` do 2º em diante), rodapé obrigatório de opt-out, passos de carga no SmartLead e como a correlação fecha (reply → webhook → CRM; free test/compra → casa por e-mail + `?from=`). Os leads vêm das campanhas já na conta (OZ-B Local services = 1.866, OZ-A Agencies = 489, OZ-C SaaS/ecom = 72, mais a parte GEO da Ozvor 1) e dos lotes semanais do `prospect-batch`. Nada é enviado pela máquina: o SmartLead envia, o founder carrega e aprova antes.

---

## 1. A trilha GEO dentro dos dois ICPs (regra do founder, 01/09)

| | Trilha GEO (este kit) | Trilha AI STACK ([aistack-campaign-kit.md](aistack-campaign-kit.md)) |
|---|---|---|
| Dor de entrada | "AI não fala de mim; concorrente aparece" | "Pago ferramentas demais / a IA que uso não resolve minha dor" |
| Perfil | Local services US (roofers, clinics, contractors) + SMBs organic-dependent + agências | SMB US de qualquer nicho com dor de processo/ferramenta |
| Oferta no e-mail 2 | Free test (`ozvor.com/test?from=cold-<lote>`) | AI Stack Audit $49 (`ozvor.com/ai-audit?from=aistack-<lote>`) |
| Escalação | Kit $29 → Growth $99/mo → Agency $549/mo → OrganicPosts | OrganicPosts $1.5k (o audit é a porta de entrada) |
| Cruzamento | O CRM é um só; a nota do contato diz a trilha de origem. Quem tem dor de visibilidade quase sempre tem dor de stack — e vice-versa |

Regra anti-genérico (01/09): cada lote passa por verificar→criar→aplicar→auditar; o crítico veta repetição de ângulo/gancho/estrutura contra os lotes anteriores.

## 2. Sequência da leva 1 — 3 toques (HISTÓRICO; a sequência em vigor é a da §5)

Regras aplicadas: 1º e-mail texto puro, ZERO links/URLs/domínios, UMA pergunta, 40–80 palavras, frases ≤12 palavras, nível 15-17 anos, sonho honesto, assinatura "Otavio". Links só a partir do e-mail 2, sempre com `?from=cold-<lote>`. Quando o lote vem do `prospect-batch`, o e-mail 1 abre com o achado REAL do mini-GEO-probe do site do prospect (robots bloqueando GPTBot, JSON-LD ausente, etc.) — nunca um achado inventado.

**Email 1 (dia 0) — sem link, busca resposta**

> Subject: found something on your site
>
> Hi {{first_name}},
>
> I checked how AI tools see {{company}}. When people ask ChatGPT for a {{category}} near them, you don't come up. A competitor does.
>
> This is fixable. Most owners just never see it happen.
>
> Want me to show you exactly what the AI says?
>
> Otavio

**Email 2 (dia 3) — a oferta, com link rastreado**

> Subject: see what AI says about {{company}}
>
> Hi {{first_name}},
>
> I built a free 60-second test for this. You type your business and one competitor. It asks the real AI engines live. You see who gets recommended — you or them.
>
> No signup wall. The result lands on your screen and in your inbox.
>
> Run my free test → https://ozvor.com/test?from=cold-{{lote}}
>
> Otavio

**Email 3 (dia 7) — última, honesta e curta**

> Subject: closing the loop
>
> Hi {{first_name}},
>
> Last note from me. Every week, buyers ask AI who to hire. If the answer isn't you, that work goes somewhere else.
>
> The test takes 60 seconds and costs nothing. If now is not the time, no worries. The door stays open.
>
> https://ozvor.com/test?from=cold-{{lote}}
>
> Otavio

### Rodapé obrigatório (todos os e-mails, todos os toques)

Todo e-mail termina com este bloco, DEPOIS da assinatura:

> P.S. If you'd rather not hear from me, just reply STOP and I won't write again.
>
> {{POSTAL_ADDRESS}}

- Linha de opt-out **obrigatória e literal** — validador de código reprova e-mail sem ela.
- **Decisão do founder 02/09/2026**: por ora SÓ a linha de opt-out, SEM endereço postal. `{{POSTAL_ADDRESS}}` fica como a recomendação CAN-SPAM (§5(a)(5)) **não adotada por ora** — risco aceito, registrado no [sop-dia-do-disparo.md](sop-dia-do-disparo.md) §Riscos aceitos. Quando o founder fornecer o endereço, substituir em todos os kits e campanhas.
- Reply "STOP" = supressão imediata em TODAS as trilhas; contato nunca entra em reciclagem.

## 3. Carga no SmartLead (passo a passo do founder)

1. SmartLead → **Create campaign** → nome `geo-<data do lote>` (ex.: `geo-2026-09-08`) — ou usar as campanhas já criadas (OZ-A/OZ-B/OZ-C) colando esta sequência nelas
2. Colar os 3 e-mails **com o rodapé obrigatório** (delays: 0 / 3 / 7 dias) — conferir que o e-mail 1 ficou **sem nenhum link** (o SmartLead às vezes auto-lineariza domínios; escrever "ozvor" por extenso só a partir do 2º)
3. Trocar `{{lote}}` pelo slug do lote (o artifact do `prospect-batch` traz o slug pronto)
4. Importar os leads da trilha GEO do lote aprovado (o artifact separa as trilhas); os 2k créditos mensais do lead-finder vêm PRIMEIRO, Apify completa depois (regra 01/09)
5. Conferir que o webhook global cobre a campanha (provado 27/08; se não propagar, registrar o webhook na campanha com a mesma URL)
6. Ativar. A partir daí: reply → `crm_contact` `contacted` sozinho; free test/compra → casa por e-mail + `?from=` no lead/pedido

## 4. Métricas que fecham o ciclo

- Resposta ao e-mail 1 (a métrica-mestra do frio) — webhook grava
- Free tests e compras com `from=cold-*` — atribuição first-touch (#527) grava no lead/pedido
- Free test → nurture de conversão já ativa (test → Kit → Growth)

---

## 5. LEVA 2 — "outbound com prova" (a partir de 11/09) — **esta é a sequência em vigor**

> Campanha viva: `oz-local-2026-09-14` (id **3939141**), criada DRAFTED em 11/09 pelo
> `smartlead-campaign.yml` (`leva=2`). Diagnóstico e conta da capacidade:
> [leva2-outbound-com-prova.md](leva2-outbound-com-prova.md).

A leva 1 (§2 acima, 3 toques) fica registrada como histórico. O que muda:
**4 toques em 14 dias (0/3/7/14), só em dias úteis, 80 leads novos/dia por
campanha, lista ≤800** — e o e-mail 1 abre com a PROVA, não com um argumento.

### Variáveis de merge obrigatórias no CSV

`{{ai_engine}}` · `{{competitor_1}}` · `{{competitor_2}}` · `{{query}}` · `{{report_url}}`

Todas produzidas pelo `prospect-batch` (mini free test de 1 execução, ~US$0,03
por lead). **Lead sem prova não entra na campanha** — nunca um placeholder.

**Email 1 (dia 0) — sem link, a prova e uma pergunta**

> Subject: {{ai_engine}} named someone else
>
> Hi {{first_name}},
>
> This week I asked {{ai_engine}} one question: "{{query}}"
>
> It named {{competitor_1}}. Then {{competitor_2}}. It never named {{company_name}}.
>
> That is the answer your next customer gets.
>
> Want me to send you the exact words it used?

**Email 2 (dia 3) — o resto da resposta, com link rastreado**

> Subject: the exact words
>
> Hi {{first_name}},
>
> Here is the rest of it. {{ai_engine}} put {{competitor_1}} first, then {{competitor_2}}.
>
> You can check the other engines yourself. It takes 60 seconds. You type your business and one competitor.
>
> See what every engine says → https://ozvor.com/test?from=oz-local-2026-09-14

**Email 3 (dia 7) — por que acontece**

> Subject: why it happens
>
> Hi {{first_name}},
>
> This is not about ads. AI answers are built from pages the engines can read and quote.
>
> The businesses AI names usually have those pages. Most local sites do not. That is the whole gap.
>
> The test shows which part is missing → https://ozvor.com/test?from=oz-local-2026-09-14

**Email 4 (dia 14) — o relatório dele, sem digitar nada**

> Subject: your report, nothing to type
>
> Hi {{first_name}},
>
> Last note from me. I set your test up so you type nothing.
>
> It runs the same question I asked: "{{query}}"
>
> Your report → {{report_url}}
>
> If now is not the time, no worries. The door stays open.

Todos os toques terminam com `%signature%` e, depois dela, o rodapé literal
"P.S. If you'd rather not hear from me, just reply STOP and I won't write
again." — sem endereço postal (decisão do founder 02/09, risco registrado).
`{{report_url}}` chega pronto e percent-encoded do `prospect-batch`: o
template **nunca** monta URL com nome de empresa (espaço ou `&` quebrariam o
href).

---

*Kit criado 02/09/2026 (fecha 10.D.6). Padrões: [[feedback-ozvor-cold-sem-link-no-1o-email]] · copy 15-17 anos · sonho honesto · English-first · dois ICPs separados-e-conectados (01/09). O grafo `prospect-batch` (duas trilhas) produz os lotes; este kit é o molde da campanha GEO.*
