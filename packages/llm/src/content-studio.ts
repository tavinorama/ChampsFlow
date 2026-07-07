/**
 * content-studio.ts — Ozvor · C4 Multi-Channel Content Engine
 *
 * Generates draft content (blog / LinkedIn / FAQ) for a plan recommendation.
 * Live path: Anthropic (or any keyed provider) writes the draft. Fallback:
 * a structured template so it works without keys. Blog & FAQ embed schema.org
 * markup (AC-C4-1/2).
 *
 * GEO-A2 (hardcoded, non-negotiable):
 *   a) NO competitor brand names injected into the prompt.
 *   b) NO comparative claims without a sourced factual basis.
 *   c) Use ONLY client-provided factual context; flag gaps rather than fabricate.
 *
 * Every output is a DRAFT, AI-labelled (AC-C4-3); nothing auto-publishes.
 */

import { sanitizeUserPrompt } from "./prompt-sanitizer";

export type ContentType = "blog" | "linkedin" | "faq";

/** LLM providers that can WRITE content drafts. SERP is excluded — it's a search
 *  API, not a generator. Content runs on the CLIENT's key for the provider they
 *  pick (the BYOK cost model). */
export type ContentProvider = "anthropic" | "openai" | "gemini" | "perplexity";

/** Human-facing label per content provider (UI dropdown + transparency copy). */
export const CONTENT_PROVIDER_LABELS: Record<ContentProvider, string> = {
  anthropic: "Claude (Anthropic)",
  openai: "ChatGPT (OpenAI)",
  gemini: "Gemini (Google)",
  perplexity: "Perplexity",
};

export interface ContentRequest {
  contentType: ContentType;
  brandName: string;
  category: string | null;
  /** The action/topic to write about (from an accepted plan recommendation). */
  topic: string;
  /** Optional credible external reference URL (from the audit's top sources). */
  sourceUrl?: string | null;
  /** Free-form refine directive. Sanitized before use. Examples: "make it shorter", "add more data", "make it FAQ-shaped" */
  instructions?: string;
  /** Tone for the content. Examples: professional, friendly, technical, playful */
  tone?: string;
  /** Approximate length target */
  length?: "short" | "medium" | "long";

  // --- Brand-grounded audit context (all optional; enriches specificity when present) ---

  /** What the brand does (from crawl/site or user-entered description). */
  brandDescription?: string | null;
  /** Brand market/geography (e.g. "Brazilian SMBs", "US startups"). */
  brandMarket?: string | null;
  /** The specific audit gap this piece closes (from plan_task.gap). */
  auditGap?: string | null;
  /** The evidence from the audit that confirms this gap (from plan_task.evidence).
   *  NOTE: comes from our own DB (plan_task.evidence); not user-supplied input.
   *  We do NOT sanitize it — it was already validated when the plan was generated.
   *  (GEO-SEC-2: sanitization is only required for user-supplied text, not DB-internal data.) */
  auditEvidence?: string | null;
  /** The specific buyer prompts where the brand is currently absent (from citation_check). */
  absentPrompts?: string[] | null;
  /** Content traits that are weak for this brand (from content-geo traits). */
  weakContentTraits?: string[] | null;
  /** High-authority off-site sources where the brand is missing (for context). */
  missingSourceNames?: string[] | null;
  /** Anonymised count of competitors displacing the brand (GEO-A2: no names). */
  competitorPressureCount?: number | null;
}

export interface ContentDraft {
  title: string;
  body: string;
  schemaMarkup: string | null;
  generatedBy: "rules" | "llm" | "error";
  /** Which API key paid for this generation. "client" = the tenant's BYOK key
   *  (the intended cost model for client-internal content); "platform" = the
   *  operator's key (fallback); "none" = keyless template (no LLM call). */
  keyUsed: "client" | "platform" | "none";
  /** Rationale tying this piece to the audit — which gap it closes, which
   *  prompts/engines it targets, why it should help citation probability.
   *  References real audit findings. Null when no meaningful audit context
   *  is available. */
  rationale: string | null;
}

