/**
 * /legal/california-privacy — California Privacy Rights Statement
 *
 * CI-2: A brief factual statement of California privacy rights under
 * CCPA/CPRA, linked from:
 *   1. Footer (CaliforniaBanner component and Footer component)
 *   2. Account > Data & Privacy > AI & Automation section
 *
 * Content: factual description of CCPA/CPRA rights, what data we collect,
 * how to exercise rights, contact information.
 *
 * No login required (public page).
 *
 * UX ref: docs/04-ux.md §6 CI-2
 * Content source: docs/compliance/dpia.md + PRD CI-2 + architecture §4
 */

import Link from "next/link";

export const metadata = {
  title: "California Privacy Rights | Ozvor",
  description:
    "Your California privacy rights under the CCPA/CPRA. Learn how to opt out and exercise your rights.",
};

export default function CaliforniaPrivacyPage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <main
        style={{
          flex: 1,
          maxWidth: "680px",
          width: "100%",
          margin: "0 auto",
          padding: "var(--space-8) var(--space-4)",
        }}
      >
        {/* Back link */}
        <Link
          href="/privacy-policy"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
            color: "var(--color-muted)",
            textDecoration: "none",
            fontSize: "var(--font-size-body-sm)",
            marginBottom: "var(--space-6)",
          }}
        >
          <span aria-hidden="true">&larr;</span> Privacy Policy
        </Link>

        <h1
          style={{
            fontSize: "var(--font-size-h1)",
            fontWeight: "var(--font-weight-bold)",
            color: "var(--color-text)",
            marginTop: 0,
            marginBottom: "var(--space-2)",
          }}
        >
          Your California Privacy Rights
        </h1>

        <p
          style={{
            fontSize: "var(--font-size-body-sm)",
            color: "var(--color-muted)",
            marginBottom: "var(--space-8)",
          }}
        >
          Last updated: May 2026 · Effective for California residents
        </p>

        <Section>
          <SectionHeading>Overview</SectionHeading>
          <Body>
            If you are a California resident, the California Consumer Privacy
            Act (CCPA) as amended by the California Privacy Rights Act (CPRA)
            grants you specific rights over your personal information. This
            page explains those rights and how to exercise them.
          </Body>
        </Section>

        <Section>
          <SectionHeading>Categories of personal information we collect</SectionHeading>
          <Body>
            Ozvor collects the following categories of personal
            information, as defined by the CCPA:
          </Body>
          <ul style={LIST_STYLE}>
            <li style={LIST_ITEM_STYLE}>
              <strong>Identifiers</strong> — Name, email address, IP address
              (truncated — last octet removed for privacy).
            </li>
            <li style={LIST_ITEM_STYLE}>
              <strong>Internet or network activity information</strong> — Login
              sessions, API usage, post generation events (stored as
              anonymized audit records).
            </li>
            <li style={LIST_ITEM_STYLE}>
              <strong>Sensitive personal information (CPRA)</strong> — OAuth
              access tokens for LinkedIn, Instagram, and Facebook. These are
              stored encrypted (AES-256-GCM) and are used exclusively for
              scheduling and publishing posts on your behalf.
            </li>
            <li style={LIST_ITEM_STYLE}>
              <strong>Commercial information</strong> — Subscription plan,
              billing history (managed by Stripe; we do not store full card
              details).
            </li>
          </ul>
        </Section>

        <Section>
          <SectionHeading>How we use your personal information</SectionHeading>
          <Body>
            We use your personal information to: (1) provide the post
            generation and scheduling service; (2) process payments; (3)
            send transactional emails (confirmations, notifications); (4)
            comply with legal obligations. We do not sell your personal
            information, use it for targeted advertising, or share it with
            third parties for cross-context behavioral advertising.
          </Body>
        </Section>

        <Section>
          <SectionHeading>Your rights under the CCPA/CPRA</SectionHeading>
          <ul style={LIST_STYLE}>
            <li style={LIST_ITEM_STYLE}>
              <strong>Right to Know</strong> — You may request a copy of the
              personal information we hold about you.
            </li>
            <li style={LIST_ITEM_STYLE}>
              <strong>Right to Delete</strong> — You may request deletion of
              your personal information, subject to certain exceptions.
            </li>
            <li style={LIST_ITEM_STYLE}>
              <strong>Right to Correct</strong> — You may request correction
              of inaccurate personal information.
            </li>
            <li style={LIST_ITEM_STYLE}>
              <strong>Right to Opt Out of Sale/Sharing</strong> — You may opt
              out of the sale or sharing of your personal information.
            </li>
            <li style={LIST_ITEM_STYLE}>
              <strong>Right to Limit Use of Sensitive PI</strong> — You may
              limit our use of sensitive personal information (OAuth tokens)
              to the purpose of providing the service (scheduling and
              publishing only).
            </li>
            <li style={LIST_ITEM_STYLE}>
              <strong>Right to Non-Discrimination</strong> — We will not
              discriminate against you for exercising any of these rights.
            </li>
            <li style={LIST_ITEM_STYLE}>
              <strong>Right to Data Portability</strong> — You may request an
              export of your personal information in a portable format.
            </li>
          </ul>
        </Section>

        <Section>
          <SectionHeading>How to exercise your rights</SectionHeading>
          <Body>
            You may exercise your CCPA/CPRA rights through the following
            methods:
          </Body>
          <ul style={LIST_STYLE}>
            <li style={LIST_ITEM_STYLE}>
              <strong>Do Not Sell or Share:</strong>{" "}
              <Link
                href="/legal/do-not-sell"
                style={{ color: "var(--color-primary)" }}
              >
                Submit an opt-out request
              </Link>
              {" "}(no account required).
            </li>
            <li style={LIST_ITEM_STYLE}>
              <strong>Limit Sensitive PI (authenticated users):</strong>{" "}
              <Link
                href="/account/data-privacy"
                style={{ color: "var(--color-primary)" }}
              >
                Account &gt; Data &amp; Privacy
              </Link>{" "}
              → toggle "Limit Use of Sensitive Personal Information".
            </li>
            <li style={LIST_ITEM_STYLE}>
              <strong>Access, Delete, Correct, Portability, Restriction:</strong>{" "}
              <Link
                href="/legal/dsr-request"
                style={{ color: "var(--color-primary)" }}
              >
                Submit a Data Subject Request
              </Link>{" "}
              (no account required). We respond within 45 days.
            </li>
            <li style={LIST_ITEM_STYLE}>
              <strong>By email:</strong>{" "}
              <a
                href="mailto:privacy@ozvor.com"
                style={{ color: "var(--color-primary)" }}
              >
                privacy@ozvor.com
              </a>
            </li>
          </ul>
          <Body>
            We will verify your identity before fulfilling access, deletion,
            or portability requests. For requests submitted without an
            account, we may send a verification email to the address you
            provide.
          </Body>
        </Section>

        <Section>
          <SectionHeading>Response timelines</SectionHeading>
          <Body>
            We will respond to verifiable consumer requests within 45 calendar
            days. If we need additional time (up to 90 days total), we will
            notify you of the extension and the reason.
          </Body>
        </Section>

        <Section>
          <SectionHeading>Sensitive personal information</SectionHeading>
          <Body>
            We collect OAuth access tokens for LinkedIn, Instagram, and
            Facebook as sensitive personal information under the CPRA. These
            tokens are stored encrypted and used exclusively to publish posts
            you have approved. We do not use these tokens for profiling,
            analytics, advertising, or any purpose other than the service you
            requested.
          </Body>
          <Body>
            You may limit the use of your sensitive PI at any time via{" "}
            <Link
              href="/account/data-privacy"
              style={{ color: "var(--color-primary)" }}
            >
              Account &gt; Data &amp; Privacy
            </Link>
            . Enabling this limitation does not affect your ability to schedule
            and publish posts.
          </Body>
        </Section>

        <Section>
          <SectionHeading>Contact us</SectionHeading>
          <Body>
            For privacy-related questions, contact our Privacy Team at{" "}
            <a
              href="mailto:privacy@ozvor.com"
              style={{ color: "var(--color-primary)" }}
            >
              privacy@ozvor.com
            </a>
            . For general inquiries, see our{" "}
            <Link href="/privacy-policy" style={{ color: "var(--color-primary)" }}>
              Privacy Policy
            </Link>
            .
          </Body>
        </Section>
      </main>

    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function Section({ children }: { children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: "var(--space-8)" }}>{children}</section>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2
      style={{
        fontSize: "var(--font-size-h2)",
        fontWeight: "var(--font-weight-semibold)",
        color: "var(--color-text)",
        marginTop: 0,
        marginBottom: "var(--space-3)",
      }}
    >
      {children}
    </h2>
  );
}

function Body({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        fontSize: "var(--font-size-body)",
        color: "var(--color-text)",
        lineHeight: "var(--line-height-body)",
        marginTop: 0,
        marginBottom: "var(--space-4)",
      }}
    >
      {children}
    </p>
  );
}

const LIST_STYLE: React.CSSProperties = {
  paddingLeft: "var(--space-6)",
  margin: "0 0 var(--space-4) 0",
};

const LIST_ITEM_STYLE: React.CSSProperties = {
  fontSize: "var(--font-size-body)",
  color: "var(--color-text)",
  lineHeight: "var(--line-height-body)",
  marginBottom: "var(--space-3)",
};
