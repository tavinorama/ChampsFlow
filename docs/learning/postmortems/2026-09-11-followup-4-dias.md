# Postmortem — A resposta que esperou 4 dias: o follow-up chamou ruído a um lead vivo

**Período:** 05/09 18:53:15 UTC → 09/09 19:00:23 UTC (**4 dias, ~190 varreduras**) · **SEV-2 comercial** (nenhum cliente afetado; a **única** resposta de interesse real da campanha de cold outreach ficou sem resposta) · **Detecção:** o founder reparou, à mão, no atraso entre o evento e o rascunho — **nenhum alarme soou, nenhum número mudou de cor**.

> **TL;DR** (≤200 palavras) — Um lead da campanha "OZ-B — Local services" respondeu em 05/09 18:53:15 UTC. O `followup-scan` roda a cada 30 min e leu esse evento em todas as varreduras dos 4 dias seguintes, sem propor nada. O rascunho (`ops.agent_run`, grafo `followup-reply`) só nasceu em 09/09 19:00:23.
>
> Causa raiz no código: `extractReplyText` (apps/api/src/lib/dossier.ts) preferia `preview_text` — o **excerto curto** que a SmartLead guarda — ao `reply_body`, o corpo completo, e devolvia **HTML cru** no caminho de `reply_message.text`. Com a forma real do payload, o classificador recebia 40 caracteres cortados a meio da palavra: `"Hello there! Thank you so much for takin"`. Isso é a cara de um aviso automático. O modelo respondeu `noise` e o `followup-scan` descartou **em silêncio e para sempre** (marcador no `crm_contact.note`), transformando as ~190 varreduras seguintes em `skipped`.
>
> Correções: html→texto em toda fonte e corpo antes de excerto; regex de auto-reply só para máquina de verdade; veredito `noise` do modelo não descarta resposta com prosa humana; resposta ilegível é re-tentada e gritada; e a métrica `reply_to_draft_latency_p95` no Delivery Health (âmbar >2h, vermelho >24h).

---

## Linha do tempo (UTC)

| Quando | O quê |
|---|---|
| **05/09 18:53:15** | Webhook da SmartLead grava `smartlead_event` `EMAIL_REPLY`, campanha "OZ-B — Local services". O lead escreve prosa real, com pergunta, começando por *"Hello there! Thank you so much for taking the time to write me…"* |
| 05/09 19:00 (±) | 1ª varredura do `followup-scan`. O evento é lido, o lead é resolvido, o texto é extraído — **como excerto truncado ou HTML cru** — e o classificador chama `noise`. `discard("noise")` grava `[followup] descartado <event_id> 2026-09-05 motivo=noise` no `crm_contact.note`, loga em `info` e **não avisa ninguém**. |
| 05/09 19:30 → 09/09 18:30 | ~189 varreduras. Em cada uma o evento aparece na query, cai em `hasFollowupMarker` e conta como `skipped`. O contador `followup_scan_done` fica bonito (nada em `unparseable`, nada em erro). **Invariante de #578 satisfeita e cliente perdido na mesma linha de log.** |
| **09/09 19:00:23** | Nasce um `ops.agent_run` do grafo `followup-reply`. 4 dias e 7 minutos depois da resposta. |
| 11/09 | Postmortem + correção (este documento e o PR que o acompanha). |

**Custo:** 4 dias de silêncio sobre a única resposta de interesse real de uma campanha de ~700 envios. Na régua do founder: *"um interesse real que espera 4 dias é um lead morto."*

---

## Causa raiz (confirmada no código)

### RC-1 — O classificador nunca viu a resposta (`apps/api/src/lib/dossier.ts`, versão anterior)

`extractReplyText` tinha quatro fontes numa ordem errada e dois caminhos sem conversão de HTML:

- **linha 96** — `reply_message.text` era devolvido **cru**: `return text.trim().slice(0, REPLY_MAX_CHARS)`. Um reply de Outlook/Word começa com ~800 caracteres de `<head>`; o corte em 600 devolvia **markup puro, zero palavra humana**.
- **linha 105** — `preview_text` vinha **antes** de `reply_body` (linha 109) e também sem conversão. `preview_text` é o **excerto curto** da SmartLead: a fixture de produção do próprio repositório (`tests/unit/followup-scan.test.ts:484`, copiada de linhas reais em 03/09) grava-o como `text.slice(0, 40)`.

