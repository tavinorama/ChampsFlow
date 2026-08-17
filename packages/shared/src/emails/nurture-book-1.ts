/**
 * Nurture email — BOOK → DFY sequence, Step 1
 * "Still want that call? Here is what we would cover."
 *
 * Someone left an email on /book (a strategy call intake). Whether or not
 * they finished booking, this is the one gentle nudge: what the call covers,
 * and the link to pick a time. Sequence shell (D3, 2026-08-17); cadence is
 * being reworked separately.
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

export async function sendNurtureBook1Email(params: NurtureEmailParams): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not configured — nurture-book-1 email not sent");
  }
  const fromAddress = process.env.EMAIL_FROM ?? "Ozvor <hello@ozvor.com>";
  const bookUrl = `${WEB_ORIGIN}/book`;
  const testUrl = `${WEB_ORIGIN}/test`;
  const brand = params.brand || "your brand";
  const subject = "Still want that call? Here is what we cover.";

  const textBody = [
    `You left your email to book a strategy call about ${brand}. Thank you.`,
    "",
    "In 20 minutes we look at how AI engines describe you today, name the gaps that cost you citations, and map the three actions with the biggest impact. No pitch. If we are not a fit, we say so.",
    "",
    "Pick my time: " + bookUrl,
    "",
    "Want something concrete before we talk? Run the free test: " + testUrl,
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
  <p style="margin:0;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:1px;color:#0c7d54;">Ozvor</p>
  <h1 style="font-size:22px;font-weight:700;margin:8px 0 16px 0;color:#111827;">Still want that call?</h1>
  <p style="color:#374151;margin:0 0 16px 0;">You left your email to book a strategy call about ${escapeHtml(brand)}. Thank you.</p>
  <p style="color:#374151;margin:0 0 20px 0;">In 20 minutes we look at how AI engines describe you today, name the gaps that cost you citations, and map the three actions with the biggest impact. No pitch. If we are not a fit, we say so.</p>
  <div style="text-align:center;margin:0 0 24px 0;"><a href="${bookUrl}" style="${btnStyle}">Pick my time</a></div>
  <p style="color:#6B7280;font-size:14px;margin:0;">Want something concrete before we talk? <a href="${testUrl}" style="color:#0c7d54;">Run the free test</a>.</p>
  <hr style="border:none;border-top:1px solid #E5E7EB;margin:28px 0 16px 0;" />
  <p style="font-size:11px;color:#9CA3AF;margin:0;text-align:center;">You left your email at ozvor.com/book.<br/><a href="${params.unsubscribeUrl}" style="color:#6B7280;">Unsubscribe</a> &nbsp;&middot;&nbsp; Ozvor · ozvor.com</p>
</body></html>`;

  await sendResendEmail({ from: fromAddress, to: params.to, subject, text: textBody, html: htmlBody });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
