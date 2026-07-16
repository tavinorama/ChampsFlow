/**
 * Nurture email — KIT → GROWTH sequence, Step 2
 * "What changes in 30 days."
 *
 * Sub-processor: Resend. Hard rules: RESEND_API_KEY from env, unsubscribe footer.
 */

const WEB_ORIGIN = process.env["WEB_ORIGIN"] ?? "https://ozvor.com";

import { sendResendEmail } from "./resend-send";
import type { NurtureEmailParams } from "./nurture-growth-1";

/** Send nurture Step 2 (kit → growth): "What changes in 30 days." */
export async function sendNurtureGrowth2Email(
  params: NurtureEmailParams
): Promise<void> {
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    throw new Error("RESEND_API_KEY is not configured — nurture-growth-2 email not sent");
  }

  const fromAddress = process.env.EMAIL_FROM ?? "Ozvor <hello@ozvor.com>";
  const pricingUrl = `${WEB_ORIGIN}/pricing`;
  const subject = "What changes in 30 days";

  const textBody = [
    `Publish the drafts from your Kit, then watch what happens to ${params.brand}.`,
    "",
    "Content you publish today can lift your score in about 30 days. Or it can quietly slip back if a competitor moves. The only way to know is to measure it, week after week.",
    "",
    "Growth turns that from guesswork into a weekly number: what moved, who gained citations, and the next brief to write. You stop guessing and start compounding.",
    "",
    "Start Growth — $99/mo: " + pricingUrl,
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
    <h1 style="font-size:22px;font-weight:700;margin:8px 0 4px 0;color:#111827;">What changes in 30 days</h1>
    <p style="font-size:14px;color:#6B7280;margin:0;">${params.brand} &middot; measure the movement</p>
  </div>
  <p style="color:#374151;margin-bottom:16px;">Publish the drafts from your Kit, then watch what happens to <strong>${params.brand}</strong>.</p>
  <p style="color:#374151;margin-bottom:16px;">Content you publish today can lift your score in about 30 days. Or it can quietly slip back if a competitor moves. The only way to know is to measure it, week after week.</p>
  <div style="background:#ECFDF5;border:1px solid #A7F3D0;border-radius:8px;padding:20px;margin-bottom:24px;">
    <p style="margin:0;color:#047857;font-size:14px;line-height:1.6;">Growth turns that from guesswork into a weekly number: what moved, who gained citations, and the next brief to write. You stop guessing and start compounding.</p>
  </div>
  <div style="text-align:center;margin-bottom:32px;">
    <a href="${pricingUrl}" style="${btnStyle}">Start Growth — $99/mo</a>
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
