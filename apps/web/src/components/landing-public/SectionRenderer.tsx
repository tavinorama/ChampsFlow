/**
 * SectionRenderer — semantic, accessible, mobile-first HTML for every Ozvor
 * Pages section type (issue #208, PR-6).
 *
 * Renders ONLY the stored `sections` content via section-render-model.ts's
 * pure mapper — no fabricated content, no invented stats/reviews (audit
 * integrity rule, postmortem PR#90). Unknown section types are skipped
 * silently (mapSectionToRenderModel returns null for them).
 *
 * map_nap renders a real Google Maps Embed iframe (Maps Embed API — free,
 * unlimited, no Places quota) ABOVE the plain-text address when the site
 * carries a `place_id` (#208 PR-9) AND the browser-restricted embed key is
 * configured; the plain-text address always stays underneath as the SEO-
 * friendly fallback and for sites/keys without an embed. The embed key is
 * NEXT_PUBLIC_* by design (referrer-locked to ozvor.com/* server-side in the
 * Google Cloud console — the lock IS the security control, not secrecy).
 * The server-only GOOGLE_PLACES_API_KEY is NEVER referenced here.
 */

import type { CSSProperties } from "react";
import {
  mapSectionsToRenderModels,
  type SectionRenderModel,
} from "./section-render-model";
import { safeHref } from "./json-ld";
import { safeHexColor, onAccent } from "./color";

// ---------------------------------------------------------------------------
// Theme — a small neutral palette, overridable from landing_sites.theme.
// ---------------------------------------------------------------------------

export type LandingTemplate = "classic" | "modern" | "bold" | "minimal";

export interface LandingTheme {
  primary?: string;
  text?: string;
  muted?: string;
  surface?: string;
  border?: string;
  /** Contrast-safe text colour for text sitting ON `primary` (derived). */
  onPrimary?: string;
  /** Visual template — drives typography + shape so sites don't all look alike. */
  template?: LandingTemplate;
  // Derived typography/shape tokens (populated by resolveTheme from the template).
  headingFont?: string;
  bodyFont?: string;
  headingWeight?: number;
  headingTracking?: string;
  radius?: string;
  heroAlign?: "left" | "center";
}

// Curated typography + shape presets. System-safe font stacks ONLY — the public
// CSP blocks external font CDNs, so we differentiate with distinct system
// families (serif vs sans vs rounded), weight, tracking and corner radius. Each
// template gives a genuinely different feel, not just a different accent hue.
interface TemplateTokens {
  headingFont: string;
  bodyFont: string;
  headingWeight: number;
  headingTracking: string;
  radius: string;
  heroAlign: "left" | "center";
}

const SANS = "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const SERIF = "Georgia, 'Iowan Old Style', 'Times New Roman', Times, serif";
const ROUNDED = "'Segoe UI Rounded', ui-rounded, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

const TEMPLATE_PRESETS: Record<LandingTemplate, TemplateTokens> = {
  // Warm, established — serif display over clean sans. Cafés, restaurants, trades.
  classic: { headingFont: SERIF, bodyFont: SANS, headingWeight: 700, headingTracking: "-0.01em", radius: "8px", heroAlign: "left" },
  // Clean, contemporary (closest to the original look). SaaS, agencies, services.
  modern:  { headingFont: SANS, bodyFont: SANS, headingWeight: 800, headingTracking: "-0.02em", radius: "12px", heroAlign: "left" },
  // Punchy, high-energy — heaviest weight, tightest tracking. Fitness, salons, events.
  bold:    { headingFont: SANS, bodyFont: SANS, headingWeight: 900, headingTracking: "-0.03em", radius: "6px", heroAlign: "left" },
  // Airy, understated — lighter weight, centred hero, soft rounding. Wellness, law, finance.
  minimal: { headingFont: ROUNDED, bodyFont: SANS, headingWeight: 600, headingTracking: "0", radius: "16px", heroAlign: "center" },
};

const DEFAULT_TEMPLATE: LandingTemplate = "modern";

