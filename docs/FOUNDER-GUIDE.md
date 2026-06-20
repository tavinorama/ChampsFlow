# Guia do Fundador — TrustIndex AI

> Escrito para ser lido sem conhecimento técnico. Última atualização: 2026-06-09.
> Complementos técnicos: `docs/GO-LIVE-RUNBOOK.md` (deploy passo a passo),
> `docs/system-transparency.md` (como cada peça funciona por dentro).

---

## 1. O que é o produto (em uma frase)

**TrustIndex AI é um "score de crédito" de como as IAs enxergam uma marca.**
O sistema pergunta de verdade ao ChatGPT, Claude, Perplexity e Gemini sobre o
setor do cliente, mede se a marca aparece nas respostas, dá uma nota de 0 a 100,
mostra as provas, e entrega um plano para subir a nota.

**OrganicPosts by TrustIndex AI** é o braço de consultoria que executa o plano
para quem não quer fazer sozinho.

### O modelo de negócio (ciclo sem fim)
```
Auditoria GRÁTIS (isca) → Assinatura mensal (€99/€149 — monitoramento semanal)
                        → Consultoria OrganicPosts (alta margem)
```

---

## 2. Como a nota funciona (os 3 vetores)

| Vetor | Peso | Pergunta que responde |
|---|---|---|
| **AI** | 35% | "Quando perguntam à IA sobre meu setor, eu sou citado? Em que posição? Falam bem de mim?" (taxa de citação + posição + sentimento) |
| **Performance** | 35% | "Meu site é legível e citável por IA?" (schema.org, llms.txt, acesso de robôs de IA, conteúdo com traços que IA cita) |
| **Brand** | 30% | "A internet me trata como autoridade?" (presença nas 7 fontes que as IAs mais citam: Reddit, Wikipedia, LinkedIn, G2, Trustpilot, Crunchbase, YouTube) |

**Honestidade radical (o diferencial):** cada número é rotulado **medido**
(dado real coletado) ou **baseline** (placeholder honesto). O relatório mostra
cada pergunta feita, cada motor de IA, cada citação, cada fonte. Nunca é
preciso blefar — e é isso que torna a ferramenta vendável.

**Rigor:** cada pergunta é repetida 3x em modo real (IA é aleatória; nota séria
exige taxa com confiança, não cara-ou-coroa). Nunca prometa "100% de precisão"
— prometa "a medição mais rigorosa e transparente do mercado".

---

## 3. A jornada do cliente

```
1. Cai na landing (trustindexai.com) — "Veja como a IA enxerga sua marca"
2. Cadastra com e-mail (link mágico — sem senha)
3. Adiciona a marca: nome + site + setor (3 campos, 1 botão)
4. Roda a auditoria (~30s)
5. Vê a NOTA + os 3 vetores
6. Abre o breakdown — o momento "aha": "a IA recomenda meu CONCORRENTE,
   não eu; estou invisível no Reddit; meu site não tem FAQ schema"
7. Recebe o PLANO (lista priorizada + calendário de 4 semanas)
8. Executa sozinho (Content Studio rascunha os posts)
   OU contrata a OrganicPosts
9. Liga o monitoramento semanal → a nota vira hábito → assinatura recorrente
```

---

## 4. Checklist para ficar 100% pronto

### Fase A — Mínimo para auditorias REAIS (~1 dia, só você pode fazer)
- [ ] **Supabase** — criar projeto (região EU), ativar login por e-mail (magic
      link), copiar: URL, anon key, service-role key, connection string pooled.
      Ponto fiddly: configurar `tenant_id` no `app_metadata` dos usuários
      (detalhes no GO-LIVE-RUNBOOK Fase 1).
- [ ] **Anthropic** — gerar `ANTHROPIC_API_KEY` (transforma demo → real)
- [ ] **Resend** — chave + domínio verificado (e-mails de login/waitlist)
- [ ] Rodar a migração do banco (1 comando):
      `DATABASE_URL="<string do Supabase>" npm run db:migrate`
- [ ] **Railway** — subir web + api + worker + Redis; colar as chaves
      (⚠️ 3 variáveis do web são BUILD ARGS — ver runbook Fase 3)
