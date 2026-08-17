"use client";

/**
 * /ai-audit/[token] — AI Audit Stack ($49) delivery page. Mirrors /kit/[token]:
 * on load, if delivered, show it; else verify payment (Stripe session_id or
 * dev_unlock, non-production only) via POST /api/ai-audit/order/:token/deliver,
 * build it, and render the ONE niche pick + the honest teaser + the upsell
 * ladder (AiAuditResult).
 */

import { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Logo } from "../../../../components/brand/Logo";
import { COPY } from "../ai-audit-copy";
import { AiAuditResult, normalizeAiAuditDeliverable, type AiAuditDeliverable } from "../AiAuditResult";
import { cardStyle, primaryBtn } from "../ai-audit-styles";

export default function AiAuditDeliveryPage() {
  const params = useParams();
  const search = useSearchParams();
  const token = String(params?.token ?? "");
  const [state, setState] = useState<"loading" | "ready" | "unpaid" | "not_ready" | "error">("loading");
  const [deliverable, setDeliverable] = useState<AiAuditDeliverable | null>(null);

  const load = useCallback(async () => {
    try {
      // 1. Already delivered?
      const statusRes = await fetch(`/api/ai-audit/order/${token}`);
      if (statusRes.status === 503) {
        setState("not_ready");
        return;
      }
      if (statusRes.ok) {
        const s = (await statusRes.json()) as { status?: string; deliverable?: unknown };
        if (s.status === "delivered") {
          const parsed = normalizeAiAuditDeliverable(s.deliverable);
          if (parsed) {
            setDeliverable(parsed);
            setState("ready");
            return;
          }
        }
      }
      // 2. Try to deliver (verify payment via session_id or dev_unlock).
      const qs = new URLSearchParams();
      const sessionId = search.get("session_id");
      if (sessionId) qs.set("session_id", sessionId);
      if (search.get("dev_unlock") === "1") qs.set("dev_unlock", "1");
      const res = await fetch(`/api/ai-audit/order/${token}/deliver?${qs.toString()}`, { method: "POST" });
      if (res.ok) {
        const body = (await res.json()) as { deliverable?: unknown };
        const parsed = normalizeAiAuditDeliverable(body.deliverable);
        if (parsed) {
          setDeliverable(parsed);
          setState("ready");
        } else {
          setState("error");
        }
      } else if (res.status === 402) {
        setState("unpaid");
      } else if (res.status === 503) {
        setState("not_ready");
      } else {
        setState("error");
      }
    } catch {
      setState("error");
    }
  }, [token, search]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main style={{ maxWidth: "820px", margin: "0 auto", padding: "var(--space-12) var(--space-4) var(--space-20)", fontFamily: "var(--font-family)", color: "var(--color-text)" }}>
      {state === "loading" && (
        <p role="status" aria-live="polite" style={{ color: "var(--color-muted)" }}>{COPY.delivering}</p>
      )}
      {state === "unpaid" && (
        <div style={cardStyle}>
          <h1 style={{ fontSize: "var(--font-size-h2)", fontWeight: 800, margin: 0 }}>{COPY.unpaidTitle}</h1>
          <p style={{ color: "var(--color-muted)", lineHeight: 1.6, margin: 0 }}>{COPY.unpaidBody}</p>
          <a href="/ai-audit" style={{ ...primaryBtn(false), alignSelf: "flex-start" }}>{COPY.unpaidCta}</a>
        </div>
      )}
      {state === "not_ready" && (
        <div style={cardStyle}>
          <h1 style={{ fontSize: "var(--font-size-h2)", fontWeight: 800, margin: 0 }}>{COPY.errorTitle}</h1>
          <p style={{ color: "var(--color-muted)", lineHeight: 1.6, margin: 0 }}>{COPY.notReady}</p>
        </div>
      )}
      {state === "error" && (
        <div style={cardStyle}>
          <h1 style={{ fontSize: "var(--font-size-h2)", fontWeight: 800, margin: 0 }}>{COPY.errorTitle}</h1>
          <p style={{ color: "var(--color-muted)", lineHeight: 1.6, margin: 0 }}>{COPY.deliveryErrorBody}</p>
        </div>
      )}
      {state === "ready" && deliverable && (
        <>
          <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-4)", flexWrap: "wrap", marginBottom: "var(--space-6)", paddingBottom: "var(--space-5)", borderBottom: "1px solid var(--color-border)" }}>
            <Logo markSize={30} wordSize="1.0625rem" />
            <span style={{ fontSize: "var(--font-size-caption)", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-success)" }}>
              &#10003; AI Audit Stack
            </span>
          </header>
          <h1 style={{ fontSize: "clamp(1.75rem, 4vw, 2.5rem)", fontWeight: 800, letterSpacing: "-0.03em", margin: "0 0 var(--space-5) 0" }}>
            {deliverable.entry.pick ? `Your AI stack pick for ${deliverable.businessType || "your business"}` : COPY.result.emptyTitle}
          </h1>
          <AiAuditResult d={deliverable} />
        </>
      )}
    </main>
  );
}