const DEFAULT_THEME: Required<LandingTheme> = {
  primary: "#0c7d54",
  text: "#17211c",
  muted: "#5c6e65",
  surface: "#ffffff",
  border: "#d5dfd9",
  onPrimary: "#ffffff",
  template: DEFAULT_TEMPLATE,
  ...TEMPLATE_PRESETS[DEFAULT_TEMPLATE],
};

function resolveTheme(theme: unknown): Required<LandingTheme> {
  const t = (theme && typeof theme === "object" ? theme : {}) as Record<string, unknown>;
  // Sanitize the tenant brand colour to a strict hex (#259) — defends every
  // style sink and keeps onAccent()'s WCAG maths well-defined.
  const primary = safeHexColor(t.primary, DEFAULT_THEME.primary);
  const template: LandingTemplate =
    typeof t.template === "string" && t.template in TEMPLATE_PRESETS
      ? (t.template as LandingTemplate)
      : DEFAULT_TEMPLATE;
  const tokens = TEMPLATE_PRESETS[template];
  return {
    primary,
    text: typeof t.text === "string" && t.text ? t.text : DEFAULT_THEME.text,
    muted: typeof t.muted === "string" && t.muted ? t.muted : DEFAULT_THEME.muted,
    surface: typeof t.surface === "string" && t.surface ? t.surface : DEFAULT_THEME.surface,
    border: typeof t.border === "string" && t.border ? t.border : DEFAULT_THEME.border,
    onPrimary: onAccent(primary),
    template,
    ...tokens,
  };
}

// ---------------------------------------------------------------------------
// Shared styles
// ---------------------------------------------------------------------------

const sectionStyle: CSSProperties = {
  maxWidth: "1080px",
  margin: "0 auto",
  padding: "2.5rem 1.5rem",
};

function headingStyle(theme: Required<LandingTheme>): CSSProperties {
  return {
    fontSize: "clamp(1.375rem, 3.5vw, 2rem)",
    fontFamily: theme.headingFont,
    fontWeight: theme.headingWeight,
    letterSpacing: theme.headingTracking,
    margin: "0 0 1rem 0",
    color: theme.text,
  };
}

// ---------------------------------------------------------------------------
// Per-section renderers
// ---------------------------------------------------------------------------

