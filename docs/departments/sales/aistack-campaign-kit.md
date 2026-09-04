# Campanha SmartLead — AI Stack Audit ($49)

## TL;DR

O AI Stack Audit é o segundo produto e tem ICP próprio: SMB dos EUA afogado em ferramenta errada, não (só) invisível na IA. Este kit é o pacote completo para o founder criar a campanha no SmartLead: definição do ICP-2, sequência de 3 e-mails em inglês nos padrões da casa (1º e-mail SEM nenhum link, uma pergunta só; links com `?from=aistack-<lote>` do 2º em diante), passos de carga no SmartLead e como a correlação fecha (reply → webhook → CRM; compra → casa por e-mail). O grafo `prospect-batch` passa a alimentar as DUAS trilhas (GEO + AI Stack) — cada lote aprovado indica a qual campanha cada prospect pertence. Nada é enviado pela máquina: o SmartLead envia, o founder carrega e aprova antes.

---

## 1. Os dois ICPs — separados e conectados (regra do founder, 01/09)

| | Trilha GEO (produto: visibilidade AI search) | Trilha AI STACK (produto: audit $49) |
|---|---|---|
| Dor de entrada | "AI não fala de mim; concorrente aparece" | "Pago ferramentas demais / a IA que uso não resolve minha dor" |
| Perfil | Local services US (roofers, clinics, contractors) que vivem de ser achados | SMB US de qualquer nicho com dor de processo/ferramenta (admin, marketing, atendimento) |
| Oferta no e-mail 2 | Free test (`ozvor.com/test?from=`) | AI Stack Audit $49 (`ozvor.com/ai-audit?from=`) |
| Escalação | Growth/Agency mensal | OrganicPosts $1.5k (o audit é a porta de entrada) |
| Cruzamento | Quem tem dor de stack quase sempre tem dor de visibilidade — e vice-versa. O CRM é um só; a nota do contato diz a trilha de origem |

## 2. Sequência da campanha AI STACK (inglês, pronta para colar)

Regras aplicadas: 1º e-mail texto puro, ZERO links/URLs/domínios, UMA pergunta, 40–80 palavras, frases ≤12 palavras, nível 15-17 anos, sonho honesto, assinatura "Otavio". Links só a partir do e-mail 2, sempre com `?from=aistack-<lote>`.

### Rodapé obrigatório (todos os e-mails, todos os toques) — adicionado 02/09/2026

Todo e-mail da campanha termina com este bloco, DEPOIS da assinatura:

> P.S. If you'd rather not hear from me, just reply STOP and I won't write again.
>
> {{POSTAL_ADDRESS}}

- A linha de opt-out ("reply STOP") é **obrigatória e literal** — o validador de código deve reprovar e-mail sem ela (a implementação do validador é do agente de código).
- **Decisão do founder 02/09/2026**: por ora publica-se **SÓ a linha de opt-out**, SEM endereço postal. O placeholder `{{POSTAL_ADDRESS}}` fica documentado como a recomendação CAN-SPAM (§5(a)(5) exige "valid physical postal address" em commercial e-mail) **não adotada por enquanto** — risco aceito e registrado no [sop-dia-do-disparo.md](sop-dia-do-disparo.md) §Riscos aceitos. Quando o founder fornecer o endereço (pode ser caixa postal ou endereço comercial registrado), substituir o placeholder em TODOS os kits e nas campanhas já criadas no SmartLead.
- Reply "STOP" = supressão imediata: SmartLead marca unsubscribed (webhook grava `LEAD_UNSUBSCRIBED`), o contato sai de TODAS as trilhas e nunca entra em reciclagem.

**Email 1 (dia 0) — sem link, busca resposta**

> Subject: quick question about your tools
>
> Hi {{first_name}},
>
> Most small businesses I talk to pay for 5+ tools. And still do the boring work by hand.
>
> AI could take half of it. But nobody has time to test 100 apps.
>
> If I could tell you the ONE tool that fits your exact bottleneck — would you want to know what it is?
>
> Otavio

**Email 2 (dia 3) — a oferta, com link rastreado**

> Subject: the one tool for {{company}}
>
> Hi {{first_name}},
>
> I built a 60-second audit for this. You answer 5 questions about your business. It tells you the right AI tool for your worst pain. The full result lands in your inbox.
>
> It costs $49. Money back in 30 days if it tells you nothing new.
>
> I want to see my stack → https://ozvor.com/ai-audit?from=aistack-{{lote}}
>
> Otavio

**Email 3 (dia 7) — última, honesta e curta**

> Subject: closing the loop
>
> Hi {{first_name}},
>
> Last note from me. Wrong tools cost small businesses hours every week. The audit finds the right one in 60 seconds.
>
> If now is not the time, no worries. The door stays open.
>
> https://ozvor.com/ai-audit?from=aistack-{{lote}}
>
> Otavio

## 3. Carga no SmartLead (passo a passo do founder)

1. SmartLead → **Create campaign** → nome `aistack-<data do lote>` (ex.: `aistack-2026-09-08`)
2. Colar os 3 e-mails acima **com o rodapé obrigatório** (delays: 0 / 3 / 7 dias) — conferir que o e-mail 1 ficou **sem nenhum link** (o SmartLead às vezes auto-lineariza domínios; escrever "ozvor" por extenso só a partir do 2º)
3. Trocar `{{lote}}` pelo slug do lote (o artifact do `prospect-batch` traz o slug pronto)
4. Importar os leads da trilha AI STACK do lote aprovado (o artifact separa as trilhas)
5. Conferir que o webhook global já cobre a campanha (provado 27/08; se a conta não propagar, registrar o webhook na campanha com a mesma URL)
6. Ativar. A partir daí: reply → `crm_contact` `contacted` sozinho; compra no /ai-audit → casa por e-mail + `?from=` no pedido

## 4. Métricas que fecham o ciclo

- Resposta ao e-mail 1 (a métrica-mestra do frio) — webhook grava
- Cliques/compras com `from=aistack-*` — atribuição first-touch (#527) grava no pedido
- Compra do audit → nurture `ai_audit_to_full` já ativa (upsell $1.5k automático)

---

*Kit criado 01/09/2026. Padrões: [[feedback-ozvor-cold-sem-link-no-1o-email]] · copy 15-17 anos · sonho honesto · English-first. O grafo `prospect-batch` (com as duas trilhas) produz os lotes; este kit é o molde da campanha.*
