/**
 * nurture-catalog.ts — Content + renderer for the webhook-triggered nurture
 * sequences added on 17/08/2026 (founder decision: every purchase starts a
 * short, aggressive drip; nothing is enrolled by hand only).
 *
 * Sequences here:
 *   credit_pack_bought     (2)  Stripe: credit_pack paid
 *   ai_audit_bought        (3)  Stripe: ai_audit_stack paid
 *   pages_bought           (2)  Stripe: ozvor_pages_site paid
 *   book_to_dfy            (2)  /api/book/intake or operator enroll
 *   subscriber_onboarding  (3)  Stripe: growth/agency checkout
 *
 * Copy rules (CLAUDE.md + memory): English, no em-dash, sentences of twelve
 * words or fewer, first-person CTAs, honest claims only, one-click unsubscribe
 * in every footer (CAN-SPAM / LGPD Art. 18).
 *
 * The content is DATA (NURTURE_CATALOG) so tests can pin the copy rules on
 * every string without a Resend key. The renderer produces text + HTML with
 * the same footer the older nurture emails use.
 *
 * Sub-processor: Resend (REST). RESEND_API_KEY from env; throws when missing
 * so the worker keeps the row and retries (never marks sent).
 */

import { sendResendEmail } from "./resend-send";
import type { NurtureSequence } from "../nurture-cadence";

const WEB_ORIGIN = process.env["WEB_ORIGIN"] ?? "https://ozvor.com";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NurtureCatalogParams {
  to: string;
  brand: string;
  unsubscribeUrl: string;
  metadata?: Record<string, unknown>;
}

export interface NurtureStepContent {
  subject: string;
  /** Small uppercase label above the headline. */
  kicker: string;
  headline: string;
  /** Body paragraphs. `{brand}` is replaced with the brand name. */
  paragraphs: readonly string[];
  /** Optional checklist rendered as bullets under the paragraphs. */
  bullets?: readonly string[];
  cta: { label: string; path: string };
  /** Optional soft second line, rendered in a callout box. */
  aside?: { text: string; linkLabel: string; path: string };
}

export type CatalogSequence =
  | "credit_pack_bought"
  | "ai_audit_bought"
  | "pages_bought"
  | "book_to_dfy"
  | "subscriber_onboarding";

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

