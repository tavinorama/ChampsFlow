/**
 * Metadata shell for /legal/do-not-sell. P1-04.
 *
 * A página é client component (formulário com estado) e não pode exportar
 * `metadata` — daí este layout irmão, que carrega canonical/título/descrição.
 *
 * INDEXÁVEL, de propósito. O sweep 10.A.11 (#572) tinha posto `robots: noindex`
 * aqui e tirado a rota do sitemap, enquanto o E2E de P1-04 (#589) continuava a
 * listar a rota como indexável — contradição que manteve a suite vermelha na
 * main. A decisão (2026-09-11): este é o canal público de opt-out CCPA/CPRA
 * (Cal. Civ. Code § 1798.135), linkado da política de privacidade, do rodapé e
 * do banner de cookies. Não tem dado pessoal nenhum; deixar o Google encontrar
 * "ozvor do not sell" facilita o exercício do direito (o que a lei pede), e
 * nada em CCPA/GDPR/LGPD pede que a página fique fora da busca. O que continua
 * noindex são as páginas de token (kit/[token], ai-audit/[token]) e /welcome.
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
