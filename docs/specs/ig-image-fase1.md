# Spec — Fase 1 do IG com IMAGEM: mídia inline no `/postiz-schedule`

**Contexto (1.6 do PENDING, 01/09):** Instagram recusa post só-texto ("You need one media"); por isso as 3 esferas de vídeo curto viraram report-only (#516). O insight: um **card brandado (PNG) + legenda** é um post legítimo de Instagram, e o raio-X da VPS (24/08) mostrou que o handler `/postiz-schedule` do `hermes-task-server.mjs` já aceita `image[]` — é assim que o `ozvor-video-job.mjs` publica: `sched()` → `/postiz-schedule` com `image:[media]`.

**O que o repo sabe (investigação do caminho da mídia, PR do 1.6):**
- (a) *Endpoint de upload de mídia no Hermes* — **não existe** que o repo saiba. O client do worker (`apps/worker/src/jobs/graph-tick.ts`, porta `hermes`) só conhece `/task` e `/postiz-schedule` (payload `{channel, post}`); a spec do vídeo conhece `/video-job`. Nenhum `/postiz-media`, nenhum `/upload`.
- (b) *`/postiz-schedule` aceitar URL pública em `image[]`* — **não verificável** pelo repo. No job legado, `media` é o objeto que o Postiz devolve do upload feito **na própria VPS** (`{id, path}`), não uma URL. Assumir que o server baixa URL seria inventar endpoint — "mergeado ≠ produção".
- (c) → **esta spec**: patch mínimo no server para aceitar a imagem **inline (base64)** dentro do `image[]` e fazer, na VPS, o mesmo upload ao Postiz que o job de vídeo já faz. Escolha deliberada de inline em vez de URL pública: o worker **não tem** env do Supabase (zero leituras de `SUPABASE_*` em `apps/worker`), não existe bucket, e o card é pequeno (~40–60 KB de PNG; ~60–80 KB em base64). Nada de storage novo, nada de retenção, nada de URL pública para vazar.

## Mudança A — `hermes-task-server.mjs` (handler `/postiz-schedule`), ~12 linhas

Hoje (forma do raio-X): o handler recebe `{channel, post, image?}` e monta o post no Postiz repassando `image` como veio (objetos `{id, path}` já upados).

Passa a **normalizar** `image[]` antes de montar o post: cada item que tiver `base64` é upado ao Postiz aqui e trocado pelo `{id, path}` que o Postiz devolve. Objetos já no formato do Postiz passam intactos.

```js
// antes de montar o post do Postiz, dentro do handler /postiz-schedule:
async function normalizeImages(images) {
  if (!Array.isArray(images)) return images;
  const out = [];
  for (const it of images) {
    if (it && typeof it.base64 === "string") {
      const buf = Buffer.from(it.base64, "base64");
      if (buf.length === 0 || buf.length > 2 * 1024 * 1024) throw new Error("image inline invalida ou >2MB");
      // uploadToPostiz = a MESMA função que o ozvor-video-job.mjs usa para subir o MP4
      // (multipart em /public/v1/upload, header Authorization: <POSTIZ_API_KEY>) —
      // conferir o nome exato no job: grep -n "upload" /root/ozvor-video-job.mjs
      out.push(await uploadToPostiz(buf, it.filename || "card.png", it.mime || "image/png"));
    } else {
      out.push(it);
    }
  }
  return out;
}
// ...
const image = await normalizeImages(body.image);
// e usar `image` (normalizado) onde hoje usa body.image
```

Body sem `image` (o disparo atual das esferas X/LinkedIn) ⇒ `normalizeImages(undefined)` devolve `undefined` ⇒ **comportamento idêntico ao de hoje**. Retrocompatível por construção.

## Mudança B — limite do body, 1 linha

Se o server usa `express.json()` (limite padrão 100 KB), subir para `express.json({ limit: "3mb" })`. Se o body é lido à mão (`req.on("data")`), conferir se há teto e ajustá-lo para ≥ 3 MB. Sem isso, o payload com o card (~80 KB em base64 + legenda) pode ser cortado e a falha seria "JSON inválido" — nada degrada calado, mas degrada.

## Mudança C — resposta honesta

Se o upload ao Postiz falhar, o handler responde `{ ok:false, error:"media upload failed: <motivo>" }` (status 502) **sem** criar o post. Nunca cair para post só-texto: é exatamente o defeito original do canal.

## Contrato do payload (o que o worker envia — já implementado no repo)

```json
{
  "channel": "instagram",
  "post": "<legenda aprovada + hashtags>",
  "image": [
    { "base64": "<PNG em base64>", "mime": "image/png", "filename": "ozvor-card-<runId8>.png" }
  ]
}
```
- `post` = o bloco `[CAPTION]` + `[HASHTAGS]` do finalize da esfera, exatamente como o founder aprovou.
- O PNG = card brandado 1080×1080 (`apps/worker/src/lib/card-render.ts`) renderizado **depois** da aprovação a partir do `[CARD HOOK]` aprovado — determinístico, sem LLM entre a aprovação e o render.
- Só há `image` quando o nó de publish declara `media: "card"` (hoje: só `sphere-instagram`). X e LinkedIn continuam mandando `{channel, post}`.

## Sequência de adoção (sem downtime)

1. Aplicar A+B+C na VPS e `systemctl restart hermes.service`.
2. Teste manual sem publicar de verdade — ex.: `channel:"instagram"` num canal de teste do Postiz, ou com data de agendamento futura e apagar no Postiz:
   ```bash
   B64=$(base64 -w0 /root/algum-card.png)
   curl -s -X POST https://hermes.ozvor.com/postiz-schedule -H "Authorization: Bearer $HERMES_TASK_TOKEN" -H 'Content-Type: application/json' \
     -d "{\"channel\":\"instagram\",\"post\":\"teste 1.6\",\"image\":[{\"base64\":\"$B64\",\"mime\":\"image/png\",\"filename\":\"t.png\"}]}"
   ```
   Esperado: `{ ok:true, postiz:{...} }` e o post com imagem no Postiz.
3. Ligar no repo: env **`IG_IMAGE_PUBLISH=1`** no serviço **worker** e no **api** do Railway (os dois importam a definição do grafo; a forma tem que ser a mesma nos dois). Sem essa env, `sphere-instagram` continua **report-only** (card hook + legenda chegam prontos no Telegram, com a ação nominal no título) — nunca pede aprovação para um publish condenado.
4. Primeiro run real: aprovar no Telegram (a caixa mostra `[CARD HOOK]` e a legenda) → publish com imagem → 48h → harvest `instagramstandalone_reach` → veredito. Válvula de cadência, circuit breaker e retry com guard de ambiguidade (#540) valem para este publish como para X/LinkedIn.

## Fora desta spec
- TikTok e YouTube: continuam report-only (canais só-vídeo — Fase 2 do gate de vídeo, `docs/specs/video-gate-fase1.md`).
- Carrossel / múltiplas imagens: o contrato já é um array; o worker manda 1.
