/**
 * monitors-without-telegram.test.ts — T0.3: a mute watchdog still watches.
 *
 * From 11/09 to 16/09 the four monitor workflows (post-deploy smoke, agent-org
 * liveness, main-after-merge, link crawl) went red on their first step every
 * run — "TELEGRAM_BOT_TOKEN missing — o vigia estaria mudo; exit 1" — and the
 * probe that followed never executed. The alarm channel being unwired made the
 * watchdog blind as well as mute, and the daily red runs told nobody which of
 * the two it was.
 *
 * What these tests hold, by reading the workflow files:
 *   1. the alarm-channel step never exits non-zero — it warns, writes the job
 *      summary, and exports `wired`;
 *   2. the probe/reconcile step is not conditioned on the alarm channel;
 *   3. the step that sends Telegram on a real failure still exists, and each
 *      workflow still has a way to go red on a REAL failure (exit 1 survives
 *      only outside the alarm-channel step).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "../..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

const WORKFLOWS = [
  ".github/workflows/post-deploy-smoke.yml",
  ".github/workflows/agent-org-liveness.yml",
  ".github/workflows/main-after-merge.yml",
  ".github/workflows/link-crawl.yml",
  // 17/09: the same gate lived in two more watchers — the SmartLead send watch
  // went red twice a day without ever measuring whether sending had stopped.
  ".github/workflows/cron-absence-watch.yml",
  ".github/workflows/smartlead-send-watch.yml",
];

/** The text of the alarm-channel step only (from its name to the next `- name:` / `- uses:`). */
function alarmStep(src: string): string {
  const start = src.indexOf("- name: Check the alarm channel (TELEGRAM secrets)");
  expect(start).toBeGreaterThan(-1);
  const rest = src.slice(start + 10);
  const next = rest.search(/\n\s+- (name|uses):/);
  return rest.slice(0, next === -1 ? undefined : next);
}

describe("T0.3 — the alarm-channel check warns and never skips the probe", () => {
  for (const file of WORKFLOWS) {
    describe(file, () => {
      const src = read(file);
      const step = alarmStep(src);

      it("the old assert is gone: no 'exit 1' and no 'estaria mudo' in the alarm-channel step", () => {
        expect(step).not.toContain("exit 1");
        expect(step).not.toContain("estaria mudo");
        expect(src).not.toContain("Assert the alarm channel is wired");
      });

      it("it warns per missing secret, writes the job summary, and exports `wired`", () => {
        expect(step).toContain("::warning::TELEGRAM_BOT_TOKEN missing");
        expect(step).toContain("::warning::TELEGRAM_CHAT_ID missing");
        expect(step).toContain("ALARM CHANNEL NOT WIRED");
        expect(step).toContain('>> "$GITHUB_STEP_SUMMARY"');
        expect(step).toContain('echo "wired=$wired" >> "$GITHUB_OUTPUT"');
        expect(step).toContain("id: alarm");
      });

      it("the probe is not gated on the alarm channel", () => {
        expect(src).not.toMatch(/if:\s*steps\.alarm\.outputs\.wired/);
      });

      it("Telegram is still sent on a real failure when the channel exists", () => {
        expect(src).toContain("secrets.TELEGRAM_BOT_TOKEN");
        expect(src).toContain("api.telegram.org");
      });
    });
  }

  it("a real probe failure still turns the run red (exit 1 survives outside the alarm step)", () => {
    for (const file of ["post-deploy-smoke", "agent-org-liveness", "main-after-merge", "cron-absence-watch", "smartlead-send-watch"]) {
      const src = read(`.github/workflows/${file}.yml`);
      const outsideAlarm = src.replace(alarmStep(src), "");
      expect(outsideAlarm).toContain("exit 1");
    }
  });

  it("the SmartLead watch still needs its probe key, and says so when the channel is missing", () => {
    const src = read(".github/workflows/smartlead-send-watch.yml");
    expect(src).toContain('test -n "${SL}" || { echo "::error::secret SMARTLEAD_API_KEY ausente"; exit 1; }');
    expect(src).not.toContain("o vigia falha VERMELHO de propósito");
    expect(src).toContain("sem_canal (TELEGRAM_* ausentes nos secrets do Actions)");
    // a stopped send is still red with or without the channel
    expect(src).toContain("raise SystemExit(1)");
  });
});
