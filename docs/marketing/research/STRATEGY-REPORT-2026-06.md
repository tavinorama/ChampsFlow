# TrustIndex AI — Relatório Estratégico: Análise Externa Corrigida + Caminho para $100k em 90 Dias

## Resumo executivo (leia isto primeiro)

- **A análise externa está desatualizada.** Das 10 coisas que ela diz estarem "faltando/404", 7 já estão construídas (checkout Stripe, dashboard, blog, OAuth social, onboarding backend, fluxo de upgrade, conteúdo). Só 2 faltam de fato (case studies/depoimentos e sequência de nutrição por e-mail) e 1 é parcial. Não trate as alegações dela como verdade.
- **O verdadeiro gargalo de receita não é o que ela aponta:** os CTAs de pricing na landing apontam para a **waitlist**, não para o checkout. O Stripe está pronto, mas só é alcançável depois do login em `/account/billing`. Ninguém consegue comprar sozinho a partir da landing. **Esse é o conserto nº 1.**
- **$100k em 90 dias NÃO é viável com assinaturas $99/$149 sozinhas** (cenário realista chega a ~$8,6k). É viável com **DFY high-ticket (GEO Sprint $2.400 + Managed) + pré-pagamento anual**, com a assinatura rodando por baixo como volante de longo prazo. Esse é o Cenário C (recomendado): ~$92k–$100k em caixa, ~70% vindo de high-ticket.
- **Posicionamento vencedor: "auditoria + execução".** Todo concorrente diz que você está invisível; nós te tornamos citado. **Mantenha o $29 como tripwire one-time** (não mensal) e **alargue Growth→Agency de $99/$149 para $99/$249**. Rejeite a escada $29/$79/$199 da análise.
- **O ativo de maior alavancagem é o dogfooding do fundador** (subir o próprio TrustIndex Score em público) + as 5–6 estatísticas de mercado mais defensáveis. Vire isso em prova na home, em vídeos de case e na sequência de nutrição.

---

## 1. Veredito da análise

### O que a análise ACERTOU (forças)
- **Identificou as duas lacunas reais de conversão:** ausência de **case studies/depoimentos** na landing e ausência de **sequência de nutrição multi-etapas**. Estes dois são genuinamente verdadeiros — confirmados no código.
- **A mecânica de "founding members"** (urgência por escassez/janela limitada) é uma boa ideia e se encaixa perfeitamente com o cupom FOUNDER30 já existente.
- **As táticas de canal são sólidas:** Product Hunt, dogfooding no LinkedIn, mapa de concorrentes e a noção de liderar com estatísticas de mercado fortes.
- **O diagnóstico de categoria** (GEO é mercado em alta, SMBs estão invisíveis na busca por IA) está direcionalmente correto.

### O que a análise ERROU / está DESATUALIZADO (fraquezas)
- **Lista como "faltando" coisas que já existem.** Isto é o erro mais grave e contamina todo o plano dela. Especificamente:
  - "Checkout/Stripe faltando" — **FALSO.** `apps/api/src/routes/billing.ts` tem checkout, portal e webhook (assinatura verificada, idempotente via Redis).
  - "Dashboard faltando" — **FALSO.** `dashboard/page.tsx` renderiza `TrustIndexScorecard` + `ScoreTrend` com dados reais.
  - "Fluxo de upgrade faltando" — **FALSO.** `account/billing/page.tsx` já faz checkout + portal Stripe.
  - "Blog/SEO faltando" — **FALSO.** Hub `/blog`, artigos, video posts, 4 páginas de recursos premium, `sitemap.ts` e `robots.txt`.
  - "Integração social faltando" — **FALSO.** OAuth completo (LinkedIn/Instagram/Facebook) em `social-accounts.ts`.
  - "Onboarding faltando" — **PARCIALMENTE FALSO.** Provisionamento de tenant no backend existe (`onboarding.ts`); falta só o wizard guiado de UI.
  - "Results page com dados reais faltando" — **PARCIAL.** O fluxo real existe (`/test` → `/api/test` → Scorecard ao vivo; dashboard logado). Só a página de marketing `/results` é ilustrativa com dados fake.
