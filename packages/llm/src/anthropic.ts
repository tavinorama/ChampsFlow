/**
 * AnthropicAdapter — LLM Gateway provider adapter for Anthropic Claude Sonnet
 *
 * Architecture refs:
 *  - §12 AI/ML Components — LLM Gateway, FD-3 (v1 default provider)
 *  - §8 Data Residency — EU tenants → Bedrock eu-central-1; US tenants → direct Anthropic API
 *  - S-5/CC-3 — Prompt injection input sanitization (length cap, pattern rejection)
 *  - TB-3 — LLM gateway trust boundary; ZDR assertion
 *
 * Routing:
 *  - EU tenants (TENANT_REGION=eu): AWS Bedrock eu-central-1 via @aws-sdk/client-bedrock-runtime
 *  - US tenants (TENANT_REGION=us or default): direct Anthropic API via @anthropic-ai/sdk
 *
 * ZDR: hardcoded zdr_confirmed: true — justified because:
 *  - Bedrock eu-central-1 path: data stays in EU; no Anthropic training on Bedrock inference inputs by default
 *  - Direct Anthropic API: ZDR is on by default (no opt-in header required per FD-3)
 *
 * Security (S-5/CC-3): prompt injection sanitization applied pre-send:
 *  - Strip control characters from user_prompt
 *  - Enforce 4000-char max on user_prompt
 *  - Reject obvious injection pattern sequences
 *  - Log rejection with audit event; no false positives on legitimate SMB marketing topics
 *
 * Error codes mapped to LLMError:
 *  - 429 / ThrottlingException → code: 'rate_limit', retryable: true
 *  - context window exceeded → code: 'context_length', retryable: false
 *  - content policy → code: 'safety', retryable: false
 *  - everything else → code: 'unavailable', retryable: true
 */

import Anthropic from "@anthropic-ai/sdk";
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
  InvokeModelWithResponseStreamCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { createHash } from "crypto";
import type {
  LLMError,
  LLMProvider,
  LLMProviderAdapter,
  LLMRequest,
  LLMResponse,
} from "./index";
import { LLMGatewayError } from "./index";
import { logger } from "../../shared/src/logger";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Model IDs for Anthropic Claude Sonnet (architecture §12) */
const ANTHROPIC_MODEL_ID = "claude-sonnet-4-5-20251022";
const BEDROCK_MODEL_ID = "anthropic.claude-sonnet-4-5-20251022-v2:0";

// ---------------------------------------------------------------------------
// Sanitization (S-5/CC-3) — moved to the shared prompt-sanitizer module so the
// GEO gateway applies it to ALL providers (GEO-SEC-2). Re-exported here to keep
// this adapter's public surface (and existing tests) unchanged.
// ---------------------------------------------------------------------------

import { sanitizeUserPrompt, type SanitizationResult } from "./prompt-sanitizer";
export { sanitizeUserPrompt };
export type { SanitizationResult };

/**
 * Validate LLM output text (post-generation).
 * Ensures output is non-empty and within sanity length bounds.
 */
export function validateOutput(text: string): { valid: boolean; reason?: string } {
  if (!text || text.trim().length === 0) {
    return { valid: false, reason: "Output is empty" };
  }
  if (text.length < 50) {
    return { valid: false, reason: `Output too short: ${text.length} chars (min 50)` };
  }
  if (text.length > 3000) {
    return { valid: false, reason: `Output too long: ${text.length} chars (max 3000)` };
  }
  return { valid: true };
}

// ---------------------------------------------------------------------------
// Helper: map provider errors to LLMError codes
// ---------------------------------------------------------------------------

function classifyAnthropicError(err: unknown): LLMError {
  const message = err instanceof Error ? err.message : String(err);
  const name = err instanceof Error ? err.name : "";
  const status =
    err && typeof err === "object" && "status" in err
      ? (err as { status?: number }).status
      : undefined;

  if (
    status === 429 ||
    name === "RateLimitError" ||
    /rate.?limit|throttl/i.test(message)
  ) {
    return {
      code: "rate_limit",
      provider: "anthropic",
      retryable: true,
      message: `Rate limit exceeded: ${message}`,
    };
  }

  if (
    /context.length|too.many.tokens|maximum.context|token.limit/i.test(message)
  ) {
    return {
      code: "context_length",
      provider: "anthropic",
      retryable: false,
      message: `Context length exceeded: ${message}`,
    };
  }

  if (
    status === 400 &&
    /content.policy|safety|harmful|moderation|violat/i.test(message)
  ) {
    return {
      code: "safety",
      provider: "anthropic",
      retryable: false,
      message: `Safety/content policy rejection: ${message}`,
    };
  }

  return {
    code: "unavailable",
    provider: "anthropic",
    retryable: true,
    message: `Provider error: ${message}`,
  };
}

