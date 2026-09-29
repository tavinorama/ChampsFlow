/**
 * ops-tables-privileged-only.test.ts — D9 (Codex N14, 28/09).
 *
 * The migration removes app_user's grants on the six ops tables. That is
 * only safe while NO code path touches ops.* from inside a tenant scope
 * (a tenant scope is what drops a query into app_user). This test reads the
 * source and fails the day someone adds one, before production does.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "../..");
const OPS_SQL = /\b(FROM|INTO|UPDATE|JOIN)\s+ops\.(agent_run|agent_step|agent_outcome|memory_lesson|prompt_override|proof_run)\b/;

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) sources(p, out);
    else if (/\.ts$/.test(name) && !/ \d+\.ts$/.test(name) && !/\.test\.ts$/.test(name)) out.push(p);
  }
  return out;
}

const files = [...sources(join(root, "apps/api/src")), ...sources(join(root, "apps/worker/src"))]
  .map((p) => ({ p: p.slice(root.length + 1), src: readFileSync(p, "utf8") }))
  .filter((f) => OPS_SQL.test(f.src));

describe("ops.* is touched only by privileged paths", () => {
  it("the inventory of files that query ops.* is the one this migration was reviewed against", () => {
    expect(files.map((f) => f.p).sort()).toEqual([
      "apps/api/src/lib/agent-ops.ts",
      "apps/api/src/lib/agent-substrate.ts",
      "apps/api/src/lib/delivery-health-read.ts",
      "apps/api/src/routes/liveness.ts",
      "apps/api/src/routes/operator-graphs.ts",
      "apps/api/src/routes/telegram.ts",
      "apps/worker/src/jobs/followup-scan.ts",
      "apps/worker/src/jobs/graph-tick.ts",
      "apps/worker/src/jobs/proof-feed.ts",
    ]);
  });

  it("none of them enters a tenant scope", () => {
    for (const f of files) {
      const code = f.src.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
      expect(code, f.p).not.toMatch(/\brunWithTenant\s*\(/);
      expect(code, f.p).not.toMatch(/\.setTenantId\s*\(/);
      expect(code, f.p).not.toMatch(/\bwithRlsContext\s*\(/);
    }
  });

  it("the routes that reach them are operator-key, super-admin or unauthenticated webhooks, never a plain tenant session", () => {
    const admin = readFileSync(join(root, "apps/api/src/routes/admin.ts"), "utf8");
    for (const call of ["agentOpsSummary(db", "readDeliveryHealth(db"]) {
      let ix = admin.indexOf(call);
      expect(ix, call).toBeGreaterThan(0);
      while (ix > 0) {
        const route = admin.lastIndexOf("app.get(", ix);
        expect(admin.slice(route, ix), call).toContain("requireSuperAdmin");
        ix = admin.indexOf(call, ix + 1);
      }
    }
    const mw = readFileSync(join(root, "apps/api/src/auth/middleware.ts"), "utf8");
    // Super-admins run unscoped: the privileged role, not app_user.
    expect(mw).toMatch(/if \(isSuperAdmin\) \{\s*await next\(\);\s*return;\s*\}\s*await runWithTenant\(tenantId/);
  });
});
