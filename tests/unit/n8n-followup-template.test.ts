/**
 * n8n-followup-template.test.ts — B12 (Codex D01, D09 — 23/09).
 * The importable workflow must keep the fail-closed contract in ops/n8n/README.md.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const path = join(__dirname, "../../ops/n8n/new-lead-followup.fail-closed.json");
const raw = readFileSync(path, "utf8");
const wf = JSON.parse(raw) as {
  nodes: Array<{ name: string; type: string; onError?: string; parameters: Record<string, unknown>; credentials?: Record<string, { id: string }> }>;
  connections: Record<string, { main: Array<Array<{ node: string }>> }>;
};
const node = (name: string) => wf.nodes.find((n) => n.name === name)!;

describe("the fail-closed follow-up workflow", () => {
  it("parses and has the nodes the contract names", () => {
    for (const n of ["Pick Next Lead", "Contract: auth error fails, empty is no-op", "Has an eligible lead?", "No lead: no-op", "AI Draft (Hermes)", "Contract: draft must be ok=true with output", "Founder approval (Telegram)", "Alarm: run FAILED (Telegram)", "Stop and Error"]) {
      expect(node(n), n).toBeDefined();
    }
  });
  it("HTTP nodes never swallow errors (neverError: false) and route errors to the alarm", () => {
    for (const n of ["Pick Next Lead", "AI Draft (Hermes)"]) {
      const p = node(n).parameters as { options: { response: { response: { neverError: boolean; fullResponse: boolean } } } };
      expect(p.options.response.response.neverError, n).toBe(false);
      expect(p.options.response.response.fullResponse, n).toBe(true);
      expect(node(n).onError).toBe("continueErrorOutput");
      expect(wf.connections[n]!.main[1]![0]!.node).toBe("Alarm: run FAILED (Telegram)");
    }
  });
  it("the Leads contract fails on 401/403/INVALID_API_KEY and on 5xx, and treats an empty list as a no-op", () => {
    const code = String(node("Contract: auth error fails, empty is no-op").parameters["jsCode"]);
    expect(code).toContain("INVALID_API_KEY");
    expect(code).toContain("status === 401 || status === 403");
    expect(code).toContain("throw new Error(`LEADS_AUTH_FAILED");
    expect(code).toContain("status >= 500");
    expect(code).toContain("{ json: { empty: true } }");
    expect(wf.connections["Has an eligible lead?"]!.main[1]![0]!.node).toBe("No lead: no-op");
  });
  it("an accepted Hermes job (started:true, no output) is not a draft", () => {
    const code = String(node("Contract: draft must be ok=true with output").parameters["jsCode"]);
    expect(code).toContain("body?.ok !== true || typeof body?.output !== 'string'");
    expect(code).toContain("DRAFT_NOT_PRODUCED");
  });
  it("every failure ends in Stop and Error after the alarm — no red path is green", () => {
    expect(wf.connections["Alarm: run FAILED (Telegram)"]!.main[0]![0]!.node).toBe("Stop and Error");
    expect(node("Stop and Error").type).toBe("n8n-nodes-base.stopAndError");
  });
  it("a valid draft goes to founder approval, never straight to a send", () => {
    expect(wf.connections["Contract: draft must be ok=true with output"]!.main[0]![0]!.node).toBe("Founder approval (Telegram)");
    expect(wf.nodes.some((n) => /smartlead|reply-email-thread|sendMessage/i.test(JSON.stringify(n.parameters)) && n.type.includes("httpRequest"))).toBe(false);
  });
  it("carries no secret: credentials are placeholders, keys come from n8n credentials and env", () => {
    expect(raw).not.toMatch(/ozk_|sk-|Bearer [A-Za-z0-9]/);
    for (const n of wf.nodes) for (const c of Object.values(n.credentials ?? {})) expect(c.id).toMatch(/^REPLACE_WITH_/);
    expect(raw).toContain("$env.LEADS_BASE_URL");
  });
});
