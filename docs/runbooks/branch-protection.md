# Branch Protection — a configuração REAL da `main`

> Owner: founder (única pessoa que altera proteção) · Criado: 2026-09-02 (10.B.16)
> Fonte de verdade: a API do GitHub (`gh api repos/tavinorama/ChampsFlow/branches/main/protection`).
> Este runbook DESCREVE a configuração vigente e o porquê — ele não a substitui.

## TL;DR

`main` exige **6 checks verdes e 0 aprovações**. O portão humano vive nos
**labels** (automerge.yml), não na contagem de reviews — decisão do founder de
**2026-07-29**, depois que uma required-approval deadlockou o PR #400 (Hermes
revisa HIGH mas por política não aprova HIGH). `enforce_admins` ligado; force
push e delete bloqueados.

## Required status checks (lista REAL, hoje)

Os 6 contexts exigidos — exatamente os nomes dos jobs de `.github/workflows/ci.yml`:

| Check (context) | Job em ci.yml | O que prova |
|---|---|---|
| `Build` | build | monorepo compila; nenhum secret em artefato |
| `Unit & Integration Tests` | unit-and-integration | vitest com Postgres+Redis reais |
| `Lint & Type Check` | lint | turbo lint (tsc) + nenhum gerado sujo |
| `Security Checks` | security | check-rls.sql, token-leak, headers, prompt-injection, npm audit, secrets scan |
| `Compliance Tests` | compliance | DPA/CCPA/DSR + bias baseline |
| `Smoke` | smoke | boot in-process da camada de rotas Hono (~1 min) |

`strict: true` (branch precisa estar atualizada com a main). **0 required
approvals** (ver decisão abaixo). `enforce_admins: true`.

**"Playwright E2E" NÃO é required hoje.** Para virar required sem travar PRs
de baixo risco, o par `e2e.yml` (filtro `paths:`) + `e2e-required-twin.yml`
(`paths-ignore` idêntico, job com o MESMO nome reportando sucesso) já está no
repo desde 2026-09-02 — todo PR passa a produzir um check "Playwright E2E".
Ativação = founder adiciona o context "Playwright E2E" à proteção, SÓ depois
de uma sequência estável de nightlies verdes. Regra de manutenção: as duas
listas de paths têm de ser byte-idênticas (drift silenciosamente des-gateia).

## Decisão 29/07 — 0 aprovações, portão por label