function faqSchema(brand: string, q: string, a: string): string {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [{ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } }],
  });
}

function articleSchema(brand: string, title: string): string {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Article",
    headline: title,
    author: { "@type": "Organization", name: brand },
    publisher: { "@type": "Organization", name: brand },
  });
}

// ---- Dynamic system prompt — injects brand context for brand-specific output ----
function buildSystemPrompt(req: ContentRequest): string {
  const lines: string[] = [];

  // Identity: tell the model exactly who it's writing for.
  const brandDesc = req.brandDescription
    ? `${req.brandName} — ${req.brandDescription}`
    : req.brandMarket
    ? `${req.brandName}, a ${req.category ?? "company"} serving ${req.brandMarket}`
    : req.category
    ? `${req.brandName} (${req.category})`
    : req.brandName;

  lines.push(
    `You are a GEO (Generative Engine Optimization) content writer producing a draft for: ${brandDesc}.`
  );

  // Brand-specific specificity mandate — the core fix for generic output.
  lines.push(
    `Do NOT write content that would read the same for any brand in this category. ` +
      `Every sentence must be specifically relevant to ${req.brandName} and their situation. ` +
      `Generic category advice that any ${req.category ?? "company"} could publish is forbidden.`
  );

  // Audit gap context — if present, ground the piece in the specific finding.
  if (req.auditGap) {
    lines.push(`AUDIT CONTEXT — The specific gap this content addresses: "${req.auditGap}"`);
  }

  // Absent buyer prompts — the exact queries the LLM should help the brand answer.
  if (req.absentPrompts && req.absentPrompts.length > 0) {
    const promptList = req.absentPrompts.map((p) => `  • ${p}`).join("\n");
    lines.push(
      `BUYER INTENT — The brand is currently absent for these buyer queries:\n${promptList}\n` +
        `Structure the content to directly and completely answer these questions.`
    );
  }

  // Weak traits — tell the LLM what to improve.
  if (req.weakContentTraits && req.weakContentTraits.length > 0) {
    lines.push(
      `CONTENT IMPROVEMENT TARGETS — These citation-worthiness traits are weak and must be strengthened: ` +
        req.weakContentTraits.join(", ") +
        `.`
    );
  }

  // Off-site source context (for background only — not as confirmed presence).
  if (req.missingSourceNames && req.missingSourceNames.length > 0) {
    lines.push(
      `CONTEXT — The brand is currently absent from these high-authority sources: ` +
        req.missingSourceNames.join(", ") +
        `. You may reference them as authoritative sources to cite or appear on, ` +
        `but do NOT claim the brand already has a presence there.`
    );
  }

  // Competitor pressure — anonymised only (GEO-A2: no competitor names).
  if (req.competitorPressureCount && req.competitorPressureCount > 0) {
    lines.push(
      `COMPETITIVE CONTEXT — ${req.competitorPressureCount} competitors are currently displacing this brand in AI search results for buyer queries. ` +
        `Do NOT name any competitors — reference only the category and the brand's own distinct positioning.`
    );
  }

  // Fabrication hard rule.
  lines.push(
    `FABRICATION RULE — Use ONLY facts the client provides. If a fact is needed but unknown, ` +
      `insert a clearly-marked [PLACEHOLDER: describe what's needed] rather than fabricating it.`
  );

  // GEO-A2 hard rules.
  lines.push(
    `GEO HARD RULES (never violate):`,
    `1. Do NOT name or compare specific competitor brands or products.`,
    `2. Do NOT make comparative or superlative claims without a sourced factual basis.`,
    `3. Respond with the content only — no preamble, no meta-commentary.`
  );

  // Citation quality guidelines (Princeton GEO research-backed).
  lines.push(
    `GEO CITATION QUALITY GUIDELINES:`,
    `- Include at least 2 specific statistics or data points with a year and source ` +
      `(e.g. 'a 2024 BrightEdge study found 68% of zero-click searches resolve through AI answers'). ` +
      `If unavailable, insert [PLACEHOLDER: statistic with year and source].`,
    `- Include at least 2–3 sourced or attributed claims using phrases like 'according to [source]', ` +
      `'a [year] study found', or 'research from [org] shows'. Use [PLACEHOLDER: source attribution] if unknown.`,
    `- Include at least one answer-shaped passage: state a question explicitly, then answer it ` +
      `in the same paragraph (this structure is directly extractable by AI engines).`,
    `- Where relevant, include a direct quotation wrapped in quotation marks from a credible source. ` +
      `Use [PLACEHOLDER: direct quote from credible source] if none is available.`,
    `- Go deep on ONE focused idea rather than covering everything superficially. ` +
      `Specificity and depth are what make content citation-worthy in AI search.`
  );

  return lines.join("\n\n");
}

