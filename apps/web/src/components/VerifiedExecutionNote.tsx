"use client";

/**
 * VerifiedExecutionNote — the one place we explain what Verified Execution
 * means, and why the number moved (audit P0-02).
 *
 * THE PROBLEM THIS SOLVES
 * The old "Execution" number counted ticked checkboxes. A client whose audit
 * was failing could see Execution 100 — and one did. We changed it to count
 * only fixes a later audit re-checked and found working. For an existing
 * client that turns 100 into something close to 0 overnight.
 *
 * A number that falls 100 points with no explanation reads as a broken product,
 * and the client's first instinct is that we lost their work. So this note
 * exists to say, in their words: nothing was lost, we changed what we are
 * willing to claim, here is what each state means, and here is what happens
 * next. It promises nothing about their score.
 *
 * Copy standard: short sentences, plain words, no jargon, no em-dash pileups,
 * no "we're excited to announce". It also never says "improved" — from the
 * client's side this is a number going down, and calling that an improvement
 * is the kind of spin the whole change exists to stop.
 *
 * Silent when there is nothing to explain (no plan yet and nothing claimed).
 */

export interface ExecutionData {
  verifiedPct: number | null;
  selfReportedPct: number | null;
  counts: {
    total: number;
    denominator: number;
    verified: number;
    inFlight: number;
    selfReported: number;
    open: number;
    notOwed: number;
  };
  unavailableReason: "no_plan" | "no_tasks" | "migration_pending" | "read_failed" | null;
  measurable: boolean;
}

const wrap: React.CSSProperties = {
  marginTop: "var(--space-3)",
  padding: "var(--space-4)",
  borderRadius: "var(--radius-md, 10px)",
  border: "1px solid var(--color-border)",
  background: "var(--color-surface-subtle, #f8fafc)",
};
const h: React.CSSProperties = {
  margin: "0 0 var(--space-2)",
  fontSize: "var(--font-size-body-sm)",
  fontWeight: 600,
};
const p: React.CSSProperties = {
  margin: "0 0 var(--space-2)",
  fontSize: "0.8125rem",
  lineHeight: 1.6,
  color: "var(--color-muted)",
};
const list: React.CSSProperties = {
  margin: "0 0 var(--space-2)",
  paddingLeft: "1.1rem",
  fontSize: "0.8125rem",
  lineHeight: 1.6,
  color: "var(--color-muted)",
};

export function VerifiedExecutionNote({ execution }: { execution?: ExecutionData | null }) {
  if (!execution) return null;
  const { counts, verifiedPct, selfReportedPct, unavailableReason } = execution;
  if (counts.total === 0 && unavailableReason !== "read_failed") return null;

  // We could not read it. Say so. An unreadable number is not a zero.
  if (unavailableReason === "read_failed") {
    return (
      <div style={wrap}>
        <p style={{ ...h, color: "var(--color-text)" }}>We could not read your fix list</p>
        <p style={p}>
          This number is missing because we could not load your fixes, not
          because nothing is done. We can see the problem on our side and are on
          it. Nothing you have marked has been lost.
        </p>
      </div>
    );
  }

  // Schema not in place yet. Withhold the number rather than print a 0 the
  // client would read as failure.
  if (unavailableReason === "migration_pending") {
    return (
      <div style={wrap}>
        <p style={{ ...h, color: "var(--color-text)" }}>Verified Execution starts after your next audit</p>
        <p style={p}>
          We are switching this from &ldquo;what you told us you did&rdquo; to
          &ldquo;what we checked and found working&rdquo;. Until the first check
          runs we are leaving it blank rather than showing you a number we
          cannot stand behind. Your fixes are all still here.
        </p>
      </div>
    );
  }

  const claimed = counts.selfReported;
  const dropped = claimed > 0 && (verifiedPct ?? 0) < (selfReportedPct ?? 0);

  return (
    <div style={wrap}>
      <p style={{ ...h, color: "var(--color-text)" }}>What Verified Execution counts</p>

      <p style={p}>
        A fix counts here once we run the questions again and see the change in
        the AI answers. Not when it is ticked off. Ticking a box tells us you
        did it. The next audit tells us whether it worked.
      </p>

      {dropped && (
        <>
          <p style={{ ...p, color: "var(--color-text)" }}>
            <b>Why this number dropped.</b> It used to count ticked boxes, so it
            could read 100% while your visibility was flat. That was not useful
            to you. It now counts only fixes we have re-checked. Nothing was
            deleted, and nothing you did was undone. We changed what we are
            willing to claim on your behalf.
          </p>
          <p style={p}>
            {claimed} {claimed === 1 ? "fix is" : "fixes are"} marked done by you
            and waiting to be checked. They move into this number on their own if
            the next audit finds the change. If it does not, they come back onto
            your list with what we saw.
          </p>
        </>
      )}

      <ul style={list}>
        <li>
          <b>{counts.verified} verified</b> — we looked again and the AI answers
          changed.
        </li>
        <li>
          <b>{counts.inFlight} published, not yet checked</b> — the work is live
          and the next audit will look for it.
        </li>
        <li>
          <b>{claimed} marked done by you</b> — your word, not yet checked by us.
        </li>
        <li>
          <b>{counts.open} still open</b> — including anything that slipped back.
        </li>
      </ul>

      <p style={{ ...p, margin: 0 }}>
        The maths: {counts.verified} verified out of {counts.denominator} fixes
        we owe you{counts.notOwed > 0 ? ` (${counts.notOwed} you turned down or that expired are left out)` : ""}.
        {verifiedPct !== null ? ` That is ${verifiedPct}%.` : ""}
      </p>
    </div>
  );
}
