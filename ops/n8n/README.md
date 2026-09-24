# n8n · contrato fail-closed do follow-up (B12, Codex D01 + D09, 23/09/2026)

## O que aconteceu

- Execução **2662** (19/09) e **2757** (23/09) do workflow "New Lead Follow-up": o nó *Pick Next Lead* recebeu `{ error: "unauthorized", code: "INVALID_API_KEY" }` do serviço Leads, produziu **0 itens**, e o n8n terminou **Succeeded** em 4 s. Três nós executados. Nenhum rascunho, nenhuma aprovação, nenhum envio. Ninguém soube.
- Execução **2760** (23/09) do scheduler: a VPS respondeu `{ ok: true, started: true }` e o fluxo terminou Succeeded em 528 ms. **Aceite não é publicação.**

Regra da casa: *nada degrada calado*.

## O contrato (o que o workflow deste diretório impõe)

| Situação | Comportamento | Quem fica sabendo |
|---|---|---|
| Leads responde 401/403 ou `INVALID_API_KEY` | O nó **Contract** lança erro → nó **Alarm** manda Telegram → **Stop and Error** fecha a execução como **FALHA** | Telegram + n8n em vermelho |
| Leads responde 5xx ou qualquer status ≠ 200 | Idem | Idem |
| Leads responde 200 com lista vazia | **No-op** legítimo: a execução termina Succeeded sem fazer nada, de propósito | Ninguém (é o normal) |
| Lead sem `id` | Ignorado (não elegível) | — |
| Hermes responde `ok:true, started:true` sem `output` | **Contract: draft** lança erro → Alarm → FALHA. Aceite nunca conta como rascunho | Telegram |
| Rascunho válido | Vai para **aprovação do founder** no Telegram. Silêncio = nada é enviado | Founder |

Não existe caminho em que um erro de autenticação termine verde. Não existe caminho em que "started" vire "enviado".

## Como importar (ação do founder; este repositório não tem acesso ao n8n)

1. n8n → *Workflows* → *Import from file* → `ops/n8n/new-lead-followup.fail-closed.json`.
2. Trocar os três `REPLACE_WITH_*_CREDENTIAL_ID` pelas credenciais existentes (Leads API key como header, Hermes task token como header, bot do Telegram). **Nunca colar chaves no JSON.**
3. Variáveis de ambiente do n8n: `LEADS_BASE_URL`, `HERMES_TASK_URL`, `TELEGRAM_CHAT_ID`.
4. Ajustar a URL de *Pick Next Lead* se o endpoint do Leads for outro (o serviço Leads é um repositório separado; a rota aqui é a que a execução 2757 chamou, pelo nome do nó).
5. Desativar o workflow antigo **só depois** de o novo passar nos 3 testes abaixo.

## Os 3 testes de aceite (rodar no n8n, com *Execute workflow*, antes de ativar)

1. **401**: temporariamente apontar a credencial do Leads para um valor inválido → a execução tem de terminar **em erro**, com mensagem `LEADS_AUTH_FAILED` e um Telegram 🔴. Restaurar a credencial.
2. **Vazio**: com a fila do Leads vazia → a execução termina Succeeded no nó *No lead: no-op*, sem Telegram.
3. **Lead elegível**: com um lead de teste na fila → chega um 🟡 no Telegram com o rascunho; nada é enviado sem aprovação.

O teste unitário `tests/unit/n8n-followup-template.test.ts` garante que o JSON importável mantém este contrato (nós, ligações de erro, `neverError: false`, sem segredos).

## O que este PR não resolve

- O reconciliador assíncrono do *Content Scheduler* (D09 no scheduler, execução 2760): exige um endpoint de estado do job na VPS do Hermes, que não vive neste repositório.
- A credencial do Leads em si (F4) e o export do workflow atual (F6): ações do founder.
