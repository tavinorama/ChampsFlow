/**
 * Kit delivery email — sent after a Get-Cited Kit one-time payment is confirmed
 * (checkout.session.completed, mode='payment', product='get_cited_kit').
 *
 * Subject: "Your Get-Cited Kit is ready — access it here"
 * Content: Kit access link + summary of what's inside.
 *
 * Sub-processor: Resend (architecture §11 — DPA executed, EU infrastructure,
 *   data minimization: only email address + brand label sent to Resend; no PII
 *   beyond recipient address in the request body).
 *
 * Hard rules:
 *   - RESEND_API_KEY from env — never hardcoded
 *   - Data minimization: brand name + order token only (no order IDs, no card data)
 *   - Best-effort: caller catches all errors; email failure does NOT block webhook 200
 *   - No tracking pixels; no external asset references in HTML
 *   - No full PII beyond recipient email address sent to Resend
 */

import { sendResendEmail, type ResendSendResult } from "./resend-send";

export interface KitDeliveryEmailParams {
  /** Recipient email address (the buyer). */
  to: string;
  /** The brand name from the kit_order row. */
  brand: string;
  /** The order token used to construct the kit URL. */
  orderToken: string;
}

// Use WEB_ORIGIN env (same pattern as products.ts webOrigin()) so staging
// emails link to the correct environment, not production.
const KIT_BASE_URL = `${process.env["WEB_ORIGIN"] ?? "https://ozvor.com"}/kit`;

/**
 * Send the Get-Cited Kit delivery email via Resend.
 *
 * Best-effort: if RESEND_API_KEY is not set, throws an error so the caller
 * can catch and emit a structured warning log without crashing.
 */
export async function sendKitDeliveryEmail(
  params: KitDeliveryEmailParams
): Promise<ResendSendResult> {
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    throw new Error(
      "RESEND_API_KEY is not configured — kit delivery email not sent"
    );
  }

  const fromAddress =
    process.env.EMAIL_FROM ?? "Ozvor <hello@ozvor.com>";

  const kitUrl = `${KIT_BASE_URL}/${params.orderToken}`;
  const pricingUrl = "https://ozvor.com/pricing";
  const subject = "Your Get-Cited Kit is ready — start with the 5-minute fix";

  // ----- Plain-text body -----
  const textBody = [
    `Your Get-Cited Kit for ${params.brand} is ready.`,
    "",
    "It's a 30-day plan to get named by ChatGPT, Claude, Perplexity and Gemini — your audit, your top-3 prioritized fixes, three ready-to-publish drafts, and a week-by-week retest plan. Most of it fits in an afternoon.",
    "",
    "Open your Kit:",
    kitUrl,
    "",
    "Do this first (5 minutes): open your robots.txt and confirm you are not blocking GPTBot, ClaudeBot, PerplexityBot or Google-Extended. If any are blocked, the engines can't read your site — Fix 1 in your Kit walks you through it.",
    "",
    "When you're ready to stop doing it by hand:",
    "- Growth ($99/mo): weekly re-audits and alerts across all 5 engines, plus publish-ready drafts in your brand voice.",
    "- Agency ($549/mo): the same, white-label, for up to 15 client brands (about $37 each).",
    "- OrganicPosts by Ozvor: our team executes the whole plan for you.",
    `See the plans: ${pricingUrl}`,
    "",
    "Questions? Reply to this email or write to hello@ozvor.com",
    "",
    "— The Ozvor Team",
    "https://ozvor.com",
  ].join("\n");

  // ----- HTML body (Ozvor dark-first identity, email-safe) -----
  const btnStyle =
    "display:inline-block;padding:13px 26px;background:#0c7d54;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:700;font-size:15px;";
  const linkStyle = "color:#0c7d54;text-decoration:none;";

  const htmlBody = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
