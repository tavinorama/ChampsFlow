# Ozvor marketing copy standard

## TL;DR
_≤200 words._
- **Goal**: one page defining the founder-approved copy standard for Ozvor marketing pages, so every future edit matches the same voice.
- **Rule**: reading level 15-17 anos — sentences ≤ 12 words, one idea per sentence, active voice, second person ("you"). Banned jargon: leverage, optimize, comprehensive, actionable, prioritized, robust, seamless, cutting-edge. CTAs first-person where natural ("Check my brand — free →"). Sell finished work, not reports ("We write 3 pages for you. Copy, paste, publish."). Loss-aversion nudges where honest ("…or your competitor?"). Product names stay as identifiers (Ozvor AI Visibility Score, Get-Cited Kit, Ozvor Pages, OrganicPosts by Ozvor). Engine list is always "We check: ChatGPT · Claude · Perplexity · Gemini · Google AI Overviews".
- **Never**: introduce "TrustIndex", invent numbers/testimonials/claims, or weaken an honesty/guarantee disclaimer to hit the word-count target — if simplifying would change the meaning, leave the sentence as-is.
- **Exceptions**: legal pages (`/legal/*`, `/privacy-policy`, `/terms-of-service`) and long-form blog assets (`blog/`) are out of scope — they follow their own compliance/editorial voice, not this scannable-CTA standard.
- **Status**: applied 2026-07 across pricing, how-it-works, kit, local-pages, organicposts, agencies, results, book, welcome, resources, how-we-measure.

---

## The rules

1. **Reading level 15-17 anos.** Sentences ≤ 12 words. One idea per sentence. Active voice. Second person ("you", not "the user" or "one").
2. **Banned jargon** (grep before you commit): `leverage`, `optimize` / `optimization` used as generic marketing filler, `comprehensive`, `actionable`, `prioritized` / `prioritised`, `robust`, `seamless`, `cutting-edge`.
   - Exception: proper nouns and paper titles keep their exact wording even if a banned word appears inside them — e.g. **"Generative Engine Optimization (GEO)"** is the literal name of the field this product is about, and **"fluency optimization"** is a named tactic from the cited Princeton/KDD 2024 study. Do not rename these.
3. **CTAs are first-person where natural.** "Check my brand — free →", "Get my Kit — $29 →", "Run my test →". Where a page already has an established, consistent CTA string used in multiple places (e.g. "Get the Kit — $29" appears on the home page, `/learn`, and inside the free-test scorecard), keep the existing convention rather than fragment it — consistency beats the illustrative example.
4. **Sell finished work, not reports.** "We write 3 pages for you. Copy, paste, publish." — not "You will receive a comprehensive report." Say what the team does *for* the reader, not what the reader receives.
5. **Loss-aversion nudges, only if honest.** "…or your competitor?" is fine because it is true and checkable. Never invent urgency (no fake countdowns, no fabricated scarcity).
6. **Product names stay as identifiers, verbatim:** Ozvor AI Visibility Score, Get-Cited Kit, Ozvor Pages, OrganicPosts by Ozvor.
7. **Engine list is always:** "We check: ChatGPT · Claude · Perplexity · Gemini · Google AI Overviews." Use this exact construction (mid-dots, that order) whenever the copy enumerates the five engines as a promotional line. Data-table labels and one-off feature descriptions that reference a single engine (e.g. "Google AI Overview presence") are a different sense and are not forced into this template.
8. **Disclaimers and guarantees are never weakened.** You may split a long disclaimer into shorter sentences (that is simplifying, not weakening), but you may not drop a qualifier, soften a guarantee, or remove a "no guarantee of citation" clause to make a sentence shorter. If a rewrite would change what the sentence promises, leave the original wording.
9. **No "TrustIndex", ever, in any user-facing string, alt text, or data key** (aria-labels, JSON-LD `name`/`description`, anchor `id`s included). No invented numbers, testimonials, or claims.

## Scope

