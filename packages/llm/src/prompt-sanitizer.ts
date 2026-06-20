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
