# Ozvor — Launch Support Macros & SLA

> Owner: VP CX · Created: 2026-07-08 · Status: ACTIVE (launch week) · Closes #161
> Support inbox: **support@ozvor.com** · Escalation: founder (Otavio)

## TL;DR

Five ready-to-send reply macros for the top launch-week issues, plus the support
route + SLA + escalation rules. Tone: plain, honest, fast. **Never promise AI
behavior or a citation/ranking** — we guarantee the *deliverable* (the Kit drafts)
and offer the documented refund, nothing more. Refunds and any billing action are
**founder-gated** (agents draft; the founder executes in Stripe). Fill
`[bracketed]` fields before sending.

---

## Support route & SLA

| Item | Value |
|---|---|
| Primary inbox | **support@ozvor.com** (surfaced on `/welcome`; add to footer per #162) |
| First response target | **< 4 business hours** during launch week |
| Resolution target | < 24h for access/delivery; longer items acknowledged with an ETA |
| Refund / billing | **Founder-gated** — draft the reply, route the actual refund/cancel to Otavio (Stripe) |
| Bug triage | Reproduce → open a GitHub issue with steps → link the customer to it |
| Escalation | Anything legal/DSR → `dpo@`/legal; payment disputes → founder immediately |

**Golden rules:** (1) real audits or fail honestly — never invent a score or a
citation to placate; (2) confirm identity by the purchase email before sharing a
Kit/account; (3) no promise of AI outcomes; (4) log every ticket in the CX tool.

---

## Macro 1 — "My Kit is missing / didn't arrive"

> Subject: Your Get-Cited Kit
>
> Hi [name] — sorry your Kit didn't land. Two fast fixes:
>
> 1. Your Kit lives on a private link on your Kit page — check the delivery email
>    from **hello@ozvor.com** (subject "Your Get-Cited Kit"), including spam.
> 2. If it's not there, reply here with the email you used at checkout and I'll
>    re-send it right away.
>
> Everything in the Kit (your audit, top-3 fixes, 3 drafts, the guide) is yours to
> keep — you won't be charged again to re-access it.

*Internal:* verify payment by email in `kit_order`; re-send via the admin
resend-email action (bypasses webhook idempotency). If provisioning failed, the
`/kit/[token]` page rebuilds the deliverable on load.

---

## Macro 2 — "My audit failed / looks wrong / shows no data"

> Hi [name] — thanks for flagging. Our audits are run live against the AI engines,
> so a run can occasionally time out or an engine can be briefly unavailable —
> when that happens we'd rather show you an honest gap than a made-up number.
>
> Please re-run the test from [/test] (or your dashboard). If it still looks off,
> send me the brand + the exact prompt and I'll investigate and get back to you
> with what actually happened.

*Internal:* check `/api/system/capabilities` = `mode: live`; check worker/API
logs for the run. Never hand-edit a score. If it's a real bug, open a GitHub issue
and link the customer.

---

## Macro 3 — "I want a refund"

> Hi [name] — happy to help. Here's how our guarantee works:
>
> - **Get-Cited Kit ($29):** if your 3 drafts aren't ready to publish in ~10
>   minutes, we refund the $29 — we guarantee the deliverable, never AI behavior.
> - **Growth / Agency plans:** covered by our 30-day money-back guarantee.
>
> If that fits your situation, reply "yes, refund" and confirm the email used at
> purchase — I'll get it processed. You keep anything already downloaded.

*Internal:* **do not process the refund yourself** — confirm eligibility against
the guarantee wording (keep it identical to `/kit`, `/pricing`, Terms — #162),
then route to the founder to execute in Stripe. Log outcome.

---

## Macro 4 — "How do I publish my drafts?"

> Hi [name] — great, let's get you cited. Each draft in your Kit is publish-ready:
>
> 1. Replace any `[PLACEHOLDER]` with your real facts — we never invent numbers,
>    so those blanks are yours to fill.
> 2. Publish each piece where the "where to publish" checklist says (your site for
>    the FAQ/schema page, LinkedIn for the proof post, your blog for the article).
> 3. Re-run your test in ~30 days to see the movement.
>
> Want it done for you instead? Growth generates fresh drafts weekly, and
> OrganicPosts runs the whole thing hands-off. Happy to point you to the right one.

*Internal:* link the relevant tutorial on `/learn` and the guide.

---

## Macro 5 — "How do I cancel my plan?"

> Hi [name] — no problem, and no hard feelings. You can cancel anytime from
> **Account → Billing** (Manage subscription → Cancel), which stops the next
> renewal; you keep access until the end of the current period.
>
> If you'd rather I handle it, confirm the account email and I'll take care of it.
> And if something specific pushed you to cancel, I'd genuinely like to hear it —
> it's how we improve.

*Internal:* self-serve cancel is via the Stripe billing portal. If manual,
route the cancellation to the founder. Log the churn reason in the CX tool + CRM
`notes`.

---

## What we never say

- No "you'll rank #1 / get cited / guaranteed traffic." AI answers are
  non-deterministic; we sell evidence + execution, not outcomes.
- No invented scores, citations, competitors, or testimonials.
- No sharing a Kit/account without verifying the purchase email.
- No refund/cancel/billing action without founder execution.
