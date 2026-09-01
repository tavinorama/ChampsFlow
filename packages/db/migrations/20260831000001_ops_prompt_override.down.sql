-- Rollback do armazém de overrides de prompt (5.F.2). Derrubar a tabela
-- devolve a feature ao estado OFF fail-soft: activePromptOverrides do worker
-- lê null (nenhum override aplicado — todo grafo volta aos prompts estáticos
-- do código), storePromptOverride reporta a tabela ausente com a ação nominal
-- que destrava, e o cron semanal declara a feature DESLIGADA em vez de
-- iniciar runs. Nada mais depende desta tabela.
--
-- Nota: para reverter UM override específico (não a feature inteira), o
-- caminho não é este down — é uma linha NOVA com body = '' (volta ao prompt
-- estático) ou com o body anterior, aprovada pelo founder como qualquer outra.

DROP TABLE IF EXISTS ops.prompt_override;
