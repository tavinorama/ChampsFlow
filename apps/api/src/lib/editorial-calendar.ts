/**
 * editorial-calendar.ts — the WEEK the content cells follow (founder, 14/08):
 * "conteúdos diversos durante os 7 dias da semana, mais do que temos hoje".
 *
 * Before this, X posted Mon/Wed/Fri, LinkedIn Tue/Thu, weekends had only the
 * video, and nothing ever spoke about the new product. Now every cell runs
 * every day, and THE DAY picks the theme — so a week reads as seven different
 * things, not one thing seven times. The AI Audit Stack ($49, the BR entry
 * product) is a fixed theme twice a week and a permanent option every day.
 *
 * Pure data + one lookup, injected by the runner into every reasoning node as
 * the [__day__] block. Prompts read it; nothing here talks to a clock — the
 * runner passes `now`. Themes are English-first content, PT labels internal.
 */

export type ThemeSlug =
  | "geo-proof"        // a real number/case: what AI engines say about brands
  | "ai-audit-stack"   // the $49 product: too many tools, we match your stack
  | "how-to"           // one concrete step to get cited by AI
  | "contrarian"       // an opinion against the SEO common sense
  | "story"            // a founder/customer story with a lesson
  | "behind-scenes"    // how the org runs itself (agents, honesty, numbers)
  | "weekly-recap";    // the week in 3 lines + what is next

export interface DayTheme {
  /** 0 = Sunday … 6 = Saturday (JS getUTCDay). */
  dow: number;
  label: string;
  theme: ThemeSlug;
  /** One line the briefing must honor — the angle of the day. */
  angle: string;
  /** Which product/CTA the day naturally points to. */
  cta: "free-test" | "ai-audit" | "kit" | "organicposts" | "none";
}

/**
 * The seven days. Alternates product days with value days so the feed never
 * feels like an ad wall: two AI Audit days (Tue, Sat), one Kit/how-to (Thu),
 * one free-test proof (Mon), and pure value on the rest.
 */
export const WEEK: readonly DayTheme[] = [
  { dow: 1, label: "Monday",    theme: "geo-proof",      angle: "Open the week with a REAL number: how AI engines describe a brand today (audit data, no invented stats). Point to the free test.", cta: "free-test" },
  { dow: 2, label: "Tuesday",   theme: "ai-audit-stack", angle: "The AI tool overload: too many tools, nobody knows which one fits their business. We match the stack to their pains, for $49. One vertical example (clinic, agency, ecommerce...).", cta: "ai-audit" },
  { dow: 3, label: "Wednesday", theme: "contrarian",     angle: "One opinion against the SEO common sense, argued with a fact. Invite disagreement.", cta: "none" },
  { dow: 4, label: "Thursday",  theme: "how-to",         angle: "One concrete step anyone can do this week to get cited by AI. Practical, numbered. Point to the Kit or the free test.", cta: "kit" },
  { dow: 5, label: "Friday",    theme: "story",          angle: "A story with a lesson: a founder moment, a customer situation, a mistake we fixed. Human, honest, no hype.", cta: "organicposts" },
  { dow: 6, label: "Saturday",  theme: "ai-audit-stack", angle: "Weekend read: pick ONE niche (dental, real estate, restaurants, agencies...) and show which AI tools actually fit its pains and which are hype. Point to the $49 audit.", cta: "ai-audit" },
  { dow: 0, label: "Sunday",    theme: "weekly-recap",   angle: "The week in 3 lines: what we learned, one number, what is next. Light, no selling.", cta: "none" },
];

export function themeFor(now: Date): DayTheme {
  const dow = now.getUTCDay();
  return WEEK.find((d) => d.dow === dow) ?? WEEK[0]!;
}

/**
 * The [__day__] block every content briefing receives. Names the day, the
 * theme, the angle and the natural CTA — the briefing must honor the theme
 * (freshness across the week is the whole point) but may skip the CTA when
 * the day says "none".
 */
export function dayBlock(now: Date): string {
  const d = themeFor(now);
  return [
    `DIA DA SEMANA: ${d.label} · TEMA DO DIA: ${d.theme}`,
    `ANGULO: ${d.angle}`,
    `CTA NATURAL: ${d.cta === "none" ? "nenhum (dia de valor puro)" : d.cta}`,
    "REGRA: o briefing tem que honrar o TEMA DO DIA. A semana precisa ler como 7 coisas diferentes, nao 1 coisa 7 vezes.",
  ].join("\n");
}

/** Every product day in the week points at a real product surface. */
export const CTA_URLS: Record<Exclude<DayTheme["cta"], "none">, string> = {
  "free-test": "https://ozvor.com/test",
  "ai-audit": "https://ozvor.com/ai-audit",
  kit: "https://ozvor.com/kit",
  organicposts: "https://ozvor.com/organicposts",
};
