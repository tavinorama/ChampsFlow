-- reconcile-g03.sql — LEITURA APENAS (correr dentro de BEGIN; SET TRANSACTION READ ONLY;).
-- Incidente P0 G03 (11/09/2026): vereditos gravados em ops.agent_outcome com o
-- MESMO nome de métrica que o coletor, e o harvest somava tudo por prefixo.
--
-- Para cada linha DERIVADA (escrita por um nó verdict) reconstrói a aritmética
-- do que o harvest somou e classifica, SEM presumir cronologia nem tratar a
-- soma-só-coletor como verdade:
--   not_affected : derivado == soma só do coletor na janela e sem derivados na janela
--   rolling_only : sem derivados na janela, mas derivado != soma do coletor
--                  (ou soma de snapshots rolling sobrepostos — explicação aritmética)
--   recursive    : havia derivados na janela e derivado == soma de todo o prefixo
--   both         : havia derivados na janela e derivado != soma de todo o prefixo
--   unknown      : não há janela reconstruível (sem run/step) ou sem linhas na janela
-- A janela usada é [started_at do run, measured_at do veredito] — a mesma do
-- runner quando não há sinceNode; grafos com sinceNode (A/B, blog-announce)
-- ficam marcados window_kind='run_start_approx'.
-- Não escreve nada. Não expõe dados pessoais (só ids, métricas, números, datas).

BEGIN;
SET TRANSACTION READ ONLY;

WITH derived AS (
  SELECT ao.id, ao.metric, ao.value_after, ao.measured_at,
         s.node, r.graph, r.started_at AS window_start
    FROM ops.agent_outcome ao
    JOIN ops.agent_step s ON s.id = ao.step_id
    JOIN ops.agent_run  r ON r.id = s.run_id
   WHERE r.graph <> 'social-harvest'
),
collector AS (
  SELECT ao.id, ao.metric, ao.value_after, ao.measured_at, r.graph, s.node
    FROM ops.agent_outcome ao
    JOIN ops.agent_step s ON s.id = ao.step_id
    JOIN ops.agent_run  r ON r.id = s.run_id
   WHERE r.graph = 'social-harvest' AND s.node LIKE 'harvest:%'
),
per_derived AS (
  SELECT d.id, d.graph, d.node, d.metric, d.measured_at, d.window_start, d.value_after AS derived_value,
         (SELECT COALESCE(SUM(c.value_after), 0) FROM collector c
           WHERE c.metric LIKE d.metric || '%'
             AND c.measured_at >= d.window_start AND c.measured_at < d.measured_at) AS collector_sum,
         (SELECT COUNT(*) FROM collector c
           WHERE c.metric LIKE d.metric || '%'
             AND c.measured_at >= d.window_start AND c.measured_at < d.measured_at) AS collector_rows,
         (SELECT COALESCE(SUM(x.value_after), 0) FROM ops.agent_outcome x
           WHERE x.metric LIKE d.metric || '%'
             AND x.measured_at >= d.window_start AND x.measured_at < d.measured_at) AS prefix_sum,
         (SELECT COUNT(*) FROM derived e
           WHERE e.metric LIKE d.metric || '%'
             AND e.measured_at >= d.window_start AND e.measured_at < d.measured_at) AS derived_in_window
    FROM derived d
)
SELECT id, graph, node, metric, measured_at, window_start, derived_value,
       collector_rows, collector_sum, prefix_sum, derived_in_window,
       CASE
         WHEN window_start IS NULL OR (collector_rows = 0 AND derived_in_window = 0) THEN 'unknown'
         WHEN derived_in_window = 0 AND derived_value = collector_sum THEN 'not_affected'
         WHEN derived_in_window = 0 THEN 'rolling_only'
         WHEN derived_value = prefix_sum THEN 'recursive'
         ELSE 'both'
       END AS class,
       'run_start_approx' AS window_kind
  FROM per_derived
 ORDER BY metric, measured_at;

-- Primeiro registro afetado por grafo/métrica (só classes != not_affected/unknown):
-- (repetir a CTE acima se o cliente SQL não suportar reutilização; mantido simples aqui)

ROLLBACK;
