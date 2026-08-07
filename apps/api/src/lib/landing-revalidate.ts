/**
 * Re-export shim. The revalidate bridge moved to packages/shared so the
 * WORKER can purge too (#155/P23): generation rewrites landing_pages directly,
 * and until this move the freshly generated content sat behind a stale cache
 * for up to `revalidate` seconds — or, per the 2026-08-04 incident this bridge
 * exists for, until the next deploy. API routes keep importing from here.
 */
export {
  revalidateConfigured,
  sitePaths,
  revalidateLandingPaths,
  revalidateSite,
} from "../../../../packages/shared/src/landing-revalidate";
