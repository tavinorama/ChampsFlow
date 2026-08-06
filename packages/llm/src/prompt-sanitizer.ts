/**
 * prompt-sanitizer.ts — shared prompt-injection sanitization (S-5/CC-3 + GEO-SEC-2)
 *
 * GEO-SEC-2 (Gate 3→4 security condition, 2026-06-10): sanitization must sit at
 * the GATEWAY layer — before dispatch to ANY provider — so adding a new provider
 * cannot bypass it. This module is that single shared implementation:
 *  - the GEO probe gateway (providers/gateway.ts) sanitizes every queryText
 *    before fan-out to Anthropic/OpenAI/Gemini/Perplexity/SERP;
 *  - the legacy AnthropicAdapter (anthropic.ts) re-exports and uses it for the
 *    content-generation path.
 *
 * Steps: strip control chars → cap at 4000 chars → reject obvious injection
 * patterns. Deliberately conservative — avoid false positives on legitimate
 * SMB topics. Never logs prompt text (may contain PII or attack payload).
 */

import { logger } from "../../shared/src/logger";

/** Max input length for user_prompt after sanitization (S-5/CC-3) */
export const MAX_USER_PROMPT_CHARS = 4000;

/**
 * Injection pattern sequences to reject (S-5/CC-3).
 * Matches obvious prompt-injection phrases; case-insensitive.
 */
export const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+instructions?/i,
  /system\s+prompt\s*:/i,
  /\[system\]/i,
  /\[instructions?\]/i,
  /disregard\s+(all\s+)?(previous|prior|above)\s+instructions?/i,
  /forget\s+(all\s+)?(previous|prior|above)\s+instructions?/i,
  /you\s+are\s+now\s+(a\s+)?(?:an?\s+)?(?:different|new)\s+(ai|assistant|bot|llm)/i,
  /jailbreak/i,
  /dan\s+mode/i,
  /developer\s+mode\s+enabled/i,
  /prompt\s+injection/i,
  // SEC-G7-2 (S5-a HIGH) — "reveal your system prompt" and variants
  /reveal\s+(your\s+)?system\s+prompt/i,
  // SEC-G7-3 (S5-b MEDIUM) — "disregard above/previous/prior" short-form anchored to start of input
  /^\s*disregard\s+(all\s+)?(previous|prior|above)(?:\s+instructions?)?\b/i,
];

export interface SanitizationResult {
  sanitized: string;
  rejected: boolean;
  rejectionReason?: string;
}

/**
 * Sanitize a user-influenced prompt before sending to ANY LLM provider.
 *
 * Steps:
 *  1. Strip null bytes and control characters (except \n, \r, \t)
 *  2. Truncate to MAX_USER_PROMPT_CHARS
 *  3. Check for injection patterns — reject if found
 */
export function sanitizeUserPrompt(raw: string): SanitizationResult {
  // Step 1: strip control characters (keep \n \r \t for formatting)
  // eslint-disable-next-line no-control-regex
  const stripped = raw.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");

  // Step 2: length cap
  const truncated =
    stripped.length > MAX_USER_PROMPT_CHARS
      ? stripped.slice(0, MAX_USER_PROMPT_CHARS)
      : stripped;

  // Step 3: injection pattern check (on the truncated text)
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(truncated)) {
      logger.warn("prompt_injection_rejected", {
        patternSource: pattern.source,
        // Do NOT log the actual prompt text — may contain PII or attack payload
        promptLength: raw.length,
        truncatedLength: truncated.length,
      });
      return {
        sanitized: "",
        rejected: true,
        rejectionReason: `Input contains disallowed pattern: ${pattern.source}`,
      };
    }
  }

  return { sanitized: truncated, rejected: false };
}

// ---------------------------------------------------------------------------
// PII scrub (#159B, from the Signal-Engine spec's golden rule #3)
// ---------------------------------------------------------------------------

/**
 * Deterministic PII scrub for probe queries, applied at the same gateway
 * chokepoint as the injection sanitizer (GEO-SEC-2's argument holds verbatim:
 * a new provider must not be reachable with an unscrubbed prompt).
 *
 * WHAT THIS IS AND IS NOT. Probe queries are synthetic buyer-intent questions
 * about the client's own brand — an email address, phone number, or @handle
 * inside one is never intended and only arrives via a custom prompt or a
 * pasted brand field. Scrubbing them before fan-out to five external engines
 * costs nothing and removes the one path where a customer's stray personal
 * data would leave our boundary. This is NOT a general anonymizer: the Pages
 * builder keeps business contact details on purpose (they ARE the product),
 * and the sales chat keeps addresses the user typed to be answered about —
 * both documented in docs/compliance/data-provenance-policy.md.
 *
 * Deterministic regex only — no model in the loop, so the behaviour is
 * testable and the failure mode is a visible placeholder, never a silent leak.
 * Phone matching requires ≥9 digits so prices ("under $10,000"), years and
 * plan limits never trip it. `found` carries KINDS only, never values —
 * the same never-log-the-text rule the injection sanitizer follows.
 */
export interface PiiScrubResult {
  scrubbed: string;
  /** Kinds found (deduped): 'email' | 'phone' | 'handle'. Never the values. */
  found: string[];
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// Candidate phone runs: digits with common separators; verified by digit
// count. Optional leading "+" or "(" so "(415) 555-0182" is swallowed whole
// instead of leaving a stray parenthesis behind the placeholder.
const PHONE_CANDIDATE_RE = /[+(]?\d[\d\s().\-–]{6,}\d/g;
const MIN_PHONE_DIGITS = 9;
// @handle: only after start/whitespace so emails (scrubbed first) never re-match.
const HANDLE_RE = /(^|\s)@[A-Za-z0-9_]{2,30}\b/g;

export function scrubPii(text: string): PiiScrubResult {
  const kinds = new Set<string>();

  let out = text.replace(EMAIL_RE, () => {
    kinds.add("email");
    return "[redacted-email]";
  });

  out = out.replace(PHONE_CANDIDATE_RE, (m) => {
    const digits = m.replace(/\D/g, "");
    if (digits.length < MIN_PHONE_DIGITS || digits.length > 15) return m;
    kinds.add("phone");
    return "[redacted-phone]";
  });

  out = out.replace(HANDLE_RE, (_m, pre: string) => {
    kinds.add("handle");
    return `${pre}[redacted-handle]`;
  });

  return { scrubbed: out, found: [...kinds] };
}
