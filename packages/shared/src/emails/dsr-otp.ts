/**
 * DSR OTP email template — sent on POST /api/dsr/intake
 *
 * Subject: "Verify your data request"
 * Content: 6-digit OTP + 10-minute expiry notice
 *
 * Sub-processor: Resend (architecture §11 — EU: eu-west-1 infrastructure,
 *   DPA executed, data minimization: only email address sent)
 *
 * Hard rules:
 *   - RESEND_API_KEY from env — never hardcoded
 *   - Data minimization: only {to, subject, text} sent to Resend
 *   - Best-effort: caller catches all errors; email failure does NOT fail intake
 *   - OTP is only in transit — never stored plaintext; never logged
 *   - No full PII beyond recipient email address sent to Resend
 */

/**
 * Parameters for the DSR OTP email.
 * DO NOT add: name, account details, or any PII beyond the recipient address.
 */
export interface DsrOtpEmailParams {
  /** Recipient email address. */
  to: string;
  /** 6-digit OTP string (e.g., "847312"). ONLY passed to email body — not logged. */
  otp: string;
  /** OTP expiry in minutes (default: 10). */
  expiryMinutes?: number;
}

/**
 * Send the DSR OTP verification email via Resend.
 *
 * Throws if Resend API call fails — caller wraps in try-catch (best-effort pattern).
 * If RESEND_API_KEY is not set, throws an error (caller catches and logs structured warning).
 */
export async function sendDsrOtpEmail(params: DsrOtpEmailParams): Promise<void> {
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    throw new Error("RESEND_API_KEY is not configured — DSR OTP email not sent");
  }

  const fromAddress = process.env.EMAIL_FROM ?? "noreply@organicposts.ai";
  const expiryMinutes = params.expiryMinutes ?? 10;

  const { Resend } = await import("resend");
  const resend = new Resend(resendApiKey);

  const subject = "Verify your data request";

  const textBody = [
    "Your data subject request verification code",
    "",
    "You recently submitted a data subject request with Organic Posts.",
    "",
    `Your verification code: ${params.otp}`,
    "",
    `This code expires in ${expiryMinutes} minutes.`,
    "",
    "Enter this code on the verification page to confirm your identity.",
    "If you did not submit this request, you can safely ignore this email.",
    "",
    "If you have questions, contact us at privacy@organicposts.ai",
    "",
    "— The Organic Posts Privacy Team",
  ].join("\n");

  // HTML body — minimal; no tracking pixels; no external asset references
  const htmlBody = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Verify your data request</title>
</head>
<body style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #111827;">
  <h1 style="font-size: 20px; font-weight: 600; margin-bottom: 16px;">Verify your data request</h1>
  <p style="margin-bottom: 16px; color: #374151;">
    You recently submitted a data subject request with Organic Posts.
    Enter the code below to verify your identity.
  </p>
  <div style="background: #F3F4F6; border-radius: 8px; padding: 24px; text-align: center; margin-bottom: 24px;">
    <span style="font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #1F2937;">${params.otp}</span>
    <p style="font-size: 14px; color: #6B7280; margin-top: 8px;">
      Expires in ${expiryMinutes} minutes
    </p>
  </div>
  <p style="font-size: 14px; color: #6B7280; margin-bottom: 8px;">
    If you did not submit this request, you can safely ignore this email.
  </p>
  <p style="font-size: 14px; color: #6B7280;">
    Questions? Contact <a href="mailto:privacy@organicposts.ai" style="color: #2563EB;">privacy@organicposts.ai</a>
  </p>
</body>
</html>`;

  await resend.emails.send({
    from: fromAddress,
    to: params.to,
    subject,
    text: textBody,
    html: htmlBody,
  });
}
