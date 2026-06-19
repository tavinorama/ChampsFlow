"use client";

/**
 * Screen 01 — /create (C1 Topic Input)
 *
 * docs/04-ux.md §4 Screen 01 wireframe:
 *  - Platform selector: LinkedIn | Instagram (segmented control, 44px tap targets)
 *  - Topic textarea: min 10 chars, character counter (0/500 per wireframe, 4000 per backend)
 *  - Generate button: primary, full-width, 48px
 *  - Loading state: skeleton + aria-live announcement during LLM call
 *  - Error state: toast message, retry preserves topic input
 *  - Brand voice coming in v1.1 note (caption muted)
 *
 * Keyboard navigation (docs/04-ux.md §8 focus order):
 *  1. Platform selector radio group (Tab + arrow keys)
 *  2. Topic textarea (Tab; Enter adds newline)
 *  3. Generate button (Tab; Enter submits)
 *  4. [Loading: focus moves to draft card heading via programmatic focus on load]
 *
 * Accessibility: WCAG 2.2 AA. All inputs have associated visible labels.
 * No placeholder-only labeling. Error messages linked via aria-describedby.
 */

import { useState, useRef, useId } from "react";
import { useRouter } from "next/navigation";
import { BottomNav } from "../../components/BottomNav";

const MAX_TOPIC_LENGTH = 4000; // backend cap (S-5/CC-3)
const MIN_TOPIC_LENGTH = 10;   // PRD AC: minimum 10 chars

type Platform = "linkedin" | "instagram";

interface GenerateError {
  message: string;
  retryable: boolean;
}

