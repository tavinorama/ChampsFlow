/**
 * smartlead-send-watch.test.ts — the send watch must not cry wolf, and must
 * not stay quiet either.
 *
 * 17/09 20:44Z: the watch went red with "ENVIO PARADO" on a day when the two v4
 * campaigns had sent 200 e-mails (it compared with four hours earlier). The
 * ruler became day over day. 25/09 (C05-b): the TOTAL hid a stopped campaign
 * behind a sending one, so the ruler is now per campaign, and only on a day
 * the campaign is scheduled to send, in its own timezone.
 */
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "../..");
const SCRIPT = join(root, "scripts/smartlead/send_watch.py");
const H = 3600;
const THU_10Z = 1_790_244_000; // Thursday 2026-09-24 10:00Z
const SAT_10Z = THU_10Z + 48 * H; // Saturday 2026-09-26 10:00Z
const MON_10Z = THU_10Z + 96 * H; // Monday 2026-09-28 10:00Z
const WEEKDAYS = [1, 2, 3, 4, 5];

type Camp = { id: string; name: string; sent: number; days?: number[] | null; tz?: string | null };

function decide(state: unknown, campaigns: Camp[], now = THU_10Z) {
  const r = spawnSync("python3", [SCRIPT, "decide"], { encoding: "utf8", input: JSON.stringify({ state, now, campaigns }) });
  expect(r.status, r.stderr).toBe(0);
  return JSON.parse(r.stdout) as { envio_parado: boolean; paradas: string[]; campanhas: Array<Record<string, unknown>>; total_enviados: number };
}

const geo = (sent: number, extra: Partial<Camp> = {}): Camp => ({ id: "1", name: "Geo", sent, days: WEEKDAYS, tz: "America/New_York", ...extra });
const stack = (sent: number, extra: Partial<Camp> = {}): Camp => ({ id: "2", name: "Stack", sent, days: WEEKDAYS, tz: "America/New_York", ...extra });
const mark = (ts: number, per: Record<string, number>) => ({ ts, total: Object.values(per).reduce((a, b) => a + b, 0), per });

describe("send watch: day over day, per campaign, on scheduled days only", () => {
  it("the 17/09 case is NOT a stop: quota sent early, same totals four hours later", () => {
    const state = { history: [mark(THU_10Z - 4 * H, { "1": 100, "2": 100 })] };
    const v = decide(state, [geo(100), stack(100)]);
    expect(v.envio_parado).toBe(false);
    expect(v.campanhas[0]).toMatchObject({ delta: null, medicao_referencia: null });
  });

  it("a real stop shouts and NAMES the campaign: Stack parked while Geo keeps sending (the total would have hidden it)", () => {
    const state = { history: [mark(THU_10Z - 24 * H, { "1": 100, "2": 100 })] };
    const v = decide(state, [geo(200), stack(100)]);
    expect(v.envio_parado).toBe(true);
    expect(v.paradas).toEqual(["Stack"]);
    expect(v.campanhas[0]).toMatchObject({ nome: "Geo", delta: 100, parada: false });
    expect(v.campanhas[1]).toMatchObject({ nome: "Stack", delta: 0, parada: true, referencia_horas: 24, medicao_referencia: 100 });
    expect(v.total_enviados).toBe(300);
  });

  it("growth against yesterday is healthy, and the reference is the NEWEST one old enough", () => {
    const state = { history: [mark(THU_10Z - 48 * H, { "1": 0 }), mark(THU_10Z - 24 * H, { "1": 200 }), mark(THU_10Z - 4 * H, { "1": 400 })] };
    const v = decide(state, [geo(400)]);
    expect(v.envio_parado).toBe(false);
    expect(v.campanhas[0]).toMatchObject({ delta: 200, medicao_referencia: 200 });
  });

  it("a weekday campaign is not 'stopped' on Saturday against Friday, but IS on Monday against Friday", () => {
    const fri10 = SAT_10Z - 24 * H;
    const state = { history: [mark(fri10, { "1": 500 })] };
    expect(decide(state, [geo(500)], SAT_10Z)).toMatchObject({ envio_parado: false });
    expect(decide(state, [geo(500)], SAT_10Z).campanhas[0]).toMatchObject({ dia_elegivel_no_intervalo: false });
    expect(decide(state, [geo(500)], MON_10Z)).toMatchObject({ envio_parado: true, paradas: ["Geo"] });
  });

  it("an unreadable schedule counts every day as eligible: louder, never quieter", () => {
    const fri10 = SAT_10Z - 24 * H;
    const state = { history: [mark(fri10, { "1": 500 })] };
    expect(decide(state, [geo(500, { days: null, tz: null })], SAT_10Z)).toMatchObject({ envio_parado: true });
  });

  it("no active campaign is not an alarm, and neither is a history without per-campaign marks or without a timestamp", () => {
    expect(decide({ history: [mark(THU_10Z - 24 * H, { "1": 200 })] }, []).envio_parado).toBe(false);
    expect(decide({ history: [{ ts: THU_10Z - 24 * H, total: 200 }] }, [geo(200)]).envio_parado).toBe(false);
    expect(decide({ total: 200 }, [geo(200)]).envio_parado).toBe(false);
    expect(decide(null, [geo(0)]).envio_parado).toBe(false);
  });

  it("the workflow runs the tested script and records the measurement even when the alarm fires", () => {
    const wf = readFileSync(join(root, ".github/workflows/smartlead-send-watch.yml"), "utf8");
    expect(wf).toContain("python3 scripts/smartlead/send_watch.py");
    expect(wf).toMatch(/if: always\(\)\s+uses: actions\/cache\/save@v4/);
    expect(wf).not.toMatch(/uses: actions\/cache@v4/);
  });
});
