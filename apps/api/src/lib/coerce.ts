/**
 * Safe coercion of UNTRUSTED request-body values.
 *
 * TypeScript body types are a promise, not a guarantee: a field typed `string`
 * can arrive at runtime as `null` (clients send null for cleared fields), a
 * number, an array, or an object. Calling `.trim()` / `.slice()` / `new URL()`
 * on those throws an uncaught error and surfaces to the user as a generic
 * 500 "couldn't save". Read every body string field through `asStr()` so that
 * only real strings are trimmed and everything else becomes "".
 */

/** Coerce any untrusted value to a trimmed string ("" for null/undefined/wrong-type). */
export function asStr(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Like asStr but returns null (not "") for empty — handy for nullable DB columns. */
export function asStrOrNull(v: unknown): string | null {
  const s = asStr(v);
  return s !== "" ? s : null;
}
