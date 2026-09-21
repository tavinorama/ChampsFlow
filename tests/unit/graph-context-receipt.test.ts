/**
 * graph-context-receipt.test.ts — P16 (Lote A, 21/09).
 *
 * [__signals__] and [__gaps__] are optional and fail-open: a graph keeps
 * writing when the connector is missing, empty or down. That stays. What these
 * tests pin is that the absence is WRITTEN DOWN where a human reads it — the
 * step summary and the approval box — and never turned into prompt text.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  contextReceipt,
  contextApprovalLine,
  CONTEXT_ARTIFACT,
} from "../../apps/api/src/lib/graph-runner";

describe("contextReceipt / contextApprovalLine", () => {
  it("both blocks present → a receipt, and no warning line for the founder", () => {
    const r = contextReceipt({ signals: "on", gaps: "on" });
    expect(r).toBe("ctx signals=on gaps=on");
    expect(contextApprovalLine(r)).toBeNull();
  });

  it("connector not configured → the approval says so, in plain words", () => {
    const line = contextApprovalLine(contextReceipt({ signals: "not_wired", gaps: "on" }));
    expect(line).toContain("SEM sinais externos atuais (conector nao configurado neste worker)");
    expect(line).not.toContain("lacunas");
    expect(line).toContain("NÃO partiu de conversa nem de auditoria de hoje");
  });

  it("empty and error are different reasons, and both are named", () => {
    const line = contextApprovalLine(contextReceipt({ signals: "error", gaps: "empty" }));
    expect(line).toContain("SEM sinais externos atuais (a leitura falhou)");
    expect(line).toContain("SEM lacunas proprias da auditoria (a fonte respondeu vazio)");
  });

  it("no receipt (non-marketing run, or an old run) → no line, never a guess", () => {
    expect(contextApprovalLine(null)).toBeNull();
    expect(contextApprovalLine("something else")).toBeNull();
  });
});

describe("the receipt is for humans — it never reaches a prompt", () => {
  const runner = readFileSync(join(__dirname, "../../apps/api/src/lib/graph-runner.ts"), "utf8");

  it("is stored per run and never unshifted into upstream", () => {
    expect(CONTEXT_ARTIFACT).toBe("__context__");
    expect(runner).toContain("await artifacts.set(runId, CONTEXT_ARTIFACT, ctxReceipt)");
    expect(runner).not.toMatch(/upstream\.unshift\(\[CONTEXT_ARTIFACT/);
  });
});
