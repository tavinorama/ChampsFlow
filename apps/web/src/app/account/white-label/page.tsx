"use client";

/**
 * /account/white-label — Agency white-label settings
 *
 * Agency plan only. Allows the agency to configure:
 *  - Agency display name (shown on shared reports)
 *  - Accent color (hex; validated before use to prevent CSS injection)
 *  - Logo URL (https:// only)
 *
 * Non-agency users see an upsell card.
 *
 * Accessibility: labelled inputs, aria-live for async status, 44px tap targets.
 */

import { useState, useEffect, useId } from "react";
import { apiFetch } from "../../../lib/supabase-browser";

const HEX_REGEX = /^#[0-9a-fA-F]{3,8}$/;
const HTTPS_REGEX = /^https:\/\/.+/;

interface WhiteLabelSettings {
  agency_name?: string | null;
  accent_hex?: string | null;
  logo_url?: string | null;
}

type SaveState = "idle" | "saving" | "saved" | "error";

export default function WhiteLabelPage() {
  const [planChecked, setPlanChecked] = useState(false);
  const [isAgency, setIsAgency] = useState(false);
  const [loading, setLoading] = useState(true);

  const [agencyName, setAgencyName] = useState("");
  const [accentHex, setAccentHex] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const agencyNameId = useId();
  const accentHexId = useId();
  const logoUrlId = useId();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const planRes = await apiFetch("/api/billing/plan");
        const planData = planRes.ok ? await planRes.json() as { plan?: string } : null;
        const agency = planData?.plan === "agency";

        if (cancelled) return;
        setIsAgency(agency);
        setPlanChecked(true);

        if (!agency) {
          setLoading(false);
          return;
        }

        const settingsRes = await apiFetch("/api/agency/white-label");
        if (settingsRes.ok && !cancelled) {
          const data = await settingsRes.json() as WhiteLabelSettings;
          setAgencyName(data.agency_name ?? "");
          setAccentHex(data.accent_hex ?? "");
          setLogoUrl(data.logo_url ?? "");
        }
      } catch {
        /* non-fatal — form starts empty */
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);

    // Validate accent color if provided
    if (accentHex && !HEX_REGEX.test(accentHex)) {
      setErrorMessage("Accent color must be a valid hex code (e.g. #0A7E5A).");
      return;
    }

    // Validate logo URL if provided
    if (logoUrl && !HTTPS_REGEX.test(logoUrl)) {
      setErrorMessage("Logo URL must start with https://");
      return;
    }

    setSaveState("saving");
    try {
      const res = await apiFetch("/api/agency/white-label", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agency_name: agencyName.trim() || null,
          accent_hex: accentHex.trim() || null,
          logo_url: logoUrl.trim() || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { message?: string };
        setErrorMessage(data.message ?? "Could not save settings. Please try again.");
        setSaveState("error");
        return;
      }
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2500);
    } catch {
      setErrorMessage("Could not save settings. Check your connection.");
      setSaveState("error");
    }
  }

  const accentPreviewValid = HEX_REGEX.test(accentHex);

  if (!planChecked || loading) {
    return (
      <main
        style={{
          maxWidth: "600px",
          margin: "0 auto",
          padding: "var(--space-8) var(--space-4) calc(var(--bottom-nav-height) + var(--space-12))",
          fontFamily: "var(--font-family)",
          color: "var(--color-text)",
        }}
      >
        <p aria-live="polite" style={{ color: "var(--color-muted)" }}>
          Loading…
        </p>
      </main>
    );
  }

  if (!isAgency) {
    return (
      <main
        style={{
          maxWidth: "600px",
          margin: "0 auto",
          padding: "var(--space-8) var(--space-4) calc(var(--bottom-nav-height) + var(--space-12))",
          fontFamily: "var(--font-family)",
          color: "var(--color-text)",
        }}
      >
        <h1
          style={{
            fontSize: "var(--font-size-h1)",
            fontWeight: 800,
            letterSpacing: "-0.02em",
            margin: "0 0 var(--space-6) 0",
          }}
        >
          White-label settings
        </h1>
        <div
          style={{
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-lg)",
            padding: "var(--space-8)",
            boxShadow: "var(--shadow-card)",
          }}
        >
          <h2 style={{ fontSize: "var(--font-size-h3)", fontWeight: 700, margin: "0 0 var(--space-3) 0" }}>
            Agency plan required
          </h2>
          <p style={{ color: "var(--color-muted)", fontSize: "var(--font-size-body)", margin: "0 0 var(--space-6) 0", lineHeight: 1.6 }}>
            White-label settings are an Agency plan feature. Upgrade to apply your agency&rsquo;s
            name, logo, and accent color to all shared client reports.
          </p>
          <a
            href="/account"
            style={{
              display: "inline-flex",
              alignItems: "center",
              height: "var(--min-button-height)",
              padding: "0 var(--space-6)",
              backgroundColor: "var(--color-primary)",
              color: "#fff",
              borderRadius: "var(--radius-md)",
              fontSize: "var(--font-size-body)",
              fontWeight: 600,
              fontFamily: "var(--font-family)",
              textDecoration: "none",
            }}
          >
            Upgrade to Agency
          </a>
        </div>
      </main>
    );
  }

  return (
    <main
      style={{
        maxWidth: "600px",
        margin: "0 auto",
        padding: "var(--space-8) var(--space-4) calc(var(--bottom-nav-height) + var(--space-12))",
        fontFamily: "var(--font-family)",
        color: "var(--color-text)",
      }}
    >
      <a
        href="/account"
        style={{
          display: "inline-block",
          marginBottom: "var(--space-4)",
          color: "var(--color-primary)",
          textDecoration: "none",
          fontSize: "var(--font-size-body-sm)",
          fontWeight: 600,
        }}
      >
        ← Account
      </a>

      <h1
        style={{
          fontSize: "var(--font-size-h1)",
          fontWeight: 800,
          letterSpacing: "-0.02em",
          margin: "0 0 var(--space-2) 0",
        }}
      >
        White-label settings
      </h1>
      <p style={{ color: "var(--color-muted)", fontSize: "var(--font-size-body-sm)", margin: "0 0 var(--space-8) 0" }}>
        These settings appear on all shared client reports.
      </p>

      {(saveState === "error" || errorMessage) && (
        <div
          role="alert"
          aria-live="assertive"
          style={{
            padding: "var(--space-3) var(--space-4)",
            backgroundColor: "var(--color-error-bg, rgba(239,68,68,0.08))",
            border: "1px solid var(--color-error)",
            borderRadius: "var(--radius-md)",
            color: "var(--color-error)",
            fontSize: "var(--font-size-body-sm)",
            marginBottom: "var(--space-6)",
          }}
        >
          {errorMessage ?? "Could not save settings. Please try again."}
        </div>
      )}

      <form
        onSubmit={(e) => void handleSubmit(e)}
        aria-label="White-label settings"
        style={{
          backgroundColor: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-lg)",
          padding: "var(--space-6)",
          boxShadow: "var(--shadow-card)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-5)",
        }}
      >
        {/* Agency name */}
        <div>
          <label
            htmlFor={agencyNameId}
            style={{ display: "block", fontSize: "var(--font-size-h4)", fontWeight: 600, marginBottom: "var(--space-2)" }}
          >
            Agency name
            <span style={{ color: "var(--color-muted)", fontWeight: 400, fontSize: "var(--font-size-caption)", marginLeft: "var(--space-2)" }}>
              (shown as "Prepared by …" on reports)
            </span>
          </label>
          <input
            id={agencyNameId}
            type="text"
            value={agencyName}
            onChange={(e) => setAgencyName(e.target.value)}
            maxLength={100}
            placeholder="Acme Digital Agency"
            style={inputStyle}
          />
        </div>

        {/* Accent color */}
        <div>
          <label
            htmlFor={accentHexId}
            style={{ display: "block", fontSize: "var(--font-size-h4)", fontWeight: 600, marginBottom: "var(--space-2)" }}
          >
            Accent color
            <span style={{ color: "var(--color-muted)", fontWeight: 400, fontSize: "var(--font-size-caption)", marginLeft: "var(--space-2)" }}>
              (hex, e.g. #0A7E5A)
            </span>
          </label>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
            <input
              id={accentHexId}
              type="text"
              value={accentHex}
              onChange={(e) => setAccentHex(e.target.value)}
              placeholder="#0A7E5A"
              style={{ ...inputStyle, flex: 1 }}
            />
            <div
              aria-label={accentPreviewValid ? `Color preview: ${accentHex}` : "Enter a valid hex color"}
              title={accentPreviewValid ? accentHex : "Enter a valid hex color"}
              style={{
                width: "28px",
                height: "28px",
                borderRadius: "var(--radius-md)",
                flexShrink: 0,
                backgroundColor: accentPreviewValid ? accentHex : "transparent",
                border: accentPreviewValid ? "none" : "2px dashed var(--color-border)",
              }}
            />
          </div>
        </div>

        {/* Logo URL */}
        <div>
          <label
            htmlFor={logoUrlId}
            style={{ display: "block", fontSize: "var(--font-size-h4)", fontWeight: 600, marginBottom: "var(--space-2)" }}
          >
            Logo URL
            <span style={{ color: "var(--color-muted)", fontWeight: 400, fontSize: "var(--font-size-caption)", marginLeft: "var(--space-2)" }}>
              (https:// only)
            </span>
          </label>
          <input
            id={logoUrlId}
            type="url"
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
            placeholder="https://example.com/logo.png"
            style={inputStyle}
          />
        </div>

        {/* Submit */}
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-4)", paddingTop: "var(--space-2)" }}>
          <button
            type="submit"
            disabled={saveState === "saving"}
            style={{
              height: "var(--min-button-height)",
              padding: "0 var(--space-8)",
              backgroundColor: saveState === "saving" ? "var(--color-muted)" : "var(--color-primary)",
              color: "#fff",
              border: "none",
              borderRadius: "var(--radius-md)",
              fontSize: "var(--font-size-body)",
              fontWeight: 600,
              fontFamily: "var(--font-family)",
              cursor: saveState === "saving" ? "not-allowed" : "pointer",
              opacity: saveState === "saving" ? 0.7 : 1,
            }}
          >
            {saveState === "saving" ? "Saving…" : "Save settings"}
          </button>
          {saveState === "saved" && (
            <span
              role="status"
              aria-live="polite"
              style={{ color: "var(--color-success)", fontSize: "var(--font-size-body-sm)", fontWeight: 600 }}
            >
              Saved!
            </span>
          )}
        </div>
      </form>
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  height: "48px",
  padding: "0 var(--space-4)",
  fontSize: "var(--font-size-body)",
  fontFamily: "var(--font-family)",
  color: "var(--color-text)",
  backgroundColor: "var(--color-surface-muted)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-md)",
  outline: "none",
};
