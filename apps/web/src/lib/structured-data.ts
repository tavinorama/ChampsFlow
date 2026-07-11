/**
 * structured-data.ts — JSON-LD builder helpers for Ozvor
 *
 * All schema.org types used across marketing pages are built here so the
 * canonical Organization shape is defined once and reused everywhere.
 *
 * Usage (server components):
 *   import { orgJsonLd, websiteJsonLd, breadcrumbJsonLd } from "./structured-data";
 *   import { safeJsonLd } from "./safe-json-ld";
 *   <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(orgJsonLd) }} />
 *
 * Always serialize with safeJsonLd (./safe-json-ld.ts), never raw
 * JSON.stringify — these objects can carry tenant/user-controlled strings
 * and a raw stringify is an XSS vector inside <script> (Hermes #216, #238).
 */

// ---------------------------------------------------------------------------
// Canonical Organization constant — single source of truth
// ---------------------------------------------------------------------------

export const ORG = {
  "@type": "Organization",
  name: "Ozvor",
  url: "https://ozvor.com",
  logo: {
    "@type": "ImageObject",
    url: "https://ozvor.com/logo.png",
    width: 200,
    height: 50,
  },
  description:
    "AI Search Visibility platform for SMBs — audits brand visibility across ChatGPT, Claude, Perplexity, Gemini, and Google AI Overview; computes the Ozvor AI Visibility Score; benchmarks competitors; and builds a GEO content plan for organic AI-search visibility.",
  contactPoint: {
    "@type": "ContactPoint",
    contactType: "customer support",
    email: "hello@ozvor.com",
    availableLanguage: ["English", "Portuguese"],
  },
  sameAs: [] as string[],
} as const;

// ---------------------------------------------------------------------------
// Organization JSON-LD
// ---------------------------------------------------------------------------

export const orgJsonLd = {
  "@context": "https://schema.org",
  ...ORG,
};

// ---------------------------------------------------------------------------
// WebSite JSON-LD (no SearchAction — no site search exists)
// ---------------------------------------------------------------------------

export const websiteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "Ozvor",
  url: "https://ozvor.com",
};

// ---------------------------------------------------------------------------
// BreadcrumbList builder
// ---------------------------------------------------------------------------

export interface BreadcrumbItem {
  name: string;
  url: string;
}

export function breadcrumbJsonLd(items: BreadcrumbItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

// ---------------------------------------------------------------------------
// BlogPosting/Article builder
// ---------------------------------------------------------------------------

export interface ArticleSchemaOptions {
  headline: string;
  description: string;
  url: string;
  datePublished?: string;
  dateModified?: string;
  image?: string;
}

export function articleJsonLd(opts: ArticleSchemaOptions) {
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: opts.headline,
    description: opts.description,
    url: opts.url,
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": opts.url,
    },
    ...(opts.datePublished ? { datePublished: opts.datePublished } : {}),
    ...(opts.dateModified ? { dateModified: opts.dateModified } : {}),
    author: {
      "@type": "Organization",
      name: "Ozvor",
      url: "https://ozvor.com",
    },
    publisher: {
      "@type": "Organization",
      name: "Ozvor",
      url: "https://ozvor.com",
      logo: {
        "@type": "ImageObject",
        url: "https://ozvor.com/logo.png",
      },
    },
    ...(opts.image
      ? {
          image: {
            "@type": "ImageObject",
            url: opts.image,
            width: 1200,
            height: 630,
          },
        }
      : {}),
  };
}
