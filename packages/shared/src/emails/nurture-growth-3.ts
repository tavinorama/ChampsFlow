/**
 * Nurture email — KIT → GROWTH sequence, Step 3 (final)
 * "Last note on staying cited." Growth as the default; a soft done-for-you line
 * (OrganicPosts) for those who would rather not do it themselves.
 *
 * Sub-processor: Resend. Hard rules: RESEND_API_KEY from env, unsubscribe footer.
 */

const WEB_ORIGIN = process.env["WEB_ORIGIN"] ?? "https://ozvor.com";

import { sendResendEmail } from "./resend-send";
import type { NurtureEmailParams } from "./nurture-growth-1";

/** Send nurture Step 3 (kit → growth): "Last note on staying cited." */
export async function sendNurtureGrowth3Email(
  params: NurtureEmailParams
): Promise<void> {
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    throw new Error("RESEND_API_KEY is not configured — nurture-growth-3 email not sent");
  }

  const fromAddress = process.env.EMAIL_FROM ?? "Ozvor <hello@ozvor.com>";
  const pricingUrl = `${WEB_ORIGIN}/pricing`;
  const bookUrl = `${WEB_ORIGIN}/book`;
  const subject = "Last note on staying cited";

  const textBody = [
    `The Kit was the first brick for ${params.brand}. Growth is the wall.`,
    "",
    "If you would rather not check by hand every week, this is the set-and-watch version: weekly audits, movement alerts, and fresh content briefs. One brand, five engines, $99/mo, cancel anytime.",
    "",
    "See Growth: " + pricingUrl,
    "",
    "Prefer a team to do it for you? OrganicPosts publishes and optimizes on your behalf. Book a call: " + bookUrl,
    "",
    "— The Ozvor Team",
    "https://ozvor.com",
    "",
    "---",
    "You opted in at ozvor.com. Unsubscribe: " + params.unsubscribeUrl,
    "Ozvor · ozvor.com",
  ].join("\n");

  const btnStyle =
    "display:inline-block;padding:12px 24px;background:#0c7d54;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:15px;";

  const htmlBody = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
</head>
<body style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111827;background:#ffffff;">
  <div style="margin-bottom:24px;">
    <p style="margin:0;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:1px;color:#0c7d54;">Ozvor Growth</p>
    <h1 style="font-size:22px;font-weight:700;margin:8px 0 4px 0;color:#111827;">Last note on staying cited</h1>
    <p style="font-size:14px;color:#6B7280;margin:0;">${params.brand} &middot; set and watch</p>
  </div>
  <p style="color:#374151;margin-bottom:16px;">The Kit was the first brick for <strong>${params.brand}</strong>. Growth is the wall.</p>
  <p style="color:#374151;margin-bottom:24px;">If you would rather not check by hand every week, this is the set-and-watch version: weekly audits, movement alerts, and fresh content briefs. One brand, five engines, $99/mo, cancel anytime.</p>
  <div style="text-align:center;margin-bottom:24px;">
    <a href="${pricingUrl}" style="${btnStyle}">See Growth</a>
  </div>
  <div style="background:#F5F3FF;border:1px solid #DDD6FE;border-radius:8px;padding:16px;margin-bottom:24px;">
    <p style="margin:0;color:#5B21B6;font-size:13px;line-height:1.6;">Prefer a team to do it for you? <a href="${bookUrl}" style="color:#4C1D95;font-weight:600;">OrganicPosts</a> publishes and optimizes on your behalf.</p>
  </div>
  <hr style="border:none;border-top:1px solid #E5E7EB;margin:28px 0 16px 0;" />
  <p style="font-size:11px;color:#9CA3AF;margin:0;text-align:center;">
    You received this email because you opted in at ozvor.com.<br/>
    <a href="${params.unsubscribeUrl}" style="color:#6B7280;">Unsubscribe</a> &nbsp;&middot;&nbsp; Ozvor · ozvor.com
  </p>
</body>
</html>`;

  await sendResendEmail({ from: fromAddress, to: params.to, subject, text: textBody, html: htmlBody });
}
