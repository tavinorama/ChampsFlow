"use client";

/**
 * PromptsPanel — manages the prompt library for a brand.
 *
 * Displays read-only standard prompts and editable custom prompts.
 * Allows adding (POST) and removing (DELETE) custom prompts with
 * optimistic UI, inline error handling, and full keyboard/ARIA support.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { apiFetch } from "../../../lib/supabase-browser";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DefaultPrompt {
  text: string;
  is_custom: false;
}

interface CustomPrompt {
  id: string;
  text: string;
  sort_order: number;
  is_custom: true;
  created_at: string;
}

interface PromptsData {
  defaults: DefaultPrompt[];
  custom: CustomPrompt[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_CUSTOM = 10;
const MAX_CHARS = 200;

// ---------------------------------------------------------------------------
// Shared styles (token-only — mirrors page.tsx conventions exactly)
// ---------------------------------------------------------------------------

const sectionStyle: React.CSSProperties = {
  marginTop: "var(--space-8)",
  backgroundColor: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-lg)",
  padding: "var(--space-6)",
  boxShadow: "var(--shadow-card)",
};

const listStyle: React.CSSProperties = {
  listStyle: "none",
  padding: 0,
  margin: "0 0 var(--space-4) 0",
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-2)",
};

const listItemStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "var(--space-3)",
  padding: "var(--space-3) var(--space-4)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-md)",
  backgroundColor: "var(--color-surface-muted)",
};

function badgeStyle(variant: "standard" | "custom"): React.CSSProperties {
  const base: React.CSSProperties = {
    display: "inline-block",
    flexShrink: 0,
    fontSize: "var(--font-size-badge)",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    padding: "2px 6px",
    borderRadius: "var(--radius-sm)",
    whiteSpace: "nowrap",
  };
  if (variant === "standard") {
    return {
      ...base,
      backgroundColor: "var(--color-badge-connected-bg)",
      color: "var(--color-badge-connected-text)",
    };
  }
  return {
    ...base,
    backgroundColor: "var(--color-badge-ai-bg)",
    color: "var(--color-badge-ai-text)",
  };
}

// ---------------------------------------------------------------------------
// PromptsPanel
// ---------------------------------------------------------------------------

export function PromptsPanel({ brandId }: { brandId: string }) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [defaults, setDefaults] = useState<DefaultPrompt[]>([]);
  const [custom, setCustom] = useState<CustomPrompt[]>([]);
  const [inputText, setInputText] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  // Visually-hidden live region for screen reader announcements
  const liveRef = useRef<HTMLParagraphElement | null>(null);

  const loadPrompts = useCallback(async () => {
    if (!brandId) return;
    try {
      const res = await apiFetch(`/api/brands/${brandId}/prompts`);
      if (!res.ok) {
        setStatus("error");
        return;
      }
      const data: PromptsData = await res.json();
      setDefaults(data.defaults ?? []);
      setCustom(data.custom ?? []);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [brandId]);

  useEffect(() => {
    void loadPrompts();
  }, [loadPrompts]);

  async function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = inputText.trim();
    if (!trimmed || adding) return;

    setAdding(true);
    setAddError(null);

    try {
      const res = await apiFetch(`/api/brands/${brandId}/prompts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed }),
      });

      if (res.status === 422) {
        const body = (await res.json()) as { error: string };
        if (body.error === "PROMPT_TOO_LONG") {
          setAddError("Prompt must be 200 characters or fewer.");
        } else if (body.error === "PROMPT_LIMIT_REACHED") {
          setAddError("You've reached the 10-prompt limit.");
        } else {
          setAddError("Could not add prompt. Please try again.");
        }
        return;
      }

      if (!res.ok) {
        setAddError("Could not add prompt. Please try again.");
        return;
      }

      const created: CustomPrompt = await res.json();
      setCustom((prev) => [...prev, created]);
      setInputText("");
      if (liveRef.current) liveRef.current.textContent = "Prompt added.";
    } catch {
      setAddError("Could not add prompt. Please try again.");
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(prompt: CustomPrompt) {
    if (removingId) return;
    // Optimistic remove
    setRemovingId(prompt.id);
    setCustom((prev) => prev.filter((p) => p.id !== prompt.id));

    try {
      const res = await apiFetch(
        `/api/brands/${brandId}/prompts/${prompt.id}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        // Restore on failure — re-insert keeping sort_order
        setCustom((prev) =>
          [...prev, prompt].sort((a, b) => a.sort_order - b.sort_order)
        );
        if (liveRef.current) liveRef.current.textContent = "Could not remove prompt. Please try again.";
      } else {
        if (liveRef.current) liveRef.current.textContent = "Prompt removed.";
      }
    } catch {
      // Restore on network error
      setCustom((prev) =>
        [...prev, prompt].sort((a, b) => a.sort_order - b.sort_order)
      );
      if (liveRef.current) liveRef.current.textContent = "Could not remove prompt. Please try again.";
    } finally {
      setRemovingId(null);
    }
  }

  const customCount = custom.length;
  const atLimit = customCount >= MAX_CUSTOM;
  const overCharLimit = inputText.length > MAX_CHARS;
  const addDisabled = adding || !inputText.trim() || overCharLimit || atLimit;

  return (
    <section style={sectionStyle} aria-labelledby="prompts-heading">
      {/* Visually-hidden live region for screen reader announcements */}
      <p
        ref={liveRef}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        style={{
          position: "absolute",
          width: "1px",
          height: "1px",
          padding: 0,
          margin: "-1px",
          overflow: "hidden",
          clip: "rect(0,0,0,0)",
          whiteSpace: "nowrap",
          border: 0,
        }}
      />

      <h2 id="prompts-heading" style={{ fontSize: "var(--font-size-h2)", fontWeight: 800, margin: "0 0 var(--space-2) 0" }}>
        Audit Prompts
      </h2>
      <p style={{ fontSize: "var(--font-size-body-sm)", color: "var(--color-muted)", lineHeight: 1.6, margin: "0 0 var(--space-4) 0" }}>
        These queries are sent to AI engines on every audit.{" "}
        <strong>Standard prompts</strong> are included automatically.{" "}
        Add your own to focus audits on the questions your buyers actually ask.
      </p>

      {/* Load error — non-blocking */}
      {status === "error" && (
        <p
          role="alert"
          style={{
            fontSize: "var(--font-size-caption)",
            color: "var(--color-error)",
            marginBottom: "var(--space-4)",
          }}
        >
          Could not load prompts. Refresh the page to try again.
        </p>
      )}

      {/* Loading state */}
      {status === "loading" && (
        <p
          style={{
            fontSize: "var(--font-size-caption)",
            color: "var(--color-muted)",
            marginBottom: "var(--space-4)",
          }}
        >
          Loading prompts&hellip;
        </p>
      )}

      {status === "ready" && (
        <>
          {/* Standard prompts */}
          {defaults.length > 0 && (
            <div style={{ marginBottom: "var(--space-5)" }}>
              <h3
                style={{
                  fontSize: "var(--font-size-body-sm)",
                  fontWeight: 700,
                  color: "var(--color-text)",
                  margin: "0 0 var(--space-2) 0",
                }}
              >
                Standard prompts
              </h3>
              <ul role="list" aria-label="Standard prompts" style={listStyle}>
                {defaults.map((p, idx) => (
                  <li key={idx} role="listitem" style={listItemStyle}>
                    <span
                      style={{
                        fontSize: "var(--font-size-body-sm)",
                        color: "var(--color-text)",
                        lineHeight: 1.5,
                        flex: 1,
                      }}
                    >
                      {p.text}
                    </span>
                    <span style={badgeStyle("standard")}>Standard</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Custom prompts header + counter */}
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "var(--space-2)",
              marginBottom: "var(--space-2)",
            }}
          >
            <h3
              style={{
                fontSize: "var(--font-size-body-sm)",
                fontWeight: 700,
                color: "var(--color-text)",
                margin: 0,
              }}
            >
              Custom prompts
            </h3>
            <span
              aria-live="polite"
              aria-atomic="true"
              style={{
                fontSize: "var(--font-size-caption)",
                color: atLimit ? "var(--color-error)" : "var(--color-muted)",
                fontWeight: atLimit ? 700 : 400,
              }}
            >
              ({customCount} custom / {MAX_CUSTOM} max)
            </span>
          </div>

          {/* Custom prompts list or empty state */}
          {customCount === 0 ? (
            <p
              style={{
                fontSize: "var(--font-size-caption)",
                color: "var(--color-muted)",
                lineHeight: 1.6,
                marginBottom: "var(--space-4)",
                padding: "var(--space-4)",
                border: "1px dashed var(--color-border)",
                borderRadius: "var(--radius-md)",
              }}
            >
              No custom prompts yet. Add your own queries to include in future audits.
            </p>
          ) : (
            <ul
              role="list"
              aria-label="Custom prompts"
              style={{ ...listStyle, marginBottom: "var(--space-4)" }}
            >
              {custom.map((p) => (
                <li
                  key={p.id}
                  role="listitem"
                  style={{
                    ...listItemStyle,
                    opacity: removingId === p.id ? 0.4 : 1,
                    transition: "opacity 0.15s ease",
                  }}
                >
                  <span
                    style={{
                      fontSize: "var(--font-size-body-sm)",
                      color: "var(--color-text)",
                      lineHeight: 1.5,
                      flex: 1,
                    }}
                  >
                    {p.text}
                  </span>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "var(--space-2)",
                      flexShrink: 0,
                    }}
                  >
                    <span style={badgeStyle("custom")}>Custom</span>
                    <button
                      type="button"
                      aria-label={`Remove prompt: ${p.text}`}
                      disabled={removingId !== null}
                      onClick={() => void handleRemove(p)}
                      style={{
                        border: "none",
                        background: "none",
                        cursor: removingId !== null ? "not-allowed" : "pointer",
                        color: "var(--color-muted)",
                        fontWeight: 700,
                        fontSize: "1rem",
                        lineHeight: 1,
                        padding: "var(--space-1)",
                        minWidth: "var(--space-6)",
                        minHeight: "var(--space-6)",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: "var(--radius-sm)",
                      }}
                    >
                      &times;
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}

          {/* Add prompt form */}
          <form
            onSubmit={(e) => void handleAdd(e)}
            aria-label="Add a custom prompt"
            style={{
              display: "flex",
              gap: "var(--space-2)",
              flexWrap: "wrap",
              alignItems: "flex-start",
            }}
          >
            <div style={{ flex: "1 1 240px", minWidth: 0 }}>
              <label
                htmlFor="new-prompt-input"
                style={{
                  display: "block",
                  fontSize: "var(--font-size-caption)",
                  fontWeight: 700,
                  color: "var(--color-text)",
                  marginBottom: "var(--space-1)",
                }}
              >
                New prompt
              </label>
              <input
                id="new-prompt-input"
                type="text"
                value={inputText}
                onChange={(e) => {
                  setInputText(e.target.value);
                  if (addError) setAddError(null);
                }}
                placeholder="e.g. What is the best tool for monitoring AI visibility?"
                maxLength={MAX_CHARS + 1}
                aria-describedby={addError ? "prompt-add-error" : undefined}
                aria-invalid={addError != null ? true : undefined}
                disabled={adding || atLimit}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  height: "40px",
                  padding: "0 var(--space-3)",
                  border: addError
                    ? "1px solid var(--color-error)"
                    : "1px solid var(--color-border)",
                  borderRadius: "var(--radius-md)",
                  backgroundColor: "var(--color-surface-muted)",
                  color: "var(--color-text)",
                  fontSize: "var(--font-size-body-sm)",
                  opacity: atLimit ? 0.5 : 1,
                }}
              />
              {/* Character counter */}
              <p
                style={{
                  margin: "var(--space-1) 0 0 0",
                  fontSize: "var(--font-size-caption)",
                  color: overCharLimit ? "var(--color-error)" : "var(--color-muted)",
                  textAlign: "right",
                }}
              >
                {inputText.length}/{MAX_CHARS}
              </p>
            </div>

            {/* Button top-aligns with the input (accounts for the label line height) */}
            <div
              style={{
                paddingTop: "calc(var(--font-size-caption) + var(--space-2))",
              }}
            >
              <button
                type="submit"
                disabled={addDisabled}
                aria-busy={adding}
                style={{
                  height: "40px",
                  padding: "0 var(--space-4)",
                  backgroundColor: "var(--color-primary)",
                  color: "var(--color-text-inverse, #fff)",
                  border: "none",
                  borderRadius: "var(--radius-md)",
                  fontWeight: 700,
                  fontSize: "var(--font-size-body-sm)",
                  cursor: addDisabled ? "not-allowed" : "pointer",
                  opacity: addDisabled ? 0.6 : 1,
                  whiteSpace: "nowrap",
                }}
              >
                {adding ? "Adding…" : "Add"}
              </button>
            </div>
          </form>

          {/* Inline add error */}
          {addError && (
            <p
              id="prompt-add-error"
              role="alert"
              style={{
                margin: "var(--space-2) 0 0 0",
                fontSize: "var(--font-size-caption)",
                color: "var(--color-error)",
                fontWeight: 600,
              }}
            >
              {addError}
            </p>
          )}
        </>
      )}
    </section>
  );
}
