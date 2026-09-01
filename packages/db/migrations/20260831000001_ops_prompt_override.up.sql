-- ops.prompt_override — o armazém durável de overrides de prompt (5.F.2).
--
-- POR QUE EXISTE. Os prompts das esferas são CÓDIGO ESTÁTICO
-- (apps/api/src/lib/graph-prompts.ts): melhorar um prompt exige um PR humano,
-- então os vereditos e as rejeições registrados toda semana não mudam NADA no
-- que os grafos escrevem. O grafo semanal prompt-tuner fecha esse loop: lê os
-- fatos agregados de 21 dias (vereditos, rejeições do founder com motivo
-- literal, timeouts de aprovação), propõe NO MÁXIMO UMA mudança de prompt, e
-- SÓ a proposta que o founder aprovou no Telegram pode pousar aqui. O runner
-- então resolve cada prompt_key primeiro neste ledger: a linha mais NOVA por
-- prompt_key vence; sem linha (ou body vazio) → o prompt estático do código.
--
-- FORMA: espelho exato de ops.memory_lesson (5.F.1) — ledger append-only de
-- documentos, a linha mais nova vence na leitura. Uma linha por override
-- aprovado (o prompt COMPLETO como TEXT), nunca um edit — "um veredito que
-- pode ser editado não é um veredito". O histórico fica consultável: como os
-- prompts da casa evoluíram é registro que vale guardar.
--
-- CONTRATO DE ROLLBACK (append-only, sem UPDATE/DELETE):
--   reverter um override NÃO é apagar a linha — é INSERIR uma linha nova:
--   - body = o body ANTERIOR  → volta ao override anterior;
--   - body = ''  (string vazia) → volta ao PROMPT ESTÁTICO do código
--     (o runner trata body vazio como "sem override" na resolução).
--   Toda linha nova passa pelo mesmo gate do founder — rollback também é
--   uma decisão aprovada, nunca um edit silencioso.
--
-- SEGURANÇA: a allowlist de prompt_keys tunáveis vive no CÓDIGO
-- (TUNABLE_PROMPT_KEYS em graph-prompts.ts) e é aplicada no nó store E na
-- leitura — prompts de approval/publish/store e os do próprio prompt-tuner
-- nunca são tunáveis (sem auto-modificação). A tabela não impõe a allowlist
-- de propósito: o código é a fonte, e uma chave fora dela é ignorada na
-- resolução mesmo que uma linha exista.
--
-- PII: nenhuma. Overrides são texto de prompt distilado de agregados ops.*
-- (slugs, statuses, números) — nenhum dado de tenant chega aqui.

CREATE TABLE IF NOT EXISTS ops.prompt_override (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- O run do prompt-tuner cuja aprovação produziu este override — auditável
  -- até o sim do founder no Telegram. SET NULL mantém o override vivo mesmo
  -- se runs antigas forem podadas um dia.
  source_run_id UUID        REFERENCES ops.agent_run (id) ON DELETE SET NULL,
  -- A chave do prompt no registry (ex.: 'linkedin-critic') — o slug que o
  -- runner resolve em graph-prompts.ts.
  prompt_key    TEXT        NOT NULL,
  -- O prompt COMPLETO aprovado (não um diff). '' = reverter ao estático.
  body          TEXT        NOT NULL,
  approved_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- O runner lê "a linha mais nova por prompt_key" a cada tick — indexar o sort.
CREATE INDEX IF NOT EXISTS idx_prompt_override_key_time
  ON ops.prompt_override (prompt_key, approved_at DESC);

-- Grants espelham ops.memory_lesson: append-only para o role de runtime. Um
-- override que pode ser editado depois da aprovação não é o que o founder
-- aprovou.
GRANT SELECT, INSERT ON ops.prompt_override TO app_user;
REVOKE UPDATE, DELETE ON ops.prompt_override FROM app_user;

GRANT SELECT ON ops.prompt_override TO organicposts_admin;