// ---- Deterministic rationale — built from audit inputs, NOT an LLM call ----
function buildRationale(req: ContentRequest): string | null {
  const hasGap = Boolean(req.auditGap);
  const hasPrompts = Boolean(req.absentPrompts && req.absentPrompts.length > 0);
  const hasTraits = Boolean(req.weakContentTraits && req.weakContentTraits.length > 0);

  // Return null if there is no meaningful audit context to reference.
  if (!hasGap && !hasPrompts && !hasTraits) return null;

  const parts: string[] = [];

  if (hasGap) {
    parts.push(`This piece addresses the following audit gap: "${req.auditGap}".`);
  }

  if (hasPrompts && req.absentPrompts) {
    const sample = req.absentPrompts.slice(0, 2);
    if (sample.length === 1) {
      parts.push(`It targets the buyer query where ${req.brandName} is currently absent: "${sample[0]}".`);
    } else {
      parts.push(
        `It targets buyer queries where ${req.brandName} is currently absent, including: ` +
          `"${sample[0]}" and "${sample[1]}".`
      );
    }
  }

  if (hasTraits && req.weakContentTraits) {
    parts.push(
      `The piece is structured to strengthen the following weak citation-worthiness traits: ` +
        req.weakContentTraits.join(", ") +
        `.`
    );
  }

  // Note: missingSourceNames stay as context; we do NOT claim confirmed presence.
  if (req.missingSourceNames && req.missingSourceNames.length > 0) {
    parts.push(
      `Publishing this content and seeking presence on high-authority sources ` +
        `(the brand is currently absent from: ${req.missingSourceNames.join(", ")}) ` +
        `should increase citation probability in AI search answers.`
    );
  } else {
    parts.push(
      `Publishing this piece should increase the probability that AI engines cite ` +
        `${req.brandName} when answering buyer questions in this category.`
    );
  }

  return parts.join(" ");
}

