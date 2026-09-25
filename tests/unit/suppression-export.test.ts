/**
 * suppression-export.test.ts — C06 / P11 (25/09).
 *
 * A STOP must survive a list bought next week. The CRM exports every
 * never-again address as a sha256 digest; the loader hashes candidates the
 * same way and drops matches. These tests pin: the union of the two sources,
 * dedup across them, the normalization, that no plaintext address is in the
 * export, and that the operator endpoint serves it on the PII-free tier.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { Hono } from "hono";
import { createHash } from "node:crypto";
import { buildSuppressionExport, hashEmail, normalizeEmail, SUPPRESSION_HASH_ALGORITHM } from "../../apps/api/src/lib/suppression-export";
import { registerApiKeyRoutes } from "../../apps/api/src/routes/api-keys";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

const ROWS = [
  { email: "stop@roofer.test", src: "crm" },
  { email: "stop@roofer.test", src: "provider" }, // same person, both sources → one digest
  { email: "bounced@hvac.test", src: "provider" },
  { email: "  Unsub@Plumber.TEST ", src: "crm" }, // already lowered by SQL in prod; normalized again here
  { email: "not-an-email", src: "crm" },
];

function db(rows = ROWS) {
  return {
    setTenantId: async () => {},
    async query(sql: string) {
      if (sql.includes("FROM api_key")) {
        return { rows: [{ id: "k", tenant_id: "t", scopes: ["operator"], revoked_at: null }] };
      }
      if (sql.includes("crm_contact") && sql.includes("smartlead_event")) return { rows };
      return { rows: [] };
    },
  };
}

describe("suppression export — digests, never addresses", () => {
  it("normalizes and hashes exactly one way", () => {
    expect(normalizeEmail("  Unsub@Plumber.TEST ")).toBe("unsub@plumber.test");
    expect(normalizeEmail("nope")).toBeNull();
    expect(hashEmail("  Unsub@Plumber.TEST ")).toBe(sha("unsub@plumber.test"));
    expect(hashEmail("")).toBeNull();
  });

  it("unions CRM lost and provider unsubscribes/bounces, dedups across sources, skips non-addresses", async () => {
    const out = await buildSuppressionExport(db(), new Date("2026-09-25T12:00:00Z"));
    expect(out.algorithm).toBe(SUPPRESSION_HASH_ALGORITHM);
    expect(out.count).toBe(3);
    expect(out.hashes).toEqual([sha("bounced@hvac.test"), sha("stop@roofer.test"), sha("unsub@plumber.test")].sort());
    expect(out.sources).toEqual({ crm_lost: 2, provider_unsubscribed_or_bounced: 2 });
    expect(JSON.stringify(out)).not.toMatch(/@/);
  });
});

describe("GET /api/v1/operator/crm/suppression", () => {
  const originalEnv = process.env;
  beforeEach(() => {
    process.env = { ...originalEnv, NODE_ENV: "test", UPSTASH_REDIS_REST_URL: "", UPSTASH_REDIS_REST_TOKEN: "" };
  });

  it("401 without an operator key", async () => {
    const app = new Hono();
    registerApiKeyRoutes(app, db() as never);
    const res = await app.request("/api/v1/operator/crm/suppression");
    expect(res.status).toBe(401);
  });

  it("200 with the operator tier: digests and counts, no plaintext", async () => {
    const app = new Hono();
    registerApiKeyRoutes(app, db() as never);
    const res = await app.request("/api/v1/operator/crm/suppression", { headers: { Authorization: "Bearer ozk_live_operator" } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { count: number; hashes: string[] };
    expect(body.count).toBe(3);
    expect(body.hashes).toContain(sha("stop@roofer.test"));
    expect(JSON.stringify(body)).not.toMatch(/@/);
  });
});

describe("campaigns_v4.py crm-filter — the loader hashes the same way and drops matches", () => {
  const SCRIPT = join(__dirname, "../../scripts/smartlead/campaigns_v4.py");
  it("drops the STOP, keeps the rest, digest identical to the API's", () => {
    const r = spawnSync("python3", [SCRIPT, "crm-filter"], {
      encoding: "utf8",
      input: JSON.stringify({ emails: ["Stop@Roofer.TEST", "new@lead.test", ""], digests: [sha("stop@roofer.test")] }),
    });
    expect(r.status, r.stderr).toBe(0);
    const out = JSON.parse(r.stdout) as { keep: number[]; dropped: number; digest_of_first: string };
    expect(out).toMatchObject({ keep: [1, 2], dropped: 1 });
    expect(out.digest_of_first).toBe(hashEmail("Stop@Roofer.TEST"));
  });
});
