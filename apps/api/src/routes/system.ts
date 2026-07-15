/**
 * System transparency routes — Ozvor
 *
 * GET /api/system/capabilities  (PUBLIC, no auth)
 *   Reports every engine/tool the product uses, what it powers, what
 *   key/connection it needs, and whether it is currently connected — WITHOUT
 *   exposing any secret value (only presence booleans). This is what makes the
 *   system self-explaining: the UI renders this so customers see exactly how
 *   the audit runs and what is/isn't wired.
 *
 * Hard rules:
 *  - Never return secret values — only `connected: boolean` derived from env presence.
 *  - No tenant data here — this is platform-level capability info.
 */

import { Hono } from "hono";
import { requireAuth, requireRole } from "../auth/middleware";
import { encryptToken, decryptToken } from "../../../../packages/shared/src/crypto";
import type { PostgresClient } from "./social-accounts";

/**
 * BYOK key resolution — load + decrypt a tenant's stored provider key.
 * Returns the plaintext API key, or null if the tenant hasn't connected one.
 * This is the read side of the BYOK system (the write side is POST
 * /api/account/provider-keys). Used by the content path so client-internal
 * generation runs on the CLIENT's key (the intended cost model).
 */
export async function resolveProviderKey(
  db: PostgresClient,
  tenantId: string,
  provider: "anthropic" | "openai" | "gemini" | "perplexity" | "serp"
): Promise<string | null> {
  await db.setTenantId(tenantId);
  const res = await db.query<{ key_encrypted: Buffer | Uint8Array }>(
    `SELECT key_encrypted FROM provider_keys WHERE tenant_id = $1 AND provider = $2`,
    [tenantId, provider]
  );
  const blob = res.rows[0]?.key_encrypted;
  if (!blob) return null;
  try {
    return decryptToken(Buffer.isBuffer(blob) ? blob : Buffer.from(blob));
  } catch {
    return null; // corrupt/old-key-version blob → treat as not set
  }
}

function present(name: string): boolean {
  const v = process.env[name];
  return typeof v === "string" && v.trim().length > 0;
}

const BYOK_PROVIDERS = new Set(["anthropic", "openai", "gemini", "perplexity", "serp"]);

