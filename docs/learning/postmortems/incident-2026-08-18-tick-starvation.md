# Postmortem — Fome do scheduler: a organização parou 3 dias em silêncio

**Período:** 18/08 ~00h → 21/08 01h06 UTC (~72h) · **SEV-2** (nenhum cliente afetado; toda a produção de conteúdo parada) · **Detecção:** SQL manual na volta do founder — **nenhum alarme soou**.

## O que aconteceu
O `graph-tick` avançava os 5 runs mais velhos (`ORDER BY started_at ASC LIMIT 5`). Os 5 mais velhos eram permanentemente estacionados: 4 `daily-video` parados em `founder-approval` **sem timeout** (o botão do Telegram nunca funcionou — ver o postmortem do botão) e 1 `content-experiment` em harvest. Runs estacionados consumiam todos os slots, todos os ticks: **26 runs novos ficaram com ZERO steps**, incluindo as primeiras execuções da vida de 6 grafos. Zero publicações por 3 dias. O `daily-watchdog` roda **dentro** do mesmo motor — o vigia morreu com o vigiado.

## Causa raiz
1. Seleção de runs sem distinguir estacionado de avançável.
2. Aprovação sem timeout = run imortal.
3. Nenhum observador externo ao worker.

## Correção (#500, + #514/#519 depois)
Dois pools (estacionados re-checados fora dos slots) · timeout default de 96h em aprovação (= rejeição-por-silêncio, nunca publica sozinho) · reconciliação de runs starved (>24h sem step → failed, 1 Telegram consolidado) · vigia **externo** em CI (`/api/v1/agent-org/liveness` + cron 30min, #514), calibrado para ignorar estacionados (#519).

## Lições (→ anti-patterns)
- Scheduler: item estacionado NUNCA consome slot de execução.
- Todo gate humano tem timeout, e timeout nunca aprova.
- O vigia fica FORA do vigiado.
- "O que espera humano?" lê-se em `agent_step.status`, não em `agent_run.status` (o erro de leitura de 17/08 atrasou o diagnóstico).
