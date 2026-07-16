/**
 * Nurture email — FREE → KIT sequence, Step 3
 * "The $29 Get-Cited Kit — your fixes + the guide"
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
 * Send nurture Step 3 (free → kit): Kit value-first offer email.
 */
export async function sendNurtureFree3Email(
  params: NurtureEmailParams
): Promise<void> {
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    throw new Error(
      "RESEND_API_KEY is not configured — nurture-free-3 email not sent"
    );
  }

  const fromAddress =
    process.env.EMAIL_FROM ?? "Ozvor <hello@ozvor.com>";

  const kitUrl = `${WEB_ORIGIN}/kit`;
  const subject = "The $29 fix for AI invisibility (your top-3 actions inside)";

  // ----- Plain-text body -----
  const textBody = [
    `You asked where ${params.brand} shows up across ChatGPT, Claude, Perplexity, and Gemini. Now it's time to act.`,
    "",
    "The Get-Cited Kit gives you:",
    "",
    "1. Full AI audit across 4 engines — exactly where you appear, where you don't, and why",
    "2. Your top-3 highest-impact fixes, prioritized by what moves your score fastest",
    "3. Three citation-ready content pieces — ready to publish, structured for AI citation",
    "",
    "One-time. $29. No subscription. You own the output.",
    "",
    "Get the Kit — $29: " + kitUrl,
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
    "display:inline-block;padding:12px 24px;background:#0c7d54;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:15px;";

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
    <p style="margin:0;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:1px;color:#0c7d54;">
      Ozvor
    </p>
    <h1 style="font-size:22px;font-weight:700;margin:8px 0 4px 0;color:#111827;">
      The $29 fix for AI invisibility
    </h1>
    <p style="font-size:14px;color:#6B7280;margin:0;">
      ${params.brand} &middot; your top-3 actions
    </p>
  </div>

  <p style="color:#374151;margin-bottom:24px;">
    You asked where <strong>${params.brand}</strong> shows up across ChatGPT, Claude, Perplexity, and Gemini.
    Now it's time to act.
  </p>

  <!-- What's inside -->
  <div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:8px;padding:20px;margin-bottom:24px;">
    <h2 style="font-size:15px;font-weight:600;color:#14532D;margin:0 0 12px 0;">
      What the Get-Cited Kit gives you
    </h2>
    <ol style="margin:0;padding-left:20px;color:#166534;font-size:14px;line-height:1.9;">
      <li>
        <strong>Full AI audit across 4 engines</strong> — exactly where you appear,
        where you don't, and why
      </li>
      <li>
        <strong>Your top-3 highest-impact fixes</strong>, prioritized by what moves
        your score fastest
      </li>
      <li>
        <strong>Three citation-ready content pieces</strong> — ready to publish,
        structured for AI citation
      </li>
    </ol>
  </div>

  <p style="color:#374151;margin-bottom:24px;font-weight:600;">
    One-time. $29. No subscription. You own the output.
  </p>

  <!-- CTA -->
  <div style="text-align:center;margin-bottom:32px;">
    <a href="${kitUrl}" style="${btnStyle}">
      Get the Kit — $29
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
