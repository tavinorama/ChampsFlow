/**
 * Nurture email — KIT → GROWTH sequence, Step 1
 * "Your score won't stay put."
 *
 * The missing rung: a $29 Kit buyer's natural next step is recurring monitoring
 * (Growth $99/mo), not the $1,900/mo done-for-you jump. This sequence targets MRR.
 *
 * Sub-processor: Resend. Hard rules: RESEND_API_KEY from env, unsubscribe footer.
 */

const WEB_ORIGIN = process.env["WEB_ORIGIN"] ?? "https://ozvor.com";

import { sendResendEmail } from "./resend-send";

export interface NurtureEmailParams {
  to: string;
  brand: string;
  unsubscribeUrl: string;
  metadata?: Record<string, unknown>;
}

/** Send nurture Step 1 (kit → growth): "Your score won't stay put." */
export async function sendNurtureGrowth1Email(
  params: NurtureEmailParams
): Promise<void> {
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    throw new Error("RESEND_API_KEY is not configured — nurture-growth-1 email not sent");
  }

  const fromAddress = process.env.EMAIL_FROM ?? "Ozvor <hello@ozvor.com>";
  const pricingUrl = `${WEB_ORIGIN}/pricing`;
  const subject = "Your AI visibility score won't stay put";

  const textBody = [
    `Your Get-Cited Kit gave ${params.brand} a snapshot and three fixes. That is the right start.`,
    "",
    "But AI answers move every week. The brands you beat today can pass you next month, and you will not see it happen.",
    "",
    "Growth re-runs your full audit every week. It flags the moment your score or your citation share moves, and gives you the next brief to write. One brand, five engines, weekly. It is $99/mo, cancel anytime.",
    "",
    "Keep my score from slipping: " + pricingUrl,
    "",
    "— The Ozvor Team",
    "https://ozvor.com",
    "",
    "---",
    "You opted in at ozvor.com. Unsubscribe: " + params.unsubscribeUrl,
    "Ozvor · ozvor.com",
  ].join("\n");

  const btnStyle =
    "display:inline-block;padding:12px 24px;background:#0A7E5A;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:15px;";

  const htmlBody = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
</head>
<body style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111827;background:#ffffff;">
  <div style="margin-bottom:24px;">
    <p style="margin:0;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:1px;color:#0A7E5A;">Ozvor Growth</p>
    <h1 style="font-size:22px;font-weight:700;margin:8px 0 4px 0;color:#111827;">Your score won't stay put</h1>
    <p style="font-size:14px;color:#6B7280;margin:0;">${params.brand} &middot; weekly monitoring</p>
  </div>
  <p style="color:#374151;margin-bottom:16px;">Your Get-Cited Kit gave <strong>${params.brand}</strong> a snapshot and three fixes. That is the right start.</p>
  <p style="color:#374151;margin-bottom:16px;">But AI answers move every week. The brands you beat today can pass you next month, and you will not see it happen.</p>
  <div style="background:#ECFDF5;border:1px solid #A7F3D0;border-radius:8px;padding:20px;margin-bottom:24px;">
    <h2 style="font-size:15px;font-weight:600;color:#065F46;margin:0 0 8px 0;">Growth — $99/mo</h2>
    <p style="margin:0;color:#047857;font-size:14px;line-height:1.6;">Re-runs your full audit every week. Flags the moment your score or citation share moves, and gives you the next brief to write. One brand, five engines. Cancel anytime.</p>
  </div>
  <div style="text-align:center;margin-bottom:32px;">
    <a href="${pricingUrl}" style="${btnStyle}">Keep my score from slipping</a>
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
