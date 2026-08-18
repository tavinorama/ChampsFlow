/**
 * Ozvor MCP tool catalog (#150 Phase 1) — the safety invariants, pinned.
 *
 * The MCP route dispatches every tool as a sub-request through a wrapped
 * /api/v1 route, so the catalog itself carries the guarantees: no tool holds a
 * db client, scope gating is total, the retired "trustindex" name never
 * reaches output, and the wrapped paths are exactly the audited read routes.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  MCP_TOOLS,
  MCP_TOOLS_BY_NAME,
  toolsForScopes,
  MCP_SERVER_INFO,
} from "../../apps/api/src/lib/mcp-tools";

describe("the MCP layer never touches the database (design §4.1)", () => {
  it("neither the catalog nor the route ever issues SQL", () => {
    for (const rel of ["../../apps/api/src/lib/mcp-tools.ts", "../../apps/api/src/routes/mcp.ts"]) {
      const src = readFileSync(join(__dirname, rel), "utf8");
      expect(src, `${rel} must not query`).not.toMatch(/\.query\(/);
    }
  });

  it("the tool catalog holds no db reference at all — data comes only via wrapped routes", () => {
    // mcp.ts legitimately forwards a db handle to the OUTER requireApiKey guard
    // (it never queries); the catalog must not even import one.
    const catalog = readFileSync(join(__dirname, "../../apps/api/src/lib/mcp-tools.ts"), "utf8");
    expect(catalog).not.toMatch(/db-client|PostgresClient|runWithTenant|postgres/);
  });
});

describe("scope gating is total (design §3.2)", () => {
  it("no key without 'mcp' sees any tool, whatever else it holds", () => {
    expect(toolsForScopes([])).toEqual([]);
    expect(toolsForScopes(["read"])).toEqual([]);
    expect(toolsForScopes(["read", "operator", "business"])).toEqual([]);
  });

  it("an mcp+read key sees exactly the five Phase 1 read tools, no operator tools", () => {
    const names = toolsForScopes(["mcp", "read"]).map((t) => t.name).sort();
    expect(names).toEqual([
      "ozvor_get_audit",
      "ozvor_get_brand",
      "ozvor_list_audits",
      "ozvor_list_brands",
      "ozvor_whoami",
    ]);
  });

  it("every tool declares a scope that is one of the allowed tiers", () => {
    for (const t of MCP_TOOLS) expect(["read", "operator"]).toContain(t.scope);
  });

  it("business-scoped data is never exposed as a tool (lead emails stay HTTP-only)", () => {
    for (const t of MCP_TOOLS) expect(t.scope).not.toBe("business");
    // and no wrapped path reaches the business surface
    for (const t of MCP_TOOLS) {
      const { path } = t.wrap({ brand_id: "x", audit_id: "x" });
      expect(path).not.toMatch(/leads|kit-orders|opportunities|nurture|crm/);
    }
  });
});

describe("wrapped paths are exactly the audited read routes", () => {
  it("every tool wraps a GET on /api/v1, never a write or an operator path in Phase 1", () => {
    for (const t of MCP_TOOLS) {
      const { method, path } = t.wrap({ brand_id: "b", audit_id: "a", limit: 5 });
      expect(method).toBe("GET");
      expect(path.startsWith("/api/v1/")).toBe(true);
      expect(path).not.toMatch(/operator/);
    }
  });

  it("ids are URL-encoded into the path (no injection of a second query/segment)", () => {
    const t = MCP_TOOLS_BY_NAME.get("ozvor_get_brand")!;
    const { path } = t.wrap({ brand_id: "a/../../etc?x=1" });
    expect(path).toBe("/api/v1/brands/a%2F..%2F..%2Fetc%3Fx%3D1");
  });
});

describe("the retired brand name never reaches output (CLAUDE.md rebrand rule)", () => {
  it("ozvor_get_audit renames trustindex_score to overall_score", () => {
    const t = MCP_TOOLS_BY_NAME.get("ozvor_get_audit")!;
    const shaped = t.shape!({ id: "a", trustindex_score: 87, score_ai: 80 }) as Record<string, unknown>;
    expect(shaped).not.toHaveProperty("trustindex_score");
    expect(shaped.overall_score).toBe(87);
  });

  it("ozvor_list_audits renames it inside every row", () => {
    const t = MCP_TOOLS_BY_NAME.get("ozvor_list_audits")!;
    const shaped = t.shape!({ data: [{ id: "1", trustindex_score: 50 }, { id: "2", trustindex_score: 60 }] }) as {
      data: Record<string, unknown>[];
    };
    for (const row of shaped.data) {
      expect(row).not.toHaveProperty("trustindex_score");
      expect(row).toHaveProperty("overall_score");
    }
  });
});

describe("descriptions are prescriptive — they say WHEN to call", () => {
  it("every tool description contains a 'Call this' trigger", () => {
    for (const t of MCP_TOOLS) expect(t.description.toLowerCase()).toContain("call ");
  });

  it("server identity is the Ozvor brand", () => {
    expect(MCP_SERVER_INFO.name).toBe("ozvor");
  });
});
