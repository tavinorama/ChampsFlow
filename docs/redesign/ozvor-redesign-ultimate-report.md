# Ozvor Rebrand + Redesign — Ultimate Pre-Build Report

> **Status:** ANALYSIS ONLY — no code changed yet (per the founder's instruction: full report before any modification). Captured 2026-06-26 from `Redesign do site OrganicPosts.zip` (Claude Design export).
>
> **[Superseded in part — 2026-07-10 (issue #213):]** this report's instruction to *keep* the metric name "TrustIndex AI Score" was **overridden by the founder on 2026-06-27** — the score is now the **"Ozvor AI Visibility Score"** (split into 3 scores: Visibility / Citation Readiness / Execution), and "TrustIndex" must never be reintroduced in user-facing display. Current entity state: see `docs/compliance/ropa.md`. Preserved unedited below as a dated historical analysis.

---

## 0. TL;DR (≤200 words)
The package is a **single-file Claude Design mockup** (`TrustIndex AI Redesign.dc.html`, 128 KB SPA) + a 24 KB `DESIGN_HANDOFF.md` + `assets/atmosphere.png` (the fixed background) + a screenshot + `support.js` (editor runtime — **discard**). It defines a **rebrand to Ozvor** (parent platform brand, ozvor.com) and a **dark-first, atmospheric redesign** evolving the green brand. **Rename only the company/platform → Ozvor.** Keep **"TrustIndex AI Score"** (the metric) and **"OrganicPosts"** (consultancy). New: monochrome **"O-ring" logo**, fonts **Schibsted Grotesk + JetBrains Mono**, full dark/light token sets on a **`.ti-root`** scope (default **dark**), a fixed **atmosphere** layer, the **upsell-ladder** home centerpiece, and a **new `/learn` (Tutorials) hub**. Our Next.js SSR stack, page set, scorecard/CSS-charts, free test, pricing+comparison, blog and dark-mode all **already exist** — so this is mostly a **re-skin + rename + a few new surfaces**, not a rebuild. Biggest efforts: brand/domain swap everywhere, the whole token/font/atmosphere system, re-theming the **dashboards + free test + results + kit** (mandatory), `/learn`, expanded free-test fields, and new **imagery/OG/logo assets**. Detailed compat/gaps + a phased plan below.

---

## 1. Package inventory
| File | Size | What it is | Use |
|---|---|---|---|
| `DESIGN_HANDOFF.md` | 24 KB | The authoritative brief (tokens, copy, page specs, rules) | **Source of truth** |
| `TrustIndex AI Redesign.dc.html` | 128 KB | Self-contained mockup SPA (all pages via `go('…')` JS router, inline styles) | Visual reference for spacing/color/copy — **do NOT ship the SPA** |
| `Mobile Preview.html` | 4 KB | Mobile frame wrapper | reference |
| `assets/atmosphere.png` | 372 KB | 1920×1200 transparent data-constellation backdrop | **Ship as the fixed atmosphere** |
| `uploads/screenshot-…png` | 572 KB | Screenshot (old site reference) | reference only |
| `support.js` | 60 KB | Claude Design editor runtime | **Discard** (not production) |

Routes present in the mockup: `home · how-it-works · results · organicposts · free(=/test) · kit · pricing · blog · learn` (+ in-app `article` reader).

---

## 2. Brand architecture (the rename rule — read carefully)
- **Ozvor** = parent **company + platform** brand → owns nav wordmark, footer, domain (**ozvor.com**), copyright, emails. Reason: avoid conflict with trustindex.io.
- **TrustIndex AI** = sub-brand = the **audit + scoring product**. The metric stays **"TrustIndex AI Score"** (AI × Brand × Performance). **Do NOT rename the score.**
- **OrganicPosts** = sub-brand = the done-with-you **consultancy**. **Do NOT rename.**
- **North star:** one upsell ladder — Free → Kit $29 → Plans (Growth/Agency) → **OrganicPosts** (summit). First three = "you do it"; OrganicPosts = "we do it with you."

**Implication:** a blanket find-replace of "TrustIndex AI" → "Ozvor" is **WRONG**. It must be surgical: platform/company name → Ozvor; keep "TrustIndex AI Score" and "OrganicPosts".

---

## 3. Design system — new vs current
| Dimension | New (Ozvor) | Current (repo) | Action |
|---|---|---|---|
| **Default theme** | **Dark-first** (cream light theme available) | Light-first warm cream (dark via toggle/OS) | Flip default to dark; keep light |
| **Theme scope** | CSS vars on **`.ti-root`** class; persist `ti-theme` in localStorage | vars on `:root` + `html[data-theme]` + `prefers-color-scheme`; persists `op-theme` | Re-scope to `.ti-root`; migrate key |
| **Canvas** | dark `#0a0f0d` / light `#f3f1e8` | `#FCFAF5` | New tokens |
| **Primary** | Emerald `#27c98a` (grad `→#0c7d54`) | Green `#0A7E5A` | Shift to emerald set |
| **Gold accent** | `#e6a93f` (OrganicPosts/Agency/Kit) | amber `#E0982F` | Adopt gold semantics |
| **Danger** | `#f0584e` | `#dc2626` | New |
| **Fonts** | Schibsted Grotesk (display/body) + JetBrains Mono (labels/metrics) | Geist Sans | Swap fonts globally |
| **Logo** | Monochrome **"O-ring"** (3 arcs + center dot, 32×32, `currentColor`) + wordmark "Ozvor" 600 | Green tile + 3 bars + amber spark + "TrustIndex AI" | **Replace Logo component** |
| **Atmosphere** | Fixed auroras + `atmosphere.png` (screen/dark, multiply/light), translucent sections | none (solid surfaces) | **New global layer** |
| **Charts** | CSS conic gauges + flex bars (live DOM) | Already CSS/SVG (TrustIndexScorecard, ScoreTrend) | ✅ compatible — re-skin |

Full token sets (dark + light) are captured in the handoff §1/§6 and the mockup `<style>`; I have both extracted.

---

## 4. Page-by-page: compatibility / gaps
✅ exists & compatible · ⚠️ exists, needs rework · ➕ new

| Page | Status | Notes |
|---|---|---|
| Home `/` | ⚠️ | Exists. Needs: dark atmosphere, **the ladder centerpiece** (emerald→gold connector → OrganicPosts summit), engines strip, stats (900M/2.5B/+35%/1B/25%+), "search moved", "building in public", FAQ, dashboard mock — re-skin + add ladder |
| How it works `/how-it-works` | ⚠️ | Exists. Add the **4th gold step "Monitor — or hand it to us" → OrganicPosts** + "what your score is made of" |
| Results `/results` | ⚠️ | Exists. New: 8-week trend bars + citation-by-engine + **"No fabricated testimonials"** reserved slots |
| OrganicPosts `/organicposts` | ⚠️ | Exists. New: **gold theme**, 4-step engagement, **DIY-vs-done-with-you decision aid**, hero image |
| Free test `/test` | ⚠️ | Exists. New fields: **up to 3 competitors**, **Sector** + **Country** selects, buyer question, email (already required). 2-col: form + sample scorecard |
| Kit `/kit` | ⚠️ | Exists. 3 deliverable cards + single $29 card + bridge-to-Growth |
| Plans `/pricing` | ⚠️ | Exists (plans + comparison + founder band). Re-skin to gold founder band + emerald "Most popular" Growth |
| Blog `/blog` + reader | ⚠️ | Exists. Handoff ships **8 dated articles + reader + Sources lists**; align to our posts.ts/CMS |
| **Tutorials `/learn`** | ➕ | **New hub** — 6-step getting-started path (video + written guide each) + nav item + Blog↔Learn cross-link |
| Dashboard `/dashboard`, `/brands/[id]` | ⚠️ | **MANDATORY re-skin** to new tokens/atmosphere/fonts (scorecard, vectors, trend, sources, models, prompts) |
| Admin `/admin` | ⚠️ | Re-skin to new tokens |
| Login `/login` | ⚠️ | Re-skin (social login + magic link) to dark |
| Account/billing | ⚠️ | Re-skin |
| Legal (8 pages) | ⚠️ | Re-skin + **rebrand copy** (Ozvor + ozvor.com + entity) |
| how-we-measure | ⚠️ | Re-skin |

---

## 5. Functionality map (design ↔ existing engine)
- **Audit / 3-vector score** — exists (packages/llm scoring; TrustIndexScorecard). Design keeps it. ✅
- **Multi-engine probing (5 engines)** — exists. Engines strip is just presentation. ✅
- **Free test** — exists; needs field expansion (3 competitors, Sector, Country) → small backend tweak to accept them (today: 1 competitor + category + region). ⚠️
- **Upsell ladder** — partially (pricing/kit/SoftCTA). Needs the visual ladder + OrganicPosts summit. ➕
- **Choose AI Models + frequency, Find Key Sources, prompt library, CSV export, multi-line trend** — all shipped this cycle; just re-skin. ✅
- **OrganicPosts handoff/intake** — exists (DoneForYou + engagement pipeline). Re-skin + decision aid. ⚠️
- **Blog reader + Sources** — partially; align content. ⚠️
- **/learn tutorials** — none. ➕ (needs page + video hosting + guide articles)
- **Theme toggle** — exists (ThemeToggle) but different scope/default/key. ⚠️

---

## 6. Cross-cutting (brand/domain/infra) — beyond the UI
1. **Brand strings** — replace platform "TrustIndex AI" → **Ozvor** in: nav/footer, page copy, metadata `<title>`/OG, `EMAIL_FROM`, auth emails, nurture emails, result email, legal pages, Stripe product names, PDFs/deliverables, brand kit. **Keep** "TrustIndex AI Score" + "OrganicPosts".
2. **Domain** — trustindexai.com → **ozvor.com**: canonical/OG URLs, `WEB_ORIGIN`, Supabase redirect allowlist, sitemap/robots, email `from`/links, Stripe URLs, DNS. (Founder-side: register/point ozvor.com + email @ozvor.com.)
3. **Emails** — Resend templates + Supabase auth emails → Ozvor branding + ozvor.com links.
4. **Stripe** — product display names ("TrustIndex AI …") → Ozvor; prices/IDs unchanged. (I can rename via MCP once approved.)
5. **Legal/compliance** — entity references, ROPA/DPIA mention the brand; update to Ozvor (CNPJ/entity unchanged). Privacy/ToS/DPA copy.
6. **Logo/favicon/OG assets** — new Ozvor monochrome mark → favicon.ico, apple-touch-icon, og-default.png.
7. **SEO** — per the handoff §"Rendering & crawlability": keep SSR (we do), real `<a href>` (we do), robots allows AI crawlers (we do), schema (Organization/Product/FAQ/Article/Breadcrumb), unique titles, OG.

---

## 7. Images / assets needed (founder asked: create where missing)
**I can generate (code/SVG, on-brand):**
- ✅ Ozvor **O-ring logo** as a reusable monochrome SVG React component (+ favicon/apple-touch/OG derived).
- ✅ **OG share images** per page (SVG→PNG, branded).
- ✅ **Abstract blog covers** (8) in the new dark/emerald style (SVG/gradient, not photos).
- ✅ **Atmosphere** is provided (`atmosphere.png`); I can also generate light-theme/derived variants.
- ✅ **Dashboard captures** — by screenshotting the real re-skinned dashboard (after build).

**I CANNOT generate (need real assets from you):**
- ❌ **Real photography** — OrganicPosts hero (founder/team working session), real people. I'll use branded abstract placeholders with proper aspect boxes until you supply photos.

---

## 8. Risks & notes
- **Scale:** ~20 web surfaces + dashboard + admin + free test + results + kit must adopt the new system. Safest as a **theming layer** (new `.ti-root` token set + global atmosphere + font swap) applied once, then per-page composition tweaks — rather than rewriting each page from the mockup's inline styles.
- **Don't ship the mockup SPA** (JS `go()` router, inline styles, `support.js`) — port the *design* onto our SSR routes/components.
- **Surgical rename** (don't break "TrustIndex AI Score" / "OrganicPosts").
- **Theme migration:** moving from `html[data-theme]`+`prefers-color-scheme` (light default) to `.ti-root`+`ti-theme` (dark default) touches the existing ThemeToggle, tokens.css, and the dark-mode "fog" fix — must be done coherently so we don't regress contrast.
- **Verification gap:** this sandbox's preview doesn't hydrate client-component pages (dashboard/test/login) — visual QA of those will rely on build + the founder checking the deployed site.
- **Domain/email are founder-side** (register ozvor.com, DNS, email) — code can be ready + flipped via env.

---

## 9. Recommended phased plan (after approval)
1. **Foundation** — new `tokens.css` (dark-first `.ti-root` + light set), Schibsted/JetBrains fonts, global **atmosphere** layer, **Ozvor logo** component, theme toggle re-scope. (One PR — everything inherits it.)
2. **Brand/domain swap** — surgical rename to Ozvor across copy/metadata/emails/legal; env + canonical to ozvor.com; favicon/OG. (One PR.)
3. **Marketing pages** re-skin + the **ladder** + engines/stats/"search moved"/building-in-public + OrganicPosts (gold + decision aid) + Kit + Pricing + Results + Home.
4. **Product surfaces** (MANDATORY) — dashboard, `/brands/[id]`, **free test (+ new fields)**, results, kit deliverables, admin, login, billing.
5. **New `/learn` Tutorials hub** + nav + cross-links.
6. **Blog** alignment (8 articles + reader + Sources) + **images/OG** generation.
7. **Stripe/email rename via MCP**, deliverables/PDF rebrand, final QA + deploy.

---

## 10. Decisions I need from you before building
1. **Domain/email timing** — build Ozvor branding now but keep serving on the Railway URL until ozvor.com DNS is ready? (Recommended: yes — flip `WEB_ORIGIN`/canonical when DNS resolves.)
2. **Default theme = dark** site-wide (incl. dashboard/admin), with the light toggle? (Handoff says dark-first — confirm.)
3. **Stripe product rename** to Ozvor now, or after launch? (IDs/prices stay; only display names.)
4. **Photography** — supply real OrganicPosts/team photos, or ship branded abstract placeholders for now?
5. **Scope/sequence** — proceed with the 7-phase plan in order, or prioritize a subset first (e.g., foundation + home + dashboards + free test)?
