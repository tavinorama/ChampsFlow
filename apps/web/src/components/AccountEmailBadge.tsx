"use client";

/**
 * AccountEmailBadge — shows the email the user is logged in with, at the top of
 * the account hub. Founder ask: "o menu da conta deve apresentar o email que
 * serve para o login." Read-only; fetched client-side from the Supabase session.
 */

import { useEffect, useState } from "react";
import { getSupabase } from "../lib/supabase-browser";

export function AccountEmailBadge() {
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data } = await getSupabase().auth.getUser();
        if (active) setEmail(data.user?.email ?? null);
      } catch {
        /* not signed in / offline — render nothing */
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  if (!email) return null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--space-2)",
        flexWrap: "wrap",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-md)",
        padding: "var(--space-3) var(--space-4)",
        backgroundColor: "var(--color-surface)",
        margin: "0 0 var(--space-6) 0",
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "0.625rem",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--color-muted)",
          fontWeight: 600,
        }}
      >
        Signed in as
      </span>
      <span style={{ fontWeight: 600, fontSize: "var(--font-size-body-sm)", wordBreak: "break-all" }}>
        {email}
      </span>
    </div>
  );
}
