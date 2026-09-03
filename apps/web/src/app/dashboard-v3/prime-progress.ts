/**
 * prime-progress.ts — pure logic for the OrganicPosts progress panel.
 *
 * Framework-free by convention (no JSX, no DOM) so it can be unit-tested by the
 * root vitest config, which runs in a node environment. See
 * tests/unit/prime-action-cards.test.ts.
 */

export interface ActionCardsProgress {
  actionCardsDone: number;
  /** Tasks in the brand's LATEST plan, excluding rejected. Null = no plan yet. */
  actionCardsTotal: number | null;
}

export interface ProgressRow {
  label: string;
  done: boolean;
  detail: string;
}

/**
 * The "action cards done" progress row.
 *
 * P0-03 / R12: the denominator used to be hard-coded to 3 in the UI while the
 * Do Next tab listed 5, and the count behind it was taken across every plan the
 * brand had ever had rather than the current one. The same workspace therefore
 * read "3 of 3" — complete — on this screen and "3 of 5" on the other. The
 * total now travels from /api/prime/status, computed by the same query shape as
 * deriveExecutionProgress (apps/api/src/routes/audits.ts), so there is one
 * denominator in the product.
 */
export function actionCardsRow(status: ActionCardsProgress): ProgressRow {
  const total = status.actionCardsTotal;
  const done = status.actionCardsDone;
  if (total == null) {
    return { label: "Action cards done", done: false, detail: "no plan yet" };
  }
  return {
    label: "Action cards done",
    // "Done" is every card in the plan, not an arbitrary quota of three.
    done: done >= total,
    // Clamped so a stale count can never render "7 of 5".
    detail: `${Math.min(done, total)} of ${total}`,
  };
}
