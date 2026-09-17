# prospect-batch — a decorated contract is still the contract (2026-09-17)

Local branch `prep/prospect-batch-markdown-contract`, base `7147503`. Risk **MEDIUM** (sales graph validator + one summary line in the graph runner; no migration, no env, no send — the machine never sends). HELD until F2/F3.

## What was measured

Run `bba56faa`, Wednesday 16/09 07:30Z: `prospects` snapshot **5,331 chars** (09/09 was 5,528 chars and stored 5 verified contacts — so the batch was **not** empty; my first hypothesis of 16/09, an empty batch, is withdrawn), `draft` ok, `critic` ok, then `finalize` refused three times by the code validator — *"nenhum bloco '=== PROSPECT: ... ===' encontrado no lote"* — retry budget exhausted, run failed. No batch reached the founder this week. The refusal kept nothing of what the model returned, and the artifact lives in Redis, so the exact output is unrecoverable.

The parser read the contract at column 0 only (`/^=== PROSPECT:\s*/m`, `/^\[EMAIL\s+(\d)\]\s*$/m`). A finalize that wraps the same batch in markdown — `## === PROSPECT: X ===`, `**[EMAIL 1]**`, `**SUBJECT:**`, a code fence — parses as zero blocks. That is the most likely shape of the failure; it cannot be proven without the artifact, which is the second defect.

## What changes

1. `apps/api/src/lib/prospecting.ts` — the three line markers (prospect header, `[EMAIL n]`, `SUBJECT:`) tolerate leading whitespace and markdown decoration (`# > * _ \` ~ -`), lone code-fence lines are dropped, the prospect name is stripped of emphasis marks, and the honest-empty sentinel is recognised when fenced or bold. **Content rules are untouched**: EMAIL 1 with a link still fails, the question is still required, `?from=` still required, touches unchanged, invented prospect still refused.
2. `describeOutputShape()` + `graph-runner.ts` — a refusal now ends with `saida <N> chars, 1a linha: "<first line, e-mails masked, ≤90 chars>"`. The next failure is diagnosable from `ops.agent_step.summary`.

## What this does NOT do

- Does not fall back to the draft when finalize exhausts its budget (that would ship copy without the critic's vetoes; a separate decision).
- Does not re-run this week's batch. Re-running is an operator action that calls the sourcing engines — founder's call.

## Tests

`tests/unit/prospect-batch-markdown-contract.test.ts` (7): plain contract parses exactly as before; the decorated batch yields the same name, three e-mails, subjects and body, and validates; a link in EMAIL 1 still fails when decorated; prose without the contract still fails with the same error; the empty sentinel stays valid fenced/bold; the shape line masks e-mails and is capped; the runner writes it. On base the old regex finds **0 blocks** in the decorated fixture — the 16/09 error. Existing `prospect-batch` (48) and `prospect-leva2` (26) unchanged and green.

## Rollback

Revert the commit: markers go back to column 0 and the summary loses the shape line.

## Proof owed after deploy

Wednesday 23/09 07:30Z: `prospect-batch` reaches `approval`; or, if finalize is refused, the step summary shows what came back.
