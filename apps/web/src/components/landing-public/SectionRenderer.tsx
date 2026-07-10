/**
 * SectionRenderer — semantic, accessible, mobile-first HTML for every Ozvor
 * Pages section type (issue #208, PR-6).
 *
 * Renders ONLY the stored `sections` content via section-render-model.ts's
 * pure mapper — no fabricated content, no invented stats/reviews (audit
 * integrity rule, postmortem PR#90). Unknown section types are skipped
 * silently (mapSectionToRenderModel returns null for them).
 *
 * No Google Maps embed/API anywhere — map_nap renders as plain address text.
 */

import type { CSSProperties } from "react";
import {
  mapSectionsToRenderModels,
  type SectionRenderModel,
} from "./section-render-model";

// ---------------------------------------------------------------------------
// Theme — a small neutral palette, overridable from landing_sites.theme.
// ---------------------------------------------------------------------------

export interface LandingTheme {
  primary?: string;
  text?: string;
  muted?: string;
  surface?: string;
  border?: string;
}

const DEFAULT_THEME: Required<LandingTheme> = {
  primary: "#0c7d54",
  text: "#17211c",
  muted: "#5c6e65",
  surface: "#ffffff",
  border: "#d5dfd9",
};

function resolveTheme(theme: unknown): Required<LandingTheme> {
  if (!theme || typeof theme !== "object") return DEFAULT_THEME;
  const t = theme as Record<string, unknown>;
  return {
    primary: typeof t.primary === "string" && t.primary ? t.primary : DEFAULT_THEME.primary,
    text: typeof t.text === "string" && t.text ? t.text : DEFAULT_THEME.text,
    muted: typeof t.muted === "string" && t.muted ? t.muted : DEFAULT_THEME.muted,
    surface: typeof t.surface === "string" && t.surface ? t.surface : DEFAULT_THEME.surface,
    border: typeof t.border === "string" && t.border ? t.border : DEFAULT_THEME.border,
  };
}

// ---------------------------------------------------------------------------
// Shared styles
// ---------------------------------------------------------------------------

const sectionStyle: CSSProperties = {
  maxWidth: "820px",
  margin: "0 auto",
  padding: "2.5rem 1.25rem",
};

function headingStyle(color: string): CSSProperties {
  return {
    fontSize: "clamp(1.375rem, 3.5vw, 2rem)",
    fontWeight: 800,
    letterSpacing: "-0.02em",
    margin: "0 0 1rem 0",
    color,
  };
}

// ---------------------------------------------------------------------------
// Per-section renderers
// ---------------------------------------------------------------------------

function Hero({ model, theme }: { model: Extract<SectionRenderModel, { kind: "hero" }>; theme: Required<LandingTheme> }) {
  return (
    <header
      style={{
        ...sectionStyle,
        maxWidth: "100%",
        padding: "3.5rem 1.25rem",
        background: `linear-gradient(180deg, ${theme.surface} 0%, ${theme.border}22 100%)`,
        textAlign: "center",
      }}
    >
      <h1 style={{ ...headingStyle(theme.text), fontSize: "clamp(1.75rem, 5vw, 2.75rem)" }}>
        {model.headline || model.businessName}
      </h1>
      {model.subheadline && (
        <p style={{ fontSize: "1.05rem", color: theme.muted, maxWidth: "560px", margin: "0 auto 1.5rem" }}>
          {model.subheadline}
        </p>
      )}
      <a
        href="#contact"
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "44px",
          padding: "0.75rem 1.5rem",
          background: theme.primary,
          color: "#ffffff",
          fontWeight: 700,
          textDecoration: "none",
          borderRadius: "10px",
        }}
      >
        {model.ctaLabel}
      </a>
    </header>
  );
}

function Services({ model, theme }: { model: Extract<SectionRenderModel, { kind: "services" }>; theme: Required<LandingTheme> }) {
  if (model.items.length === 0) return null;
  return (
    <section aria-labelledby="section-services" style={sectionStyle}>
      <h2 id="section-services" style={headingStyle(theme.text)}>
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

/** No Google Maps embed/API — plain, semantic address text only. */
function MapNap({ model, theme }: { model: Extract<SectionRenderModel, { kind: "map_nap" }>; theme: Required<LandingTheme> }) {
  return (
    <section aria-labelledby="section-business-info" style={sectionStyle}>
      <h2 id="section-business-info" style={headingStyle(theme.text)}>
        {model.name || "Business information"}
      </h2>
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
            <a href={model.website} style={{ color: theme.primary, textDecoration: "none" }}>
              {model.website.replace(/^https?:\/\//, "")}
            </a>
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
          <h2 id="section-cta" style={headingStyle(theme.text)}>
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
                color: "#ffffff",
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
      <h2 id="section-proof" style={headingStyle(theme.text)}>
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
              <p style={{ margin: "0 0 0.5rem 0", lineHeight: 1.6 }}>&ldquo;{item.body}&rdquo;</p>
              <footer style={{ fontSize: "0.85rem", color: theme.muted }}>
                &mdash; {item.author}
                {item.rating != null && ` · ${item.rating}/5`}
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
      <h2 id="section-faq" style={headingStyle(theme.text)}>
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
      <h2 id="section-areas" style={headingStyle(theme.text)}>
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
      <h2 id="section-hours" style={headingStyle(theme.text)}>
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
      <h2 id="section-trust" style={headingStyle(theme.text)}>
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
        <h2 id="section-text" style={headingStyle(theme.text)}>
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

export interface SectionRendererProps {
  sections: unknown;
  siteSlug: string;
  theme?: unknown;
}

export function SectionRenderer({ sections, siteSlug, theme }: SectionRendererProps) {
  const resolvedTheme = resolveTheme(theme);
  const models = mapSectionsToRenderModels(sections);

  return (
    <>
      {models.map((model, i) => {
        switch (model.kind) {
          case "hero":
            return <Hero key={i} model={model} theme={resolvedTheme} />;
          case "services":
            return <Services key={i} model={model} theme={resolvedTheme} />;
          case "map_nap":
            return <MapNap key={i} model={model} theme={resolvedTheme} />;
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
    </>
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
      <h2 style={headingStyle(theme.text)}>{model.heading}</h2>
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
