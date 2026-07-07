/**
 * Asset library manifest — contract tests.
 *
 * The manifest feeds /admin → Assets and GET /api/v1/operator/assets (Hermes).
 * These tests keep it honest: unique ids, every publicPath maps to a REAL file
 * under apps/web/public, and every repoPath exists in the repository — so the
 * library can never list an artifact that 404s or a source that moved.
 */

import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { OZVOR_ASSETS } from "../../packages/shared/src/assets-manifest";

const REPO_ROOT = join(__dirname, "..", "..");

describe("assets manifest", () => {
  it("has unique ids and non-empty descriptions", () => {
    const ids = OZVOR_ASSETS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const a of OZVOR_ASSETS) {
      expect(a.title.length, a.id).toBeGreaterThan(3);
      expect(a.description.length, a.id).toBeGreaterThan(10);
      expect(a.publicPath || a.repoPath, `${a.id} must have a publicPath or repoPath`).toBeTruthy();
    }
  });

  it("every publicPath maps to a real file under apps/web/public", () => {
    for (const a of OZVOR_ASSETS) {
      if (!a.publicPath) continue;
      const onDisk = join(REPO_ROOT, "apps", "web", "public", a.publicPath);
      expect(existsSync(onDisk), `${a.id}: ${a.publicPath} missing on disk`).toBe(true);
    }
  });

  it("every repoPath exists in the repository", () => {
    for (const a of OZVOR_ASSETS) {
      if (!a.repoPath) continue;
      const onDisk = join(REPO_ROOT, a.repoPath);
      expect(existsSync(onDisk), `${a.id}: ${a.repoPath} missing in repo`).toBe(true);
    }
  });

  it("covers all three categories", () => {
    const cats = new Set(OZVOR_ASSETS.map((a) => a.category));
    expect(cats).toEqual(new Set(["client-deliverable", "brand", "content-gtm"]));
  });
});
