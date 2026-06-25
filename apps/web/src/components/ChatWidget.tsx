/**
 * ChatWidget — Floating sales chat widget for TrustIndex AI marketing pages.
 *
 * ENV VARS:
 *   NEXT_PUBLIC_CALENDLY_URL — (optional) Calendly booking URL shown in the chat panel.
 *     If unset, the "Book a call" button links to /test instead.
 *     Example: NEXT_PUBLIC_CALENDLY_URL=https://calendly.com/yourname/30min
 *
 * Accessibility: WCAG 2.2 AA
 *   - Panel: role="dialog", aria-modal="true", aria-label
 *   - Message list: role="log", aria-live="polite"
 *   - Focus management: opens → input focused; closes → launcher focused
 *   - Escape key closes the panel
 *   - Minimum tap targets (var(--min-tap-target)) on all interactive elements
 *   - Screen-reader-only label on text input
 *   - Suggestion chips: role="button", keyboard accessible
 *   - aria-expanded on launcher
 *
 * Mobile: Full-width bottom sheet on ≤640px via WIDGET_STYLES media query.
 *
 * Styling: Inline styles with CSS variable tokens only. No magic numbers.
 * No Tailwind. A <style> tag is injected once for hover/media-query rules
 * that cannot be expressed as inline styles.
 */

"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Message {
  role: "user" | "assistant";
  content: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GREETING: Message = {
  role: "assistant",
  content:
    "Hi! I'm the TrustIndex AI assistant. How can I help you today?",
};

const SUGGESTED_QUESTIONS = [
  "What is GEO?",
  "How does the free test work?",
  "What do the plans include?",
] as const;

const CALENDLY_URL =
  process.env.NEXT_PUBLIC_CALENDLY_URL ?? "/test";

const IS_EXTERNAL_CALENDLY =
  CALENDLY_URL.startsWith("https://calendly.com");

// ---------------------------------------------------------------------------
// CSS — injected once in the component tree.
// Covers responsive layout and pseudo-states that cannot be inline styles.
// Dark mode: tokens.css already provides dark-mode CSS var overrides, so
// inline styles referencing var(--token) automatically update. No duplicate
// dark-mode rules needed here.
// ---------------------------------------------------------------------------

const WIDGET_STYLES = `
  /* ── Screen-reader-only helper ──────────────────────────────────── */
  .chat-sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0,0,0,0);
    white-space: nowrap;
    border-width: 0;
  }

  /* ── Chat panel — desktop: fixed bottom-right card ──────────────── */
  .chat-widget-panel {
    position: fixed;
    bottom: calc(var(--min-tap-target, 44px) + 16px + 56px);
    right: var(--space-4, 1rem);
    width: 320px;
    max-height: 520px;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-modal);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    z-index: 200;
  }

  /* ── Chat panel — mobile: full-width bottom sheet ────────────────── */
  @media (max-width: 640px) {
    .chat-widget-panel {
      bottom: 0;
      left: 0;
      right: 0;
      width: 100%;
      max-height: 60vh;
      border-radius: var(--radius-lg) var(--radius-lg) 0 0;
    }
  }

  /* ── Launcher button hover / active ─────────────────────────────── */
  .chat-widget-launcher:hover {
    opacity: 0.88;
    transform: scale(1.05);
  }
  .chat-widget-launcher:active {
    transform: scale(0.97);
  }

  /* ── Send button hover ───────────────────────────────────────────── */
  .chat-send-btn:hover:not(:disabled) {
    opacity: 0.88;
  }
  .chat-send-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* ── Suggestion chip hover ───────────────────────────────────────── */
  .chat-chip:hover {
    background: var(--color-primary) !important;
    color: #fff !important;
  }
  .chat-chip:focus-visible {
    outline: var(--focus-outline-width, 3px) solid var(--color-focus-outline);
    outline-offset: var(--focus-outline-offset, 2px);
  }

  /* ── Focus visible inside panel ─────────────────────────────────── */
  .chat-widget-panel :focus-visible {
    outline: var(--focus-outline-width, 3px) solid var(--color-focus-outline);
    outline-offset: var(--focus-outline-offset, 2px);
  }

  /* ── Launcher focus visible ─────────────────────────────────────── */
  .chat-widget-launcher:focus-visible {
    outline: var(--focus-outline-width, 3px) solid var(--color-focus-outline);
    outline-offset: var(--focus-outline-offset, 2px);
  }

  /* ── Book-a-call button hover ───────────────────────────────────── */
  .chat-book-btn:hover {
    background: var(--color-primary-hover, #086A4C) !important;
  }

  /* ── Reduced motion ──────────────────────────────────────────────── */
  @media (prefers-reduced-motion: reduce) {
    .chat-widget-launcher { transition: none !important; }
  }
`;