Medido nesta branch, com a forma de payload de produção (`preview_text` + `reply_body`), o que chegava ao prompt de intenção era **exatamente isto**:

```
The reply:
---
Hello there! Thank you so much for takin
---
One word:
```

40 caracteres, cortados a meio da palavra, sem a pergunta do lead. O prompt do classificador (`apps/api/src/lib/followup.ts`, `buildIntentPrompt`) define `noise` como *"anything not written by the person right now"* — e uma cortesia truncada e sozinha é **a forma canónica de um aviso automático**. O modelo respondeu o que o input pedia.

### RC-2 — "Ruído" era uma sentença silenciosa e definitiva (`apps/worker/src/jobs/followup-scan.ts`, versão anterior)

- **linha 719** — `if (intent === "noise") return discard("noise");`
- **linhas 682-687** — `discard()` grava o marcador `[followup] descartado …`, faz `logger.info` e **nunca** manda Telegram.
- **linhas 556-557** — na varredura seguinte, `hasFollowupMarker` devolve `true` e a linha vira `skipped`.

O erro do modelo virou verdade permanente no banco na primeira tentativa, sem revisão, sem alarme e sem re-tentativa. A mesma armadilha existia na **linha 691**: `if (!replyText) return discard("sem-texto")` — "não consegui ler" tratado como "tratado", também para sempre.

### RC-3 — A espera não tinha número (Delivery Health, #591)

O painel media a entrega ao cliente (audits, drafts, filas). **Nada** media o tempo entre a resposta de um lead e a existência de um rascunho. Por isso 4 dias de espera não mudaram uma única cor: o painel não estava a mentir, estava a **não olhar**.

### Amplificador — a primeira decisão é final

`hasFollowupMarker` + `hasOpenFollowupProposal` (linhas 556 e 564) existem por boas razões (idempotência, uma proposta em voo por contacto). Mas, combinados com um descarte silencioso na 1ª passagem, garantem que **um engano de 30 segundos dura 14 dias** (o lookback) sem que ninguém saiba.

### Hipóteses testadas e REFUTADAS