- Hermes revisa HIGH mas **não aprova** HIGH por política → um gate de
  required-approval em HIGH deadlocka por construção (aconteceu no #400).
- Portanto: proteção com **0 aprovações**; o portão é procedural e vive nos
  labels, executado por `.github/workflows/automerge.yml` (auto-merge nativo):
  - `claude-ready` (LOW) e `hermes-review` (MEDIUM) → auto-merge no verde;
  - `hermes-review` + `security-sensitive` (HIGH) e
    `needs-founder-approval` (CRITICAL) → **segurados** até o founder aplicar
    `founder-approved` (um clique);
  - `hold` / `no-autodeploy` / `do-not-merge` sempre bloqueiam.
- **Nunca** voltar required approvals para 1, relaxar proteção, dispensar
  review ou usar `gh pr merge --admin` — a rotina manual de merge é banida
  (regra de 2026-07-29; automation em #285).

## Como verificar / restaurar

```bash
# Ler a configuração vigente:
gh api repos/tavinorama/ChampsFlow/branches/main/protection | jq '{contexts: .required_status_checks.contexts, strict: .required_status_checks.strict, enforce_admins: .enforce_admins.enabled}'

# Restaurar os 6 checks (founder; rodar só se a proteção foi perdida):
gh api -X PUT repos/tavinorama/ChampsFlow/branches/main/protection \
  -H "Accept: application/vnd.github+json" \
  --input - <<'JSON'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["Build", "Unit & Integration Tests", "Lint & Type Check", "Security Checks", "Compliance Tests", "Smoke"]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": null,
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON
```

## "Verde na main" = run de `ci.yml` no SHA do HEAD (regra de 2026-09-11)

Os 6 checks acima protegem o **PR**. Depois do merge, a `main` só tem CI própria
se houver **uma run de `ci.yml` cujo `head_sha` é o HEAD da main** — e desde
04/09 isso não acontecia sozinho:

- `automerge.yml` arma o auto-merge nativo com o `GITHUB_TOKEN`; o merge é
  feito por `github-actions[bot]`. Regra do GitHub (docs "Triggering a workflow
  from a workflow"): *"events triggered by the `GITHUB_TOKEN` will not create a
  new workflow run, with the following exceptions: `workflow_dispatch` and
  `repository_dispatch`"*. O `push` na main gerado pelo auto-merge **não**
  dispara `ci.yml` nem `post-deploy-smoke.yml`; `pull_request: closed` também
  não (mesmo actor, não está na exceção).
- Evidência 11/09: os 8 merges do dia (#599 #600 #601 #602 #603 #605 #607 #608,
  `mergedBy: app/github-actions`) tinham **zero** runs de `ci.yml` no SHA de
  merge; a única run da main foi o push manual do founder (`4e61a46`,
  run 34570390983). A main deployou no Railway 8× sem CI própria.

**Fecho do furo — `.github/workflows/main-after-merge.yml`** (cron `*/15`):
lê o HEAD da main, consulta as runs de `ci.yml` e `post-deploy-smoke.yml`
filtradas por `head_sha` e, se não houver run, despacha `gh workflow run <wf>
--ref main` — `workflow_dispatch` com o `GITHUB_TOKEN` **é** a exceção
documentada, por isso funciona sem PAT e sem GitHub App. Dedup por `head_sha`
(a run despachada aparece com esse SHA; in-progress conta). O smoke
despachado recebe `github.sha` = HEAD e compara `api.sha == web.sha == HEAD`
(#576). Alarme: HEAD >30 min sem run de `ci.yml`, ou run de `ci.yml` no HEAD
vermelha → Telegram + summary + run vermelho; `TELEGRAM_*` ausentes = vermelho
já no preflight (o dispatch corre na mesma). `cron-absence-watch.yml` vigia
este vigia (janela 2 h).

Como provar "verde na main" para um SHA `X` (**`X` = SHA COMPLETO, 40 hex**):

```bash
X=$(git rev-parse origin/main)   # ou: git rev-parse <sha-curto>; nunca colar o curto
gh api "repos/tavinorama/ChampsFlow/actions/workflows/ci.yml/runs?branch=main&head_sha=$X" \
  --jq '.workflow_runs[] | {id, event, conclusion}'
# vazio = NÃO está verde na main, por mais verde que o PR tenha sido.
```

Nunca "provar" verde na main com a run do PR: o PR corre no merge-commit
provisório (`refs/pull/N/merge`), não no SHA que deployou.

### O SHA tem de ter 40 caracteres — nos dois lados (regra de 2026-09-11)

Um SHA curto não dá erro claro em nenhum dos dois comandos; dá um resultado
que parece outra coisa:

- **Despachar CI com SHA curto = CI vermelha falsa.** Medido 11/09:
  `gh workflow run ci.yml -r main -f sha=3c9805f` → `actions/checkout@v4`
  falhou nos 6 jobs com *"The process '/usr/bin/git' failed with exit code 1"*
  (run 34593023213). Causa: o checkout faz `fetch-depth: 1` e o servidor não
  resolve abreviações. Com o SHA completo a mesma run é verde (run
  34593141148). A leitura ingénua de 34593023213 era "CI vermelha na main";
  era o input.
- **Filtrar runs com SHA curto = "não verde" falso.** `head_sha=3c9805f`
  devolve 0 runs; `head_sha=3c9805f054a0c4f9a5d3d20d6736d0ccaa34da87`
  devolve as 2 runs acima. A API filtra por igualdade exata.

Proteção no `ci.yml` (PR desta regra): o primeiro step de cada job,
*"Resolve dispatch SHA"*, só corre em `workflow_dispatch` e (1) aceita
`^[0-9a-f]{40}$`, (2) expande um SHA curto via
`gh api repos/…/commits/<curto>` e anota `::notice`, (3) falha **antes do
checkout** com `::error` "Use the FULL 40-hex SHA" para qualquer outro valor
(desconhecido, ambíguo, `main`, 41 chars). O checkout recebe
`steps.sha.outputs.sha`, nunca o input em bruto. Em `push`/`pull_request` o
step é saltado e o checkout usa o HEAD do ref, como antes. Se ainda assim
vires os 6 jobs vermelhos no *checkout* de uma run `workflow_dispatch`, o
problema é outro (ref apagado, permissões) — não é mais o SHA curto.

## Se renomear um job de ci.yml

O nome do job É o context da proteção. Renomear job = o check antigo fica
"Expected" para sempre e nenhum PR mergeia. Ordem certa: adicionar o context
novo à proteção → mergear a renomeação → remover o context velho.