// ---------------------------------------------------------------------------
// Typing indicator dots (purely presentational, aria-hidden)
// ---------------------------------------------------------------------------
function TypingIndicator() {
  return (
    <div
      aria-hidden="true"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--space-1)",
        padding: "var(--space-1)",
      }}
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            width: "6px",
            height: "6px",
            borderRadius: "50%",
            background: "var(--color-muted)",
            display: "inline-block",
            animation: `chat-dot-bounce 1s ${i * 0.2}s infinite ease-in-out`,
          }}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ChatWidget
// ---------------------------------------------------------------------------

export function ChatWidget() {
  const [mounted, setMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([GREETING]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // Track whether the panel has ever been opened so the close-focus effect
  // does not fire on the initial render (when isOpen starts as false).
  const wasOpenRef = useRef(false);

  // Mount only after hydration to prevent SSR mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  // Focus management: open → input; close → launcher (only if was previously open)
  useEffect(() => {
    if (isOpen) {
      wasOpenRef.current = true;
      const id = setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return () => clearTimeout(id);
    } else if (wasOpenRef.current) {
      // Only return focus to launcher if the panel was previously open —
      // not on the initial render where isOpen starts as false.
      launcherRef.current?.focus();
    }
  }, [isOpen]);

  // Escape key closes the panel
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        setIsOpen(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  // Scroll to bottom of message list after each new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Send a message and fetch assistant reply
  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;

      const userMessage: Message = { role: "user", content: trimmed };
      const nextMessages: Message[] = [...messages, userMessage];

      setMessages(nextMessages);
      setInput("");
      setLoading(true);

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: nextMessages }),
        });

        const data: { reply?: string } = await res.json();

        const reply =
          res.status === 429 && data.reply
            ? data.reply
            : res.ok && data.reply
            ? data.reply
            : !res.ok
            ? "Sorry, I couldn't reach the server. Try again in a moment."
            : "Sorry, I couldn't reach the server. Try again in a moment.";

        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: reply },
        ]);
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              "Sorry, I couldn't reach the server. Try again in a moment.",
          },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [messages, loading]
  );

  // Handle input submission (Enter key or Send button)
  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      sendMessage(input);
    },
    [input, sendMessage]
  );

  // Handle chip click — send chip text as a user message
  const handleChipClick = useCallback(
    (question: string) => {
      sendMessage(question);
    },
    [sendMessage]
  );

  // Handle chip Enter key press
  const handleChipKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>, question: string) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        sendMessage(question);
      }
    },
    [sendMessage]
  );

  // SSR guard: render nothing until client hydration is complete
  if (!mounted) return null;

  return (
    <>
      {/* Inject styles once (React deduplicates style tags in the same tree) */}
      <style
        dangerouslySetInnerHTML={{
          __html:
            WIDGET_STYLES +
            `
  @keyframes chat-dot-bounce {
    0%, 80%, 100% { transform: scale(0.8); opacity: 0.5; }
    40%           { transform: scale(1.2); opacity: 1; }
  }`,
        }}
      />

      {/* ── Launcher button ─────────────────────────────────────────── */}
      <button
        ref={launcherRef}
        type="button"
        className="chat-widget-launcher"
        aria-label={
          isOpen ? "Close TrustIndex AI chat" : "Open TrustIndex AI chat"
        }
        aria-expanded={isOpen}
        aria-controls="chat-widget-panel"
        onClick={() => setIsOpen((prev) => !prev)}
        style={{
          position: "fixed",
          bottom: "var(--space-4)",
          right: "var(--space-4)",
          zIndex: 200,
          display: "flex",
          alignItems: "center",
          gap: "var(--space-2)",
          background: "var(--color-primary)",
          color: "#fff",
          border: "none",
          borderRadius: "9999px",
          height: "48px",
          padding: "0 var(--space-4)",
          cursor: "pointer",
          boxShadow: "var(--shadow-modal)",
          fontSize: "var(--font-size-body-sm)",
          fontWeight: "var(--font-weight-semibold)",
          fontFamily: "var(--font-family)",
          minHeight: "var(--min-tap-target)",
          transition: "opacity 0.15s ease, transform 0.15s ease",
          whiteSpace: "nowrap",
        }}
      >
        {/* Chat bubble icon */}
        <svg
          aria-hidden="true"
          focusable="false"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        {/* Label hidden on very small screens via inline max-width clamp;
            we rely on padding + icon alone for the pill shape at narrow widths.
            The <span> is visually present at ≥360px but the button is still
            accessible via aria-label at all sizes. */}
        <span
          style={{
            /* Hide text on screens narrower than 360px by letting it collapse */
            overflow: "hidden",
            maxWidth: "clamp(0px, 100vw - 120px, 80px)",
          }}
        >
          Ask AI
        </span>
      </button>

      {/* ── Chat panel ──────────────────────────────────────────────── */}
      {isOpen && (
        <div
          id="chat-widget-panel"
          className="chat-widget-panel"
          role="dialog"
          aria-label="TrustIndex AI chat"
          aria-modal="true"
        >
          {/* Panel header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "var(--space-3) var(--space-4)",
              borderBottom: "1px solid var(--color-border)",
              background: "var(--color-surface)",
              flexShrink: 0,
            }}
          >
            <span
              style={{
                fontSize: "var(--font-size-body-sm)",
                fontWeight: "var(--font-weight-semibold)",
                color: "var(--color-text)",
                fontFamily: "var(--font-family)",
              }}
            >
              TrustIndex AI — Ask me anything
            </span>
            <button
              type="button"
              aria-label="Close chat"
              onClick={() => setIsOpen(false)}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--color-muted)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "var(--min-tap-target)",
                height: "var(--min-tap-target)",
                borderRadius: "var(--radius-sm)",
                flexShrink: 0,
              }}
            >
              <svg
                aria-hidden="true"
                focusable="false"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Message list */}
          <div
            role="log"
            aria-label="Chat messages"
            aria-live="polite"
            aria-relevant="additions"
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "var(--space-3) var(--space-4)",
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-3)",
            }}
          >
            {messages.map((msg, idx) => (
              <div key={idx}>
                <div
                  style={{
                    display: "flex",
                    justifyContent:
                      msg.role === "user" ? "flex-end" : "flex-start",
                  }}
                >
                  <div
                    style={{
                      maxWidth: "80%",
                      padding: "var(--space-2) var(--space-3)",
                      borderRadius: "var(--radius-md)",
                      background:
                        msg.role === "user"
                          ? "var(--color-primary)"
                          : "var(--color-surface-muted)",
                      color:
                        msg.role === "user"
                          ? "#fff"
                          : "var(--color-text)",
                      fontSize: "var(--font-size-body-sm)",
                      lineHeight: "var(--line-height-body)",
                      fontFamily: "var(--font-family)",
                      wordBreak: "break-word",
                    }}
                  >
                    {msg.content}
                  </div>
                </div>

                {/* Suggestion chips — shown only below the first (greeting) message */}
                {idx === 0 && msg.role === "assistant" && (
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "var(--space-2)",
                      marginTop: "var(--space-2)",
                    }}
                  >
                    {SUGGESTED_QUESTIONS.map((q) => (
                      <button
                        key={q}
                        type="button"
                        tabIndex={0}
                        className="chat-chip"
                        onClick={() => handleChipClick(q)}
                        onKeyDown={(e) => handleChipKeyDown(e, q)}
                        style={{
                          border: "1px solid var(--color-primary)",
                          borderRadius: "var(--radius-pill)",
                          color: "var(--color-primary)",
                          background: "transparent",
                          cursor: "pointer",
                          fontSize: "var(--font-size-caption)",
                          fontWeight: "var(--font-weight-medium)",
                          fontFamily: "var(--font-family)",
                          padding: "var(--space-1) var(--space-3)",
                          minHeight: "var(--min-tap-target)",
                          display: "inline-flex",
                          alignItems: "center",
                          transition: "background 0.15s, color 0.15s",
                        }}
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {/* Typing / loading indicator */}
            {loading && (
              <div style={{ display: "flex", justifyContent: "flex-start" }}>
                <div
                  style={{
                    maxWidth: "80%",
                    padding: "var(--space-2) var(--space-3)",
                    borderRadius: "var(--radius-md)",
                    background: "var(--color-surface-muted)",
                  }}
                >
                  <TypingIndicator />
                </div>
              </div>
            )}

            {/* Scroll anchor */}
            <div ref={messagesEndRef} aria-hidden="true" />
          </div>

          {/* Input area */}
          <div
            style={{
              borderTop: "1px solid var(--color-border)",
              padding: "var(--space-3) var(--space-4)",
              background: "var(--color-surface)",
              flexShrink: 0,
            }}
          >
            {/* Text input + send button */}
            <form
              onSubmit={handleSubmit}
              style={{
                display: "flex",
                gap: "var(--space-2)",
                alignItems: "center",
              }}
            >
              <label htmlFor="chat-input" className="chat-sr-only">
                Type your message
              </label>
              <input
                ref={inputRef}
                id="chat-input"
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type a message…"
                disabled={loading}
                autoComplete="off"
                style={{
                  flex: 1,
                  height: "var(--min-tap-target)",
                  padding: "0 var(--space-3)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-md)",
                  fontSize: "var(--font-size-body-sm)",
                  fontFamily: "var(--font-family)",
                  color: "var(--color-text)",
                  background: "var(--color-surface-muted)",
                  outline: "none",
                  minWidth: 0,
                }}
              />
              <button
                type="submit"
                aria-label="Send message"
                disabled={loading || !input.trim()}
                className="chat-send-btn"
                style={{
                  background: "var(--color-primary)",
                  color: "#fff",
                  border: "none",
                  borderRadius: "var(--radius-md)",
                  width: "var(--min-tap-target)",
                  height: "var(--min-tap-target)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  transition: "opacity 0.15s",
                }}
              >
                <svg
                  aria-hidden="true"
                  focusable="false"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </form>

            {/* AI-generated disclaimer */}
            <p
              style={{
                margin: "var(--space-1) 0 var(--space-2)",
                fontSize: "var(--font-size-caption)",
                color: "var(--color-muted)",
                fontFamily: "var(--font-family)",
                lineHeight: "var(--line-height-caption)",
              }}
            >
              Answers are AI-generated and may be imperfect.
            </p>

            {/* Book a call CTA */}
            {IS_EXTERNAL_CALENDLY ? (
              <a
                href={CALENDLY_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="chat-book-btn"
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "center",
                  background: "var(--color-primary)",
                  color: "#fff",
                  border: "none",
                  borderRadius: "var(--radius-md)",
                  height: "var(--min-button-height, 48px)",
                  lineHeight: "var(--min-button-height, 48px)",
                  fontSize: "var(--font-size-body-sm)",
                  fontWeight: "var(--font-weight-semibold)",
                  fontFamily: "var(--font-family)",
                  textDecoration: "none",
                  cursor: "pointer",
                  transition: "background 0.15s",
                }}
              >
                Book a call
              </a>
            ) : (
              <Link
                href={CALENDLY_URL}
                className="chat-book-btn"
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "center",
                  background: "var(--color-primary)",
                  color: "#fff",
                  borderRadius: "var(--radius-md)",
                  height: "var(--min-button-height, 48px)",
                  lineHeight: "var(--min-button-height, 48px)",
                  fontSize: "var(--font-size-body-sm)",
                  fontWeight: "var(--font-weight-semibold)",
                  fontFamily: "var(--font-family)",
                  textDecoration: "none",
                  cursor: "pointer",
                  transition: "background 0.15s",
                }}
              >
                Book a call
              </Link>
            )}
          </div>
        </div>
      )}
    </>
  );
}
