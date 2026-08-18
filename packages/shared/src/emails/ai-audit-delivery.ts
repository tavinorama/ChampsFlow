/**
 * AI Audit Stack delivery email — sent once a $49 AI Audit Stack order is paid
 * and delivered (Stripe webhook, or the sync deliver path in dev-unlock).
 *
 * FOUNDER RULE (2026-08-15): the RESULT lives INSIDE the email, not only behind
 * a link. The body renders the actual entry pick (tool name, one-liner, URL,
 * why it was picked for their business, the pains it answers) plus the honest
 * limitation + withheld count, the way free-test-result.ts renders the scorecard
 * inline. The link to /ai-audit/:token is "see it on the site".
 *
 * Upsell in the same dynamic as every other product: OrganicPosts $1.5k bundle
 * (GEO + full AI Audit) and, when this email has not run it, the free GEO test.
 *
 * Copy rules: English, no em-dash, short sentences, first-person CTAs.
 *
 * Sub-processor: Resend. RESEND_API_KEY from env. Only the recipient address is
 * PII in the payload. Best-effort: the caller catches; a failed email never
 * blocks the webhook 200 or the delivery.
 */

import { sendResendEmail, type ResendSendResult } from "./resend-send";

export interface AiAuditDeliveryEmailParams {
  to: string;
  orderToken: string;
  businessType: string;
  primaryFocus?: string;
  /** The entry pick, or null when nothing niche-fit matched (honest empty state). */
  pick: {
    name: string;
    url: string;
    oneLiner: string;
    monthlyCostUsd?: number;
    setupEffort?: string;
    hoursSavedWeekly?: number;
  } | null;
  /** One line of why this tool, for this business. */
  reason: string;
  /** Friendly pain labels (already humanized by the caller). */
  matchedPains: string[];
  totalMatched: number;
  withheldCount: number;
  /** The honest limitation line from the upsell payload. */
  limitation: string;
  /** True when the catalog numbers are estimates, not human-verified. */
  estimatesUnverified: boolean;
  /** False when this email has never run the free GEO test → cross-sell it. */
  hasFreeTest: boolean;
}

