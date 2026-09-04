/**
 * Metadata shell for /legal/dsr-request. P1-04 + 10.A.11.
 *
 * A página é client component (formulário com estado) e não pode exportar
 * `metadata` — daí este layout irmão. Ele carrega DUAS coisas que chegaram por
 * caminhos diferentes e ambas valem: o canonical/título/descrição (P1-04, sem
 * eles a rota estava no sitemap sem canonical) e o `robots: noindex` (10.A.11,
 * uma página de pedido de dados nunca deve aparecer na busca). O noindex vence
 * a indexação; o canonical continua correto para quem chega pelo link direto.
 */
import { pageMetadata } from "../../../lib/seo";

export const metadata = {
  ...pageMetadata({
    title: "Data Subject Request",
    description: "Request access, correction, deletion or a copy of your personal data under the GDPR, LGPD and US state privacy laws.",
    path: "/legal/dsr-request",
  }),
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
