# Ozvor 100% PICA — auditoria, posicionamento, dois funis e plano de execução

Auditoria completa de produto, serviço, metodologia, site, dashboard, admin, SEO, redes, concorrência, go-to-market, customer experience e capacidade de execução. Data de corte: **3 de setembro de 2026**. Atualização estratégica: **funis independentes de AI Visibility e AI Stack, venda casada ética e caminho para US$10 mil de MRR em dezembro**.

> **Proveniência (nota da equipa, 03/09/2026):** este documento foi entregue pelo founder e é a fonte primária dos achados observados de interface. As screenshots referenciadas (`evidence/NN-*.png`) e os ficheiros irmãos (`CLAUDE-CODE-MASTER-PROMPT.md`, `report-app/dist/index.html`) ainda **não** foram entregues ao repositório — as referências abaixo são mantidas verbatim e os links de imagem podem não resolver até que a pasta `evidence/` chegue. Nenhuma afirmação deste relatório foi editada, resumida ou reinterpretada.

## Veredito executivo

**NO-GO para escalar aquisição agora.** Continue vendendo apenas em modo fundador/concierge, com baixa quantidade e acompanhamento manual, até os P0 deste relatório passarem.

A tese da Ozvor é excelente: SMBs não querem outro dashboard; querem saber se a IA as recomenda, por que perdem e o que fazer em seguida. A marca pública é forte, visualmente distinta, honesta sobre incerteza e corajosa ao publicar os próprios números. O problema está na entrega autenticada:

- Visibility atual: **42/100 ±7**.
- Citation Readiness: **54**.
- Execution: **100**, embora baseada em tarefas marcadas.
- Do Next: **0 tarefas abertas e 5 concluídas**, com mensagem “All caught up”.
- Vários intents permanecem em **0%**.
- Content: sem novos drafts; geração depende de BYOK e não havia chave configurada.
- Opportunity Radar: vendido como sinal ao vivo, mas está desligado.
- System Health: verde porque mede infraestrutura, não qualidade da entrega.

Essa contradição é o maior risco da empresa. O cliente pode pagar pela promessa de melhoria contínua e receber uma medição que piora, seguida de uma fila vazia que celebra conclusão.

O produto que precisa existir não é apenas “AI Visibility”. É um **Continuous Improvement OS para presença em IA**:

> Audit → Explain → Prioritize → Produce → Publish → Verify → Learn.

## 1. Registro da auditoria

| Etapa | O que foi auditado | Saúde | Saída/evidência |
|---|---|---:|---|
| 1 | Escopo, acesso e fontes | Concluída | Sessão autenticada confirmada; produção usada como fonte primária |
| 2 | Homepage e narrativa pública | Atenção | `evidence/02-home-hero-clean-desktop.png` a `09-home-footer-desktop.png` |
| 3 | Pricing, ofertas e conversão | Crítica | `evidence/12-pricing-desktop.png`, rotas de Kit/Audit/Pages/OrganicPosts |
| 4 | Dashboard autenticado completo | Crítica | `evidence/24` a `37`; versões sem dados pessoais em `55` a `57` |
| 5 | Admin e operação interna | Crítica | `evidence/38` a `48` |
| 6 | Sitemap, blog, recursos e legais | Atenção | 49 URLs do sitemap; 59 navegações públicas; 18 artigos individuais |
| 7 | Mobile e responsividade | Crítica | 390×844; documento renderizado com 631 px de largura |
| 8 | SEO, metadata, robots e headers | Atenção | 38 títulos duplicados, canonical/OG incompletos; segurança HTTP forte |
| 9 | Redes e autoridade externa | Crítica | LinkedIn, X, Instagram, YouTube, Reddit e TikTok; presença/prova ainda mínima |
| 10 | Benchmark de concorrentes | Concluída | SEOmonitor, Semrush, Ahrefs, Otterly, Profound, Peec e AthenaHQ |
| 11 | Síntese, arquitetura e backlog | Concluída | Este relatório, app interativo e prompt mestre Claude Code |

Cobertura quantitativa:

- **59 URLs públicas** inspecionadas no navegador.
- **49/49 URLs do sitemap** cobertas.
- **18/18 artigos** do sitemap inspecionados.
- **25 estados autenticados** entre dashboard e admin.
- Desktop **1440×900** e mobile **390×844**.
- Cabeçalhos HTTP, redirects, CSP, cache, robots.txt e sitemap.
- Redes vinculadas e resultados públicos indexáveis.
- Páginas oficiais atuais dos principais concorrentes.

Não houve acesso ao repositório, banco, filas, logs, Stripe ou dados de clientes externos. Portanto, causas internas são hipóteses a validar no código — os sintomas e contradições, porém, foram observados diretamente.

## 2. O que deve ser preservado

A Ozvor já tem ativos que muitos concorrentes não têm:

1. **Tese clara e emocional.** A história do comprador perguntando à IA é fácil de entender e conversa com SMBs.
2. **Identidade visual distinta.** O verde, a tipografia e a fotografia têm personalidade; não parece mais um SaaS genérico.
3. **Transparência.** `/results` mostra a própria queda 71 → 48, falhas de auditoria e ausência de testimonials inventados.
4. **Metodologia pública.** Há composição de score, incerteza, runs e version history.
5. **Cobertura de cinco engines.** É uma vantagem de amplitude para SMBs, desde que profundidade, paridade e qualidade sejam demonstradas.
6. **Segurança básica sólida.** CSP com nonce e `strict-dynamic`, HSTS, `frame-ancestors`, `X-Frame-Options: DENY`, `nosniff`, Permissions Policy e redirects de autenticação estão bem configurados.
7. **Biblioteca de ativos.** Guias, templates, tracker, battlecards, playbooks, emails e shortlist Reddit já existem.
8. **Posicionamento correto sobre continuidade.** A página pública comunica que visibilidade exige manutenção. Isso deve virar a unidade real de entrega.

O redesign não deve apagar essa força. A prioridade é fazer a operação corresponder à história.

## 3. O gap central entre promessa e entrega

### 3.1 O Do Next está logicamente errado

O dashboard mostra score baixo, perguntas perdidas e perfis ausentes, mas o Do Next contém cinco recomendações genéricas marcadas como concluídas:

- publicar conteúdo em formato de resposta;
- criar presença em Wikipedia/LinkedIn/G2;
- auditar consistência de perfis;
- publicar semanalmente;
- ativar monitoramento semanal.

Nenhuma delas referencia:

- prompt perdido;
- engine afetada;
- concorrente vencedor;
- fonte citada;
- URL a criar/alterar;
- hipótese de causa;
- artefato esperado;
- impacto estimado;
- owner;
- prazo;
- método de verificação.

Marcar a checkbox aumenta Execution, mas a interface admite que nada é publicado. Isso torna 100 um score de atividade declarada, não de execução.

**Invariante obrigatório:**

```text
if visibility < target
   or lost_intent_count > 0
   or critical_profile_missing
then open_action_count > 0
   or active_investigation != null
```

“All caught up” só pode aparecer quando não há gap material e todas as ações anteriores atingiram estado verificado.

![Do Next sem trabalho apesar do score baixo](./evidence/56-dashboard-do-next-main.png)

### 3.2 O Content quebra a promessa para SMBs

O produto público promete transformar auditoria em conteúdo. No dashboard observado:

- nenhum novo draft apareceu após a auditoria;
- geração depende de API key do cliente;
- nenhuma chave estava configurada;
- o usuário recebe um alerta fraco, não uma resolução.

BYOK pode existir como opção de controle/custo para agência técnica. Para SMB é fricção incompatível com “we do the work”.

**Mudança:** oferecer geração hospedada no plano, com quota transparente, fila assíncrona, retries, moderação, versionamento e BYOK opcional.

### 3.3 O Opportunity Radar é uma promessa vazia no produto pago

A tela diz “Live Reddit & AI-search openings, with the exact next move”, mas o estado real informa que ainda não está ligada.

![Radar de oportunidades indisponível](./evidence/57-dashboard-opportunity-radar-main.png)

O admin já lista um shortlist de 62 sinais Reddit. Existem duas opções honestas:

1. lançar um MVP alimentado por esse pipeline; ou
2. esconder a área e retirar a promessa até o produto estar funcional.

Feature vazia não pode permanecer na navegação de um plano Agency.

### 3.4 System Health mede a coisa errada

O admin valida API liveness, banco, Redis e chaves. Isso é necessário, mas não prova entrega. A saúde deve ficar amarela/vermelha quando:

- tenant com score baixo recebe zero ações;
- uma auditoria termina sem diagnóstico de delta;
- draft elegível não é gerado;
- prompt passa com relevância baixa;
- entidade fica ambígua;
- task fica “done” sem URL/prova;
- action regression não reabre a tarefa;
- fila excede SLA;
- comparação pública está sem revisão;
- score muda com método não comparável.

## 4. Por que o score pode estar piorando

O histórico administrativo mostra:

- Overall: **71 → 48** entre 30 Jun e 2 Set.
- Brand: **90 → 34**.
- AI Visibility: **50 → 42**.
- Três auditorias incompletas em 17 Ago.
- Duas auditorias no mesmo dia 29 Jul com Overall **24** e **41**.

Isso comprova deterioração/instabilidade, mas não sua causa. As hipóteses prioritárias são:

1. **Prompt universe errado.** Os prompts padrão observados perguntam por “best SaaS” e “SaaS for SMBs”, em vez de GEO, AI visibility, brand monitoring, local service ou agency use cases.
2. **Entidade ambígua.** Respostas confundem Ozvor com nomes semelhantes e medicamentos.
3. **Amostra pequena.** Onze prompts e runs limitados amplificam não determinismo.
4. **Mudança de método.** Tendências misturam pontuações sem rótulo claro de comparabilidade.
5. **Ausência de demanda real.** Prompts parecem escolhidos por categoria, não por volume, valor ou ocorrência em funil.
6. **Ação não específica.** Conteúdo e presença sugeridos não atacam a pergunta perdida nem a fonte vencedora.
7. **Sem feedback pós-ação.** O sistema não sabe se algo foi publicado, indexado, lido e citado.
8. **Sem dados externos.** GSC/GA estavam desabilitados; GBP não aparece como integração operacional.
9. **Mudança real do mercado.** Engines variam, concorrentes publicam e fontes mudam. O produto deve explicar essa parcela, não escondê-la.

### Correção metodológica

Crie três coortes de prompts:

- **Benchmark estável — 60%.** Congelado por 90 dias para trend comparável.
- **Opportunity — 20%.** Rotativo, derivado de novos sinais, fontes e concorrentes.
- **Customer custom — 20%.** Perguntas aprovadas pelo cliente.

Cada prompt precisa ter:

- intenção: discovery, problem, solution, comparison, trust, local, branded;
- vertical/subvertical;
- país, idioma e localidade;
- estágio do funil;
- volume/demanda e fonte;
- valor comercial;
- competidores esperados;
- validade/freshness;
- versão;
- score de relevância;
- owner.

Para cada engine registre provider, modelo/modo, timestamp, locale, retrieval on/off, resposta bruta, citações, latência, custo, retry e resultado de canary.

### Correção do score

Não use um número único para misturar coisas diferentes. Mostre:

1. **Observed Visibility** — menções ponderadas por demanda e valor, com intervalo.
2. **Citation Rate** — domínio citado quando a engine fornece fontes.
3. **Share of Voice** — participação frente a concorrentes no mesmo universo.
4. **Sentiment/Accuracy** — apenas onde a classificação tem confiança suficiente.
5. **Citation Readiness** — sinais técnicos, entidade, prova e conteúdo.
6. **Verified Execution** — ações em estados comprovados.
7. **Business Outcomes** — impressões, AI referrals, leads e receita, separados.

O trend precisa exibir badge **Comparable / Method changed / Prompt set changed / Engine changed**. Nunca conecte pontos incompatíveis como se fossem continuidade.

## 5. Ozvor Continuous Improvement OS

### 5.1 Loop-alvo

1. **Baseline:** entidade, aliases, domínio, categoria, mercados, produtos, localidades, concorrentes e metas.
2. **Intent Map:** GSC, Ads, PAA, keywords, CRM, FAQs, review mining e inputs do cliente.
3. **Probe:** runs repetidos por engine/mercado com controles e canaries.
4. **Normalize:** menção, posição, citação, fonte, sentimento, accuracy, false positive e ambiguity.
5. **Explain Delta:** contribuição por prompt, engine, concorrente, fonte, action e versão.
6. **Gap Classifier:** técnico, entidade, conteúdo, prova, reputação, off-site, local ou distribuição.
7. **Action Graph:** problema → hipótese → ação → artefato → canal → owner → verificação.
8. **Execute:** produzir e publicar com nível de autonomia definido.
9. **Verify:** indexação, crawl, nova resposta, mudança de fonte, menção e outcome.
10. **Learn:** estimar quais ações funcionam por vertical, mercado e engine.

### 5.2 Objeto obrigatório de ação

```ts
type VisibilityAction = {
  id: string;
  brandId: string;
  auditId: string;
  promptId: string;
  engine: string;
  market: string;
  language: string;
  gapType: 'technical' | 'entity' | 'content' | 'proof' | 'reputation' | 'offsite' | 'local';
  evidence: {
    lostPrompt: string;
    observedAnswerId: string;
    winningBrands: string[];
    citedSources: string[];
    targetUrl?: string;
  };
  hypothesis: string;
  recommendation: string;
  artifactType: string;
  channel: string;
  ownerType: 'ozvor' | 'client' | 'partner';
  effort: 'S' | 'M' | 'L';
  impact: number;
  confidence: number;
  priority: number;
  state: ActionState;
  acceptanceCriteria: string[];
  verificationPlan: {
    earliestCheckAt: string;
    promptIds: string[];
    leadingSignals: string[];
    successCondition: string;
    maxAttemptsBeforeReplan: number;
  };
};
```

Estados:

```text
Proposed → Drafting → Review → Published → Indexed → Cited → Verified
                  ↘ Rejected    ↘ Blocked    ↘ Expired    ↘ Regressed
```

Cada transição registra ator, timestamp, artefato, URL, evidência e motivo.

### 5.3 Classificação de gaps

| Evidência | Diagnóstico | Próxima ação típica |
|---|---|---|
| Página não crawlable/indexável | Technical | robots, canonical, status, schema, internal link |
| Entidade confundida | Entity | aliases, Organization/LocalBusiness, sameAs, profiles, corroboration |
| Concorrente citado por conteúdo próprio | Content gap | página específica para a pergunta e comparação |
| Concorrente citado por Reddit/G2/YouTube | Off-site gap | participação genuína, review program, vídeo ou PR |
| Marca citada, não recomendada | Proof/trust gap | claims verificáveis, reviews, credentials, cases |
| Prompt local perdido | Local gap | GBP, NAP, service area, local page, local reviews |
| Ação publicada, não mudou | Failed hypothesis | atualizar diagnóstico, não repetir template |

## 6. Redesign do dashboard

O cliente precisa entender cinco perguntas em menos de 60 segundos:

1. **Now:** onde estou?
2. **Change:** o que mudou?
3. **Why:** por que mudou?
4. **Do:** qual é a próxima melhor ação?
5. **Proof:** o que foi feito e o que aconteceu depois?

### Overview

- Hero: Visibility + intervalo + comparabilidade + data do último run.
- “What changed”: decomposição do delta por engine, prompt, concorrente e fonte.
- “Biggest opportunity”: uma ação principal com impacto/confiança.
- “Evidence”: pergunta e resposta exata, em linguagem do cliente.
- “Progress”: ações por estado, não checkboxes.
- Remover erros raw, offsets e chaves internas da UI do cliente.

### Do Next

Cards devem conter:

- ação em linguagem simples;
- “because” com evidência;
- prompt/engine afetados;
- exemplo do concorrente/fonte vencedora;
- artefato que Ozvor criará;
- impacto/confiança/esforço;
- owner e deadline;
- critério de aceite;
- botão: Generate draft / Review / Connect / Mark blocked;
- estado de verificação e próxima rechecagem.

### Content

- Geração hospedada por padrão.
- Drafts ligados a gaps e prompts, nunca soltos.
- Brief, sources, claims e fact-check visíveis.
- Approval workflow, version diff, publish target e rollback.
- Status: Draft → Approved → Published → Indexed → Cited.

### Sources

Não confundir “a engine citou Wikipedia” com “a marca possui presença válida na Wikipedia”. Separar:

- source ecosystem da resposta;
- profile/listing oficial da marca;
- domínio/página citada;
- oportunidade de presença;
- prova de propriedade/verificação.

### Competitors

- Remover nomes de fornecedores internos como `dataforseo` da UI.
- Explicar por que cada concorrente venceu.
- Mostrar prompt, engine, posição, fonte e mudança temporal.
- Permitir comparação por mercado e intenção.

### OrganicPosts

- Unificar o nome: a tela usa “Prime”, o marketing usa OrganicPosts.
- Corrigir 3/3 versus 5 ações concluídas.
- Não bloquear recursos para o próprio workspace Agency sem explicação.
- Mostrar calendário, artefatos, aprovações, SLA e outcomes.

## 7. Arquitetura de produtos e pricing

O portfólio atual sobrepõe entregas. Recomendação:

### Free Check

Objetivo: provar o problema, não fingir diagnóstico completo.

- 5 engines com amostra explícita.
- Uma pergunta por intent crítico.
- Incerteza e limitações visíveis.
- Uma oportunidade demonstrativa.
- CTA único para Growth ou Managed.

### Growth

Objetivo: ciclo contínuo self-serve/assisted.

- baseline robusto;
- intent universe segmentado;
- weekly monitoring;
- dynamic Do Next;
- geração hospedada;
- integrações;
- monthly review;
- prova e verificação.

### Managed / OrganicPosts

Objetivo: Ozvor executa o ciclo. Não vender quantidade de posts como unidade principal.

- onboarding e baseline;
- weekly action plan;
- produção/publicação aprovada;
- reputação e third-party presence;
- rechecagem e aprendizado;
- monthly business review;
- SLA claro.

### Agency

Só vender como tier próprio quando houver:

- multi-tenant consistente;
- roles e permissions;
- white-label real;
- export compartilhável;
- API/webhooks;
- budgets/costs;
- audit log;
- SLA e suporte;
- 10 vs 15 marcas/sites reconciliado.

Kit, AI Audit e Pages devem virar add-ons, onboarding artifacts ou fulfillment interno. Não competir com os planos principais.

## 8. Blueprint do serviço

### Onboarding

1. Verificar autoridade sobre a marca.
2. Capturar entity registry.
3. Selecionar mercado, idioma, localidades e produtos.
4. Importar GSC/GA/GBP e competitors.
5. Aprovar core prompt universe.
6. Rodar baseline com QA.
7. Fazer kickoff explicando score, incerteza e primeira ação.

### Cadência

- **Diária:** health, canaries, sinais externos, filas, regressões e freshness.
- **Semanal:** auditoria, delta, ação, drafts e aprovação.
- **Mensal:** outcomes, aprendizado, mudança de estratégia e roadmap.
- **Trimestral:** refresh do prompt universe e benchmark competitivo.

### Autonomia segura

- L0: observa.
- L1: recomenda.
- L2: gera draft.
- L3: publica apenas em canais/ações pré-aprovados.

Tudo que altera site, social, review, billing ou dados externos exige policy, approval, audit log e rollback.

### SLAs sugeridos

- auditoria elegível concluída ou explicada no prazo prometido;
- primeira ação útil até 1 dia útil após baseline;
- draft até 1 dia útil após aprovação da ação;
- resposta de suporte conforme plano;
- investigação automática de regressão em até 24h;
- zero “all caught up” falso.

## 9. Site, UX e conversão

### Problemas P0/P1

1. **Overflow mobile:** viewport 390 px gerou documento de 631 px em home, pricing, test e dashboard.
2. **CTA/claim:** “no signup wall” conflita com email obrigatório e possível criação de conta.
3. **Home form:** inputs têm labels, mas `required=false`; `/test` usa required.
4. **Privacy banner:** mensagem de Califórnia aparece em Lisboa/UE e às vezes com contraste muito baixo.
5. **OrganicPosts:** trecho de checklist quase invisível em fundo claro.
6. **Support:** sistema visual e navegação diferentes do restante do site.
7. **Landing route:** `/landing-pages` é um shell autenticado sem canonical; produto público é `/local-pages`.
8. **Duas marcas no switcher:** “Ozvor” aparece duplicada.

![Homepage em mobile; visual forte, mas documento excede o viewport](./evidence/50-home-mobile.png)

### Copy

Substituir promessas determinísticas como “Ozvor puts your name in that answer” por:

> Ozvor measures where your brand loses, executes evidence-backed actions, and keeps rechecking whether visibility improves.

Não prometer citação. Prometer processo verificável, qualidade, cadência e transparência.

### Prova

- Manter slots de testimonials vazios em vez de inventar.
- Criar design partners explícitos com consentimento.
- Publicar cases com baseline, ação, tempo, leading indicators, outcome e limitações.
- Usar a própria queda como case operacional: “o que mudou, o que fizemos, o que aconteceu”.

## 10. SEO, GEO e conteúdo próprio

### Achados

