# Ozvor — System Transparency (how everything works)

> *Updated 2026-07-10 (issue #213): brand refreshed TrustIndex AI → Ozvor; "TrustIndex Score" → "Ozvor AI Visibility Score" (founder rule 2026-06-27 — never reintroduce "TrustIndex" in user-facing display).*

> Single source of truth for explaining the product to customers — used to
> generate in-app explainers and the public /how-it-works page. Every step,
> every tool, every key, every connection is listed here. No black boxes.

---

## TL;DR

Ozvor runs a 5-stage loop: **Audit → Score → Plan → Publish → Monitor.**
Each stage names the exact engines/data it uses, the keys/connections it needs,
and what is "measured" (live data) vs "baseline" (placeholder pending a
connection). Customers connect their own accounts and (optionally) their own
API keys. Nothing runs silently — the app shows what it's doing at each step.

---

## 1. The five stages and what powers each

### Stage 1 — Audit (AI Visibility Audit)
**What it does:** Asks a battery of realistic buyer prompts ("best CRM for SMBs",
"top X providers 2026", "is {brand} a good choice") to multiple AI search
engines and records whether your brand is mentioned, cited, where it ranks, and
which sources the answer used.

| Tool / engine | Purpose | Connection / key needed | If not connected |
|---|---|---|---|
| Anthropic Claude | Probe an AI answer engine | `ANTHROPIC_API_KEY` (or AWS Bedrock for EU) | Mock mode (deterministic sample) |
| OpenAI GPT-4o | Probe ChatGPT-style answers | `OPENAI_API_KEY` | Mock / excluded |
| Google Gemini | Probe Gemini answers | `GEMINI_API_KEY` (Vertex AI EU) | Mock / excluded |
| Perplexity | Probe Perplexity answers | `PERPLEXITY_API_KEY` | **EU users: blocked** until SCCs confirmed |
| DataForSEO / SerpAPI | Capture Google AI Overview + cited sources | `SERP_API_KEY` | Mock / excluded |

**Data used:** only synthetic category prompts (not personal data) + your brand
name, domain, category, region, and competitor names you provide.
**Region routing:** EU brands exclude Perplexity (and any provider without a
confirmed EU transfer mechanism) — see the routing gate in §4.

### Stage 2 — Score (Ozvor AI Visibility Score)
**What it does:** Computes a 0–100 score from three weighted vectors.

| Vector | Weight | Inputs (measured today) | Inputs (baseline — pending connection) |
|---|---|---|---|
| AI | 35% | citation rate, average position, **sentiment (classified from answer text — how AI portrays you)** | — fully measured |
| Performance | 35% | citation share-of-voice vs competitors, Google AI Overview presence, **schema.org coverage (standard SEO hygiene), AI-crawler access, multi-page content citation-worthiness** | — fully measured when the domain is reachable. llms.txt is shown for reference only — Google's 2026 guide states it is not required, so it does not affect the score. |
| Brand | 30% | citation volume across engines, **off-site authority (7 sources AI cites most) + Reddit deep-dive (threads/subreddits/perception on the #1 cited source) + knowledge-graph entity consistency (Wikidata/Wikipedia, public key-free APIs) + on-site E-E-A-T (live crawl)** | — fully measured when the entity resolves; on-site falls back gracefully if the domain is unreachable |

**Site crawl:** when a brand has a website domain, Ozvor fetches the
homepage + robots.txt + llms.txt (8s timeout, 512KB cap, no JS execution, public
pages only) and measures schema.org coverage, llms.txt presence, AI-crawler
access, brand-identity signals, and E-E-A-T signals. If the domain is absent or
unreachable, those inputs fall back to neutral baselines — labelled as such.

Every input is labelled **measured** or **baseline** in the score breakdown UI,
so the number is never a black box.

### Stage 3 — Plan (GEO Content Plan)
**What it does:** Turns the gaps from the audit into a prioritized content plan
(comparison pages, FAQs, case studies, LinkedIn posts) mapped to the buyer
prompts where you're absent.

| Tool | Purpose | Key needed |
|---|---|---|
| Anthropic Claude | Generate the plan + content briefs from your audit data | platform key (included) or your own `ANTHROPIC_API_KEY` (BYOK) |

**Guardrails:** competitor brand names are never injected into content prompts;
no comparative claims without a sourced basis; the model flags gaps rather than
fabricating (architecture constraint GEO-A2).

### Stage 4 — Publish (Organic execution — OrganicPosts)
**What it does:** Drafts the content and (with your approval) publishes to your
owned channels. Draft-and-confirm: nothing is posted automatically.

| Channel | Purpose | Connection needed |
|---|---|---|
| LinkedIn | Publish posts | LinkedIn OAuth (your account) |
| Instagram / Facebook | Publish posts | Meta OAuth (your account) |
| Reddit | Draft community answers | Reddit OAuth — **human-approved posting only**; monitoring gated on a commercial data license |
| Google Business Profile | Publish posts | Google OAuth |
| Your website / CMS | Publish pages | CMS connection or export |

**FTC / disclosure:** AI-drafted community content carries an AI-involvement /
commercial-purpose disclosure step before it can be posted.

### Stage 5 — Monitor (weekly flywheel)
**What it does:** Re-runs the audit weekly (Mondays 06:00 UTC), tracks your
Ozvor AI Visibility Score over time, flags new competitor mentions, lost citations, and
answer drift. This is why it's a subscription — AI answers change constantly.

---

## 2. What customers connect (the connection surface)

In **Account → Connections** customers can connect:

1. **Social accounts (OAuth):** LinkedIn, Instagram, Facebook, Google Business, Reddit.
   We store encrypted OAuth tokens (AES-256-GCM); never your password.
2. **AI provider keys (optional BYOK):** bring your own Anthropic / OpenAI /
   Gemini / Perplexity / SERP keys. If you don't, the platform uses its own keys
   on your behalf (included in the plan).
3. **MCP / tool connectors (roadmap):** connect external tools (analytics, CRM,
   CMS) via MCP for richer signal and publishing.

Each connection row shows: what it powers, whether it's connected, what data it
accesses, and a disconnect button. Disconnecting takes effect immediately.

---

## 3. Keys & connections reference (complete list)

| Env / connection | Used by | Required? | Region note |
|---|---|---|---|
| `ANTHROPIC_API_KEY` / AWS Bedrock | Audit probes, plan, content | Platform-provided; BYOK optional | EU → Bedrock eu-central-1 |
| `OPENAI_API_KEY` | Audit probes (ChatGPT) | Optional | EU pending DPA |
| `GEMINI_API_KEY` | Audit probes (Gemini) | Optional | EU → Vertex EU pending DPA |
| `PERPLEXITY_API_KEY` | Audit probes (Perplexity) | Optional | **EU blocked** until SCCs |
| `SERP_API_KEY` (DataForSEO/SerpAPI) | Google AI Overview capture | Optional | — |
| LinkedIn OAuth | Publish to LinkedIn | For publishing | — |
| Meta OAuth | Publish to IG/Facebook | For publishing | — |
| Reddit OAuth | Draft Reddit answers | For Reddit module | ToS: human-approved only |
| Supabase Auth | Login (magic link) | Required for accounts | — |
| Stripe | Billing | Required for paid plans | BRL/Pix (BR), EUR/USD |

---

## 4. Compliance & safety controls (always on)

- **Provider routing gate:** EU users' probes never go to providers without a
  confirmed EU transfer mechanism (Perplexity blocked; OpenAI/Gemini gated).
- **AI transparency (EU AI Act Art. 50):** every AI-generated draft is labelled.
- **Append-only AI log (GEO-A6):** every AI inference is logged (feature, model,
  input/output hashes, ZDR flag) and cannot be edited or deleted.
- **No autonomous posting:** draft-and-confirm everywhere; Reddit posting is
  human-approved from the client's own account.
- **No scraping LLM web UIs:** only official provider APIs are used.
- **Data residency:** EU users' data + AI inference stay in eu-central-1.
- **LGPD + GDPR + CCPA:** home jurisdiction Brazil (LGPD); customers in EU
  (GDPR) and US (CCPA) covered. DPAs reference all applicable regimes.

---

## 5. Accuracy & honesty principles

1. Every score input is labelled **measured** (live data) or **baseline**
   (placeholder pending a connection). We never present a placeholder as fact.
2. We never guarantee citations or rankings — AI answers are probabilistic. We
   sell measurement, diagnosis, and improvement.
3. Every audit shows the exact prompts asked, engines queried, and sources found.
4. When an engine is excluded (region, missing key), the report says so and why.
