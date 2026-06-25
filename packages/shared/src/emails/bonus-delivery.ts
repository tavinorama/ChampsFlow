/**
 * Bonus delivery email — sent after a new paid subscription is confirmed
 * (checkout.session.completed for Growth or Agency plan).
 *
 * Subject: "Your TrustIndex AI bonuses are ready — here's what to do first"
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

export interface BonusDeliveryEmailParams {
  /** Recipient email address (the new paying customer). */
  to: string;
  /** Plan tier the customer signed up for. */
  plan: "growth" | "agency";
  /** True when the customer chose annual billing. */
  annual?: boolean;
}

const DASHBOARD_URL = "https://trustindexai.com/dashboard";
const HOW_IT_WORKS_URL = "https://trustindexai.com/how-it-works";

const BONUS_ASSETS = [
  {
    label: "The GEO Visibility Guide (30-page PDF)",
    url: "https://trustindexai.com/downloads/The-GEO-Visibility-Guide.pdf",
    resourcePage: "https://trustindexai.com/resources/geo-visibility-guide",
    description:
      "The definitive playbook for making your brand visible inside ChatGPT, Claude, Perplexity, and Google AI Overviews.",
  },
  {
    label: "LLM Citation Tracker (.xlsx)",
    url: "https://trustindexai.com/downloads/LLM-Citation-Tracker.xlsx",
    resourcePage: "https://trustindexai.com/resources/llm-citation-tracker",
    description:
      "Track which AI models mention your brand, how often, and where you rank against competitors.",
  },
  {
    label: "LLM Citation Tracker — Methodology (PDF)",
    url: "https://trustindexai.com/downloads/LLM-Citation-Tracker-Methodology.pdf",
    resourcePage: "https://trustindexai.com/resources/llm-citation-tracker",
    description:
      "The scoring methodology behind the tracker — understand exactly what drives AI citations.",
  },
  {
    label: "5 High-Citation Post Templates (PDF)",
    url: "https://trustindexai.com/downloads/5-High-Citation-Post-Templates.pdf",
    resourcePage: "https://trustindexai.com/resources/5-high-citation-post-templates",
    description:
      "Ready-to-use content formats that consistently get referenced by AI models.",
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
    process.env.EMAIL_FROM ?? "TrustIndex AI <hello@trustindexai.com>";

  const planLabel =
    params.plan === "agency" ? "Agency" : "Growth";
  const billingLabel = params.annual ? "annual" : "monthly";
  const isAgencyAnnual = params.plan === "agency" && params.annual === true;

  const subject =
    "Your TrustIndex AI bonuses are ready — here's what to do first";

  // ----- Plain-text body -----
  const bonusLines = BONUS_ASSETS.map(
    (b, i) => `${i + 1}. ${b.label}\n   ${b.url}\n   (More info: ${b.resourcePage})`
  ).join("\n\n");

  const agencyPerkLine = isAgencyAnnual
    ? "\nAgency Annual perk: Your complimentary website/landing-page GEO audit is included. Reply to this email when you're ready to schedule it.\n"
    : "";

  const textBody = [
    `Welcome to TrustIndex AI ${planLabel} (${billingLabel})!`,
    "",
    "Your bonuses are ready for download:",
    "",
    bonusLines,
    "",
    agencyPerkLine,
    "What to do first:",
    "1. Run your first brand audit (or refresh the one you already ran) at:",
    `   ${DASHBOARD_URL}`,
    "2. Open the GEO Visibility Guide and complete the top-3 quick wins in Section 2.",
    "3. Use the Citation Tracker to baseline your current AI mention rate.",
    "",
    "Questions? Reply to this email or write to hello@trustindexai.com",
    "",
    "— The TrustIndex AI Team",
    "https://trustindexai.com",
  ].join("\n");

  // ----- HTML body -----

  // Shared button style
  const btnStyle =
    'display:inline-block;padding:10px 20px;background:#1D4ED8;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px;';

  const bonusCardsHtml = BONUS_ASSETS.map(
    (b) => `
  <tr>
    <td style="padding:12px 0;border-bottom:1px solid #E5E7EB;">
      <p style="margin:0 0 4px 0;font-weight:600;color:#111827;font-size:15px;">${b.label}</p>
      <p style="margin:0 0 8px 0;font-size:13px;color:#6B7280;">${b.description}</p>
      <a href="${b.url}" style="${btnStyle}">Download</a>
      &nbsp;
      <a href="${b.resourcePage}" style="font-size:13px;color:#2563EB;text-decoration:none;">Learn more</a>
    </td>
  </tr>`
  ).join("");

  const agencyPerkHtml = isAgencyAnnual
    ? `<div style="background:#FFF7ED;border:1px solid #F59E0B;border-radius:8px;padding:16px;margin-bottom:24px;">
    <p style="font-weight:600;color:#92400E;margin:0 0 4px 0;">Agency Annual perk</p>
    <p style="font-size:14px;color:#78350F;margin:0;">
      Your complimentary website/landing-page GEO audit is included with your plan.
      Reply to this email when you're ready to schedule it.
    </p>
  </div>`
    : "";

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
      Welcome to ${planLabel}! Your bonuses are ready.
    </h1>
    <p style="font-size:14px;color:#6B7280;margin:0;">
      ${planLabel} plan &middot; ${billingLabel} billing
    </p>
  </div>

  <p style="color:#374151;margin-bottom:24px;">
    Thanks for joining TrustIndex AI. Everything you need to start showing up in
    ChatGPT, Claude, Perplexity, and Google AI Overviews is below.
  </p>

  ${agencyPerkHtml}

  <!-- Bonus downloads -->
  <h2 style="font-size:16px;font-weight:600;color:#111827;margin:0 0 12px 0;">
    Your bonus resources
  </h2>
  <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:32px;">
    <tbody>
      ${bonusCardsHtml}
    </tbody>
  </table>

  <!-- What to do first -->
  <div style="background:#F0F9FF;border:1px solid #BAE6FD;border-radius:8px;padding:20px;margin-bottom:28px;">
    <h2 style="font-size:15px;font-weight:600;color:#0C4A6E;margin:0 0 12px 0;">
      What to do first (in order)
    </h2>
    <ol style="margin:0;padding-left:20px;color:#0E7490;font-size:14px;line-height:1.7;">
      <li>
        <strong>Run or refresh your brand audit</strong> &mdash;
        <a href="${DASHBOARD_URL}" style="color:#2563EB;">go to your dashboard</a>
        and click "Run Audit". It takes under 2 minutes.
      </li>
      <li>
        <strong>Fix the top-3 issues</strong> &mdash; your audit highlights the highest-impact
        changes. Knock those out first; they typically lift your TrustIndex Score
        within one audit cycle.
      </li>
      <li>
        <strong>Baseline your citation rate</strong> &mdash; open the LLM Citation Tracker
        and log this week's results. You'll have a benchmark to compare against
        after you implement changes.
      </li>
    </ol>
  </div>

  <!-- CTA -->
  <div style="text-align:center;margin-bottom:32px;">
    <a href="${DASHBOARD_URL}" style="${btnStyle}font-size:15px;padding:14px 28px;">
      Go to your dashboard
    </a>
    &nbsp;&nbsp;
    <a href="${HOW_IT_WORKS_URL}" style="font-size:14px;color:#2563EB;text-decoration:none;">
      How it works
    </a>
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
