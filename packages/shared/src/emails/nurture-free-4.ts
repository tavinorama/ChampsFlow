/**
 * Nurture email — FREE → KIT sequence, Step 4
 * "Last call (founder scarcity)"
 *
 * Sub-processor: Resend (architecture §11).
 * Hard rules: RESEND_API_KEY from env, unsubscribe footer required.
 */

const WEB_ORIGIN = process.env["WEB_ORIGIN"] ?? "https://ozvor.com";

export interface NurtureEmailParams {
  to: string;
  brand: string;
  unsubscribeUrl: string;
  metadata?: Record<string, unknown>;
}

/**
 * Send nurture Step 4 (free → kit): last call, compounding trust loop.
 */
export async function sendNurtureFree4Email(
  params: NurtureEmailParams
): Promise<void> {
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    throw new Error(
      "RESEND_API_KEY is not configured — nurture-free-4 email not sent"
    );
  }

  const fromAddress =
    process.env.EMAIL_FROM ?? "Ozvor <hello@ozvor.com>";

  const kitUrl = `${WEB_ORIGIN}/kit`;
  const subject = "Last email about the Kit — one thing to consider";

  // ----- Plain-text body -----
  const textBody = [
    "This is the last email in this series. No pressure.",
    "",
    "But one thing worth knowing: the AI \"citation trust loop\" is compounding. Brands the AI cites today get more trust signals, which means more citations tomorrow. Every month of delay is a month a competitor builds that trust instead.",
    "",
    `Microsoft's data across 1,277 sites shows visitors from AI sign up at 11x the rate of search visitors — not because AI is magic, but because it pre-qualifies the buyer before they ever land on your site.`,
    "",
    `If ${params.brand} ever decides to fix the AI visibility gap, the Kit is $29. No subscription. You can start today or wait — the gap just grows either way.`,
    "",
    "Get the Kit: " + kitUrl,
    "",
    "— The Ozvor Team",
    "https://ozvor.com",
    "",
    "---",
    "No more emails about this from us — if you ever want the Kit, it's at ozvor.com/kit.",
    "Unsubscribe: " + params.unsubscribeUrl,
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
      Last email about the Kit
    </h1>
    <p style="font-size:14px;color:#6B7280;margin:0;">
      One thing to consider
    </p>
  </div>

  <p style="color:#374151;margin-bottom:16px;">
    This is the last email in this series. No pressure.
  </p>

  <p style="color:#374151;margin-bottom:16px;">
    But one thing worth knowing: the AI &ldquo;citation trust loop&rdquo; is compounding.
    Brands the AI cites today get more trust signals, which means more citations tomorrow.
    Every month of delay is a month a competitor builds that trust instead.
  </p>

  <!-- Stat callout -->
  <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:20px;margin-bottom:24px;">
    <p style="margin:0;color:#374151;font-size:14px;line-height:1.7;">
      Microsoft&rsquo;s data across 1,277 sites shows visitors from AI sign up at
      <strong>11x the rate</strong> of search visitors &mdash; not because AI is magic,
      but because it pre-qualifies the buyer before they ever land on your site.
    </p>
  </div>

  <p style="color:#374151;margin-bottom:24px;">
    If <strong>${params.brand}</strong> ever decides to fix the AI visibility gap, the Kit is $29.
    No subscription. You can start today or wait — the gap just grows either way.
  </p>

  <!-- CTA -->
  <div style="text-align:center;margin-bottom:32px;">
    <a href="${kitUrl}" style="${btnStyle}">
      Get the Kit
    </a>
  </div>

  <!-- Softer unsubscribe footer -->
  <hr style="border:none;border-top:1px solid #E5E7EB;margin:28px 0 16px 0;" />
  <p style="font-size:11px;color:#9CA3AF;margin:0;text-align:center;">
    No more emails about this from us — if you ever want the Kit, it's at ozvor.com/kit.<br/>
    <a href="${params.unsubscribeUrl}" style="color:#6B7280;">Unsubscribe</a> &nbsp;&middot;&nbsp;
    Ozvor · ozvor.com
  </p>
</body>
</html>`;

  const { Resend } = await import("resend");
  const resend = new Resend(resendApiKey);

  await resend.emails.send({
    from: fromAddress,
    to: params.to,
    subject,
    text: textBody,
    html: htmlBody,
  });
}
