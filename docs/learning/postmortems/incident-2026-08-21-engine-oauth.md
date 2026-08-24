# Postmortem — Apagão de engines: 26h de falha total com fallbacks=0

**Período:** 21/08 09h → 22/08 11h20 UTC (~26h) · **SEV-2** · **Detecção:** SQL manual (o alarme por step existia mas era ruído, não diagnóstico).

## O que aconteceu
As sessões OAuth do **claude E do codex** expiraram na VPS do Hermes. Todo passo de LLM de todo grafo falhou com `Failed to authenticate: OAuth session expired and could not be refreshed`, mais 18 jobs do n8n. E `fallbacks=0`: a cadeia de fallback do Hermes existia, mas **o worker pinava `engine:"claude"`** — pinar o engine no chamador desliga o fallback do servidor, e nós nunca pedíamos outro.

## Causa raiz
A regra da casa ("chamada única sem fallback = defeito de projeto; kimi substitui claude E codex", 12/08) estava implementada só do lado do servidor, e o chamador a anulava sem saber.

## Correção (#505)
Cadeia `claude→codex→kimi` do lado do chamador (`callWithFallback`, env `HERMES_ENGINES`), falha honesta nomeando cada engine quando todos caem, alarme 1×/6h com o remédio (nunca por passo). **Provada ao vivo no mesmo dia**: claude falhou → codex falhou → kimi carregou a manhã inteira; após o re-login, o primário voltou sozinho.

## Lições (→ anti-patterns)
- Pinar engine/provider no chamador desliga o fallback do servidor — peça a cadeia, não o soldado.
- Alarme de infraestrutura fala UMA vez por janela com o remédio; um por passo é ruído que ninguém lê.
- Sessões OAuth interativas expiram: todo engine baseado em login humano precisa de (a) fallback e (b) alarme com a ação de re-login.
