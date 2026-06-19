/**
 * queue-payload-pii.test.ts — GEO-SEC-3 (Gate 3→4 security condition)
 *
 * Architecture asserts BullMQ job payloads carry ONLY opaque IDs + region —
 * no PII, no prompt text, no secrets. This regression test scans every
 * `queue.add(` call site in api+worker source and fails if a payload ever
 * gains a forbidden field. (There are no per-provider child jobs: provider
 * fan-out is in-process in the gateway, not enqueued.)
 *
 * Same grep-test pattern as no-token-leak.test.ts.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["apps/api/src", "apps/worker/src"];

// Fields that must NEVER appear in a queue payload.
const FORBIDDEN_PAYLOAD_FIELDS = [
  "email", "name:", "first_name", "last_name", "phone",
  "prompt", "query_text", "queryText", "content:", "body:", "draft",
  "token", "api_key", "apiKey", "password", "secret",
];

function tsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (entry === "node_modules" || entry === "dist") continue;
      out.push(...tsFiles(p));
    } else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) {
      out.push(p);
    }
  }
  return out;
}

/** Extract the payload object literal passed as the 2nd arg of queue .add( calls. */
function extractAddPayloads(source: string): string[] {
  const payloads: string[] = [];
  const re = /\.add\(\s*["'][^"']+["']\s*,\s*(\{[\s\S]*?\})\s*[,)]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    if (m[1]) payloads.push(m[1]);
  }
  return payloads;
}

describe("BullMQ queue payloads — IDs + region only (GEO-SEC-3)", () => {
  const allPayloads: Array<{ file: string; payload: string }> = [];

  for (const root of ROOTS) {
    for (const file of tsFiles(root)) {
      const src = readFileSync(file, "utf8");
      for (const payload of extractAddPayloads(src)) {
        allPayloads.push({ file, payload });
      }
    }
  }

  it("finds the known queue.add call sites (test self-check)", () => {
    // If this drops to 0 the extraction regex broke — fail loudly rather than
    // silently passing with no coverage.
    expect(allPayloads.length).toBeGreaterThanOrEqual(3);
  });

  it("no queue payload contains PII, prompt text, or secrets", () => {
    const violations: string[] = [];
    for (const { file, payload } of allPayloads) {
      for (const field of FORBIDDEN_PAYLOAD_FIELDS) {
        if (payload.toLowerCase().includes(field.toLowerCase())) {
          violations.push(`${file}: payload contains forbidden field "${field}" → ${payload.slice(0, 120)}`);
        }
      }
    }
    expect(violations, violations.join("\n")).toEqual([]);
  });

  it("every payload field is an opaque id, region, or job reference", () => {
    const ALLOWED = /^(audit_id|tenant_id|brand_id|region|publish_job_id)$/;
    const violations: string[] = [];
    for (const { file, payload } of allPayloads) {
      // Extract object keys (identifier followed by ':').
      const keys = Array.from(payload.matchAll(/([A-Za-z_][A-Za-z0-9_]*)\s*:/g), (m) => m[1] ?? "");
      for (const key of keys) {
        if (key && !ALLOWED.test(key)) {
          violations.push(`${file}: unexpected payload key "${key}"`);
        }
      }
    }
    expect(violations, violations.join("\n")).toEqual([]);
  });
});
