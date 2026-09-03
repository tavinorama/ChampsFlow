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

## Se renomear um job de ci.yml

O nome do job É o context da proteção. Renomear job = o check antigo fica
"Expected" para sempre e nenhum PR mergeia. Ordem certa: adicionar o context
novo à proteção → mergear a renomeação → remover o context velho.