- **A escada de preços proposta ($29/$79/$199; founding $19/$49/$129) contradiz o que está shipado** ($99/$149 + tripwire $29). Adotá-la seria um retrocesso de posicionamento (veja Seção 6).
- **Vários números de mercado estão inflados ou trocados** ("$110B até 2028", "89% das marcas B2B invisíveis", zero-click "58,5%"). Veja Seção 4.
- **A projeção de "$15.7K MRR em 90 dias" responde a uma pergunta diferente da do fundador** (MRR ≠ caixa coletado). Veja Seção 5.

**Conclusão:** a análise é útil como fonte de *ideias de go-to-market e de categoria*, mas seu *retrato do estado do produto está velho* — ela antecede toda a construção de billing/dashboard/social/blog. Use as ideias, descarte o inventário de "faltando".

---

## 2. O que já temos (que a análise achava que precisávamos construir)

Reconciliação real — já-construído vs. parcial vs. genuinamente-faltando:

| Alegação da análise ("FALTANDO/404") | Veredito | Evidência |
|---|---|---|
| Página de pricing dedicada | **PARCIAL** | Não há rota `/pricing`. MAS há seção `#pricing` completa na landing (`page.tsx:1660-1900`): Free / Growth $99 ($831/ano founder) / Agency $149 ($1.251/ano founder) + tripwire Kit $29. Falta só a rota standalone. |
| Checkout / Stripe | **JÁ EXISTE** | `billing.ts`: `POST /checkout`, `/portal`, `/webhook` (assinatura Stripe verificada, idempotente). Kit one-time em `stripe.ts:299`. |
| Fluxo de upgrade | **JÁ EXISTE** | `account/billing/page.tsx` → checkout Stripe; tratamento de `?checkout=success/cancelled`; portal; `PLAN_LIMITS` no servidor. |
| Nutrição por e-mail | **GENUINAMENTE FALTANDO** | Existe e-mail transacional (Resend): confirmação de waitlist, entrega de bônus, DSR/CCPA. **Não há drip/sequência multi-etapas** — sem cron, sem lógica dia-1/3/7. |
| Results page com dados reais | **PARCIAL** | O fluxo real existe (`/test` + dashboard logado). Só a página de marketing `/results` mostra dados de amostra fixos (41→63). |
| Blog / conteúdo SEO | **JÁ EXISTE** | `/blog` + artigos + `/blog/watch/[slug]` + 4 páginas de recursos + `sitemap.ts` + `robots.txt`. |
| Case studies / depoimentos | **GENUINAMENTE FALTANDO** | Zero na landing. Chamada 100% correta da análise. |
| Dashboard | **JÁ EXISTE** | `dashboard/page.tsx` com `TrustIndexScorecard` + `ScoreTrend`; também `/brands`, `/brands/[id]`, `/admin`. |
| Onboarding | **JÁ EXISTE (backend)** | `onboarding.ts` provisiona tenant no primeiro login. Falta só wizard de UI guiado. |
| Integração social | **JÁ EXISTE** | OAuth completo LinkedIn/Instagram/Facebook em `social-accounts.ts`; UI em `/account/connections`. |

**Lacunas reais que importam para receita (a lista honesta):**

1. **CTAs de pricing apontam para a WAITLIST, não para o checkout.** Maior bloqueador. Checkout existe mas só pós-login. Corrigir isto destrava o self-serve.
2. **Sem prova social / case studies** na landing.
3. **Sem nutrição multi-etapas** (só transacional one-shot).
4. **Auditoria é mock em 4 de 5 engines.** Só `ANTHROPIC_API_KEY` está ligada em produção. OPENAI/GEMINI/PERPLEXITY/SERP rodam mock — "auditamos 5 engines de IA" não é entregável de verdade até as chaves entrarem no Railway. Risco de reembolso/confiança.
5. **Sem wizard de onboarding** (add brand → competidores → primeira auditoria).
6. **`/results` de marketing mostra dados fake** e não há rota `/pricing` (lacuna menor de SEO/ads).
7. **Sem programa de afiliados/indicação** (o único "affiliate" é um disclaimer legal).

---

## 3. O que vale aproveitar da análise

Ideias genuinamente boas para adotar (separadas do inventário velho):

