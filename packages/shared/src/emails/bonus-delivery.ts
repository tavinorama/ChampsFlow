/**
 * Bonus delivery email — sent after a new paid subscription is confirmed
 * (checkout.session.completed for Growth or Agency plan).
 *
 * Subject: "Your Ozvor bonuses are ready — here's what to do first"
 * Content: Welcome + 4 downloadable bonus assets + first-action guidance.
 *
 * Sub-processor: Resend (architecture §11 — DPA executed, EU infrastructure,
 *   data minimization: only email address + plan label sent to Resend; no PII
 *   beyond recipient address in the request body).
 *
 * Hard rules:
 *   - RESEND_API_KEY from env — never hardcoded
 *   - Data minimization: plan label only (no billing IDs, no card data)
 *   - Best-effort: caller catches all errors; email failure does NOT block webhook 200
 *   - No full PII beyond recipient email address sent to Resend
 *   - No tracking pixels; no external asset references in HTML
 */

import { sendResendEmail } from "./resend-send";

export interface BonusDeliveryEmailParams {
  /** Recipient email address (the new paying customer). */
  to: string;
  /** Plan tier the customer signed up for. */
  plan: "growth" | "agency";
  /** True when the customer chose annual billing. */
  annual?: boolean;
}

const DASHBOARD_URL = "https://ozvor.com/dashboard";
const AGENCIES_URL = "https://ozvor.com/agencies";
const ORGANICPOSTS_URL = "https://ozvor.com/organicposts";

const BONUS_ASSETS = [
  {
    label: "The GEO Visibility Guide (PDF)",
    url: "https://ozvor.com/downloads/The-GEO-Visibility-Guide.pdf",
    resourcePage: "https://ozvor.com/resources/geo-visibility-guide",
    description:
      "Your practical playbook for getting named by ChatGPT, Claude, Perplexity and Google AI Overviews — starts with a 10-minute check you can run today.",
  },
  {
    label: "5 High-Citation Post Templates (PDF)",
    url: "https://ozvor.com/downloads/5-High-Citation-Post-Templates.pdf",
    resourcePage: "https://ozvor.com/resources/5-high-citation-post-templates",
    description:
      "Fill-in-the-blank content structures engineered to get your business cited — a usable template on page one.",
  },
  {
    label: "LLM Citation Tracker spreadsheet (.xlsx)",
    url: "https://ozvor.com/downloads/LLM-Citation-Tracker.xlsx",
    description:
      "The working spreadsheet for tracking when AI names your brand versus your competitors.",
  },
  {
    label: "LLM Citation Tracker methodology (PDF)",
    url: "https://ozvor.com/downloads/LLM-Citation-Tracker-Methodology.pdf",
    description:
      "The 10-minute weekly routine and scoring method that explains how to use the spreadsheet.",
  },
] as const;

/**
 * Send the bonus delivery welcome email via Resend.
 *
 * Best-effort: if RESEND_API_KEY is not set, throws an error so the caller
 * can catch and emit a structured warning log without crashing.
 */
export async function sendBonusDeliveryEmail(
  params: BonusDeliveryEmailParams
): Promise<void> {
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    throw new Error(
      "RESEND_API_KEY is not configured — bonus delivery email not sent"
    );
  }

  const fromAddress =
    process.env.EMAIL_FROM ?? "Ozvor <hello@ozvor.com>";

  const planLabel =
    params.plan === "agency" ? "Agency" : "Growth";
  const isAgency = params.plan === "agency";
  const billingLabel = params.annual ? "annual" : "monthly";
  const isAgencyAnnual = params.plan === "agency" && params.annual === true;

  // Plan-specific value line (Growth vs Agency).
  const planValue = isAgency
    ? "You've got white-label AI-visibility for up to 25 client brands, 10 competitors each, and priority support — everything you need to run GEO as a line item across your whole book."
    : "You've got weekly re-audits and alerts across all 5 engines, plus publish-ready content drafts generated in your brand voice.";

  const subject =
    "Your Ozvor bonuses are ready — here's what to do first";

  // ----- Plain-text body -----
  const bonusLines = BONUS_ASSETS.map(
    (b, i) => `${i + 1}. ${b.label}\n   ${b.url}`
  ).join("\n\n");

  const agencyPerkLine = isAgencyAnnual
    ? "\nAgency Annual perk: Your complimentary website/landing-page GEO audit is included. Reply to this email when you're ready to schedule it.\n"
    : "";

  const ladderLine = isAgency
    ? `Want your clients' plans executed for them? OrganicPosts by Ozvor runs the whole GEO program done-for-you: ${ORGANICPOSTS_URL}`
    : `Want it done for you instead? OrganicPosts by Ozvor executes the whole plan — content, cadence and monitoring: ${ORGANICPOSTS_URL}`;

  const textBody = [
    `Welcome to Ozvor ${planLabel} (${billingLabel})!`,
    "",
    planValue,
    "",
    "Your bonus resources are ready for download:",
    "",
    bonusLines,
    "",
    agencyPerkLine,
    "What to do first:",
    "1. Run your first brand audit (or refresh the one you already ran) at:",
    `   ${DASHBOARD_URL}`,
    "2. Open the GEO Visibility Guide and run the 10-minute check on page one.",
    "3. Use the Citation Tracker's weekly routine to baseline your current AI mention rate.",
    "",
    ladderLine,
    "",
    "Questions? Reply to this email or write to hello@ozvor.com",
    "",
    "— The Ozvor Team",
    "https://ozvor.com",
  ].join("\n");

  // ----- HTML body (Ozvor dark-first identity, email-safe) -----

  // Shared button style
  const btnStyle =
    'display:inline-block;padding:11px 22px;background:#0c7d54;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:700;font-size:14px;';
  const linkStyle = "color:#0c7d54;text-decoration:none;";

  const bonusCardsHtml = BONUS_ASSETS.map(
    (b) => `
  <tr>
    <td style="padding:14px 0;border-bottom:1px solid #d5dfd9;">
      <p style="margin:0 0 4px 0;font-weight:700;color:#17211c;font-size:15px;">${b.label}</p>
      <p style="margin:0 0 10px 0;font-size:13px;color:#5c6e65;line-height:1.5;">${b.description}</p>
      <a href="${b.url}" style="${btnStyle}">Download directly</a>
    </td>
  </tr>`
  ).join("");

  const agencyPerkHtml = isAgencyAnnual
    ? `<div style="background:#f6ecd6;border:1px solid #d9b968;border-radius:8px;padding:16px;margin-bottom:24px;">
    <p style="font-weight:700;color:#7a5a12;margin:0 0 4px 0;">Agency Annual perk</p>
    <p style="font-size:14px;color:#6b5010;margin:0;line-height:1.5;">
      Your complimentary website/landing-page GEO audit is included with your plan.
      Reply to this email when you're ready to schedule it.
    </p>
  </div>`
    : "";

  const ladderHtml = isAgency
    ? `Want your clients' plans executed for them? <strong>OrganicPosts by Ozvor</strong> runs the whole GEO program done-for-you.`
    : `Want it done for you instead? <strong>OrganicPosts by Ozvor</strong> executes the whole plan — content, cadence and monitoring.`;

  const htmlBody = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
