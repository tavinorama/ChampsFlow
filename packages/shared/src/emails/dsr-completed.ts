/**
 * DSR Completed email template — sent after super_admin fulfills the request
 *
 * Subject: "Your data request has been completed"
 * Content: Completion notice; for access/portability includes a reference to
 *          the result artifact (link or instruction).
 *
 * Sub-processor: Resend (architecture §11 — DPA executed, data minimization)
 *
 * Hard rules:
 *   - RESEND_API_KEY from env
 *   - Best-effort: caller catches all errors
 *   - resultArtifactUrl if present is an internal reference path only;
 *     in production this should be a time-limited presigned URL
 *   - No raw account data, OAuth tokens, or sensitive PII in email body
 */

export interface DsrCompletedEmailParams {
  /** Recipient email address. */
  to: string;
  /** DSR request ID (for reference in email). */
  requestId: string;
  /**
   * Optional URL for access/portability data export.
   * If present, included as a download link in email.
   * Should be a presigned URL in production.
   */
  resultArtifactUrl?: string;
}

/**
 * Send the DSR completion email via Resend.
 * Throws on failure — caller wraps in try-catch (best-effort).
 */
export async function sendDsrCompletedEmail(
  params: DsrCompletedEmailParams
): Promise<void> {
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    throw new Error("RESEND_API_KEY is not configured — DSR completion email not sent");
  }

  const fromAddress = process.env.EMAIL_FROM ?? "noreply@ozvor.com";

  const subject = "Your data request has been completed";

  const hasArtifact = typeof params.resultArtifactUrl === "string" && params.resultArtifactUrl.trim().length > 0;

  const artifactSection = hasArtifact
    ? [
        "Your data export is ready. Please contact privacy@ozvor.com with your",
        `request ID (${params.requestId}) to receive your secure download link.`,
        "",
        "Export data links are provided securely and are time-limited.",
      ].join("\n")
    : [
        "Your request has been processed. If you have any questions about the outcome,",
        "please contact us at privacy@ozvor.com with your request ID:",
        `${params.requestId}`,
      ].join("\n");

  const textBody = [
    "Your data subject request has been completed.",
    "",
    `Request ID: ${params.requestId}`,
    "",
    artifactSection,
    "",
    "If you have questions, contact us at privacy@ozvor.com",
    "",
    "— The Ozvor Privacy Team",
  ].join("\n");

  const artifactHtml = hasArtifact
    ? `<div style="background: #EFF6FF; border: 1px solid #2563EB; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
    <p style="font-weight: 600; color: #1D4ED8; margin: 0 0 8px 0;">Your data export is ready</p>
    <p style="font-size: 14px; color: #374151; margin: 0;">
      Contact <a href="mailto:privacy@ozvor.com" style="color: #2563EB;">privacy@ozvor.com</a>
      with your request ID to receive a secure, time-limited download link.
    </p>
  </div>`
    : `<div style="background: #F0FDF4; border: 1px solid #16A34A; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
    <p style="color: #166534; margin: 0;">Your request has been processed successfully.</p>
  </div>`;

  const htmlBody = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Your data request has been completed</title>
</head>
<body style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #111827;">
  <h1 style="font-size: 20px; font-weight: 600; margin-bottom: 16px;">Your data request has been completed</h1>
  <p style="margin-bottom: 8px; color: #6B7280; font-size: 14px;">
    Request ID: <code style="background: #F3F4F6; padding: 2px 6px; border-radius: 4px;">${params.requestId}</code>
  </p>
  ${artifactHtml}
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
