/**
 * smartlead-bounce-watch-alarm.test.ts — the bounce alarm must actually fire.
 *
 * 18–19/09: the bounce watch went red six times and the alarm step was skipped
 * every time. GitHub Actions runs a `run:` block as `bash -eo pipefail`; the red
 * pipeline ended the step before `code=` was written, and the alarm step had no
 * always(). These tests RUN the two shell blocks the way Actions runs them.
 */
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = join(__dirname, "../..");
const wf = readFileSync(join(root, ".github/workflows/smartlead-bounce-watch.yml"), "utf8");

/** The `run: |` block of the step with this name, dedented. */
function runBlock(stepName: string): string {
  const at = wf.indexOf(`- name: ${stepName}`);
  expect(at).toBeGreaterThan(-1);
  const rest = wf.slice(at);
  const lines = rest.slice(rest.indexOf("run: |") + "run: |".length).split("\n").slice(1);
  const out: string[] = [];
  for (const l of lines) {
    if (l.trim() !== "" && !l.startsWith("          ")) break;
    out.push(l.slice(10));
  }
  return out.join("\n");
}

function actionsBash(script: string, env: Record<string, string>, cwd: string) {
  return spawnSync("bash", ["--noprofile", "--norc", "-eo", "pipefail", "-c", script], {
    encoding: "utf8", cwd, env: { PATH: process.env.PATH ?? "", ...env },
  });
}

describe("bounce watch: a red read still writes its code, and the alarm runs", () => {
  const read = runBlock("Read the bounce rate");
  const alarm = runBlock("Alarm (Telegram when wired, summary always)");

  it("the alarm step has always() — without it Actions skips it after any failure", () => {
    expect(wf).toMatch(/if: always\(\) && steps\.read\.outputs\.code != '0'/);
  });

  for (const exit of [1, 0, 3]) {
    it(`read step: the measured command exits ${exit} → code=${exit} is written and the step itself does not die`, () => {
      const dir = mkdtempSync(join(tmpdir(), "bw-"));
      const script = read.replace(/python3 scripts\/smartlead\/campaigns_v4\.py bounce-watch/, `(echo '{"alarmes": ["x"]}'; exit ${exit})`);
      expect(script).not.toBe(read);
      const r = actionsBash(script, { SL_KEY: "k", GITHUB_OUTPUT: join(dir, "out"), GITHUB_STEP_SUMMARY: join(dir, "sum") }, dir);
      expect(r.status).toBe(0);
      expect(readFileSync(join(dir, "out"), "utf8")).toContain(`code=${exit}`);
    });
  }

  it("read step: a missing probe key is an alarm (code=2), never a silent pass", () => {
    const dir = mkdtempSync(join(tmpdir(), "bw-"));
    const r = actionsBash(read, { SL_KEY: "", GITHUB_OUTPUT: join(dir, "out"), GITHUB_STEP_SUMMARY: join(dir, "sum") }, dir);
    expect(r.status).toBe(0);
    expect(readFileSync(join(dir, "out"), "utf8")).toContain("code=2");
  });

  it("alarm step: red, names the missing channel, and survives a missing result file", () => {
    const dir = mkdtempSync(join(tmpdir(), "bw-"));
    const script = alarm.replace("${{ steps.read.outputs.code }}", "");
    const r = actionsBash(script, { GITHUB_STEP_SUMMARY: join(dir, "sum"), RUN_URL: "https://example.invalid/run" }, dir);
    expect(r.status).toBe(1);
    const sum = readFileSync(join(dir, "sum"), "utf8");
    expect(sum).toContain("NAO MEDI");
    expect(sum).toContain("telegram=sem_canal");
  });

  it("alarm step: on the threshold it quotes the alarms SmartLead's numbers produced", () => {
    const dir = mkdtempSync(join(tmpdir(), "bw-"));
    writeFileSync(join(dir, "result.txt"), 'RESULTADO_OZVOR{"ok": false, "alarmes": ["geo 3.1%"]}\n');
    const script = alarm.replace("${{ steps.read.outputs.code }}", "1");
    const r = actionsBash(script, { GITHUB_STEP_SUMMARY: join(dir, "sum"), RUN_URL: "u" }, dir);
    expect(r.status).toBe(1);
    expect(readFileSync(join(dir, "sum"), "utf8")).toContain('"alarmes": ["geo 3.1%"]');
    expect(existsSync(join(dir, "sum"))).toBe(true);
  });
});
