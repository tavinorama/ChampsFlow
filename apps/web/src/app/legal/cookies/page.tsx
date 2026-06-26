/**
 * /legal/cookies — Cookie Policy
 *
 * Grounded in docs/legal/cookie-policy.md.
 * At launch the app sets only strictly necessary cookies (Supabase auth session).
 * No analytics or marketing tracking scripts are deployed. Analytics categories
 * are listed for completeness; they will be governed by a full consent management
 * platform if introduced.
 *
 * Jurisdictions: LGPD (Brazil, home jurisdiction) + GDPR / ePrivacy (EU/EEA)
 * + CCPA/CPRA (California/US).
 *
 * Linked from: site Footer ("Cookie Policy")
 * No login required (public page).
 */

import { LegalPage, LegalSection } from "../../../components/legal/LegalPage";

export const metadata = {
  title: "Cookie Policy | Ozvor",
  description:
    "How Ozvor uses cookies and local storage, what each is for, how long they last, and how you can control them.",
  alternates: { canonical: "https://ozvor.com/legal/cookies" },
  openGraph: {
    title: "Cookie Policy | Ozvor",
    description:
      "How Ozvor uses cookies and local storage, what each is for, how long they last, and how you can control them.",
    url: "https://ozvor.com/legal/cookies",
    siteName: "Ozvor",
    type: "website",
  },
  robots: {
    index: true,
    follow: false,
  },
};

/* ── shared table cell styles ── */
const cell: React.CSSProperties = {
  padding: "8px 10px",
  borderBottom: "1px solid var(--color-border)",
  verticalAlign: "top",
  fontSize: "var(--font-size-caption)",
  lineHeight: 1.6,
  color: "var(--color-text)",
};

const th: React.CSSProperties = {
  ...cell,
  fontWeight: 700,
  color: "var(--color-muted)",
  textAlign: "left",
  backgroundColor: "var(--color-surface-muted)",
};

const statusBadge = (inUse: boolean): React.CSSProperties => ({
  display: "inline-block",
  padding: "2px 8px",
  borderRadius: "var(--radius-pill)",
  fontSize: "var(--font-size-caption)",
  fontWeight: 600,
  backgroundColor: inUse ? "var(--color-badge-ai-bg)" : "transparent",
  color: inUse ? "var(--color-badge-ai-text)" : "var(--color-muted)",
  border: inUse ? "none" : "1px solid var(--color-border)",
});

