# Landing Page Brief — Organic Posts
**Owner**: marketing-strategist | **Date**: 2026-05-01 | **Status**: Ready for content-writer
**Hard cap**: 1500 words | **Delivery deadline**: 2026-05-10 (copy final); live by 2026-05-17 (KR2.1)

---

## TL;DR

Single-page waitlist site targeting time-starved SMB owners and solo marketers in EU + US. Lead differentiator locked: "AI that drafts, you decide. Nothing posts without you — and our AI never trains on your content." Plausible Analytics recommended (no cookie banner required under GDPR). Legal copy (Terms, Privacy Policy, Cookie Policy) is a hard blocker for launch — VP Legal must deliver before 2026-05-14. Domain decision required by 2026-05-10.

---

## 1. Hero Section

**Primary H1 (target keyword baked in):**
Post consistently on LinkedIn and Instagram — without writing from scratch.

_Keyword intent: "social media scheduling tool for small business" + "AI social media post generator for small business"_

**Sub-headline:**
Organic Posts drafts your social content with AI. You review, edit, and approve — nothing goes live until you say so. And our AI never trains on your content.

**Waitlist CTA (primary):**
Button label: Join the waitlist
Form field: Email address (single field, minimal friction)

**Visual concept:**
Product mockup of the Draft Review screen (Screen 02 from `docs/04-ux.md`) showing:
- The non-dismissable AI badge ("AI-generated draft")
- Editable draft textarea with placeholder content
- The "Discard" / "Approve & Schedule" action row at equal visual weight

If the screenshot is unavailable by 2026-05-10 (engineering to confirm): use an illustrated card mockup with a blue pill badge and two equal-weight buttons. Do not use a stock photo of a person staring at a laptop.

**A/B test — 3 headline variants (for launch week testing):**
1. "Post to LinkedIn and Instagram every week — AI drafts it, you approve it." (benefit-forward)
2. "Your AI social media assistant that never posts without asking." (control/humanized)
3. "Stop staring at a blank caption box. AI drafts. You decide." (pain-first)

**A/B test — 2 CTA copy variants:**
1. "Join the waitlist" (neutral, honest)
2. "Get early access" (aspirational but factually accurate for waitlist mode)

---

## 2. How It Works — 3 Steps

**Section heading:** Simple by design.

**Step 1 — Connect**
Connect your LinkedIn or Instagram account. Takes 60 seconds. You control which platforms you share and can disconnect any time.

**Step 2 — Draft**
Tell Organic Posts what you want to say. Our AI writes a draft for you — tone, format, platform-appropriate length, all included.

**Step 3 — Approve and Schedule**
Read the draft. Edit it. Approve it. It only goes live when you click publish. Nothing is automatic.

_Design note: three icons from Lucide React (link / sparkles / check-circle). No stock photography. Mobile-first, 375px base._

---

## 3. Privacy and AI Section

**Section heading:** How your data is protected — and how our AI actually works.

**Locked differentiator (must appear verbatim or equivalent):**
"AI that drafts, you decide. Nothing posts without you — and our AI never trains on your content."

**Substantive disclosures (sourced from `docs/04-ux.md` §6 CI-1 and CI-1b):**

- **Zero Data Retention (ZDR):** We use Anthropic Claude Sonnet. Under Anthropic's Zero Data Retention agreement, your content is not stored by Anthropic after the AI call ends and is never used to train AI models. [Link to Anthropic's ZDR documentation — confirm URL before launch]
- **Draft-and-confirm by design:** The AI produces a draft. You read it, edit it, and explicitly approve it before anything reaches LinkedIn or Instagram. There is no auto-publish setting. This is not a feature — it is how the product works.
- **EU data residency option:** For EU users, AI inference runs on AWS Bedrock eu-central-1 (Frankfurt). Your data does not leave the EU during AI processing. (Planned for v1 — note as "available at launch for EU users.")
- **GDPR and CCPA compliance:** We act as a data processor under GDPR Art. 28. You are the data controller. Your data is used only to generate and schedule posts you approve. OAuth tokens are encrypted at rest using AES-256-GCM. You can request deletion at any time.
- **EU AI Act transparency:** We disclose that AI is involved in every draft. Every draft carries a visible AI badge and a link to information about the model. This satisfies EU AI Act Art. 50 transparency obligations.
- **Named LLM:** Anthropic Claude Sonnet. We do not use opaque or unnamed AI models.

