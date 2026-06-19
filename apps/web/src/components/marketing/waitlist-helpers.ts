/**
 * Pure helper functions for the waitlist signup flow.
 * Extracted from WaitlistForm.tsx so they can be unit-tested without
 * requiring a JSX/DOM environment.
 *
 * These are the single source of truth — WaitlistForm.tsx imports and
 * re-exports them for colocation convenience.
 */

export interface WaitlistPayload {
  email: string;
  opted_in: boolean;
  name?: string;
  team_size?: string;
}

/**
 * Returns true if the given value is a syntactically valid email address.
 * Trims surrounding whitespace before testing.
 * Enforces a max length of 320 characters (RFC 5321).
 */
export function isValidEmail(value: string): boolean {
  return (
    typeof value === "string" &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) &&
    value.length <= 320
  );
}

/**
 * Builds a WaitlistPayload from raw form field values.
 * Omits optional fields when they are blank after trimming.
 * Trims email and name before including them.
 */
export function buildPayload(
  email: string,
  name: string,
  teamSize: string,
  optedIn: boolean
): WaitlistPayload {
  const payload: WaitlistPayload = {
    email: email.trim(),
    opted_in: optedIn,
  };
  const trimmedName = name.trim();
  if (trimmedName) payload.name = trimmedName;
  if (teamSize) payload.team_size = teamSize;
  return payload;
}