export default function CookiePolicyPage() {
  return (
    <LegalPage
      title="Cookie Policy"
      updated="24 June 2026"
      intro="This Cookie Policy explains what cookies and similar technologies Ozvor places on your device, why we use them, and how you can control them. It should be read alongside our Privacy Policy. Ozvor is operated by Ozvor (a company being incorporated in Brazil). Home jurisdiction: Brazil (LGPD); we also comply with the GDPR / ePrivacy Directive (EU/EEA) and CCPA/CPRA (California, US)."
    >
      <LegalSection n="1" title="What are cookies?">
        <p>
          Cookies are small text files stored on your device when you visit a
          website. They allow the site to recognise your device across page
          loads and sessions. We also use <strong>localStorage</strong> (a
          browser storage mechanism) for lightweight UI preferences such as
          your colour-scheme choice. Neither mechanism identifies you to third
          parties; they are scoped to our domain only.
        </p>
      </LegalSection>

      <LegalSection n="2" title="Cookies we use at launch">
        <p>
          Ozvor currently deploys <strong>only strictly necessary
          cookies</strong>. No analytics cookies, no marketing cookies, and no
          third-party tracking pixels are active. The table below lists every
          cookie set by the Service today.
        </p>

        <div style={{ overflowX: "auto", marginTop: "var(--space-3)" }}>
          <table
            style={{ width: "100%", borderCollapse: "collapse" }}
            aria-label="Strictly necessary cookies"
          >
            <thead>
              <tr>
                <th style={th}>Cookie / key</th>
                <th style={th}>Purpose</th>
                <th style={th}>First- or third-party</th>
                <th style={th}>Retention</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={cell}>
                  <code>sb-[project]-auth-token</code>
                </td>
                <td style={cell}>
                  Supabase authentication session token. Set only after you
                  log in. Allows the app to verify your identity across page
                  loads without re-entering your email each time.
                </td>
                <td style={cell}>First-party (ozvor.com)</td>
                <td style={cell}>Session; refreshed on activity (7-day rotation)</td>
              </tr>
              <tr>
                <td style={cell}>
                  <code>sb-[project]-refresh-token</code>
                </td>
                <td style={cell}>
                  Supabase session refresh token. Allows the session to be
                  silently renewed so you are not unexpectedly logged out while
                  actively using the Service.
                </td>
                <td style={cell}>First-party (ozvor.com)</td>
                <td style={cell}>7 days; rotated on use</td>
              </tr>
              <tr>
                <td style={cell}>
                  <code>localStorage: theme</code>
                </td>
                <td style={cell}>
                  Stores your light/dark colour-scheme preference so it
                  persists across browser sessions. Not a cookie; stored in
                  browser localStorage; never transmitted to our servers.
                </td>
                <td style={cell}>First-party (ozvor.com)</td>
                <td style={cell}>Persistent until you clear browser storage or change preference</td>
              </tr>
            </tbody>
          </table>
        </div>

        <p style={{ marginTop: "var(--space-3)" }}>
          The Supabase auth cookies do not track you across websites. They are
          scoped strictly to ozvor.com and contain only an encrypted
          session identifier — no personal data in the cookie payload itself.
        </p>
      </LegalSection>

      <LegalSection n="3" title="Cookie categories — status at launch">
        <p>
          The table below follows the standard ePrivacy Directive / LGPD
          taxonomy. Categories marked "Not in use" are listed for transparency
          so you know what we have — and have not — deployed. If any category
          is introduced in the future, this policy will be updated before
          deployment and a consent mechanism will be provided as required.
        </p>

        <div style={{ overflowX: "auto", marginTop: "var(--space-3)" }}>
          <table
            style={{ width: "100%", borderCollapse: "collapse" }}
            aria-label="Cookie category summary"
          >
            <thead>
              <tr>
                <th style={th}>Category</th>
                <th style={th}>Description</th>
                <th style={th}>In use at launch</th>
                <th style={th}>Consent required?</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={cell}>
                  <strong>Strictly necessary</strong>
                </td>
                <td style={cell}>
                  Authentication session cookies that allow you to stay logged
                  in. The Service cannot function without them for authenticated
                  users.
                </td>
                <td style={cell}>
                  <span style={statusBadge(true)}>Yes</span>
                </td>
                <td style={cell}>
                  No — exempt under ePrivacy Directive, LGPD, and CCPA (necessary for service delivery)
                </td>
              </tr>
              <tr>
                <td style={cell}>
                  <strong>Functional / preferences</strong>
                </td>
                <td style={cell}>
                  Remembers non-essential user choices (e.g., language,
                  layout preferences). Only localStorage theme preference is
                  used today (non-cookie; no server transmission).
                </td>
                <td style={cell}>
                  <span style={statusBadge(false)}>Not in use (cookie)</span>
                </td>
                <td style={cell}>Would require consent if cookies were used</td>
              </tr>
              <tr>
                <td style={cell}>
                  <strong>Analytics / performance</strong>
                </td>
                <td style={cell}>
                  Collects aggregate data on how visitors use the site
                  (page views, session duration, referrer). No analytics
                  cookies are deployed. Future analytics tools will be
                  cookieless-first.
                </td>
                <td style={cell}>
                  <span style={statusBadge(false)}>Not in use</span>
                </td>
                <td style={cell}>
                  Depends on tool — cookieless tools may not require consent;
                  cookie-based tools require opt-in (EU/BR) or opt-out (US)
                </td>
              </tr>
              <tr>
                <td style={cell}>
                  <strong>Marketing / advertising</strong>
                </td>
                <td style={cell}>
                  Cross-site tracking for advertising, retargeting, or
                  behavioural profiling (e.g., Meta Pixel, Google Ads, LinkedIn
                  Insight Tag). None deployed.
                </td>
                <td style={cell}>
                  <span style={statusBadge(false)}>Not in use</span>
                </td>
                <td style={cell}>
                  Requires explicit opt-in consent (EU/BR); "Do Not Sell or
                  Share" opt-out (California)
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </LegalSection>

      <LegalSection n="4" title="Legal basis for cookies">
        <p>
          <strong>Brazil (LGPD):</strong> Strictly necessary cookies are
          processed on the basis of contract performance (Art. 7, V LGPD) —
          they are required to provide the authenticated service you requested.
          No consent is required for these cookies.
        </p>
        <p>
          <strong>EU/EEA (GDPR + ePrivacy Directive):</strong> Strictly
          necessary cookies fall within the "essential technical purpose"
          exception to the ePrivacy Directive consent requirement. They are
          processed under contract performance (Art. 6(1)(b) GDPR). Any
          non-essential cookie category would require prior, freely given,
          specific and informed consent (opt-in) from EU users before being
          set.
        </p>
        <p>
          <strong>California (CCPA/CPRA):</strong> Strictly necessary cookies
          are exempt from the "sale" and "sharing" restrictions because they
          are used solely to provide the service you requested. No marketing
          cookies are in use, so no "Do Not Sell or Share" opt-out is
          triggered. If marketing cookies are introduced in the future, a
          compliant opt-out mechanism will be provided.
        </p>
      </LegalSection>

      <LegalSection n="5" title="Third-party cookies">
        <p>
          At launch, <strong>no third-party cookies</strong> are set on
          ozvor.com. The Supabase auth cookies are first-party (set
          and read only by ozvor.com). We do not embed third-party
          advertising, social, or analytics widgets that set their own cookies.
        </p>
        <p>
          If a future integration (such as a support chat widget or third-party
          analytics platform) introduces third-party cookies, it will be
          disclosed in an update to this policy, and appropriate consent will
          be obtained before those cookies are set.
        </p>
      </LegalSection>

      <LegalSection n="6" title="Your choices and controls">
        <p>
          <strong>Strictly necessary cookies:</strong> These cookies cannot be
          disabled without breaking the authenticated application. If you do not
          wish these cookies to be stored, please do not use the logged-in
          Service.
        </p>
        <p>
          <strong>Browser controls:</strong> You can delete or block cookies at
          any time via your browser settings. Most browsers provide a mechanism
          to review stored cookies and clear them selectively. Deleting auth
          cookies will log you out of the Service. Guidance for common browsers:
        </p>
        <ul style={{ paddingLeft: "var(--space-5)", margin: "0 0 var(--space-3) 0" }}>
          <li>
            <a
              href="https://support.google.com/chrome/answer/95647"
              style={{ color: "var(--color-primary)" }}
              target="_blank"
              rel="noopener noreferrer"
            >
              Google Chrome
            </a>
          </li>
          <li>
            <a
              href="https://support.mozilla.org/en-US/kb/clear-cookies-and-site-data-firefox"
              style={{ color: "var(--color-primary)" }}
              target="_blank"
              rel="noopener noreferrer"
            >
              Mozilla Firefox
            </a>
          </li>
          <li>
            <a
              href="https://support.apple.com/en-us/105082"
              style={{ color: "var(--color-primary)" }}
              target="_blank"
              rel="noopener noreferrer"
            >
              Apple Safari
            </a>
          </li>
          <li>
            <a
              href="https://support.microsoft.com/en-us/windows/delete-and-manage-cookies-168dab11-0753-043d-7c16-ede5947fc64d"
              style={{ color: "var(--color-primary)" }}
              target="_blank"
              rel="noopener noreferrer"
            >
              Microsoft Edge
            </a>
          </li>
        </ul>
        <p>
          For a general guide to managing cookies across browsers, see{" "}
          <a
            href="https://www.allaboutcookies.org"
            style={{ color: "var(--color-primary)" }}
            target="_blank"
            rel="noopener noreferrer"
          >
            allaboutcookies.org
          </a>
          .
        </p>
        <p>
          <strong>Do Not Track (DNT):</strong> Some browsers send a "Do Not
          Track" signal. We honour this signal as a best-effort measure and do
          not deploy any behavioural tracking that would be affected by it.
        </p>
      </LegalSection>

      <LegalSection n="7" title="Changes to this policy">
        <p>
          We will update this Cookie Policy before adding any new cookie
          category or analytics tool. Material changes — such as the
          introduction of marketing or analytics cookies — will be notified via
          in-app notification and by email to registered users at least 14 days
          before the change takes effect.
        </p>
        <p>
          The "Last updated" date at the top of this page reflects the most
          recent revision.
        </p>
      </LegalSection>

      <LegalSection n="8" title="Contact">
        <p>
          For questions about this Cookie Policy or to exercise your data
          rights, contact our Privacy Team at{" "}
          <a
            href="mailto:dpo@ozvor.com"
            style={{ color: "var(--color-primary)" }}
          >
            dpo@ozvor.com
          </a>
          . You may also submit a{" "}
          <a href="/legal/dsr-request" style={{ color: "var(--color-primary)" }}>
            Data Subject Request
          </a>{" "}
          or review our full{" "}
          <a href="/privacy-policy" style={{ color: "var(--color-primary)" }}>
            Privacy Policy
          </a>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
