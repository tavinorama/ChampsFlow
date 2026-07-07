// build-deliverables.mjs — regenerate every customer-facing PDF deliverable
// from its Markdown source with the Ozvor branded theme. One canonical place
// for the title/subtitle/kicker/badge args so the PDFs are reproducible.
//
//   node scripts/build-deliverables.mjs
//
// Requires Google Chrome (used by md-to-pdf.mjs in legacy headless mode).

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const mdToPdf = resolve(__dirname, "md-to-pdf.mjs");
const out = resolve(root, "apps/web/public/downloads");

const DELIVERABLES = [
  {
    in: "docs/marketing/lead-magnets/geo-visibility-guide.md",
    out: "The-GEO-Visibility-Guide.pdf",
    title: "The GEO Visibility Guide",
    subtitle: "How small businesses get cited by ChatGPT, Claude, Perplexity & Gemini in 2026",
    kicker: "Ozvor · Premium Guide",
    toc: true, breakSections: true,
  },
  {
    in: "docs/marketing/lead-magnets/whitepaper-understanding-geo.md",
    out: "Understanding-GEO-Search.pdf",
    title: "Understanding GEO Search",
    subtitle: "How AI answer engines decide which businesses to name — and what that means for yours",
    kicker: "Ozvor Whitepaper · Get-Cited Kit, Part 2",
    toc: true, breakSections: true,
  },
  {
    in: "docs/marketing/lead-magnets/5-high-citation-post-templates.md",
    out: "5-High-Citation-Post-Templates.pdf",
    title: "5 High-Citation Post Templates",
    subtitle: "Fill-in-the-blank LinkedIn structures engineered to get your business named by AI",
    kicker: "Ozvor · Growth resource",
    toc: true, breakSections: false,
  },
  {
    in: "docs/marketing/lead-magnets/llm-citation-tracker.md",
    out: "LLM-Citation-Tracker-Methodology.pdf",
    title: "The LLM Citation Tracker",
    subtitle: "Monitor when ChatGPT, Claude, Perplexity & Gemini mention your business — in 10 minutes a week",
    kicker: "Ozvor · Methodology",
    toc: true, breakSections: false,
  },
  {
    in: "docs/marketing/lead-magnets/get-cited-kit.md",
    out: "The-Get-Cited-Kit.pdf",
    title: "The Get-Cited Kit",
    subtitle: "Your 30-day plan to get named by ChatGPT, Claude, Perplexity & Gemini",
    kicker: "Ozvor · $29",
    toc: true, breakSections: true,
  },
];

for (const d of DELIVERABLES) {
  const args = [
    mdToPdf,
    resolve(root, d.in),
    resolve(out, d.out),
    "--title", d.title,
    "--subtitle", d.subtitle,
    "--kicker", d.kicker,
    "--badge", "Ozvor",
  ];
  if (d.toc) args.push("--toc");
  if (d.breakSections) args.push("--breakSections");
  process.stdout.write(`Building ${d.out} … `);
  execFileSync("node", args, { stdio: ["ignore", "ignore", "inherit"] });
  process.stdout.write("ok\n");
}
console.log("All deliverables rebuilt.");