function Hero({ model, theme }: { model: Extract<SectionRenderModel, { kind: "hero" }>; theme: Required<LandingTheme> }) {
  const hasImage = Boolean(model.image);
  const stars = "★".repeat(Math.max(0, Math.min(5, Math.round(model.rating ?? 0))));
  return (
    // Full-width band with a soft brand tint; the image (right) brings the colour.
    <header style={{ background: `linear-gradient(180deg, ${theme.surface} 0%, ${theme.primary}0d 100%)` }}>
      <div
        style={{
          maxWidth: "1080px",
          margin: "0 auto",
          padding: "3.75rem 1.5rem",
          display: "grid",
          // auto-fit stacks to a single column on narrow screens with no media query.
          gridTemplateColumns: hasImage ? "repeat(auto-fit, minmax(300px, 1fr))" : "1fr",
          gap: "2.75rem",
          alignItems: "center",
        }}
      >
        {/* Text — alignment driven by the template (minimal centres the hero). */}
        <div style={{ textAlign: theme.heroAlign, ...(theme.heroAlign === "center" ? { margin: "0 auto", maxWidth: "44ch" } : {}) }}>
          <h1
            style={{
              fontSize: "clamp(2rem, 5vw, 3.25rem)",
              fontFamily: theme.headingFont,
              fontWeight: theme.headingWeight,
              letterSpacing: theme.headingTracking,
              lineHeight: 1.03,
              margin: 0,
              color: theme.text,
            }}
          >
            {model.headline || model.businessName}
          </h1>
          {model.subheadline && (
            <p style={{ marginTop: "1.1rem", fontSize: "1.15rem", lineHeight: 1.5, color: theme.muted, maxWidth: "34ch", ...(theme.heroAlign === "center" ? { marginInline: "auto" } : {}) }}>
              {model.subheadline}
            </p>
          )}
          <div style={{ marginTop: "1.75rem" }}>
            <a
              href="#contact"
              style={{
                display: "inline-flex",
                alignItems: "center",
                minHeight: "46px",
                padding: "0.8rem 1.6rem",
                background: theme.primary,
                color: theme.onPrimary,
                fontWeight: 700,
                textDecoration: "none",
                borderRadius: theme.radius,
              }}
            >
              {model.ctaLabel}
            </a>
          </div>
          {model.rating != null && (
            <div style={{ marginTop: "1.5rem", display: "flex", alignItems: "center", gap: "0.55rem", fontSize: "0.95rem", color: theme.muted }}>
              <span aria-hidden="true" style={{ color: "#e0a325", letterSpacing: "2px", fontSize: "1.05rem" }}>
                {stars}
              </span>
              <strong style={{ color: theme.text }}>{model.rating}</strong>
              {model.reviewCount != null && <span>&middot; {model.reviewCount} reviews on Google</span>}
            </div>
          )}
        </div>

        {/* Photo — RIGHT (from Google Maps, via the proxy). */}
        {model.image && (
          <figure style={{ margin: 0 }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- proxied Google photo, dynamic host */}
            <img
              src={model.image}
              alt={model.imageAlt || model.businessName}
              loading="eager"
              style={{
                width: "100%",
                aspectRatio: "5 / 4",
                objectFit: "cover",
                borderRadius: "18px",
                border: `1px solid ${theme.border}`,
                display: "block",
              }}
            />
            {model.imageAttribution && (
              <figcaption style={{ fontSize: "0.7rem", color: theme.muted, marginTop: "0.4rem" }}>
                Photo: {model.imageAttribution} &middot; Google
              </figcaption>
            )}
          </figure>
        )}
      </div>
    </header>
  );
}

