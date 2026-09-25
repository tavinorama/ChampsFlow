# Hermes ↔ worker: `GET /postiz-post/:id` (C15-b, P14) — contrato

**Por quê.** O passo `publish` registava `published via postiz channel=<ch> postiz_id=<id>` assim que o Postiz **aceitava** o post. Aceite pelo agendador não é publicação: um post pode ficar em fila, falhar no LinkedIn/X, ou ser apagado. Desde 25/09 a linha nasce `postiz_state=queued` e só vira `published` (com o permalink) quando o worker lê o post de volta pelo id nativo. Sem esta rota, o worker diz em cada tick `graph_tick_publish_reconcile_skipped` (ou `…_all_unknown`) e nada vira "publicado" por falta de quem conferir.

## Pedido (worker → Hermes, VPS)

```
GET {HERMES_TASK_URL}/postiz-post/{postizId}
Authorization: Bearer {HERMES_TASK_TOKEN}
```

`postizId` = o id que o `POST /postiz-schedule` devolveu (`postId`/`id`), só `[A-Za-z0-9_-]`, ≤48.

## Resposta (Hermes → worker)

```json
{ "ok": true, "state": "queued" | "published" | "error", "url": "https://www.linkedin.com/feed/update/…" | null }
```

- `state` mapeia o `state` do Postiz (`GET /public/v1/posts/{id}`): `QUEUE` → `queued`, `PUBLISHED` → `published`, `ERROR` → `error`. Outro valor → `queued` (o worker volta a perguntar).
- `url` = `releaseURL` do Postiz quando existe; senão `null`. Nunca inventar.
- Post não encontrado: `{ "ok": false, "error": "not_found" }` com HTTP 404. O worker regista `unknown` e volta a perguntar no tick seguinte, dentro da janela de 72 h.
- Qualquer outra falha: `{ "ok": false, "error": "<curto>" }` com HTTP 5xx. Nunca `ok: true` sem `state`.

## O que o worker faz com isso

| Resposta | Linha do passo (ops.agent_step.summary) |
|---|---|
| `published`, com url | `… postiz_id=<id> postiz_state=published url=<permalink>` |
| `published`, sem url | `… postiz_id=<id> postiz_state=published` |
| `error` | `… postiz_id=<id> postiz_state=error postiz_error=<curto>` |
| `queued` / `unknown` / 404 / falha | linha inalterada; pergunta de novo no próximo tick (janela 72 h, ≤50 por tick) |

`publishedToday` (a válvula de cadência) continua a contar aceites (`published via …`), de propósito: a válvula limita **tentativas** por dia, não sucessos.

## Aceite

1. Publicar 1 post de teste (canal x) → passo nasce `postiz_state=queued`.
2. Tick seguinte, com a rota no ar → passo passa a `postiz_state=published url=…` e o log mostra `graph_tick_publish_reconcile {"published":1}`.
3. Rota fora do ar → log `graph_tick_publish_reconcile_all_unknown` (1× por processo) e o passo **não** muda.
