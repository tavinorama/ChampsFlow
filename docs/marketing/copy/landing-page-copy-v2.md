# Landing Page Copy v2 — Organic Posts (GEO-First Pivot)
> [Superseded — historical draft under the pre-rebrand "Organic Posts" name; the live site (ozvor.com) is the current copy. See current entity state in ropa.md. Marked 2026-07-10, issue #213.]
**Owner**: content-writer | **Date**: 2026-05-11 | **Status**: Draft — pending founder review and VP Marketing approval before publish
**Word count**: ~1,520
**Version**: v2 — GEO-first positioning pivot (replaces landing-page-copy.md)

> Claim-basis notes appear in [square brackets] for VP Marketing review. Remove all bracketed notes before publishing.

---

## Meta

**Meta title** (57 chars):
`Organic Posts — Be Found in ChatGPT and AI Search`

**Meta description** (153 chars):
`When your customer asks ChatGPT for a recommendation, be the answer. Organic Posts drafts your social content for GEO visibility. You approve every post.`

---

## 1. Hero

**H1:**
When your customer asks ChatGPT, be the answer.

**Sub-headline:**
Search is moving. Gartner predicts traditional search engine volume will drop 25% by 2026 as customers shift to ChatGPT, Claude, Perplexity, and Gemini for recommendations. [Claim basis: Gartner press release, February 2024, gartner.com] The businesses those AIs cite are the ones posting consistently on LinkedIn, Instagram, and Facebook. Organic Posts drafts that content for you. You approve every post in about five minutes. The AIs see you exist.

**Primary CTA:**
Button: Join the waitlist — founding member pricing
Form field placeholder: Your work email address

**Visual concept:**
Product mockup of the Draft Review screen: a card showing an editable draft text area, a non-dismissable blue pill badge labelled "AI-generated draft," and two equal-weight action buttons — "Discard" on the left and "Approve and Schedule" on the right. No stock photography.

---

## 2. The Shift

**Section heading:** Search moved. Most businesses haven't noticed yet.

Your customers used to type into Google. Now a growing number type into ChatGPT, ask Claude, or search on Perplexity. ChatGPT alone reached 200 million weekly active users by August 2024 — a figure that has since grown substantially. [Claim basis: OpenAI announcement via Axios, August 2024] Perplexity crossed 15 million monthly active users within two years of launch. [Claim basis: Backlinko Perplexity statistics, citing Perplexity data through early 2024] When those users ask "best accountant for freelancers in Berlin" or "which social media tool should I use for my restaurant," the AI answers with names.

Those names come from somewhere. Research published at KDD 2024 by Princeton, Georgia Tech, and the Allen Institute for AI introduced the term Generative Engine Optimization (GEO) — defined as the practice of structuring content so that large language models cite it in their answers. The same study found that applying GEO techniques can boost a source's visibility in AI-generated responses by up to 40%. [Claim basis: Aggarwal et al., "GEO: Generative Engine Optimization," KDD 2024, arxiv.org/abs/2311.09735]

The businesses getting cited are posting consistently on LinkedIn and other platforms. A 2025 Semrush study of 89,000 LinkedIn URLs found LinkedIn is the second most-cited source in AI search overall and the top cited source for professional queries. [Claim basis: Semrush blog, "We Analyzed 89K LinkedIn URLs Cited in AI Search," semrush.com] Posting consistently is the input. Being cited is the output. Organic Posts handles the consistency.

---

## 3. How It Works

**Section heading:** Three steps. Five minutes. Consistent presence.

**Step 1 — Connect**
Connect your LinkedIn page, Instagram account, or Facebook page in about 30 seconds. You choose which platforms to share with Organic Posts, and you can disconnect any of them at any time from your account settings.

**Step 2 — Draft**
Tell Organic Posts what you want to say — a topic, a link, a sentence, anything. Anthropic Claude Sonnet writes a draft for you: the right tone, the right length for the platform, hashtags where they help. Every draft is clearly labelled as AI-generated before you see it. The content is shaped to be specific, structured, and useful — the qualities the Princeton GEO research identifies as most likely to earn citations.

**Step 3 — Approve and Schedule**
Read the draft. Edit it if you want. When it looks right, approve it and pick a time to publish. That is the only path to your audience. There is no auto-publish setting, and there never will be.

---

## 4. Why Consistency Is the GEO Moat

**Section heading:** You don't need to go viral. You need to keep showing up.

A BrightEdge survey of more than 750 search, content, and digital marketers found that 68% of organisations are actively changing their strategies to account for AI search. [Claim basis: BrightEdge press release, "BrightEdge Survey Reveals 68% of Marketers Are Embracing AI Search Shift," brightedge.com] The businesses that will benefit are the ones building a consistent body of specific, useful content — not the ones who posted twice in January and nothing since.

The GEO research is clear on what gets cited: structured content, data-backed claims, a consistent publishing cadence, and specificity over generality. None of that requires a large marketing team. It requires showing up regularly with something genuinely useful to say.

Organic Posts reduces the friction of showing up. The AI drafts the post. You review it. It goes live on your schedule. Over weeks and months, that consistency becomes a signal that AI systems can find and cite.

---

## 5. Privacy and AI

**Section heading:** How your data is protected — and how our AI actually works.

**Zero Data Retention**
We use Anthropic Claude Sonnet to generate every draft. Zero Data Retention (ZDR) is a contractual arrangement between Organic Posts and Anthropic that prohibits Anthropic from storing your content after the AI call ends. The moment your draft is returned, your input is gone from Anthropic's systems — not archived, not anonymised, not used to train any model. ZDR applies specifically to the Claude Messages API, which is the endpoint we use for draft generation. [Claim basis: Anthropic API and data retention documentation, platform.openai.com equivalent at platform.claude.com]

**Draft-and-confirm is a design decision, not a toggle**
The AI produces a draft. You read it, edit it, and click "Approve and Schedule." Nothing is published automatically. There is no setting to bypass this step — we have not built one and do not plan to. This is how the product works, not a premium feature.

**EU data residency**
For EU users, AI inference runs on AWS Bedrock in Frankfurt (eu-central-1). Your content does not leave the EU during AI processing. AWS Bedrock does not store your prompts or use them to train models by default. We act as a data processor under GDPR Article 28 — you remain the data controller. [Claim basis: PRD CI-1; AWS Bedrock data protection documentation]

---

## 6. How Organic Posts Compares

**Section heading:** How Organic Posts compares.

| | Buffer | Hootsuite | Later | Predis.ai | Organic Posts |
|---|---|---|---|---|---|
| Content drafted for LLM visibility (GEO) | No | No | No | No | Yes — structured, specific drafts shaped for AI citation |
| Privacy / AI training (Zero Data Retention) | Not disclosed | Not disclosed | Not disclosed | Not disclosed | Yes — ZDR (US) / Bedrock no-training default (EU) |
| EU data residency for AI inference | Partial | Partial | Not disclosed | Not disclosed | Yes — AWS Bedrock eu-central-1 at launch |
| Draft-and-confirm (no autonomous posting) | No | No | No | No | Yes — always, by design |
| AI disclosure transparency (EU AI Act Art. 50) | Not disclosed | Not disclosed | Not disclosed | Not disclosed | Yes — named model, visible badge on every draft |

"Not disclosed" means no public documentation confirming that practice was found as of 2026-05-11. VP Legal must verify all competitor rows against current pages before this table goes live. No claim will be upgraded to positive without a verifiable source.

---

## 7. Founding Member Offer

**Section heading:** First 100 members. For-life pricing. Personal onboarding.

We are in pre-launch. The first 100 people who join the waitlist and convert at launch will receive founding member pricing — locked for the life of their account, regardless of how our public pricing changes after that.

Solo plan: €29 per month, for life.
Agency plan: €79 per month, for life.

Founding members also receive personal onboarding from the founder, a copy of the GEO Visibility Guide, access to the LLM Citation Tracker template, and a set of five ready-to-use post templates designed around the Princeton GEO research.

When the founding member cohort fills — the pricing reverts to standard public rates. No countdown timer. No fake scarcity. When it is gone, it is gone.

If you sign up and the product is not what we said it would be, we offer a 30-day money-back guarantee. No forms, no friction — email us and we refund.

---

## 8. Pricing

**Section heading:** Simple plans. Founding member rates locked for life.

**Solo — €29 / month**
1 workspace · LinkedIn + Instagram + Facebook · 30 AI-drafted posts per month
Includes: GEO Visibility Guide · LLM Citation Tracker template · 5 post templates
Annual billing: 20% discount (€278/year)

**Agency — €79 / month**
Up to 5 workspaces · LinkedIn + Instagram + Facebook · Unlimited posts
Includes: everything in Solo · Priority support
Annual billing: 20% discount (€758/year)

Founding member rates are for the first 100 waitlist members who convert at launch. Public pricing after that may differ. 30-day money-back guarantee applies to all plans.

---

## 9. FAQ

**Section heading:** Questions we get asked.

**How does showing up in ChatGPT actually work?**
ChatGPT, Claude, Perplexity, and Gemini generate answers by drawing on content they have indexed or can retrieve in real time. Platforms like LinkedIn are heavily indexed by AI systems — Semrush's analysis of 89,000 LinkedIn URLs found it is the second most-cited source in AI search overall. When you post consistently on LinkedIn with specific, structured, useful content, you increase the probability that those systems have something to find and cite when a relevant query comes in. There is no guaranteed path to citation — but consistent, quality posting is the best-documented input.

**Is GEO real or marketing hype?**
Generative Engine Optimization is a legitimate emerging field, not a marketing invention. The term was formally defined in a paper by researchers at Princeton, Georgia Tech, and the Allen Institute for AI, published at KDD 2024 — one of the most competitive academic venues in data science. The paper demonstrated up to 40% improvements in AI citation visibility through structured content techniques. It is an early field, and not every claim made under the "GEO" banner is well-founded. We will tell you what is substantiated and what is not.

**How long until I appear in LLM answers?**
There is no fixed timeline. Based on the GEO research and observed patterns in how AI systems refresh their training and retrieval data, consistent posting over 4–8 weeks is a reasonable starting point for building the content base AI systems can draw on. Individual citation frequency will vary by niche, competition, and the specificity of your content.

**Can you guarantee my business will be cited?**
No, and anyone who tells you they can guarantee AI citations is overstating what the research supports. What GEO research shows is that certain content types — specific, structured, data-backed, consistently published — are cited more frequently than vague or irregular content. We give you the tools to produce that kind of content at scale. The AI systems make their own decisions about what to cite.

**How much does it cost?**
Solo plan: €29 per month. Agency plan: €79 per month. Founding member pricing is locked for life for the first 100 waitlist members who convert at launch. Annual billing saves 20%. 30-day money-back guarantee on all plans.

**How do I get beta access?**
Join the waitlist below. We are inviting early users manually, in order of signup. When your spot opens, we will email you directly with a personal onboarding from the founder.

**Which platforms does it support?**
We are launching with LinkedIn, Instagram, and Facebook. X and TikTok are on the roadmap — both require additional work outside the v1 scope. Join the waitlist to hear when they go live.

**What data do you store, and for how long?**
We store your account information (name and email), encrypted OAuth tokens for the social accounts you connect, and the post drafts you create and approve. OAuth tokens are encrypted at rest using AES-256-GCM. We do not store demographic data, follower information, or audience analytics. You can request deletion of all your data at any time. Full details in the Privacy Policy.

**Does the AI learn from my posts?**
No. For US-based inference, we use Anthropic Claude Sonnet under Anthropic's Zero Data Retention agreement — your content is not stored by Anthropic after the AI call ends and is never used to train any AI model. For EU users, AI inference runs on AWS Bedrock eu-central-1, which does not store your prompts or use them for training by default. Either way, your content disappears from AI systems the moment the draft is returned.

**Can I cancel at any time?**
Yes. No lock-in contracts. You can cancel your subscription, disconnect your social accounts, or request deletion of all your data from your account settings at any time. Cancellation takes effect at end of billing period.

---

## 10. Waitlist CTA

**Section heading:** Join the waitlist.

**Sub-heading:**
Organic Posts is in pre-launch. Join the waitlist to secure founding member pricing — and be among the first to build your GEO presence before your competitors do.

**Form fields:**
- Email address (required) — placeholder: Your work email address
- Your name (optional)
- Team size (optional) — dropdown: Just me / 2–10 people / 11–50 people / 51+ people

**Submit button:** Join the waitlist — founding member pricing

**GDPR consent checkbox (unchecked by default — pre-ticking is prohibited):**
I agree to receive product updates and launch news from Organic Posts. I can unsubscribe at any time. [Privacy Policy]

**Below-form reassurance line:**
We email you about Organic Posts only. Unsubscribe in one click. 30-day money-back guarantee at launch.

**CCPA notice (surfaced for US/California-detected users):**
We collect your email to notify you of the product launch. We do not sell your data. [Privacy Policy]

---

## 11. Footer

**Legal links:**
[Terms of Service] · [Privacy Policy] · [Cookie Policy] · [Sub-processors] · [DSR Request] · [Do Not Sell or Share My Personal Information] · [Contact: hello@organicposts.ai]

**Entity line:**
Organic Posts, Lda — Portugal (Sociedade por Quotas in formation, 2026)

**Jurisdiction note:** Serving customers in the EU and United States.

**Social:** [LinkedIn — link when account is created]

---

## A/B Test Variants

### Hero H1 — 3 variants

**Variant A (control — GEO-first):**
When your customer asks ChatGPT, be the answer.

**Variant B (outcome-forward):**
Your business, cited by ChatGPT. Start with consistent LinkedIn posts.

**Variant C (pain-first):**
Your competitors are showing up in ChatGPT answers. You're not — yet.

### Primary CTA copy — 2 variants

**Variant 1 (neutral, honest):** Join the waitlist — founding member pricing

**Variant 2 (benefit-forward):** Secure your founding member spot

### Alternative sub-headline

The way customers find businesses is changing. ChatGPT, Claude, and Perplexity now answer recommendation queries directly — and they cite the businesses that publish consistently on LinkedIn, Instagram, and Facebook. Organic Posts handles the drafting. You approve in five minutes. Founding member pricing for the first 100.

---

> **Pending before publish:**
> - Founder review of founding member offer terms and pricing (€29 / €79 confirmed per brief)
> - Founder review of 30-day money-back guarantee language and scope
> - VP Legal delivery of Terms, Privacy Policy, Cookie Policy, Sub-processors list, and DSR page (hard blocker — due 2026-05-14)
> - VP Legal verification of all five competitor comparison table rows against current competitor pages (especially the GEO row — this is a new claim)
> - Anthropic ZDR addendum confirmation for the US direct-API path
> - Engineering confirmation of hero mockup screenshot availability
> - Domain live confirmation: organicposts.ai
> - "Founding member cohort" cap mechanism — engineering must confirm how the 100-member cap is enforced and displayed
