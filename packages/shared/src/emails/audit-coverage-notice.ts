/**
 * Audit coverage notice — ONE email to the tenant owner when an audit completes
 * with partial engine coverage (`coverage.comparable=false`) or with engines
 * held back for drift (D8d, 2026-08-17). "Nada degrada calado": the customer
 * learns exactly what was measured and what was not, without blame.
 *
 * Idempotent per audit_id — the worker records the send in ops.notification_log
 * (audit_coverage_notice) before calling; the builder here is pure and tested.
 *
 * Hard rules (kit-delivery.ts / landing-lead-notification.ts convention):
 *   - RESEND_API_KEY from env — never hardcoded
 *   - Best-effort: caller catches; email failure never fails the audit
 *   - No tracking pixels; no external assets; only the owner's address is sent
 */

import { sendResendEmail, type ResendSendResult } from "./resend-send";

export interface AuditCoverageNoticeParams {
  to: string;
  brandName: string;
  auditId: string;
  /** Engines that answered and were scored. */
  answered: string[];
  /** Engines requested but not answered (provider-side: outage/timeout/refusal). */
  missing: string[];
  /** Engines we deliberately held back because their control battery flagged drift. */
  paused: string[];
  /** Engines that answered but were degraded (counted, flagged). */
  degraded: string[];
  /** false → this run is not comparable to the brand's history. */
  comparable: boolean;
}

const ENGINE_LABEL: Record<string, string> = {
  openai: "ChatGPT",
  anthropic: "Claude",
  perplexity: "Perplexity",
  gemini: "Gemini",
  google_aio: "Google AI Overview",
  dataforseo: "Google AI Overview",
};

function label(e: string): string {
  return ENGINE_LABEL[e] ?? e;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** true when there is anything worth telling the customer. */
export function coverageNoticeNeeded(p: Pick<AuditCoverageNoticeParams, "comparable" | "paused" | "missing">): boolean {
  return !p.comparable || p.paused.length > 0 || p.missing.length > 0;
}

/** Pure — builds subject/text/html. Exported for tests. */
export function buildAuditCoverageNotice(
  params: AuditCoverageNoticeParams
): { subject: string; text: string; html: string } {
  const brand = params.brandName.trim() || "your brand";
  const answered = params.answered.map(label);
  const missing = params.missing.map(label);
  const paused = params.paused.map(label);
  const degraded = params.degraded.map(label);
  const dashboardUrl = `${process.env["WEB_ORIGIN"] ?? "https://ozvor.com"}/dashboard`;

  const subject = `Your ${brand} audit finished — here is what we could and could not measure`;

  const lines: string[] = [];
  lines.push(`Your AI visibility audit for ${brand} is done.`);
  lines.push("");
  lines.push(`Measured: ${answered.length ? answered.join(", ") : "none"}.`);
  if (missing.length) lines.push(`Not measured (the engine did not answer in time): ${missing.join(", ")}.`);
  if (paused.length) lines.push(`Held back by us (the engine failed our drift check today, so we did not trust it): ${paused.join(", ")}.`);
  if (degraded.length) lines.push(`Answered but degraded (counted, flagged): ${degraded.join(", ")}.`);
  lines.push("");
  if (!params.comparable) {
    lines.push("Because the panel was partial, this run is marked NOT comparable to your history. The score is real for the engines measured. It is not a like-for-like trend point.");
  } else {
    lines.push("The panel we scored is complete and comparable to your history.");
  }
  lines.push("");
  lines.push("We would rather tell you than let a number look better or worse than it is.");
  lines.push(`See the run: ${dashboardUrl}`);
  lines.push("");
  lines.push("— The Ozvor Team");
  lines.push("https://ozvor.com");
  const text = lines.join("\n");

  const li = (arr: string[]) => arr.map((a) => `<li>${escapeHtml(a)}</li>`).join("");
  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>${escapeHtml(subject)}</title></head>
<body style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:0;color:#17211c;background:#ffffff;">
  <div style="background:#0c1310;padding:20px 26px;border-radius:0 0 4px 4px;">
    <p style="margin:0;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#34c388;">Ozvor Search</p>
  </div>
  <div style="padding:26px;">
    <h1 style="font-size:20px;font-weight:800;letter-spacing:-0.02em;margin:0 0 10px 0;">Your ${escapeHtml(brand)} audit is done</h1>
    <p style="color:#3a473f;margin:0 0 16px 0;line-height:1.6;">Here is exactly what we measured and what we did not.</p>
    <p style="margin:0 0 6px 0;"><strong>Measured</strong></p>
    <ul style="margin:0 0 14px 18px;padding:0;">${answered.length ? li(answered) : "<li>none</li>"}</ul>
    ${missing.length ? `<p style="margin:0 0 6px 0;"><strong>Not measured</strong> (the engine did not answer in time)</p><ul style="margin:0 0 14px 18px;padding:0;">${li(missing)}</ul>` : ""}
    ${paused.length ? `<p style="margin:0 0 6px 0;"><strong>Held back by us</strong> (failed our drift check today)</p><ul style="margin:0 0 14px 18px;padding:0;">${li(paused)}</ul>` : ""}
    ${degraded.length ? `<p style="margin:0 0 6px 0;"><strong>Answered but degraded</strong> (counted, flagged)</p><ul style="margin:0 0 14px 18px;padding:0;">${li(degraded)}</ul>` : ""}
    <div style="background:#eef6f1;border-left:3px solid #0c7d54;border-radius:0 8px 8px 0;padding:14px 16px;margin:0 0 22px 0;">
      <p style="margin:0;font-size:14px;line-height:1.6;">${
        params.comparable
          ? "The panel we scored is complete and comparable to your history."
          : "This run is marked <strong>not comparable</strong> to your history. The score is real for the engines measured. It is not a like-for-like trend point."
      }</p>
    </div>
    <p style="color:#3a473f;margin:0 0 20px 0;line-height:1.6;">We would rather tell you than let a number look better or worse than it is.</p>
    <div style="text-align:center;margin:0 0 22px 0;">
      <a href="${dashboardUrl}" style="display:inline-block;padding:12px 24px;background:#0c7d54;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:700;font-size:14px;">See the run</a>
    </div>
    <hr style="border:none;border-top:1px solid #d5dfd9;margin:0 0 14px 0;" />
    <p style="font-size:12px;color:#8a9a91;margin:0;">Sent by <a href="https://ozvor.com" style="color:#0c7d54;text-decoration:none;">Ozvor</a> &nbsp;&middot;&nbsp; Questions? <a href="mailto:hello@ozvor.com" style="color:#0c7d54;text-decoration:none;">hello@ozvor.com</a></p>
  </div>
</body>
</html>`;

  return { subject, text, html };
}

export async function sendAuditCoverageNoticeEmail(params: AuditCoverageNoticeParams): Promise<ResendSendResult> {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not configured — audit coverage notice not sent");
  }
  const built = buildAuditCoverageNotice(params);
  return sendResendEmail({
    from: process.env.EMAIL_FROM ?? "Ozvor <hello@ozvor.com>",
    to: params.to,
    subject: built.subject,
    html: built.html,
    text: built.text,
  });
}