**Content-writer note:** Translate the above into plain English paragraphs (3–4 sentences each bullet). Do not use GDPR/CCPA as jargon — explain what each thing means for the user. Reference the DPA modal disclosures from `docs/04-ux.md` §6 CI-1/CI-1b as the authoritative source for what we've committed to in-product; public-facing copy must not contradict it.

---

## 4. Why We Are Different — Comparison Row

**Section heading:** How Organic Posts compares.

| | Buffer | Hootsuite | Later | Predis.ai | Organic Posts |
|---|---|---|---|---|---|
| AI drafts posts | Add-on (paid) | Add-on (paid) | Limited | Yes | Yes — core |
| Confirm before publish | No | No | No | No | Yes — always |
| AI never trains on your content | Not disclosed | Not disclosed | Not disclosed | Not disclosed | Yes (Anthropic ZDR) |
| EU data residency | Partial | Partial | Not disclosed | Not disclosed | Yes (eu-central-1) |
| GDPR + EU AI Act transparency | Generic | Generic | Not disclosed | Not disclosed | Yes — named model, Art. 50 |
| Platforms at launch | Many | Many | Instagram-first | Many | LinkedIn + Instagram |

**Legal note before publishing:** All competitor claims must be verified against current competitor pages and reviewed by VP Legal before this table goes live. "Not disclosed" means no public documentation was found at the time of strategy writing (2026-05-01). Do not change to a positive claim without a verifiable source.

---

## 5. FAQ — 9 Questions

**Section heading:** Questions we get asked.

1. **How much does it cost?** We are in pre-launch and working on pricing. Our plan is to start with a free tier and paid plans for power users. Join the waitlist and you will be the first to know — and the first to get early-access pricing.

2. **How do I get beta access?** Join the waitlist below. We are onboarding early users manually. Waitlist members will be invited in order of signup.

3. **Which platforms does it support?** We are launching with LinkedIn and Instagram. More platforms are planned — follow us or join the waitlist to hear when they go live.

4. **Does the AI learn from my posts?** No. We use Anthropic Claude Sonnet under a Zero Data Retention (ZDR) agreement. Your content is not stored by Anthropic after the AI call completes and is never used to train any AI model.

5. **What is Zero Data Retention?** ZDR is a contractual agreement between us and Anthropic that prohibits Anthropic from storing any content you submit for AI processing. The moment your AI call ends, your content is gone from Anthropic's systems. Your data exists only in Organic Posts' own database, under your control.

6. **Can I cancel at any time?** Yes. There are no lock-in contracts. You can cancel, disconnect your social accounts, or request deletion of all your data at any time from your account settings.

7. **Is my data stored in the EU?** For EU users, AI inference runs on AWS Bedrock in Frankfurt (eu-central-1). Your content does not leave the EU during AI processing. We are GDPR-compliant and act as a data processor under GDPR Art. 28.

8. **Is this GDPR and CCPA compliant?** Yes. We designed for both from the start. GDPR: we are a data processor under Art. 28; you are the controller. CCPA: California users can opt out of data sharing at any time. Full privacy policy available at launch.

9. **Can I use Organic Posts if I have a small team?** Yes. The product is designed for owner-managers and solo marketers at 1–50 person businesses. Multi-account team features are on the roadmap.

---

## 6. Waitlist CTA Section

**Heading:** Be first when we launch.

**Subheading (honest, no fake urgency):** Organic Posts is in development. Join the waitlist and we will email you when early access opens — no spam, unsubscribe any time.

**Form fields:**
- Email address (required)
- First name (optional — label: "Your name (optional)")
- Company size (optional dropdown: Just me / 2–10 people / 11–50 people / 51+ people)

**GDPR consent copy (must appear below Submit button, not pre-ticked):**
Checkbox (unchecked by default): "I agree to receive product updates and launch news from Organic Posts. I can unsubscribe at any time. [Privacy Policy link]"

