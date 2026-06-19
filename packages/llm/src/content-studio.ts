/**
 * content-studio.ts — TrustIndex AI · C4 Multi-Channel Content Engine
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

export interface ContentRequest {
  contentType: ContentType;
  brandName: string;
  category: string | null;
  /** The action/topic to write about (from an accepted plan recommendation). */
  topic: string;
  /** Optional credible external reference URL (from the audit's top sources). */
  sourceUrl?: string | null;
}

export interface ContentDraft {
  title: string;
  body: string;
  schemaMarkup: string | null;
  generatedBy: "rules" | "llm";
  /** Which API key paid for this generation. "client" = the tenant's BYOK key
   *  (the intended cost model for client-internal content); "platform" = the
   *  operator's key (fallback); "none" = keyless template (no LLM call). */
  keyUsed: "client" | "platform" | "none";
}

// GEO-A2 system prompt — shared by the live LLM path.
const SYSTEM_PROMPT = [
  "You are a GEO (Generative Engine Optimization) content writer for an SMB.",
  "Write clear, specific, citation-worthy content (include concrete facts and",
  "structure that AI engines can extract and cite).",
  "HARD RULES (never violate):",
  "1. Do NOT name or compare specific competitor brands or products.",
  "2. Do NOT make comparative or superlative claims without a sourced factual basis.",
  "3. Use ONLY facts the client provides. If a fact is needed but unknown, insert",
  "   a clearly-marked [PLACEHOLDER: ...] rather than fabricating it.",
  "Respond with the content only — no preamble.",
].join(" ");

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

// ---- Template fallback (no keys) — structured, GEO-shaped, honest placeholders.
function templateDraft(req: ContentRequest): Omit<ContentDraft, "keyUsed"> {
  const cat = req.category?.trim() || "your category";
  const src = req.sourceUrl ? `\n\nReference: ${req.sourceUrl}` : "";
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
  return { title, body, schemaMarkup: articleSchema(req.brandName, title), generatedBy: "rules" };
}

async function llmDraft(req: ContentRequest, apiKey: string): Promise<Omit<ContentDraft, "keyUsed"> | null> {
  const userPrompt = [
    `Write a ${req.contentType === "blog" ? "long-form blog post" : req.contentType === "faq" ? "FAQ entry" : "LinkedIn post"}`,
    `for ${req.brandName} (${req.category ?? "general"}) on this topic: "${req.topic}".`,
    req.sourceUrl ? `You may cite this source: ${req.sourceUrl}.` : "",
    req.contentType === "blog" ? "Use an H1 and H2 structure and include an internal-link placeholder." : "",
  ].join(" ");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: controller.signal,
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: process.env["ANTHROPIC_MODEL"] ?? "claude-sonnet-4-5",
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
    const body = (data.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
    if (!body) return null;
    const firstLine = body.split("\n").find((l) => l.trim()) ?? req.topic;
    const title = firstLine.replace(/^#+\s*/, "").slice(0, 120);
    const schema = req.contentType === "blog" ? articleSchema(req.brandName, title)
      : req.contentType === "faq" ? faqSchema(req.brandName, title, body.slice(0, 300)) : null;
    return { title, body, schemaMarkup: schema, generatedBy: "llm" };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Generate a content draft.
 *
 * BYOK cost model: pass `opts.apiKey` with the CLIENT's own provider key for
 * client-internal content (the client pays their AI cost). If omitted, falls
 * back to the platform key (process.env) — and if neither is set, a keyless
 * structured template. `keyUsed` reports which key actually paid.
 */
export async function generateContent(
  req: ContentRequest,
  opts?: { apiKey?: string }
): Promise<ContentDraft> {
  const clientKey = opts?.apiKey;
  const apiKey = clientKey ?? process.env["ANTHROPIC_API_KEY"];
  if (apiKey) {
    // GEO-SEC-2: topic is user-supplied — sanitize before any provider call.
    // Rejected input never reaches the LLM; the safe template path is used.
    const s = sanitizeUserPrompt(req.topic);
    if (!s.rejected) {
      const draft = await llmDraft({ ...req, topic: s.sanitized }, apiKey);
      if (draft) return { ...draft, keyUsed: clientKey ? "client" : "platform" };
    }
  }
  return { ...templateDraft(req), keyUsed: "none" };
}
