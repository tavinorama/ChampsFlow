/**
 * Pure helper functions for the public Ozvor Pages lead-capture form
 * (issue #208, PR-6). Extracted from LeadForm.tsx so they can be
 * unit-tested without a JSX/DOM environment — same convention as
 * apps/web/src/components/marketing/waitlist-helpers.ts.
 */

export interface LandingLeadPayload {
  name?: string;
  email: string;
  phone?: string;
  message?: string;
  consent: boolean;
}

/**
 * Returns true if the given value is a syntactically valid email address.
 * Trims surrounding whitespace before testing. Enforces the RFC 5321 max
 * length of 320 characters (mirrors the API's validateLeadBody).
 */
export function isValidLeadEmail(value: string): boolean {
  return (
    typeof value === "string" &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) &&
    value.trim().length <= 320
  );
}

/**
 * Builds a LandingLeadPayload from raw form field values. Omits optional
 * fields when they are blank after trimming. `consent` is passed through
 * as-is (the checkbox's boolean checked state) — the API rejects anything
 * other than the literal `true`.
 */
export function buildLeadPayload(
  name: string,
  email: string,
  phone: string,
  message: string,
  consent: boolean
): LandingLeadPayload {
  const payload: LandingLeadPayload = {
    email: email.trim(),
    consent,
  };
  const trimmedName = name.trim();
  if (trimmedName) payload.name = trimmedName;
  const trimmedPhone = phone.trim();
  if (trimmedPhone) payload.phone = trimmedPhone;
  const trimmedMessage = message.trim();
  if (trimmedMessage) payload.message = trimmedMessage;
  return payload;
}