// ---------------------------------------------------------------------------
// AnthropicAdapter — EU path (Bedrock eu-central-1)
// ---------------------------------------------------------------------------

async function generateViaBedrock(request: LLMRequest): Promise<LLMResponse> {
  const bedrockClient = new BedrockRuntimeClient({
    region: "eu-central-1",
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "",
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "",
      sessionToken: process.env.AWS_SESSION_TOKEN,
    },
  });

  const body = JSON.stringify({
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: request.max_tokens,
    temperature: request.temperature ?? 0.7,
    system: request.system_prompt,
    messages: [{ role: "user", content: request.user_prompt }],
  });

  const startMs = Date.now();

  try {
    if (request.stream) {
      // Streaming path: collect all chunks into final text
      const cmd = new InvokeModelWithResponseStreamCommand({
        modelId: BEDROCK_MODEL_ID,
        contentType: "application/json",
        accept: "application/json",
        body: Buffer.from(body),
      });

      const response = await bedrockClient.send(cmd);
      let outputText = "";
      let inputTokens = 0;
      let outputTokens = 0;

      if (response.body) {
        for await (const chunk of response.body) {
          if (chunk.chunk?.bytes) {
            const parsed = JSON.parse(
              Buffer.from(chunk.chunk.bytes).toString("utf-8")
            );
            if (parsed.type === "content_block_delta" && parsed.delta?.text) {
              outputText += parsed.delta.text;
            }
            if (parsed.type === "message_delta" && parsed.usage) {
              outputTokens = parsed.usage.output_tokens ?? 0;
            }
            if (parsed.type === "message_start" && parsed.message?.usage) {
              inputTokens = parsed.message.usage.input_tokens ?? 0;
            }
          }
        }
      }

      const latency_ms = Date.now() - startMs;
      return {
        text: outputText,
        model_name: "claude-sonnet-4-5",
        model_version: ANTHROPIC_MODEL_ID,
        provider: "anthropic",
        latency_ms,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        zdr_confirmed: true,
      };
    } else {
      // Non-streaming path
      const cmd = new InvokeModelCommand({
        modelId: BEDROCK_MODEL_ID,
        contentType: "application/json",
        accept: "application/json",
        body: Buffer.from(body),
      });

      const response = await bedrockClient.send(cmd);
      const latency_ms = Date.now() - startMs;

      const responseBody = JSON.parse(
        Buffer.from(response.body).toString("utf-8")
      );

      const outputText: string =
        responseBody.content?.[0]?.text ?? "";

      return {
        text: outputText,
        model_name: "claude-sonnet-4-5",
        model_version: ANTHROPIC_MODEL_ID,
        provider: "anthropic",
        latency_ms,
        input_tokens: responseBody.usage?.input_tokens ?? 0,
        output_tokens: responseBody.usage?.output_tokens ?? 0,
        zdr_confirmed: true,
      };
    }
  } catch (err) {
    const llmError = classifyAnthropicError(err);
    logger.error("bedrock_inference_error", {
      code: llmError.code,
      retryable: llmError.retryable,
      requestId: request.request_id,
      region: "eu-central-1",
    });
    throw new LLMGatewayError(llmError);
  }
}

// ---------------------------------------------------------------------------
// AnthropicAdapter — US path (direct Anthropic API)
// ---------------------------------------------------------------------------

