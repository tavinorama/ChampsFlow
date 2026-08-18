/**
 * credits-out.ts — "You are out of credits" (D1, 2026-08-17).
 *
 * Sent ONCE when a tenant's credit balance crosses to zero (or below) after an
 * audit is charged. The worker decides idempotency (crossing rule + one per
 * month via audit_log); this file only writes and sends the email.
 *
 * Copy rules: English, no em-dash, short sentences, first-person CTA. Honest:
 * the balance printed is the real one, and the refill date is the 1st.
 * Sub-processor: Resend. RESEND_API_KEY from env. No tracking pixels.
 */

import { sendResendEmail, type ResendSendResult } from "./resend-send";

const WEB_ORIGIN = process.env["WEB_ORIGIN"] ?? "https://ozvor.com";

export interface CreditsOutEmailParams {
  to: string;
  brand?: string | null;
  balance: number;
  packCredits: number;
  packUsd: number;
  plan: string;
}

/** Pure: the subject + text body, so a test can pin the copy without Resend. */
export function buildCreditsOutEmail(params: CreditsOutEmailParams): { subject: string; text: string; html: string; topUpUrl: string } {
  const topUpUrl = `${WEB_ORIGIN}/dashboard-v3?tab=billing&topup=1`;
  const pricingUrl = `${WEB_ORIGIN}/pricing`;
  const brand = (params.brand ?? "").trim();
  const subject = "You are out of audit credits";
  const fmt = (n: number) => n.toLocaleString("en-US");
  const upgradeLine = params.plan === "free"
    ? "Growth gives you far more credits each month. It is the better deal if you audit often."
    : "Need more every month? A bigger plan costs less per credit than packs.";

  const text = [
    brand ? `Your last audit for ${brand} used the rest of your credits.` : "Your last audit used the rest of your credits.",
    `Balance now: ${fmt(Math.max(0, params.balance))}.`,
    "",
    "Audits pause until you top up. Your balance refills on the 1st.",
    `Buy ${fmt(params.packCredits)} credits for $${params.packUsd}: ${topUpUrl}`,
    upgradeLine,
    `See plans: ${pricingUrl}`,
    "",
    "Monitoring you already scheduled keeps its place in the queue. It runs when credits are back.",
    "",
    "The Ozvor Team",
    WEB_ORIGIN,
  ].join("\n");

  const btn = "display:inline-block;padding:12px 24px;background:#0c7d54;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:15px;";
  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>${subject}</title></head>
<body style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111827;background:#ffffff;">
  <p style="margin:0;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:1px;color:#0c7d54;">Ozvor</p>
  <h1 style="font-size:22px;font-weight:700;margin:8px 0 16px 0;color:#111827;">You are out of audit credits</h1>
  <p style="color:#374151;margin:0 0 12px 0;">${brand ? `Your last audit for <b>${escapeHtml(brand)}</b> used the rest of your credits.` : "Your last audit used the rest of your credits."} Balance now: <b>${fmt(Math.max(0, params.balance))}</b>.</p>
  <p style="color:#374151;margin:0 0 20px 0;">Audits pause until you top up. Your balance refills on the 1st.</p>
  <div style="text-align:center;margin:0 0 20px 0;"><a href="${topUpUrl}" style="${btn}">Buy ${fmt(params.packCredits)} credits for $${params.packUsd}</a></div>
  <p style="color:#374151;margin:0 0 8px 0;">${upgradeLine} <a href="${pricingUrl}" style="color:#0c7d54;">See plans</a>.</p>
  <p style="color:#6B7280;font-size:13px;margin:16px 0 0 0;">Monitoring you already scheduled keeps its place in the queue. It runs when credits are back.</p>
  <hr style="border:none;border-top:1px solid #E5E7EB;margin:28px 0 12px 0;" />
  <p style="font-size:11px;color:#9CA3AF;margin:0;text-align:center;">Sent because your Ozvor workspace ran out of credits. Ozvor · ozvor.com</p>
</body></html>`;
  return { subject, text, html, topUpUrl };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export async function sendCreditsOutEmail(params: CreditsOutEmailParams): Promise<ResendSendResult> {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not configured — credits-out email not sent");
  }
  const from = process.env.EMAIL_FROM ?? "Ozvor <hello@ozvor.com>";
  const { subject, text, html } = buildCreditsOutEmail(params);
  return sendResendEmail({ from, to: params.to, subject, text, html });
}
