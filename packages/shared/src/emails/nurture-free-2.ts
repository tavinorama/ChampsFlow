/**
 * Nurture email — FREE → KIT sequence, Step 2
 * "Where your competitors show up and you don't"
 *
 * Sub-processor: Resend (architecture §11).
 * Hard rules: RESEND_API_KEY from env, unsubscribe footer required.
 */

const WEB_ORIGIN = process.env["WEB_ORIGIN"] ?? "https://trustindexai.com";

export interface NurtureEmailParams {
  to: string;
  brand: string;
  unsubscribeUrl: string;
  metadata?: Record<string, unknown>;
}

/**
 * Send nurture Step 2 (free → kit): competitor citation gap + Kit CTA.
 */
export async function sendNurtureFree2Email(
  params: NurtureEmailParams
): Promise<void> {
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    throw new Error(
      "RESEND_API_KEY is not configured — nurture-free-2 email not sent"
    );
  }

  const fromAddress =
    process.env.EMAIL_FROM ?? "TrustIndex AI <hello@trustindexai.com>";

  const kitUrl = `${WEB_ORIGIN}/kit`;
  const subject =
    "Your competitors are getting AI citations. Here's what they're doing differently.";

  // ----- Plain-text body -----
  const textBody = [
    `There's a reason some brands in your category get cited by ChatGPT, Claude, Perplexity, and Gemini — and others don't. ${params.brand} is currently not one of them.`,
    "",
    "A peer-reviewed study (Princeton / Georgia Tech / Allen Institute, KDD 2024) tested nine GEO tactics across 10,000 queries. Brands that added statistics, sourced claims, and clear answers got up to 40% more AI citations. Meanwhile, 72% of businesses live in a long tail the AI almost never mentions.",
    "",
    "In your category, roughly 5 brands get cited consistently across AI engines. " + params.brand + " is not yet one of them.",
    "",
    "That's what the Get-Cited Kit fixes: a full audit + your top-3 highest-impact actions + 3 citation-ready content pieces, ready to publish.",
    "",
    "Get the $29 Get-Cited Kit: " + kitUrl,
    "",
    "— The TrustIndex AI Team",
    "https://trustindexai.com",
    "",
    "---",
    "You opted in at trustindexai.com. Unsubscribe: " + params.unsubscribeUrl,
    "TrustIndex AI · trustindexai.com",
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
      TrustIndex AI
    </p>
    <h1 style="font-size:22px;font-weight:700;margin:8px 0 4px 0;color:#111827;">
      Your competitors are getting AI citations
    </h1>
    <p style="font-size:14px;color:#6B7280;margin:0;">
      Here's what they're doing differently
    </p>
  </div>

  <p style="color:#374151;margin-bottom:16px;">
    There's a reason some brands in your category get cited by ChatGPT, Claude, Perplexity, and Gemini — and others don't.
    <strong>${params.brand}</strong> is currently not one of them.
  </p>

  <!-- Research callout -->
  <div style="background:#F0F9FF;border:1px solid #BAE6FD;border-radius:8px;padding:20px;margin-bottom:24px;">
    <h2 style="font-size:15px;font-weight:600;color:#0C4A6E;margin:0 0 12px 0;">
      The science behind AI citations
    </h2>
    <p style="margin:0 0 12px 0;color:#0E7490;font-size:14px;line-height:1.6;">
      A peer-reviewed study (Princeton / Georgia Tech / Allen Institute, KDD 2024) tested nine GEO tactics
      across 10,000 real queries. Brands that added statistics, sourced claims, and clear answers got
      <strong>up to 40% more AI citations</strong>.
    </p>
    <p style="margin:0;color:#0E7490;font-size:14px;line-height:1.6;">
      Meanwhile, <strong>72% of businesses</strong> live in a long tail the AI almost never mentions.
      In your category, roughly <strong>5 brands</strong> get cited consistently across AI engines.
      ${params.brand} is not yet one of them.
    </p>
  </div>

  <p style="color:#374151;margin-bottom:24px;">
    That's what the <strong>Get-Cited Kit</strong> fixes: a full audit + your top-3 highest-impact actions
    + 3 citation-ready content pieces, ready to publish.
  </p>

  <!-- CTA -->
  <div style="text-align:center;margin-bottom:32px;">
    <a href="${kitUrl}" style="${btnStyle}">
      Get the $29 Get-Cited Kit
    </a>
  </div>

  <!-- Unsubscribe footer -->
  <hr style="border:none;border-top:1px solid #E5E7EB;margin:28px 0 16px 0;" />
  <p style="font-size:11px;color:#9CA3AF;margin:0;text-align:center;">
    You received this email because you opted in at trustindexai.com.<br/>
    <a href="${params.unsubscribeUrl}" style="color:#6B7280;">Unsubscribe</a> &nbsp;&middot;&nbsp;
    TrustIndex AI · trustindexai.com
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
