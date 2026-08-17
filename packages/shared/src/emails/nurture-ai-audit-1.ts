/**
 * Nurture email — AI AUDIT → FULL sequence, Step 1
 * "One tool was the start. Here is the whole stack."
 *
 * A $49 AI Audit Stack buyer saw ONE niche tool and the count of what was held
 * back. The natural next rung is the full AI Audit Stack inside OrganicPosts
 * ($1.5k, bundled with the Ozvor GEO Search audit).
 *
 * Copy rules: English, no em-dash, short sentences, first-person CTA.
 * Sub-processor: Resend. RESEND_API_KEY from env, unsubscribe footer.
 */

const WEB_ORIGIN = process.env["WEB_ORIGIN"] ?? "https://ozvor.com";

import { sendResendEmail } from "./resend-send";

export interface NurtureEmailParams {
  to: string;
  brand: string;
  unsubscribeUrl: string;
  metadata?: Record<string, unknown>;
}

export async function sendNurtureAiAudit1Email(params: NurtureEmailParams): Promise<void> {
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    throw new Error("RESEND_API_KEY is not configured — nurture-ai-audit-1 email not sent");
  }
  const fromAddress = process.env.EMAIL_FROM ?? "Ozvor <hello@ozvor.com>";
  const organicUrl = `${WEB_ORIGIN}/organicposts`;
  const md = params.metadata ?? {};
  const pick = typeof md["pick"] === "string" && md["pick"] ? (md["pick"] as string) : null;
  const total = typeof md["totalMatched"] === "number" ? (md["totalMatched"] as number) : null;
  const subject = "One tool was the start. Here is the whole stack.";

  const opener = pick
    ? `Your AI Audit Stack result picked ${pick} for ${params.brand}. Good. Now the honest part.`
    : `Your AI Audit Stack result gave ${params.brand} a first read. Now the honest part.`;
  const held =
    total && total > 1
      ? `We matched ${total} tools to your answers. You saw one.`
      : "We only showed you the first match.";

  const textBody = [
    opener,
    "",
    held,
    "The full AI Audit Stack ranks every tool, maps your quick wins, plans your first days, and shows your monthly ROI. It comes inside OrganicPosts, together with your Ozvor GEO Search audit. Our team does the work. You approve.",
    "",
    "Get my full audit: " + organicUrl,
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

  const htmlBody = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
</head>
<body style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111827;background:#ffffff;">
  <div style="margin-bottom:24px;">
    <p style="margin:0;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:1px;color:#0c7d54;">Ozvor AI Audit Stack</p>
    <h1 style="font-size:22px;font-weight:700;margin:8px 0 4px 0;color:#111827;">One tool was the start</h1>
    <p style="font-size:14px;color:#6B7280;margin:0;">${params.brand} &middot; the whole stack</p>
  </div>
  <p style="color:#374151;margin-bottom:16px;">${opener}</p>
  <p style="color:#374151;margin-bottom:16px;">${held}</p>
  <div style="background:#ECFDF5;border:1px solid #A7F3D0;border-radius:8px;padding:20px;margin-bottom:24px;">
    <h2 style="font-size:15px;font-weight:600;color:#065F46;margin:0 0 8px 0;">The full AI Audit Stack, inside OrganicPosts</h2>
    <p style="margin:0;color:#047857;font-size:14px;line-height:1.6;">Ranks every tool, maps your quick wins, plans your first days, shows your monthly ROI. Bundled with your Ozvor GEO Search audit. Our team does the work. You approve. From $1,500.</p>
  </div>
  <div style="text-align:center;margin-bottom:32px;">
    <a href="${organicUrl}" style="${btnStyle}">Get my full audit</a>
  </div>
  <hr style="border:none;border-top:1px solid #E5E7EB;margin:28px 0 16px 0;" />
  <p style="font-size:11px;color:#9CA3AF;margin:0;text-align:center;">
    You received this email because you bought the AI Audit Stack at ozvor.com.<br/>
    <a href="${params.unsubscribeUrl}" style="color:#6B7280;">Unsubscribe</a> &nbsp;&middot;&nbsp; Ozvor · ozvor.com
  </p>
</body>
</html>`;

  await sendResendEmail({ from: fromAddress, to: params.to, subject, text: textBody, html: htmlBody });
}