- **Mecânica de "founding members"** — janela limitada, vagas contadas, preço/cupom founder (FOUNDER30 já existe). Casa com o pré-pagamento anual e cria a urgência que falta hoje.
- **Sequência de nutrição** — esta é uma lacuna real *e* uma ideia certa. Construir o drip Free→$29 e $29→DFY (ver Seção 7).
- **Product Hunt** — bom para um pico de tráfego qualificado e prova social inicial; alinhar com a janela de founding members.
- **Dogfooding no LinkedIn** — o fundador subindo o próprio TrustIndex Score em público, semanalmente. É o maior ativo de confiança que temos (ver Seção 6, Parte 3).
- **Mapa de concorrentes** — útil para a narrativa de categoria (Otterly, Promptmonitor, Spotlight, Mentions.so são "só monitoramento"; AthenaHQ/Peec/Profound são enterprise). Usar para enquadrar o wedge "audit + execute".
- **Liderar com as estatísticas de mercado mais fortes** — sim, mas só as defensáveis (Seção 4). Não as infladas.

---

## 4. Números de mercado — o que usar

### Estatísticas defensáveis (use em copy, vídeos de case, decks) — todas verificadas (✅)

1. **SOCi 1,2% local — a âncora de FOMO.** "Quando alguém pergunta ao ChatGPT por um negócio como o seu, ele cita UM — e 98,8% dos negócios locais nunca são mencionados." (SOCi 2026 Local Visibility Index, ~350k locais.)
2. **5WPR 87% invisíveis — o soco no estômago.** "87% dos contratantes independentes de HVAC e encanamento estão completamente invisíveis quando um cliente pergunta à IA." (5WPR, Q1 2026.)
3. **Seer +120% quando citado — o payoff.** "Marcas citadas dentro da resposta de IA do Google ganham 120% mais cliques." (Seer Interactive, 53 marcas / 5,47M queries / 2,43B impressões.)
4. **Microsoft Clarity ~11x CTR de signup — a prova de conversão (use no lugar do duvidoso 4–5x).** "Dados da própria Microsoft em 1.277 sites: visitantes vindos de IA convertem até 11x mais." (Microsoft Clarity, nov/2025.)
5. **Princeton/Georgia Tech +40% / −8,7% — a âncora científica.** "Estudo peer-reviewed testou 10.000 queries e provou que as citações e estatísticas certas tornam o conteúdo até 40% mais visível à IA — enquanto keyword stuffing dá tiro pela culatra." (Aggarwal et al., KDD 2024, arXiv:2311.09735.) **A estatística mais defensável de todas.**
6. **SparkToro 68% zero-click — o "o chão está se movendo" (corrige o 58,5% errado da análise).** "Em 2026, 68% das buscas no Google nos EUA terminam sem um único clique para a web aberta — acima dos 60% de dois anos atrás." (SparkToro/Similarweb, jun/2026.)
- **Bônus B2B:** Forrester 94% dos compradores B2B usam IA (citar o relatório/blog, não o press release).

### Estatísticas frágeis — NÃO use (ou corrija)

