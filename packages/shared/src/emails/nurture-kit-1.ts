/**
 * Nurture email — KIT → DFY sequence, Step 1
 * "Did you act on your 3 fixes?"
 *
 * Sub-processor: Resend (architecture §11).
 * Hard rules: RESEND_API_KEY from env, unsubscribe footer required.
 */

const WEB_ORIGIN = process.env["WEB_ORIGIN"] ?? "https://ozvor.com";

import { sendResendEmail } from "./resend-send";

export interface NurtureEmailParams {
  to: string;
  brand: string;
  unsubscribeUrl: string;
  metadata?: Record<string, unknown>;
}

/**
 * Send nurture Step 1 (kit → dfy): "Did you implement your top-3 fixes?"
 */
export async function sendNurtureKit1Email(
  params: NurtureEmailParams
): Promise<void> {
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    throw new Error(
      "RESEND_API_KEY is not configured — nurture-kit-1 email not sent"
    );
  }

  const fromAddress =
    process.env.EMAIL_FROM ?? "Ozvor <hello@ozvor.com>";

  const bookUrl = `${WEB_ORIGIN}/book`;
  const subject = "Did you implement your top-3 fixes? Here's a quick check.";

  // ----- Plain-text body -----
  const textBody = [
    `You got your Get-Cited Kit for ${params.brand}. The three fixes in your report are the highest-leverage actions you can take right now for AI visibility.`,
    "",
    "Quick question: have you published them?",
    "",
    "Most Kit owners tell us the #1 blocker is time, not clarity. If that's you, we have an option.",
    "",
    "OrganicPosts GEO Sprint: done-for-you. We publish the content, optimize your brand presence, and you focus on your business.",
    "",
    "Book a GEO Sprint call: " + bookUrl,
    "",
    "— The Ozvor Team",
    "https://ozvor.com",
    "",
    "---",
    "You opted in at ozvor.com. Unsubscribe: " + params.unsubscribeUrl,
    "Ozvor · ozvor.com",
  ].join("\n");

  // ----- HTML body -----
  const btnStyle =
    "display:inline-block;padding:12px 24px;background:#1D4ED8;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:15px;";

  const htmlBody = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
</head>
<body style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111827;background:#ffffff;">

  <!-- Header -->
  <div style="margin-bottom:24px;">
    <p style="margin:0;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:1px;color:#2563EB;">
      Ozvor &middot; OrganicPosts
    </p>
    <h1 style="font-size:22px;font-weight:700;margin:8px 0 4px 0;color:#111827;">
      Did you implement your top-3 fixes?
    </h1>
    <p style="font-size:14px;color:#6B7280;margin:0;">
      ${params.brand} &middot; quick check
    </p>
  </div>

  <p style="color:#374151;margin-bottom:16px;">
    You got your Get-Cited Kit for <strong>${params.brand}</strong>. The three fixes in your report
    are the highest-leverage actions you can take right now for AI visibility.
  </p>

  <p style="color:#374151;margin-bottom:16px;">
    Quick question: <strong>have you published them?</strong>
  </p>

  <p style="color:#374151;margin-bottom:24px;">
    Most Kit owners tell us the #1 blocker is time, not clarity. If that's you, we have an option.
  </p>

  <!-- DFY callout -->
  <div style="background:#F5F3FF;border:1px solid #DDD6FE;border-radius:8px;padding:20px;margin-bottom:24px;">
    <h2 style="font-size:15px;font-weight:600;color:#4C1D95;margin:0 0 8px 0;">
      OrganicPosts GEO Sprint
    </h2>
    <p style="margin:0;color:#5B21B6;font-size:14px;line-height:1.6;">
      Done-for-you: we publish the content, optimize your brand presence, and you focus
      on running your business. No long-term contract — start with a single sprint.
    </p>
  </div>

  <!-- CTA -->
  <div style="text-align:center;margin-bottom:32px;">
    <a href="${bookUrl}" style="${btnStyle}">
      Book a GEO Sprint call
    </a>
  </div>

  <!-- Unsubscribe footer -->
  <hr style="border:none;border-top:1px solid #E5E7EB;margin:28px 0 16px 0;" />
  <p style="font-size:11px;color:#9CA3AF;margin:0;text-align:center;">
    You received this email because you opted in at ozvor.com.<br/>
    <a href="${params.unsubscribeUrl}" style="color:#6B7280;">Unsubscribe</a> &nbsp;&middot;&nbsp;
    Ozvor · ozvor.com
  </p>
</body>
</html>`;


  await sendResendEmail({
    from: fromAddress,
    to: params.to,
    subject,
    text: textBody,
    html: htmlBody,
  });
}
