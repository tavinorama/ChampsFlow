"use client";

/**
 * FilmStartForm: the two field entry into the real free test.
 *
 * Website and email. Nothing else, because nothing else is needed to get the
 * visitor moving.
 *
 * How it connects to the real product: the free test runs on POST /api/test
 * (see (marketing)/test/InvisibilityTestClient.tsx). That endpoint needs a
 * brand name and a category as well, and we refuse to guess either one: a
 * guessed brand or category produces a wrong audit, and this company does not
 * ship invented audit data. So this form validates the two fields it owns,
 * writes them into the SAME draft store the free test page reads
 * (form-draft, key "free-test"), and hands the visitor straight to /test with
 * both boxes already filled. One short question is left there, then the real
 * POST runs.
 *
 * The email never travels in the URL: it goes through sessionStorage only.
 */

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { saveFormDraft } from "../../lib/form-draft";
import { trackEvent } from "../../lib/track";

const DOMAIN_RE =
  /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Same normalisation the free test page applies before it calls the API. */
export function cleanDomain(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "")
    .trim();
}

export function isValidDomain(value: string): boolean {
  return DOMAIN_RE.test(value);
}

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

export function FilmStartForm() {
  const router = useRouter();
  const siteId = useId();
  const mailId = useId();

  const [site, setSite] = useState("");
  const [email, setEmail] = useState("");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);

  const domain = cleanDomain(site);
  const siteError = tried && !isValidDomain(domain);
  const mailError = tried && !isValidEmail(email);

  function submit(e: React.FormEvent): void {
    e.preventDefault();
    setTried(true);
    if (busy) return;
    if (!isValidDomain(domain) || !isValidEmail(email)) return;

    setBusy(true);
    // The free test page picks this up on mount and fills both fields.
    saveFormDraft("free-test", { domain, email: email.trim() });
    trackEvent("cta_free_test_click", { source: "home_film" });
    router.push("/test");
  }

  return (
    <div>
      <form className="film-form" onSubmit={submit} noValidate>
        <div className="film-field">
          <label htmlFor={siteId}>Your website</label>
          <input
            id={siteId}
            name="website"
            type="text"
            inputMode="url"
            autoComplete="url"
            placeholder="yourcompany.com"
            value={site}
            onChange={(e) => setSite(e.target.value)}
            aria-invalid={siteError || undefined}
            aria-describedby={siteError ? `${siteId}-err` : undefined}
          />
          {siteError ? (
            <p className="film-error" id={`${siteId}-err`}>
              Enter a website like yourcompany.com
            </p>
          ) : null}
        </div>

        <div className="film-field">
          <label htmlFor={mailId}>Where to send it</label>
          <input
            id={mailId}
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@yourcompany.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={mailError || undefined}
            aria-describedby={mailError ? `${mailId}-err` : undefined}
          />
          {mailError ? (
            <p className="film-error" id={`${mailId}-err`}>
              Enter a real email so we can send the result
            </p>
          ) : null}
        </div>

        <button type="submit" disabled={busy}>
          {busy ? "Opening your test" : "Show me what AI says"}
        </button>
      </form>

      <p className="film-fine">
        <b>No card.</b> Results in 60 seconds. 30 day money back on any paid
        plan.
      </p>
    </div>
  );
}
