/**
 * Worker import graph — the structural tripwire for the #438 disease.
 *
 * Twice now a type import from a route file has broken every worker deploy:
 *  - 2026-08-05: credits.ts imported from routes/social-accounts (#438);
 *  - 2026-08-12: agent-substrate.ts had the same import — harmless for a
 *    week, then the graph runner pulled the lib into the worker's compile
 *    graph and the route's hono import killed the Docker build (the CI
 *    typechecker passes because the repo root has hono installed; the
 *    worker container does not).
 *
 * Per-file pins didn't scale — each new lib needed its own. This test walks
 * the REAL import graph from apps/worker/src and fails if ANY reachable
 * file lives under apps/api/src/routes or apps/api/src/auth, or imports
 * 'hono'. New worker←api edges get caught the day they are written.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";

const ROOT = resolve(__dirname, "../..");
const WORKER_SRC = join(ROOT, "apps/worker/src");

function tsFilesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...tsFilesUnder(p));
    else if (p.endsWith(".ts")) out.push(p);
  }
  return out;
}

/** Resolve a relative import specifier to a file on disk (.ts or /index.ts). */
function resolveImport(fromFile: string, spec: string): string | null {
  if (!spec.startsWith(".")) return null; // package import — not ours to walk
  const base = resolve(dirname(fromFile), spec);
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts")]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

function importSpecifiers(file: string): string[] {
  const src = readFileSync(file, "utf8");
  const out: string[] = [];
  const re = /(?:from|import)\s+["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) out.push(m[1]!);
  return out;
}

function walkImportGraph(entries: string[]): { visited: Set<string>; packages: Set<string> } {
  const visited = new Set<string>();
  const packages = new Set<string>();
  const stack = [...entries];
  while (stack.length > 0) {
    const file = stack.pop()!;
    if (visited.has(file)) continue;
    visited.add(file);
    for (const spec of importSpecifiers(file)) {
      const resolved = resolveImport(file, spec);
      if (resolved) stack.push(resolved);
      else if (!spec.startsWith(".")) packages.add(spec.split("/")[0] === "@" ? spec : spec.split("/")[0]!);
    }
  }
  return { visited, packages };
}

describe("the worker's compile graph stays deployable", () => {
  const { visited, packages } = walkImportGraph(tsFilesUnder(WORKER_SRC));
  const rel = (p: string) => p.slice(ROOT.length + 1);

  it("sanity: the walker actually reaches the api libs the worker uses", () => {
    // A vacuously green tripwire is worse than none: prove the walk crosses
    // into apps/api (tenant-context has been a legit edge since the RLS work).
    const reached = [...visited].map(rel);
    expect(reached.some((p) => p.startsWith("apps/api/src/"))).toBe(true);
  });

  it("no route or auth file is reachable from the worker", () => {
    const offenders = [...visited]
      .map(rel)
      .filter((p) => p.startsWith("apps/api/src/routes/") || p.startsWith("apps/api/src/auth/"));
    expect(offenders, `worker reaches route/auth files:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("no reachable file imports hono — the worker container does not install it", () => {
    expect([...packages]).not.toContain("hono");
    expect([...packages]).not.toContain("jose");
  });
});
