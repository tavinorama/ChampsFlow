/**
 * Nurture email — KIT → DFY sequence, Step 2
 * "Want us to do it for you? OrganicPosts GEO Sprint"
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
 * Send nurture Step 2 (kit → dfy): OrganicPosts GEO Sprint done-for-you offer.
 */
export async function sendNurtureKit2Email(
  params: NurtureEmailParams
): Promise<void> {
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    throw new Error(
      "RESEND_API_KEY is not configured — nurture-kit-2 email not sent"
    );
  }

  const fromAddress =
    process.env.EMAIL_FROM ?? "Ozvor <hello@ozvor.com>";

  const bookUrl = `${WEB_ORIGIN}/book`;
  const subject = "Want us to handle your GEO fix? OrganicPosts GEO Sprint";

  // ----- Plain-text body -----
  const textBody = [
    `If you haven't acted on your Kit fixes yet for ${params.brand}, here's what OrganicPosts by TrustIndex AI can do for you:`,
    "",
    "1. Implement your top-3 GEO fixes in 2 weeks",
    "2. Publish 3 citation-ready content pieces optimized for AI engines",
    "3. Submit your brand to the right directories and review platforms that AI cites most",
    "",
    "This is done-for-you. You review and approve; we publish. No long-term commitment — start with a single sprint.",
    "",
    "Brands cited inside AI answers get +120% organic clicks vs uncited brands (Seer, 53 brands, 5.47M queries). One sprint can move you from invisible to visible.",
    "",
    "Book a free GEO Sprint call: " + bookUrl,
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
      Want us to handle your GEO fix?
    </h1>
    <p style="font-size:14px;color:#6B7280;margin:0;">
      OrganicPosts GEO Sprint — done-for-you
    </p>
  </div>

  <p style="color:#374151;margin-bottom:24px;">
    If you haven't acted on your Kit fixes yet for <strong>${params.brand}</strong>, here's what
    OrganicPosts by TrustIndex AI can do for you:
  </p>

  <!-- Services list -->
  <div style="background:#F0F9FF;border:1px solid #BAE6FD;border-radius:8px;padding:20px;margin-bottom:24px;">
    <h2 style="font-size:15px;font-weight:600;color:#0C4A6E;margin:0 0 12px 0;">
      GEO Sprint — what's included
    </h2>
    <ol style="margin:0;padding-left:20px;color:#0E7490;font-size:14px;line-height:1.9;">
      <li><strong>Implement your top-3 GEO fixes</strong> in 2 weeks</li>
      <li><strong>Publish 3 citation-ready content pieces</strong> optimized for AI engines</li>
      <li><strong>Submit your brand</strong> to the right directories and review platforms that AI cites most</li>
    </ol>
  </div>

  <p style="color:#374151;margin-bottom:16px;">
    This is done-for-you. You review and approve; we publish. No long-term commitment — start
    with a single sprint.
  </p>

  <!-- Stat callout -->
  <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:16px;margin-bottom:24px;">
    <p style="margin:0;color:#374151;font-size:13px;line-height:1.6;font-style:italic;">
      Brands cited inside AI answers get <strong>+120% organic clicks</strong> vs uncited brands
      (Seer, 53 brands, 5.47M queries). One sprint can move you from invisible to visible.
    </p>
  </div>

  <!-- CTA -->
  <div style="text-align:center;margin-bottom:32px;">
    <a href="${bookUrl}" style="${btnStyle}">
      Book a free GEO Sprint call
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
