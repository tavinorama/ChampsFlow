# OZvor — Plano Completo de Receita v2 para validação com Claude

> **Autor:** Hermes / Chief of Staff da OZvor  
> **Data:** 2026-07-13  
> **Objetivo:** transformar a operação já criada em receita real.  
> **Correção importante:** as páginas legais **já existem** e foram verificadas em produção. Não tratar como pendência de criação.

---

## 0. Status executivo

A OZvor está em fase de **sair de empresa bem documentada para empresa que vende todos os dias**.

O produto existe, checkout existe, materiais existem, agentes existem, PRs de operação/marketing/sales foram aprovadas e mergeadas. Agora o gargalo não é “criar mais estrutura”; é:

1. validar que o dinheiro entra corretamente;
2. publicar/distribuir a mensagem certa;
3. transformar o free test em conversas e vendas;
4. operar a empresa todos os dias com Hermes + Claude Code.

---

## 1. PRs abertas — resolvido

As 3 PRs abertas foram revisadas, aprovadas e mergeadas.

| PR | Conteúdo | Resultado |
|---|---|---|
| **#273** | Runbook Stripe: eventos obrigatórios do webhook e ordem migração → inscrição | ✅ Merged |
| **#274** | Pacote operacional Hermes: ICP canônico, runlist de launch week, calendário | ✅ Merged |
| **#275** | Posts de lançamento para X, Instagram, Facebook, Threads e Bluesky | ✅ Merged |

Main atual verificada após merge:

```text
c4a955c72a544ba17c480d6a773ff71a8625fa8e
```

Open PRs após merge:

```text
0
```

---

## 2. Páginas legais — corrigido

Eu havia tratado legal pages como pendência. Isso estava incorreto.

Verificado em produção:

| Página | Status |
|---|---|
| `/privacy-policy` | ✅ 200 |
| `/terms-of-service` | ✅ 200 |
| `/legal/dpa` | ✅ 200 |
| `/legal/sub-processors` | ✅ 200 |
| `/legal/california-privacy` | ✅ 200 |
| `/legal/do-not-sell` | ✅ 200 |

Portanto, **não incluir “criar páginas legais” no plano**.

Pendência real relacionada a legal/compliance, se houver, é apenas de refinamento/atualização de dados empresariais caso alguma informação pública esteja incompleta — não criação do sistema legal.

---

## 3. O que achei das PRs

### 3.1 PR #273 — Stripe webhook runbook

**Veredito:** boa e importante.

Ela deixa claro quais eventos Stripe precisam estar inscritos:

- `checkout.session.completed`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_failed`
- `charge.refunded`
- `charge.dispute.created`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`

**Ponto forte:** reduz risco de venda quebrada. Antes de tráfego, isso é obrigatório.

**Melhoria sugerida:** transformar esse runbook em checklist operacional curto para o founder usar antes do smoke test:

```text
[ ] Endpoint Stripe aponta para /api/billing/webhook
[ ] Todos os eventos acima inscritos
[ ] Migration 20260712000002 aplicada antes dos novos eventos
[ ] Compra Kit testada
[ ] Compra Growth testada
[ ] Refund full testado
[ ] Email/deliverable confirmado
```

### 3.2 PR #274 — ICP + operação Hermes

**Veredito:** muito boa. Essa é a PR mais importante para vendas.

O ICP ficou claro:

#### Segmento A — Agências digitais / SEO

- 3–40 pessoas
- US/EU
- 5–30 marcas/clientes
- dor: clientes perguntam “por que não aparecemos no ChatGPT?”
- produto principal: **Agency $249/mês**
- narrativa: white-label + pitch mode + multi-brand

#### Segmento B — SMBs dependentes de orgânico

- SaaS, e-commerce, serviços locais
- 1–50 pessoas
- 40%+ tráfego orgânico ou dependência forte de busca
- entrada: **free test → Kit $29 → Growth $99/mês**
- para serviços locais: **Ozvor Pages $99**

#### Escalada

- OrganicPosts Sprint / Managed GEO para quem disser: “faz para mim”.

**O que achei:** a linha está certa. O produto resolve uma dor emergente e fácil de explicar:

> “Você aparece quando um comprador pergunta ao ChatGPT quem recomendar?”

Isso é melhor do que falar genericamente de GEO.

**Melhoria estratégica:** priorizar **Agências primeiro**.

Motivo:

