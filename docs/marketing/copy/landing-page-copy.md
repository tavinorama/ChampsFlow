# Landing Page Copy — Organic Posts
> [Superseded — historical draft under the pre-rebrand "Organic Posts" name; the live site (ozvor.com) is the current copy. See current entity state in ropa.md. Marked 2026-07-10, issue #213.]
**Owner**: content-writer | **Date**: 2026-05-11 | **Status**: Draft — pending founder review and VP Marketing approval before publish
**Word count**: ~1,100

> Claim-basis notes appear in [square brackets] for VP Marketing review. Remove all bracketed notes before publishing.

---

## Meta

**Meta title** (54 chars):
`Organic Posts — AI Social Media Scheduling for SMBs`

**Meta description** (140 chars):
`AI drafts your LinkedIn, Instagram, and Facebook posts. You approve every one. Zero data retention. GDPR compliant. Join the waitlist.`

---

## 1. Hero

**H1:**
Post consistently on LinkedIn, Instagram, and Facebook — without writing from scratch.

**Sub-headline:**
Organic Posts uses Anthropic Claude Sonnet to draft your social content. You read it, edit it, and approve it. Nothing reaches your audience without your say-so. And our AI never stores your content or trains on it.

**Primary CTA:**
Button: Join the waitlist
Form field placeholder: Your work email address

**Visual concept:**
Product mockup of the Draft Review screen: a card showing an editable draft text area, a non-dismissable blue pill badge labelled "AI-generated draft," and two equal-weight action buttons — "Discard" on the left and "Approve and Schedule" on the right. No stock photography.

---

## 2. How It Works

**Section heading:** Simple by design.

**Step 1 — Connect**

Connect your LinkedIn page, Instagram account, or Facebook page in about 30 seconds. You choose which platforms to share with Organic Posts, and you can disconnect any of them at any time from your account settings.

**Step 2 — Draft**

Tell Organic Posts what you want to say — a topic, a link, a sentence, anything. Anthropic Claude Sonnet writes a draft for you: the right tone, the right length for the platform, hashtags where they help. Every draft is clearly labelled as AI-generated before you see it.

**Step 3 — Approve and Schedule**

Read the draft. Edit it if you want. When it looks right, approve it and pick a time to publish. That is the only path to your audience. There is no auto-publish setting, and there never will be.

---

## 3. Privacy and AI

**Section heading:** How your data is protected — and how our AI actually works.

**Zero Data Retention**

We use Anthropic Claude Sonnet to generate every draft. Zero Data Retention (ZDR) is a contractual arrangement between Organic Posts and Anthropic that prohibits Anthropic from storing your content after the AI call ends. The moment your draft is returned, your input is gone from Anthropic's systems — not archived, not anonymised, not used to train any model. ZDR applies specifically to the Claude Messages API, which is the endpoint we use for draft generation. [Claim basis: Anthropic API and data retention documentation, platform.claude.com/docs/en/build-with-claude/api-and-data-retention]

**Draft-and-confirm is a design decision, not a toggle**

The AI produces a draft. You read it, edit it, and click "Approve and Schedule." Nothing is published automatically. There is no setting to bypass this step — we have not built one and do not plan to. This is how the product works, not a premium feature. [Claim basis: PRD §C3 and founder posting-model decision record, 2026-05-02]

**EU data residency**

For EU users, AI inference runs on AWS Bedrock in Frankfurt (eu-central-1). Your content does not leave the EU during AI processing. AWS Bedrock does not store your prompts or use them to train models by default. We act as a data processor under GDPR Article 28 — you remain the data controller. You can request deletion of your data at any time. [Claim basis: PRD CI-1; AWS Bedrock data protection documentation, docs.aws.amazon.com/bedrock/latest/userguide/data-protection.html]

**Named model, disclosed every time**

We use Anthropic Claude Sonnet. Not "advanced AI." Not "our proprietary technology." Anthropic Claude Sonnet. Every draft carries a visible "AI-generated draft" badge on the review screen. This satisfies the transparency obligations under EU AI Act Article 50. [Claim basis: PRD §C5 AI Disclosure Badge; EU AI Act Art. 50]

---

## 4. How Organic Posts Compares

**Section heading:** How Organic Posts compares.

| | Buffer | Hootsuite | Later | Predis.ai | Organic Posts |
|---|---|---|---|---|---|
| AI trains on your content | Not disclosed | Not disclosed | Not disclosed | Not disclosed | No — ZDR (US) / Bedrock no-training default (EU) |
| EU data residency for AI | Partial | Partial | Not disclosed | Not disclosed | Yes — AWS Bedrock eu-central-1, at launch |
| Nothing posts without your approval | No | No | No | No | Yes — always, by design |
| Named AI model disclosed | Not disclosed | Not disclosed | Not disclosed | Not disclosed | Yes — Anthropic Claude Sonnet, EU AI Act Art. 50 |

"Not disclosed" means no public documentation confirming that practice was found as of 2026-05-01. VP Legal must verify all competitor rows against current pages before this table goes live. No claim will be upgraded to positive without a verifiable source.

---

## 5. FAQ

**Section heading:** Questions we get asked.

**How much does it cost?**
We are in pre-launch and still finalising pricing. Our plan is a free tier plus paid plans for higher volume. Join the waitlist and you will hear pricing before anyone else — and waitlist members will get early-access terms.

**How do I get beta access?**
Join the waitlist below. We are inviting early users manually, in order of signup. When your spot opens, we will email you directly.

**Which platforms does it support?**
We are launching with LinkedIn, Instagram, and Facebook. X and TikTok are on the roadmap — both require additional work outside the v1 scope. Join the waitlist to hear when they go live.

**What data do you store, and for how long?**
We store your account information (name and email), encrypted OAuth tokens for the social accounts you connect, and the post drafts you create and approve. OAuth tokens are encrypted at rest using AES-256-GCM. We do not store demographic data, follower information, or audience analytics. You can request deletion of all your data at any time from your account settings. Full details will be in the Privacy Policy at launch.

**Does the AI learn from my posts?**
No. For US-based inference, we use Anthropic Claude Sonnet under Anthropic's Zero Data Retention (ZDR) agreement — your content is not stored by Anthropic after the AI call ends and is never used to train any AI model. For EU users, AI inference runs on AWS Bedrock eu-central-1, which does not store your prompts or use them for training by default. Either way, your content disappears from AI systems the moment the draft is returned.

**Can I cancel at any time?**
Yes. No lock-in contracts. You can cancel your subscription, disconnect your social accounts, or request deletion of all your data from your account settings at any time.

**How does EU data residency work?**
When you sign up, we detect your location. If you are in the EU, your AI inference is routed to AWS Bedrock in Frankfurt (eu-central-1). That means the content you submit for drafting — your topics, notes, and draft text — is processed on EU infrastructure and never leaves the EU during AI calls. Your account data is stored in accordance with GDPR Article 28.

**What does Zero Data Retention actually mean?**
ZDR is a contractual arrangement that prohibits Anthropic from storing what you send to the AI after the response is returned. There is no log of your content on Anthropic's servers once your draft is delivered. This is different from most AI tools, where your inputs may be retained and used to improve the underlying model. With ZDR, that does not happen.

---

## 6. Waitlist CTA

**Section heading:** Be first when we launch.

**Sub-heading:**
Organic Posts is in development. Join the waitlist and we will email you when early access opens.

**Form fields:**
- Email address (required) — placeholder: Your work email address
- Your name (optional)
- Team size (optional) — dropdown: Just me / 2–10 people / 11–50 people / 51+ people

**Submit button:** Join the waitlist

**GDPR consent checkbox (unchecked by default — pre-ticking is prohibited):**
I agree to receive product updates and launch news from Organic Posts. I can unsubscribe at any time. [Privacy Policy]

**Below-form reassurance line:**
We email you about Organic Posts only. Unsubscribe in one click.

**CCPA notice (surfaced for US/California-detected users):**
We collect your email to notify you of the product launch. We do not sell your data. [Privacy Policy]

---

## 7. Footer

**Legal links:**
[Terms of Service] · [Privacy Policy] · [Cookie Policy] · [Sub-processors] · [DSR Request] · [Do Not Sell or Share My Personal Information] · [Contact: hello@organicposts.ai]

**Entity line:**
Organic Posts, Lda — Portugal (Sociedade por Quotas in formation, 2026)

**Jurisdiction note:** Serving customers in the EU and United States.

**Social:** [LinkedIn — link when account is created]

---

## A/B Test Variants

### Hero H1 — 3 variants

**Variant A (benefit-forward):**
Post to LinkedIn, Instagram, and Facebook every week — AI drafts it, you approve it.

**Variant B (humanised, control):**
Your AI social media assistant that never posts without asking.

**Variant C (pain-first — recommended for first test):**
Stop staring at a blank caption box. AI drafts. You decide.

### Primary CTA copy — 2 variants

**Variant 1 (neutral, honest):** Join the waitlist

**Variant 2 (aspirational, factually accurate for waitlist mode):** Get early access

### Alternative sub-headline

Organic Posts drafts your LinkedIn, Instagram, and Facebook posts using Anthropic Claude Sonnet. Every draft needs your approval before it goes anywhere — and our AI never stores or trains on your content.

---

> **Pending before publish:**
> - Founder review of entity line and footer contact email
> - VP Legal delivery of Terms, Privacy Policy, Cookie Policy, Sub-processors list, and DSR page (hard blocker — due 2026-05-14)
> - VP Legal verification of all four competitor comparison table rows against current competitor pages
> - Anthropic ZDR addendum confirmation for the US direct-API path (contact Anthropic sales team)
> - Engineering confirmation of hero mockup screenshot availability; illustrated fallback approved if unavailable by 2026-05-17
> - Domain live confirmation: organicposts.ai (acquired 2026-05-11 per brief)