export function registerSystemRoutes(app: Hono, db: PostgresClient): void {
  // -------------------------------------------------------------------------
  // GET /api/account/provider-keys — which BYOK keys this tenant has saved
  // (presence only — never the key value).
  // -------------------------------------------------------------------------
  app.get("/api/account/provider-keys", requireAuth, async (c) => {
    const auth = c.get("auth");
    await db.setTenantId(auth.tenantId);
    // RLS scopes this to the tenant; the explicit filter is defense-in-depth.
    const res = await db.query<{ provider: string }>(
      `SELECT provider FROM provider_keys WHERE tenant_id = $1`,
      [auth.tenantId]
    );
    return c.json({ providers: res.rows.map((r) => r.provider) });
  });

  // -------------------------------------------------------------------------
  // POST /api/account/provider-keys — save a BYOK key (encrypted at rest).
  // Body: { provider, key }. Upsert per (tenant, provider). Never returned.
  // -------------------------------------------------------------------------
  app.post(
    "/api/account/provider-keys",
    requireAuth,
    requireRole(["owner", "editor"]),
    async (c) => {
      const auth = c.get("auth");
      let body: { provider?: string; key?: string };
      try {
        body = await c.req.json();
      } catch {
        return c.json({ message: "Invalid JSON body." }, 400);
      }
      const provider = (body.provider ?? "").trim();
      const key = (body.key ?? "").trim();
      if (!BYOK_PROVIDERS.has(provider)) {
        return c.json({ message: "Unknown provider." }, 400);
      }
      if (key.length < 8) {
        return c.json({ message: "Key looks too short." }, 400);
      }

      const { encrypted } = encryptToken(key);
      await db.setTenantId(auth.tenantId);
      await db.query(
        `INSERT INTO provider_keys (tenant_id, provider, key_encrypted, created_at, updated_at)
         VALUES ($1, $2, $3, NOW(), NOW())
         ON CONFLICT (tenant_id, provider)
         DO UPDATE SET key_encrypted = EXCLUDED.key_encrypted, updated_at = NOW()`,
        [auth.tenantId, provider, encrypted]
      );
      // Presence only — never echo the key.
      return c.json({ provider, saved: true });
    }
  );

  // -------------------------------------------------------------------------
  // DELETE /api/account/provider-keys/:provider — remove a saved BYOK key.
  // -------------------------------------------------------------------------
  app.delete(
    "/api/account/provider-keys/:provider",
    requireAuth,
    requireRole(["owner", "editor"]),
    async (c) => {
      const auth = c.get("auth");
      const provider = c.req.param("provider");
      await db.setTenantId(auth.tenantId);
      // RLS scopes this to the tenant; the explicit filter is defense-in-depth
      // so a key can never be deleted across tenants even if RLS were disabled.
      await db.query(`DELETE FROM provider_keys WHERE provider = $1 AND tenant_id = $2`, [
        provider,
        auth.tenantId,
      ]);
      return c.json({ provider, removed: true });
    }
  );

  app.get("/api/system/capabilities", (c) => {
    // Anthropic is "connected" if a direct key OR Bedrock creds are present.
    const anthropic = present("ANTHROPIC_API_KEY") || present("AWS_ACCESS_KEY_ID");

    return c.json({
      // The 5-stage loop, each with the tools it uses.
      stages: [
        {
          id: "audit",
          name: "AI Visibility Audit",
          summary:
            "Asks realistic buyer prompts to multiple AI engines and records if your brand is mentioned, cited, where it ranks, and which sources the answer used.",
          tools: [
            { id: "anthropic", label: "Anthropic Claude", powers: "Probe an AI answer engine", key: "Anthropic / AWS Bedrock", connected: anthropic, mockFallback: true },
            { id: "openai", label: "OpenAI GPT-4o", powers: "Probe ChatGPT-style answers", key: "OpenAI", connected: present("OPENAI_API_KEY"), mockFallback: true },
            { id: "gemini", label: "Google Gemini", powers: "Probe Gemini answers", key: "Google", connected: present("GEMINI_API_KEY"), mockFallback: true },
            { id: "perplexity", label: "Perplexity", powers: "Probe Perplexity answers", key: "Perplexity", connected: present("PERPLEXITY_API_KEY"), mockFallback: true, euNote: "Blocked for EU brands until SCCs confirmed." },
            { id: "serp", label: "Google AI Overview (DataForSEO/SerpAPI)", powers: "Capture AI Overview + cited sources", key: "SERP provider", connected: present("SERP_API_KEY"), mockFallback: true },
          ],
        },
        {
          id: "authority",
          name: "Authority & Perception Analysis",
          summary:
            "Beyond the probes: classifies how AI portrays you (sentiment), deep-dives Reddit (the #1 source AI cites — threads, subreddits, perception), checks the 7 sources AI cites most, and resolves your brand in the public knowledge graph (Wikidata/Wikipedia consistency).",
          tools: [
            { id: "sentiment", label: "Sentiment classifier", powers: "How AI answers portray your brand (positive/neutral/negative)", key: "none — runs on probe answers", connected: true, mockFallback: false },
            { id: "reddit-dive", label: "Reddit deep-dive (public results)", powers: "Threads, subreddits, and perception on the #1 AI-cited source", key: "SERP provider", connected: present("SERP_API_KEY"), mockFallback: true },
            { id: "offsite", label: "Off-site authority (7 sources)", powers: "Presence on Reddit, Wikipedia, LinkedIn, G2, Trustpilot, Crunchbase, YouTube", key: "SERP provider", connected: present("SERP_API_KEY"), mockFallback: true },
            { id: "entity-graph", label: "Knowledge-graph entity (Wikidata/Wikipedia)", powers: "Entity resolution + cross-source consistency — public APIs", key: "none — public, key-free", connected: true, mockFallback: true },
          ],
        },
        {
          id: "score",
          name: "Ozvor AI Visibility Score",
          summary:
            "A 0 to 100 score from three vectors: Visibility, Citation Readiness, and Execution. Every input is labelled measured or baseline, and measured inputs need the AI engines connected. Aligned with current generative-AI SEO guidance. llms.txt is informational only and never scored.",
          tools: [],
        },
        {
          id: "plan",
          name: "GEO Content Plan",
          summary:
            "Turns audit gaps into a prioritized content plan + briefs mapped to the buyer prompts where you're absent.",
          tools: [
            { id: "anthropic-plan", label: "Anthropic Claude", powers: "Generate plan + briefs", key: "platform key or your own (BYOK)", connected: anthropic, mockFallback: true },
          ],
        },
        {
          id: "publish",
          name: "Organic Publishing (OrganicPosts)",
          summary:
            "Drafts content and, with your approval, publishes to your owned channels. Draft-and-confirm: nothing posts automatically.",
          tools: [
            { id: "linkedin", label: "LinkedIn", powers: "Publish posts", key: "LinkedIn OAuth", connected: present("LINKEDIN_CLIENT_ID"), mockFallback: false },
            { id: "meta", label: "Instagram / Facebook", powers: "Publish posts", key: "Meta OAuth", connected: present("INSTAGRAM_CLIENT_ID"), mockFallback: false },
            { id: "reddit", label: "Reddit", powers: "Draft community answers (human-approved only)", key: "Reddit OAuth", connected: present("REDDIT_CLIENT_ID"), mockFallback: false, note: "Posting is human-approved from your own account; monitoring gated on a commercial data license." },
          ],
        },
        {
          id: "monitor",
          name: "Weekly Monitor (flywheel)",
          summary:
            "Re-runs the audit weekly, tracks your Ozvor AI Visibility Score over time, and flags competitor mentions, lost citations, and answer drift.",
          tools: [],
        },
      ],

      // Platform-level connections (auth, billing).
      platform: {
        auth: { label: "Supabase Auth (magic-link login)", connected: present("SUPABASE_URL"), key: "Supabase" },
        billing: { label: "Stripe (BRL/Pix · EUR/USD)", connected: present("STRIPE_SECRET_KEY"), key: "Stripe" },
      },

      // Always-on compliance controls (shown so customers know what protects them).
      controls: [
        "Provider routing gate — EU probes never reach providers without a confirmed EU transfer mechanism.",
        "AI transparency — every AI-generated draft is labelled (EU AI Act Art. 50).",
        "Append-only AI log — every inference logged (model, hashes, ZDR); cannot be edited or deleted.",
        "No autonomous posting — draft-and-confirm everywhere.",
        "No scraping of LLM web UIs — official provider APIs only.",
        "Data residency — EU data + inference stay in eu-central-1.",
      ],

      // Whether the platform is currently running probes live or in mock mode.
      mode: anthropic || present("OPENAI_API_KEY") || present("SERP_API_KEY") ? "live" : "demo",
    });
  });
}