export const NURTURE_CATALOG: Record<CatalogSequence, readonly NurtureStepContent[]> = {
  // -------------------------------------------------------------------------
  credit_pack_bought: [
    {
      subject: "Your 1,000 credits are in. Here is how to spend them well",
      kicker: "Ozvor credits",
      headline: "Your credits landed. Spend them where it counts.",
      paragraphs: [
        "Your 1,000 credits are live on {brand}. Thank you.",
        "Credits go furthest on the moves that change your score.",
        "Here is the order I would use them in.",
      ],
      bullets: [
        "Re-run the full audit once. See what moved since last time.",
        "Add the two competitors you lose answers to. Track them weekly.",
        "Turn the top three action cards into published pages.",
        "Re-test the exact prompts where you were not cited.",
      ],
      cta: { label: "I will open my dashboard", path: "/dashboard-v3" },
      aside: {
        text: "Buying packs every month? A plan is usually cheaper. Growth includes credits and weekly monitoring.",
        linkLabel: "I want to compare plans",
        path: "/pricing",
      },
    },
    {
      subject: "The credit math: packs vs a plan",
      kicker: "Ozvor credits",
      headline: "Quick math before your next top-up",
      paragraphs: [
        "A 1,000 credit pack is priced for occasional use.",
        "If {brand} audits every week, the numbers flip.",
        "A Growth plan bundles the credits and adds weekly monitoring.",
        "Agency adds more brands and more credits per dollar.",
        "You keep the pack you bought either way. Nothing is lost.",
      ],
      bullets: [
        "One audit a month: stay on packs.",
        "One audit a week: Growth pays for itself.",
        "Several brands: Agency is the cheaper path.",
      ],
      cta: { label: "I will check the plans", path: "/pricing" },
    },
  ],

  // -------------------------------------------------------------------------
  ai_audit_bought: [
    {
      subject: "Your AI stack is in your inbox. First 24 hours checklist",
      kicker: "AI Audit Stack",
      headline: "Your stack is ready. Start with these four things.",
      paragraphs: [
        "Your AI Audit Stack for {brand} was delivered. Check the delivery email.",
        "Most people read it once and stall. Do not stall.",
        "Here is a first day checklist that fits in one hour.",
      ],
      bullets: [
        "Pick the one tool that hits your biggest pain. Sign up today.",
        "Block thirty minutes to set it up. Do it in that block.",
        "Turn off the tool it replaces. Two tools for one job costs twice.",
        "Write down one number to watch this week.",
      ],
      cta: { label: "I will open my stack", path: "/ai-audit" },
    },
    {
      subject: "The 8 tools we held back",
      kicker: "AI Audit Stack",
      headline: "Your stack showed the essentials. There is a second layer.",
      paragraphs: [
        "Your audit named the tools that solve today's pain for {brand}.",
        "We held back eight more. They only work with a GEO plan behind them.",
        "That is what OrganicPosts is: the full AI audit plus GEO execution.",
        "We publish, we optimize, we report. You approve.",
        "Honest note: it is a real budget, not a $49 tool.",
      ],
      cta: { label: "I want to see OrganicPosts", path: "/organicposts" },
    },
    {
      subject: "Fifteen minutes to talk about your stack?",
      kicker: "AI Audit Stack",
      headline: "Let us look at your stack together",
      paragraphs: [
        "You have the tools. The hard part is the order and the setup.",
        "Book fifteen minutes. We go through {brand}'s stack live.",
        "No pitch script. If OrganicPosts is not a fit, I will say so.",
      ],
      cta: { label: "I will book the call", path: "/book" },
    },
  ],

  // -------------------------------------------------------------------------
  pages_bought: [
    {
      subject: "Your Ozvor Page: publish it and get cited",
      kicker: "Ozvor Pages",
      headline: "Your page credit is in. Here is how to get it cited.",
      paragraphs: [
        "Thank you for buying an Ozvor Page for {brand}.",
        "Log in and the builder is waiting for you.",
        "A page only earns citations once it is live and clear.",
      ],
      bullets: [
        "Answer one real question in the first two lines.",
        "Keep the brand name and the claim in the same sentence.",
        "Publish on your own domain, or use ours to start.",
        "Re-run the free test one week later. Watch the citation column.",
      ],
      cta: { label: "I will build my page", path: "/dashboard-v3" },
    },
    {
      subject: "Keep the page working: regenerate and monitor",
      kicker: "Ozvor Pages",
      headline: "One page is a start. Growth keeps it working.",
      paragraphs: [
        "AI answers move every week. A page you built once can slip.",
        "Growth re-generates {brand}'s pages when the answers change.",
        "It also runs the weekly audit and alerts you on movement.",
        "One brand, five engines, $99 a month, cancel anytime.",
      ],
      cta: { label: "I will look at Growth", path: "/pricing" },
    },
  ],

  // -------------------------------------------------------------------------
  book_to_dfy: [
    {
      subject: "Before our call: what OrganicPosts actually does",
      kicker: "OrganicPosts by Ozvor",
      headline: "Thanks for booking. Here is what to expect.",
      paragraphs: [
        "You booked a call about {brand}. Thank you.",
        "OrganicPosts is done-for-you AI search visibility.",
        "We audit, plan, publish and monitor. You approve each piece.",
        "On the call I will show your current numbers, not a slideshow.",
      ],
      bullets: [
        "Bring the two competitors that annoy you most.",
        "Bring one page you are proud of.",
        "Bring your monthly content budget, even a rough one.",
      ],
      cta: { label: "I will run the free test first", path: "/test" },
    },
    {
      subject: "One question before we talk",
      kicker: "OrganicPosts by Ozvor",
      headline: "One question so the call is useful",
      paragraphs: [
        "Reply with one line: what should AI say about {brand}?",
        "That sentence sets the whole plan. Everything else follows.",
        "If you would rather write it down first, the audit helps.",
      ],
      cta: { label: "I will book or move my call", path: "/book" },
    },
  ],

  // -------------------------------------------------------------------------
  subscriber_onboarding: [
    {
      subject: "Welcome to Ozvor. Run your first audit today",
      kicker: "Welcome",
      headline: "You are in. Run the first audit now.",
      paragraphs: [
        "Welcome aboard. {brand} is now monitored every week.",
        "The first audit sets your baseline. Run it today.",
        "It takes a few minutes and costs a few credits.",
      ],
      bullets: [
        "Open the dashboard and press Run audit.",
        "Read the three scores: Visibility, Citation Readiness, Execution.",
        "Save the top action card. That is tomorrow's job.",
      ],
      cta: { label: "I will run my first audit", path: "/dashboard-v3" },
    },
    {
      subject: "Add the competitors you lose answers to",
      kicker: "Day two",
      headline: "Add two competitors. Watch who AI picks.",
      paragraphs: [
        "Your baseline is in. Now add the competitors.",
        "Pick the two brands AI names instead of {brand}.",
        "The weekly report will show every prompt they win.",
        "That list is your content plan for the month.",
      ],
      cta: { label: "I will add my competitors", path: "/dashboard-v3" },
    },
    {
      subject: "Do three action cards this week",
      kicker: "Day four",
      headline: "Three cards this week. That is the whole habit.",
      paragraphs: [
        "Action cards are the fixes ranked by impact.",
        "Do three this week for {brand}. Not ten. Three.",
        "Weekly monitoring will show which one moved the score.",
        "Rather have a team do it? OrganicPosts publishes for you.",
      ],
      cta: { label: "I will do my three cards", path: "/dashboard-v3" },
      aside: {
        text: "OrganicPosts is our done-for-you arm. We publish, you approve.",
        linkLabel: "I want to see how it works",
        path: "/organicposts",
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

function fill(text: string, brand: string): string {
  return text.split("{brand}").join(brand);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface RenderedNurtureEmail {
  subject: string;
  text: string;
  html: string;
}

export function renderNurtureCatalogEmail(
  sequence: CatalogSequence,
  step: number,
  params: NurtureCatalogParams
): RenderedNurtureEmail {
  const content = NURTURE_CATALOG[sequence][step];
  if (!content) {
    throw new Error(`Unknown nurture step: sequence=${sequence} step=${step}`);
  }
  const brand = params.brand || "your brand";
  const ctaUrl = `${WEB_ORIGIN}${content.cta.path}`;
  const asideUrl = content.aside ? `${WEB_ORIGIN}${content.aside.path}` : null;

  const textLines: string[] = [];
  for (const p of content.paragraphs) textLines.push(fill(p, brand), "");
  if (content.bullets) {
    for (const b of content.bullets) textLines.push(`- ${fill(b, brand)}`);
    textLines.push("");
  }
  textLines.push(`${content.cta.label}: ${ctaUrl}`, "");
  if (content.aside && asideUrl) {
    textLines.push(`${fill(content.aside.text, brand)} ${content.aside.linkLabel}: ${asideUrl}`, "");
  }
  textLines.push(
    "The Ozvor Team",
    "https://ozvor.com",
    "",
    "---",
    "You are receiving this because you bought or booked something at ozvor.com. Unsubscribe: " +
      params.unsubscribeUrl,
    "Ozvor · ozvor.com"
  );
  const text = textLines.join("\n");

  const btnStyle =
    "display:inline-block;padding:12px 24px;background:#0c7d54;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:15px;";
  const paragraphsHtml = content.paragraphs
    .map((p) => `<p style="color:#374151;margin-bottom:14px;">${escapeHtml(fill(p, brand))}</p>`)
    .join("\n  ");
  const bulletsHtml = content.bullets
    ? `<ul style="color:#374151;margin:0 0 20px 0;padding-left:20px;line-height:1.7;">${content.bullets
        .map((b) => `<li>${escapeHtml(fill(b, brand))}</li>`)
        .join("")}</ul>`
    : "";
  const asideHtml =
    content.aside && asideUrl
      ? `<div style="background:#F5F3FF;border:1px solid #DDD6FE;border-radius:8px;padding:16px;margin-bottom:24px;">
    <p style="margin:0;color:#5B21B6;font-size:13px;line-height:1.6;">${escapeHtml(fill(content.aside.text, brand))} <a href="${asideUrl}" style="color:#4C1D95;font-weight:600;">${escapeHtml(content.aside.linkLabel)}</a></p>
  </div>`
      : "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(content.subject)}</title>
</head>
<body style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111827;background:#ffffff;">
  <div style="margin-bottom:24px;">
    <p style="margin:0;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:1px;color:#0c7d54;">${escapeHtml(content.kicker)}</p>
    <h1 style="font-size:22px;font-weight:700;margin:8px 0 4px 0;color:#111827;">${escapeHtml(content.headline)}</h1>
    <p style="font-size:14px;color:#6B7280;margin:0;">${escapeHtml(brand)}</p>
  </div>
  ${paragraphsHtml}
  ${bulletsHtml}
  <div style="text-align:center;margin-bottom:24px;">
    <a href="${ctaUrl}" style="${btnStyle}">${escapeHtml(content.cta.label)}</a>
  </div>
  ${asideHtml}
  <hr style="border:none;border-top:1px solid #E5E7EB;margin:28px 0 16px 0;" />
  <p style="font-size:11px;color:#9CA3AF;margin:0;text-align:center;">
    You are receiving this because you bought or booked something at ozvor.com.<br/>
    <a href="${params.unsubscribeUrl}" style="color:#6B7280;">Unsubscribe</a> &nbsp;&middot;&nbsp; Ozvor · ozvor.com
  </p>
</body>
</html>`;

  return { subject: content.subject, text, html };
}

/** Send one step of a catalog sequence through Resend. */
export async function sendNurtureCatalogEmail(
  sequence: CatalogSequence,
  step: number,
  params: NurtureCatalogParams
): Promise<void> {
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    throw new Error(`RESEND_API_KEY is not configured: nurture ${sequence}#${step + 1} email not sent`);
  }
  const fromAddress = process.env.EMAIL_FROM ?? "Ozvor <hello@ozvor.com>";
  const rendered = renderNurtureCatalogEmail(sequence, step, params);
  await sendResendEmail({
    from: fromAddress,
    to: params.to,
    subject: rendered.subject,
    text: rendered.text,
    html: rendered.html,
  });
}

export function isCatalogSequence(sequence: NurtureSequence): sequence is CatalogSequence {
  return Object.prototype.hasOwnProperty.call(NURTURE_CATALOG, sequence);
}
