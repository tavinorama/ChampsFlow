/**
 * free-test-result.ts — Immediate result email for the AI Invisibility Test
 *
 * Sent as soon as the free test completes and an email address was provided.
 * This is NOT a marketing email — it's a transactional delivery of the test
 * results the user just requested. No marketing consent required.
 *
 * Sub-processor: Resend (architecture §11 — DPA executed).
 * Data minimization: only email address, brand label, scores, and prompt text
 * sent to Resend. No PII beyond recipient address stored or transmitted.
 *
 * Hard rules:
 *   - RESEND_API_KEY from env — never hardcoded
 *   - No tracking pixels; no external asset references in HTML; inline styles only
 *   - No full PII beyond recipient email address sent to Resend
 *   - Best-effort: caller catches all errors; email failure NEVER blocks the API response
 *   - If RESEND_API_KEY missing, throw so caller can log a structured warning
 */

export interface FreeTestResultEmailParams {
  /** Recipient email */
  to: string;
  /** Brand name */
  brand: string;
  /** 3-vector + overall score */
  score: { ai: number; performance: number; brand: number; overall: number };
  /** The one-line headline verdict */
  verdict: string;
  /** The exact buyer prompt sent to AI engines */
  prompt: string;
  /** Per-engine results */
  engines: Array<{ engine: string; brandCited: boolean; competitorCited: boolean; live: boolean }>;
  /** Count of live (non-mock) engine responses */
  enginesLive: number;
  /** Ordered upsell recommendations */
  recommendations: Array<{ plan: string; reason: string; href: string }>;
  /** Base URL for absolute links (defaults to WEB_ORIGIN env or https://ozvor.com) */
  webOrigin?: string;
}

/**
 * Send the immediate free-test result email via Resend.
 *
 * Best-effort: if RESEND_API_KEY is not set, throws so the caller can catch and
 * emit a structured warning without crashing the API response.
 */