- **38 páginas** com título `| Ozvor | Ozvor`.
- **5 rotas válidas** sem canonical.
- **11 páginas** sem OG image.
- `/play` sem H1 semântico no snapshot inicial e sem robots/JSON-LD específicos.
- Sitemap publica `lastmod` de páginas estáticas como timestamp do deploy.
- Home responde `private, no-cache, no-store`; avaliar cache público seguro.
- Metodologia lista modelos antigos como GPT-4o e Claude 3.5 Sonnet.
- Admin diz 10 blog posts; blog ao vivo tem 19.

### Correções

1. Centralizar metadata template e impedir duplicação de brand suffix.
2. Testar canonical/OG/robots/H1 em CI para todas as rotas indexáveis.
3. Gerar `lastmod` de conteúdo real, não build time.
4. Criar OG por template de article/resource/legal.
5. Adicionar `/admin`, APIs e rotas internas ao robots por clareza, sem tratar robots como segurança.
6. Separar cache público e privado.
7. Atualizar metodologia por capabilities/version, não nomes de modelos congelados.
8. Expor changelog de metodologia e comparabilidade.
9. Usar cluster por vertical/mercado, não apenas conteúdo genérico sobre GEO.
10. Construir conteúdo a partir dos prompts perdidos reais da própria Ozvor.

## 11. Redes sociais e autoridade externa

### Estado observado

- LinkedIn: empresa fundada em 2026, um empregado e base de seguidores de um dígito no resultado indexado.
- X: snapshot público encontrou 1 seguidor e 68 following.
- Instagram, YouTube, Reddit e TikTok estão vinculados, mas sem autoridade indexável relevante encontrada.
- G2 configurado como perfil de usuário, não product listing.
- Crunchbase/Wikipedia ausentes; Trustpilot ainda sem prova substancial.

### Incidente de conteúdo

Um post público do LinkedIn inclui texto interno:

- “Claim-basis (nota interna)”;
- referência a arquivo de pesquisa;
- owner;
- instrução de “link no 1º comentário”.

Remover/corrigir imediatamente. Depois implementar pre-publish guard:

```text
block if content matches:
claim-basis | nota interna | owner: | TODO | PR # | internal | link no 1o comentario
```

### Estratégia de autoridade

Não abrir seis canais com volume baixo. Sequência:

1. LinkedIn founder + brand como canal primário.
2. YouTube com demos/teardowns e transcripts citáveis.
3. Reddit com participação genuína e disclosure.
4. G2/Trustpilot com programa ético de review após entrega real.
5. X como distribuição secundária.
6. Instagram/TikTok apenas quando houver capacidade de vídeo nativo.

Cada conteúdo deve ter claim registry, fonte, validade, owner, approval e link ao prompt/vertical que pretende influenciar.

## 12. Legal, privacidade e confiança

Não é aconselhamento jurídico; exige counsel nos mercados atendidos.

Contradições observadas:

- Privacy afirma caminhos EU-hosted para AI providers; Sub-processors diz que Anthropic EU inference é roadmap e usa SCCs.
- DPA fala em EU-hosted paths e exclusão de Perplexity na UE; confirmar se routing real aplica isso.
- Terms usa “company being incorporated” e também descreve MEI/CNPJ.
- Privacy diz que lista de subprocessadores está disponível “on request”, mas existe página pública.
- Form Do Not Sell usa inputs sem `name` no DOM extraído e method GET; confirmar intercept seguro e receipt auditável.
- Falta representante Art. 27 na UE é declarada; validar obrigação e timing antes da escala.

Criar compliance matrix por Brasil/EU/EUA:

- data categories;
- controller/processor role;
- region;
- transfer mechanism;
- retention/deletion;
- DSR SLA;
- subprocessors;
- model training/retention terms;
- automated decision/AI disclosure;
- proof of implementation.

## 13. Benchmark competitivo

![SEOmonitor ancora AI visibility em demanda real de busca](./evidence/49-seomonitor-ai-visibility.png)

### SEOmonitor

Vantagem: pergunta reproduzível derivada de keyword, volume Google real, mercado, score ponderado e resposta verificável. Limite: apenas ChatGPT e AI Overviews no v1 e refresh trimestral no snapshot atual.

### Ahrefs Brand Radar

Vantagem: 405M+ prompts search-backed, sete plataformas, sources/funnel, Reddit/YouTube/TikTok, API. Limite: preço e complexidade maiores; custom tracking tem custos.

### Semrush

Vantagem: ecossistema SEO, site audit, prompt research, competitor analysis, reporting. Limite: conteúdo/automação pode exigir toolkit separado.

### Otterly

Vantagem: entrada $29, daily tracking e recomendações. A página da Ozvor não pode tratá-lo como diagnóstico puro sem recomendações.

### Profound

Vantagem: enterprise depth, fact checking, multi-engine, governance. Starter existe a $99 anual; chamar de “não funcional” é subjetivo.

### AthenaHQ

É o benchmark mais próximo da visão desejada: action agent, on/off-page actions e self-learning. Ozvor pode vencer em simplicidade, preço, local SMB e serviço humano — não fingindo que essa camada já existe.

### Correção dos comparativos Ozvor

Cada claim precisa de:

- source URL;
- quoted field/fact;
- checkedAt;
- owner;
- nextReviewAt;
- confidence;
- factual vs opinion;
- automated stale flag.

Congelar páginas de comparação até atualizar Ahrefs, Semrush, Otterly e Profound.

## 14. Admin como command center

O admin deve responder “estamos entregando?” antes de “as APIs estão online?”.

### Quality SLOs

- Audit completion rate.
- Prompt relevance pass rate.
- Entity resolution confidence.
- Recommendation coverage: gaps com ação/explicação.
- Time to first useful action.
- Draft generation success/time.
- Verified execution rate.
- Regression investigation SLA.
- Action success rate por gap/vertical/mercado.
- Customer-visible raw error leakage.
- Comparable trend coverage.
- Evidence freshness.

### Tenant canário

Usar Ozvor como canário diário:

- golden prompts versionados;
- expected relevance and category;
- minimum action coverage;
- no false positive de entidade;
- draft canary;
- publish sandbox;
- verify canary;
- alerta que torna System Health amarelo/vermelho.

## 15. KPIs que importam

### North Star

**Verified Visibility Improvements per Active Brand per 30 Days.**

Uma improvement só conta quando há:

- baseline comparável;
- ação ligada ao gap;
- evidência de execução;
- rechecagem;
- mudança além do ruído acordado ou confirmação repetida.

### Leading indicators

- % de lost intents com ação específica.
- % de ações com artefato e verification plan.
- time to first value.
- drafts approved/published.
- published → indexed.
- indexed → cited.
- prompt relevance pass.
- entity ambiguity rate.
- action reopen/regression rate.

### Customer/business

- activation: primeiro audit + primeira ação aprovada.
- weekly active brands.
- retained monitored brands.
- expansion Managed/Agency.
- churn reason por delivery gap.
- support contact rate por audit.
- GSC impressions / AI referrals / leads / revenue, sem misturar com Visibility.

## 16. Backlog priorizado

### P0 — 48 horas

| ID | Mudança | Critério de aceite |
|---|---|---|
| P0-01 | Bloquear “All caught up” falso | Score/gaps baixos sempre geram ação específica ou investigação |
| P0-02 | Parar de usar checkbox como conclusão | Execution só avança com evidência de estado |
| P0-03 | Ocultar radar/drafts não funcionais | Nenhuma oferta paga conduz a promessa vazia |
| P0-04 | Corrigir post LinkedIn com nota interna | Post limpo e lint impede reincidência |
| P0-05 | Congelar comparativos desatualizados | Claims atuais com fonte, owner e checkedAt |

### P0 — 7 dias

| ID | Mudança | Critério de aceite |
|---|---|---|
| P0-06 | Novo prompt universe | 100% com intenção, mercado, idioma, demanda, fonte e versão |
| P0-07 | Gap Classifier + Action Generator | 100% dos gaps relevantes com ação/evidência/verificação |
| P0-08 | Geração hospedada | Auditoria elegível produz draft sem chave do cliente |
| P0-09 | Delivery Health | Canário falha quando loop central quebra |
| P0-10 | Responsividade | Zero overflow horizontal a 390 px nos fluxos principais |

### P1 — 30 dias

- P1-01: metodologia versionada, benchmark congelado e delta decomposition.
- P1-02: entity registry e false-positive classifier.
- P1-03: GSC, GA e GBP operacionais.
- P1-04: metadata, canonical, OG, sitemap e cache.
- P1-05: reconciliação legal com counsel.
- P1-06: portfólio simplificado e entitlements coerentes.
- P1-07: UX Now/Change/Why/Do/Proof.
- P1-08: hosted generation, approvals e publish adapters.
- P1-09: review/product listings reais.
- P1-10: analytics/admin denominators reconciliados.

### P2 — 60–90 dias

- autonomia L0–L3;
- agency roles/white-label/API/audit logs;
- learning system de action success;
- local/GBP depth por país;
- SEO/Organic/Ads sobre intent graph compartilhado;
- outcome attribution e incrementalidade.

## 17. Testes de aceite obrigatórios

### Unit/integration

- Não criar `All caught up` com gaps materiais.
- Completion manual não pode produzir Verified.
- Cada lost prompt gera action ou investigation.
- Entity false positive não conta menção.
- Method version change quebra linha comparável.
- BYOK ausente usa provider hospedado onde plano permite.
- Draft failure cria retry/alerta, não silêncio.
- Published exige URL; Indexed exige prova; Cited exige response evidence.
- Regression reabre ação.
- GSC/GA null é “not connected”, nunca zero.

### E2E

1. Criar brand SMB local US, EU e BR.
2. Aprovar prompt universe em idioma/localidade corretos.
3. Rodar audit.
4. Validar score, CI e comparabilidade.
5. Abrir cada prompt perdido e evidência.
6. Gerar ação e draft sem BYOK.
7. Aprovar/publicar em sandbox.
8. Verificar estado e próxima rechecagem.
9. Simular no-change e regression.
10. Garantir replan/reopen.

### Visual/accessibility

- 320, 375, 390, 768, 1024 e 1440 px.
- sem overflow horizontal;
- teclado, foco, labels e error states;
- WCAG AA para texto e controles;
- reduced motion e screenshot/crawler sem conteúdo invisível;
- tabelas do dashboard com scroll interno;
- nenhuma PII em exports ou evidence compartilhável.

## 18. Critério para reabrir escala comercial

Todos devem ser verdadeiros:

- P0-01 a P0-10 concluídos.
- Tenant canário passa por duas semanas.
- Dez auditorias consecutivas elegíveis com recommendation coverage de 100%.
- Nenhuma task “done” sem evidência.
- Hosted generation com sucesso e retries.
- Trend comparável/versionado.
- Comparativos atualizados.
- Mobile sem overflow.
- Legal contradictions reconciliadas.
- Primeiro design partner entende Now/Why/Do/Proof sem intervenção do fundador.

