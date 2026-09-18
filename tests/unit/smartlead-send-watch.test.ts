/**
 * smartlead-send-watch.test.ts — the send watch must not cry wolf.
 *
 * 17/09 20:44Z: the watch went red with "ENVIO PARADO" on a day when the two v4
 * campaigns had sent 200 e-mails. It compared with the measurement of four
 * hours earlier, and with a daily quota of 100 new leads per campaign the day's
 * sending is over in the first hour. The ruler is now day over day; these tests
 * pin that, and pin that a real stop still shouts.
 */
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "../..");
const SCRIPT = join(root, "scripts/smartlead/send_watch.py");
const H = 3600;
const now = 1_790_000_000;

function decide(state: unknown, total: number, active = 2) {
  const r = spawnSync("python3", [SCRIPT, "decide"], { encoding: "utf8", input: JSON.stringify({ state, now, total, active }) });
  expect(r.status).toBe(0);
  return JSON.parse(r.stdout);
}

describe("send watch: day over day, never hour over hour", () => {
  it("the 17/09 case is NOT a stop: quota sent early, same total four hours later", () => {
    const state = { history: [{ ts: now - 4 * H, total: 200 }] };
    expect(decide(state, 200)).toMatchObject({ envio_parado: false, delta: null, medicao_referencia: null });
  });

  it("a real stop shouts: nothing new against a measurement a day old", () => {
    const state = { history: [{ ts: now - 24 * H, total: 200 }, { ts: now - 4 * H, total: 200 }] };
    expect(decide(state, 200)).toMatchObject({ envio_parado: true, delta: 0, medicao_referencia: 200, referencia_horas: 24 });
  });

  it("growth against yesterday is healthy, and the reference is the NEWEST one old enough", () => {
    const state = { history: [{ ts: now - 48 * H, total: 0 }, { ts: now - 20 * H, total: 200 }, { ts: now - 4 * H, total: 400 }] };
    expect(decide(state, 400)).toMatchObject({ envio_parado: false, delta: 200, medicao_referencia: 200 });
  });

  it("no active campaign is not an alarm, and neither is the pre-18/09 state without a timestamp", () => {
    expect(decide({ history: [{ ts: now - 24 * H, total: 200 }] }, 200, 0).envio_parado).toBe(false);
    expect(decide({ total: 200 }, 200)).toMatchObject({ envio_parado: false, medicao_referencia: null });
    expect(decide(null, 0)).toMatchObject({ envio_parado: false });
  });

  it("the workflow runs the tested script and records the measurement even when the alarm fires", () => {
    const wf = readFileSync(join(root, ".github/workflows/smartlead-send-watch.yml"), "utf8");
    expect(wf).toContain("python3 scripts/smartlead/send_watch.py");
    expect(wf).toMatch(/if: always\(\)\s+uses: actions\/cache\/save@v4/);
    expect(wf).not.toMatch(/uses: actions\/cache@v4/); // the combined action only saves on success
  });
});
