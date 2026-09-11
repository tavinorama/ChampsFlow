/**
 * Metadata shell for /legal/dsr-request. P1-04.
 *
 * A página é client component (formulário com estado) e não pode exportar
 * `metadata` — daí este layout irmão, que carrega canonical/título/descrição.
 *
 * INDEXÁVEL, de propósito. O sweep 10.A.11 (#572) tinha posto `robots: noindex`
 * aqui e tirado a rota do sitemap, enquanto o E2E de P1-04 (#589) continuava a
 * listar a rota como indexável — contradição que manteve a suite vermelha na
 * main. A decisão (2026-09-11): este é o canal público de direitos do titular
 * (GDPR art. 12/15-22, LGPD art. 18, CCPA § 1798.100-130), linkado da política
 * de privacidade, do rodapé e de /support — inclusive para ex-utilizadores que
 * já não conseguem entrar. Não tem dado pessoal nenhum; ser encontrável na
 * busca facilita o exercício do direito, e nenhuma das três leis pede que a
 * página fique fora do índice. O que continua noindex são as páginas de token
 * (kit/[token], ai-audit/[token]) e /welcome.
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
