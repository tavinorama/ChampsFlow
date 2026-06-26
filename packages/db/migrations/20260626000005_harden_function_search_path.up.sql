-- Migration: 20260626000005_harden_function_search_path
-- Security hardening (Supabase advisor 0011 — function_search_path_mutable):
-- pin a fixed, empty search_path on the trigger helper functions so they
-- can't be hijacked via a mutable search_path. These are updated_at triggers
-- that only touch NEW (no unqualified object lookups), so an empty path is safe.

ALTER FUNCTION public.set_updated_at() SET search_path = '';
ALTER FUNCTION public.trg_billing_subscriptions_updated_at() SET search_path = '';
