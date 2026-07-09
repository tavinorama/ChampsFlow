"use client";

import { useEffect } from "react";
import { getSupabase, isSupabaseConfigured } from "./supabase-browser";

/**
 * useVerifiedEmail — calls `onEmail(email)` with the Supabase-verified session
 * email as soon as it's available.
 *
 * Why a subscription and not a one-shot getSession(): after "Continue with
 * Google/GitHub/LinkedIn" the browser returns to this page and Supabase exchanges
 * the OAuth code for a session ASYNCHRONOUSLY (detectSessionInUrl). A single
 * getSession() on mount usually runs BEFORE that exchange finishes, so the email
 * never prefills — which made social sign-in on the free test / Kit do nothing.
 * We check immediately (already signed in) AND subscribe to onAuthStateChange so
 * we catch the INITIAL_SESSION / SIGNED_IN event that fires once the code
 * exchange completes.
 *
 * `onEmail` should be a stable callback (a useState setter is stable). The caller
 * decides whether to override an already-typed value (e.g. `prev => prev || e`).
 */
export function useVerifiedEmail(onEmail: (email: string) => void): void {
  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    let cancelled = false;
    const supabase = getSupabase();

    // Immediate check — already signed in on this device.
    void supabase.auth
      .getSession()
      .then(({ data }) => {
        const e = data.session?.user?.email;
        if (!cancelled && e) onEmail(e);
      })
      .catch(() => {});

    // Fires once the post-redirect OAuth code exchange establishes the session.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const e = session?.user?.email;
      if (!cancelled && e) onEmail(e);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
    // onEmail is expected stable (a state setter); run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
