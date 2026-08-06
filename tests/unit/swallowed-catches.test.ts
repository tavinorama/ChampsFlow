/**
 * Swallowed catches (#139) — "nada degrada calado", enforced.
 *
 * The 2026-08-05/06 incident string had ONE shape: a failure that reported
 * nothing (video job, plan_task, api_spend). A `.catch(() => {})` in a
 * money-or-protection path is that shape waiting to happen — the free-test
 * spend meter in products.ts sat behind one until this triage, meaning a DB
 * hiccup would have under-counted budget spend with zero trace.
 *
 * Policy this test enforces (backend only — apps/api, apps/worker, packages):
 * a swallowed catch is allowed ONLY on the explicit allowlist below, where
 * silence is the deliberate, reviewed choice (stream cleanup after the
 * response is decided; pool teardown during shutdown; a JSON body parse whose
 * failure path is already an empty object by design). Everything else must
 * log. Adding a new silent catch requires adding it HERE, in the same PR,
 * with a reason a reviewer can reject.
 *
 * The frontend is exempt by design, not by oversight: a web `.catch(() => {})`
 * degrades a screen, not a stored number or a protection — the page shows its
 * fallback state and the API remains the source of truth.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = join(__dirname, "../..");
const SCAN_ROOTS = ["apps/api/src", "apps/worker/src", "packages"];

/** file → reason silence is the right call there. */
const ALLOWLIST: Record<string, string> = {
  "apps/api/src/lib/google-places.ts":
    "res.body.cancel() stream cleanup — the request outcome is already decided",
  "packages/llm/src/ssrf-guard.ts":
    "res.body.cancel() stream cleanup — same as above",
  "apps/worker/src/index.ts":
    "sql.end() during shutdown — the process is dying; there is nobody to tell",
  "packages/shared/src/emails/resend-send.ts":
    "res.json() fallback to {} after res.ok — the id is optional by contract",
};

const SWALLOW_RE = /\.catch\(\(\) => \{\}\)|\.catch\(\(\) => \(\{\}\)\)|catch\s*\{\s*\}|catch\s*\(\w+\)\s*\{\s*\}/;

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (entry === "node_modules" || entry === "dist" || entry === ".next") continue;
      yield* walk(p);
    } else if (/\.tsx?$/.test(entry) && !/\.d\.ts$/.test(entry) && !/ \d+\.tsx?$/.test(entry)) {
      // " 2.ts" files are untracked cloud-sync junk — not code we own.
      yield p;
    }
  }
}

describe("no backend failure degrades silently (#139)", () => {
  it("every swallowed catch is on the reviewed allowlist", () => {
    const offenders: string[] = [];
    for (const scanRoot of SCAN_ROOTS) {
      for (const file of walk(join(root, scanRoot))) {
        const rel = relative(root, file);
        if (rel.includes("/test") || rel.includes("__tests__")) continue;
        const src = readFileSync(file, "utf8");
        if (!SWALLOW_RE.test(src)) continue;
        if (!(rel in ALLOWLIST)) offenders.push(rel);
      }
    }
    expect(
      offenders,
      `Swallowed catch outside the allowlist. Either log the failure ` +
        `(logger.warn/error — see products.ts api_spend_insert_failed for the shape) ` +
        `or add the file to ALLOWLIST in this test WITH a reason a reviewer can judge:\n` +
        offenders.join("\n")
    ).toEqual([]);
  });

  it("the allowlist itself stays honest — every entry still has a swallow to excuse", () => {
    // An allowlist row whose file no longer swallows anything is a stale
    // permission slip: it would let a future silent catch into that file
    // unreviewed. Prune rows when the code they excuse is gone.
    for (const rel of Object.keys(ALLOWLIST)) {
      const src = readFileSync(join(root, rel), "utf8");
      expect(SWALLOW_RE.test(src), `${rel} is allowlisted but has no swallowed catch — remove the entry`).toBe(true);
    }
  });

  it("the fixed meters actually log now", () => {
    expect(readFileSync(join(root, "apps/api/src/routes/products.ts"), "utf8")).toContain(
      "api_spend_insert_failed"
    );
    expect(readFileSync(join(root, "apps/api/src/routes/drafts.ts"), "utf8")).toContain(
      "audit_log_write_failed"
    );
    expect(readFileSync(join(root, "apps/api/src/routes/api-keys.ts"), "utf8")).toContain(
      "api_key_last_used_update_failed"
    );
  });
});
