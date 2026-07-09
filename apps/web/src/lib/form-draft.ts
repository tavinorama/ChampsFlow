/**
 * form-draft.ts — persist an in-progress funnel form across an OAuth redirect.
 *
 * Choosing "Continue with Google/GitHub/LinkedIn" mid-form navigates away to the
 * provider and back, which would otherwise wipe everything the visitor already
 * typed (brand, category, competitors…). We stash a draft in sessionStorage
 * before the redirect and restore it on return, so social sign-in reduces
 * friction instead of adding it. sessionStorage (not localStorage) so the draft
 * is scoped to the tab and clears itself when the tab closes.
 */

const PREFIX = "ozvor:draft:";

export function saveFormDraft(key: string, data: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(PREFIX + key, JSON.stringify(data));
  } catch {
    /* private mode / quota / disabled — a lost draft is non-fatal */
  }
}

export function loadFormDraft<T = Record<string, unknown>>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function clearFormDraft(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(PREFIX + key);
  } catch {
    /* no-op */
  }
}
