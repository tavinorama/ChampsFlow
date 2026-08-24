# Anti-Patterns

> Append-only. Every entry references the postmortem that discovered it.
> **All Phase 5 agents MUST read this before writing any code.**

## How to read this
Each entry: what to NEVER do + what to do INSTEAD. Specific, actionable, codebase-grounded.

---

## SQL

### Parâmetro sem cast em INSERT…SELECT com agregação = 42P08 latente
`SELECT $1, $2, …, SUM(delta) + $2` deixou o Postgres deduzir `integer` e `bigint` para o mesmo `$2` — o endpoint de créditos 500-ava desde julho e ninguém chamava até a pílula do dashboard chamar (22/08, #506). **Em vez disso:** cast explícito em todo parâmetro reutilizado, e **validar o statement com `PREPARE` contra o schema real** antes de declarar pronto — `PREPARE` compila sem executar e é grátis.

### Teste com db fake não prova nome de tabela
`FROM brand` passou nos testes (fake respondia a qualquer SQL) e 500-ava em produção (`brands`) (22/08, #506). **Em vez disso:** rota nova com SQL à mão ganha um `PREPARE` contra a produção na definição de pronto.

---

## Authentication

_(empty on init)_

---

## API Contracts

_(empty on init)_

---

## Frontend

_(empty on init)_

---

## Data Handling

_(empty on init)_

---

## Integration

### Nunca pinar o engine/provider no chamador quando existe cadeia de fallback no servidor
`engine:"claude"` fixo no worker anulou a cadeia do Hermes: 26h de falha total com `fallbacks=0` (postmortem 2026-08-21). **Em vez disso:** o chamador pede a cadeia (`callWithFallback`, `HERMES_ENGINES`) e registra qual engine respondeu.

### Nunca validar por segmento e enviar o blob inteiro
A thread do X passava na validação por-tweet (≤280 cada) e era enviada inteira num post → "post is too long" DEPOIS da aprovação do founder (22/08, #511). **Em vez disso:** o que se valida é exatamente o que se envia.

### Nunca publicar texto em canal que exige mídia
As esferas IG/TikTok/YouTube nasceram só-texto e o Postiz recusava depois do clique de aprovação — 0 publicações na história dos 3 canais (22/08, #516). **Em vez disso:** o grafo só ganha nó `publish` quando a cadeia produz o formato que o canal aceita; até lá, `report`.

### Nunca descartar um callback/webhook sem responder
Chat não autorizado no Telegram levava `return 200` sem `answerCallbackQuery` → spinner eterno e zero logs (postmortem 2026-08-22). **Em vez disso:** todo caminho de descarte responde ao emissor e loga o motivo (com valores mascarados).

### Um bot de mensageria = um consumidor
O gateway (polling) e a api (webhook) disputaram o mesmo bot; o Telegram só permite um ouvinte — cada `setWebhook` era derrubado em silêncio. **Em vez disso:** um bot por função.

---

## Architecture

### O vigia nunca mora dentro do vigiado
O `daily-watchdog` rodava dentro do graph-tick: quando o tick congelou 3 dias, o vigia congelou junto e nenhum alarme soou (postmortem 2026-08-18). **Em vez disso:** liveness probe EXTERNO (CI cron → rota pública `/api/v1/agent-org/liveness`).

### "Mergeado" não é "em produção"
Feature dependente de migração/env/serviço externo reportada como pronta = a raiz de 4 falhas silenciosas em um só dia (17/08: AI Audit 503, botão Telegram, Signal Engine, CHECK do nurture). **Em vez disso:** reportar DESLIGADA até a dependência existir em produção, com a ação nominal que destrava.

### Scheduler: item estacionado nunca consome slot de execução
Os 5 runs mais velhos (parados em aprovação sem timeout) comeram os 5 slots do tick por 3 dias; 26 runs novos nunca ganharam um step (postmortem 2026-08-18, #500). **Em vez disso:** dois pools — re-check barato dos estacionados + slots caros só para avançáveis — e todo gate humano com timeout (timeout = rejeição, nunca aprovação).

### Monitor de fila distingue "parado" de "estacionado"
Primeira noite do vigia externo: 6 falsos alarmes porque runs em `wait-72h` não geram steps por horas E ISSO É SAUDÁVEL (24/08, #519). **Em vez disso:** alarmar só sobre runs AVANÇÁVEIS sem progresso.

### Um canal com N produtores precisa de válvula de cadência
LinkedIn recebia de 3 grafos (esfera + adaptação do vídeo + experimento): 3 posts/dia numa company page (24/08, #520). **Em vez disso:** cap por canal com adiamento (nunca descarte) para o dia seguinte.
