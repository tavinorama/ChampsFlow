"use client";

/**
 * /drafts — Fix Queue.
 *
 * The real, audit-driven action plan: every gap Ozvor finds becomes a plan_task
 * (gap → action, with impact/effort/priority + evidence). Data is 100% real,
 * generated from the latest audit (GET /api/brands/:id/plan → tasks), the same
 * source as the brand-page Action Cards. You can accept a fix, mark it done, or
 * SCHEDULE it to a date (PATCH /api/plan-tasks/:id) — the queue then flags
 * due-soon / overdue fixes in-app (no reminder emails; Batch D/2).
 * (Replaces the earlier hardcoded placeholder queue.)
 */

import { useEffect, useState, useCallback } from "react";
import { apiFetch, ensureProvisioned } from "../../lib/supabase-browser";

interface Brand { id: string; name: string; latest_score?: number | null }

interface PlanTask {
  id: string;
  vector: string;
  gap: string;
  action: string;
  effort: string;
  impact: string;
  priority: number;
  status: string; // proposed | accepted | rejected | done
  evidence: string | null;
  metric: string | null;
  owner: string | null;
  due_date: string | null; // ISO-8601 or null — in-app scheduling
  landing_site_id: string | null; // set when an Ozvor Pages generation run consumed/can apply this fix (#208 PR-7)
}

/** Due-status badge from a scheduled date (in-app only, no emails). */
function dueMeta(due: string | null): { label: string; color: string } | null {
  if (!due) return null;
  const d = new Date(due);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const days = Math.round((dueDay.getTime() - startOfToday.getTime()) / 86_400_000);
  const dateStr = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  if (days < 0) return { label: `Overdue · ${dateStr}`, color: "var(--color-error)" };
  if (days === 0) return { label: "Due today", color: "var(--color-error)" };
  if (days <= 3) return { label: `Due in ${days}d · ${dateStr}`, color: "#e6a93f" };
  return { label: `Due ${dateStr}`, color: "var(--color-muted)" };
}

const LEVEL_COLOR: Record<string, string> = {
  high: "#27c98a", medium: "#e6a93f", low: "var(--color-muted)",
};
function levelColor(v: string): string {
  return LEVEL_COLOR[(v || "").toLowerCase()] ?? "var(--color-muted)";
}

const STATUS_LABEL: Record<string, string> = {
  proposed: "Proposed", accepted: "Accepted", rejected: "Dismissed", done: "Done",
};