async function generateViaDirectAPI(request: LLMRequest): Promise<LLMResponse> {
  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  const startMs = Date.now();

  try {
    if (request.stream) {
      // Streaming via direct API — collect chunks
      let outputText = "";
      let inputTokens = 0;
      let outputTokens = 0;

      const stream = await client.messages.stream({
        model: ANTHROPIC_MODEL_ID,
        max_tokens: request.max_tokens,
        temperature: request.temperature ?? 0.7,
        system: request.system_prompt,
        messages: [{ role: "user", content: request.user_prompt }],
      });

      for await (const event of stream) {
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          outputText += event.delta.text;
        }
        if (event.type === "message_delta" && event.usage) {
          outputTokens = event.usage.output_tokens;
        }
        if (event.type === "message_start" && event.message.usage) {
          inputTokens = event.message.usage.input_tokens;
        }
      }

      const latency_ms = Date.now() - startMs;
      return {
        text: outputText,
        model_name: "claude-sonnet-4-5",
        model_version: ANTHROPIC_MODEL_ID,
        provider: "anthropic",
        latency_ms,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        zdr_confirmed: true,
      };
    } else {
      const response = await client.messages.create({
        model: ANTHROPIC_MODEL_ID,
        max_tokens: request.max_tokens,
        temperature: request.temperature ?? 0.7,
        system: request.system_prompt,
        messages: [{ role: "user", content: request.user_prompt }],
      });

      const latency_ms = Date.now() - startMs;
      const outputText =
        response.content[0]?.type === "text" ? response.content[0].text : "";

      return {
        text: outputText,
        model_name: "claude-sonnet-4-5",
        model_version: ANTHROPIC_MODEL_ID,
        provider: "anthropic",
        latency_ms,
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
        zdr_confirmed: true,
      };
    }
  } catch (err) {
    const llmError = classifyAnthropicError(err);
    logger.error("anthropic_direct_inference_error", {
      code: llmError.code,
      retryable: llmError.retryable,
      requestId: request.request_id,
    });
    throw new LLMGatewayError(llmError);
  }
}

// ---------------------------------------------------------------------------
// AnthropicAdapter — exported class (replaces stub in index.ts)
// ---------------------------------------------------------------------------

/**
 * Tenant region hint passed by the caller.
 * Resolved from JWT custom claim (app_metadata.region) in the API route.
 * Defaults to 'us' if not provided.
 */
export type TenantRegion = "eu" | "us";

export class AnthropicAdapter implements LLMProviderAdapter {
  readonly provider: LLMProvider = "anthropic";

  private readonly tenantRegion: TenantRegion;

  constructor(tenantRegion: TenantRegion = "us") {
    this.tenantRegion = tenantRegion;
  }

  /**
   * Generate a draft using Anthropic Claude Sonnet.
   *
   * Pre-send sanitization (S-5/CC-3):
   *  - Strip control chars from user_prompt
   *  - Enforce 4000-char cap
   *  - Reject injection patterns → throw with code 'unavailable' retryable:false
   *
   * Post-generation validation:
   *  - Non-empty, 50–3000 chars
   *  - Log output_hash for tamper evidence (stored by caller in generation_log)
   *
   * Routing:
   *  - tenantRegion === 'eu' → Bedrock eu-central-1
   *  - tenantRegion === 'us' → direct Anthropic API
   */
  async generate(request: LLMRequest): Promise<LLMResponse> {
    // --- Sanitize user_prompt (S-5/CC-3) ---
    const sanitization = sanitizeUserPrompt(request.user_prompt);

    if (sanitization.rejected) {
      // Write audit event — caller is responsible for audit_log write,
      // but we log here at warn level for immediate observability.
      logger.warn("prompt_injection_attempt_blocked", {
        requestId: request.request_id,
        reason: sanitization.rejectionReason,
      });
      throw new LLMGatewayError({
        code: "unavailable",
        provider: "anthropic",
        retryable: false,
        message: `Input rejected: ${sanitization.rejectionReason}`,
      });
    }

    // Build sanitized request
    const sanitizedRequest: LLMRequest = {
      ...request,
      user_prompt: sanitization.sanitized,
    };

    // --- Route to correct provider path ---
    logger.info("llm_generate_start", {
      requestId: request.request_id,
      region: this.tenantRegion,
      provider: "anthropic",
      promptLength: sanitization.sanitized.length,
    });

    let response: LLMResponse;

    if (this.tenantRegion === "eu") {
      response = await generateViaBedrock(sanitizedRequest);
    } else {
      response = await generateViaDirectAPI(sanitizedRequest);
    }

    // --- Validate output (post-generation) ---
    const outputValidation = validateOutput(response.text);
    if (!outputValidation.valid) {
      logger.error("llm_output_validation_failed", {
        requestId: request.request_id,
        reason: outputValidation.reason,
        outputLength: response.text.length,
      });
      throw new LLMGatewayError({
        code: "unavailable",
        provider: "anthropic",
        retryable: false,
        message: `LLM output validation failed: ${outputValidation.reason}`,
      });
    }

    // Log successful generation (no content in logs — PII minimization §10)
    logger.info("llm_generate_complete", {
      requestId: request.request_id,
      region: this.tenantRegion,
      provider: "anthropic",
      modelVersion: response.model_version,
      latencyMs: response.latency_ms,
      inputTokens: response.input_tokens,
      outputTokens: response.output_tokens,
      outputHash: createHash("sha256").update(response.text).digest("hex"),
      zdrConfirmed: response.zdr_confirmed,
    });

    return response;
  }
}
