# Postmortem — O botão que nunca funcionou: 5 dias de cliques no vazio

**Período:** 17/08 (nascimento do botão) → 22/08 14h (primeiro clique registrado) · **SEV-3 em aparência, SEV-2 em consequência** (as aprovações apodrecidas viraram o tampão da fome do scheduler) · **Detecção:** relato do founder ("tá bichado") + logs HTTP com ZERO requests em `/api/telegram` na história.

## O que aconteceu — três camadas, todas silenciosas
1. **`setWebhook` nunca foi registrado** no Telegram; sem webhook, o clique não tem para onde ir (spinner até morrer).
2. **As 3 envs do Telegram não existiam no serviço `api`** (o worker tinha — por isso as mensagens SAÍAM; quem recebe o clique é a api). E quando entraram, foram coladas com o placeholder literal `<token do worker>` — a página de status dedurou pelo `chat_id_tail: "…ker>"`.
3. **Conflito de consumidor único**: o `hermes-gateway` da VPS escutava o MESMO bot via polling. O Telegram só permite um ouvinte por bot: cada registro nosso era derrubado e os callbacks iam para o gateway, que os descartava.

## Correção (#504, #508, #509/#510 + bot próprio)
Bot **exclusivo de aprovações** (o gateway ficou com o antigo) · a api **auto-registra o webhook no boot** (idempotente; um passo manual pós-env é um passo esquecível) · endpoint de diagnóstico `GET /api/telegram/status/:secret` com `getWebhookInfo` ao vivo (`last_error_message` = a razão exata) · chat não autorizado agora RESPONDE o callback com alerta + log (spinner eterno nunca mais é silencioso) · lembrete diário de aprovações pendentes com botões novos, trava por bot.

## Lições (→ anti-patterns)
- Um recurso "entregue" cuja PRIMEIRA execução real nunca aconteceu não está entregue ("mergeado ≠ produção").
- Callback ignorado sem resposta = spinner eterno; todo caminho de descarte responde e loga.
- Um bot de mensageria é um recurso de consumidor único: dois sistemas no mesmo token = guerra silenciosa. Um bot por função.
- Diagnóstico self-service (página de status) transforma horas de vai-e-vem em 10 segundos.