- [ ] **Cloudflare** — apontar trustindexai.com, SSL Full (strict),
      e-mails hello@ / support@ / dpo@
- [ ] Smoke test: login → criar marca → rodar auditoria → ver citações reais
      (`/api/system/capabilities` deve dizer `"mode": "live"`)

**→ Aqui você já oferece auditorias grátis aos 10 testadores.**

### Fase B — Para COBRAR (paralelo, burocracia)
- [ ] Empresa no Brasil (CNPJ) — pré-requisito do Stripe BRL/Pix
- [ ] Stripe: produtos/preços (Growth €99, Agency €149), Pix + boleto,
      webhook, Stripe Tax
- [ ] Chaves opcionais para auditoria mais rica: OpenAI, Perplexity, Gemini,
      DataForSEO (`SERP_API_KEY`)

### Fase C — Compliance antes de cobrar de clientes EU/Brasil
- [x] Ratificação do mapa regulatório Brasil/LGPD — **FEITO 2026-06-09** (legal-privacy-officer)
- [x] DPIA (Gate 3→4) — **FEITO 2026-06-09**, APROVADO COM CONDIÇÕES (GEO-D1/D2/D3 — ver gate-log)
- [ ] Revisão de segurança do threat model (security-compliance-officer) — último item do Gate 3→4
- [ ] Representante EU (Art. 27 GDPR) — só você pode contratar (serviços tipo "EU rep as a service", ~€50-100/mês)
- [ ] Encarregado LGPD nomeado + divulgações ANPD na política de privacidade
- [ ] DPAs com cada fornecedor (Anthropic, OpenAI, Perplexity, Google,
      DataForSEO, Supabase, Stripe) — aceitar os DPAs padrão de cada um ao criar as contas
- [ ] Texto de disclosure FTC (GEO-A1)
- [ ] GEO-D3: base legal LGPD para transferência BR→EUA antes de aceitar clientes pessoa-física no Brasil

### Fase D — Construções opcionais (não bloqueiam o lançamento)
- [ ] Entity-graph (Wikidata/Crunchbase — fecha o último baseline do Brand)
- [ ] Módulo Reddit aprofundado
- [ ] Suíte de testes/CI

---

## 5. Como vender (primeiros 30 dias)

1. **Semana 1:** rode você mesmo a auditoria para 20–30 empresas de UM nicho.
   O relatório personalizado É o pitch de venda:
   > "Rodei um check grátis de visibilidade em IA na [marca] — o ChatGPT
   > recomenda seu concorrente, não você. Quer o relatório completo + o plano?"
2. **Semanas 2–3:** 10 testadores grátis em troca de feedback + depoimento.
3. **Semana 4:** estudos de caso públicos ("subimos o score de X de 41 para
   68 em 6 semanas") — o que também melhora o SEU próprio GEO.
4. Quem disser "adorei mas não tenho tempo" → OrganicPosts (consultoria).

---

## 6. Depois do lançamento

- **Melhore pelo que o cliente FAZ:** onde abandonam? Rodam 2ª auditoria?
  Abrem o plano? Cada "não" é a próxima melhoria.
- **Roadmap já priorizado:** Reddit → entity-graph → perguntas por nicho.
- **Ciclo de aprendizado embutido:** falhou algo → `postmortem-agent` extrai a
  lição → `product-manager` decide o próximo build.

---

## 7. Onde está tudo

| O quê | Onde |
|---|---|
| Sistema rodando local | http://localhost:3100 (login → "Continue in demo mode") |
| Página-estrela (breakdown) | http://localhost:3100/brands → clicar numa marca |
| Deploy passo a passo | `docs/GO-LIVE-RUNBOOK.md` |
| Como tudo funciona por dentro | `docs/system-transparency.md` + página `/how-it-works` |
| Estado do projeto (sempre atual) | `docs/STATE.md` |
| Estratégia de marca | `docs/brand-strategy.md` |
| Compliance | `docs/compliance/` |

**Resumo de uma linha:** o software está pronto e funcionando de ponta a ponta;
o caminho até a primeira receita é ~1 dia de criação de contas (Fase A), e o
caminho até cobrar é CNPJ + Stripe + compliance (Fases B/C).
