/**
 * #155/P23 — the generator purges too.
 *
 * Generation rewrites landing_pages directly in the WORKER; before this
 * wiring, "Generate" returned success and the public page kept serving the
 * old content for up to `revalidate` seconds — or, per the 2026-08-04
 * incident the bridge was built for, until the next deploy. These assertions
 * pin the move to packages/shared (so the worker can import without reaching
 * into apps/api) and the worker call site itself.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "../..");

describe("purge on generation (#155/P23)", () => {
  it("the bridge lives in packages/shared and the api shim re-exports it", () => {
    const shared = readFileSync(join(root, "packages/shared/src/landing-revalidate.ts"), "utf8");
    expect(shared).toContain("export function revalidateSite");
    const shim = readFileSync(join(root, "apps/api/src/lib/landing-revalidate.ts"), "utf8");
    expect(shim).toMatch(
      /export \{[\s\S]*revalidateSite[\s\S]*\} from "\.\.\/\.\.\/\.\.\/\.\.\/packages\/shared\/src\/landing-revalidate"/
    );
  });

  it("the worker's generate job purges the site's public paths after writing", () => {
    const job = readFileSync(join(root, "apps/worker/src/jobs/landing-generate.ts"), "utf8");
    expect(job).toMatch(/revalidateSite\(\s*site\.slug/);
    // Guarded by pagesWritten — a run that wrote nothing purges nothing.
    expect(job).toMatch(/if \(pagesWritten > 0\) \{[\s\S]{0,400}revalidateSite/);
  });

  it("the bridge stays fail-open — a purge failure can never fail a paid generation", () => {
    const shared = readFileSync(join(root, "packages/shared/src/landing-revalidate.ts"), "utf8");
    expect(shared).toContain("landing_revalidate_not_configured");
    expect(shared).toContain("landing_revalidate_error");
  });
});
