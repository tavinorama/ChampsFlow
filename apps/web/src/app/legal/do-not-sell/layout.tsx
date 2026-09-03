/**
 * Metadata shell for /legal/do-not-sell. P1-04.
 *
 * The page itself is a client component (it runs a stateful form), so it cannot
 * export `metadata` — which is why this route sat in the sitemap with no
 * canonical. A sibling layout is the smallest way to attach one: no behaviour
 * changes, and the page is not split into a server shell plus an island just to
 * carry three lines of metadata.
 */
import { pageMetadata } from "../../../lib/seo";

export const metadata = pageMetadata({
  title: "Do Not Sell or Share My Personal Information",
  description: "Submit a CCPA/CPRA opt-out request. No account needed — the form is open to any visitor.",
  path: "/legal/do-not-sell",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
