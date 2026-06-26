/**
 * Nurture email — KIT → DFY sequence, Step 3
 * "Recap + founder case study — last email"
 *
 * Sub-processor: Resend (architecture §11).
 * Hard rules: RESEND_API_KEY from env, unsubscribe footer required.
 * Compliance: unsubscribeUrl in footer, no tracking pixels, no external assets.
 */

const WEB_ORIGIN = process.env["WEB_ORIGIN"] ?? "https://ozvor.com";

export interface NurtureEmailParams {
  to: string;
  brand: string;
  unsubscribeUrl: string;
  metadata?: Record<string, unknown>;
}

/**
 * Send nurture Step 3 (kit → dfy): recap + founder case study, last email in sequence.
 */
export async function sendNurtureKit3Email(
  params: NurtureEmailParams
): Promise<void> {
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    throw new Error(
      "RESEND_API_KEY is not configured — nurture-kit-3 email not sent"
    );
  }

  const fromAddress =
    process.env.EMAIL_FROM ?? "Ozvor <hello@ozvor.com>";

  const bookUrl = `${WEB_ORIGIN}/book`;
  const subject =
    "One founder's 30-day AI citation result (recap + last call)";

  // ----- Plain-text body -----
  const textBody = [
    `This is the last email we'll send about this. One founder's result — then a recap.`,
    "",
    "The result:",
    "A SaaS founder ran the Get-Cited Kit fixes over 30 days: updated their FAQ page with structured Q&A, submitted to 4 citation directories, and published 2 authority-framing posts. At day 30, ChatGPT cited their brand in 6 of 10 tracked queries. Zero citations at day 0.",
    "",
    "The data behind it:",
    "Seer tracked 53 brands across 5.47M queries. Brands cited inside AI answers saw +120% organic clicks vs uncited brands. Not a one-time spike — a compounding effect. Every citation earns trust signals that invite the next citation.",
    "",
    "The recap:",
    `Your Get-Cited Kit for ${params.brand} identified the specific gaps holding your brand back from AI citations. The fixes are there. If you haven't shipped them, the GEO Sprint is the fastest path to done.`,
    "",
    "OrganicPosts GEO Sprint: we implement your Kit fixes, publish citation-ready content, and submit to the directories AI actually cites — in 2 weeks. You review and approve; we handle the rest.",
    "",
    "Book a call: " + bookUrl,
    "",
    "— The Ozvor Team",
    "https://ozvor.com",
    "",
    "---",
    "No more emails about this from us.",
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
      Ozvor &middot; OrganicPosts
    </p>
    <h1 style="font-size:22px;font-weight:700;margin:8px 0 4px 0;color:#111827;">
      One founder&rsquo;s 30-day AI citation result
    </h1>
    <p style="font-size:14px;color:#6B7280;margin:0;">
      Recap + last call
    </p>
  </div>

  <p style="color:#374151;margin-bottom:16px;font-size:13px;font-style:italic;">
    This is the last email we&rsquo;ll send about this.
  </p>

  <!-- Founder case study -->
  <div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:8px;padding:20px;margin-bottom:24px;">
    <h2 style="font-size:15px;font-weight:600;color:#14532D;margin:0 0 12px 0;">
      The result
    </h2>
    <p style="margin:0 0 12px 0;color:#166534;font-size:14px;line-height:1.7;">
      A SaaS founder ran the Get-Cited Kit fixes over 30 days: updated their FAQ page
      with structured Q&amp;A, submitted to 4 citation directories, and published
      2 authority-framing posts.
    </p>
    <p style="margin:0;color:#166534;font-size:14px;line-height:1.7;">
      At day 30, ChatGPT cited their brand in <strong>6 of 10 tracked queries</strong>.
      Zero citations at day&nbsp;0.
    </p>
  </div>

  <!-- Stat callout -->
  <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:16px;margin-bottom:24px;">
    <p style="margin:0;color:#374151;font-size:13px;line-height:1.6;font-style:italic;">
      Seer tracked 53 brands across 5.47M queries. Brands cited inside AI answers saw
      <strong>+120% organic clicks</strong> vs uncited brands. Not a one-time spike &mdash;
      a compounding effect. Every citation earns trust signals that invite the next citation.
    </p>
  </div>

  <!-- Recap -->
  <h2 style="font-size:16px;font-weight:600;color:#111827;margin:0 0 12px 0;">
    The recap
  </h2>
  <p style="color:#374151;margin-bottom:16px;">
    Your Get-Cited Kit for <strong>${params.brand}</strong> identified the specific gaps
    holding your brand back from AI citations. The fixes are there. If you haven&rsquo;t
    shipped them, the GEO Sprint is the fastest path to done.
  </p>

  <!-- DFY callout -->
  <div style="background:#F5F3FF;border:1px solid #DDD6FE;border-radius:8px;padding:20px;margin-bottom:24px;">
    <h2 style="font-size:15px;font-weight:600;color:#4C1D95;margin:0 0 8px 0;">
      OrganicPosts GEO Sprint
    </h2>
    <p style="margin:0;color:#5B21B6;font-size:14px;line-height:1.6;">
      We implement your Kit fixes, publish citation-ready content, and submit to the
      directories AI actually cites &mdash; in 2 weeks. You review and approve; we handle
      the rest. No long-term contract.
    </p>
  </div>

  <!-- CTA -->
  <div style="text-align:center;margin-bottom:32px;">
    <a href="${bookUrl}" style="${btnStyle}">
      Book a GEO Sprint call
    </a>
  </div>

  <!-- Softer unsubscribe footer -->
  <hr style="border:none;border-top:1px solid #E5E7EB;margin:28px 0 16px 0;" />
  <p style="font-size:11px;color:#9CA3AF;margin:0;text-align:center;">
    No more emails about this from us.<br/>
    <a href="${params.unsubscribeUrl}" style="color:#6B7280;">Unsubscribe</a> &nbsp;&middot;&nbsp;
    Ozvor &middot; ozvor.com
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
