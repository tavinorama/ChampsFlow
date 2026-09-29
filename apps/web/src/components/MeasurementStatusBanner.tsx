"use client";

/**
 * MeasurementStatusBanner — D1 (Codex N04, 28/09).
 *
 * When the newest audit attempt failed, the scorecard below it still shows the
 * last VALID number. Without a word, that reads as "measured today". This
 * banner says what happened, in the order the customer needs: we could not
 * measure, this is the date of the number you are looking at, this is why,
 * and nothing was charged. Silent when there is no incident.
 */
import { useEffect, useState } from "react";
import { apiFetch } from "../lib/supabase-browser";

interface Status {
  incident: boolean;
  headline: string | null;
  detail: string | null;
  lastAttempt: { tries: number } | null;
}

export function MeasurementStatusBanner({ brandId }: { brandId: string }) {
  const [status, setStatus] = useState<Status | null>(null);
  useEffect(() => {
    if (!brandId) return;
    let alive = true;
    apiFetch(`/api/brands/${brandId}/measurement-status`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive) setStatus(d as Status | null);
      })
      .catch(() => {
        /* a banner that cannot load stays silent; the page still works */
      });
    return () => {
      alive = false;
    };
  }, [brandId]);

  if (!status?.incident || !status.headline) return null;
  return (
    <div
      role="status"
      style={{
        marginBottom: "var(--space-5)",
        padding: "var(--space-4)",
        border: "1px solid var(--color-warning, #b7791f)",
        borderLeftWidth: "4px",
        borderRadius: "var(--radius-md, 8px)",
        background: "var(--color-surface)",
      }}
    >
      <p style={{ margin: 0, fontWeight: 700, color: "var(--color-text)" }}>{status.headline}</p>
      {status.detail && (
        <p style={{ margin: "var(--space-2) 0 0", color: "var(--color-muted)", fontSize: "var(--font-size-body-sm)", lineHeight: 1.6 }}>
          {status.detail}
        </p>
      )}
    </div>
  );
}