function Services({ model, theme }: { model: Extract<SectionRenderModel, { kind: "services" }>; theme: Required<LandingTheme> }) {
  if (model.items.length === 0) return null;
  return (
    <section aria-labelledby="section-services" style={sectionStyle}>
      <h2 id="section-services" style={headingStyle(theme)}>
        {model.heading}
      </h2>
      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: "0.75rem" }}>
        {model.items.map((item, i) => (
          <li
            key={`${item}-${i}`}
            style={{
              padding: "0.85rem 1rem",
              border: `1px solid ${theme.border}`,
              borderRadius: "10px",
              color: theme.text,
            }}
          >
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}

// Browser-restricted, referrer-locked public key — safe to inline (see file
// header). Server-only GOOGLE_PLACES_API_KEY is a DIFFERENT env var, never
// read from apps/web (grep-tested — tests/unit/google-places.test.ts).
const MAPS_EMBED_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY;

function MapNap({
  model,
  theme,
  placeId,
}: {
  model: Extract<SectionRenderModel, { kind: "map_nap" }>;
  theme: Required<LandingTheme>;
  placeId?: string | null;
}) {
  const embedSrc =
    placeId && MAPS_EMBED_KEY
      ? `https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(MAPS_EMBED_KEY)}&q=place_id:${encodeURIComponent(placeId)}`
      : null;

  return (
    <section aria-labelledby="section-business-info" style={sectionStyle}>
      <h2 id="section-business-info" style={headingStyle(theme)}>
        {model.name || "Business information"}
      </h2>
      {embedSrc && (
        <div
          style={{
            marginBottom: "1.25rem",
            borderRadius: "10px",
            overflow: "hidden",
            border: `1px solid ${theme.border}`,
          }}
        >
          <iframe
            src={embedSrc}
            title={`Map showing the location of ${model.name || "this business"}`}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            style={{ width: "100%", height: "280px", border: 0, display: "block" }}
          />
        </div>
      )}
      <address style={{ fontStyle: "normal", color: theme.text, lineHeight: 1.7 }}>
        {model.address && <div>{model.address}</div>}
        {model.phone && (
          <div>
            <a href={`tel:${model.phone.replace(/[^0-9+]/g, "")}`} style={{ color: theme.primary, textDecoration: "none" }}>
              {model.phone}
            </a>
          </div>
        )}
        {model.website && (
          <div>
            {/* Stored URL → allowlisted scheme only (Hermes, #216); else plain text. */}
            {safeHref(model.website) ? (
              <a href={safeHref(model.website)!} style={{ color: theme.primary, textDecoration: "none" }}>
                {model.website.replace(/^https?:\/\//, "")}
              </a>
            ) : (
              <span style={{ color: theme.muted }}>{model.website}</span>
            )}
          </div>
        )}
      </address>
    </section>
  );
}

function Cta({ model, theme }: { model: Extract<SectionRenderModel, { kind: "cta" }>; theme: Required<LandingTheme> }) {
  return (
    <section
      id="contact"
      aria-labelledby="section-cta"
      style={{
        ...sectionStyle,
        maxWidth: "100%",
        textAlign: "center",
        background: `${theme.primary}0d`,
      }}
    >
      <div style={{ maxWidth: "560px", margin: "0 auto" }}>
        {model.heading && (
          <h2 id="section-cta" style={headingStyle(theme)}>
            {model.heading}
          </h2>
        )}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", justifyContent: "center" }}>
          {model.phone && (
            <a
              href={`tel:${model.phone.replace(/[^0-9+]/g, "")}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                minHeight: "44px",
                padding: "0.75rem 1.5rem",
                background: theme.primary,
                color: theme.onPrimary,
                fontWeight: 700,
                textDecoration: "none",
                borderRadius: "10px",
              }}
            >
              Call {model.phone}
            </a>
          )}
          <a
            href="#lead-form"
            style={{
              display: "inline-flex",
              alignItems: "center",
              minHeight: "44px",
              padding: "0.75rem 1.5rem",
              background: "transparent",
              border: `1.5px solid ${theme.primary}`,
              color: theme.primary,
              fontWeight: 700,
              textDecoration: "none",
              borderRadius: "10px",
            }}
          >
            {model.ctaLabel}
          </a>
        </div>
      </div>
    </section>
  );
}

function Proof({ model, theme }: { model: Extract<SectionRenderModel, { kind: "proof" }>; theme: Required<LandingTheme> }) {
  return (
    <section aria-labelledby="section-proof" style={sectionStyle}>
      <h2 id="section-proof" style={headingStyle(theme)}>
        {model.heading}
      </h2>
      {model.empty || model.items.length === 0 ? (
        <p style={{ color: theme.muted }}>{model.note || "Reviews coming soon."}</p>
      ) : (
        <div style={{ display: "grid", gap: "1rem" }}>
          {model.items.map((item, i) => (
            <blockquote
              key={`${item.author}-${i}`}
              style={{
                margin: 0,
                padding: "1rem 1.25rem",
                border: `1px solid ${theme.border}`,
                borderRadius: "10px",
                color: theme.text,
              }}
            >
              {item.rating != null && (
                <p aria-label={`${item.rating} out of 5`} style={{ margin: "0 0 0.35rem 0", color: "#e0a325", letterSpacing: "1px" }}>
                  {"★".repeat(Math.max(0, Math.min(5, Math.round(item.rating))))}
                </p>
              )}
              <p style={{ margin: "0 0 0.5rem 0", lineHeight: 1.6 }}>&ldquo;{item.body}&rdquo;</p>
              <footer style={{ fontSize: "0.85rem", color: theme.muted }}>
                &mdash; {item.author}
                {item.relativeTime && ` · ${item.relativeTime}`}
                {item.source && ` · ${item.source}`}
              </footer>
            </blockquote>
          ))}
        </div>
      )}
    </section>
  );
}

function Faq({ model, theme }: { model: Extract<SectionRenderModel, { kind: "faq" }>; theme: Required<LandingTheme> }) {
  if (model.items.length === 0) return null;
  return (
    <section aria-labelledby="section-faq" style={sectionStyle}>
      <h2 id="section-faq" style={headingStyle(theme)}>
        {model.heading}
      </h2>
      <div style={{ display: "grid", gap: "0.5rem" }}>
        {model.items.map((item, i) => (
          <details
            key={`${item.q}-${i}`}
            style={{ border: `1px solid ${theme.border}`, borderRadius: "10px", padding: "0.75rem 1rem" }}
          >
            <summary style={{ fontWeight: 700, cursor: "pointer", color: theme.text }}>{item.q}</summary>
            <p style={{ margin: "0.5rem 0 0 0", color: theme.muted, lineHeight: 1.6 }}>{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

function Areas({ model, theme }: { model: Extract<SectionRenderModel, { kind: "areas" }>; theme: Required<LandingTheme> }) {
  if (model.items.length === 0) return null;
  return (
    <section aria-labelledby="section-areas" style={sectionStyle}>
      <h2 id="section-areas" style={headingStyle(theme)}>
        {model.heading}
      </h2>
      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
        {model.items.map((item, i) => (
          <li
            key={`${item}-${i}`}
            style={{
              padding: "0.4rem 0.85rem",
              border: `1px solid ${theme.border}`,
              borderRadius: "999px",
              fontSize: "0.9rem",
              color: theme.text,
            }}
          >
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Hours({ model, theme }: { model: Extract<SectionRenderModel, { kind: "hours" }>; theme: Required<LandingTheme> }) {
  if (!model.hours) return null;
  // formatHours() upstream produces a single formatted, human-readable string
  // (may contain line breaks) — render each line as a list item.
  const lines = model.hours.split(/\n|;/).map((l) => l.trim()).filter(Boolean);
  return (
    <section aria-labelledby="section-hours" style={sectionStyle}>
      <h2 id="section-hours" style={headingStyle(theme)}>
        {model.heading}
      </h2>
      <ul style={{ margin: 0, padding: 0, listStyle: "none", color: theme.text, lineHeight: 1.8 }}>
        {(lines.length > 0 ? lines : [model.hours]).map((line, i) => (
          <li key={`${line}-${i}`}>{line}</li>
        ))}
      </ul>
    </section>
  );
}

function Trust({ model, theme }: { model: Extract<SectionRenderModel, { kind: "trust" }>; theme: Required<LandingTheme> }) {
  if (model.themes.length === 0) return null;
  return (
    <section aria-labelledby="section-trust" style={sectionStyle}>
      <h2 id="section-trust" style={headingStyle(theme)}>
        {model.heading}
      </h2>
      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: "0.5rem" }}>
        {model.themes.map((theme_, i) => (
          <li key={`${theme_}-${i}`} style={{ color: theme.text, display: "flex", gap: "0.5rem" }}>
            <span aria-hidden="true" style={{ color: theme.primary, fontWeight: 700 }}>
              &#10003;
            </span>
            {theme_}
          </li>
        ))}
      </ul>
      {model.testimonialCount > 0 && (
        <p style={{ marginTop: "0.75rem", fontSize: "0.85rem", color: theme.muted }}>
          Based on {model.testimonialCount} customer review{model.testimonialCount === 1 ? "" : "s"}.
        </p>
      )}
    </section>
  );
}

function TextBlock({ model, theme }: { model: Extract<SectionRenderModel, { kind: "text" }>; theme: Required<LandingTheme> }) {
  if (!model.body && !model.heading) return null;
  return (
    <section aria-labelledby={model.heading ? "section-text" : undefined} style={sectionStyle}>
      {model.heading && (
        <h2 id="section-text" style={headingStyle(theme)}>
          {model.heading}
        </h2>
      )}
      {model.body
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map((paragraph, i) => (
          <p key={i} style={{ color: theme.text, lineHeight: 1.7, margin: "0 0 0.75rem 0" }}>
            {paragraph}
          </p>
        ))}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

function Gallery({ model, theme }: { model: Extract<SectionRenderModel, { kind: "gallery" }>; theme: Required<LandingTheme> }) {
  if (model.items.length === 0) return null;
  return (
    <section aria-labelledby="section-gallery" style={sectionStyle}>
      <h2 id="section-gallery" style={headingStyle(theme)}>
        {model.heading}
      </h2>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
          gap: "0.75rem",
        }}
      >
        {model.items.map((p, i) => (
          <figure key={i} style={{ margin: 0 }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- proxied Google photo, dynamic host */}
            <img
              src={p.src}
              alt={p.alt}
              loading="lazy"
              style={{
                width: "100%",
                aspectRatio: "4 / 3",
                objectFit: "cover",
                borderRadius: "12px",
                border: `1px solid ${theme.border}`,
                display: "block",
              }}
            />
            {p.attribution && (
              <figcaption style={{ fontSize: "0.65rem", color: theme.muted, marginTop: "0.2rem" }}>
                {p.attribution}
              </figcaption>
            )}
          </figure>
        ))}
      </div>
      <p style={{ fontSize: "0.7rem", color: theme.muted, marginTop: "0.6rem" }}>Photos from Google</p>
    </section>
  );
}

export interface SectionRendererProps {
  sections: unknown;
  siteSlug: string;
  theme?: unknown;
  /** Google Place ID (#208 PR-9) — when present + the embed key is
   *  configured, map_nap renders a real embedded map above the address. */
  placeId?: string | null;
}

export function SectionRenderer({ sections, siteSlug, theme, placeId }: SectionRendererProps) {
  const resolvedTheme = resolveTheme(theme);
  const models = mapSectionsToRenderModels(sections);

  return (
    // Body font from the template — inherited by every section (which set only
    // weight/size, not family), so the whole site picks up the template's voice.
    <div style={{ fontFamily: resolvedTheme.bodyFont }}>
      {models.map((model, i) => {
        switch (model.kind) {
          case "hero":
            return <Hero key={i} model={model} theme={resolvedTheme} />;
          case "gallery":
            return <Gallery key={i} model={model} theme={resolvedTheme} />;
          case "services":
            return <Services key={i} model={model} theme={resolvedTheme} />;
          case "map_nap":
            return <MapNap key={i} model={model} theme={resolvedTheme} placeId={placeId} />;
          case "cta":
            return <Cta key={i} model={model} theme={resolvedTheme} />;
          case "proof":
            return <Proof key={i} model={model} theme={resolvedTheme} />;
          case "faq":
            return <Faq key={i} model={model} theme={resolvedTheme} />;
          case "areas":
            return <Areas key={i} model={model} theme={resolvedTheme} />;
          case "hours":
            return <Hours key={i} model={model} theme={resolvedTheme} />;
          case "trust":
            return <Trust key={i} model={model} theme={resolvedTheme} />;
          case "links":
            return (
              <NavLinksSection key={i} model={model} siteSlug={siteSlug} theme={resolvedTheme} />
            );
          case "text":
            return <TextBlock key={i} model={model} theme={resolvedTheme} />;
          /* istanbul ignore next -- exhaustiveness guard */
          default:
            return null;
        }
      })}
    </div>
  );
}

// Internal-links nav block (LandingSectionType "text" with role:"internal_links")
// — resolves each link relative to the CURRENT site (siteSlug).
function NavLinksSection({
  model,
  siteSlug,
  theme,
}: {
  model: Extract<SectionRenderModel, { kind: "links" }>;
  siteSlug: string;
  theme: Required<LandingTheme>;
}) {
  if (model.links.length === 0) return null;
  return (
    <nav aria-label={model.heading} style={sectionStyle}>
      <h2 style={headingStyle(theme)}>{model.heading}</h2>
      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
        {model.links.map((link) => (
          <li key={link.slug}>
            <a
              href={link.slug ? `/l/${siteSlug}/${link.slug}` : `/l/${siteSlug}`}
              style={{ color: theme.primary, textDecoration: "underline" }}
            >
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
