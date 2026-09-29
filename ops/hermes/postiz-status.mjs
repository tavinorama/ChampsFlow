// ops/hermes/postiz-status.mjs — reference implementation of the route the
// worker calls: GET /postiz-post/:id  (contract: POSTIZ-POST-STATUS.md).
//
// Zero dependencies, same style as hermes-task-server.mjs. Postiz's public API
// has NO "get one post" endpoint (checked on docs.postiz.com, 29/09/2026):
// the only read is GET /public/v1/posts?startDate&endDate, which returns
// { posts: [{ id, publishDate, releaseURL, state, integration }] } with
// state in QUEUE | PUBLISHED | ERROR | DRAFT. So this handler lists a window
// and finds the id. Pure functions are exported for the tests in the repo.

export const POSTIZ_BASE = "https://api.postiz.com/public/v1";
const ID_RE = /^[A-Za-z0-9_-]{1,48}$/;
const STATE = { QUEUE: "queued", DRAFT: "queued", PUBLISHED: "published", ERROR: "error" };

/** Map one Postiz post to the contract. Unknown state → queued (asked again). */
export function mapPostizPost(post) {
  const state = STATE[String(post?.state ?? "").toUpperCase()] ?? "queued";
  const raw = typeof post?.releaseURL === "string" ? post.releaseURL.trim() : "";
  const url = state === "published" && /^https:\/\/[^\s"'<>]+$/.test(raw) ? raw.slice(0, 300) : null;
  return { ok: true, state, url };
}

/** The list window: from 4 days back to 1 day ahead covers the worker's 72 h. */
export function listWindow(now = new Date()) {
  const start = new Date(now.getTime() - 4 * 86_400_000).toISOString();
  const end = new Date(now.getTime() + 1 * 86_400_000).toISOString();
  return { start, end };
}

/**
 * Resolve one id. Returns { status, body } ready to write to the response.
 * `fetchImpl` is injectable; `apiKey` is sent raw (Postiz takes no "Bearer").
 */
export async function resolvePostizStatus(id, { apiKey, fetchImpl = fetch, now = new Date() }) {
  if (!ID_RE.test(String(id ?? ""))) return { status: 400, body: { ok: false, error: "bad_id" } };
  if (!apiKey) return { status: 503, body: { ok: false, error: "postiz_key_missing" } };
  const { start, end } = listWindow(now);
  let res;
  try {
    res = await fetchImpl(`${POSTIZ_BASE}/posts?startDate=${encodeURIComponent(start)}&endDate=${encodeURIComponent(end)}`, {
      headers: { Authorization: apiKey, Accept: "application/json" },
    });
  } catch (err) {
    return { status: 502, body: { ok: false, error: `postiz_unreachable:${String(err?.name ?? "error")}` } };
  }
  if (res.status === 401 || res.status === 403) return { status: 502, body: { ok: false, error: "postiz_auth" } };
  if (!res.ok) return { status: 502, body: { ok: false, error: `postiz_http_${res.status}` } };
  let data;
  try {
    data = await res.json();
  } catch {
    return { status: 502, body: { ok: false, error: "postiz_bad_payload" } };
  }
  const posts = Array.isArray(data?.posts) ? data.posts : Array.isArray(data) ? data : null;
  if (!posts) return { status: 502, body: { ok: false, error: "postiz_bad_payload" } };
  const hit = posts.find((p) => String(p?.id) === String(id));
  if (!hit) return { status: 404, body: { ok: false, error: "not_found" } };
  return { status: 200, body: mapPostizPost(hit) };
}

/*
 * Wiring inside hermes-task-server.mjs (after the bearer check, next to
 * /postiz-schedule). Four lines; nothing else changes:
 *
 *   import { resolvePostizStatus } from "./postiz-status.mjs";
 *   ...
 *   const m = /^\/postiz-post\/([^/?#]+)$/.exec(url.pathname);
 *   if (req.method === "GET" && m) {
 *     const r = await resolvePostizStatus(decodeURIComponent(m[1]), { apiKey: process.env.POSTIZ_API_KEY });
 *     res.writeHead(r.status, { "content-type": "application/json" });
 *     return res.end(JSON.stringify(r.body));
 *   }
 */
