/**
 * Auth module barrel export
 * Central export for all auth middleware used by route handlers.
 */

export {
  requireAuth,
  requireRole,
  requireSuperAdmin,
  C4_ROUTE_AUTH_MANIFEST,
} from "./middleware";

export type { AuthContext, AppRole } from "./middleware";

export {
  createOAuthState,
  consumeOAuthState,
  OAuthStateError,
} from "./oauth-state";

export type { OAuthStatePayload } from "./oauth-state";
