// =============================================================================
// @organic-posts/shared — TypeScript types used across all packages
// =============================================================================

// ---------------------------------------------------------------------------
// Database entity types
// ---------------------------------------------------------------------------

export type TenantPlan = 'solo' | 'agency';
export type UserRole = 'owner' | 'editor' | 'viewer';
export type Platform = 'linkedin' | 'instagram' | 'facebook';
export type DraftStatus = 'draft' | 'approved' | 'scheduled' | 'published' | 'failed' | 'discarded';
export type PublishJobStatus = 'pending' | 'queued' | 'processing' | 'done' | 'failed' | 'cancelled';
export type DsrRequestType = 'access' | 'erasure' | 'portability' | 'correction' | 'restriction';
export type DsrStatus = 'received' | 'in_progress' | 'fulfilled' | 'rejected';
export type DpaVariant = 'EU' | 'US';

// ---------------------------------------------------------------------------
// Audit log event types
// ---------------------------------------------------------------------------
export type AuditEventType =
  | 'dpa_ack'
  | 'ccpa_optout'
  | 'post_approved'
  | 'token_revoked'
  | 'social_account_connected'
  | 'social_account_disconnected'
  | 'dsr_received'
  | 'dsr_fulfilled'
  | 'login_failed'
  | 'account_locked'
  | 'draft_reported'
  | 'draft_scheduled'
  | 'schedule_cancelled'
  | 'post_published'
  | 'post_publish_failed'
  | 'admin_action';

// ---------------------------------------------------------------------------
// API response envelope
// ---------------------------------------------------------------------------
export interface ApiSuccess<T> {
  ok: true;
  data: T;
}

export interface ApiError {
  ok: false;
  error: {
    code: string;
    message: string;
    retryable?: boolean;
    retryAfterSeconds?: number;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

// ---------------------------------------------------------------------------
// OAuth / Social account types
// ---------------------------------------------------------------------------
export interface SocialAccountPublic {
  id: string;
  platform: Platform;
  platformUserId: string;
  scope: string | null;
  expiresAt: string | null; // ISO 8601
  connectedAt: string;      // ISO 8601
  revokedAt: string | null; // ISO 8601, null = active
}

// API response shape for GET /api/social-accounts
export interface ListSocialAccountsResponse {
  accounts: SocialAccountPublic[];
}

// API response shape for POST /api/social-accounts/connect/:platform
export interface OAuthInitiateResponse {
  authorizationUrl: string;
  state: string; // PKCE state stored server-side; echoed back so client can verify
}

// ---------------------------------------------------------------------------
// OAuth PKCE state (stored in Redis, keyed by state param)
// ---------------------------------------------------------------------------
export interface OAuthPkceState {
  codeVerifier: string;
  platform: Platform;
  tenantId: string;
  userId: string;
  redirectUri: string;
  createdAt: number; // Unix timestamp ms
}

// ---------------------------------------------------------------------------
// JWT custom claims (Supabase Auth JWT metadata)
// ---------------------------------------------------------------------------
export interface SupabaseJwtClaims {
  sub: string;             // Supabase auth UID
  email: string;
  tenant_id: string;       // Custom claim set at account creation
  role: UserRole;          // Application RBAC role from users.role
  app_metadata?: {
    role?: UserRole;
    tenant_id?: string;
  };
}

// ---------------------------------------------------------------------------
// Publish job types (used by worker and schedule routes)
// ---------------------------------------------------------------------------

export type PublishErrorCode =
  | 'rate_limit'
  | 'token_expired'
  | 'platform_error'
  | 'content_rejected';

/**
 * Structured error thrown by platform publish methods.
 * Worker uses `retryable` to decide between retry and permanent failure.
 * `code` is logged (safe) but token value is NEVER included.
 */
export class PublishError extends Error {
  constructor(
    public readonly retryable: boolean,
    public readonly code: PublishErrorCode,
    public readonly platform: Platform,
    message: string,
  ) {
    super(message);
    this.name = 'PublishError';
  }
}

/** Minimal social account row the worker needs for publish operations */
export interface SocialAccountForPublish {
  id: string;
  tenant_id: string;
  platform: Platform;
  platform_user_id: string;
  access_token_enc: Buffer;
  token_expires_at: Date | null;
}

/** Minimal draft row the worker needs to construct the publish payload */
export interface DraftForPublish {
  id: string;
  tenant_id: string;
  user_id: string;
  platform: Platform;
  body: string;
  hashtags: string[] | null;
  ai_generated: boolean;
}

export interface PublishResult {
  post_id: string; // Platform-returned post/object ID
}

// ---------------------------------------------------------------------------
// Rate limit headers
// ---------------------------------------------------------------------------
export interface RateLimitHeaders {
  'X-RateLimit-Limit': string;
  'X-RateLimit-Remaining': string;
  'X-RateLimit-Reset': string;  // Unix timestamp seconds
  'Retry-After'?: string;       // Seconds until reset (only on 429)
}
