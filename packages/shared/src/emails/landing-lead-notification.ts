/**
 * Landing lead notification email — sent (best-effort) to a tenant's owner
 * whenever an end-customer submits the contact form on one of their published
 * Ozvor Pages sites (issue #208, PR-6: POST /api/public/landing/:siteSlug/lead).
 *
 * Subject: "New lead from your Ozvor Pages site"
 *
 * Data minimization (kit-delivery.ts / free-test-result.ts convention): the
 * lead's own PII (email, phone) is intentionally NOT forwarded to Resend in
 * this notification — only a display name and a truncated message snippet.
 * The owner views the full lead record (email/phone) inside the Ozvor
 * dashboard, not in their inbox. This keeps the amount of end-customer PII
 * flowing through the Resend sub-processor to a minimum.
 *
 * Sub-processor: Resend (architecture §11 — DPA executed, EU infrastructure).
 *
 * Hard rules:
 *   - RESEND_API_KEY from env — never hardcoded
 *   - Best-effort: caller catches all errors; email failure NEVER blocks the
 *     public lead-capture API response
 *   - No tracking pixels; no external asset references in HTML
 *   - The lead's email/phone are never included in this email body
 */

import { sendResendEmail, type ResendSendResult } from "./resend-send";

export interface LandingLeadNotificationEmailParams {
  /** Recipient — the tenant owner's email address. */
  to: string;
  /** The site's business name (landing_sites.business.name), not the raw slug. */
  siteName: string;
  /** The lead's self-reported name (may be empty — "A visitor" is used then). */
  leadName: string;
  /** The lead's message, ALREADY truncated by the caller (public route). */
  messageSnippet: string;
}

/**
 * Escape user-supplied strings for safe HTML interpolation (same pattern as
 * free-test-result.ts's escapeHtml).
 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Send the landing-lead notification email via Resend.
 *
 * Best-effort: if RESEND_API_KEY is not set, throws so the caller can catch
 * and emit a structured warning log without crashing the public API response.
 */
export async function sendLandingLeadNotificationEmail(
  params: LandingLeadNotificationEmailParams
): Promise<ResendSendResult> {
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    throw new Error(
      "RESEND_API_KEY is not configured — landing lead notification not sent"
    );
  }

  const fromAddress = process.env.EMAIL_FROM ?? "Ozvor <hello@ozvor.com>";
  const dashboardUrl = `${process.env["WEB_ORIGIN"] ?? "https://ozvor.com"}/landing-pages`;
  const subject = "New lead from your Ozvor Pages site";
  const displayName = params.leadName.trim() || "A visitor";

  // ----- Plain-text body -----
  const textBody = [
    `${displayName} just submitted the contact form on your ${params.siteName} site.`,
    "",
    params.messageSnippet ? `Message: "${params.messageSnippet}"` : "",
    "",
    `Log in to your Ozvor dashboard to view the full contact details and respond:`,
    dashboardUrl,
    "",
    "— The Ozvor Team",
    "https://ozvor.com",
  ]
    .filter((l) => l !== "")
    .join("\n");

  // ----- HTML body (Ozvor dark-first identity, email-safe) -----
  const btnStyle =
    "display:inline-block;padding:12px 24px;background:#0c7d54;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:700;font-size:14px;";

  const htmlBody = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
</head>
<body style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:0;color:#17211c;background:#ffffff;">

  <div style="background:#0c1310;padding:20px 26px;border-radius:0 0 4px 4px;">
    <p style="margin:0;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#34c388;">
      Ozvor Pages
    </p>
  </div>

  <div style="padding:26px;">
    <h1 style="font-size:20px;font-weight:800;letter-spacing:-0.02em;margin:0 0 10px 0;color:#17211c;">
      New lead from ${escapeHtml(params.siteName)}
    </h1>
    <p style="color:#3a473f;margin:0 0 20px 0;line-height:1.6;">
      <strong>${escapeHtml(displayName)}</strong> just submitted the contact form on your site.
    </p>

    ${
      params.messageSnippet
        ? `<div style="background:#eef6f1;border-left:3px solid #0c7d54;border-radius:0 8px 8px 0;padding:14px 16px;margin:0 0 22px 0;">
      <p style="margin:0;font-size:14px;color:#17211c;line-height:1.6;font-style:italic;">
        &ldquo;${escapeHtml(params.messageSnippet)}&rdquo;
      </p>
    </div>`
        : ""
    }

    <div style="text-align:center;margin:0 0 22px 0;">
      <a href="${dashboardUrl}" style="${btnStyle}">View full details &amp; respond</a>
    </div>

    <hr style="border:none;border-top:1px solid #d5dfd9;margin:0 0 14px 0;" />
    <p style="font-size:12px;color:#8a9a91;margin:0;">
      Sent by <a href="https://ozvor.com" style="color:#0c7d54;text-decoration:none;">Ozvor Pages</a>
      &nbsp;&middot;&nbsp; Questions? <a href="mailto:hello@ozvor.com" style="color:#0c7d54;text-decoration:none;">hello@ozvor.com</a>
    </p>
  </div>
</body>
</html>`;

  return sendResendEmail({
    from: fromAddress,
    to: params.to,
    subject,
    text: textBody,
    html: htmlBody,
  });
}