**Legal basis for processing (EU):** Consent under GDPR Art. 6(1)(a). Recorded at time of submission: email, timestamp, consent version, IP country. Stored in waitlist table. No data shared with third parties. No marketing emails sent without confirmed consent.

**Legal basis for processing (US/California):** Legitimate interest for transactional email (waitlist confirmation); CCPA notice at point of collection: "We collect your email to notify you of product launch. We do not sell your data." [Privacy Policy link]

**CAN-SPAM compliance:** Every email sent to the waitlist must include: sender's physical mailing address, clear "From" name (Organic Posts), honest subject line, one-click unsubscribe link, and unsubscribe honored within 10 business days.

**Honesty constraint:** Do not show a user count unless the count is real. "Join 47 SMBs on the waitlist" is permitted once we have 47 confirmed signups. Do not use synthetic or estimated numbers before then.

---

## 7. Footer

**Required links (all needed before launch — coordinate with VP Legal):**
- Terms of Service
- Privacy Policy
- Cookie Policy
- Contact (email: hello@[domain])
- Status page (link when available)
- "Do Not Sell or Share My Personal Information" (CCPA — Cal. Civ. Code § 1798.135(a))

**Social handles:** Add X and LinkedIn handles when accounts are created. Placeholder until then.

**Jurisdiction note:** "Serving customers in the EU and United States."

---

## 8. Technical and SEO Requirements

**Canonical tag:** `<link rel="canonical" href="https://[domain]/" />`

**hreflang:**
- `<link rel="alternate" hreflang="en-US" href="https://[domain]/" />`
- `<link rel="alternate" hreflang="en-GB" href="https://[domain]/" />`
- `<link rel="alternate" hreflang="x-default" href="https://[domain]/" />`

**JSON-LD SoftwareApplication schema (place in `<head>`):**
```json
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "Organic Posts",
  "applicationCategory": "BusinessApplication",
  "operatingSystem": "Web",
  "description": "AI social media post generator for small business. Draft-and-confirm workflow with zero data retention.",
  "offers": {
    "@type": "Offer",
    "priceCurrency": "USD",
    "availability": "https://schema.org/ComingSoon"
  }
}
```

**JSON-LD FAQPage schema:** Add for the FAQ section. Boosts featured snippet eligibility for FAQ question keywords.

**OG tags:**
- `og:title`: "Organic Posts — AI Social Media Scheduling for Small Business"
- `og:description`: ≤155 chars — "AI drafts your LinkedIn and Instagram posts. You review and approve. Nothing posts without you. Zero data retention. GDPR compliant."
- `og:image`: 1200x630px brand image (to be produced — teal-green #2D8F7C brand palette)
- `og:type`: website
- `twitter:card`: summary_large_image

**Meta description (≤155 chars):**
"AI drafts your LinkedIn and Instagram posts. You review and approve — nothing goes live without you. Zero data retention. GDPR compliant."

**Analytics:** Use Plausible Analytics (no cookie banner required under GDPR; cookieless, GDPR-compliant by design). Do not implement GA4 without VP Legal approval of the Consent Mode v2 configuration and EU-US Standard Contractual Clauses. Plausible script does not require a cookie consent modal, removing a pre-launch compliance risk.

---

## 9. Conversion Analytics

**Primary metric:** Waitlist signups (ties directly to KR2.2: 100 signups)
**Secondary metrics:** Landing page visits (Plausible), scroll depth to CTA section, form start-to-submit rate
**Tool:** Plausible Analytics (self-hosted or cloud; no cookie banner required)
**A/B test tracking:** Use URL parameters (`?v=headline-a`, `?v=headline-b`, `?v=headline-c`) and track via Plausible goal events per variant
**Review cadence:** Weekly — VP Marketing reviews signups vs. KR2.2 target every Monday

---

_Content-writer brief: write all copy sections above. Tone guide in `docs/departments/marketing/strategy.md` Brand Voice section. Hard honesty rules apply — no superlatives, no urgency language without a real deadline, no testimonials until real beta users exist. Submit draft to VP Marketing before finalizing._