/**
 * Escape user-supplied strings for safe HTML interpolation.
 * Applied to all values that derive from user input before they are embedded
 * in the HTML email body. The plain-text body does NOT need escaping.
 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function sendFreeTestResultEmail(
  params: FreeTestResultEmailParams
): Promise<void> {
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    throw new Error(
      "RESEND_API_KEY is not configured — free test result email not sent"
    );
  }

  const fromAddress =
    process.env.EMAIL_FROM ?? "Ozvor <hello@ozvor.com>";

  const origin =
    params.webOrigin ??
    process.env.WEB_ORIGIN ??
    "https://ozvor.com";

  const subject = `Your AI Visibility snapshot for ${params.brand}`;

  // Top 2 recommendations
  const topRecs = params.recommendations.slice(0, 2);

  // ----- Helpers -----
  function absoluteHref(path: string): string {
    if (path.startsWith("http")) return path;
    return `${origin}${path}`;
  }

  function scoreColor(n: number): string {
    if (n >= 70) return "#15803D"; // green
    if (n >= 40) return "#B45309"; // amber
    return "#B91C1C";             // red
  }

  // ----- Plain-text body -----
  const engineRows = params.engines
    .map((e) => {
      const cited = e.brandCited ? "Cited" : "Not cited";
      const mode = e.live ? "Live" : "Mock";
      return `  ${e.engine.padEnd(14)} | ${cited.padEnd(9)} | ${mode}`;
    })
    .join("\n");

  const recLines = topRecs
    .map((r) => `  - ${r.plan.toUpperCase()}: ${r.reason}\n    ${absoluteHref(r.href)}`)
    .join("\n");

  const textBody = [
    `AI Visibility Snapshot — ${params.brand}`,
    "═".repeat(50),
    "",
    `PROMPT WE TESTED`,
    `"${params.prompt}"`,
    "",
    `YOUR SCORES`,
    `  AI Visibility:  ${params.score.ai}/100`,
    `  Performance:    ${params.score.performance}/100`,
    `  Brand signals:  ${params.score.brand}/100`,
    `  Overall:        ${params.score.overall}/100`,
    "",
    `VERDICT`,
    params.verdict,
    "",
    `ENGINE RESULTS`,
    `  Engine         | Cited?    | Source`,
    `  ${"-".repeat(44)}`,
    engineRows,
    params.enginesLive === 0 ? "  (Results are from mock/demo mode — no live API keys set)" : "",
    "",
    `WHAT TO DO NEXT`,
    recLines,
    "",
    `Get-Cited Kit ($29): ${absoluteHref("/kit")}`,
    `Growth plan: ${absoluteHref("/login?plan=growth&next=checkout")}`,
    `Book a free 20-min GEO call: ${absoluteHref("/book")}`,
    "",
    "─".repeat(50),
    "This is a one-time transactional result email triggered by your AI Visibility Test.",
    "No subscription required to receive this message.",
    "Questions? Reply to this email or write to hello@ozvor.com",
    "https://ozvor.com",
  ]
    .filter((l) => l !== undefined)
    .join("\n");

  // ----- HTML body -----
  const btnStyle =
    "display:inline-block;padding:10px 20px;background:#1D4ED8;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px;";
  const tdStyle = "padding:6px 10px;font-size:13px;color:#374151;border-bottom:1px solid #E5E7EB;";
  const thStyle = "padding:6px 10px;font-size:12px;font-weight:600;text-align:left;background:#F3F4F6;color:#6B7280;border-bottom:2px solid #E5E7EB;";

  const engineRowsHtml = params.engines
    .map((e) => {
      const cited = e.brandCited
        ? '<span style="color:#15803D;font-weight:600;">Yes</span>'
        : '<span style="color:#B91C1C;">No</span>';
      const mode = e.live
        ? '<span style="color:#1D4ED8;font-size:11px;">Live</span>'
        : '<span style="color:#9CA3AF;font-size:11px;">Mock</span>';
      return `<tr>
        <td style="${tdStyle}">${escapeHtml(e.engine)}</td>
        <td style="${tdStyle}">${cited}</td>
        <td style="${tdStyle}">${mode}</td>
      </tr>`;
    })
    .join("");

  const recBlocksHtml = topRecs
    .map(
      (r) => `
      <div style="margin-bottom:12px;">
        <a href="${absoluteHref(r.href)}" style="${btnStyle}">${r.plan.toUpperCase()}</a>
        <p style="font-size:13px;color:#374151;margin:6px 0 0 0;">${r.reason}</p>
      </div>`
    )
    .join("");

  const mockNote =
    params.enginesLive === 0
      ? `<p style="font-size:12px;color:#9CA3AF;margin:8px 0 0 0;">
          Results are from demo/mock mode (no live API keys active).
         </p>`
      : "";

  const htmlBody = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
</head>
<body style="font-family:system-ui,sans-serif;max-width:580px;margin:0 auto;padding:24px;color:#111827;background:#ffffff;">

  <!-- Header -->
  <div style="margin-bottom:24px;">
    <p style="margin:0;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:1px;color:#2563EB;">
      Ozvor
    </p>
    <h1 style="font-size:22px;font-weight:700;margin:8px 0 4px 0;color:#111827;">
      Your AI Visibility Snapshot
    </h1>
    <p style="font-size:14px;color:#6B7280;margin:0;">${escapeHtml(params.brand)}</p>
  </div>

  <!-- Section 1: The prompt we tested -->
  <div style="background:#F8FAFC;border-left:4px solid #2563EB;border-radius:4px;padding:14px 16px;margin-bottom:24px;">
    <p style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px;color:#6B7280;margin:0 0 6px 0;">
      The prompt we tested
    </p>
    <p style="font-size:14px;color:#1E3A5F;margin:0;font-style:italic;">
      &ldquo;${escapeHtml(params.prompt)}&rdquo;
    </p>
  </div>

  <!-- Section 2: Scores -->
  <h2 style="font-size:15px;font-weight:600;color:#111827;margin:0 0 12px 0;">Your AI Visibility Score</h2>
  <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
    <tr>
      <td style="padding:10px;text-align:center;border:1px solid #E5E7EB;border-radius:6px 0 0 6px;background:#F9FAFB;">
        <p style="font-size:11px;color:#6B7280;margin:0 0 4px 0;font-weight:600;text-transform:uppercase;letter-spacing:1px;">AI</p>
        <p style="font-size:26px;font-weight:700;margin:0;color:${scoreColor(params.score.ai)};">${params.score.ai}</p>
        <p style="font-size:11px;color:#9CA3AF;margin:2px 0 0 0;">/100</p>
      </td>
      <td style="padding:10px;text-align:center;border:1px solid #E5E7EB;border-left:none;background:#F9FAFB;">
        <p style="font-size:11px;color:#6B7280;margin:0 0 4px 0;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Performance</p>
        <p style="font-size:26px;font-weight:700;margin:0;color:${scoreColor(params.score.performance)};">${params.score.performance}</p>
        <p style="font-size:11px;color:#9CA3AF;margin:2px 0 0 0;">/100</p>
      </td>
      <td style="padding:10px;text-align:center;border:1px solid #E5E7EB;border-left:none;background:#F9FAFB;">
        <p style="font-size:11px;color:#6B7280;margin:0 0 4px 0;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Brand</p>
        <p style="font-size:26px;font-weight:700;margin:0;color:${scoreColor(params.score.brand)};">${params.score.brand}</p>
        <p style="font-size:11px;color:#9CA3AF;margin:2px 0 0 0;">/100</p>
      </td>
      <td style="padding:10px;text-align:center;border:1px solid #E5E7EB;border-left:none;border-radius:0 6px 6px 0;background:#1D4ED8;">
        <p style="font-size:11px;color:rgba(255,255,255,0.8);margin:0 0 4px 0;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Overall</p>
        <p style="font-size:26px;font-weight:700;margin:0;color:#FFFFFF;">${params.score.overall}</p>
        <p style="font-size:11px;color:rgba(255,255,255,0.7);margin:2px 0 0 0;">/100</p>
      </td>
    </tr>
  </table>

  <!-- Section 3: Verdict -->
  <div style="background:#FEF3C7;border:1px solid #F59E0B;border-radius:8px;padding:14px 16px;margin-bottom:24px;">
    <p style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px;color:#92400E;margin:0 0 6px 0;">
      Verdict
    </p>
    <p style="font-size:14px;color:#78350F;margin:0;font-weight:500;">
      ${escapeHtml(params.verdict)}
    </p>
  </div>

  <!-- Section 4: Engine results -->
  <h2 style="font-size:15px;font-weight:600;color:#111827;margin:0 0 12px 0;">Engine results</h2>
  <table style="width:100%;border-collapse:collapse;margin-bottom:8px;font-size:13px;">
    <thead>
      <tr>
        <th style="${thStyle}">Engine</th>
        <th style="${thStyle}">Brand cited?</th>
        <th style="${thStyle}">Source</th>
      </tr>
    </thead>
    <tbody>
      ${engineRowsHtml}
    </tbody>
  </table>
  ${mockNote}

  <!-- Section 5: What to do next -->
  <h2 style="font-size:15px;font-weight:600;color:#111827;margin:24px 0 12px 0;">What to do next</h2>
  ${recBlocksHtml}

  <!-- Always show Kit + call CTAs -->
  <div style="background:#F0F9FF;border:1px solid #BAE6FD;border-radius:8px;padding:16px;margin-top:16px;margin-bottom:24px;">
    <p style="font-size:13px;font-weight:600;color:#0C4A6E;margin:0 0 10px 0;">Quick access</p>
    <p style="margin:0 0 8px 0;">
      <a href="${absoluteHref("/kit")}" style="color:#1D4ED8;font-size:13px;text-decoration:none;font-weight:600;">
        $29 Get-Cited Kit &rarr;
      </a>
      <span style="font-size:13px;color:#374151;"> — Prompt blueprint + top-3 fixes for your brand</span>
    </p>
    <p style="margin:0 0 8px 0;">
      <a href="${absoluteHref("/login?plan=growth&next=checkout")}" style="color:#1D4ED8;font-size:13px;text-decoration:none;font-weight:600;">
        Growth plan &rarr;
      </a>
      <span style="font-size:13px;color:#374151;"> — Weekly AI citation monitoring</span>
    </p>
    <p style="margin:0 0 8px 0;">
      <a href="${absoluteHref("/login?plan=agency&next=checkout")}" style="color:#1D4ED8;font-size:13px;text-decoration:none;font-weight:600;">
        Agency plan &rarr;
      </a>
      <span style="font-size:13px;color:#374151;"> — Full competitor benchmarking + team seats</span>
    </p>
    <p style="margin:0;">
      <a href="${absoluteHref("/book")}" style="color:#1D4ED8;font-size:13px;text-decoration:none;font-weight:600;">
        Book a free 20-min GEO call &rarr;
      </a>
    </p>
  </div>

  <!-- Footer -->
  <hr style="border:none;border-top:1px solid #E5E7EB;margin-bottom:16px;" />
  <p style="font-size:12px;color:#9CA3AF;margin:0 0 4px 0;">
    This is a transactional result email triggered by your AI Visibility Test at
    <a href="https://ozvor.com" style="color:#2563EB;">ozvor.com</a>.
  </p>
  <p style="font-size:12px;color:#9CA3AF;margin:0;">
    This is a one-time result email. No subscription required to receive this message.
    Questions? <a href="mailto:hello@ozvor.com" style="color:#2563EB;">hello@ozvor.com</a>
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
