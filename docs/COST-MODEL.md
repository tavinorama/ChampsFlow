# TrustIndex AI — Platform API Cost Forecast

> What YOUR (platform) API keys pay for, per the BYOK boundary in
> `docs/CLIENT-JOURNEY-AND-OPERATIONS.md`. Prices are **2026 approximate**
> ($/1M tokens) and move often — treat as order-of-magnitude budgeting, not a
> contract. Verify each provider's current price before relying on it.

## What runs on YOUR key vs the client's
- **Free AI Invisibility Test** → YOUR key (the wedge).
- **First audit / $29 Kit** → YOUR key (you eat the small cost; the $29 / the lead covers it).
- **Client-internal content generation** → CLIENT's BYOK key (once they connect one; falls back to your key otherwise — see `content-studio.ts keyUsed`).

---

## 1. The FREE Invisibility Test — your cost per run

**What it does (verified in code):** 1 buyer prompt × **4 chat engines**
(Anthropic, OpenAI, Gemini, Perplexity), **1 repetition** (`invisibility-test.ts` LIVE_PROVIDERS, repeat=1). SERP/DataForSEO is **not** in the test.

**Token estimate per engine call:** ~50 input tokens (short category prompt +
system) + ~400 output tokens (a recommendation answer).

| Engine | ~$/1M in · out (2026) | Cost / call |
|---|---|---|
| Anthropic (Sonnet-class) | ~$3 · $15 | ~$0.0062 |
| OpenAI (GPT-4o-class) | ~$2.5 · $10 | ~$0.0041 |
| Gemini (Flash-class) | ~$0.3 · $2.5 | ~$0.0010 |
| Perplexity (Sonar + search fee) | ~$1 · $1 + ~$0.005/req | ~$0.0055 |
| **Total per free test** | | **≈ $0.017 (~2 ¢)** |

**Monthly projection (free tests):**
| Tests/month | Your cost |
|---|---|
| 100 | ~$1.70 |
| 1,000 | ~$17 |
| 10,000 | ~$170 |
| 100,000 | ~$1,700 |

→ **~2 cents per free test.** Even at 10k tests/month it's ~$170 — a cheap, bounded wedge.

**Cut it further (50–80% cheaper):** route the free test to the *cheap tier* of
each engine (Claude Haiku, GPT-4o-mini, Gemini Flash) and/or drop to 3 engines
(skip Perplexity's per-request search fee). A Haiku/mini/Flash-only test is
≈ $0.003–0.005 (~half a cent).

---

## 2. The full audit / $29 Kit — your cost per run

**What it does:** ~10 buyer prompts × up to 5 engines × **repeat 3** (live mode)
= up to ~150 chat calls, **+** site crawl (free, your servers) **+** DataForSEO
queries for off-site (7), Reddit, and AI Overview.

| Component | ~Cost |
|---|---|
| LLM probes (~150 calls × ~$0.005 avg) | ~$0.50–$1.50 |
| DataForSEO queries (~10 × ~$0.01–0.05) | ~$0.10–$0.50 |
| **Total per full audit** | **≈ $0.60–$2.00** |

→ The **$29 Kit** has a **~15–50× margin** over its API cost. The **monthly
subscription** (Growth €99) easily covers weekly re-audits. This is exactly why
the free test is bounded (2¢) and the deep work is paid.

**Controls that bound this:** `prompts_per_audit` plan limit (50/250 — *not yet
enforced; see CLIENT-JOURNEY gaps*), `GEO_PROBE_REPEAT` (3 live), and the
routing gate (EU drops Perplexity).

---

## 3. Budgeting rules of thumb
- **Free tests are ~2¢ each** → marketing cost, not a scaling risk. Budget ~$20/mo for the first ~1k tests.
- **Each full audit is ~$1** → keep it behind the $29 Kit / a paid plan, OR require the client's BYOK key for heavy/ongoing audits.
- **Content generation** → push to the **client's BYOK key** (already wired) so open-ended generation never hits your bill.
- Set a **monthly spend cap / alert** on each provider's console; start every engine on its cheap tier and upgrade per-vector only where accuracy matters (the AI vector).

---

## 4. Where to tune in code
- Free-test engines/tier: `packages/llm/src/invisibility-test.ts` (`LIVE_PROVIDERS`).
- Audit breadth/repeat: `apps/worker/src/jobs/audit-run.ts` (`REQUESTED_PROVIDERS`, `GEO_PROBE_REPEAT`).
- Model per provider: each adapter reads `*_MODEL` env (e.g. `ANTHROPIC_MODEL`) — set these to the cheap tiers to cut cost.
- BYOK boundary: `content-studio.ts` (`generateContent` `keyUsed`) + `resolveProviderKey` in `routes/system.ts`.
