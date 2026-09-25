# AI Audit Stack — verificação de preços do catálogo (B16, Codex D18) — 25/09/2026

O Codex apontou (D18) que o catálogo servido pelo AI Audit Stack tinha **15 ferramentas com preço "estimado" e `verified = false` em todas as 12 linhas de produção** de `ai_tool`, e que o relatório ao cliente mostra esses números. Esta é a primeira passagem de verificação: **preço de lista lido na página de preços do próprio fornecedor**, em 25/09/2026, por leitura direta da página (sem chamada paga). Horas poupadas por semana **não** foram verificadas (não há fonte pública), por isso `verified` continua `false` em todas as linhas: o relatório continua a dizer "estimativas não verificadas" até um humano validar as horas.

## Tabela

| id | Ferramenta | Antes (seed) | Preço lido | Estado | Onde | Nota |
|---|---|---:|---:|---|---|---|
| claude | Claude | 20 | 20 | verified | claude.com/pricing | Pro $20/mo |
| jasper | Jasper | 49 | 69 | verified | jasper.ai/pricing | Creator $69/mo mensal; $59 anual |
| intercom-fin | Intercom Fin | 99 | 29 | verified | intercom.com/pricing | Essential seat $29 + Fin $0.99 por resolução; 29 é o piso, uso em cima |
| make | Make | 16 | 16 | verified | make.com/pricing | Pro $16; Core $9; Teams $29 |
| zapier | Zapier | 30 | 29.99 | verified | zapier.com/pricing | Professional $29.99 mensal; $19.99 anual |
| opus-clip | Opus Clip | 29 | 29 | verified | opus.pro/pricing | Pro $29; Starter $15 |
| buffer | Buffer | 12 | 5 | verified | buffer.com/pricing | Essentials $5 por canal; Team $10 por canal |
| hex | Hex | 36 | 36 | verified | hex.tech/pricing | Team $36/editor; Professional $75 |
| weave | Weave | 99 | 199 | verified | getweave.com/pricing | "from $199/mo" |
| chatgpt | ChatGPT | 20 | 20 | estimate | openai.com (403) | Plus $20 é público, mas a página não respondeu |
| fireflies | Fireflies.ai | 18 | 18 | estimate | fireflies.ai (JS) | página não legível sem browser |
| apollo | Apollo.io | 49 | 49 | estimate | apollo.io (bot wall) | |
| gamma | Gamma | 10 | 10 | estimate | gamma.app (JS) | |
| nexhealth | NexHealth | 79 | 79 | estimate | nexhealth.com | só orçamento |
| podium | Podium | 89 | 89 | estimate | podium.com/pricing | só orçamento |

`verified` = preço de lista lido na página do fornecedor nesta data. `estimate` = continua o número original, com a razão.

## O que mudou no código

- `Tool` ganha `priceCheckedAt?` e `priceNote?` (proveniência do preço). Ausente = ainda estimativa.
- `seed-catalog.ts`: 9 preços verificados (4 alterados: Jasper, Intercom Fin, Buffer, Weave; Zapier 30 → 29.99), nota em todos os 15.
- `tests/unit/ai-audit-catalog-prices.test.ts`: lê esta tabela e garante que o seed bate com ela (preço, estado, nota). Se um preço mudar num sítio e não no outro, o teste falha.

## SQL para o founder (produção, `ai_tool`)

`scripts/sql/ai-tool-prices-2026-09-25.sql`: UPDATE de `monthly_cost_usd` só nas linhas verificadas e só onde o valor difere; **não toca em `verified`**. Antes de correr: `SELECT id, monthly_cost_usd, verified FROM ai_tool ORDER BY id;` e guardar. Depois: a mesma consulta deve mostrar os 9 valores da tabela e `verified` inalterado.

## Fica por fazer (não é deste PR)

- Verificar horas poupadas com uma fonte defensável (estudo de caso do fornecedor, ou medição num cliente) e só então `verified = true` linha a linha.
- Repetir esta leitura a cada trimestre; os preços de Zapier/Jasper mudaram nos últimos 12 meses.
- Os 4 fornecedores ilegíveis por fetch (ChatGPT, Fireflies, Apollo, Gamma) precisam de leitura num browser real.
