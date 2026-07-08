/**
 * downloads.ts — GET /api/download (gated asset delivery).
 *
 * Serves the premium/paid assets (GEO Visibility Guide, High-Citation
 * Templates, LLM Citation Tracker + methodology, the Kit PDF) ONLY when a valid
 * signed token is presented. These files were moved out of apps/web/public so
 * they are no longer freely downloadable — the link in the bonus/Kit email (and
 * on the paid /kit page) carries a signed, expiring token; a bare URL opens
 * nothing.
 *
 * Public route (no auth) by design — the token IS the authorization. The
 * whitepaper and brand-kit stay in apps/web/public (intentionally free).
 */

import { Hono } from "hono";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { verifyDownload } from "../../../../packages/shared/src/download-token";
import { logger } from "../../../../packages/shared/src/logger";

// Files live at <cwd>/assets/downloads — apps/api/assets/downloads in dev,
// /app/assets/downloads in the Docker image (COPYed in the runner stage).
const ASSETS_DIR = join(process.cwd(), "assets", "downloads");

const MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

export function registerDownloadRoutes(app: Hono): void {
  app.get("/api/download", async (c) => {
    const asset = c.req.query("asset") ?? "";
    const exp = Number(c.req.query("exp") ?? "0");
    const sig = c.req.query("sig") ?? "";

    const v = verifyDownload(asset, exp, sig);
    if (!v.ok) {
      logger.warn("download_denied", { asset, reason: v.reason });
      return c.json(
        { error: "forbidden", code: "DOWNLOAD_TOKEN_INVALID", reason: v.reason },
        403
      );
    }

    try {
      const buf = await readFile(join(ASSETS_DIR, v.filename));
      const ext = v.filename.slice(v.filename.lastIndexOf("."));
      c.header("Content-Type", MIME[ext] ?? "application/octet-stream");
      c.header("Content-Disposition", `attachment; filename="${v.filename}"`);
      c.header("Cache-Control", "private, no-store");
      return c.body(buf);
    } catch (err) {
      // Benign failure: if the asset file is missing from the image, 404 the
      // download — the rest of the site/paid delivery is unaffected.
      logger.error("download_file_missing", {
        asset,
        message: (err as Error).message,
      });
      return c.json({ error: "not_found", code: "DOWNLOAD_FILE_MISSING" }, 404);
    }
  });
}