// ---- Template fallback (key present but LLM failed) — structured, GEO-shaped, honest placeholders.
// Also exported for kit/demo use-cases that intentionally run without keys
// (pre-account, $29 kit, invisibility test). These callers know they're in
// mock/keyless mode and want a structured placeholder, not an error message.
export function templateDraft(req: ContentRequest): Omit<ContentDraft, "keyUsed"> {
  const cat = req.category?.trim() || "your category";
  const src = req.sourceUrl ? `\n\nReference: ${req.sourceUrl}` : "";
  const rationale = buildRationale(req);

  if (req.contentType === "linkedin") {
    return {
      title: req.topic.slice(0, 80),
      body:
        `${req.topic}\n\n` +
        `At ${req.brandName}, here's what matters for ${cat}: [PLACEHOLDER: 1–2 specific data points or results].\n\n` +
        `Why it matters: [PLACEHOLDER: the concrete outcome for your customer].\n\n` +
        `#${cat.replace(/\s+/g, "")} #GEO`,
      schemaMarkup: null,
      generatedBy: "rules",
      rationale,
    };
  }
  if (req.contentType === "faq") {
    const q = req.topic.endsWith("?") ? req.topic : `What should you know about ${req.topic}?`;
    const a = `${req.brandName} approaches this with [PLACEHOLDER: your specific method / data]. Key facts: [PLACEHOLDER: 2–3 concrete points].${src}`;
    return {
      title: q,
      body: `**${q}**\n\n${a}`,
      schemaMarkup: faqSchema(req.brandName, q, a.replace(/\[PLACEHOLDER:[^\]]*\]/g, "…")),
      generatedBy: "rules",
      rationale,
    };
  }
  // blog
  const title = req.topic.replace(/^Add |^Create |^Publish /i, "").replace(/\.$/, "");
  const body =
    `# ${title}\n\n` +
    `## Overview\n[PLACEHOLDER: 2–3 sentences framing the problem for ${cat} buyers].\n\n` +
    `## What the data shows\n[PLACEHOLDER: include at least one statistic or benchmark].\n\n` +
    `## How ${req.brandName} approaches it\n[PLACEHOLDER: your specific, sourced method].\n\n` +
    `## Key takeaways\n- [PLACEHOLDER]\n- [PLACEHOLDER]\n\n` +
    `[Internal link: related service page]${src}`;
  return { title, body, schemaMarkup: articleSchema(req.brandName, title), generatedBy: "rules", rationale };
}