function webOrigin(): string {
  return process.env["WEB_ORIGIN"] ?? "https://ozvor.com";
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Pure: subject + text + html. Exported for the contract test. */
export function renderAiAuditDeliveryEmail(params: AiAuditDeliveryEmailParams): {
  subject: string;
  text: string;
  html: string;
} {
  const origin = webOrigin();
  const resultUrl = `${origin}/ai-audit/${params.orderToken}`;
  const organicUrl = `${origin}/organicposts`;
  const testUrl = `${origin}/test`;
  const biz = params.businessType.trim() || "your business";
  const subject = params.pick
    ? `Your AI stack pick: ${params.pick.name}`
    : "Your AI Audit Stack result";

  const withheld =
    params.totalMatched <= 1
      ? "This result shows your one best niche match."
      : `We matched ${params.totalMatched} tools to your answers. This result shows 1. The other ${params.withheldCount} wait in the full audit.`;

  const pickText = params.pick
    ? [
        `YOUR TOOL: ${params.pick.name}`,
        params.pick.oneLiner,
        `Site: ${params.pick.url}`,
        "",
        `Why this one: ${params.reason}`,
        params.matchedPains.length > 0 ? `It answers these pains you picked: ${params.matchedPains.join(", ")}` : "",
        params.pick.hoursSavedWeekly != null
          ? `Estimated: about ${params.pick.hoursSavedWeekly}h back per week, ${params.pick.setupEffort ?? "medium"} setup, about $${params.pick.monthlyCostUsd ?? 0}/mo.`
          : "",
      ].filter((l) => l !== "")
    : [
        "NO CLEAR NICHE FIT YET",
        "Your answers did not match a niche tool we trust. That is rare, and honest.",
        params.reason,
        `A short call finds your fit faster: ${origin}/book`,
      ];

  const textBody = [
    `Your AI Audit Stack result for ${biz} is ready.`,
    "",
    ...pickText,
    "",
    "THE HONEST LIMIT",
    params.limitation,
    withheld,
    params.estimatesUnverified ? "Numbers here are estimates. We verify them in the full audit." : "",
    "",
    `See it on the site: ${resultUrl}`,
    "",
    "WHAT THE FULL AUDIT ADDS",
    "The full AI Audit Stack ranks every matched tool, maps your quick wins, plans your first days, and shows your monthly ROI. You get it inside OrganicPosts, together with your Ozvor GEO Search audit. From $1,500.",
    `Get my full audit: ${organicUrl}`,
    "",
    ...(params.hasFreeTest
      ? []
      : [
          "FREE GEO TEST",
          "See how ChatGPT, Claude, Perplexity and Gemini describe your brand today. Two fields, one minute, free.",
          `Run my free test: ${testUrl}`,
          "",
        ]),
    "Questions? Reply to this email or write to hello@ozvor.com",
    "",
    "The Ozvor Team",
    origin,
  ]
    .filter((l) => l !== undefined)
    .join("\n");

  const btnStyle =
    "display:inline-block;padding:13px 26px;background:#0c7d54;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:700;font-size:15px;";
  const ghostBtn =
    "display:inline-block;padding:11px 22px;border:1.5px solid #0c7d54;color:#0c7d54;text-decoration:none;border-radius:8px;font-weight:700;font-size:14px;";
  const linkStyle = "color:#0c7d54;text-decoration:none;";

  const pickHtml = params.pick
    ? `
    <div style="border:1px solid #bfe3d1;border-radius:10px;padding:20px;margin:0 0 20px 0;background:#f4faf7;">
      <p style="margin:0 0 6px 0;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:#5c6e65;">Your one niche tool</p>
      <h2 style="margin:0 0 8px 0;font-size:22px;font-weight:800;color:#17211c;">${esc(params.pick.name)}</h2>
      <p style="margin:0 0 12px 0;font-size:15px;color:#17211c;line-height:1.6;">${esc(params.pick.oneLiner)}</p>
      <p style="margin:0 0 12px 0;font-size:14px;color:#3a473f;line-height:1.6;"><strong>Why this one:</strong> ${esc(params.reason)}</p>
      ${
        params.matchedPains.length > 0
          ? `<p style="margin:0 0 12px 0;font-size:13px;color:#3a473f;line-height:1.6;"><strong>It answers these pains you picked:</strong> ${params.matchedPains.map(esc).join(", ")}</p>`
          : ""
      }
      ${
        params.pick.hoursSavedWeekly != null
          ? `<p style="margin:0 0 14px 0;font-size:13px;color:#5c6e65;line-height:1.6;">Estimated: about ${params.pick.hoursSavedWeekly}h back per week, ${esc(params.pick.setupEffort ?? "medium")} setup, about $${params.pick.monthlyCostUsd ?? 0}/mo.</p>`
          : ""
      }
      <a href="${esc(params.pick.url)}" style="${ghostBtn}">Visit the tool site</a>
    </div>`
    : `
    <div style="border:1px solid #d5dfd9;border-radius:10px;padding:20px;margin:0 0 20px 0;background:#f7f9f8;">
      <h2 style="margin:0 0 8px 0;font-size:20px;font-weight:800;color:#17211c;">No clear niche fit yet</h2>
      <p style="margin:0 0 8px 0;font-size:14px;color:#3a473f;line-height:1.6;">Your answers did not match a niche tool we trust. That is rare, and honest.</p>
      <p style="margin:0 0 14px 0;font-size:14px;color:#3a473f;line-height:1.6;">${esc(params.reason)}</p>
      <a href="${origin}/book" style="${ghostBtn}">Book my free call</a>
    </div>`;

  const htmlBody = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(subject)}</title>
</head>
<body style="font-family:system-ui,-apple-system,sans-serif;max-width:600px;margin:0 auto;padding:0;color:#17211c;background:#ffffff;">
  <div style="background:#0c1310;padding:22px 28px;border-radius:0 0 4px 4px;">
    <p style="margin:0;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#34c388;">Ozvor</p>
  </div>
  <div style="padding:28px;">
    <h1 style="font-size:24px;font-weight:800;letter-spacing:-0.02em;margin:0 0 6px 0;color:#17211c;">Your AI Audit Stack result</h1>
    <p style="font-size:14px;color:#5c6e65;margin:0 0 22px 0;">${esc(biz)}${params.primaryFocus ? ` &middot; ${esc(params.primaryFocus)}` : ""}</p>

    ${pickHtml}

    <div style="background:#eef6f1;border-left:3px solid #0c7d54;border-radius:0 8px 8px 0;padding:14px 18px;margin:0 0 22px 0;">
      <p style="margin:0 0 6px 0;font-size:13px;color:#17211c;line-height:1.6;"><strong>The honest limit.</strong> ${esc(params.limitation)}</p>
      <p style="margin:0;font-size:13px;color:#3a473f;line-height:1.6;">${esc(withheld)}</p>
      ${params.estimatesUnverified ? `<p style="margin:6px 0 0 0;font-size:12px;color:#5c6e65;line-height:1.5;">Numbers here are estimates. We verify them in the full audit.</p>` : ""}
    </div>

    <div style="text-align:center;margin:0 0 28px 0;">
      <a href="${resultUrl}" style="${btnStyle}">See my result on the site</a>
    </div>

    <div style="background:#f2f6f3;border:1px solid #d5dfd9;border-radius:10px;padding:20px;margin:0 0 20px 0;">
      <h2 style="font-size:15px;font-weight:700;color:#17211c;margin:0 0 8px 0;">What the full audit adds</h2>
      <p style="margin:0 0 12px 0;font-size:14px;color:#3a473f;line-height:1.6;">
        The full AI Audit Stack ranks every matched tool, maps your quick wins, plans your first days, and shows your monthly ROI.
        You get it inside <strong>OrganicPosts</strong>, together with your Ozvor GEO Search audit. From $1,500.
      </p>
      <a href="${organicUrl}" style="${linkStyle}font-weight:600;font-size:14px;">Get my full audit &rarr;</a>
    </div>
    ${
      params.hasFreeTest
        ? ""
        : `
    <div style="border:1px solid #d5dfd9;border-radius:10px;padding:20px;margin:0 0 20px 0;">
      <h2 style="font-size:15px;font-weight:700;color:#17211c;margin:0 0 8px 0;">Free GEO test</h2>
      <p style="margin:0 0 12px 0;font-size:14px;color:#3a473f;line-height:1.6;">
        See how ChatGPT, Claude, Perplexity and Gemini describe your brand today. Two fields, one minute, free.
      </p>
      <a href="${testUrl}" style="${linkStyle}font-weight:600;font-size:14px;">Run my free test &rarr;</a>
    </div>`
    }

    <hr style="border:none;border-top:1px solid #d5dfd9;margin:0 0 16px 0;" />
    <p style="font-size:12px;color:#8a9a91;margin:0;">
      Questions? Reply to this email or write to
      <a href="mailto:hello@ozvor.com" style="${linkStyle}">hello@ozvor.com</a>
      &nbsp;&middot;&nbsp;
      <a href="${origin}" style="${linkStyle}">ozvor.com</a>
    </p>
  </div>
</body>
</html>`;

  return { subject, text: textBody, html: htmlBody };
}

export async function sendAiAuditDeliveryEmail(
  params: AiAuditDeliveryEmailParams
): Promise<ResendSendResult> {
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    throw new Error("RESEND_API_KEY is not configured — ai audit delivery email not sent");
  }
  const fromAddress = process.env.EMAIL_FROM ?? "Ozvor <hello@ozvor.com>";
  const { subject, text, html } = renderAiAuditDeliveryEmail(params);
  return sendResendEmail({ from: fromAddress, to: params.to, subject, text, html });
}
