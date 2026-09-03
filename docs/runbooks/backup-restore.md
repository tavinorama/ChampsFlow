# Backup & Restore — o estado HONESTO

> Owner: founder · Criado: 2026-09-02 (10.B.1)
> Regra deste runbook: nada aqui inventa proteção que não existe.

## TL;DR

**Não existe backup do lado do repositório.** Zero jobs de backup, zero
`pg_dump` agendado, zero bucket S3 — o texto do DPIA R5 que afirmava "logical
backups to S3 every 6 hours" estava errado e foi corrigido em 2026-09-02
(nota append-only em `docs/compliance/dpia.md`). A única camada de proteção
hoje é o **backup de plano da Supabase** (daily backups e/ou PITR conforme o
plano) — e ela **ainda não foi verificada pelo founder**. Até essa
verificação, trate a capacidade de restore como NÃO COMPROVADA.

## O que existe (fato)

| Camada | Estado |
|---|---|
| Backup próprio (pg_dump / S3 / cron) | **NÃO EXISTE** |
| Supabase plan-level backup | Provável (depende do plano) — **não verificado** |
| Supabase PITR | Só em planos pagos com add-on — **não verificado** |
| Redis (filas/pulsos/rate-limits) | Efêmero por design — perda aceitável (repeatables se re-registram no boot) |
| Migrações reversíveis (`.down.sql`) | Existem para todas as migrações — rollback de SCHEMA, não de dados |

## Ação do founder — verificar a Supabase (fazer uma vez, registrar aqui)

1. Dashboard Supabase → projeto `wdeabrzpgshnouvnfvml` → **Database → Backups**.
2. Registrar NESTE arquivo (append na tabela abaixo): plano atual, frequência
   dos backups, retenção (dias), PITR ligado?, data do backup mais recente.
3. Fazer **um teste de restore** num projeto/branch descartável (Backups →
   Restore, ou download do dump + `psql` num Postgres local) e cronometrar.
   Backup nunca exercitado ≠ backup ("'pronto' exige prova").
4. Decidir se o plano atual cobre o RPO/RTO aceito no DPIA R5 (4h de
   restauração alvo). Se não: upgrade de plano OU criar job de `pg_dump`
   próprio (decisão M, PR dedicado — fora do escopo de 10.B).

| Data | Plano | Frequência | Retenção | PITR | Último backup visto | Restore testado? |
|---|---|---|---|---|---|---|
| _(pendente — founder preenche na verificação)_ | | | | | | |

## Restore (com o que existe hoje)

1. **Supabase restore**: Dashboard → Database → Backups → Restore (substitui o
   banco do projeto; downtime total durante o restore). Sem PITR, a perda é
   "desde o último backup diário" — até 24h de dados.
2. Depois do restore: `npm run db:migrate` NÃO deve ser necessário (o dump
   carrega o schema), mas conferir `schema_migrations` contra
   `packages/db/migrations/`; aplicar `.up.sql` faltantes se o backup for
   anterior a um deploy recente.
3. Redeploy dos serviços (api, worker) para reconectar pools; smoke:
   `/healthz` + `/api/v1/agent-org/liveness` + um login real.
4. Registrar o incidente (`docs/learning/postmortems/`).

## O que este runbook NÃO é

Não é um plano de backup. É o registro honesto de que ele ainda não existe,
com o caminho mínimo (verificação Supabase) para transformar "provável" em
"provado". Criar backup próprio versionado (pg_dump agendado + storage fora
da Supabase + teste de restore recorrente) é item M, PR dedicado.
