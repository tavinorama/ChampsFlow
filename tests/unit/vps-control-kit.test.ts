/**
 * vps-control-kit.test.ts — 29/09. The founder cannot see or control what runs
 * on the VPS. The kit in ops/vps gives him a read-only inventory and a way to
 * put the server code under git. These tests pin the two promises that make
 * the kit safe to run on a production machine: the inventory changes nothing
 * and prints no secret value; the collector refuses to stage a secret. And
 * they pin the reference handler of the Postiz status route to its contract.
 */
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
// @ts-expect-error — plain ESM reference implementation, no types on purpose
import { mapPostizPost, resolvePostizStatus, listWindow } from "../../ops/hermes/postiz-status.mjs";

const root = join(__dirname, "../..");
const INV = readFileSync(join(root, "ops/vps/inventory.sh"), "utf8");
const COL = readFileSync(join(root, "ops/vps/collect-source.sh"), "utf8");
const code = (s: string) => s.split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");

describe("inventory.sh — read-only and secret-free by construction", () => {
  it("parses as bash", () => {
    for (const f of ["inventory.sh", "collect-source.sh"]) {
      expect(spawnSync("bash", ["-n", join(root, "ops/vps", f)]).status, f).toBe(0);
    }
  });
  it("contains no command that changes the machine", () => {
    // Command position only: start of line, or after ; & | ( — a word inside a
    // label ("reboot required") or a path (/etc/passwd) is not a command.
    const forbidden = /(^|[;&|(]\s*)\s*(sudo\s+)?(rm|mv|cp|chmod|chown|tee|truncate|kill|pkill|reboot|shutdown|apt(-get)? (install|upgrade|remove)|npm (i|install)|systemctl (start|stop|restart|enable|disable|daemon-reload)|crontab -r|crontab -e|ufw (allow|deny|enable|disable)|useradd|usermod|passwd)\b/;
    const hits = code(INV).split("\n").filter((l) => forbidden.test(l));
    expect(hits).toEqual([]);
    expect(code(INV)).not.toMatch(/(^|\s)>{1,2}\s*\/(?!dev\/null)[A-Za-z]/m); // no redirect to a file
  });
  it("reads env files only through key_names(), which drops the values", () => {
    const envLines = code(INV).split("\n").filter((l) => /\.env\b/.test(l) && !/key_names|stat -c|for f in/.test(l));
    expect(envLines).toEqual([]);
    const body = INV.slice(INV.indexOf("key_names() {"), INV.indexOf("fingerprint() {"));
    expect(body).toContain("sed -n -E");
    expect(body).toContain("=.*/  \\2/p"); // keeps group 2 (the name), drops everything after "="
    expect(body).not.toMatch(/\b(cat|head|tail|less|more)\s+"\$1"/);
  });
  it("key_names and redact behave: names only, tokens masked", () => {
    const dir = mkdtempSync(join(tmpdir(), "inv-"));
    const env = join(dir, "x.env");
    writeFileSync(env, "HERMES_TASK_TOKEN=abcdef0123456789abcdef0123456789abcdef01\nexport POSTIZ_API_KEY=zzz\n# c\nbroken line\n");
    const fns = INV.slice(INV.indexOf("redact() {"), INV.indexOf("fingerprint() {"));
    const r = spawnSync("bash", ["-c", `${fns}\nkey_names "${env}"; echo 'curl -H "Authorization: Bearer sk-live-SECRETSECRET" x token=hunter2hunter2' | redact`], { encoding: "utf8" });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain("HERMES_TASK_TOKEN");
    expect(r.stdout).toContain("POSTIZ_API_KEY");
    expect(r.stdout).toContain("not KEY=VALUE, comment or blank: 1");
    expect(r.stdout).not.toMatch(/abcdef0123456789|zzz|SECRETSECRET|hunter2/);
  });
  it("refuses to run without a terminal unless forced", () => {
    const r = spawnSync("bash", [join(root, "ops/vps/inventory.sh")], { encoding: "utf8", input: "" });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("agent prompt");
  });
});

describe("collect-source.sh — code only, a secret blocks the hand-over", () => {
  it("never copies an env file and writes only inside the staging folder", () => {
    expect(code(COL)).not.toMatch(/copy\s+\S*\.env/);
    const writes = code(COL).split("\n").filter((l) => /(^|\s)(cp|mkdir|cat >|sort -u -o|>>?)\s/.test(l));
    for (const l of writes) expect(l, l).toMatch(/\$STAGE|\$2|\/dev\/null|\$hits/);
  });
  it("prints file and line of a suspected secret, never the match", () => {
    expect(COL).toContain("cut -d: -f1,2");
    expect(COL).toContain("exit 3");
  });
});

describe("postiz-status.mjs — the route the worker calls, to its contract", () => {
  const now = new Date("2026-09-29T06:00:00Z");
  const posts = [
    { id: "cmA", state: "PUBLISHED", releaseURL: "https://www.linkedin.com/feed/update/urn:li:share:1" },
    { id: "cmB", state: "QUEUE", releaseURL: "" },
    { id: "cmC", state: "ERROR", releaseURL: null },
    { id: "cmD", state: "PUBLISHED", releaseURL: "javascript:alert(1)" },
  ];
  const ok = (body: unknown, status = 200) => async () => ({ ok: status < 400, status, json: async () => body });

  it("maps Postiz states; a URL is returned only for a published https link", () => {
    expect(mapPostizPost(posts[0])).toEqual({ ok: true, state: "published", url: posts[0]!.releaseURL });
    expect(mapPostizPost(posts[1])).toEqual({ ok: true, state: "queued", url: null });
    expect(mapPostizPost(posts[2])).toEqual({ ok: true, state: "error", url: null });
    expect(mapPostizPost(posts[3])).toEqual({ ok: true, state: "published", url: null });
    expect(mapPostizPost({ state: "SOMETHING_NEW" }).state).toBe("queued");
  });
  it("lists a window that covers the worker's 72 h and finds the id", async () => {
    const w = listWindow(now);
    expect(w.start).toBe("2026-09-25T06:00:00.000Z");
    expect(w.end).toBe("2026-09-30T06:00:00.000Z");
    let asked = "";
    let auth = "";
    const f = async (u: string, init: { headers: Record<string, string> }) => {
      asked = u;
      auth = init.headers["Authorization"]!;
      return { ok: true, status: 200, json: async () => ({ posts }) };
    };
    const r = await resolvePostizStatus("cmA", { apiKey: "k", fetchImpl: f, now });
    expect(r).toEqual({ status: 200, body: { ok: true, state: "published", url: posts[0]!.releaseURL } });
    expect(asked).toContain("/public/v1/posts?startDate=2026-09-25");
    expect(auth).toBe("k"); // raw key, no Bearer
  });
  it("not found is 404; bad id 400; missing key 503; Postiz failures are 502 with a cause", async () => {
    expect((await resolvePostizStatus("nope", { apiKey: "k", fetchImpl: ok({ posts }), now })).status).toBe(404);
    expect((await resolvePostizStatus("a b;rm", { apiKey: "k", fetchImpl: ok({ posts }), now })).status).toBe(400);
    expect((await resolvePostizStatus("cmA", { apiKey: "", fetchImpl: ok({ posts }), now })).status).toBe(503);
    expect(await resolvePostizStatus("cmA", { apiKey: "k", fetchImpl: ok({}, 401), now })).toEqual({ status: 502, body: { ok: false, error: "postiz_auth" } });
    expect((await resolvePostizStatus("cmA", { apiKey: "k", fetchImpl: ok({ nope: 1 }), now })).body.error).toBe("postiz_bad_payload");
    const boom = async () => { throw Object.assign(new Error("x"), { name: "TimeoutError" }); };
    expect((await resolvePostizStatus("cmA", { apiKey: "k", fetchImpl: boom, now })).body.error).toBe("postiz_unreachable:TimeoutError");
  });
});