// ---- Provider-agnostic chat completion for content drafts ----
// Dispatches the SAME prompt to whichever LLM the client chose, using the
// client's BYOK key. Returns the draft text, or null on any failure (non-200 —
// usually no credits/quota — timeout, or empty body). Never throws.
async function chatComplete(
  provider: ContentProvider,
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number
): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    if (provider === "anthropic") {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal: controller.signal,
        headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: process.env["ANTHROPIC_MODEL"] ?? "claude-sonnet-4-6",
          max_tokens: maxTokens,
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
        }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
      return (data.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim() || null;
    }
    if (provider === "openai" || provider === "perplexity") {
      // OpenAI + Perplexity share the OpenAI-compatible Chat Completions shape.
      const url =
        provider === "openai"
          ? "https://api.openai.com/v1/chat/completions"
          : "https://api.perplexity.ai/chat/completions";
      const model =
        provider === "openai"
          ? process.env["OPENAI_MODEL"] ?? "gpt-4o"
          : process.env["PERPLEXITY_MODEL"] ?? "sonar";
      const res = await fetch(url, {
        method: "POST",
        signal: controller.signal,
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      return (data.choices?.[0]?.message?.content ?? "").trim() || null;
    }
    // gemini — Google Generative Language API (key in query string, system via systemInstruction)
    const model = process.env["GEMINI_MODEL"] ?? "gemini-2.5-flash";
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        signal: controller.signal,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: "user", parts: [{ text: userPrompt }] }],
          generationConfig: { maxOutputTokens: maxTokens },
        }),
      }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    return (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim() || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function llmDraft(req: ContentRequest, apiKey: string, provider: ContentProvider): Promise<Omit<ContentDraft, "keyUsed"> | null> {
  // Map length to word-count hint and max_tokens cap.
  const lengthHint =
    req.length === "short" ? "~300 words" :
    req.length === "medium" ? "~600 words" :
    req.length === "long" ? "~1000+ words" : null;
  const maxTokens =
    req.length === "short" ? 600 :
    req.length === "medium" ? 1200 : 3072;

  // Build brand-grounded user prompt.
  const userPromptParts: string[] = [
    `Write a ${req.contentType === "blog" ? "long-form blog post" : req.contentType === "faq" ? "FAQ entry" : "LinkedIn post"}`,
    `for ${req.brandName} on this topic: "${req.topic}".`,
  ];

  // Audit gap context in the user prompt.
  if (req.auditGap) {
    userPromptParts.push(`This piece should close the following audit gap: "${req.auditGap}".`);
  }

  // Audit evidence — sourced from our DB, safe to pass through.
  if (req.auditEvidence) {
    userPromptParts.push(`Supporting evidence from the audit: "${req.auditEvidence}".`);
  }

  // Absent buyer prompts as concrete target intent.
  if (req.absentPrompts && req.absentPrompts.length > 0) {
    const promptList = req.absentPrompts.slice(0, 3).map((p) => `"${p}"`).join(", ");
    userPromptParts.push(
      `Target these exact buyer queries where the brand is currently absent: ${promptList}.`
    );
  }

  // Weak content traits — tell the model what to fix.
  if (req.weakContentTraits && req.weakContentTraits.length > 0) {
    userPromptParts.push(
      `Specifically improve these weak content traits: ${req.weakContentTraits.join(", ")}.`
    );
  }

  // Format instructions by content type.
  if (req.contentType === "blog") {
    userPromptParts.push(
      `Structure the blog post as follows (mandatory, in this order):` +
      `\n1. H1 headline phrased as a question the buyer would actually ask (e.g. "How do [category] companies [solve problem]?") — never a generic "In today's world" opening.` +
      `\n2. One-sentence meta description (prefix with "Meta: ") capturing the article's unique angle.` +
      `\n3. Two-paragraph introduction that names ${req.brandName} and their specific situation by the second sentence.` +
      `\n4. At least two H2 sections. Each H2 must also be phrased as a question where possible.` +
      `\n5. An FAQ block (minimum 3 Q&A pairs) with "## Frequently Asked Questions" as the H2 — this structure is directly extractable by AI engines.` +
      `\n6. Specific numbers and data points (add year + source). If unknown, mark them [add: statistic + source, e.g. "X% of buyers…" per [source] [year]].` +
      `\n7. A "Schema type" note at the very end on its own line: "Schema: Article" (or FAQPage if FAQ-dominated).` +
      `\n8. An internal-link placeholder at the end: "[Internal link: related service page]".` +
      `\nDo NOT open with "In today's world", "In recent years", or any generic industry-overview sentence. Open with a direct answer or a compelling brand-specific claim.`
    );
  } else if (req.contentType === "faq") {
    userPromptParts.push(
      `Format as a clear Q&A. Start with "## [Question phrased from buyer's perspective]?" as the heading. ` +
      `Answer it fully in 2–4 paragraphs naming ${req.brandName} and their specific approach. ` +
      `Include at least one data point (or mark it [add: statistic + source]). ` +
      `End with 2–3 follow-up questions and short answers ("**Q:** … **A:** …") that buyers commonly ask next. ` +
      `Add "Schema: FAQPage" on the last line.`
    );
  } else {
    userPromptParts.push(
      `Write for LinkedIn. Open with a specific insight or surprising number (not a question). ` +
      `Second line: what ${req.brandName} does about it — concrete, not vague. ` +
      `3–5 punchy lines. End with 1 clear takeaway and 2–3 hashtags relevant to the category. ` +
      `Never open with "In today's world" or "I'm excited to share".`
    );
  }

  if (req.sourceUrl) {
    // Sanitize before injecting into the prompt — a client-supplied URL could
    // carry prompt-injection text (security review 2026-06). Drop on rejection.
    const ss = sanitizeUserPrompt(req.sourceUrl);
    if (!ss.rejected) {
      userPromptParts.push(`You may cite this source: ${ss.sanitized.slice(0, 200)}.`);
    }
  }
  if (req.tone) {
    userPromptParts.push(`Write in a ${req.tone} tone.`);
  }
  if (lengthHint) {
    userPromptParts.push(`Target length: ${lengthHint}.`);
  }
  if (req.instructions) {
    userPromptParts.push(`Additional instruction: ${req.instructions}`);
  }

  const userPrompt = userPromptParts.filter(Boolean).join(" ");
  const systemPrompt = buildSystemPrompt(req);

  const body = await chatComplete(provider, apiKey, systemPrompt, userPrompt, maxTokens);
  if (!body) return null;

  const firstLine = body.split("\n").find((l) => l.trim()) ?? req.topic;
  const title = firstLine.replace(/^#+\s*/, "").slice(0, 120);
  const schema = req.contentType === "blog" ? articleSchema(req.brandName, title)
    : req.contentType === "faq" ? faqSchema(req.brandName, title, body.slice(0, 300)) : null;

  // Build rationale deterministically from audit inputs (not an extra LLM call).
  const rationale = buildRationale(req);

  return { title, body, schemaMarkup: schema, generatedBy: "llm", rationale };
}

/**
 * Generate a content draft.
 *
 * BYOK-only cost model: content runs on the CLIENT's own key for the LLM THEY
 * choose (`opts.provider`, default "anthropic"). The client pays their own AI
 * cost and picks their model. There is NO platform fallback here — content is a
 * client-key feature. (Audits, scoring, and the action plan run on the platform
 * and need no client key.)
 *
 * Routing:
 *   1. opts.apiKey present (client BYOK key for opts.provider) → llmDraft on that provider
 *   2. No key                                                  → generatedBy: "error", keyUsed: "none"
 *
 * Within the keyed path:
 *   - Sanitize user-supplied topic/instructions/tone (GEO-SEC-2)
 *   - llmDraft succeeds → LLM draft (generatedBy: "llm", keyUsed: "client")
 *   - llmDraft fails (no credits/quota, timeout, non-200) OR sanitizer rejects
 *     → template fallback (generatedBy: "rules") — the route treats this as an
 *       honest failure and stores nothing.
 */
export async function generateContent(
  req: ContentRequest,
  opts?: { apiKey?: string; provider?: ContentProvider }
): Promise<ContentDraft> {
  const apiKey = opts?.apiKey;
  const provider: ContentProvider = opts?.provider ?? "anthropic";

  // No client key for the chosen provider → graceful, provider-specific error.
  if (!apiKey) {
    const label = CONTENT_PROVIDER_LABELS[provider];
    return {
      title: "Connect your AI key to generate content",
      body: [
        `Content generation runs on YOUR API key for the LLM you pick — here, ${label}.`,
        "",
        `Add your ${label} key under Account → AI engines & keys, then select it in the generator.`,
        "Your key generates and pays for the content — you control the model and the cost.",
        "",
        "The audit, scoring, and action plan run on Ozvor and need no key from you.",
      ].join("\n"),
      schemaMarkup: null,
      generatedBy: "error",
      keyUsed: "none",
      rationale: null,
    };
  }

  // GEO-SEC-2: topic is user-supplied — sanitize before any provider call.
  // Rejected input never reaches the LLM; the safe template path is used.
  const s = sanitizeUserPrompt(req.topic);
  if (!s.rejected) {
    // Sanitize instructions if provided. If rejected, drop them rather than
    // failing the whole request — the rest of the generation proceeds normally.
    let sanitizedInstructions: string | undefined;
    if (req.instructions) {
      const si = sanitizeUserPrompt(req.instructions);
      sanitizedInstructions = si.rejected ? undefined : si.sanitized;
    }
    // Sanitize tone (user-supplied, though truncated to 50 chars in the route).
    // Dropped on rejection, not fatal — the draft proceeds without a tone hint.
    let sanitizedTone: string | undefined;
    if (req.tone) {
      const st = sanitizeUserPrompt(req.tone);
      sanitizedTone = st.rejected ? undefined : st.sanitized;
    }
    const draft = await llmDraft(
      { ...req, topic: s.sanitized, instructions: sanitizedInstructions, tone: sanitizedTone },
      apiKey,
      provider
    );
    if (draft) return { ...draft, keyUsed: "client" };
  }

  // Template fallback: key present but LLM failed (network, timeout, non-200)
  // OR sanitization rejected the topic (injection attempt).
  return { ...templateDraft(req), keyUsed: "none" };
}
