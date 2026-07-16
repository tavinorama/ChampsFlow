import { redirect } from "next/navigation";

/**
 * /dashboard — retired in favour of the v3 shell.
 *
 * The live dashboard is now /dashboard-v3: native tabs (Overview, Do next,
 * Content, Competitors, Sources, Ozvor Pages, Connections, Billing), real
 * data, the competitor comparison chart, avatar, and native Google / Pages —
 * all on one fit-to-viewport surface, no old chrome.
 *
 * This route redirects there so every existing link (sidebar, post-login
 * default, bookmarks) lands on the live dashboard. Auth is enforced by the
 * middleware before this runs. The prior client hub remains in git history.
 */
export default function DashboardRedirect() {
  redirect("/dashboard-v3");
}
