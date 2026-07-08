/**
 * resend-send.ts — send an email via the Resend REST API (no SDK).
 *
 * Why not the `resend` SDK: it transitively imports `@react-email/render` →
 * `react-dom` at send time. `react-dom` is not reliably present in the API's
 * production Docker image (monorepo hoist + multi-stage copy), so every
 * transactional email threw "Cannot find package 'react-dom'" in prod while the
 * SDK-mocking unit tests stayed green. This REST call has ZERO extra runtime
 * dependencies, works regardless of the build, and returns the Resend message
 * id so callers can surface a real send confirmation.
 *
 * Hard rules preserved: RESEND_API_KEY from env (never hardcoded); best-effort
 * (throws so the caller can catch + still 200 a webhook); only the recipient
 * address + email content are sent — no other PII.
 */

export interface ResendEmailParams {
  from: string;
  to: string | string[];
  subject: string;
  html: string;
  text: string;
}

export interface ResendSendResult {
  /** Resend message id (for confirmation / delivery tracking). */
  id: string;
}

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/**
 * POST an email to the Resend REST API. Throws on a missing key or a non-2xx
 * response (with the API's error body, truncated) so the caller can log/surface
 * the real reason instead of a silent failure.
 */
export async function sendResendEmail(
  params: ResendEmailParams
): Promise<ResendSendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not set");
  }

  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: params.from,
      to: params.to,
      subject: params.subject,
      html: params.html,
      text: params.text,
    }),
  });

  if (!res.ok) {
    // Surface the Resend error (e.g. domain-not-verified, invalid from) — this
    // is the difference between "email failed" and knowing WHY.
    const body = await res.text().catch(() => "");
    throw new Error(`Resend API ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = (await res.json().catch(() => ({}))) as { id?: string };
  return { id: data.id ?? "" };
}