export default function FixQueuePage() {
  const [state, setState] = useState<"loading" | "ready" | "no-brand" | "no-plan" | "error">("loading");
  const [brand, setBrand] = useState<Brand | null>(null);
  const [tasks, setTasks] = useState<PlanTask[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      await ensureProvisioned();
      const brandsRes = await apiFetch("/api/brands");
      if (!brandsRes.ok) { setState("error"); return; }
      const brands = ((await brandsRes.json()) as { brands?: Brand[] }).brands ?? [];
      if (brands.length === 0) { setState("no-brand"); return; }
      const chosen = brands.find((b) => b.latest_score != null) ?? brands[0];
      setBrand(chosen);

      const planRes = await apiFetch(`/api/brands/${chosen.id}/plan`);
      if (!planRes.ok) { setState("no-plan"); return; }
      const data = (await planRes.json()) as { plan: unknown; tasks?: PlanTask[] };
      const t = (data.tasks ?? []).filter((x) => x && x.id);
      if (t.length === 0) { setState("no-plan"); return; }
      setTasks(t);
      setState("ready");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function setStatus(id: string, status: "accepted" | "done") {
    setBusyId(id);
    try {
      const res = await apiFetch(`/api/plan-tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status } : t)));
    } catch { /* keep prior state */ } finally { setBusyId(null); }
  }

  async function setDueDate(id: string, due_date: string | null) {
    setBusyId(id);
    // Optimistic — reflect immediately, roll back on failure.
    const prevTasks = tasks;
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, due_date } : t)));
    try {
      const res = await apiFetch(`/api/plan-tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ due_date }),
      });
      if (!res.ok) setTasks(prevTasks);
    } catch { setTasks(prevTasks); } finally { setBusyId(null); }
  }

  // Open items first (proposed/accepted), done/rejected last.
  const ordered = [...tasks].sort((a, b) => {
    const rank = (s: string) => (s === "done" || s === "rejected" ? 1 : 0);
    return rank(a.status) - rank(b.status) || b.priority - a.priority;
  });
  const openCount = tasks.filter((t) => t.status !== "done" && t.status !== "rejected").length;

  return (
    <main aria-labelledby="fix-queue-heading" style={{ maxWidth: 1040, margin: "0 auto", padding: "var(--space-10) var(--space-4) calc(var(--bottom-nav-height) + var(--space-12))", color: "var(--color-text)", fontFamily: "var(--font-family)" }}>
      <section style={{ border: "1px solid rgba(39,201,138,0.24)", borderRadius: "var(--radius-xl)", background: "radial-gradient(90% 70% at 10% 0%, rgba(39,201,138,0.14), transparent 58%), var(--color-surface)", padding: "var(--space-8)", boxShadow: "var(--shadow-card)" }}>
        <div style={{ color: "var(--color-accent-ink)", fontFamily: "var(--font-mono)", fontSize: "0.72rem", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: "var(--space-2)" }}>
          Fix queue{brand ? ` · ${brand.name}` : ""}
        </div>
        <h1 id="fix-queue-heading" style={{ margin: 0, maxWidth: 720, fontSize: "clamp(2rem, 5vw, 3.3rem)", fontWeight: 900, letterSpacing: "-0.035em", lineHeight: 1.02 }}>
          {state === "ready" ? `${openCount} fix${openCount === 1 ? "" : "es"} to close your AI-visibility gaps.` : "Your recommended fixes become actions, not report text."}
        </h1>
        <p style={{ maxWidth: 640, margin: "var(--space-4) 0 0", color: "var(--color-muted)", lineHeight: 1.65 }}>
          Every gap from your latest audit, prioritized. Accept a fix, mark it done, or send it to your calendar — then re-audit to see it move your score.
        </p>
      </section>

      {state === "loading" && <p style={{ color: "var(--color-muted)", marginTop: "var(--space-8)" }}>Loading your fix queue…</p>}
      {state === "error" && <Empty title="Couldn’t load your fixes" body="Please refresh. If it persists, contact support." />}
      {state === "no-brand" && <Empty title="Add a brand first" body="Add a brand and run an audit — every gap becomes a prioritized fix here." href="/brands" cta="Go to Brands →" />}
      {state === "no-plan" && <Empty title="No fixes yet" body="Run an audit and generate your plan — the highest-impact fixes will land here, ready to act on." href="/brands" cta="Open your brand →" />}

      {state === "ready" && (
        <section style={{ display: "grid", gap: "var(--space-4)", marginTop: "var(--space-8)" }}>
          {ordered.map((t) => {
            const closed = t.status === "done" || t.status === "rejected";
            return (
              <article key={t.id} style={{ padding: "var(--space-5)", borderRadius: "var(--radius-lg)", border: "1px solid var(--color-border)", background: "var(--color-surface)", boxShadow: "var(--shadow-card)", opacity: closed ? 0.6 : 1 }}>
                <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: "var(--space-4)", alignItems: "start" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", alignItems: "center", marginBottom: "var(--space-2)" }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.6rem", textTransform: "uppercase", letterSpacing: "0.08em", padding: "2px 6px", borderRadius: "var(--radius-sm)", background: "var(--color-badge-ai-bg)", color: "var(--color-accent-ink)" }}>{t.vector}</span>
                      <Badge label={`${t.impact} impact`} color={levelColor(t.impact)} />
                      <Badge label={`${t.effort} effort`} color={levelColor(t.effort)} />
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.6rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-muted)" }}>{STATUS_LABEL[t.status] ?? t.status}</span>
                      {!closed && (() => {
                        const due = dueMeta(t.due_date);
                        return due ? (
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.6rem", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700, color: due.color }}>
                            ◷ {due.label}
                          </span>
                        ) : null;
                      })()}
                    </div>
                    <h2 style={{ margin: 0, fontSize: "var(--font-size-h3)", fontWeight: 800 }}>{t.action}</h2>
                    <p style={{ margin: "var(--space-2) 0 0", color: "var(--color-muted)", lineHeight: 1.55, fontSize: "var(--font-size-body-sm)" }}>
                      <strong style={{ color: "var(--color-text)" }}>Gap:</strong> {t.gap}
                    </p>
                    {t.evidence && <p style={{ margin: "var(--space-1) 0 0", color: "var(--color-muted)", lineHeight: 1.5, fontSize: "var(--font-size-caption)" }}>{t.evidence}</p>}
                    {t.landing_site_id && (
                      <a
                        href={`/landing-pages/${t.landing_site_id}`}
                        style={{ display: "inline-block", marginTop: "var(--space-2)", color: "var(--color-primary)", fontWeight: 700, fontSize: "var(--font-size-caption)", textDecoration: "none" }}
                      >
                        Apply via site rebuild →
                      </a>
                    )}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", alignItems: "stretch" }}>
                    {t.status !== "done" && (
                      <button onClick={() => setStatus(t.id, "done")} disabled={busyId === t.id} style={ghostBtn}>Mark done</button>
                    )}
                    {t.status === "proposed" && (
                      <button onClick={() => setStatus(t.id, "accepted")} disabled={busyId === t.id} style={ghostBtn}>Accept</button>
                    )}
                    {!closed && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.56rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-muted)" }}>
                          Schedule fix
                        </span>
                        <input
                          type="date"
                          value={t.due_date ? t.due_date.slice(0, 10) : ""}
                          disabled={busyId === t.id}
                          onChange={(e) => setDueDate(t.id, e.target.value ? new Date(e.target.value).toISOString() : null)}
                          aria-label={`Set a due date for: ${t.action}`}
                          style={dateInput}
                        />
                        {t.due_date && (
                          <button onClick={() => setDueDate(t.id, null)} disabled={busyId === t.id} style={clearBtn}>
                            Clear date
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: "var(--font-mono)", fontSize: "0.6rem", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-muted)" }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, display: "inline-block" }} aria-hidden="true" />
      {label}
    </span>
  );
}

function Empty({ title, body, href, cta }: { title: string; body: string; href?: string; cta?: string }) {
  return (
    <div style={{ marginTop: "var(--space-8)", background: "var(--color-surface)", border: "1px dashed var(--color-border)", borderRadius: "var(--radius-lg)", padding: "var(--space-8)", textAlign: "center" }}>
      <h2 style={{ fontSize: "var(--font-size-h3)", fontWeight: 800, margin: "0 0 var(--space-2)" }}>{title}</h2>
      <p style={{ color: "var(--color-muted)", lineHeight: 1.6, margin: "0 auto", maxWidth: "440px" }}>{body}</p>
      {href && cta && (
        <a href={href} style={{ display: "inline-flex", marginTop: "var(--space-4)", height: "44px", alignItems: "center", padding: "0 var(--space-5)", background: "var(--color-primary)", color: "#fff", borderRadius: "var(--radius-md)", fontWeight: 700, fontSize: "var(--font-size-body-sm)", textDecoration: "none" }}>{cta}</a>
      )}
    </div>
  );
}

const ghostBtn: React.CSSProperties = {
  height: "38px", padding: "0 var(--space-4)", background: "transparent", color: "var(--color-primary)",
  border: "1.5px solid var(--color-primary)", borderRadius: "var(--radius-md)", fontWeight: 700,
  fontSize: "var(--font-size-caption)", cursor: "pointer", whiteSpace: "nowrap",
};
const dateInput: React.CSSProperties = {
  height: "38px", padding: "0 var(--space-3)", background: "var(--color-surface-muted)",
  color: "var(--color-text)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)",
  fontSize: "var(--font-size-caption)", fontFamily: "var(--font-family)", colorScheme: "light dark",
};
const clearBtn: React.CSSProperties = {
  background: "none", border: "none", padding: 0, color: "var(--color-muted)",
  fontSize: "var(--font-size-caption)", cursor: "pointer", textAlign: "left",
};