export default function CreatePage() {
  const [platform, setPlatform] = useState<Platform>("linkedin");
  const [topic, setTopic] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<GenerateError | null>(null);

  const router = useRouter();
  const topicId = useId();
  const errorId = useId();
  const loadingRegionId = useId();

  const topicRef = useRef<HTMLTextAreaElement>(null);
  const generateBtnRef = useRef<HTMLButtonElement>(null);

  const isTopicValid = topic.trim().length >= MIN_TOPIC_LENGTH;
  const charsUsed = topic.length;

  async function handleGenerate() {
    if (!isTopicValid || isGenerating) return;

    setIsGenerating(true);
    setError(null);

    try {
      const res = await fetch("/api/drafts/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: topic.trim(), platform }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const retryable = res.status === 503 || res.status === 429;
        setError({
          message:
            res.status === 429
              ? "Too many requests. Please wait a moment and try again."
              : res.status === 400
              ? data.error ?? "Invalid input. Please check your topic and try again."
              : "Post generation failed. Please try again.",
          retryable,
        });
        return;
      }

      const data = await res.json();
      const draftId = data.draft_id;

      if (!draftId) {
        setError({
          message: "Unexpected response. Please try again.",
          retryable: true,
        });
        return;
      }

      // Navigate to draft review screen (Screen 02)
      router.push(`/drafts/${draftId}`);
    } catch {
      setError({
        message: "Post generation failed. Please check your connection and try again.",
        retryable: true,
      });
    } finally {
      setIsGenerating(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Tab from textarea moves to generate button
    // Enter in textarea adds newline (default behavior preserved)
    if (e.key === "Tab" && !e.shiftKey) {
      // Let natural tab order handle this
    }
  }

  return (
    <div
      style={{
        minHeight: "100dvh",
        backgroundColor: "var(--color-surface-muted)",
        fontFamily: "var(--font-family)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header */}
      <header
        style={{
          height: "48px",
          display: "flex",
          alignItems: "center",
          paddingInline: "var(--margin-page-mobile)",
          backgroundColor: "var(--color-surface)",
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        <a
          href="/dashboard"
          aria-label="Back to dashboard"
          style={{
            color: "var(--color-primary)",
            fontSize: "var(--font-size-body)",
            textDecoration: "none",
            display: "flex",
            alignItems: "center",
            gap: "4px",
            minHeight: "var(--min-tap-target)",
            minWidth: "var(--min-tap-target)",
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Back
        </a>
        <h1
          style={{
            flex: 1,
            textAlign: "center",
            fontSize: "var(--font-size-h3)",
            fontWeight: "var(--font-weight-semibold)",
            color: "var(--color-text)",
            margin: 0,
          }}
        >
          Create Post
        </h1>
        {/* Spacer to balance back button */}
        <div style={{ width: "48px" }} aria-hidden="true" />
      </header>

      {/* Main content */}
      <main
        style={{
          flex: 1,
          padding: "var(--space-6) var(--margin-page-mobile)",
          paddingBottom: `calc(var(--bottom-nav-height) + var(--space-6))`,
          maxWidth: "600px",
          margin: "0 auto",
          width: "100%",
          boxSizing: "border-box",
        }}
      >
        {/* Platform selector — keyboard: Tab to group, arrow keys to change */}
        <div style={{ marginBottom: "var(--gap-section)" }}>
          <p
            id="platform-label"
            style={{
              fontSize: "var(--font-size-h4)",
              fontWeight: "var(--font-weight-semibold)",
              color: "var(--color-text)",
              marginBottom: "var(--space-2)",
            }}
          >
            Platform
          </p>
          <div
            role="radiogroup"
            aria-labelledby="platform-label"
            style={{ display: "flex", gap: "var(--space-2)" }}
          >
            {(["linkedin", "instagram"] as Platform[]).map((p) => (
              <label
                key={p}
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  minHeight: "var(--min-tap-target)",
                  border: `2px solid ${platform === p ? "var(--color-primary)" : "var(--color-border)"}`,
                  borderRadius: "var(--radius-md)",
                  cursor: "pointer",
                  backgroundColor:
                    platform === p ? "#EFF6FF" : "var(--color-surface)",
                  color:
                    platform === p
                      ? "var(--color-primary)"
                      : "var(--color-text)",
                  fontWeight:
                    platform === p
                      ? "var(--font-weight-semibold)"
                      : "var(--font-weight-normal)",
                  fontSize: "var(--font-size-body-sm)",
                  textTransform: "capitalize",
                  transition: "all 0.15s",
                }}
              >
                <input
                  type="radio"
                  name="platform"
                  value={p}
                  checked={platform === p}
                  onChange={() => setPlatform(p)}
                  style={{ position: "absolute", opacity: 0, width: 0, height: 0 }}
                />
                {p === "linkedin" ? "LinkedIn" : "Instagram"}
              </label>
            ))}
          </div>
        </div>

        {/* Topic textarea */}
        <div style={{ marginBottom: "var(--gap-section)" }}>
          <label
            htmlFor={topicId}
            style={{
              display: "block",
              fontSize: "var(--font-size-h4)",
              fontWeight: "var(--font-weight-semibold)",
              color: "var(--color-text)",
              marginBottom: "var(--space-2)",
            }}
          >
            Topic or URL
          </label>
          <textarea
            id={topicId}
            ref={topicRef}
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            onKeyDown={handleKeyDown}
            maxLength={MAX_TOPIC_LENGTH}
            rows={4}
            placeholder="What is this post about?"
            aria-describedby={`${topicId}-counter ${error ? errorId : ""}`}
            aria-invalid={error ? "true" : undefined}
            required
            style={{
              width: "100%",
              padding: "var(--space-3)",
              border: `1px solid ${error ? "var(--color-error)" : "var(--color-border)"}`,
              borderRadius: "var(--radius-md)",
              fontSize: "var(--font-size-body)",
              color: "var(--color-text)",
              backgroundColor: "var(--color-surface-muted)",
              resize: "vertical",
              minHeight: "100px",
              boxSizing: "border-box",
              fontFamily: "var(--font-family)",
              // Focus style via CSS :focus-visible in globals
            }}
          />
          <div
            id={`${topicId}-counter`}
            aria-live="polite"
            aria-atomic="true"
            style={{
              fontSize: "var(--font-size-caption)",
              color: charsUsed > MAX_TOPIC_LENGTH * 0.9
                ? "var(--color-error)"
                : "var(--color-muted)",
              textAlign: "right",
              marginTop: "var(--space-1)",
            }}
          >
            {charsUsed} / {MAX_TOPIC_LENGTH}
          </div>
        </div>

        {/* Loading announcement region */}
        <div
          id={loadingRegionId}
          aria-live="polite"
          aria-atomic="true"
          style={{ position: "absolute", left: "-9999px" }}
        >
          {isGenerating ? "Generating your post draft…" : ""}
        </div>

        {/* Error message */}
        {error && (
          <div
            id={errorId}
            role="alert"
            style={{
              marginBottom: "var(--space-4)",
              padding: "var(--space-3)",
              backgroundColor: "#FEF2F2",
              border: "1px solid var(--color-error)",
              borderRadius: "var(--radius-md)",
              color: "var(--color-error)",
              fontSize: "var(--font-size-body-sm)",
              display: "flex",
              alignItems: "flex-start",
              gap: "var(--space-2)",
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              style={{ flexShrink: 0, marginTop: "1px" }}
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            {error.message}
          </div>
        )}

        {/* Loading skeleton */}
        {isGenerating && (
          <div
            aria-hidden="true"
            style={{
              marginBottom: "var(--space-4)",
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-lg)",
              padding: "var(--space-4)",
            }}
          >
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                style={{
                  height: "16px",
                  backgroundColor: "var(--color-border)",
                  borderRadius: "var(--radius-sm)",
                  marginBottom: "var(--space-2)",
                  width: i === 3 ? "60%" : "100%",
                  animation: "shimmer 1.5s infinite",
                }}
              />
            ))}
          </div>
        )}

        {/* Generate button */}
        <button
          ref={generateBtnRef}
          type="button"
          onClick={handleGenerate}
          disabled={!isTopicValid || isGenerating}
          aria-label="Generate post draft"
          aria-busy={isGenerating}
          style={{
            width: "100%",
            minHeight: "var(--min-button-height)",
            backgroundColor:
              !isTopicValid || isGenerating
                ? "var(--color-border)"
                : "var(--color-primary)",
            color: !isTopicValid || isGenerating ? "var(--color-muted)" : "white",
            border: "none",
            borderRadius: "var(--radius-md)",
            fontSize: "var(--font-size-body)",
            fontWeight: "var(--font-weight-semibold)",
            cursor: !isTopicValid || isGenerating ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "var(--space-2)",
            transition: "background-color 0.15s",
            marginBottom: "var(--space-4)",
          }}
        >
          {isGenerating ? (
            <>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
                style={{ animation: "spin 1s linear infinite" }}
              >
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
              Generating…
            </>
          ) : (
            "Generate Post"
          )}
        </button>

        {/* Brand voice coming v1.1 */}
        <p
          style={{
            fontSize: "var(--font-size-caption)",
            color: "var(--color-muted)",
            textAlign: "center",
          }}
        >
          Brand voice customization coming in v1.1
        </p>
      </main>

      <BottomNav />

      <style>{`
        @keyframes shimmer {
          0% { opacity: 1; }
          50% { opacity: 0.4; }
          100% { opacity: 1; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        textarea:focus-visible,
        button:focus-visible,
        a:focus-visible {
          outline: var(--focus-outline-width) solid var(--color-focus-outline);
          outline-offset: var(--focus-outline-offset);
        }
      `}</style>
    </div>
  );
}
