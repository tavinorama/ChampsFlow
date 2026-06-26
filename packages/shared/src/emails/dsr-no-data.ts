/**
 * DSR "no personal data held" email template
 *
 * Sent when a super_admin processes an access/portability request and the
 * controller holds NO personal data for the requester's email (status closed as
 * 'closed_no_data', closure_reason 'no_personal_data_held').
 *
 * This is the substantive, honest answer to a GDPR Art. 15 / CCPA §1798.110
 * access request when nothing is held — NOT a "your export is ready" message
 * linking to an empty file. Distinct subject + body so the requester is never
 * told a download exists when it does not.
 *
 * Sub-processor: Resend (architecture §11 — DPA executed, data minimization)
 *
 * Hard rules:
 *   - RESEND_API_KEY from env
 *   - Best-effort: caller catches all errors
 *   - No raw account data, OAuth tokens, or sensitive PII in email body
 *   - Never claims an export/download is available
 */

export interface DsrNoDataEmailParams {
  /** Recipient email address (the verified requester). */
  to: string;
  /** DSR request ID (for reference in email). */
  requestId: string;
  /** "access" or "portability" — used only to phrase the confirmation. */
  requestType: "access" | "portability";
}

/**
 * Send the DSR "no personal data held" confirmation via Resend.
 * Throws on failure — caller wraps in try-catch (best-effort).
 */
export async function sendDsrNoDataEmail(
  params: DsrNoDataEmailParams
): Promise<void> {
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    throw new Error("RESEND_API_KEY is not configured — DSR no-data email not sent");
  }

  const fromAddress = process.env.EMAIL_FROM ?? "noreply@ozvor.com";

  const subject = "Your data request — no personal data on file";

  const textBody = [
    "We have completed your data subject request.",
    "",
    `Request ID: ${params.requestId}`,
    "",
    "After searching our records, we found no personal data associated with the",
    "email address you submitted. There is therefore nothing to export, and no",
    "download link is provided.",
    "",
    "If you believe we should hold data under a different email address, please",
    "submit a new request from that address, or contact us with your request ID.",
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
  <title>Your data request — no personal data on file</title>
</head>
<body style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #111827;">
  <h1 style="font-size: 20px; font-weight: 600; margin-bottom: 16px;">Your data request is complete</h1>
  <p style="margin-bottom: 8px; color: #6B7280; font-size: 14px;">
    Request ID: <code style="background: #F3F4F6; padding: 2px 6px; border-radius: 4px;">${params.requestId}</code>
  </p>
  <div style="background: #F9FAFB; border: 1px solid #D1D5DB; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
    <p style="color: #374151; margin: 0;">
      After searching our records, we found <strong>no personal data</strong> associated
      with the email address you submitted. There is nothing to export, and no
      download link is provided.
    </p>
  </div>
  <p style="font-size: 14px; color: #6B7280;">
    If you believe we should hold data under a different email address, submit a new
    request from that address, or contact
    <a href="mailto:privacy@ozvor.com" style="color: #2563EB;">privacy@ozvor.com</a>
    with your request ID.
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
