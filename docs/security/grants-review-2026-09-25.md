# Revisão de grants e RLS — produção, 25/09/2026 (B14, Codex D20)

Leitura em produção (só leitura, ~11:00 UTC): `pg_class` × `pg_policy` × `information_schema.role_table_grants` para o papel `app_user`.

## Achado

`schema_migrations` registra `20260728000001_operator_tables_rls` como **aplicada em 2026-07-30** (arquivo inalterado desde 28/07). Mesmo assim, em produção:

| Tabela | RLS | Policies | Grants de `app_user` | Contém |
|---|---|---|---|---|
| public.kit_order | **off** | 0 | INSERT, SELECT, UPDATE | e-mail |
| public.lead_capture | **off** | 0 | INSERT, SELECT, UPDATE | e-mail |
| public.nurture_enrollment | **off** | 0 | INSERT, SELECT, UPDATE | e-mail |
| public.nurture_send_log | **off** | 0 | INSERT, SELECT | e-mail |
| public.waitlist | **off** | 0 | INSERT, SELECT | e-mail |
| public.crm_contact | **off** | 0 | nenhum | e-mail, notas |
| public.pages_order | **off** | 0 | nenhum | e-mail |
| public.ai_tool, source_registry | off | 0 | nenhum | referência, sem PII (allowlist do check-rls) |
| ops.* (6 tabelas) | off | 0 | INSERT, SELECT(, UPDATE) | operação da empresa, sem tenant (por desenho) |

**Consequência real:** uma consulta com escopo de tenant (papel `app_user`) sobre `kit_order`, `lead_capture`, `nurture_*` ou `waitlist` não é filtrada por RLS. O único caminho tenant-scoped conhecido que toca essas tabelas é `GET /api/account/claimed-history` (filtra por `claimed_by_tenant_id` no SQL). Não foi demonstrada exploração; a defesa em profundidade que a migração prometia não está de pé.

**Por que o CI não viu:** o CI migra um banco novo e roda `check-rls.sql` nele. A produção derivou depois de a migração ter sido registrada. O `check-rls.sql` nunca correu contra a produção.

## O que este PR faz

1. `packages/db/migrations/20260925000001_operator_tables_rls_repair.up.sql`: re-aplica, de forma idempotente, ENABLE + FORCE + `service_only` (TO postgres) nas 7 tabelas, `tenant_claimed_read` (TO app_user) em `lead_capture` e `kit_order`, e ENABLE (sem FORCE) em `schema_migrations`. Nada é dropado ou re-concedido.
2. `tests/integration/db/rls.test.ts`: 4 casos novos com dois tenants sintéticos: A só vê os seus kit orders (nunca os de B, nunca os não reclamados); UPDATE cruzado afeta 0 linhas; `lead_capture` igual; `crm_contact`/`waitlist`/`nurture` invisíveis a tenant; as 7 tabelas com RLS ligado, forçado e `service_only`.

## O que fica com o founder (produção)

- Aplicar a migração de reparo (`npm run db:migrate` no ambiente de produção, ou o caminho habitual de migrações). **Antes**, guardar o resultado desta consulta como "antes"; **depois**, rodar `psql $DATABASE_URL -t -A -f packages/db/scripts/check-rls.sql` (esperado: 0 linhas) e repetir a consulta abaixo (esperado: nenhuma das 7 tabelas listada).
- Descobrir **como** a RLS foi desligada depois de 30/07 (painel do Supabase? `ALTER TABLE … DISABLE`? restauração de backup anterior à migração?). Este PR não sabe; o histórico de comandos do Supabase pode saber.
- Rodar `check-rls.sql` contra a produção numa rotina (ex.: o mesmo vigia que lê a saúde), não só no CI.

## Consulta usada (só leitura)

```sql
SELECT n.nspname, c.relname, c.relrowsecurity AS rls, c.relforcerowsecurity AS forced,
       (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid) AS policies,
       (SELECT string_agg(privilege_type, ',') FROM information_schema.role_table_grants g
         WHERE g.table_schema = n.nspname AND g.table_name = c.relname AND g.grantee = 'app_user') AS app_user_grants
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE c.relkind = 'r' AND n.nspname IN ('public','ops')
   AND (NOT c.relrowsecurity OR (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid) = 0)
 ORDER BY 1, 2;
```