| Critério | Agências | SMB individual |
|---|---:|---:|
| Ticket | $249/mês | $29–$99 |
| Multiplicador | 1 agência = vários clientes | 1 cliente = 1 marca |
| Dor comercial | precisa vender GEO agora | talvez ainda não entende |
| Capacidade de revenda | alta | baixa |
| LTV provável | maior | menor |

SMBs continuam importantes, mas agências aceleram receita porque vendem para nós indiretamente.

### 3.3 PR #275 — posts sociais

**Veredito:** boa base, mas deve ser usada com foco.

O conteúdo está correto porque respeita cada canal:

- X com thread e link no último tweet;
- Instagram como carrossel + story/link sticker;
- Facebook com ângulo local/Ozvor Pages;
- Threads/Bluesky com tom conversacional;
- Reddit explicitamente **não postar** ainda.

**Ponto forte:** não é copy-paste. Isso é raro e bom.

**Melhoria necessária:** não tentar executar todos os canais com a mesma força na semana 1.

Prioridade recomendada:

| Prioridade | Canal | Por quê |
|---|---|---|
| P1 | LinkedIn founder | melhor para B2B/agências; confiança; vendas |
| P1 | X/Twitter | bom para narrativa de mercado e early adopters |
| P1 | Direct/warm DMs aprovadas | conversão mais direta |
| P2 | Facebook | bom para local services / Pages |
| P2 | Instagram | bom se houver carrossel visual forte |
| P3 | Threads/Bluesky | awareness, menor intenção comercial |
| Não postar ainda | Reddit | conta precisa idade/karma; usar só listening/participação manual |

---

## 4. Posicionamento comercial recomendado

### 4.1 Mensagem principal

Usar linguagem simples:

> **Know if AI trusts your brand. Then fix it.**

Versão PT para raciocínio interno:

> “Descubra se a IA confia na sua marca. Depois corrija.”

### 4.1.1 Trust asset — Claude for Startups

A OZvor integra o **Claude for Startups**. Isso deve entrar como ativo de confiança, mas sem exagero jurídico/comercial.

**Uso recomendado:**

```text
OZvor is part of Claude for Startups.
```

ou:

```text
OZvor joined Claude for Startups, Anthropic’s startup program.
```

**Evitar sem guideline explícita:**

```text
❌ backed by Anthropic
❌ endorsed by Anthropic
❌ official Anthropic partner
❌ certified by Claude
❌ partnered with Anthropic
```

**Onde usar:**

| Local | Copy sugerida |
|---|---|
| Footer/about | `Part of Claude for Startups.` |
| Pitch para agências | `Built by an AI-native startup in Claude for Startups.` |
| LinkedIn founder | post narrativo: Claude for Startups + tese de AI search |
| Sales deck | trust badge discreto, sem prometer endosso |

**Por que importa:** reduz risco percebido para B2B, reforça AI-native credibility e dá uma notícia legítima para lançamento.

### 4.2 Pitch para agências

```text
Your clients are starting to ask:
“Why doesn't ChatGPT recommend us?”

Ozvor gives you the answer in 60 seconds:
- which AI engines mention the brand;
- which competitors they recommend instead;
- which sources the engines trust;
- what content/pages to create next.

Use it before the pitch.
Sell GEO with evidence, not opinion.
```

CTA:

```text
Run a free test on one client brand.
```

### 4.3 Pitch para SMBs

```text
Buyers no longer click ten blue links.
They ask AI who to trust.

Ozvor shows whether your brand appears in those answers — and what to fix if it doesn't.
```

CTA:

```text
Show me my AI visibility score.
```

### 4.4 Pitch para serviços locais / Pages

```text
The audit shows why AI doesn't cite your business.
Ozvor Pages builds the pages that fix it — using your real business data.
```

Cuidado:

- não prometer “garantia de citação”;
- não prometer “resultado em X dias” sem prova;
- não falar que Pages é “só um website builder”.

---

## 5. Plano de execução — 7 dias

### Dia 1 — hoje

| Ação | Dono | Status |
|---|---|---|
| Merge PR #273/#274/#275 | Hermes | ✅ feito |
| Confirmar rotas legais em produção | Hermes | ✅ feito |
| Validar plano v2 com Claude | Otavio + Claude | pendente |
| Definir primeira oferta pública da semana | Otavio + Hermes | pendente |

Oferta recomendada para semana 1:

```text
Free AI Visibility Test
→ Kit $29
→ Growth $99/mo
→ Agency $249/mo
```

