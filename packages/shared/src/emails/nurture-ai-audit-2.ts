/**
 * Nurture email — AI AUDIT → FULL sequence, Step 2
 * Cross-sell rung. Two variants chosen by metadata.hasFreeTest:
 *   - hasFreeTest=false → "Now see how AI describes your brand" (free GEO test)
 *   - hasFreeTest=true  → the bundle reminder with the book-a-call door
 *
 * Copy rules: English, no em-dash, short sentences, first-person CTA.
 * Sub-processor: Resend. RESEND_API_KEY from env, unsubscribe footer.
 */

const WEB_ORIGIN = process.env["WEB_ORIGIN"] ?? "https://ozvor.com";

import { sendResendEmail } from "./resend-send";
import type { NurtureEmailParams } from "./nurture-ai-audit-1";

export async function sendNurtureAiAudit2Email(params: NurtureEmailParams): Promise<void> {
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    throw new Error("RESEND_API_KEY is not configured — nurture-ai-audit-2 email not sent");
  }
  const fromAddress = process.env.EMAIL_FROM ?? "Ozvor <hello@ozvor.com>";
  const hasFreeTest = params.metadata?.["hasFreeTest"] === true;
  const testUrl = `${WEB_ORIGIN}/test`;
  const bookUrl = `${WEB_ORIGIN}/book`;
  const organicUrl = `${WEB_ORIGIN}/organicposts`;

  const subject = hasFreeTest
    ? "Your stack, your GEO, one plan"
    : "Now see how AI describes your brand";

  const ctaUrl = hasFreeTest ? bookUrl : testUrl;
  const ctaLabel = hasFreeTest ? "Book my free call" : "Run my free test";

  const lines = hasFreeTest
    ? [
        `You have your first AI tool for ${params.brand}. You have run the free GEO test. The two connect.`,
        "",
        "OrganicPosts runs both for you: the full AI Audit Stack and the GEO plan that gets your brand named by AI search. One team, one plan, you approve every step.",
        "",
        "Not sure it fits? A 20-minute call answers that. No pitch.",
        `${ctaLabel}: ${ctaUrl}`,
        `See OrganicPosts: ${organicUrl}`,
      ]
    : [
        `You picked your first AI tool for ${params.brand}. Now the other side of the coin.`,
        "",
        "When a customer asks ChatGPT, Claude, Perplexity or Gemini who to hire, does your name come up? Our free GEO test shows you in one minute. Two fields. Free.",
        "",
        `${ctaLabel}: ${ctaUrl}`,
        "",
        "Both audits, GEO and AI stack, come together inside OrganicPosts.",
        `See OrganicPosts: ${organicUrl}`,
      ];

  const textBody = [
    ...lines,
    "",
    "The Ozvor Team",
    WEB_ORIGIN,
    "",
    "---",
    "You bought the AI Audit Stack at ozvor.com. Unsubscribe: " + params.unsubscribeUrl,
    "Ozvor · ozvor.com",
  ].join("\n");

  const btnStyle =
    "display:inline-block;padding:12px 24px;background:#0c7d54;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:15px;";

  const bodyHtml = hasFreeTest
    ? `
  <p style="color:#374151;margin-bottom:16px;">You have your first AI tool for <strong>${params.brand}</strong>. You have run the free GEO test. The two connect.</p>
  <p style="color:#374151;margin-bottom:16px;">OrganicPosts runs both for you: the full AI Audit Stack and the GEO plan that gets your brand named by AI search. One team, one plan, you approve every step.</p>
  <p style="color:#374151;margin-bottom:16px;">Not sure it fits? A 20-minute call answers that. No pitch.</p>`
    : `
  <p style="color:#374151;margin-bottom:16px;">You picked your first AI tool for <strong>${params.brand}</strong>. Now the other side of the coin.</p>
  <p style="color:#374151;margin-bottom:16px;">When a customer asks ChatGPT, Claude, Perplexity or Gemini who to hire, does your name come up? Our free GEO test shows you in one minute. Two fields. Free.</p>`;

  const htmlBody = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
</head>
<body style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111827;background:#ffffff;">
  <div style="margin-bottom:24px;">
    <p style="margin:0;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:1px;color:#0c7d54;">Ozvor</p>
    <h1 style="font-size:22px;font-weight:700;margin:8px 0 4px 0;color:#111827;">${subject}</h1>
    <p style="font-size:14px;color:#6B7280;margin:0;">${params.brand}</p>
  </div>
  ${bodyHtml}
  <div style="text-align:center;margin-bottom:24px;">
    <a href="${ctaUrl}" style="${btnStyle}">${ctaLabel}</a>
  </div>
  <p style="color:#374151;font-size:14px;margin-bottom:32px;text-align:center;">Both audits, GEO and AI stack, come together inside <a href="${organicUrl}" style="color:#0c7d54;">OrganicPosts</a>.</p>
  <hr style="border:none;border-top:1px solid #E5E7EB;margin:28px 0 16px 0;" />
  <p style="font-size:11px;color:#9CA3AF;margin:0;text-align:center;">
    You received this email because you bought the AI Audit Stack at ozvor.com.<br/>
    <a href="${params.unsubscribeUrl}" style="color:#6B7280;">Unsubscribe</a> &nbsp;&middot;&nbsp; Ozvor · ozvor.com
  </p>
</body>
</html>`;

  await sendResendEmail({ from: fromAddress, to: params.to, subject, text: textBody, html: htmlBody });
}
