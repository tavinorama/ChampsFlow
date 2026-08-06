/**
 * Testid contract (#140) — every getByTestId() in the E2E suite must point at
 * a data-testid that actually exists in apps/web/src.
 *
 * For months the E2E suite asserted on ids (ai-badge, platform-tile-*,
 * connect-*, schedule-modal) that existed NOWHERE in the UI. The tests
 * "survived" through .or() fallbacks and if(isVisible) guards — which means
 * they silently skipped the very steps they were named after. An orphan
 * testid is worse than no test: it reads as coverage in the suite listing
 * while covering nothing.
 *
 * This runs in the UNIT suite on purpose: it needs no browser, so the
 * contract is enforced on every PR even when the E2E workflow is skipped by
 * path filters.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "../..");

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (entry === "node_modules" || entry === ".next" || entry === "dist") continue;
      yield* walk(p);
    } else if (/\.tsx?$/.test(entry) && !/ \d+\.tsx?$/.test(entry)) {
      yield p;
    }
  }
}

function collectTestIds(): Set<string> {
  const ids = new Set<string>();
  for (const f of walk(join(root, "tests/e2e"))) {
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(/getByTestId\("([^"]+)"\)/g)) ids.add(m[1]!);
  }
  return ids;
}

function webSource(): string {
  let all = "";
  for (const f of walk(join(root, "apps/web/src"))) all += readFileSync(f, "utf8");
  return all;
}

describe("E2E testids are backed by the real UI (#140)", () => {
  it("every getByTestId in tests/e2e resolves to a data-testid in apps/web/src", () => {
    const web = webSource();
    const orphans: string[] = [];
    for (const id of collectTestIds()) {
      // Literal form (data-testid="x") or template form where the id is
      // produced as `prefix-${var}` — match the static prefix up to the last
      // hyphen against a template-literal testid in the source.
      const literal = web.includes(`data-testid="${id}"`);
      const prefix = id.slice(0, id.lastIndexOf("-") + 1);
      const templated =
        prefix.length > 1 && web.includes(`data-testid={\`${prefix}\${`);
      if (!literal && !templated) orphans.push(id);
    }
    expect(
      orphans,
      `Orphan testid(s): the E2E suite asserts on these but no component renders them.\n` +
        `Add the data-testid to the component (never loosen the test):\n` +
        orphans.join("\n")
    ).toEqual([]);
  });
});
