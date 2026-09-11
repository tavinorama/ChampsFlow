# SOP — Dia do Disparo (1ª campanha real de cold e-mail)

> Owner: VP Sales (executor: founder) · Criado: 2026-09-02 (fecha 10.D.9) · **Atualizado 2026-09-11 (leva 2)**
> Kits: [aistack-campaign-kit.md](aistack-campaign-kit.md) · [geo-campaign-kit.md](geo-campaign-kit.md) · [leva2-outbound-com-prova.md](leva2-outbound-com-prova.md)
> Estado em 11/09: leva 1 encerrada (as duas campanhas em COMPLETED); leva 2 criada DRAFTED — `oz-local-2026-09-14` (3939141) e `aistack-2026-09-14` (3939142).

## TL;DR

Checklist único para o dia em que uma campanha sai do DRAFTED. Ordem: conferir copy (opt-out em TODOS os e-mails, e-mail 1 sem link), testar webhook e origem, mandar um envio-teste para a própria caixa, configurar limites por caixa, ativar, e saber quem responde reply em quanto tempo. Nada dispara sem cada caixa deste SOP marcada. O risco CAN-SPAM do endereço postal ausente está ACEITO pelo founder (02/09) e registrado abaixo. **Desde 11/09 há duas travas novas: a régua do padrão Ozvor (§8) e a trava de reativação (§9) — nenhuma campanha volta a enviar antes do diagnóstico `leads-status`.**

---

## 0. TRAVA DE REATIVAÇÃO (regra 11/09 — leva ancorada em diagnóstico)

**Nenhuma campanha é (re)ativada antes de rodar o diagnóstico da Tarefa 1 e ler o resultado:**

```
gh workflow run smartlead-analysis.yml -f mode=leads-status -f campaign_id=all
```

O que o diagnóstico tem de responder, com número, antes do GO:

- [ ] **Quantas leads estão em `STARTED`** (importadas, ainda sem toque 1) em cada campanha. Numa campanha que já enviou, `STARTED` alto e parado = follow-up comendo o cano; o teto de novos leads/dia desce para 60 antes de qualquer reativação.
- [ ] **Quantas estão em `BLOCKED`** — são leads sem campo obrigatório; >3% da lista = consertar o CSV antes de enviar.
- [ ] **Que `sent_count` a campanha declara.** Atenção ao campo: em `/campaigns/{id}/analytics` o `total_count` **é igual ao `sent_count`** — ele conta ENVIOS, não leads. Ler `total_count` como "leads na campanha" foi o que criou o fantasma dos "2.016 leads sem toque 1" na leva 1 (o número real era ~1.040 leads, todos tocados). A contagem de leads honesta vem do `leads-status`, nunca do analytics.

---

## 0.1 RODAR O PILOTO (100 leads com prova) — antes de qualquer disparo da leva 2

