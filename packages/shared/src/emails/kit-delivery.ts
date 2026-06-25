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
const KIT_BASE_URL = `${process.env["WEB_ORIGIN"] ?? "https://trustindexai.com"}/kit`;

/**
 * Send the Get-Cited Kit delivery email via Resend.
 *
 * Best-effort: if RESEND_API_KEY is not set, throws an error so the caller
 * can catch and emit a structured warning log without crashing.
 */
export async function sendKitDeliveryEmail(
  params: KitDeliveryEmailParams
): Promise<void> {
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    throw new Error(
      "RESEND_API_KEY is not configured — kit delivery email not sent"
    );
  }

  const fromAddress =
    process.env.EMAIL_FROM ?? "TrustIndex AI <hello@trustindexai.com>";

  const kitUrl = `${KIT_BASE_URL}/${params.orderToken}`;
  const subject = "Your Get-Cited Kit is ready — access it here";

  // ----- Plain-text body -----
  const textBody = [
    `Your $29 Get-Cited Kit for ${params.brand} is ready.`,
    "",
    "Click the link below to access your full audit, top-3 fixes, and 3 ready-to-publish content drafts:",
    "",
    kitUrl,
    "",
    "Questions? Reply to this email or write to hello@trustindexai.com",
    "",
    "— The TrustIndex AI Team",
    "https://trustindexai.com",
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
      Your Get-Cited Kit is ready
    </h1>
    <p style="font-size:14px;color:#6B7280;margin:0;">
      ${params.brand} &middot; $29 one-time
    </p>
  </div>

  <p style="color:#374151;margin-bottom:24px;">
    Your $29 Get-Cited Kit for <strong>${params.brand}</strong> is ready. Click below to access
    your full audit, top-3 fixes, and 3 ready-to-publish content drafts.
  </p>

  <!-- CTA -->
  <div style="text-align:center;margin-bottom:32px;">
    <a href="${kitUrl}" style="${btnStyle}">
      Access your Kit
    </a>
  </div>

  <!-- What's inside -->
  <div style="background:#F0F9FF;border:1px solid #BAE6FD;border-radius:8px;padding:20px;margin-bottom:28px;">
    <h2 style="font-size:15px;font-weight:600;color:#0C4A6E;margin:0 0 12px 0;">
      What's inside
    </h2>
    <ul style="margin:0;padding-left:20px;color:#0E7490;font-size:14px;line-height:1.8;">
      <li><strong>Full AI Visibility Audit</strong> — how ${params.brand} appears across ChatGPT, Claude, Perplexity &amp; Gemini</li>
      <li><strong>Top-3 fixes</strong> — the highest-impact changes to improve your AI citation rate</li>
      <li><strong>3 ready-to-publish content drafts</strong> — citation-worthy posts you can use immediately</li>
    </ul>
  </div>

  <!-- Footer -->
  <hr style="border:none;border-top:1px solid #E5E7EB;margin-bottom:16px;" />
  <p style="font-size:12px;color:#9CA3AF;margin:0;">
    Questions? Reply to this email or write to
    <a href="mailto:hello@trustindexai.com" style="color:#2563EB;">hello@trustindexai.com</a>
    &nbsp;&middot;&nbsp;
    <a href="https://trustindexai.com" style="color:#2563EB;">trustindexai.com</a>
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