Não começar com desconto agressivo. Usar FOUNDER30 só como founder offer controlada.

### Dia 2 — dinheiro e tracking

| Ação | Dono | Gate |
|---|---|---|
| Stripe payment smoke: Kit $29 | Otavio | founder-only |
| Stripe payment smoke: Growth $99 com FOUNDER30 | Otavio | founder-only |
| Confirmar webhook e deliverable | Hermes + Claude | técnico |
| Confirmar GA4 / eventos principais | Claude | Hermes review |

Eventos mínimos a medir:

- visita `/test`;
- free test iniciado;
- free test concluído;
- clique em Kit;
- checkout iniciado;
- checkout concluído;
- visita `/agencies`;
- visita `/book`.

### Dia 3 — LinkedIn + X

| Ação | Dono | Gate |
|---|---|---|
| Publicar Post 1 no LinkedIn founder | Otavio | aprovar texto |
| Publicar thread X | Otavio ou conta OZvor | aprovar texto |
| Responder comentários e DMs | Otavio + Hermes draft | humano envia |
| Registrar leads no CRM | Hermes | sem inventar |

Mensagem do dia:

```text
Search moved. Buyers ask AI. See if AI recommends you.
```

### Dia 4 — agência primeiro

| Ação | Dono | Gate |
|---|---|---|
| Criar lista de 25 agências SEO/digital reais | Hermes | fontes reais |
| Rodar free test em 5 marcas/prospects, se permitido pelo produto | Hermes/Claude | sem gasto novo |
| Preparar DM/email personalizado com achado real | Hermes | founder aprova antes de enviar |
| Publicar post “agency angle” | Otavio | aprovar texto |

Regra absoluta:

```text
Sem achado real, sem outreach.
```

### Dia 5 — SMB/local pages

| Ação | Dono | Gate |
|---|---|---|
| Publicar ângulo Pages no Facebook/LinkedIn | Otavio | aprovar texto |
| Selecionar 10 negócios locais com site fraco | Hermes | fontes reais |
| Criar proposta simples: audit → pages → Growth | Hermes | founder aprova antes de envio |

### Dia 6 — proof asset

| Ação | Dono | Gate |
|---|---|---|
| Usar `/results` com score real da OZvor | Hermes/Claude | dado real |
| Criar mini case: “we ran Ozvor on Ozvor” | Claude | Hermes review |
| Publicar evidence post | Otavio | aprovar texto |

Esse é o melhor ativo de confiança porque admite imperfeição:

```text
We sell this tool. We ran it on ourselves. It found gaps.
```

### Dia 7 — review da semana

| Ação | Dono |
|---|---|
| relatório: visitas, testes, leads, compras, conversas | Hermes |
| ajustar mensagem com base no que gerou resposta | Hermes + Otavio |
| decidir se ativa paid ads ou continua orgânico/outbound | Otavio |

---

## 6. Ordem de trabalho para Claude Code

Claude deve validar e, se concordar, executar em PRs pequenos.

### PR A — analytics/eventos mínimos

**Objetivo:** garantir rastreamento do funil.

Checklist:

- GA4 carregando corretamente;
- eventos listados no Dia 2;
- UTMs preservadas;
- nenhum dado pessoal enviado indevidamente;
- consentimento/cookie respeitado.

Risco: MEDIUM se só analytics; HIGH se tocar consent/auth/billing.

### PR B — revenue smoke dashboard / runbook

**Objetivo:** transformar o runbook Stripe em checklist operacional.

Adicionar documento ou dashboard interno com:

- status do endpoint webhook;
- eventos inscritos esperados;
- último checkout concluído;
- último deliverable gerado;
- último email enviado;
- refunds/disputes status.

Risco: MEDIUM/HIGH dependendo de acesso a billing.

### PR C — launch content package final

**Objetivo:** transformar social-launch-posts em assets prontos.

Checklist:

- versões LinkedIn/X/Instagram/Facebook com UTMs;
- CTA único por post;
- screenshot real de `/results` quando usado;
- nenhuma métrica sem fonte;
- sem prometer garantia de citação.

Risco: LOW/MEDIUM.

### PR D — agency outbound pack

**Objetivo:** criar pacote aprovado de abordagem para agências.

Deve conter:

- ICP final;
- DM LinkedIn;
- email curto;
- follow-up 1;
- follow-up 2;
- objeções e respostas;
- regra: enviar só com achado real do free test ou evidência pública verificável.

