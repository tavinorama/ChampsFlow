/**
 * Nurture email — FREE → KIT sequence, Step 1
 * "Your AI Invisibility result + what it means"
 *
 * Triggered by: background worker after a consented free-test lead is enrolled.
 *
 * Sub-processor: Resend (architecture §11 — DPA executed, EU infrastructure,
 *   data minimization: only email address + brand label sent to Resend; no PII
 *   beyond recipient address in the request body).
 *
 * Hard rules:
 *   - RESEND_API_KEY from env — never hardcoded
 *   - Unsubscribe link in EVERY email (CAN-SPAM / LGPD requirement)
 *   - No tracking pixels; no external asset references in HTML
 *   - No full PII logged — log events are metadata-only
 */

const WEB_ORIGIN = process.env["WEB_ORIGIN"] ?? "https://ozvor.com";

import { sendResendEmail } from "./resend-send";

export interface NurtureEmailParams {
  /** Recipient email address. */
  to: string;
  /** Brand name for personalisation. */
  brand: string;
  /** One-click unsubscribe URL — must be present in every email. */
  unsubscribeUrl: string;
  /** Optional personalization: score, verdict, kitUrl, category, region etc. */
  metadata?: Record<string, unknown>;
}

/**
 * Send nurture Step 1 (free → kit): "Your AI Invisibility result + what it means".
 *
 * Best-effort: if RESEND_API_KEY is not set, throws so the caller can catch and
 * emit a structured warning without crashing the main request.
 */
export async function sendNurtureFree1Email(
  params: NurtureEmailParams
): Promise<void> {
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    throw new Error(
      "RESEND_API_KEY is not configured — nurture-free-1 email not sent"
    );
  }

  const fromAddress =
    process.env.EMAIL_FROM ?? "Ozvor <hello@ozvor.com>";

  const verdict = params.metadata?.verdict as string | undefined;
  const verdictLine = verdict
    ? `Your result: <strong>${verdict}</strong>.`
    : "Your test is complete.";
  const kitUrl = params.metadata?.kitUrl as string | undefined;
  const ctaUrl = kitUrl ?? `${WEB_ORIGIN}/test`;
  const ctaLabel = kitUrl ? "See your full report" : "Run another test";

  const subject = `"${params.brand}" is invisible to AI — here's what that costs you`;

  // ----- Plain-text body -----
  const textBody = [
    `You ran the AI Invisibility Test for ${params.brand}. ${verdict ? `Your result: ${verdict}.` : "Your test is complete."}`,
    "",
    "Here's the hard truth: brands cited in AI answers earn 120% more clicks per impression (Seer, 53 brands, 5.47M queries). ChatGPT only recommends roughly 1.2% of local businesses. You may be in the 98.8% no one sees.",
    "",
    "Here's what AI invisibility actually costs you:",
    "  - Competitors who are cited get the call before you're even considered",
    "  - Buyers pre-vetted by AI skip your site and go straight to the cited name",
    "  - Every month of delay is a month a competitor builds AI citation trust instead",
    "",
    "The fix isn't magic — it's structured. Reply to this email if you want to know where to start.",
    "",
    ctaUrl,
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
      Ozvor
    </p>
    <h1 style="font-size:22px;font-weight:700;margin:8px 0 4px 0;color:#111827;">
      Your AI Invisibility result
    </h1>
    <p style="font-size:14px;color:#6B7280;margin:0;">
      ${params.brand}
    </p>
  </div>

  <p style="color:#374151;margin-bottom:16px;">
    You ran the AI Invisibility Test for <strong>${params.brand}</strong>. ${verdictLine}
  </p>

  <p style="color:#374151;margin-bottom:16px;">
    Here's the hard truth: brands cited in AI answers earn <strong>120% more clicks per impression</strong>
    (Seer, 53 brands, 5.47M queries). ChatGPT only recommends roughly <strong>1.2% of local businesses</strong>.
    You may be in the 98.8% no one sees.
  </p>

  <!-- Cost of invisibility -->
  <div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:20px;margin-bottom:24px;">
    <h2 style="font-size:15px;font-weight:600;color:#991B1B;margin:0 0 12px 0;">
      What AI invisibility actually costs you
    </h2>
    <ul style="margin:0;padding-left:20px;color:#7F1D1D;font-size:14px;line-height:1.8;">
      <li>Competitors who are cited get the call before you're even considered</li>
      <li>Buyers pre-vetted by AI skip your site and go straight to the cited name</li>
      <li>Every month of delay is a month a competitor builds AI citation trust instead</li>
    </ul>
  </div>

  <p style="color:#374151;margin-bottom:24px;">
    The fix isn't magic — it's structured. Reply to this email if you want to know where to start.
  </p>

  <!-- CTA -->
  <div style="text-align:center;margin-bottom:32px;">
    <a href="${ctaUrl}" style="${btnStyle}">
      ${ctaLabel}
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
