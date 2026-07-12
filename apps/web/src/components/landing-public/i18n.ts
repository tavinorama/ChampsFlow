/**
 * i18n.ts — locale for the public Ozvor Pages CHROME (nav, footer, mobile menu).
 *
 * The generated CONTENT (headlines, reviews, FAQ) is already in the business's
 * language — the LLM writes in the language of the Google Maps reviews it was
 * grounded on. What was still hardcoded English was the Ozvor-built chrome
 * around it (the "Get in touch" CTA, footer section labels, the mobile "Menu"
 * button). This module localizes those so a Portuguese/Spanish business's site
 * reads in its own language, and drives the subtree `lang` attribute (a11y/SEO).
 *
 * The site's language comes from `landing_sites.theme.lang` (BCP-47-ish, e.g.
 * "pt-BR"); we normalize to the supported set and fall back to English.
 */

export type Locale = "en" | "pt" | "es";

const SUPPORTED: readonly Locale[] = ["en", "pt", "es"] as const;

/** Normalize any stored language tag to a supported Locale (default "en"). */
export function normalizeLocale(v: unknown): Locale {
  if (typeof v !== "string") return "en";
  const base = v.trim().toLowerCase().split(/[-_]/)[0];
  return (SUPPORTED as readonly string[]).includes(base) ? (base as Locale) : "en";
}

interface ChromeLabels {
  home: string;
  getInTouch: string;
  menu: string;
  hours: string;
  pages: string;
  website: string;
  madeWith: string; // "Made with {Ozvor}" — brand word interpolated by the caller
}

export const CHROME_LABELS: Record<Locale, ChromeLabels> = {
  en: {
    home: "Home",
    getInTouch: "Get in touch",
    menu: "Menu",
    hours: "Hours",
    pages: "Pages",
    website: "Website",
    madeWith: "Made with",
  },
  pt: {
    home: "Início",
    getInTouch: "Fale conosco",
    menu: "Menu",
    hours: "Horário",
    pages: "Páginas",
    website: "Site",
    madeWith: "Feito com",
  },
  es: {
    home: "Inicio",
    getInTouch: "Contáctanos",
    menu: "Menú",
    hours: "Horario",
    pages: "Páginas",
    website: "Sitio web",
    madeWith: "Hecho con",
  },
};

/** Language name for the "site navigation" aria-label etc. */
export function chromeLabels(locale: Locale): ChromeLabels {
  return CHROME_LABELS[locale];
}
