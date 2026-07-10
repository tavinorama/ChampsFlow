/**
 * /l/[siteSlug]/[pageSlug] — a named published page on a public Ozvor Pages
 * site (issue #208, PR-6).
 *
 * SERVER component: fetches GET /api/public/landing/[siteSlug]/[pageSlug]
 * from the Hono API via INTERNAL_API_URL with a 5-minute revalidate.
 * `notFound()` on any miss — the public API returns an identical 404 body
 * whether the site is missing/draft/suspended or the page itself is
 * missing/draft (no oracle); this page just honors that.
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { PublicLandingChrome, type PublicNavItem } from "../../../../components/landing-public/PublicLandingChrome";
import { SectionRenderer } from "../../../../components/landing-public/SectionRenderer";
import { LeadForm } from "../../../../components/landing-public/LeadForm";
import { PageViewBeacon } from "../../../../components/landing-public/PageViewBeacon";
import { buildFaqJsonLd, buildBreadcrumbJsonLd, safeJsonLd } from "../../../../components/landing-public/json-ld";
import { SITE_URL } from "../../../../lib/site";

export const revalidate = 300;

interface PublicSite {
  slug: string;
  business: Record<string, unknown>;
  theme: Record<string, unknown>;
}

interface PublicPage {
  slug: string;
  title: string;
  sections: unknown;
  seo: { title?: string; description?: string } | null;
}

interface PublicLandingResponse {
  site: PublicSite;
  nav: PublicNavItem[];
  page: PublicPage;
}

const INTERNAL_API_URL = process.env.INTERNAL_API_URL ?? "http://localhost:3001";

async function fetchPage(siteSlug: string, pageSlug: string): Promise<PublicLandingResponse | null> {
  try {
    const res = await fetch(
      `${INTERNAL_API_URL}/api/public/landing/${encodeURIComponent(siteSlug)}/${encodeURIComponent(pageSlug)}`,
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
  params: Promise<{ siteSlug: string; pageSlug: string }>;
}): Promise<Metadata> {
  const { siteSlug, pageSlug } = await params;
  const data = await fetchPage(siteSlug, pageSlug);
  if (!data) {
    return { robots: { index: false, follow: false } };
  }

  const title = data.page.seo?.title || data.page.title || businessName(data.site);
  const description = data.page.seo?.description || "";
  const url = `${SITE_URL}/l/${siteSlug}/${pageSlug}`;

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

export default async function PublicLandingSubPage({
  params,
}: {
  params: Promise<{ siteSlug: string; pageSlug: string }>;
}) {
  const { siteSlug, pageSlug } = await params;
  const data = await fetchPage(siteSlug, pageSlug);
  if (!data) notFound();

  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const name = businessName(data.site);
  const faqJsonLd = buildFaqJsonLd(data.page.sections);
  const breadcrumbJsonLd = buildBreadcrumbJsonLd(siteSlug, name, data.page.title, pageSlug);

  return (
    <PublicLandingChrome
      siteSlug={siteSlug}
      businessName={name}
      nav={data.nav}
      activeSlug={pageSlug}
      accentColor={accentColor(data.site.theme)}
    >
      {faqJsonLd && (
        <script
          nonce={nonce}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: safeJsonLd(faqJsonLd) }}
        />
      )}
      <script
        nonce={nonce}
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbJsonLd) }}
      />
      <PageViewBeacon siteSlug={siteSlug} pageSlug={pageSlug} />
      <SectionRenderer sections={data.page.sections} siteSlug={siteSlug} theme={data.site.theme} />
      <LeadForm siteSlug={siteSlug} accentColor={accentColor(data.site.theme)} />
    </PublicLandingChrome>
  );
}