**In scope** for this standard: the acquisition/conversion pages under `apps/web/src/app/(marketing)/` — pricing, how-it-works, kit (+ delivery page), local-pages, organicposts, agencies, results, book, welcome, resources, how-we-measure, and the marketing home/test/vs/learn pages as they're swept.

**Out of scope / different voice on purpose:**
- **Legal pages** (`/legal/*`, `/privacy-policy`, `/terms-of-service`, DPA, cookie policy) — these must stay precise and complete for compliance reasons; do not simplify them against this standard.
- **Blog** (`blog/`) — long-form GEO editorial content and whitepaper-style essays (including the four `/resources/*` deep-dive guides) keep their own narrative voice: citations, academic terminology, and multi-clause explanatory sentences are appropriate there and should not be mechanically chopped into 12-word fragments. Apply this standard to the *conversion* surfaces of those pages (hero, CTA buttons, meta descriptions, upsell "why" copy) and to jargon removal, but leave cited research prose and technical methodology callouts intact.

## Five before → after examples

**1. Jargon removal (how-it-works, Step 03 — "Plan & publish")**
- Before: *"Get a prioritized GEO content plan, then let Content Studio draft the posts, schema and answers that earn the citation."*
- After: *"Get a GEO content plan, ranked by impact. Content Studio drafts the posts, schema, and answers."*
- Why: removes "prioritized" and splits a 20-word sentence into two ≤12-word sentences; "Content Studio drafts" also shifts from a passive-ish construction to selling finished work.

**2. Sell finished work, not reports (pricing, OrganicPosts upsell "why")**
- Before: *"OrganicPosts is the done-with-you summit: a managed GEO project where our team runs discovery, content, cadence, and monitoring — you approve every draft before it goes live."* (26 words)
- After: *"OrganicPosts is the done-with-you summit. Our team runs discovery, content, cadence, and monitoring for you. You approve every draft before it goes live."*
- Why: same facts, three short sentences instead of one run-on; "for you" makes the service framing explicit.

**3. Banned jargon, British spelling included (book, value bullet)**
- Before: *"You leave with a prioritised action plan you can start executing immediately."*
- After: *"You leave with a clear action plan, ranked by impact. You can start today."*
- Why: "prioritised" is the British spelling of the banned word "prioritized" — same fix applies regardless of spelling variant.

**4. Restore the product-name headline (kit delivery funnel)**
- Before (`/kit` h1): *"Get your AI-visibility audit + 3 publish-ready fixes — $29."*
- After: *"The Get-Cited Kit — your audit + 3 fixes, $29."*
- Why: the page's own header comment specified the hero should read "The Get-Cited Kit," and the E2E suite (`tests/e2e/acquisition-ladder.spec.ts`) asserts a heading matching `/Get-Cited Kit/i` — the previous headline had drifted and was failing that assertion pre-sweep. Restoring the product name as an identifier fixed both the copy standard and the test in one edit.

**5. Strengthen an honesty claim while shortening it (agencies, methodology block)**
- Before: *"When an engine can't be measured, the report says so instead of inventing a score."* (one clause inside a 22-word sentence)
- After: *"When an engine can't be measured, the report says so. We never invent a score."*
- Why: splitting the sentence made room to state the "never fabricate" commitment as its own short, standalone sentence — the claim gets *more* prominent, not weaker, which is the correct direction per rule 8.

## Disclaimers left untouched (examples)

- The results page's live-data honesty note ("Rather than show you stale or made-up numbers...") — reworded into two sentences without dropping any qualifier.
- The bottom-of-page non-determinism disclaimer used on `/pricing`, `/organicposts`, and `/results` ("AI answers are non-deterministic and vary by engine, phrasing, and day...") — left verbatim everywhere it appears; it is precise, legally-flavored language and any rewording risked drifting its meaning.
- The Kit's refund guarantee ("We guarantee the deliverable, never AI outcomes...") — split for length but the guarantee/exclusion pair was kept intact word-for-word in meaning.
