/**
 * safe-json-ld.ts — single source of truth for HTML-script-safe JSON-LD
 * serialization + stored-URL sanitization (Hermes QA Audit V2, issue #238).
 *
 * Originally lived only in components/landing-public/json-ld.ts (Hermes
 * review, #216) for the public Ozvor Pages sites. Every marketing page that
 * injects JSON-LD via <script type="application/ld+json"> — not just tenant
 * landing pages — needs the same protection, so this is now the canonical
 * home. `components/landing-public/json-ld.ts` re-exports from here to keep
 * existing imports working (see that file for the landing-page-specific
 * JSON-LD builders, which still live there).
 *
 * Pure/DB-free/React-free — unit-testable without a DOM.
 */

// ---------------------------------------------------------------------------
// safeJsonLd — HTML-script-safe serialization (Hermes review, #216).
//
// JSON-LD objects can contain user- or tenant-controlled strings (business
// name, FAQ text, blog copy). Raw JSON.stringify inside
// <script type="application/ld+json"> lets a stored `</script><script>…`
// break out of the tag (XSS). Escaping <, >, & as \uXXXX keeps the payload
// byte-identical after JSON.parse (unicode escapes are plain JSON) while
// making it inert as HTML. U+2028/2029 are escaped for JS-context safety too.
// ---------------------------------------------------------------------------
export function safeJsonLd(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

// ---------------------------------------------------------------------------
// safeHref — allowlist for STORED website URLs rendered into <a href>
// (Hermes follow-up, #216). Only http(s) survives; anything else — including
// `javascript:`, `data:`, protocol-relative `//evil` — returns null and the
// caller renders plain text instead. A bare domain gets https:// prefixed.
// ---------------------------------------------------------------------------
export function safeHref(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (!value) return null;
  const candidate = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value)
    ? value
    : value.startsWith("//")
      ? `https:${value}`
      : `https://${value}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (!url.hostname || !url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}