</head>
<body style="font-family:system-ui,-apple-system,sans-serif;max-width:600px;margin:0 auto;padding:0;color:#17211c;background:#ffffff;">

  <!-- Header band (dark-first Ozvor identity) -->
  <div style="background:#0c1310;padding:22px 28px;border-radius:0 0 4px 4px;">
    <p style="margin:0;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#34c388;">
      Ozvor
    </p>
  </div>

  <div style="padding:28px;">
    <h1 style="font-size:24px;font-weight:800;letter-spacing:-0.02em;margin:0 0 6px 0;color:#17211c;">
      Your Get-Cited Kit is ready
    </h1>
    <p style="font-size:14px;color:#5c6e65;margin:0 0 24px 0;">
      ${params.brand} &middot; a 30-day plan to get named by AI search
    </p>

    <p style="color:#3a473f;margin:0 0 24px 0;line-height:1.6;">
      Everything inside is built to be <strong>done, not just read</strong>: your audit, your top-3
      prioritized fixes, three ready-to-publish drafts, and a week-by-week retest plan.
    </p>

    <!-- CTA -->
    <div style="text-align:center;margin:0 0 28px 0;">
      <a href="${kitUrl}" style="${btnStyle}">Open your Kit</a>
    </div>

    <!-- Quick win -->
    <div style="background:#eef6f1;border-left:3px solid #0c7d54;border-radius:0 8px 8px 0;padding:16px 18px;margin:0 0 28px 0;">
      <p style="margin:0;font-size:14px;color:#17211c;line-height:1.6;">
        <strong>Do this first (5 minutes):</strong> open your <code>robots.txt</code> and confirm
        you're not blocking GPTBot, ClaudeBot, PerplexityBot or Google-Extended. If any are blocked,
        the engines can't read your site — Fix 1 in your Kit walks you through it.
      </p>
    </div>

    <!-- What's inside -->
    <h2 style="font-size:15px;font-weight:700;color:#17211c;margin:0 0 12px 0;">What's inside</h2>
    <ul style="margin:0 0 28px 0;padding-left:20px;color:#3a473f;font-size:14px;line-height:1.8;">
      <li><strong>Your AI Visibility Audit</strong> — how ${params.brand} appears across ChatGPT, Claude, Perplexity &amp; Gemini, measured live</li>
      <li><strong>Top-3 prioritized fixes</strong> — ordered by impact and effort, so you start where it moves the needle</li>
      <li><strong>3 ready-to-publish drafts</strong> — with the schema markup AI engines read</li>
      <li><strong>Your 30-day retest plan</strong> — what to change, when to re-measure, what "working" looks like</li>
    </ul>

    <!-- Ladder / next step -->
    <div style="background:#f2f6f3;border:1px solid #d5dfd9;border-radius:10px;padding:20px;margin:0 0 28px 0;">
      <h2 style="font-size:15px;font-weight:700;color:#17211c;margin:0 0 8px 0;">When you're ready to stop doing it by hand</h2>
      <p style="margin:0 0 6px 0;font-size:14px;color:#3a473f;line-height:1.6;">
        <strong>Growth &mdash; $99/mo:</strong> weekly re-audits and alerts across all 5 engines, plus publish-ready drafts in your brand voice.
      </p>
      <p style="margin:0 0 6px 0;font-size:14px;color:#3a473f;line-height:1.6;">
        <strong>Agency &mdash; $549/mo:</strong> the same, white-label, for up to 15 client brands.
      </p>
      <p style="margin:0 0 12px 0;font-size:14px;color:#3a473f;line-height:1.6;">
        <strong>OrganicPosts by Ozvor:</strong> our team executes the whole plan for you.
      </p>
      <a href="${pricingUrl}" style="${linkStyle}font-weight:600;font-size:14px;">See the plans &rarr;</a>
    </div>

    <!-- Footer -->
    <hr style="border:none;border-top:1px solid #d5dfd9;margin:0 0 16px 0;" />
    <p style="font-size:12px;color:#8a9a91;margin:0;">
      Questions? Reply to this email or write to
      <a href="mailto:hello@ozvor.com" style="${linkStyle}">hello@ozvor.com</a>
      &nbsp;&middot;&nbsp;
      <a href="https://ozvor.com" style="${linkStyle}">ozvor.com</a>
    </p>
  </div>
</body>
</html>`;


  return sendResendEmail({
    from: fromAddress,
    to: params.to,
    subject,
    text: textBody,
    html: htmlBody,
  });
}
