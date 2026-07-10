/**
 * Ozvor Pages purchase email — sent after a "$99 Ozvor Pages — 5-page website"
 * one-time payment is confirmed (checkout.session.completed, mode='payment',
 * product='ozvor_pages_site').
 *
 * Subject: "Your Ozvor Pages purchase is confirmed — let's build your site"
 * Content: how to access the builder (log in with THIS email), what's included.
 *
 * Sub-processor: Resend (architecture §11 — DPA executed, data minimization:
 *   only the recipient email address is sent to Resend; no order IDs beyond
 *   what the buyer already has, no card data).
 *
 * Hard rules:
 *   - RESEND_API_KEY from env — never hardcoded
 *   - Best-effort: caller catches all errors; email failure does NOT block webhook 200
 *   - No tracking pixels; no external asset references in HTML
 */

import { sendResendEmail, type ResendSendResult } from "./resend-send";

export interface PagesPurchaseEmailParams {
  /** Recipient email address (the buyer). */
  to: string;
}

const WEB_ORIGIN = process.env["WEB_ORIGIN"] ?? "https://ozvor.com";

/**
 * Send the Ozvor Pages purchase confirmation email via Resend.
 *
 * Best-effort: if RESEND_API_KEY is not set, throws so the caller can catch
 * and emit a structured warning log without crashing the webhook.
 */
export async function sendPagesPurchaseEmail(
  params: PagesPurchaseEmailParams
): Promise<ResendSendResult> {
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    throw new Error(
      "RESEND_API_KEY is not configured — pages purchase email not sent"
    );
  }

  const fromAddress = process.env.EMAIL_FROM ?? "Ozvor <hello@ozvor.com>";
  const loginUrl = `${WEB_ORIGIN}/login`;
  const subject = "Your Ozvor Pages purchase is confirmed — let's build your site";

  // ----- Plain-text body -----
  const textBody = [
    "Payment confirmed — your Ozvor Pages website credit is ready.",
    "",
    "What you bought: an AI-search-ready 5-page website (landing + 4 pages), built from your real business data, hosted on ozvor.com — with the full code exportable to host anywhere you like.",
    "",
    "How to start building (2 minutes):",
    `1. Go to ${loginUrl}`,
    "2. Log in with THIS email address (magic link or Google/GitHub/LinkedIn using this email) — that's how your purchase finds your account.",
    "3. Open \"Landing pages\" in your dashboard — your site credit is waiting there.",
    "",
    "Tip: subscribers on Growth get their site re-checked by our weekly AI-visibility audit, with one-click fixes generated for it. Your one-time purchase includes the builder for this site — the monitoring loop is the plans' job: https://ozvor.com/pricing",
    "",
    "Questions? Reply to this email or write to hello@ozvor.com",
    "",
    "— The Ozvor Team",
    "https://ozvor.com",
  ].join("\n");

  // ----- HTML body (Ozvor identity, email-safe) -----
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
<body style="margin:0;padding:0;background:#f6f7f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a1f1c;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7f6;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;">
        <tr><td style="background:#0e1512;padding:20px 32px;">
          <span style="color:#ffffff;font-weight:800;font-size:18px;letter-spacing:0.02em;">Ozvor</span>
        </td></tr>
        <tr><td style="padding:32px;">
          <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;">Payment confirmed — your site credit is ready</h1>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
            You bought an <strong>AI-search-ready 5-page website</strong> (landing + 4 pages),
            built from your real business data, hosted on ozvor.com — with the full code
            exportable to host anywhere you like.
          </p>
          <p style="margin:0 0 8px;font-size:15px;line-height:1.6;"><strong>How to start building (2 minutes):</strong></p>
          <ol style="margin:0 0 20px;padding-left:20px;font-size:15px;line-height:1.7;">
            <li>Log in with <strong>this email address</strong> — that's how your purchase finds your account.</li>
            <li>Open <strong>Landing pages</strong> in your dashboard — your site credit is waiting there.</li>
          </ol>
          <p style="margin:0 0 24px;">
            <a href="${loginUrl}" style="${btnStyle}">Log in and build your site</a>
          </p>
          <p style="margin:0 0 16px;font-size:13px;line-height:1.6;color:#5a615d;">
            Tip: Growth subscribers get this site re-checked by the weekly AI-visibility audit,
            with one-click fixes generated for it.
            <a href="https://ozvor.com/pricing" style="${linkStyle}">See the plans</a>.
          </p>
          <p style="margin:0;font-size:13px;color:#5a615d;">
            Questions? Reply to this email or write to
            <a href="mailto:hello@ozvor.com" style="${linkStyle}">hello@ozvor.com</a>.
          </p>
        </td></tr>
        <tr><td style="padding:16px 32px;border-top:1px solid #e5e8e6;">
          <p style="margin:0;font-size:12px;color:#8a918d;">— The Ozvor Team · <a href="https://ozvor.com" style="${linkStyle}">ozvor.com</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
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