</head>
<body style="font-family:system-ui,-apple-system,sans-serif;max-width:600px;margin:0 auto;padding:0;color:#17211c;background:#ffffff;">

  <!-- Header band (dark-first Ozvor identity) -->
  <div style="background:#0c1310;padding:22px 28px;border-radius:0 0 4px 4px;">
    <p style="margin:0;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#34c388;">
      Ozvor
    </p>
  </div>

  <div style="padding:28px;">
    <h1 style="font-size:24px;font-weight:800;letter-spacing:-0.02em;margin:0 0 6px 0;color:#17211c;">
      Welcome to ${planLabel}. Your bonuses are ready.
    </h1>
    <p style="font-size:14px;color:#5c6e65;margin:0 0 20px 0;">
      ${planLabel} plan &middot; ${billingLabel} billing
    </p>

    <p style="color:#3a473f;margin:0 0 24px 0;line-height:1.6;">
      ${planValue}
    </p>

    ${agencyPerkHtml}

    <!-- Bonus downloads -->
    <h2 style="font-size:16px;font-weight:700;color:#17211c;margin:0 0 8px 0;">
      Your bonus resources
    </h2>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:32px;">
      <tbody>
        ${bonusCardsHtml}
      </tbody>
    </table>

    <!-- What to do first -->
    <div style="background:#eef6f1;border-left:3px solid #0c7d54;border-radius:0 8px 8px 0;padding:18px 20px;margin-bottom:28px;">
      <h2 style="font-size:15px;font-weight:700;color:#17211c;margin:0 0 12px 0;">
        What to do first (in order)
      </h2>
      <ol style="margin:0;padding-left:20px;color:#3a473f;font-size:14px;line-height:1.7;">
        <li>
          <strong>Run or refresh your brand audit</strong> &mdash;
          <a href="${DASHBOARD_URL}" style="${linkStyle}">go to your dashboard</a>
          and click "Run Audit". It takes under 2 minutes.
        </li>
        <li>
          <strong>Run the 10-minute check</strong> &mdash; open the GEO Visibility Guide and do the
          first-page check; it surfaces your highest-impact fixes immediately.
        </li>
        <li>
          <strong>Baseline your citation rate</strong> &mdash; open the LLM Citation Tracker and run
          its weekly routine so you have a benchmark to compare against.
        </li>
      </ol>
    </div>

    <!-- CTA -->
    <div style="text-align:center;margin-bottom:28px;">
      <a href="${DASHBOARD_URL}" style="${btnStyle}font-size:15px;padding:14px 28px;">
        Go to your dashboard
      </a>
    </div>

    <!-- Ladder: OrganicPosts (done-for-you) -->
    <div style="background:#f2f6f3;border:1px solid #d5dfd9;border-radius:10px;padding:18px 20px;margin-bottom:28px;">
      <p style="margin:0 0 10px 0;font-size:14px;color:#3a473f;line-height:1.6;">
        ${ladderHtml}
      </p>
      <a href="${ORGANICPOSTS_URL}" style="${linkStyle}font-weight:600;font-size:14px;">Explore OrganicPosts by Ozvor &rarr;</a>
      ${isAgency ? `<br /><a href="${AGENCIES_URL}" style="${linkStyle}font-weight:600;font-size:14px;">See everything in your Agency plan &rarr;</a>` : ""}
    </div>

    <!-- Footer -->
    <hr style="border:none;border-top:1px solid #d5dfd9;margin:0 0 16px 0;" />
    <p style="font-size:12px;color:#8a9a91;margin:0;">
      Questions? Reply to this email or write to
      <a href="mailto:hello@ozvor.com" style="${linkStyle}">hello@ozvor.com</a>
      &nbsp;&middot;&nbsp;
      <a href="https://ozvor.com" style="${linkStyle}">ozvor.com</a>
    </p>
  </div>
</body>
</html>`;


  await sendResendEmail({
    from: fromAddress,
    to: params.to,
    subject,
    text: textBody,
    html: htmlBody,
  });
}
