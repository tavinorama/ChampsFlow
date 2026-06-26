/**
 * DSR Confirmed email template — sent after OTP verification succeeds
 *
 * Subject: "Your data request has been verified"
 * Content: Request type + SLA timeline (30 days GDPR / 45 days CCPA)
 *
 * Sub-processor: Resend (architecture §11 — DPA executed, data minimization)
 *
 * Hard rules:
 *   - RESEND_API_KEY from env
 *   - Best-effort: caller catches all errors
 *   - No raw account data, tokens, or sensitive PII in email body
 */

export type DsrRequestType =
  | "access"
  | "correction"
  | "restriction"
  | "erasure"
  | "portability";

export interface DsrConfirmedEmailParams {
  /** Recipient email address. */
  to: string;
  /** The type of DSR that was verified. */
  requestType: DsrRequestType;
  /** SLA display string, e.g., "30/45" (GDPR/CCPA days). */
  slaDays?: string;
}

const REQUEST_TYPE_LABELS: Record<DsrRequestType, string> = {
  access: "Access my data (Subject Access Request)",
  correction: "Correct my data",
  restriction: "Restrict processing of my data",
  erasure: "Delete my account and data",
  portability: "Download my data (Portability)",
};

/**
 * Send the DSR confirmation email via Resend.
 * Throws on failure — caller wraps in try-catch (best-effort).
 */
export async function sendDsrConfirmedEmail(
  params: DsrConfirmedEmailParams
): Promise<void> {
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    throw new Error("RESEND_API_KEY is not configured — DSR confirmation email not sent");
  }

  const fromAddress = process.env.EMAIL_FROM ?? "noreply@ozvor.com";
  const slaDays = params.slaDays ?? "30/45";
  const requestLabel = REQUEST_TYPE_LABELS[params.requestType] ?? params.requestType;

  const subject = "Your data request has been verified";

  const textBody = [
    "Your data subject request has been received and verified.",
    "",
    `Request type: ${requestLabel}`,
    "",
    `We will respond within ${slaDays} days (30 days under GDPR / 45 days under CCPA).`,
    "",
    "You will receive another email when your request has been processed.",
    "",
    "If you have questions, contact us at privacy@ozvor.com",
    "",
    "— The Ozvor Privacy Team",
  ].join("\n");

  const htmlBody = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Your data request has been verified</title>
</head>
<body style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #111827;">
  <h1 style="font-size: 20px; font-weight: 600; margin-bottom: 16px;">Your data request has been verified</h1>
  <p style="margin-bottom: 16px; color: #374151;">
    We have received and verified your identity for the following request:
  </p>
  <div style="background: #F0FDF4; border: 1px solid #16A34A; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
    <p style="font-weight: 600; color: #166534; margin: 0;">${requestLabel}</p>
  </div>
  <p style="margin-bottom: 8px; color: #374151;">
    We will respond within <strong>${slaDays} days</strong>
    (30 days under GDPR&nbsp;/ 45 days under CCPA).
  </p>
  <p style="margin-bottom: 24px; color: #374151;">
    You will receive another email when your request has been processed.
  </p>
  <p style="font-size: 14px; color: #6B7280;">
    Questions? Contact <a href="mailto:privacy@ozvor.com" style="color: #2563EB;">privacy@ozvor.com</a>
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
