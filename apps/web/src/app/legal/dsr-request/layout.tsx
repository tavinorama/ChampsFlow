/**
 * Metadata shell for /legal/dsr-request. P1-04.
 *
 * The page itself is a client component (it runs a stateful form), so it cannot
 * export `metadata` — which is why this route sat in the sitemap with no
 * canonical. A sibling layout is the smallest way to attach one: no behaviour
 * changes, and the page is not split into a server shell plus an island just to
 * carry three lines of metadata.
 */
import { pageMetadata } from "../../../lib/seo";

export const metadata = pageMetadata({
  title: "Data Subject Request",
  description: "Request access, correction, deletion or a copy of your personal data under the GDPR, LGPD and US state privacy laws.",
  path: "/legal/dsr-request",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