Até lá, cold outreach pode continuar com limite baixo, posicionamento de design partner e prestação concierge manual. Não aumentar tráfego pago nem volume que exceda a capacidade de acompanhar cada cliente.

## 19. Fontes

Fontes Ozvor:

- [Homepage](https://ozvor.com/)
- [Pricing](https://ozvor.com/pricing)
- [How it works](https://ozvor.com/how-it-works)
- [How we measure](https://ozvor.com/how-we-measure)
- [Live results](https://ozvor.com/results)
- [OrganicPosts](https://ozvor.com/organicposts)
- [Compare](https://ozvor.com/vs)
- [Resources](https://ozvor.com/resources)
- [Privacy](https://ozvor.com/privacy-policy)
- [Terms](https://ozvor.com/terms-of-service)
- [DPA](https://ozvor.com/legal/dpa)
- [Sub-processors](https://ozvor.com/legal/sub-processors)
- [LinkedIn](https://www.linkedin.com/company/ozvor1)

Benchmark oficial:

- [SEOmonitor methodology](https://www.seomonitor.com/ai-visibility/methodology)
- [SEOmonitor how it works](https://www.seomonitor.com/ai-visibility/how-it-works)
- [Semrush AI pricing](https://www.semrush.com/pricing/ai/)
- [Ahrefs Brand Radar](https://help.ahrefs.com/en/articles/11064852-what-is-brand-radar-and-how-to-use-it)
- [Ahrefs AI metrics](https://help.ahrefs.com/en/articles/15501968-ai-visibility-metrics)
- [Otterly pricing](https://otterly.ai/pricing)
- [Profound pricing](https://www.tryprofound.com/pricing)
- [Peec pricing](https://peec.ai/pricing)
- [AthenaHQ](https://athenahq.ai/)

## 20. Arquivos entregues

- `RELATORIO-AUDITORIA-COMPLETA-OZVOR.md` — relatório integral.
- `CLAUDE-CODE-MASTER-PROMPT.md` — prompt operacional para implementação.
- `report-app/dist/index.html` — relatório interativo com dados e proveniência inspecionáveis.
- `evidence/` — screenshots numerados.

O prompt mestre deve ser usado dentro do repositório. Ele manda o Claude Code primeiro mapear arquitetura e testes, confirmar hipóteses no código e implementar por gates, sem “reescrever tudo” às cegas.

---

# PARTE II — POSICIONAMENTO, DOIS FUNIS E META DE US$10K MRR

Esta parte amplia — e não substitui — a auditoria acima. Os sintomas de produção continuam sendo os observados nas 57 evidências. Nesta rodada, a sessão autenticada já não estava disponível; por isso, nenhuma nova afirmação sobre estado interno foi inventada. A ampliação abaixo combina os fatos já capturados com pesquisa de mercado atualizada e decisões recomendadas de produto/negócio.

## 21. Veredito estratégico atualizado

**A tese de venda casada está correta; o destino comercial atual está errado.** AI Visibility e AI Stack resolvem dois jobs diferentes:

- **AI Visibility:** “minha empresa aparece, é entendida e é recomendada quando compradores perguntam às IAs?”
- **AI Stack / AI Operations:** “estamos usando as ferramentas, dados e workflows certos para produzir resultado com segurança e ROI?”

Ambos podem compartilhar conta, business profile, workflow engine, Action Graph, customer success e o método `Measure → Prioritize → Execute → Verify`. Mas **OrganicPosts não é um destino semanticamente honesto para o AI Stack Audit**. Um comprador que pede racionalização de ferramentas e automação não espera cair num serviço chamado “posts orgânicos”.

Decisão recomendada:

1. Manter **OrganicPosts by Ozvor** como motor managed de conteúdo/autoridade para AI Visibility.
2. Criar **Ozvor AI Ops** como implementação e melhoria contínua do stack/workflows.
3. Colocar ambos sob o guarda-chuva **Ozvor Managed**, com módulos Visibility, AI Ops ou Dual.
4. Compartilhar o mesmo customer command center, sem misturar entregáveis, métricas ou promessa.

O cliente deve permanecer porque recebe valor recorrente, memória operacional e melhoria comprovada — nunca por fricção artificial, dark pattern ou falta de portabilidade.

## 22. Onde o mercado confirma a oportunidade

O mercado é enorme, mas isso não autoriza um posicionamento amplo demais.

- A [SBA](https://advocacy.sba.gov/wp-content/uploads/2025/06/State_Profiles_2025_Technical-Notes.pdf) reporta **36,2 milhões** de small businesses nos EUA.
- O [U.S. Census Bureau](https://www.census.gov/library/stories/2026/05/ai-use-businesses.html) encontrou uso de IA em aproximadamente **17%–20%** das empresas entre dez/2025 e mai/2026; menos de 20% nas empresas com até quatro funcionários. A [U.S. Chamber](https://www.uschamber.com/technology/artificial-intelligence/u-s-chambers-latest-empowering-small-business-report-shows-majority-of-businesses-in-all-50-states-are-embracing-ai), usando definição/amostra diferentes, reportou 58% de uso de IA generativa em small businesses. A divergência prova que a Ozvor deve publicar definição e coorte, não repetir estatísticas sem contexto.
- A [Eurostat](https://ec.europa.eu/eurostat/web/products-eurostat-news/w/ddn-20251209-2) contou **33,5 milhões** de empresas na UE em 2024, 99% micro ou pequenas; em 2025, 20% das empresas usavam IA, com adoção inferior nas SMEs.
- O Brasil tinha **24,2 milhões** de empresas ativas no segundo quadrimestre de 2025, 93,8% micro e pequenas, segundo o [Ministério do Empreendedorismo](https://www.gov.br/memp/pt-br/assuntos/noticias/abertura-de-empresas-cresce-14-1-no-2o-quadrimestre-de-2025-no-brasil). A [TIC Empresas 2024](https://cetic.br/noticia/empresas-contratam-solucoes-de-ia-no-setor-privado-mas-parcerias-com-universidades-ainda-sao-limitadas-revela-pesquisa/) encontrou 13% de adoção de IA; entre as não usuárias, custo, conhecimento, pessoas, dados e clareza legal aparecem como barreiras.
- A [OECD](https://www.oecd.org/en/publications/ai-adoption-by-small-and-medium-sized-enterprises_426399c1-en.html) conclui que adoção em SMEs segue abaixo das grandes empresas e depende de conectividade, dados/compute, skills e finanças.

Leitura correta: existe demanda por ajuda simples, aplicada e contínua. Leitura incorreta: tentar vender simultaneamente para “todas as SMBs” em três regiões.

### Saturação competitiva

AI Visibility já é uma categoria competitiva:

- [Semrush](https://www.semrush.com/pricing/ai/) oferece visibility, prompt research, competitor analysis e AI-readiness site audit por US$99/mês por domínio no anual.
- [Ahrefs Brand Radar](https://help.ahrefs.com/en/articles/11064852-what-is-brand-radar-and-how-to-use-it) usa centenas de milhões de prompts search-backed, fontes off-site e sete plataformas; custom prompts começam em pacotes próprios.
- [Otterly](https://otterly.ai/pricing) começa em US$29/mês e já inclui recomendações, GEO audit, citações e tracking diário. Sua [documentação de recomendações](https://help.otterly.ai/ai-recommendations) publica triggers, pré-condições, refresh e prioridades.
- [Profound](https://www.tryprofound.com/features/answer-engine-insights) cobre visibility, share of voice, citations, sentiment, positioning, FactCheck e daily runs.

AI Stack/Readiness também tem entrada comoditizada:

- A [Microsoft](https://learn.microsoft.com/en-us/assessments/94f1c697-9ba7-4d47-ad83-7c6bd94b1505/) oferece assessment de sete pilares com recomendações personalizadas e reavaliação.
- A [OECD](https://sme.oecd.ai/) oferece ferramenta piloto gratuita de AI readiness para SMEs.
- A [HubSpot Academy](https://academy.hubspot.com/lessons/assessing-your-ai-maturity) ensina gratuitamente assessment de maturidade; a empresa também publica teste de maturidade multidimensional.

Conclusão: **um score, um PDF ou a recomendação de uma ferramenta não são moat**. A brecha competitiva é fechar o ciclo para SMBs: evidência compreensível, ação específica, execução assistida/managed, verificação e valor de negócio.

## 23. Posicionamento que a Ozvor deve adotar

### Categoria e frase-mãe

**Categoria interna:** AI Growth & Operations System for SMBs.

**Promessa pública recomendada:**

> Ozvor finds where AI is costing your business visibility or time, turns the gaps into a weekly plan, and proves what changed.

Na homepage, manter AI Visibility como wedge principal até o AI Ops ter entrega verificável:

> Get recommended by AI — then keep improving every week.

Subheadline:

> See where ChatGPT, Gemini, Perplexity, Copilot and Google AI miss your business. Ozvor explains why, builds the next actions and verifies the result.

Entrada secundária visível, não concorrente:

> Looking to fix how your company uses AI? Audit your workflows and stack.

### Diferencial defensável

Não competir em “mais prompts”, “mais engines” ou “maior database”. Competir em:

1. **Closed loop para SMB:** prompt → gap → ação → artefato → publicação/implementação → prova → aprendizado.
2. **Explicação de mudança:** decomposição da variação e incerteza, sem score mágico.
3. **Execution-native:** self-serve que gera trabalho utilizável e managed que conclui o trabalho.
4. **Business outcomes:** conectar citações e automações a leads, horas, custo, conversão e risco.
5. **SMB-grade UX:** linguagem simples, prioridade clara, poucas ações de alto impacto e preço previsível.

### ICP até dezembro

Não lançar três geografias e dez verticais com o mesmo peso. Para atingir MRR em 17 semanas:

- **Mercado primário:** EUA.
- **ICP inicial:** empresas B2B de serviços profissionais, consultorias e agências, 5–50 pessoas, ticket de cliente superior a US$1.000, website ativo, owner/founder acessível e já investindo em conteúdo/SEO.
- **Buyer:** founder, head of growth/marketing ou agência pequena.
- **Trigger:** queda/ausência em AI answers, rebrand/site novo, dependência de referrals, conteúdo sem retorno ou stack fragmentado.
- **Desqualificação:** pré-receita sem prova, ticket muito baixo, nenhuma capacidade de aprovação/publicação, expectativa de garantia de ranking, setores regulados sem owner de compliance.
- **UE:** piloto controlado em inglês/Portugal após fechar DPA, residency, consentimento e copy jurídica.
- **Brasil:** validação de mensagem/preço em português; não usar o mesmo preço/conversão do mercado americano como premissa.

Agências podem ser clientes e canal, mas precisam de regra explícita de conflito, white-label, território e ownership do relacionamento.

## 24. Arquitetura de marca e catálogo

### Guarda-chuva

**Ozvor** = plataforma e método.

**Ozvor Managed** = serviço recorrente com execução humana + automação supervisionada.

### Funil A — Get Found by AI

| Degrau | Oferta | Promessa | Preço recomendado para teste | Próximo passo |
|---|---|---|---:|---|
| A0 | Free AI Visibility Check | baseline amostral, incerteza e 1 gap real | Grátis | Get-Cited Kit |
| A1 | Get-Cited Kit | top 3 gaps + 3 drafts + plano 30 dias | US$29 one-time | Growth |
| A2 | Visibility Growth | tracking semanal + Do Next dinâmico + hosted drafts | **US$149/mês** | Managed Visibility |
| A3 | Managed Visibility / OrganicPosts | execução, publicação assistida, autoridade e monthly review | a partir de **US$1.500/mês** | Dual |

O Growth atual a US$99 pode ser mantido para usuários existentes. US$149 é hipótese comercial para novo catálogo e só deve entrar após teste/feature flag e prova de valor.

### Funil B — Run Better with AI

| Degrau | Oferta | Promessa | Preço recomendado para teste | Próximo passo |
|---|---|---|---:|---|
| B0 | Free AI Efficiency Score | 5 minutos, maturidade e 1 workflow prioritário | Grátis | Snapshot |
| B1 | AI Opportunity Snapshot | 1 workflow, opções de solução, ROI range e 14-day plan | **US$49 one-time** | Full Audit |
| B2 | AI Workflow & Stack Audit | até 5 workflows, stack/spend, riscos, roadmap e business case | **US$499 one-time** | Sprint |
| B3 | AI Implementation Sprint | implementar 1–2 workflows com QA, SOP e treinamento | a partir de **US$2.500** | AI Ops Care |
| B4 | AI Ops Care | monitorar adoção, custos, incidentes e backlog mensal | a partir de **US$750/mês** | Dual |

O atual “AI Audit Stack $49 — we pick one tool” deve virar B1. Ele é pequeno demais para ser chamado de full audit e perde para avaliações gratuitas que já cobrem estratégia, dados, governança e skills.

### Bundle

- **Ozvor Managed Visibility:** US$1.500/mês.
- **Ozvor Managed AI Ops:** US$1.500/mês quando a capacidade de delivery estiver comprovada.
- **Ozvor Managed Dual:** US$2.500/mês; um account lead, dois scorecards, dois backlogs e uma business review.

Não aplicar preços automaticamente em billing. Criar price catalog versionado, feature flags e experimento; exigir confirmação comercial antes da migração.

### O que fazer com ofertas atuais

- **Free:** manter e tornar honesto sobre amostra.
- **Kit:** manter como tripwire do funil Visibility.
- **AI Audit $49:** renomear para Snapshot; não vender como auditoria completa.
- **Pages $99:** transformar em add-on/artefato recomendado pelo Action Graph, não terceiro funil.
- **Growth $99:** grandfather; testar US$149 para novos logos após fechar P0.
- **Agency $549:** pausar escala até multi-tenant, papéis, white-label, export, API, cost controls e SLA passarem.
- **OrganicPosts:** manter como módulo managed de Visibility; não fazer dele o nome do AI Ops.

## 25. Os dois funis, separados e conectados

### Funil A — eventos e gates

`visibility_landing_viewed → free_check_started → entity_confirmed → prompt_set_confirmed → free_check_completed → gap_viewed → kit_offered → kit_paid → assets_delivered → retest_due → growth_started → first_weekly_action → first_verified_win → managed_qualified → managed_closed`

Gates:

1. Free result só aparece depois de confirmar entidade, mercado, idioma e categoria.
2. Toda oferta paga deve demonstrar um gap concreto; nunca bloquear o único resultado atrás de pagamento.
3. Kit entregue em até 10 minutos ou com ETA/status real.
4. Growth só ativa depois de baseline válido e prompt universe revisado.
5. Managed é ofertado por necessidade de execução/capacidade, não por pop-up genérico.

### Funil B — eventos e gates

`ai_ops_landing_viewed → efficiency_score_started → workflow_inventory_completed → score_completed → snapshot_paid → evidence_collected → opportunity_ranked → audit_qualified → full_audit_paid → roadmap_approved → sprint_scoped → sprint_paid → workflow_live → outcome_verified → care_started`

Gates:

1. Capturar objetivo, workflow, volume/frequência, owner, ferramentas, custo, dados, risco e aprovação.
2. Não recomendar ferramenta sem `evidenceDate`, fonte oficial, preço/limite, integração, security/privacy e alternativas.
3. ROI sempre em range com inputs editáveis; nunca prometer economia como fato.
4. Sprint exige Definition of Done, teste de qualidade, human-in-the-loop, rollback e SOP.
5. Care só começa após baseline operacional e métrica de outcome.

### Cross-sell baseado em evidência

- Visibility → AI Ops quando o sistema detecta que falta capacidade para produzir/publicar, há ferramentas redundantes ou workflow manual bloqueando o plano.
- AI Ops → Visibility quando marketing/sales é workflow prioritário e a empresa não tem baseline de AI discovery.
- Qualquer → Dual apenas após provar valor no primeiro módulo ou quando o discovery demonstra dois problemas com owners/orçamento.
- Registrar `cross_sell_reason`, `evidenceIds`, `expectedOutcome`, `owner` e `nextReviewAt`.
- Limitar frequência; permitir dismiss/snooze; jamais ocultar valor já comprado.

## 26. Metodologia completa do AI Stack / AI Ops

O assessment deve avaliar sete dimensões:

1. **Strategy & outcomes:** objetivo, processo, KPI e owner.
2. **Workflow maturity:** etapas, frequência, volume, handoffs, erros e tempo.
3. **Data readiness:** fontes, qualidade, acesso, classificação e retenção.
4. **Tools & integration:** stack atual, licenças, APIs, redundância, lock-in e interoperability.
5. **Security, privacy & governance:** dados proibidos, vendors, DPA, human review, incidentes e compliance regional.
6. **People & adoption:** skills, treinamento, confiança, uso real e change management.
7. **Economics:** custo atual, horas, impacto, implementação, payback e custo de manutenção.

Cada oportunidade recebe:

```text
priority = normalized(impact × frequency × confidence × feasibility × urgency)
           adjusted by risk, dependency, adoption cost and time-to-value
```

Saída obrigatória:

- score por dimensão com evidência e missing-data state;
- inventário de ferramentas, assentos, custo e sobreposição;
- top opportunities e o que **não** automatizar;
- três opções: keep/configure, integrate/automate, replace/build;
- business case em range com premissas editáveis;
- roadmap 14/30/60/90 dias;
- workflow blueprint com trigger, inputs, steps, output, owner, human check, failure path, logs e rollback;
- policy pack/SOP e treinamento;
- reteste e outcome verification.

Estados: `Discovered → Evidence Needed → Qualified → Designed → Approved → Implementing → Live → Adopted → Verified`, além de `Rejected`, `Blocked`, `Paused`, `Regressed` e `Retired`.

## 27. Customer world: a experiência que gera renovação

Um único **Client Command Center** deve conter:

- business/entity profile compartilhado;
- outcomes e metas do cliente;
- módulos ativos e entitlements;
- “Now / Why / Do / Proof / Change”;
- action graph com owners e approvals;
- artifacts, publications, automations e evidence ledger;
- monthly value ledger: visibility wins, leads assistidos, horas poupadas, custo evitado, risco reduzido;
- timeline de decisões, experimentos, mudanças metodológicas e incidentes;
- export completo e offboarding limpo.

Cadência:

- **Imediata:** confirmação de compra, ETA, onboarding state e contato.
- **Primeiras 24h:** entidade/workflow validado, baseline e primeiro gap.
- **Primeiros 7 dias:** primeira ação utilizável ou workflow design aprovado.
- **Semanal:** mission brief com até 3 prioridades, mudanças e bloqueios.
- **Mensal:** business review com valor realizado, aprendizado e próximo mês.
- **Trimestral:** refresh de intents/stack/risco e decisão de expansão.

Retention moat saudável:

1. histórico longitudinal comparável;
2. biblioteca de experimentos e evidências do cliente;
3. integração no workflow real;
4. aprovação, governança e memória de decisões;
5. execução recorrente que gera novo valor.

Não usar export bloqueado, cancelamento escondido, dados presos ou falsas urgências.

## 28. Promessa, garantia e confiança

Não prometer “mover o score” ou “ser recomendado” em prazo fixo. A resposta de modelos externos é probabilística.

Prometer o que a Ozvor controla:

- baseline reproduzível com método e incerteza;
- explicação de cada mudança material;
- fila nunca vazia quando existe gap, ou investigação explícita;
- plano semanal atualizado;
- artefatos no SLA do plano;
- verificação após publicação/implementação;
- transparência de falhas, missing data e metodologia;
- reexecução/crédito de uso em falha de provider atribuível à Ozvor;
- resposta humana dentro do SLA contratado.

Copy proibida sem evidência: “guaranteed rankings”, “we improve your score”, “live signals” quando desligado, “all caught up” com gap, “full audit” para um único tool pick, comparativos absolutos não versionados.

## 29. Modelo de US$10K MRR em dezembro

O plano deve ser tratado como hipótese operacional, não previsão. Data-base 3 Set 2026: aproximadamente 17 semanas até o fim de dezembro e MRR administrativo observado de zero.

### Cenários

| Cenário | Managed Visibility @ US$1.500 | Growth @ US$149 | MRR de saída |
|---|---:|---:|---:|
| Downside | 3 | 9 | US$5.841 |
| Base | 5 | 18 | **US$10.182** |
| Upside | 6 | 25 | US$12.725 |

O base case exige apenas ofertas que já têm adjacência com a operação atual. AI Ops Care e Dual são upside, não dependência da meta.

### Ramp mensal base

| Exit month | Managed ativos | Growth ativos | Exit MRR |
|---|---:|---:|---:|
| Setembro | 1 | 0 | US$1.500 |
| Outubro | 2 | 7 | US$4.043 |
| Novembro | 4 | 10 | US$7.490 |
| Dezembro | 5 | 18 | **US$10.182** |

### Matemática de aquisição — premissas de planejamento

Managed outbound:

```text
680 contas ICP × 5% meeting booked × 75% held × 20% close = 5,1 clientes
```

São 40 contas altamente personalizadas por semana. Os percentuais são inputs de planejamento, não benchmarks prometidos; devem ser substituídos pelos dados reais semanalmente.

Product-led Visibility:

```text
1.200 free-check starts × 65% complete × 15% Kit × 15% Kit→Growth = 17,55 Growth
```

São cerca de 71 starts por semana. O Kit geraria aproximadamente US$3.393 one-time (`117 × US$29`), não MRR.

### Regras financeiras

- Meta de saída deve ter **20% de pipeline cover/buffer**; US$10.182 oferece só US$182 de folga e, portanto, não é suficiente como forecast seguro.
- Meta operacional recomendada: **US$12K contracted MRR** para absorver no-show, atraso e churn.
- Separar MRR, setup, sprint, audit one-time e pass-through costs.
- Medir gross margin por módulo e custo de providers por tenant.
- Nenhum desconto anual fundador sem cash collection, refund policy e capacidade de entrega.

## 30. Máquina comercial e de onboarding

Pipeline comum, com `entryMotion` separado:

`Target → Contacted → Engaged → Diagnostic Started → Diagnostic Completed → Qualified → Proposal → Verbal Commit → Paid → Onboarding → Activated → Value Realized → Expansion → Renewal/Churn`

Campos obrigatórios:

- region, language, vertical, employee band, current tools;
- source/campaign/message variant;
- entry funnel e product interest;
- pain, desired outcome, urgency, budget, authority;
- next step, owner, date, loss reason;
- consent/legal basis e suppression status;
- expected MRR, probability, close date e delivery capacity.

SLA founder-led:

- responder positivo em até 2h úteis;
- diagnóstico agendado em até 48h;
- proposta em até 24h após call;
- onboarding iniciado no mesmo dia do pagamento;
- primeira evidência de valor em até 7 dias.

Cold outreach deve ser segmentado por problema/vertical, incluir opt-out e respeitar CAN-SPAM, GDPR/ePrivacy e regras locais. Revisão jurídica é obrigatória antes de escalar UE.

## 31. Operating system e autonomia segura

Automatizar a empresa não significa liberar agentes para decidir tudo. Usar níveis:

- **L0 Observe:** ler, classificar, propor; sem mutação externa.
- **L1 Draft:** criar rascunho, oportunidade, resumo e alerta.
- **L2 Internal Execute:** atualizar dados internos reversíveis com audit log.
- **L3 External Execute with approval:** publicar, enviar, mudar campanha/integration após aprovação explícita.
- **L4 Autopilot bounded:** apenas ações repetíveis, aprovadas por policy, com limite, canary, kill switch e rollback.

Toda automação precisa de owner, trigger, input schema, policy, confidence threshold, cost ceiling, idempotency key, retry/dead-letter, log, customer-visible evidence, rollback e success metric.

Incident states: `Detected → Triaged → Contained → Customer Impact Assessed → Resolved → Verified → Postmortem`. O Admin deve mostrar Delivery Health, não apenas uptime de providers.

## 32. KPI tree e contratos de métrica

### North Stars por job

- **Visibility:** `Verified Intent Wins per Active Customer per Month`.
- **AI Ops:** `Verified Business Value per Active Customer per Month`, com submétricas de horas, custo, receita e risco — sempre com fonte/confiança.
- **Empresa:** `Net New MRR` com guardrails de gross margin, activation, value realization, retention e support load.

### Qualidade do produto

| KPI | Definição | Cadência | Gate inicial |
|---|---|---|---|
| Recommendation coverage | gaps materiais com ação ou investigação aberta / gaps materiais | diária | 100% |
| False caught-up rate | contas celebradas com gap material | diária | 0% |
| Audit reproducibility | runs comparáveis dentro do tolerance band | semanal | ≥90% |
| Action specificity | ações com prompt/engine/evidence/URL/hypothesis/test | diária | 100% P0/P1 |
| Artifact success | jobs que entregam output válido no SLA | diária | ≥98% |
| Publish-to-verify | publicados que chegam a verificação | semanal | ≥90% |
| Methodology comparability | trend points com versão/coorte compatível ou ruptura explícita | diária | 100% |

### Funil e negócio

- Free completion = completed valid results / unique starts.
- Time to First Gap = `firstGapAt - startAt`.
- Kit attach = paid Kits / completed Free Checks.
- Growth activation = clientes com baseline + primeira ação útil em 7 dias / Growth pagos.
- Managed close = paid managed / held qualified calls.
- Time to First Verified Value = `firstVerifiedValueAt - paidAt`.
- Logo churn, gross revenue retention, net revenue retention e expansion MRR.
- Gross margin por produto, provider cost/active tenant e support hours/account.
- Cross-sell acceptance e downstream value — não apenas clique.

Cada métrica precisa de owner, source of truth, timezone, grain, inclusion/exclusion, late-data policy e teste de qualidade.

## 33. Novo backlog integrado para o Claude Code

### Gate A — preservar confiança (0–48h)

1. Corrigir invariant do Do Next e separar Activity de Verified Execution.
2. Remover/feature-gate Opportunity Radar e qualquer claim não entregue.
3. Retirar conteúdo social com nota interna; adicionar content lint e approval.
4. Corrigir overflow mobile, titles duplicados, canonical/OG e sitemap lastmod.
5. Criar trust registry versionado para comparativos e claims.
6. Congelar escala comercial; manter design partners/concierge.

### Gate B — fechar Visibility loop (7–30d)

7. Entity Registry + onboarding confirmado.
8. Prompt Universe v2 por ICP/mercado/intenção/demanda.
9. Measurement v2 com repeats, method version e Explain Delta.
10. Gap Classifier + Action Graph + lifecycle verificável.
11. Hosted generation, artifact QA e publication evidence.
12. Delivery Health, canary tenant, incidents e cost telemetry.
13. Redesign Now/Why/Do/Proof/Change.

### Gate C — separar catálogo e funis (14–45d)

14. Product catalog/price version/entitlements e grandfathering.
15. Routes e analytics do funil Visibility.
16. Routes e analytics do funil AI Ops.
17. CRM lifecycle, capacity gate e onboarding state machine.
18. Client Command Center e value ledger.
19. Cross-sell rules baseadas em evidência, com snooze/dismiss.

### Gate D — AI Ops real (30–75d)

20. Assessment de sete dimensões e workflow inventory.
21. Tool Evidence Registry, risk/governance e alternatives.
22. Opportunity ranking e ROI ranges editáveis.
23. Roadmap/blueprint/SOP/approval/verification.
24. Sprint delivery workspace e AI Ops Care cadence.

### Gate E — escala (60–90d)

25. Agency multi-tenant/white-label/API/SLA/cost controls.
26. Localização EN-US/PT-BR e EU policy pack.
27. Billing/experiments apenas após aprovação comercial.
28. Case studies verificáveis e entity authority program.
29. Growth loops, referrals e partner channel.
30. Go-live apenas com launch scorecard verde.

## 34. Launch scorecard não negociável

| Gate | Verde quando |
|---|---|
| Promise | todo claim possui owner, fonte, data e feature disponível |
| Visibility delivery | todo gap material gera ação/investigação e a execução pode ser verificada |
| AI Ops delivery | recomendações têm workflow evidence, segurança, ROI range, owner e plano de implementação |
| Reliability | falhas, retries, custos e customer impact estão observáveis |
| UX | funis separados, mobile sem overflow, onboarding e estados vazios/erro testados |
| Commercial | catálogo/entitlements/billing consistentes; sem migração silenciosa |
| Customer success | time-to-value, weekly brief, monthly review e escalation owner ativos |
| Legal/trust | copy, DPA, privacy, outreach e comparativos revisados |
| Economics | capacity e gross margin suportam os clientes vendidos |
| Proof | tenant canário completa os dois loops ponta a ponta |

**Regra final:** não declarar “100% pronto” porque a interface está bonita. Declarar pronto apenas quando o sistema prova o que observou, produz um próximo passo específico, acompanha execução real e demonstra o que mudou — nos dois jobs.

---

# PARTE III — REDDIT SIGNAL INFRASTRUCTURE → OZVOR SIGNAL INTELLIGENCE

## 35. Veredito sobre o repositório

O repositório não é uma feature pequena de Reddit. Ele já contém o embrião de um motor de inteligência de mercado e execução para **SEO, GEO e PPC**: conectores, evidence ledger, classificação, gaps de keyword/backlink, SERP, citações em IA, auditoria on-page, bibliotecas de anúncios, dados das contas pagas, fila de ação, geração de drafts, verificação e relatório.

A tese é forte e combina diretamente com o maior gap observado na Ozvor: transformar medição em ação com prova. Mas o repo ainda não deve ser conectado diretamente ao painel de clientes. Hoje ele é um sistema funcional em expansão, específico demais para iGaming, com superfície técnica ampla e controles de produção ainda incompletos.

**Decisão:** manter o repo como serviço separado e evoluí-lo para o motor interno **Ozvor Signal Intelligence**. A Ozvor permanece o system of record e a experiência do cliente. Reddit vira uma fonte — importante, mas não o produto nem a arquitetura inteira.

O desenho final é:

`Fontes → Signal Intelligence → Evidence/Opportunity Contract → Ozvor Action Graph → Approval/Artifact/Execution → Verification → Value Ledger`

Não fazer merge de banco, models e workers dentro do app principal. A integração deve acontecer por contrato versionado. Isso reduz blast radius, permite escalar coletores separadamente e evita acoplar a experiência inteira da Ozvor a limitações de um único canal.

## 36. O que foi comprovado no código

Snapshot auditado: branch `main`, commit `cf82084`, em 3 Set 2026.

| Item | Evidência observada | Leitura |
|---|---|---|
| Domínio | FastAPI, SQLAlchemy, Postgres/RLS, Redis/ARQ, conectores, console e portal | Produto real, não apenas documentação |
| Dados | 47 modelos SQLAlchemy | Cobertura grande, mas domínio fragmentado |
| Migrations | 54 arquivos; head único `0054_ad_reader_accounts` | Cadeia coerente estaticamente; falta teste em Postgres real no CI |
| API | 113 paths e 135 operações OpenAPI | Superfície ampla demais para integrar sem versionamento/scopes |
| Client API | 12 rotas `/me` fora do OpenAPI | Portal funciona, mas integração não tem contrato público/gerável |
| Testes | 511 passaram com `VAULT_MASTER_KEY` explícita | Boa base funcional; setup não é hermético |
| Compilação | `compileall` passou | Sem erros sintáticos nos módulos checados |
| Qualidade | Ruff encontrou 62 violações | Gate de lint inexistente; inclui erro `F821` em produção |
| CI | Nenhum `.github/workflows` | Nada impede merge/deploy com lint, testes ou migration quebrados |
| Runtime | Python `>=3.12`; execução local resolveu 3.14.6 | Faixa aberta demais e divergente do Docker 3.12 |
| Dependências | Ranges `>=`; `uv.lock`; Docker copia `uv:latest` | Lock ajuda, mas runtime/base builder não estão inteiramente pinados |
| Health | `/health` retorna apenas `{"status":"ok"}` | Liveness, não readiness |
| Multi-tenant | RLS e FORCE RLS extensivos; testes de isolamento | Fundamento positivo; shared tables exigem revisão de autorização |
| Segredos | Fernet e hashes de API keys | Direção correta; falta lifecycle/rotation/startup policy completa |
| MCP | 6 tools read-only | Útil, mas auth, scopes, rate limit, paginação e safe errors insuficientes |
| UI | `admin.py` 2.607 linhas; `app.js` 3.026; `models.py` 1.303 | Monólitos que aumentarão custo e risco de mudança |
| Licença | Nenhum `LICENSE` no repo público | Ambiguidade para reuse/contribuição/distribuição |

### Check de testes reproduzido

```text
511 passed, 1 warning in 5.55s
compileall: pass
alembic heads: 0054_ad_reader_accounts (head)
ruff: 62 errors
```

O warning mostra depreciação Starlette/TestClient com a versão de HTTPX resolvida. Ele não quebra hoje, mas sinaliza drift de dependências. Sem `VAULT_MASTER_KEY`, o teste `test_saving_a_global_key_reaches_every_client` falha; testes não devem depender de segredo do shell do operador.

## 37. Capacidade real, capacidade parcial e documentação

### Real/implementado

- Evidence ledger com conteúdo bruto, URL e relações insight→evidência.
- Validação de citação/menção baseada em URLs/fontes retornadas.
- PRAW para Reddit quando houver credencial/aprovação.
- DataForSEO para SERP, discovery, keyword/backlink gaps e AI Overview onde disponível.
- Perplexity e OpenAI Responses com web search para referências reais.
- GSC e GA4 do cliente.
- Google Ads, Meta Ads e Reddit Ads para dados da conta própria, em leitura.
- Meta, Google e TikTok ad libraries por adapters/actors, com payload bruto e URL de prova.
- Auditoria renderizada de site, robots e alguns sinais GEO.
- Action items determinísticos; intel findings; content ledger; verificação de sobrevivência; reports.
- RLS multi-tenant, vault cifrado, routing/delivery com retries e webhook HMAC.
- Human-in-the-loop para publicação, gasto e alteração no site.

### Parcial ou dependente de calibração/fornecedor

- Reddit comercial: depende de aprovação/contrato; o próprio repo registra que a Data API foi negada/está pendente em diferentes momentos.
- Meta/TikTok conversation monitoring: são adapters genéricos para um provedor licenciado; não provam que um fornecedor real, contrato e schema de produção estejam ativos.
- Ad libraries: usam actors de terceiros sobre páginas oficiais. “Fonte oficial” não torna o método de coleta oficial.
- Reddit Ads performance: o código declara que o endpoint/formato de relatório ainda não foi calibrado contra token real.
- ChatGPT/Gemini manual: há trilhas documentadas; automação e cobertura não são equivalentes entre engines.
- Site audit: é útil, porém não inclui CrUX/Core Web Vitals de campo, crawling de site inteiro, logs ou validação técnica profunda.
- HubSpot App Card: roadmap, não entrega completa.
- Portal: read-only e útil, mas não representa o ciclo de oportunidade/aprovação/execução/verificação que a Ozvor precisa.

### Documentação defasada ou contraditória

- `OVERVIEW-COMPLETO.md` cita 172 testes; o repo atual executa 511.
- Documentação do MCP menciona cinco tools; o código possui seis.
- O worker fala em uma rodada única diária, mas agenda `daily_full_run` e duas execuções adicionais de `collect_all_tenants`.
- README/compliance usam linguagem de “compliance” muito forte ao lado de um conector que admite scraping contrário ao robots/termos.
- Custos e pricing enterprise de iGaming não servem como economics da oferta SMB Ozvor.

## 38. Gap de compliance que bloqueia o client-facing

Este é P0 e não deve ser suavizado.

Os [Data API Terms do Reddit](https://redditinc.com/policies/data-api-terms), revisados em 20 Jul 2026, exigem acordo separado para uso comercial e restringem monetização/revenda sem aprovação expressa. O [Help Center oficial](https://support.reddithelp.com/hc/en-us/articles/14945211791892-Developer-Platform-Accessing-Reddit-Data) define como comercial o uso por/para empresa, serviços pagos e assinaturas. A [Responsible Builder Policy](https://support.reddithelp.com/hc/en-us/articles/42728983564564-Responsible-Builder-Policy) exige aprovação escrita para comercialização. A [Data API Wiki](https://support.reddithelp.com/hc/en-us/articles/16160319875092-Reddit-Data-API-Wiki) exige exclusão de conteúdo removido e recomenda apagar rotineiramente dados/conteúdo de usuário em até 48 horas.

O repo declara `retention_days`, `takedown_supported` e `requires_license`, mas o gate atual apenas confirma que o tipo de conector está no registro. Não foi encontrado um enforcement que:

1. valide o contrato/licença ativa do provider antes de coletar;
2. execute purge com base na retenção declarada;
3. reconcilie deleções/takedowns da origem;
4. produza prova de exclusão;
5. impeça exposição/redistribuição ao cliente fora do uso aprovado.

O conector `apify_reddit` registra explicitamente scraping por proxy e uma “escolha comercial consciente”. Isso não é compatível com declarar o sistema “100% compliant”. Um actor pago não transfere automaticamente direitos de coleta, transformação ou redistribuição.

### Regra de lançamento

O módulo Reddit fica em `compliance_state=blocked` para uso comercial até uma destas condições:

- aprovação/contrato direto do Reddit cobrindo o caso de uso; ou
- fornecedor com contrato e warranties explícitos para coleta, processamento, retenção, takedown e redistribuição no produto Ozvor, revisado por counsel.

Até lá:

- não vender “monitoramento Reddit” como cobertura ativa;
- não usar scraping de conteúdo Reddit em entrega de cliente;
- permitir somente dados próprios/autorizados, embeds ou sinais de SERP que não copiem conteúdo, conforme parecer jurídico;
- não treinar/fine-tunar modelos com Reddit content;
- manter publicação e engajamento humanos e nativos;
- mostrar `source status`, `legal basis`, `coverage` e `freshness` no admin.

## 39. Arquitetura alvo da integração

### Limites de responsabilidade

| Responsabilidade | Signal Intelligence | Ozvor Core |
|---|---|---|
| Conectores e coleta | Owner | Apenas configura/autoriza |
| Normalização e evidência bruta | Owner | Recebe versão sanitizada/referência |
| Classificação inicial e candidatos | Owner | Consolida no Action Graph |
| Workspace, billing e entitlement | Consumer | Owner |
| Cliente, papéis e consentimento | Consumer | Owner |
| Priorização final por outcome | Sugere features/scores | Owner |
| Aprovação e execução | Expõe capacidades | Owner |
| Artefatos | Pode gerar candidato | Owner da versão aprovada |
| Prova de execução/verificação | Coleta observações | Owner do lifecycle/value ledger |
| UI do cliente | Não | Owner |
| Console técnico do motor | Owner, interno | Linkado no admin da Ozvor |

### Identidade e autorização

- `ozvor_workspace_id` é o identificador de negócio; `signal_tenant_id` é interno ao serviço.
- Tabela de mapping com status, policy pack, region, entitlements e timestamps.
- Autenticação service-to-service via OAuth client credentials ou JWT assinado de curta duração.
- Scopes mínimos: `signals:read`, `opportunities:read`, `opportunities:write`, `runs:execute`, `connectors:manage`, `admin:read`.
- Cliente nunca recebe o token do serviço nem a key do portal.
- Entitlements são verificados dos dois lados; negar por default.
- Toda chamada tem `request_id`, `correlation_id`, workspace, actor/service, scope e audit event.

### API v1 mínima

- `POST /v1/tenants` — provisionamento idempotente pelo core.
- `PATCH /v1/tenants/{id}` — policy pack, markets, languages, brand/entity profile.
- `GET /v1/tenants/{id}/source-health` — conexão, legal basis, coverage, freshness e custo.
- `POST /v1/tenants/{id}/runs` — tipo, escopo, budget e idempotency key.
- `GET /v1/runs/{id}` — estado/steps/errors/cost/impact.
- `GET /v1/tenants/{id}/signals?cursor=` — sinais sanitizados.
- `GET /v1/tenants/{id}/opportunities?cursor=` — candidatos qualificados.
- `PATCH /v1/opportunities/{id}` — feedback operacional interno, sem executar ação externa.
- `GET /v1/evidence/{id}` — metadados/prova sanitizada conforme scope.
- `POST /v1/webhook-endpoints` — configuração apenas por admin S2S.

Todas as listas usam cursor, limit máximo, filtros explícitos e `next_cursor`. Mutations exigem `Idempotency-Key`. Erros usam envelope estável, nunca exception bruta.

### Eventos/outbox

- `signal.detected.v1`
- `signal.updated.v1`
- `opportunity.created.v1`
- `opportunity.updated.v1`
- `opportunity.expired.v1`
- `source.degraded.v1`
- `run.started.v1`
- `run.completed.v1`
- `run.failed.v1`
- `evidence.takedown.v1`

Envelope: `event_id`, `event_type`, `occurred_at`, `tenant_id`, `workspace_id`, `schema_version`, `correlation_id`, `data`, `redaction_class`. Outbox transacional + assinatura HMAC/JWS + retries + dead-letter + replay. Consumer Ozvor grava `external_event_id` único.

## 40. Um Opportunity Contract único para SEO, GEO e PPC

Hoje `ActionItem`, `SeoOpportunity`, `IntelFinding`, drafts, approvals e outros estados descrevem pedaços do mesmo trabalho. A integração precisa de um contrato único, sem exigir uma big-bang migration imediata.

```text
Opportunity
  id, tenantId, sourceSystem, externalId, version
  channel: seo | geo | ppc | cross_channel
  sourceTypes[], market, language, entityIds[]
  title, problem, whyNow, recommendedAction
  evidenceIds[], evidenceCoverage, freshnessAt, expiresAt
  impact: {range, unit, basis}
  effort: {range, unit, assumptions}
  confidence: {score, factors, methodVersion}
  priority: {score, factors, policyVersion}
  target: {assetType, assetId, url, query, engine, campaignId}
  verificationPlan: {metric, baseline, threshold, window, method}
  status, owner, approval, artifactIds[], executionIds[]
  createdAt, updatedAt, qualifiedAt, executedAt, verifiedAt
```

Lifecycle canônico:

`Detected → Needs Evidence → Qualified → Proposed → Approved → Drafting → Ready → Executed → Observing → Verified`

Saídas laterais: `Rejected`, `Snoozed`, `Blocked`, `Expired`, `Regressed`, `Retired`.

Regras:

- `Qualified` exige evidência válida, ação concreta e verification plan.
- `Approved` exige actor, timestamp, escopo e risk class.
- `Executed` exige execution evidence; checkbox não basta.
- `Verified` exige nova observação comparável e resultado contra baseline.
- `Regressed` reabre o trabalho e preserva histórico.
- Um gap sem ação segura vira `Needs Evidence`, nunca desaparece.
- Ozvor é dona do lifecycle depois de importado; Signal atualiza observações sem sobrescrever decisão humana.

## 41. Experiência do cliente: Opportunity → Outcome

O cliente não deve ver uma “central de dados Reddit”. Deve ver três workspaces coerentes dentro do mesmo Command Center.

### SEO Opportunities

Para cada item:

- query/tema e mercado;
- SERP atual, concorrente, posição, volume/difficulty quando realmente medidos;
- por que a oportunidade existe;
- página/asset recomendado;
- brief/draft;
- ação on-page/off-page;
- owner e aprovação;
- indexação, ranking e tráfego após execução;
- verdict: win, neutral, loss, insufficient evidence.

### GEO Opportunities

- pergunta e engine;
- resposta/citação observada e fonte;
- concorrente/entidade citada;
- gap class: entity, citation, content, technical, off-site, local/reputation;
- ação específica por source/asset;
- artifact pronto;
- reruns comparáveis;
- mudança de mention/citation/source share com incerteza.

### PPC Opportunities

- plataforma e tipo: account performance, competitor creative, landing page, query/keyword, budget waste;
- evidência oficial/third-party claramente marcada;
- spend/impressions/clicks/conversions somente quando medidos;
- recomendação com hipótese, risco e teto;
- preview de mudança;
- aprovação obrigatória para qualquer write/spend;
- experimento, janela e resultado incremental.

### Cartão padrão

1. **O que aconteceu**
2. **Por que importa agora**
3. **Prova**
4. **O que fazer**
5. **O que a Ozvor pode preparar/executar**
6. **Quem precisa aprovar**
7. **Como saberemos se funcionou**
8. **O que mudou desde a última revisão**

Raw payloads, PII, usernames e detalhes de scraping ficam fora do client UI. Evidência sensível pode ser `summary-only` ou `operator-only`.

## 42. Rollout internal-first

### Fase 0 — Hardening e contrato

Antes de usar o repo na Ozvor:

- resolver compliance Reddit e registry de fornecedores;
- criar CI e testes herméticos;
- implementar startup gate e `/livez`/`/readyz`;
- versionar API e S2S auth;
- unified opportunity adapter;
- outbox/event contract;
- observabilidade, custo e redaction;
- Postgres/Redis integration tests.

### Fase 1 — A própria Ozvor como tenant canário

Escopo inicial:

- marca Ozvor, domínio ozvor.com, países/idiomas aprovados;
- concorrentes já auditados;
- queries dos dois funis, classificadas por SEO/GEO/PPC;
- GSC/GA4 e contas de ads próprias, quando autorizadas;
- ações apenas para o operador interno.

Aceite de 14 dias:

- ≥95% das runs dentro do freshness SLO;
- 100% das oportunidades exibidas com evidência;
- 100% dos gaps materiais com ação ou investigação;
- false-positive e duplicates revisados diariamente;
- custo por source/qualified opportunity visível;
- zero evento cross-tenant;
- ao menos cinco oportunidades revisadas ponta a ponta;
- nenhuma publicação/gasto automático.

### Fase 2 — Design partners concierge

- no máximo 3–5 clientes;
- read-only no começo;
- só oportunidades revisadas por humano;
- evidência sanitizada;
- SLA manual e feedback por item;
- export simples;
- kill switch por tenant/source.

### Fase 3 — Cliente participa do workflow

- approve/reject/snooze/assign;
- draft e revision history;
- execution evidence;
- verification window;
- weekly digest com até três prioridades;
- client feedback alimenta calibração, sem virar truth automaticamente.

### Fase 4 — Managed execution

- ações reversíveis podem ser automatizadas sob policy/entitlement;
- mudança de site e Ads write continuam com preview + approval + rollback;
- Reddit permanece publicação humana;
- outcome e regressão aparecem no Value Ledger.

### Fase 5 — Escala

- quotas e provider budgets por plan;
- regional e vertical policy packs;
- contracts/SLOs de providers;
- alertas de custo/qualidade;
- DR, backups, incident response e security review;
- client-facing somente para fontes com compliance verde.

## 43. Backlog de melhoria do repositório

### P0 — bloqueia integração/produção

1. **CI obrigatório:** Python 3.12/3.13, `uv sync --frozen`, pytest, Ruff, compile, Alembic head, OpenAPI snapshot, secret scan e dependency audit.
2. **Corrigir os 62 Ruff errors**, começando pelo `F821 datetime` em `app/admin.py` e production imports.
3. **Testes herméticos:** fixture de Settings/Vault; limpar `lru_cache`; nenhum teste depende da variável do shell.
4. **Runtime support policy:** `requires-python >=3.12,<3.14` até 3.14 ser testado; pin das versões diretas; Dependabot/Renovate com testes.
5. **Supply chain:** pin de `ghcr.io/astral-sh/uv` por versão/digest, SBOM, imagem escaneada e provenance.
6. **Config fail-closed:** produção exige APP_ENV explícito, vault, provisioning/S2S keys, webhook secret, DB não-superuser e HTTPS origins.
7. **Health:** `/livez` só processo; `/readyz` verifica DB, migration head, Redis/queue, vault/config e worker heartbeat. Provider health fica separado para não derrubar toda readiness.
8. **Compliance enforcement:** provider contract registry, license state/expiry/allowed uses, runtime gate, retention worker, takedown reconciliation e deletion certificate.
9. **Bloquear `apify_reddit` comercial** até base contratual aprovada; remover claim “100% compliant”.
10. **Fail-closed iGaming:** unknown license/unknown country não é `True`; policy pack decide comportamento.
11. **S2S auth e scopes:** não reutilizar key do portal; tokens curtos, rotation, revocation, audit e least privilege.
12. **Safe errors:** MCP/API nunca devolvem exception bruta; error code, request ID e log sanitizado.
13. **Rate limits/quotas:** por tenant, route/tool, provider e plan; concurrency caps e budget guard.
14. **Postgres/Redis CI:** provar RLS, checkout context, migrations upgrade/downgrade, ARQ retry/dead-letter e shared-table authorization.
15. **Cadência única:** eliminar sobreposição entre `daily_full_run` e `collect_all_tenants`; scheduler declarativo com locks e run idempotency real.

### P1 — transforma o repo em plataforma integrável

16. API `/v1` documentada; incluir client integration surface no OpenAPI.
17. Cursor pagination, filtros, ETag/If-None-Match e limites.
18. Outbox/webhooks versionados, assinatura, retry, dead-letter, replay e idempotência no consumer.
19. Unified Opportunity adapter sobre modelos existentes; migration incremental, não big bang.
20. Separar auth de operador, cliente, S2S e provisioner; papéis/scopes por operação.
21. OpenTelemetry + logs estruturados/redaction + metrics/traces de run, provider, cost e customer impact.
22. Provider circuit breakers, retries com jitter, timeout budgets e degraded mode.
23. Generic core + vertical policy packs. iGaming sai de enums, prompts, claims e country lists globais.
24. Modularizar `admin.py`, `models.py` e `app.js` por domínio; gerar client tipado.
25. Adotar SDK/spec MCP atual; tool entitlements, audit, paginação e bounded outputs.
26. Consolidar documentação gerada de código; status matrix `implemented/partial/planned/blocked`.
27. Test fixtures/evaluation set com truth labels para precision, recall e false-positive por finding.
28. Data redaction classes: public, client, operator, restricted/PII; serializers deny-by-default.

### P2 — escala e confiança

29. Separar imagens API, worker e browser-probe; Chromium não precisa estar no API web.
30. Feature flags, quotas, budgets e entitlements por tenant/source/channel.
31. Backup/restore drill, RPO/RTO, key rotation/re-encryption e incident runbooks.
32. Audit log imutável/exportável e trilha de approval/execution.
33. Warehouse/export e métricas agregadas sem PII.
34. HubSpot como destino opcional, não como experiência principal.
35. Portal legado deprecado depois que o Command Center Ozvor cobrir o workflow.
36. Formalizar `LICENSE`, contribution policy e ownership.

## 44. Métricas e SLOs do motor

| Contrato | Fórmula | Gate inicial |
|---|---|---|
| Evidence coverage | opportunities com ≥1 evidência válida / exibidas | 100% |
| Recommendation coverage | gaps materiais com ação ou investigação / gaps materiais | 100% |
| Freshness compliance | sources dentro do SLO / sources ativas | ≥95% interno; ≥99% client-facing |
| Duplicate rate | opportunities duplicadas / criadas | <2% |
| False-positive rate | rejeitadas como inválidas / revisadas | baseline 14 dias; queda contínua |
| Qualified rate | qualified / detected | por canal/source, sem target arbitrário inicial |
| Execution rate | executed / approved | ≥80% Managed |
| Verified win rate | verified wins / executed observáveis | reportar por action type |
| Regression rate | regressed / verified | tendência e causa obrigatórias |
| Time to opportunity | qualifiedAt − signalAt | p50/p95 por source |
| Time to verified value | verifiedAt − paidAt | North Star operacional |
| Cost per qualified opportunity | provider + compute / qualified | budget por plan |
| Redaction coverage | client payloads testados / payloads | 100% |
| Cross-tenant exposure | incidentes confirmados | 0 |

Toda métrica precisa de owner, grain, clock/timezone, inclusão/exclusão, late data, backfill e teste.

## 45. Gate final para expor aos clientes

O Signal Intelligence só entra no produto pago quando:

- contrato/licença permite cada fonte client-facing;
- todos os P0 do repo estão verdes;
- CI bloqueia regressão;
- Postgres RLS foi provado em integração;
- S2S/scopes/entitlements estão ativos;
- `/readyz` e worker heartbeat têm SLO;
- Opportunity Contract chega ao Action Graph sem duplicar estado;
- 100% das oportunidades exibidas têm evidência e plano de verificação;
- raw/PII não vazam para o cliente;
- run costs e provider budgets têm limites;
- Ozvor canário completa ao menos cinco ciclos;
- design partners entendem SEO/GEO/PPC e executam ações sem explicação do fundador;
- kill switch, rollback, export e incident process funcionam;
- o produto mostra “não medido”, “bloqueado” e “insuficiente” sem fabricar certeza.

**Conclusão:** o repo é um ativo estratégico relevante e pode resolver exatamente o gap do “Do Next”, desde que seja transformado de uma aplicação iGaming/Reddit acoplada em um motor de signals com contratos, compliance e lifecycle robustos. O ganho competitivo da Ozvor não será possuir mais dados. Será converter cada sinal autorizado em uma ação compreensível, aprovada, executada e verificada — para SEO, GEO e PPC — sem perder confiança.
