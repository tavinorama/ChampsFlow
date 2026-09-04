# SOP — Dia do Disparo (1ª campanha real de cold e-mail)

> Owner: VP Sales (executor: founder) · Criado: 2026-09-02 (fecha 10.D.9)
> Kits: [aistack-campaign-kit.md](aistack-campaign-kit.md) · [geo-campaign-kit.md](geo-campaign-kit.md)
> Estado no dia da escrita: 4 campanhas DRAFTED no SmartLead, 7.881 leads na conta, warm-up das caixas encerrado 02/09, zero e-mails enviados.

## TL;DR

Checklist único para o dia em que a primeira campanha sai do DRAFTED. Ordem: conferir copy (opt-out em TODOS os e-mails, e-mail 1 sem link), testar webhook e origem, mandar um envio-teste para a própria caixa, configurar limites por caixa, ativar, e saber quem responde reply em quanto tempo. Nada dispara sem cada caixa deste SOP marcada. O risco CAN-SPAM do endereço postal ausente está ACEITO pelo founder (02/09) e registrado abaixo.

---

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

## 2. Cronograma da campanha

| Toque | Dia | Conteúdo |
|---|---|---|
| E-mail 1 | 0 | Sem link, uma pergunta, achado real |
| E-mail 2 | 3 | Oferta com link `?from=` |
| E-mail 3 | 7 | Última, honesta e curta |

Lotes: campanha AI Stack (3888686, 1.254 leads classificados) e trilha GEO (OZ-B 1.866 primeiro; depois OZ-A/OZ-C e a parte GEO da Ozvor 1). Um lote novo por semana via `prospect-batch` (quarta 07:30 UTC, gate no Telegram).

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

## 7. Riscos aceitos (registrados)

- **CAN-SPAM — endereço postal ausente** *(registrado 02/09/2026, decisão do founder)*: o CAN-SPAM Act §5(a)(5) exige um "valid physical postal address" em e-mail comercial. O founder decidiu (02/09) disparar por ora **só com a linha de opt-out**, sem endereço postal — o placeholder `{{POSTAL_ADDRESS}}` fica nos kits como a recomendação **não adotada**. Risco: multa FTC teórica por e-mail; mitigação parcial: opt-out funcional e honrado imediatamente, volume inicial baixo, remetente identificado. **Ação que fecha o risco**: founder fornece endereço (caixa postal serve) → substituir o placeholder em todos os kits e campanhas. Revisar esta aceitação antes de escalar acima de ~5k e-mails/mês.

---

*SOP criado 02/09/2026. Fontes: PENDING.md Bloco 0 + 10.D, regras de memória 27/08–01/09, análise SmartLead 01/09.*
