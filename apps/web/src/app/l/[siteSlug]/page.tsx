/**
 * /l/[siteSlug] — public Ozvor Pages site home (issue #208, PR-6).
 *
 * SERVER component: fetches GET /api/public/landing/[siteSlug] from the Hono
 * API via INTERNAL_API_URL with a 5-minute ISR-style revalidate, so DB load
 * from public traffic stays low regardless of visitor volume. `notFound()`
 * on any miss (missing/draft/suspended site, or a home page that isn't
 * published) — the public API already returns an identical 404 body for all
 * three reasons (no oracle); this page just honors that.
 *
 * Renders ONLY stored content (business facts + sections) — no fabricated
 * copy (audit integrity rule, postmortem PR#90). No Google Maps embed/API.
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { PublicLandingChrome, type PublicNavItem } from "../../../components/landing-public/PublicLandingChrome";
import { SectionRenderer } from "../../../components/landing-public/SectionRenderer";
import { LeadForm } from "../../../components/landing-public/LeadForm";
import { PageViewBeacon } from "../../../components/landing-public/PageViewBeacon";
import { buildLocalBusinessJsonLd, buildFaqJsonLd, safeJsonLd } from "../../../components/landing-public/json-ld";
import { SITE_URL } from "../../../lib/site";

export const revalidate = 300;

interface PublicSite {
  slug: string;
  business: Record<string, unknown>;
  theme: Record<string, unknown>;
  /** Google Place ID (#208 PR-9) — drives the optional Maps Embed iframe. */
  place_id: string | null;
}

interface PublicPage {
  slug: string;
  title: string;
  sections: unknown;
  // json_ld is folded in by the generator (LocalBusiness + AggregateRating +
  // Review / FAQPage) — the RICH, real-facts schema for GEO/AI-search + SEO.
  seo: { title?: string; description?: string; json_ld?: unknown[] } | null;
}

interface PublicLandingResponse {
  site: PublicSite;
  nav: PublicNavItem[];
  page: PublicPage | null;
}

const INTERNAL_API_URL = process.env.INTERNAL_API_URL ?? "http://localhost:3001";

async function fetchSite(siteSlug: string): Promise<PublicLandingResponse | null> {
  try {
    const res = await fetch(
      `${INTERNAL_API_URL}/api/public/landing/${encodeURIComponent(siteSlug)}`,
      { next: { revalidate: 300 } }
    );
    if (!res.ok) return null;
    return (await res.json()) as PublicLandingResponse;
  } catch {
    return null;
  }
}

function businessName(site: PublicSite): string {
  const name = site.business?.name;
  return typeof name === "string" && name.trim() ? name.trim() : site.slug;
}

function accentColor(theme: Record<string, unknown>): string | undefined {
  const primary = theme?.primary;
  return typeof primary === "string" && primary ? primary : undefined;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ siteSlug: string }>;
}): Promise<Metadata> {
  const { siteSlug } = await params;
  const data = await fetchSite(siteSlug);
  if (!data || !data.page) {
    return { robots: { index: false, follow: false } };
  }

  const title = data.page.seo?.title || data.page.title || businessName(data.site);
  const description = data.page.seo?.description || "";
  const url = `${SITE_URL}/l/${siteSlug}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    robots: { index: true, follow: true },
    openGraph: {
      title,
      description,
      url,
      siteName: businessName(data.site),
      type: "website",
    },
  };
}

export default async function PublicLandingSiteHomePage({
  params,
}: {
  params: Promise<{ siteSlug: string }>;
}) {
  const { siteSlug } = await params;
  const data = await fetchSite(siteSlug);
  if (!data || !data.page) notFound();

  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const name = businessName(data.site);
  // Prefer the generator's stored rich schema (has AggregateRating + Review
  // from real Google reviews); fall back to the client-built schema when a
  // page predates the rich generator.
  const storedJsonLd = Array.isArray(data.page.seo?.json_ld)
    ? (data.page.seo!.json_ld as unknown[]).filter(
        (n): n is Record<string, unknown> => !!n && typeof n === "object"
      )
    : [];
  const localBusinessJsonLd = storedJsonLd.length > 0 ? null : buildLocalBusinessJsonLd(siteSlug, data.site.business);
  const faqJsonLd = storedJsonLd.length > 0 ? null : buildFaqJsonLd(data.page.sections);

  return (
    <PublicLandingChrome
      siteSlug={siteSlug}
      businessName={name}
      nav={data.nav}
      activeSlug=""
      accentColor={accentColor(data.site.theme)}
      business={data.site.business}
    >
      {storedJsonLd.map((node, i) => (
        <script
          key={`ld-${i}`}
          nonce={nonce}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: safeJsonLd(node) }}
        />
      ))}
      {localBusinessJsonLd && (
        <script
          nonce={nonce}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: safeJsonLd(localBusinessJsonLd) }}
        />
      )}
      {faqJsonLd && (
        <script
          nonce={nonce}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: safeJsonLd(faqJsonLd) }}
        />
      )}
      <PageViewBeacon siteSlug={siteSlug} />
      <SectionRenderer
        sections={data.page.sections}
        siteSlug={siteSlug}
        theme={data.site.theme}
        placeId={data.site.place_id}
      />
      <LeadForm siteSlug={siteSlug} accentColor={accentColor(data.site.theme)} />
    </PublicLandingChrome>
  );
}
