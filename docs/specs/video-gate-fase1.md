# Spec — Fase 1 do gate de vídeo: injeção de roteiro no `/video-job`

**Contexto (raio-X da VPS, 24/08):** o pipeline legado está vivo e publica diariamente em IG/TikTok/YT (`ozvor-video-job.mjs`: roteiro via `claudeJSON(PROMPTS[fmt])`, render Pexels/Remotion, `sched()` → `/postiz-schedule` com `image:[media]`, Notion, Telegram). **Único defeito: publica sem o portão do founder.** Esta spec fecha o portão SEM reescrever o pipeline — o grafo passa a fornecer o roteiro JÁ APROVADO; todo o resto (render, agendamento, Notion) fica intacto.

## Mudança A — `hermes-task-server.mjs` (endpoint `/video-job`), ~6 linhas

Hoje:
```js
spawn("node", ["/root/ozvor-video-job.mjs"], { env: process.env })
```

Passa a repassar o body (já parseado no handler) via env do spawn:
```js
const extra = {};
if (body && typeof body.script === "object") extra.VIDEOJOB_SCRIPT = JSON.stringify(body.script);
if (typeof body?.format === "string")   extra.VIDEOJOB_FORMAT   = body.format;
if (Array.isArray(body?.channels))      extra.VIDEOJOB_CHANNELS = body.channels.join(",");
spawn("node", ["/root/ozvor-video-job.mjs"], { env: { ...process.env, ...extra } })
```
Body vazio (o disparo atual do n8n) ⇒ `extra` vazio ⇒ **comportamento idêntico ao de hoje**. Retrocompatível por construção.

## Mudança B — `ozvor-video-job.mjs`, ~10 linhas

1. **Roteiro**: onde hoje faz `const roteiro = await claudeJSON(PROMPTS[fmt])`, antes disso:
```js
let roteiro;
if (process.env.VIDEOJOB_SCRIPT) {
  try { roteiro = JSON.parse(process.env.VIDEOJOB_SCRIPT); log("SCRIPT external (gated pelo founder)"); }
  catch (e) { log("SCRIPT external INVALIDO — abortando (nunca cair no gerador quando um roteiro aprovado foi prometido)"); process.exit(1); }
}
if (!roteiro) roteiro = await claudeJSON(PROMPTS[fmt]);
```
   *Regra de honestidade: roteiro externo inválido ABORTA (com log) — nunca publica um roteiro que o founder não viu.*
2. **FORMAT**: `process.env.FORMAT` já é respeitado; aceitar também `VIDEOJOB_FORMAT` como sinônimo (prioridade: VIDEOJOB_FORMAT > FORMAT > rotação).
3. **CHANNELS**: onde há o hardcode `["instagram","tiktok","youtube"]`:
```js
const CHANNELS = process.env.VIDEOJOB_CHANNELS
  ? process.env.VIDEOJOB_CHANNELS.split(",").map(s=>s.trim()).filter(Boolean)
  : ["instagram","tiktok","youtube"];
```
4. **Log**: uma linha `GATED script=external|internal format=<fmt> channels=<lista>` junto do `SCRIPTGEN` atual — o `video-memory` do grafo passa a saber a origem.

## Contrato do `script` (o que o grafo enviará)
O MESMO shape que `claudeJSON(PROMPTS[fmt])` devolve hoje (conferir no arquivo os campos exatos do formato escolhido — ex.: beats/captions/hook). O worker da Ozvor montará esse JSON a partir do `[RENDER BRIEF]` + roteiro do finalize da esfera. **Antes de aplicar, colar aqui a saída de** `grep -n -A15 "PROMPTS\s*=" /root/ozvor-video-job.mjs | head -60` **para fixar os campos por formato.**

## Sequência de adoção (sem downtime)
1. Aplicar A+B na VPS (`systemctl restart hermes.service` NÃO é necessário para o job; o server precisa de restart para a mudança A).
2. Testar manual sem publicar: `VIDEOJOB_CHANNELS=youtube FORMAT=stats` com um script de teste → conferir `vidjob.log` (`GATED script=external`).
3. Fase 2 (repo Ozvor): porta `hermes.render()` no worker chama `/video-job` com `{script, format, channels}`; grafo `finalize → approval → render+publish`; reverter o report-only (#516).
4. Desligar o disparo do n8n (o grafo assume o relógio) — só DEPOIS da Fase 2 provada.

## Decisões que esta spec espera (Bloco 8)
- **D-vídeo**: até a Fase 2, o legado continua sem portão (aceito documentado) ou pausa?
- **8.2**: 1 vídeo/dia para os 3 canais (como hoje) ou 1 por canal? Fase 1 suporta ambos (CHANNELS por chamada).
