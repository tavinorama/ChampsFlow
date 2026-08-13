# Product spec — AI Audit Stack

> **TL;DR** — A new Ozvor product (founder, 2026-08-13): an audit that reads a
> client's **pains/goals** and recommends the **right stack of AI tools** for
> them. Two delivery forms: (a) **low-ticket, self-serve** — a questionnaire →
> a ranked tool shortlist; (b) **$1,500, done-for-you** — a full AI-stack audit
> **bundled with the GEO audit inside OrganicPosts**, delivered as a report.
> It is the **entry product for the Brazilian (PT-BR) market**. It must have
> **capilaridade**: understand niches/verticals deeply and cover the AI
> landscape completely and freshly. The deliverable follows a fixed 9-section
> structure (below), taken from the founder's own assessment template. The
> discovery agents (`weekly-discovery`, #459/#460) analyze and mature this
> product every week; the founder only receives it MVP-ready.

---

## 1. What it is

From a short intake about the client — business type, primary focus, and their
biggest operational pains — the product returns a prioritized set of AI tools
that reclaim time and money, sequenced into an actionable plan. It is NOT a
generic "top AI tools" list: the value is the **pain → tool mapping per niche**
plus the impact/effort/ROI framing.

## 2. Two delivery forms

| | Low-ticket (self-serve) | $1,500 (done-for-you, inside OrganicPosts) |
|---|---|---|
| Input | Questionnaire (structured answers) | Questionnaire + interview/free-text pains |
| Engine | Rules + weighted scoring over the tool catalog | Same engine + human curation + semantic (free-text) matching |
| Output | 1 tool / short shortlist + light plan | Full 9-section branded report (below) |
| Bundle | Standalone | **Bundled with the GEO audit** — one $1.5k deliverable |
| Role | Market entry / lead magnet up-sell | The OrganicPosts flagship intake |

Both forms **share one engine**: catalog + rules + scoring + semantic fallback.
The report generator differs only in depth and polish.

## 3. Deliverable structure — the 9 sections (from the founder's template)

The founder's `AI Tools Assessment` template defines the report shape exactly.
Every section below maps to data the engine must produce:

1. **Cover** — Prepared for `<client>` · Assessment Date · Business Type · Primary Focus.
2. **Executive Summary** — *Where we are · where we're going*: **The Pain** · **The Outcome** · **Hours you can reclaim every week** · Primary Focus.
3. **Impact–Effort Matrix** — a 2×2 that places each recommendation:
   - **Quick Wins** (high impact, low effort) — *the report focuses here*;
   - **Major Projects** (high impact, high effort) — phase in after the wins;
   - **Fill-Ins** (low impact, low effort) — when time allows;
   - **Ignore These** (low impact, high effort) — not worth the time now.
4. **Quick Wins** — the high-impact / low-effort shortlist, itemized.
5. **Recommended Solutions** — *the tool stack*: **6 tools**, each with **Cost · Setup · Saves** (monthly cost, setup effort, time/impact saved).
6. **Your 4-Day Quick Wins Plan** — Day One / Two / Three / Four, each `Tool · <action>` — start this week.
7. **What Comes After Quick Wins** — the next phase (the Major Projects, sequenced).
8. **Financial Impact** — *the bottom line*: **Monthly Net ROI** · **Weekly Time Returned** · **Total Monthly Tool Cost**.
9. **Your Next Steps** — CTA: **Schedule Your Review Call** (the funnel into the $1.5k / retainer).

> Design language of the template: dark ground (near-#0a0f0d), single orange
> accent, heavy condensed display type, numbered `NN / 09` pagination — aligns
> with the Ozvor brand. The report generator should target this exact 9-section
> deck; the low-ticket web result is a lighter subset (sections 2, 3–5, 8, 9).

## 4. The data model the report implies

Because section 5 needs **Cost · Setup · Saves** per tool and section 8 needs
**ROI = value − cost**, the tool catalog is not a link list — it is structured:

```
tool(
  id, name, url, vendor,
  category,                 -- e.g. writing, support, ops, video, dev
  niches text[],            -- verticals it fits (capilaridade axis)
  pains text[],             -- the pains it addresses (maps to questionnaire)
  monthly_cost_usd,         -- for Total Monthly Tool Cost + ROI
  setup_effort,             -- low/med/high  -> Impact–Effort matrix + Setup
  impact,                   -- low/med/high  -> Impact–Effort matrix
  hours_saved_weekly,       -- -> Weekly Time Returned + ROI value
  description, embedding     -- embedding (pgvector) for free-text pain matching
)
```

`hours_saved_weekly × hourly_rate − monthly_cost` per recommended tool rolls up
to **Monthly Net ROI** and **Weekly Time Returned** — sections 2 and 8 compute
straight from the catalog. This is why the catalog must be structured and fresh
(**capilaridade** = broad + current + niche-aware), not a scraped markdown list.

## 5. Minimal build stack (verified 2026-08-13, all repos checked live)

Ship the low-ticket questionnaire first, on the existing TS/Supabase/BullMQ
stack — no new services, no paid API, no copyleft exposure:

- **Catalog seed** — Kaggle *Ultimate AI Tools Dataset (3,495 entries)* (structured CSV: name, tags, pricing, description → maps ~1:1 to the `tool` table; verify the Kaggle license tab before commercial use) enriched with **`mahseema/awesome-ai-tools`** (5.9k★, **MIT**, redistributable) and **`ghimiresunil/Top-AI-Tools`** (MIT, freshest). Curate down to a PT-BR-relevant subset; layer an Ozvor freshness process (no live API exists for "There's An AI For That" — enrich the base ourselves).
- **Questionnaire** — **`surveyjs/survey-library`** (4.8k★, **MIT**, React-native to Next.js) — JSON-defined survey with scoring + conditional logic; answers become facts.
- **Decision engine** — **`CacheControl/json-rules-engine`** (3.1k★, **ISC**) — rules-as-JSON in the DB → fired events → weighted scoring → ranked shortlist. Non-devs tune recommendations without a deploy.
- **Free-text pain matching** — **`pgvector`** (already in Supabase) + **`huggingface/transformers.js`** (`gte-small`, local, $0/call) — cosine-match messy free-text pains to tool embeddings when rules don't fire (esp. the $1.5k tier).
- **Report generation** — reuse the existing `md-to-pdf` / `anthropic-skills:pdf` pipeline with the Ozvor brand; no new dependency.

> **Honest finding:** no maintained open-source "questionnaire → recommended AI
> tools" product exists to fork (verified across GitHub topic searches). The
> moat is the **curated PT-BR catalog + the rules/weights**, not the engine —
> build on the blocks above; there is no shortcut fork.

## 6. Brazil entry + language

This is the **PT-BR market entry**. Ozvor's rule is English-first for public
content ([[feedback-ozvor-english-first]]), but a national entry surface is a
likely, deliberate exception — the low-ticket questionnaire and the BR-facing
report should probably be **PT-BR**. Flagged for the founder to confirm before
build.

## 7. How the agents analyze it (already wired)

`weekly-discovery` (#459) carries this as a **standing initiative** (#460): every
Thursday the discovery brain hunts market signal for it, must advance it among
its ideas, and matures it toward the MVP-ready spec the founder receives — with
a viability critic that can veto. The CPO (#458) will track it once it produces
real product data. Turning the spec into an MVP stays the founder's call.

---

*Source of the deliverable structure: the founder's `AI Tools Assessment` HTML
template (9-slide deck), read 2026-08-13. Repo facts verified live against the
GitHub API the same day.*