> **DESLIGADO até o founder pôr um segredo (medido 11/09).** O workflow existe e
> roda, mas para no primeiro passo: **o repositório NÃO tem o segredo
> `OZVOR_OPERATOR_KEY`** (`gh secret list` devolve só `HERMES_BLOG_TOKEN`,
> `HERMES_TASK_TOKEN` e `SMARTLEAD_API_KEY`; os dois environments não têm
> segredo nenhum). Corrida de referência:
> [34592662466](https://github.com/tavinorama/ChampsFlow/actions/runs/34592662466)
> — artefato baixado (78.453 bytes, 100 leads), e então
> `::error::secret OZVOR_OPERATOR_KEY ausente`.
>
> **A ação que destrava (é do founder, ninguém mais):**
> `gh secret set OZVOR_OPERATOR_KEY` com uma chave `ozk_` de escopos
> **operator+business**. O mesmo segredo faltando desliga também o
> `prospect-apify.yml`, que depende dele desde 02/09.

O piloto tem duas etapas e **só a segunda gasta**. As duas são o mesmo workflow,
`smartlead-leva2-pilot.yml`, e nenhuma delas inicia campanha nenhuma.

```bash
# 1) ESTIMATIVA — não gasta, não move lead, não chama motor.
gh workflow run smartlead-leva2-pilot.yml \
  -f run_id_shortlist=34570426016 \
  -f confirm=false

# 2) EXECUÇÃO — decisão do founder. ≈US$3,00 de motores (100 × US$0,03).
gh workflow run smartlead-leva2-pilot.yml \
  -f run_id_shortlist=34570426016 \
  -f confirm=true
```

O que a etapa 2 faz, nesta ordem: baixa o artefato privado do shortlist →
chama `POST /api/v1/operator/leva2-probe` (estimativa primeiro, sempre) →
o worker prova lead a lead (site → nicho+cidade → 1 pergunta, repeat=1) →
para cada lead **com prova**, adiciona na campanha de destino com os custom
fields `ai_engine / competitor_1 / competitor_2 / query / report_url` e remove
da campanha de origem (move por id; **nunca** reimportar por CSV).

Travas que param o job antes de tocar em lead alguma:

- [ ] campanha de destino **tem de estar DRAFTED** (adicionar lead a campanha
      ativa é enviar e-mail) — o workflow lê o status e aborta se não estiver;
- [ ] **≤ 80 leads novas por campanha** (o piloto tem 60 + 40);
- [ ] lead descartada (sem prova, já citada, sem nicho/cidade, orçamento)
      **não é carregada** — sem prova, sem leva, nunca placeholder;
- [ ] o lote não é probado duas vezes: os mesmos ids têm a mesma impressão
      digital por 14 dias. Para repetir de propósito (gasto novo), passar
      `-f idempotency_key=piloto-r2`.

Ler o resultado sem esperar o workflow:
`GET /api/v1/operator/leva2-probe/<job_id>` (chave `OZVOR_OPERATOR_KEY`) —
`ok` + variáveis de merge por lead, ou `descartado` + motivo, mais o custo real.
O gasto fica no ledger `api_spend` com `op='cold_proof'` e `ref='leva2:<job_id>'`.

**Envs**: nenhuma nova. `COLD_PROOF_ENABLED` só existe para DESLIGAR (o default
é ligado); se alguém a puser em `0`, o endpoint responde **503 nomeando a
variável** e o job sai `failed` com o motivo — nunca um lote vazio "ok".

**Depois do piloto, quem inicia é o founder**, pelo `smartlead-launch.yml`
(`action=start`, `confirm=GO`), e só depois do §0 e do §1 abaixo.

## 1. Checklist pré-disparo (na ordem)

- [ ] **Copy — opt-out**: TODOS os e-mails de TODAS as sequências terminam com a linha literal "P.S. If you'd rather not hear from me, just reply STOP and I won't write again." (depois da assinatura).
- [ ] **Copy — endereço postal**: `{{POSTAL_ADDRESS}}` — ver §Riscos aceitos. Se o founder já forneceu o endereço, substituir o placeholder em todas as campanhas ANTES de ativar; se não, remover a linha do placeholder (nunca enviar "{{POSTAL_ADDRESS}}" literal).
- [ ] **Copy — e-mail 1 sem link**: abrir cada sequência no SmartLead e confirmar que o 1º toque tem ZERO links/URLs/domínios (o SmartLead auto-lineariza domínios escritos; "ozvor" por extenso só do 2º em diante).
- [ ] **Copy — variáveis**: `{{first_name}}`, `{{company}}`, `{{lote}}` resolvem para todos os leads importados (testar com 3 leads aleatórios no preview).
- [ ] **Webhook**: botão Test do webhook (global; por campanha se não propagar) → conferir que a linha chega em `smartlead_event` e que o CRM move para `contacted` (provado fim-a-fim 27/08 — repetir o teste no dia).
- [ ] **Origem (`?from=`)**: abrir `ozvor.com/ai-audit?from=aistack-teste` (e `/test?from=cold-teste`) numa aba anônima, navegar por 2-3 páginas, voltar e concluir a ação → conferir no /admin que a origem ficou no lead (re-teste do fix #527).
- [ ] **Envio-teste**: mandar a sequência inteira para a PRÓPRIA caixa (founder) via Test send do SmartLead → conferir renderização, rodapé, links do e-mail 2/3 com `?from=` correto, e que não caiu em spam.
- [ ] **Limites por caixa**: warm-up encerrou 02/09 — começar conservador: **≤30 e-mails/caixa/dia na semana 1**, subir gradualmente (≤50 na semana 2) se bounce <2% e nenhum bloqueio; ramp-up configurado no SmartLead (não manual).
- [ ] **Janela de envio**: dias úteis, horário comercial do fuso do lead (US); nunca fim de semana no 1º toque.
- [ ] **Supressão**: lista de unsubscribed/STOP importada e ativa; domínio ozvor.com e clientes existentes na blocklist.

## 2. Cronograma da campanha — LEVA 2 (a partir de 11/09)

| Toque | Dia | Conteúdo |
|---|---|---|
| E-mail 1 | 0 | Sem link, uma pergunta, **a prova do mini free test** ({{ai_engine}} / {{query}} / {{competitor_1}} / {{competitor_2}}) |
| E-mail 2 | 3 | O resto da resposta + link `?from=<lote>` |
| E-mail 3 | 7 | Por que acontece + link `?from=<lote>` |
| E-mail 4 | 14 | `{{report_url}}` — o relatório dele, sem digitar nada |

**Capacidade (a conta, não o chute):**

```
500 e-mails/dia reais  ÷  4 toques  ÷  2 campanhas  ≈  62 leads novos/dia por campanha
```

- `max_new_leads_per_day` = **80 por campanha** (teto, não meta: stop-on-reply, bounces e fim de semana sem envio derrubam a carga ~20%). Na leva 1 esse valor era 1.000 — acima da capacidade, portanto teto nenhum.
- Schedule **só em dias úteis** (seg-sex), 09-18 America/New_York, 8 min entre e-mails.
- **Lista ≤ 800 leads por campanha** (80/dia × 10 dias úteis) — é o que faz a régua "lista 100% tocada em ≤10 dias" fechar.

Lotes: um lote novo por semana via `prospect-batch` (quarta 07:30 UTC, gate no Telegram), agora com filtro de sinal e gancho com prova — ver [leva2-outbound-com-prova.md](leva2-outbound-com-prova.md).

## 3. Fontes de leads — ordem e custo (regra 01/09)

1. **2k créditos SmartLead lead-finder PRIMEIRO** (início de cada mês, via UI) — mês 1 já ~coberto pelos 7.881 leads na conta.
2. **Apify completa** o volume depois que os créditos acabam (SP-20 no ROPA — fonte planejada, escopo US-only).
3. Apollo fora por ora.
4. 30k e-mails/mês = 10k leads (100% follow-up) ou 12.5k (70%).

## 4. Quem responde reply — e em quanto tempo

- **Rota**: reply → webhook → `crm_contact` `contacted` → grafo follow-up (#561, scan */30 min) → intenção → rascunho EN validado por código → **portão do founder no Telegram** → envio pela API do SmartLead (com `SMARTLEAD_API_KEY` no worker; sem ela, o rascunho aprovado chega para colar à mão).
- **SLA alvo**: reply quente respondido em **≤4h úteis** (o portão de 96h do grafo é timeout de segurança, não SLA — 10.D.8 pede timeout curto + escalação, dono: engenharia). Enquanto isso, o founder é o backstop: conferir a fila de rascunhos no Telegram 2×/dia (manhã e fim de tarde, Lisboa).
- **STOP/unsubscribe**: supressão imediata, sem resposta, nunca recicla.
- Reply que vira call → `/book`; antes da call, escalar o achado raso para a auditoria funda (`/seo audit` + `/seo geo`), por [discovery-audit-playbook.md](discovery-audit-playbook.md).

## 5. Reciclagem (dono e mecânica)

- Não-respondente recicla **após 2 meses** (regra 27/08-01/09) em novo lote com ângulo diferente (anti-genérico).
- **Dono do CSV de reciclagem: o founder** — exporta do SmartLead (leads sem reply, last-contacted >60d), remove STOP/unsubscribed/bounced, e importa no lote novo. O grafo nunca reimporta sozinho.
- Retenção: contato sem reply após **3 ciclos ou 12 meses** → apagar de `crm_contact` (ROPA G29; o job de código está pendente — até lá a limpeza é manual junto com o CSV).

## 6. Uso do dossiê

- O artifact do `prospect-batch` é o **dossiê por prospect** (site verificado, achados do mini-probe, e-mails rascunhados). Fica no artefato do lote + nota do `crm_contact`; ROPA G30 registra o padrão de acesso.
- Uso permitido: personalizar o toque 1 (achado real), preparar call, escalar para auditoria funda. Uso proibido: colar o dossiê em ferramenta não registrada no ROPA, ou enriquecer o contato com dados fora do site público do prospect.

## 8. A régua — padrão Ozvor de cold outreach (11/09)

Esta é a régua de TODA campanha fria da casa. O número é medido em cima dos leads efetivamente tocados, não da lista carregada.

| Métrica | Mínimo | Como se mede |
|---|---|---|
| Bounce | **< 2%** | `bounce_count ÷ sent_count` (analytics) |
| Resposta real | **≥ 3%** | respostas menos OOO e menos "não trabalho mais aqui", ÷ leads tocados |
| STOP | **< 15% das respostas** | classificação do `smartlead-classify` |
| Resposta positiva | **≥ 1,5%** | interesse declarado ÷ leads tocados |
| Reunião marcada | **≥ 0,7%** | `/book` com `from=cold-*` ÷ leads tocados |
| Fecho (de quem reuniu) | **≥ 20%** | pedidos pagos ÷ reuniões |
| Tempo de resposta a interesse | **< 2h** | do webhook ao envio do reply |
| Lista 100% tocada | **≤ 10 dias** | do 1º envio ao último lead em `STARTED` zerar |

**Regra de parada: abaixo de qualquer mínimo com 500 leads tocados, a campanha PARA e é consertada.** Não se aumenta volume em cima de uma régua vermelha — é assim que se queima domínio.

Para calibrar: a leva 1 fechou com bounce 1,3% (ok), 24 respostas em 1.021 tocados = 2,3% (abaixo de 3%), 12 STOPs = 50% das respostas (contra o teto de 15%) e 1 interesse real = **0,1%** (contra 1,5%). Régua vermelha em três de quatro — exatamente o caso de "parar e consertar", que é o que a leva 2 é.

## 9. Reativação de campanha (regra 11/09)

- Uma campanha em `COMPLETED` ou `PAUSED` **só volta a enviar depois do diagnóstico da §0**, com os números colados na decisão.
- Quem inicia é o founder, pelo `smartlead-launch.yml` com `action=start` e `confirm=GO`. Nenhum workflow inicia campanha sozinho: o `smartlead-campaign.yml` **não tem ação start**.
- Se o diagnóstico mostrar leads em `STARTED` paradas há mais de 48h numa campanha ativa, o teto de novos leads/dia desce para 60 ANTES de reativar, e o `smartlead-send-watch.yml` fica como vigia.

## 7. Riscos aceitos (registrados)

- **CAN-SPAM — endereço postal ausente** *(registrado 02/09/2026, decisão do founder)*: o CAN-SPAM Act §5(a)(5) exige um "valid physical postal address" em e-mail comercial. O founder decidiu (02/09) disparar por ora **só com a linha de opt-out**, sem endereço postal — o placeholder `{{POSTAL_ADDRESS}}` fica nos kits como a recomendação **não adotada**. Risco: multa FTC teórica por e-mail; mitigação parcial: opt-out funcional e honrado imediatamente, volume inicial baixo, remetente identificado. **Ação que fecha o risco**: founder fornece endereço (caixa postal serve) → substituir o placeholder em todos os kits e campanhas. Revisar esta aceitação antes de escalar acima de ~5k e-mails/mês.

---

*SOP criado 02/09/2026. Fontes: PENDING.md Bloco 0 + 10.D, regras de memória 27/08–01/09, análise SmartLead 01/09.*