Risco: LOW enquanto for draft. HIGH quando virar envio externo.

### PR E — Ozvor-on-Ozvor case study

**Objetivo:** criar case próprio com dados reais.

Deve usar somente:

- score real da `/results`;
- prompts reais;
- citações reais;
- data da medição;
- plano de correção real.

Risco: LOW/MEDIUM se conteúdo; HIGH se mudar lógica de resultado.

---

## 7. Linha editorial recomendada

### O que falar

1. AI search mudou a distribuição.
2. Marcas agora precisam ser citáveis por IA.
3. Google ranking não garante ChatGPT/Perplexity/Gemini citation.
4. Ozvor mede isso com engines reais.
5. O primeiro passo é gratuito.
6. Depois você compra o kit/plano para corrigir.
7. OZvor integra o **Claude for Startups** — usar como prova de credibilidade AI-native, não como endosso formal.

### O que evitar

- “Garantimos que você vai aparecer no ChatGPT.”
- “Aumente receita em X%.”
- “A IA vai ranquear você em poucos dias.”
- “Todo mundo precisa disso agora” sem evidência.
- Posts longos demais explicando GEO como se fosse tese.

### O melhor gancho

```text
When buyers ask AI who to trust, does it say your name?
```

### O segundo melhor gancho

```text
Your SEO dashboard says you're fine.
ChatGPT may disagree.
```

### O terceiro melhor gancho

```text
Agencies: your next SEO retainer may start with one question —
“Why doesn't AI recommend us?”
```

---

## 8. Estratégia por canal

### LinkedIn

**Canal principal.** Founder-led, B2B, agências.

Formato:

- 1 post forte por dia útil no lançamento;
- comentar manualmente em posts de SEO/GEO/AI search;
- DM só para engajados ou leads com achado real.

### X/Twitter

Bom para narrativa de categoria.

Formato:

- thread de lançamento;
- 1 insight por dia;
- screenshots reais.

### Facebook

Usar mais para local services e Pages.

Mensagem:

```text
Your business needs pages AI can understand and cite.
```

### Instagram

Só vale se virar carrossel visual bom.

Sem design, não priorizar.

### Threads/Bluesky

Baixa prioridade comercial. Usar só para presença e aprendizado.

### Reddit

Não postar produto agora.

Usar para:

- ouvir linguagem real;
- mapear dores;
- encontrar perguntas;
- criar conteúdo melhor.

---

## 9. Revenue targets

| Prazo | Meta |
|---|---|
| 48h | payment smoke validado |
| 7 dias | 1ª venda real ou 3 conversas comerciais qualificadas |
| 14 dias | 1–3 clientes pagantes |
| 30 dias | $500+ MRR ou pipeline claro para isso |
| 90 dias | $5k MRR via agências + Growth |
| 12 meses | caminho para $1M ARR com Agency + OrganicPosts |

Caminho mais provável para ficar grande:

```text
Agency $249/mo
→ 20 agências = $4,980 MRR
→ 100 agências = $24,900 MRR
→ 300 agências = $74,700 MRR
→ + OrganicPosts/managed GEO = expansão high-ticket
```

SMB sozinho demora mais. Agência escala melhor.

---

## 10. Pedido para Claude validar

Claude, valide este plano com foco em:

1. O ICP da PR #274 está correto para vendas agora?
2. Devemos priorizar agências antes de SMBs?
3. O conteúdo da PR #275 está bom por canal?
4. Quais claims precisam de fonte/cuidado legal?
5. Que PRs técnicos faltam para rastrear e converter vendas?
6. Onde a copy pode ficar mais direta e menos “educacional demais”?
7. Quais ações devem ser Hermes/autônomas e quais precisam do crivo do founder?

Não criar dados fictícios. Não assumir receita. Não assumir métricas. Validar contra código, docs e produção.

---

## 11. TL;DR para Otavio

1. **PRs #273/#274/#275 mergeadas.**
2. **Páginas legais existem e estão 200.** Erro corrigido.
3. **ICP está bom**, mas eu priorizaria **agências primeiro**.
4. **Posts estão bons**, mas eu não espalharia força igualmente. Foco: LinkedIn + X + warm DMs. Reddit só listening.
5. Próximo movimento real: **payment smoke + analytics + primeiro post + lista de agências**.

A ordem é receita. A máquina agora precisa girar todo dia.