| Alegação da análise | Ação | Motivo |
|---|---|---|
| "$110B até 2028" | **DESCARTAR** | Inflado ~3x vs. a previsão mais agressiva crível ($33,68B em 2034) e anos cedo demais. |
| "89% das marcas B2B invisíveis" | **DESCARTAR/TROCAR** | Não-citado; provável confusão com o stat Forrester de *adoção por compradores*. Trocar pelo 87% HVAC ou 72% long-tail. |
| Mercado GEO "$365M (2026)" | **SUAVIZAR** | Ponto único sem citação. Usar faixa: ~$886M–$1,09B (2026) → $7,3B–$17,15B (início dos anos 2030), "três casas discordam". |
| "42,9% CAGR" | **USAR COMO FAIXA** | Está dentro da banda real de 34–50%. Dizer "34–50% ao ano", não o número exato como se fonte única. |
| "4–5x conversão" | **SUAVIZAR + ATRIBUIR** | Contestado (Amsive não achou diferença, p=0,794). Liderar com Clarity 11x e dar como faixa atribuída. |
| Zero-click "58,5% EUA" | **CORRIGIR para 68%** | Nosso número verificado é 68,01% (SparkToro/Similarweb). |
| "88% dos CMOs medidos / 34% com estratégia" | **SUAVIZAR** | Direcionalmente certo, números não batem. Usar "85% chamam GEO de prioridade, ~metade não tem métricas". |
| LinkedIn "#2 mais citado" | **USAR (atribuído)** | Defensável via Semrush (~11%, #2–#3 conforme estudo). |

---

## 5. Caminho para $100k em 3 meses

### Primeiro: qual "$100k"?
Existem três interpretações, com dificuldades muito diferentes:

| Interpretação | Definição | Viável em 90 dias (cold start)? |
|---|---|---|
| **$100k de CAIXA coletado** | Dinheiro real no banco (subs + anual + DFY one-time) | **Difícil mas alcançável** — se o DFY high-ticket carregar |
| **$100k de MRR** | $100k recorrente/mês → ~1.010 subs a $99, do zero | **Não.** Exigiria ~150k testes grátis. |
| **$100k de ARR run-rate** | MRR × 12 → $8.333 MRR (~84 subs Growth) | **Sim, tranquilo** — o marco sano de SaaS. |

A análise externa respondeu silenciosamente a uma pergunta diferente: "$15.7K MRR em 90 dias" é número de **MRR** (≈ $188K de ARR run-rate — o que é *bom*), não caixa. **Modelo aqui o caso literal e mais difícil: $100k de CAIXA em 90 dias.**

**Manchete honesta:** $100k de caixa em 90 dias a partir de assinaturas $29–$149/mo sozinhas **não é realista** para uma marca com zero clientes e zero tráfego. O dinheiro está em **DFY high-ticket + pré-pagamento anual.**

### SKUs reais e quanto cada um coleta em 90 dias

| SKU | Tipo | Preço | Caixa em 90d |
|---|---|---|---|
| Free | Isca | $0 | $0 (alimenta tudo) |
| Get-Cited Kit | Tripwire one-time | $29 | $29 integral |
| Growth mensal | Sub | $99/mo | ~$99–$297 na janela |
| Growth anual (founder) | Pré-pago | $831/ano | **$831 integral upfront** |
| Agency mensal | Sub | $149/mo | ~$149–$447 |
| Agency anual (founder) | Pré-pago | $1.251/ano | **$1.251 integral** |
| GEO Sprint | DFY one-time | $2.400 | **$2.400 integral** |
| Managed GEO | DFY retainer | $1.900/mo | ~$1.900–$5.700 |

**Insight central:** uma sub mensal iniciada no mês 2 coleta só 1–2 pagamentos na janela; um GEO Sprint coleta 100% dos $2.400 no dia 1. **Para caixa em 90 dias, SKUs upfront valem 5–25x uma sub mensal.** Esse é o jogo inteiro.

### Premissas de funil (SMB SaaS, cold start, conservadoras-realistas)

| Etapa | Taxa |
|---|---|
| Visitante → teste grátis | 6% |
| Teste grátis → sub paga | 3% |
| Teste grátis → tripwire $29 | 7% |
| Teste grátis → call de DFY | 3% |
| Call DFY → fechamento | 25% |
| Take rate de pré-pago anual | 20% |

Tráfego realista para marca nova em 90 dias (conteúdo do fundador + pouco pago + outreach): **8k–20k visitantes** no trimestre (base: 12k → ~720 testes grátis).

### Cenários

**Cenário A — só assinaturas:** de 720 testes → ~22 subs + ~50 Kits → **~$8,6k de caixa** (~9% da meta). Exit MRR ~$2k. **INVIÁVEL** para $100k/90d. Para chegar lá precisaria de ~11–12x o tráfego. Subs são motor *de composição*, não de *caixa neste trimestre* — exatamente a armadilha da projeção externa.

**Cenário B — DFY high-ticket liderado:** o teste grátis é isca + prova de dor; o fundador vende GEO Sprint ($2.400) e Managed ($1.900/mo) usando o próprio case. ~22 calls inbound + ~45 outbound = ~67 demos; ~22% blended = ~15 clientes DFY → **~$70k de caixa**. Empurrando para ~22 fechamentos (~90–100 demos no trimestre, 7–8/semana) → **~$100k**. **VIÁVEL** — único caminho de motor único que toca $100k. Depende de capacidade de vendas + entrega do fundador, não de tráfego.

**Cenário C — BLENDED (RECOMENDADO):** roda o volante self-serve para MRR composto *e* o DFY founder-led para caixa agora. De-risca o B (não aposta tudo em fechar 22 deals) e conserta o A.

| SKU | Volume 90d | Caixa |
|---|---|---|
| GEO Sprint | 14 × $2.400 | $33.600 |
| Managed GEO (~1,8 mês na janela) | 9 × $1.900 × 1,8 | $30.780 |
| Growth anual (pré-pago) | 18 × $831 | $14.958 |
| Agency anual (pré-pago) | 4 × $1.251 | $5.004 |
| Growth mensal (~1,5 mês) | 20 × $99 × 1,5 | $2.970 |
| Agency mensal (~1,5 mês) | 5 × $149 × 1,5 | $1.118 |
| Get-Cited Kit | 120 × $29 | $3.480 |
| **TOTAL** | | **~$91.910** |

Mais um empurrão de urgência founder em anual (+6 anuais) ou +3 Sprints → **$100k**. O número que prende é **~1.700 testes grátis ≈ 28.000 visitantes** (2,3x a base) — exige esforço real de topo de funil (motor de conteúdo do fundador + ~$3–5k de pago + outbound). Se o tráfego só atingir 12k, as linhas self-serve caem ~metade e você compensa com mais DFY (que é leve em tráfego, pesado em esforço do fundador).

### Lado a lado

| | A: só subs | B: DFY-led | C: Blended (rec.) |
|---|---|---|---|
| GEO Sprints | 0 | 10–22 | 14 |
| Managed | 0 | 5–11 | 9 |
| Pré-pagos anuais | ~4 | ~8 | ~22 |
| Subs mensais | ~22 | passivo | ~25 |
| Kits | ~50 | ~50 | ~120 |
| Visitantes | ~12k | **~10k** (sales-led) | ~28k |
| **Caixa 90d** | **~$8,6k** | **~$70–100k** | **~$92–100k** |
| Exit ARR run-rate | ~$24k | ~$250–360k | ~$290k |
| Viabilidade | ❌ | ⚠️ grind | ✅ equilibrado |

### Mix de receita recomendado + metas por mês

Lidere com DFY + anual; subs por baixo. ~70% do caixa vem de high-ticket. Ritmo mensal aproximado (Cenário C):

- **Mês 1 (construir + começar a vender):** ligar checkout self-serve, ligar engines reais, lançar nutrição, gravar 2–3 vídeos de case; **3–4 GEO Sprints** via outbound do fundador + Kits começando. Alvo de caixa: ~$15–20k.
- **Mês 2 (escalar outbound + Product Hunt):** **5–6 Sprints**, primeiros Managed convertendo, anuais founder começando, pico de tráfego do PH. Alvo: ~$35–40k.
- **Mês 3 (colher recorrência + fechar a janela founder):** **5–6 Sprints**, Managed acumulando, push final de urgência em anuais. Alvo: ~$40–45k.

---

## 6. Posicionamento + packaging

### O wedge "audit + execute"
O moat não é a auditoria (vira commodity em 12 meses — Otterly, Promptmonitor, Spotlight, Mentions.so já fazem). O moat é o **loop fechado**: auditoria expõe a lacuna → plataforma gera o conteúdo GEO → OrganicPosts executa → próxima auditoria prova o ganho. Ferramentas de monitoramento vendem ansiedade sem saída; nós vendemos a saída.

**Por que aguenta no preço SMB:** os players mid/enterprise (AthenaHQ, Peec, BrandLight, Profound) são feitos para times de marketing que já têm redatores. O comprador SMB não tem time de conteúdo, nem conhecimento de GEO, nem tempo — para ele, um dashboard de problemas é inútil. **A camada de execução não é um feature para o SMB; é o produto inteiro.**

**Onde é frágil (honestidade):** (1) incumbentes podem colar um botão "gerar conteúdo IA" barato — por isso lidere com o braço *humano-executado* OrganicPosts, muito mais difícil de copiar; (2) conteúdo IA genérico pode *prejudicar* visibilidade se for slop — a barra de qualidade precisa ser defensável. Enquadre como "done-with-you / done-for-you GEO", não "clique para gerar".

**One-liner:** "Todo mundo te diz que você está invisível. Nós te tornamos citado."

### Escada de preços final + lógica de upsell

| Estágio | Oferta | Preço | Trabalho que faz |
|---|---|---|---|
| 0. Gancho | Teste grátis de visibilidade IA | $0 | Roda uma auditoria, mostra o score + lacunas. Aquisição pura. |
| 1. Tripwire | TrustIndex Kit | **$29 one-time** | Auditoria completa + benchmark + plano GEO. Converte navegador em comprador *carded*; qualifica para DFY. |
| 2. Assinatura | Growth | **$99/mo** | Monitoramento + tracking de score + créditos de conteúdo GEO (DWY). O volante. |
| 3. Assinatura | Agency / Multi-brand | **$249/mo** (subir de $149) | Múltiplas marcas, relatórios white-label, prioridade. Alargar o gap. |
| 4. High-ticket | OrganicPosts DFY | **$1.500–3.000/mo** retainer ou projeto | Executamos o plano todo. O motor de margem. |

**Decisão crítica: mantenha o $29 como tripwire ONE-TIME, rejeite a escada mensal $29/$79/$199 da análise.** Um $29 *mensal* ancora o produto como ferramenta de monitoramento barata — exatamente a categoria da qual queremos escapar — e canibaliza o motor de margem (DFY). Um $29 *one-time* é uma mão levantada por um resultado: lead DFY quente, não passivo de churn.

**Lógica de upsell:**
- **Free → $29:** o teste termina na lacuna, não no conserto. CTA: "Pegue o benchmark completo + seu plano GEO por $29." Este é o evento de conversão real (cartão na ficha).
- **$29 → $99:** o plano do Kit é um roteiro de N itens. CTA dentro do entregável: "Acompanhe seu score enquanto executa — Growth mantém a auditoria viva e dá M créditos/mês."
- **$29 / $99 → DFY:** quem abre o plano e não age em ~14 dias é o alvo DFY. "Sem tempo de fazer você mesmo? A OrganicPosts faz, e você vê o score subir." Os compradores de $29 que *não* fazem DIY são os melhores leads DFY.
- **$99 → $249:** disparado por uso (2ª marca, exportar relatórios para cliente).

**Recomendação de packaging de maior alavancagem:** produtizar o GEO Sprint em **3 tiers fixos** ($1.500 starter / $2.400 standard / $4.500 plus) para o comprador se auto-selecionar para cima, **vender o Sprint direto da página de resultado do teste grátis** (no momento de maior intenção), e **vender Managed como continuação padrão pré-paga trimestralmente** ($5.700 upfront = 3x o caixa na janela vs. mensal e trava retenção).

### Armar o case study (dogfooding)
1. **Vire a home, não um blog.** Widget ao vivo "TrustIndex's own TrustIndex Score" — número real, subindo, datado. O produto se provando em público vale mais que qualquer depoimento (e ainda não temos logos de clientes — temos recibos sobre nós mesmos).
2. **Cada vídeo amarrado a um degrau da escada.** Cada episódio demonstra um movimento do plano GEO — o mesmo que o Kit ($29) ensina e o que a OrganicPosts faz. O vídeo *é* o demo do entregável.
3. **Transforme a subida do score em prova de preço.** "Saímos de X para Y em N semanas usando só o que está no Kit." Justifica $29 (o método funciona) E DFY (a velocidade se nós fizermos).
4. **"Build in public" como moat de criação de categoria.** Nenhum incumbente faz isso — monitoramento não tem o que executar. Ser o dono da narrativa "veja o GEO funcionando, ao vivo" faz de nós a autoridade da categoria.
5. **Reaproveite na sequência de e-mail.** Cada episódio → um e-mail de nutrição nas sequências Free→$29 e $29→DFY.

---

## 7. Plano de otimização — primeiro mês (semana a semana)

Prioridade: ligar o que já está construído e só precisa ser ativado. Marcado **[CÓDIGO]** ou **[FUNDADOR]**.

### Semana 1 — Destravar o self-serve + começar a vender já
- **[CÓDIGO] Conserto nº 1: trocar os CTAs de pricing da waitlist para o checkout Stripe direto.** Hoje `PricingCard` aponta para `#waitlist-cta` (`page.tsx:1744-1781`); o checkout já existe (`billing.ts`) mas só pós-login. Apontar Growth/Agency direto ao checkout (ou login→checkout). **Maior bloqueador de receita.**
- **[CÓDIGO] Adicionar as chaves dos provedores no Railway** (OPENAI/GEMINI/PERPLEXITY/SERP) para sair do mock em 4 de 5 engines. Sem isto, "auditamos 5 engines de IA" não é entregável — risco de reembolso. Verificar que cada `*_API_KEY` está lida (já há fallback para mock em `packages/llm/src/providers/`).
- **[FUNDADOR] Começar o outbound DFY hoje.** Cold email + LinkedIn para SMBs com score ruim no teste grátis. Meta: 7–8 demos/semana. Esta é a única fonte de caixa imediata.
- **[FUNDADOR] Definir a janela "Founding Clients"** (vagas contadas + FOUNDER30) e o calendário.

### Semana 2 — Prova social + página de pricing
- **[FUNDADOR] Gravar 2–3 vídeos de case** do dogfooding usando as estatísticas defensáveis (Princeton +40%, Clarity 11x, Seer +120%, SOCi 1,2%). Estes alimentam home, vídeos e e-mails.
- **[CÓDIGO] Adicionar seção de prova social/depoimentos na landing** (hoje zero) — começar com o widget de "TrustIndex's own Score" ao vivo + os vídeos. Lacuna real confirmada.
- **[CÓDIGO] Criar a rota `/pricing` dedicada** (reaproveitar a `PricingSection` existente) para landing de ads e compartilhamento. E corrigir `/results` para não mostrar dados fake (ou rotular como exemplo).

### Semana 3 — Nutrição + oferta no momento de intenção
- **[CÓDIGO] Construir a sequência de nutrição multi-etapas** (lacuna real; só existe transacional). Drip Free→$29 e $29→DFY, reaproveitando os vídeos de case. Precisa de cron + lógica dia-1/3/7 (não existe hoje).
- **[CÓDIGO] Conectar a oferta de Sprint produtizada na página de resultado do teste grátis** — quando o score volta ruim, apresentar "Get Cited in 30 Days" com o case do fundador. Placement de maior conversão.
- **[CÓDIGO] (Se aprovado na Seção 6) Subir Agency de $149 para $249** e produtizar GEO Sprint em 3 tiers.

### Semana 4 — Pico de tráfego + recorrência
- **[FUNDADOR] Lançar no Product Hunt** alinhado à janela de founding members.
- **[FUNDADOR] Push de pré-pagamento anual** com FOUNDER30 em todo comprador self-serve (anual = ~8 meses de caixa hoje).
- **[FUNDADOR/CÓDIGO] Empurrar Managed como pré-pago trimestral** ($5.700 upfront) para os primeiros Sprints fechados.
- **[CÓDIGO] (Opcional, se houver fôlego) Wizard de onboarding** (add brand → competidores → 1ª auditoria) — backend já provisiona; falta a UI guiada para levar o pago ao valor.

### Sequenciamento honesto
Se houver que escolher, a ordem de impacto em caixa é: **(1) CTAs→checkout + chaves dos engines → (2) outbound DFY do fundador + vídeos de case → (3) oferta de Sprint na página de resultado → (4) nutrição → (5) prova social/pricing → (6) Product Hunt + push anual.** As tarefas [FUNDADOR] de venda direta são o que de fato traz o caixa em 90 dias; as [CÓDIGO] removem atrito e escalam.

---

**Bottom line:** $100k de caixa em 90 dias é alcançável, mas **não** como lançamento de assinatura SaaS — só como **push de serviços high-ticket liderado pelo fundador, com o volante self-serve por baixo (Cenário C)**. Reenquadre a métrica (caixa, não MRR), aponte o teste grátis para uma oferta de Sprint produtizada, pré-pague tudo que der, e ligue o que já está construído (checkout, engines reais, nutrição) na primeira semana.

Arquivos-chave: `apps/web/src/app/(marketing)/page.tsx` (pricing + CTAs de waitlist), `apps/api/src/routes/billing.ts`, `apps/web/src/app/account/billing/page.tsx`, `apps/api/src/routes/social-accounts.ts`, `apps/api/src/routes/onboarding.ts`, `packages/llm/src/providers/`, `apps/web/src/app/(marketing)/results/page.tsx`, `docs/marketing/research/geo-research-pack-2026.md`.