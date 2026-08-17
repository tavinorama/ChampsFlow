/**
 * mcp-tools.ts — the Ozvor MCP tool catalog (#150, design docs/design-mcp-server.md).
 *
 * DATA, not behaviour. Each entry names the tool, the scope it needs, the JSON
 * Schema the host validates against, and — the whole trick — the internal
 * /api/v1 route it wraps. The MCP route (routes/mcp.ts) dispatches every call
 * as a sub-request through that route, so no tool body ever touches the
 * database and RLS cannot be bypassed by construction (design §4.1).
 *
 * This module MUST NOT import a db client. If a tool needs data no /api/v1
 * route exposes, the fix is a new route behind requireApiKey, never a query
 * here. Descriptions are prescriptive (they say WHEN to call) — that measurably
 * raises the model's should-call accuracy.
 */

export interface McpTool {
  name: string;
  description: string;
  /** The scope, beyond "mcp", the key must carry to see AND call this tool. */
  scope: "read" | "operator";
  inputSchema: Record<string, unknown>;
  /**
   * Build the internal request the route dispatcher runs. Returns the method
   * and path (relative, e.g. "/api/v1/brands/<uuid>"); query building and
   * output reshaping live in the route. Args are already schema-validated.
   */
  wrap: (args: Record<string, unknown>) => { method: "GET"; path: string };
  /**
   * Reshape the wrapped route's JSON before it reaches the model. Retire the
   * "trustindex" brand name here (CLAUDE.md rebrand rule); default is identity.
   */
  shape?: (body: unknown) => unknown;
}

const uuidSchema = (desc: string) => ({
  type: "string",
  format: "uuid",
  description: desc,
});

/** Rename the retired "trustindex_score" to "overall_score" wherever it appears. */
function renameTrustindex(row: Record<string, unknown>): Record<string, unknown> {
  if (row && typeof row === "object" && "trustindex_score" in row) {
    const { trustindex_score, ...rest } = row as Record<string, unknown> & { trustindex_score: unknown };
    return { ...rest, overall_score: trustindex_score };
  }
  return row;
}

export const MCP_TOOLS: McpTool[] = [
  {
    name: "ozvor_whoami",
    description:
      "Confirm which Ozvor workspace this API key belongs to, which plan it is on, and which Ozvor tools are available. Call this first when you are unsure whether the Ozvor connection is working, or when the user asks what their Ozvor plan includes.",
    scope: "read",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    wrap: () => ({ method: "GET", path: "/api/v1/me" }),
  },
  {
    name: "ozvor_list_brands",
    description:
      "List every brand tracked in this Ozvor workspace with its latest AI Visibility score (0 to 100). Call this whenever the user refers to a brand by name and you need its Ozvor brand id, or when they ask how their brands are performing in AI search overall.",
    scope: "read",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "integer", minimum: 1, maximum: 50, default: 25, description: "Maximum brands to return." },
      },
      additionalProperties: false,
    },
    wrap: (args) => {
      const limit = typeof args.limit === "number" ? Math.min(50, Math.max(1, Math.round(args.limit))) : 25;
      return { method: "GET", path: `/api/v1/brands?limit=${limit}` };
    },
  },
  {
    name: "ozvor_get_brand",
    description:
      "Get one brand's configuration and its most recent three-score breakdown (Visibility, Citation Readiness, Execution). Call this after ozvor_list_brands when the user asks why a score is what it is, or which AI engines a brand is tracked across.",
    scope: "read",
    inputSchema: {
      type: "object",
      properties: { brand_id: uuidSchema("Ozvor brand id from ozvor_list_brands.") },
      required: ["brand_id"],
      additionalProperties: false,
    },
    wrap: (args) => ({ method: "GET", path: `/api/v1/brands/${encodeURIComponent(String(args.brand_id))}` }),
  },
  {
    name: "ozvor_list_audits",
    description:
      "List recent AI Visibility audits for one brand, newest first, with each audit's status and scores. Call this when the user asks whether a score moved, how a brand is trending, or when the last audit ran.",
    scope: "read",
    inputSchema: {
      type: "object",
      properties: {
        brand_id: uuidSchema("Ozvor brand id from ozvor_list_brands."),
        limit: { type: "integer", minimum: 1, maximum: 50, default: 10, description: "Maximum audits to return." },
      },
      required: ["brand_id"],
      additionalProperties: false,
    },
    wrap: (args) => {
      const limit = typeof args.limit === "number" ? Math.min(50, Math.max(1, Math.round(args.limit))) : 10;
      return { method: "GET", path: `/api/v1/brands/${encodeURIComponent(String(args.brand_id))}/audits?limit=${limit}` };
    },
    shape: (body) => {
      if (body && typeof body === "object" && Array.isArray((body as { data?: unknown }).data)) {
        const b = body as { data: Record<string, unknown>[] };
        return { ...b, data: b.data.map(renameTrustindex) };
      }
      return body;
    },
  },
  {
    name: "ozvor_get_audit",
    description:
      "Get one audit's status and full score breakdown by audit id. Call this to check whether an audit you or the user started has finished, or to compare a specific historical audit against today's numbers.",
    scope: "read",
    inputSchema: {
      type: "object",
      properties: { audit_id: uuidSchema("Ozvor audit id from ozvor_list_audits.") },
      required: ["audit_id"],
      additionalProperties: false,
    },
    wrap: (args) => ({ method: "GET", path: `/api/v1/audits/${encodeURIComponent(String(args.audit_id))}` }),
    shape: (body) => (body && typeof body === "object" ? renameTrustindex(body as Record<string, unknown>) : body),
  },
];

export const MCP_TOOLS_BY_NAME = new Map(MCP_TOOLS.map((t) => [t.name, t]));

/** Server identity returned by the MCP `initialize` handshake. */
export const MCP_SERVER_INFO = { name: "ozvor", version: "1.0.0" } as const;

/** Tools this key may SEE and CALL: needs "mcp" plus the tool's own scope. */
export function toolsForScopes(scopes: string[]): McpTool[] {
  if (!scopes.includes("mcp")) return [];
  return MCP_TOOLS.filter((t) => scopes.includes(t.scope));
}
