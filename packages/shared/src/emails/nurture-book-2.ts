/**
 * Nurture email — BOOK → DFY sequence, Step 2 (last)
 * "We do the work. You approve."
 *
 * The honest OrganicPosts pitch for someone who wanted a call: what done-for-you
 * GEO looks like, what it includes (weekly execution, the full AI Audit Stack,
 * a chat with an SLA), and one link to book. Sequence shell (D3, 2026-08-17).
 *
 * Copy rules: English, no em-dash, short sentences, first-person CTA.
 * Sub-processor: Resend. RESEND_API_KEY from env, unsubscribe footer.
 */

import { sendResendEmail } from "./resend-send";

const WEB_ORIGIN = process.env["WEB_ORIGIN"] ?? "https://ozvor.com";

export interface NurtureEmailParams {
  to: string;
  brand: string;
  unsubscribeUrl: string;
  metadata?: Record<string, unknown>;
}

export async function sendNurtureBook2Email(params: NurtureEmailParams): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not configured — nurture-book-2 email not sent");
  }
  const fromAddress = process.env.EMAIL_FROM ?? "Ozvor <hello@ozvor.com>";
  const bookUrl = `${WEB_ORIGIN}/book`;
  const organicUrl = `${WEB_ORIGIN}/organicposts`;
  const brand = params.brand || "your brand";
  const subject = "We do the work. You approve.";

  const textBody = [
    `Most teams know what to fix for ${brand}. Few have the hours to do it. That is what OrganicPosts is for.`,
    "",
    "What it includes:",
    "- Done-for-you GEO: we write, publish and fix. You approve.",
    "- The full AI Audit Stack: the right AI tools for your real pains, ranked.",
    "- Weekly execution and a report you can read in two minutes.",
    "- A chat with us, with a reply time we commit to.",
    "",
    "Book my call: " + bookUrl,
    "See what is inside: " + organicUrl,
    "",
    "This is the last email in this short series. No pressure.",
    "",
    "The Ozvor Team",
    WEB_ORIGIN,
    "",
    "---",
    "You left your email at ozvor.com/book. Unsubscribe: " + params.unsubscribeUrl,
    "Ozvor · ozvor.com",
  ].join("\n");

  const btnStyle =
    "display:inline-block;padding:12px 24px;background:#0c7d54;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:15px;";

  const htmlBody = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>${subject}</title></head>
<body style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111827;background:#ffffff;">
  <p style="margin:0;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:1px;color:#0c7d54;">OrganicPosts by Ozvor</p>
  <h1 style="font-size:22px;font-weight:700;margin:8px 0 16px 0;color:#111827;">We do the work. You approve.</h1>
  <p style="color:#374151;margin:0 0 16px 0;">Most teams know what to fix for ${escapeHtml(brand)}. Few have the hours to do it. That is what OrganicPosts is for.</p>
  <ul style="color:#374151;margin:0 0 20px 0;padding-left:20px;line-height:1.7;">
    <li>Done-for-you GEO: we write, publish and fix. You approve.</li>
    <li>The full AI Audit Stack: the right AI tools for your real pains, ranked.</li>
    <li>Weekly execution and a report you can read in two minutes.</li>
    <li>A chat with us, with a reply time we commit to.</li>
  </ul>
  <div style="text-align:center;margin:0 0 16px 0;"><a href="${bookUrl}" style="${btnStyle}">Book my call</a></div>
  <p style="color:#6B7280;font-size:14px;margin:0 0 8px 0;text-align:center;"><a href="${organicUrl}" style="color:#0c7d54;">See what is inside</a></p>
  <p style="color:#6B7280;font-size:13px;margin:16px 0 0 0;">This is the last email in this short series. No pressure.</p>
  <hr style="border:none;border-top:1px solid #E5E7EB;margin:28px 0 16px 0;" />
  <p style="font-size:11px;color:#9CA3AF;margin:0;text-align:center;">You left your email at ozvor.com/book.<br/><a href="${params.unsubscribeUrl}" style="color:#6B7280;">Unsubscribe</a> &nbsp;&middot;&nbsp; Ozvor · ozvor.com</p>
</body></html>`;

  await sendResendEmail({ from: fromAddress, to: params.to, subject, text: textBody, html: htmlBody });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