| # | Hipótese | Veredito |
|---|---|---|
| 1a | O regex de OOO apanhou "thank you for your email/for taking the time" | **Refutada** contra o código de 05/09. `looksLikeAutoReplyNoise` (followup.ts:156-170, versão anterior) não tinha nenhum padrão de cortesia; medido nesta branch, devolve `false` para o texto da resposta. O erro veio do **classificador LLM**, alimentado com o excerto truncado — não do regex. (Mesmo assim o regex foi endurecido: ver correção 2, para que a hipótese nunca se torne verdade.) |
| 1b | O extrator devolveu vazio → `unparseable` | **Refutada para ESTE evento.** `unparseable` não grava marcador, logo seria re-tentado em cada varredura e **gritava 1×/dia** desde 05/09 — e não houve grito. O balde que engole em silêncio é o `discarded`, não o `unparseable`. (O caminho `sem-texto` foi corrigido à mesma: era um `discarded` disfarçado.) |
| 3 | A resposta caiu em `skipped` por estágio ignorado (`contacted`) | **Refutada no código.** O scan só descarta por estágio quando `stage === "lost"` (followup-scan.ts:690, versão anterior). `contacted` — que é o que o webhook grava num reply — é candidato normal, e há teste a fixá-lo. |
| 4 | O job repetível não correu | **Refutada por desenho, por confirmar em produção.** O `followup-scan` é um repetível BullMQ com `jobId` estável (`apps/worker/src/index.ts:541-555`, cron `*/30 * * * *`) e estampa `queue:followup-scan:last_ok` a cada conclusão (`apps/worker/src/queue-pulse.ts`), vigiado pelo CI externo (#576/10.B.15). Se a fila tivesse parado 4 dias, o vigia externo teria gritado. **Só o log do Railway fecha esta porta** (ver abaixo) — o pulso guarda apenas o último carimbo, não a história. |

### Hipótese 2 — o que destravou em 09/09 (**NÃO confirmada, precisa de produção**)

O run nasceu em **09/09 19:00:23**, a primeira varredura depois de **96 horas exatas** sobre 05/09 18:53:15. `FOLLOWUP_APPROVAL_TIMEOUT_HOURS = 96` (followup.ts:34) é a única constante de 4 dias no sistema, o que dá duas leituras plausíveis:

- **(a)** uma proposta de OUTRA resposta do MESMO contacto estava estacionada desde 05/09, bloqueando tudo por `hasOpenFollowupProposal`; expirou às 96h, gravou `[followup] expirado …` e libertou o contacto na varredura seguinte;
- **(b)** o lead escreveu **outra vez** por volta de 09/09 18:5x; um `event_id` novo não tem marcador, logo foi proposto de imediato — e a coincidência com as 96h é mesmo coincidência.

As duas contam a mesma história de fundo (a resposta de 05/09 foi silenciosamente arquivada); mudam apenas o que destravou. **Não verifiquei qual** — exige as linhas de produção listadas abaixo.

---

## O que é preciso LER em produção para fechar a confirmação

Sem acesso ao banco nem ao Railway nesta sessão, estas cinco leituras fecham o caso. Todas são somente-leitura.

1. **O payload real do evento** (prova definitiva de RC-1 — diz se foi o excerto truncado, o HTML cru, ou ambos):
   ```sql
   SELECT id, received_at, campaign_id, lead_email,
          jsonb_object_keys(payload::jsonb) AS chaves
     FROM smartlead_event
    WHERE event_type = 'EMAIL_REPLY'
      AND received_at BETWEEN '2026-09-05 18:53:00Z' AND '2026-09-05 18:54:00Z';
   -- e depois, sobre a mesma linha (o payload é uma STRING jsonb duplo-encodada):
   SELECT length(payload::text) AS tamanho,
          left((payload::jsonb ->> 'preview_text'), 120)                 AS preview,
          left((payload::jsonb ->> 'reply_body'), 200)                   AS corpo,
          left((payload::jsonb -> 'reply_message' ->> 'text'), 200)      AS msg_text
     FROM smartlead_event WHERE id = '<event_id>';
   ```
   **Esperado se RC-1 estiver certa:** `preview_text` com ~40-200 chars terminando a meio da palavra, e/ou `reply_body`/`reply_message.text` começando por `<html` ou `<head`.

2. **O marcador que o scan gravou** (prova de RC-2 — diz qual balde engoliu e em que dia):
   ```sql
   SELECT email, stage, updated_at,
          (SELECT string_agg(l, E'\n') FROM unnest(string_to_array(note, E'\n')) l
            WHERE l LIKE '[followup]%') AS marcadores_followup
     FROM crm_contact WHERE email = '<lead_email do passo 1>';
   ```
   **Esperado:** `[followup] descartado <event_id> 2026-09-05 motivo=noise`. Se disser `motivo=sem-texto`, a causa imediata é o extrator ter devolvido vazio (mesma família, correção já cobre). Se **não houver linha nenhuma** de 05/09, RC-2 cai e a investigação volta às hipóteses 2/4.

3. **Os dois runs, e o que os separa** (fecha a hipótese 2):
   ```sql
   SELECT r.id, r.trigger, r.started_at, r.status, s.node, s.status AS step_status, s.started_at
     FROM ops.agent_run r LEFT JOIN ops.agent_step s ON s.run_id = r.id
    WHERE r.graph = 'followup-reply'
      AND r.started_at BETWEEN '2026-09-05' AND '2026-09-10'
    ORDER BY r.started_at;
   ```
   **Leitura (a)** se existir um run de ~05/09 19:00 com step `approval` que passou a `failed` em 09/09 ~19:00; **leitura (b)** se o run de 09/09 for o único e existir um **segundo** `EMAIL_REPLY` do mesmo lead nesse dia (repetir a query 1 para 09/09).

4. **Os contadores das ~190 varreduras** (Railway, worker `99f4bce2-7801-46da-906a-b406ec0b3616`, env `62019975-4bda-4c85-bd8d-3c74f8d857d6`, 05/09→09/09) — filtrar por `followup_scan_done` e por `followup_discarded`.
   **Esperado:** exatamente **um** `followup_discarded` com `motivo=noise` em 05/09, e daí em diante `scanned ≥ 1` com `skipped ≥ 1` e todos os outros baldes a zero. Isto é a prova de que a fila **correu** (mata a hipótese 4) e de que o silêncio foi por decisão, não por paragem.

5. **O pulso da fila, agora** (sanidade): `GET /api/v1/agent-org/liveness` → `queues["followup-scan"].last_ok` deve estar a menos de 30 min.

---

## Correção (este PR)

1. **HTML → texto antes de classificar, e corpo antes de excerto** (`dossier.ts`): `htmlToText` remove `<head>`, `<style>`, `<script>` e os comentários condicionais do Outlook, decodifica entidades (incluindo `&#39;`, que enche um reply de Word) e transforma blocos em quebras de linha. `extractReplyText` passa **todas** as fontes por ele, na ordem `reply_message.text` → `reply_message.html` → `reply_message` (string) → **`reply_body`** → **`preview_text`**, e uma fonte que não rende texto **cai para a seguinte** em vez de envenenar a leitura.
2. **O regex de auto-reply só apanha máquina** (`followup.ts`): cabeçalhos (`Auto-Submitted: auto-replied`, `X-Autoreply`, `Precedence: auto_reply`), assunto ("Automatic reply"), ausência declarada ("out of the office", "currently away", "on annual/parental/sick leave") e falhas de entrega. Cortesia **nunca**: a constante exportada `HUMAN_COURTESY_OPENERS` lista as aberturas humanas reais e um teste falha se alguma voltar a ser tratada como ruído.
3. **O código decide, o modelo só opina** (`followup-scan.ts`): se não há auto-reply nem pedido de saída e **há prosa humana** (`hasHumanText`), um veredito `noise` do modelo não descarta nada — a resposta vira `question` (o default seguro) e **vai a rascunho**, que continua a passar pelo portão do founder. O pior caso é um rascunho a mais; o caso que isto impede é um lead vivo morto em silêncio.
4. **Ilegível ≠ tratado** (`followup-scan.ts`): resposta sem texto nenhum passa a `unparseable` — **sem marcador**, re-tentada na varredura seguinte, com `logger.error` e **um grito por dia** no Telegram. O alarme mudou-se para depois do loop, para apanhar também os ilegíveis descobertos durante o processamento.
5. **A espera ganhou cor** (`reply_to_draft_latency_p95`, Delivery Health #591): contrato completo (dono, fonte de verdade, grão, UTC, janela de 14 dias, inclusões/exclusões, dados atrasados, teste de qualidade), **âmbar acima de 2h, vermelho acima de 24h**. Inclui as respostas **ainda sem rascunho** com a idade corrente — uma resposta parada envelhece sozinha para vermelho. O elo em banco é o `trigger` do run (`cron:followup-scan reply:<event_id>`), que este PR passa a gravar.

**Testes** (`tests/unit/followup.test.ts`, `tests/unit/followup-scan.test.ts`, `tests/unit/delivery-health*.test.ts`): fixture com a **forma** da resposta real (HTML de cliente de e-mail + `"thank you … for taking the time"`), com texto **sintético** — zero PII, nenhum e-mail, nome ou domínio reais. Sem a correção, 13 destes testes falham; o principal falha assim: `expected 'You classify ONE email reply to a col…' to contain 'Can you tell me what the audit actually looks at?'`.

---

## Lições (→ `docs/learning/anti-patterns.md`)

- **Truncar antes de classificar é adulterar a evidência.** Um excerto de 40 chars não é uma versão curta da resposta; é **outra** mensagem. O que se classifica tem de ser o que a pessoa escreveu.
- **Veredito de modelo não escreve verdade permanente em banco sem revisão nem alarme.** O modelo classifica, o código decide — e um descarte irreversível precisa de uma segunda opinião determinística.
- **"Não consegui ler" nunca é "tratado".** Ilegível fica elegível: sem marcador, re-tentado e barulhento.
- **Não medir é pior do que medir mal.** O painel não mentiu durante os 4 dias — não estava a olhar. Todo loop com um humano do outro lado precisa de um relógio com cor.

---

## Referências

- Correção: PR desta branch (`fix/followup-html-reply-latency`).
- Anterior neste mesmo loop: #578 (03/09) — invariante "todo item scanned cai em exatamente um contador" e o balde `unparseable`. **A invariante fechava enquanto o lead morria**: contar tudo não é o mesmo que decidir bem.
- Delivery Health: #591 (P0-09).
- Pulsos de fila / vigia externo: #576 (10.B.15), postmortem 2026-08-18.
