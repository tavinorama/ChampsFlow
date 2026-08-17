/**
 * mcp.ts — #150 Phase 1: the Ozvor MCP server (Streamable HTTP, stateless).
 *
 * ONE endpoint, POST /api/mcp, speaking JSON-RPC 2.0. The outer guard is the
 * existing requireApiKey with requireScope:"mcp" — so the handler already runs
 * inside runWithTenant(key.tenant_id) before it parses a single byte. Every
 * tools/call is dispatched as an internal sub-request through the wrapped
 * /api/v1 route (app.fetch), which re-authenticates and re-enters the tenant
 * scope, so RLS decides what rows exist and no MCP code ever issues SQL
 * (design §4). The worst an MCP bug can do is call the wrong route with the
 * caller's own key — which returns the caller's own data.
 *
 * Stateless: no session id, no SSE, no server-initiated messages. initialize
 * responds with capabilities; the model lists and calls tools; that is the
 * whole surface for Phase 1.
 */

import { Hono, type Context } from "hono";
import type { PostgresClient } from "../../../../packages/shared/src/db-client";
import { logger } from "../../../../packages/shared/src/logger";
import { requireApiKey } from "./api-keys";
import {
  MCP_TOOLS_BY_NAME,
  MCP_SERVER_INFO,
  toolsForScopes,
  type McpTool,
} from "../lib/mcp-tools";

/** JSON-RPC 2.0 error codes. -32001 is our app-level "forbidden". */
const RPC = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL: -32603,
  FORBIDDEN: -32001,
} as const;

const PROTOCOL_VERSION = "2025-06-18";
/** A JSON-RPC batch larger than this is rejected before any dispatch. */
const MAX_BATCH = 20;

type JsonRpcId = string | number | null;
interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: JsonRpcId;
  method: string;
  params?: Record<string, unknown>;
}

const rpcError = (id: JsonRpcId, code: number, message: string, data?: unknown) => ({
  jsonrpc: "2.0" as const,
  id,
  error: data === undefined ? { code, message } : { code, message, data },
});
const rpcResult = (id: JsonRpcId, result: unknown) => ({ jsonrpc: "2.0" as const, id, result });

/** Minimal, dependency-free validation of args against a tool's JSON Schema. */
function validateArgs(tool: McpTool, args: Record<string, unknown>): string | null {
  const schema = tool.inputSchema as {
    properties?: Record<string, { type?: string; format?: string }>;
    required?: string[];
    additionalProperties?: boolean;
  };
  const props = schema.properties ?? {};
  for (const req of schema.required ?? []) {
    if (args[req] === undefined || args[req] === null) return `missing required argument '${req}'`;
  }
  if (schema.additionalProperties === false) {
    for (const k of Object.keys(args)) {
      if (!(k in props)) return `unknown argument '${k}'`;
    }
  }
  for (const [k, spec] of Object.entries(props)) {
    const v = args[k];
    if (v === undefined) continue;
    if (spec.type === "integer" && (typeof v !== "number" || !Number.isInteger(v))) return `'${k}' must be an integer`;
    if (spec.type === "string" && typeof v !== "string") return `'${k}' must be a string`;
    if (spec.format === "uuid" && typeof v === "string" && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) {
      return `'${k}' must be a UUID`;
    }
  }
  return null;
}

interface ApiKeyCtx {
  id: string;
  tenantId: string;
  scopes: string[];
}

/**
 * Dispatch a validated tool call as an internal sub-request through the wrapped
 * /api/v1 route. The caller's Authorization header is forwarded verbatim so the
 * inner requireApiKey re-authenticates into the same tenant scope.
 */
async function callTool(
  app: Hono,
  c: Context,
  tool: McpTool,
  args: Record<string, unknown>
): Promise<{ isError: boolean; json: unknown }> {
  const { method, path } = tool.wrap(args);
  const origin = new URL(c.req.url).origin;
  const auth = c.req.header("Authorization") ?? "";
  const req = new Request(origin + path, {
    method,
    headers: { Authorization: auth, Accept: "application/json" },
  });
  const res = await app.fetch(req);
  const body = await res.json().catch(() => ({ error: "invalid_upstream_json" }));
  if (!res.ok) {
    // A 404/403 from the wrapped route is a normal tool result, not a protocol
    // error: the model should read "brand not found" and adapt (design §6).
    return { isError: true, json: body };
  }
  return { isError: false, json: tool.shape ? tool.shape(body) : body };
}

async function handleRpc(app: Hono, c: Context, msg: JsonRpcRequest): Promise<unknown | null> {
  const id: JsonRpcId = msg.id ?? null;
  if (msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
    return rpcError(id, RPC.INVALID_REQUEST, "Invalid JSON-RPC 2.0 request.");
  }
  const key = c.get("apiKey") as ApiKeyCtx;
  const scopes = key?.scopes ?? [];

  switch (msg.method) {
    case "initialize":
      return rpcResult(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: MCP_SERVER_INFO,
      });

    // Notifications (no id) — acknowledge by returning null (no response body).
    case "notifications/initialized":
    case "notifications/cancelled":
      return null;

    case "ping":
      return rpcResult(id, {});

    case "tools/list":
      return rpcResult(id, {
        tools: toolsForScopes(scopes).map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
      });

    case "tools/call": {
      const params = msg.params ?? {};
      const name = typeof params.name === "string" ? params.name : "";
      const args = (params.arguments as Record<string, unknown>) ?? {};
      const tool = MCP_TOOLS_BY_NAME.get(name);
      if (!tool) return rpcError(id, RPC.METHOD_NOT_FOUND, `Unknown tool '${name}'.`);

      // Re-check scope on every call — never trust that the caller only calls
      // what tools/list showed (design §3.2). Needs "mcp" AND the tool scope.
      if (!scopes.includes("mcp") || !scopes.includes(tool.scope)) {
        return rpcError(id, RPC.FORBIDDEN, `This key may not call '${name}'.`);
      }
      const invalid = validateArgs(tool, args);
      if (invalid) return rpcError(id, RPC.INVALID_PARAMS, invalid);

      try {
        const { isError, json } = await callTool(app, c, tool, args);
        return rpcResult(id, {
          content: [{ type: "text", text: JSON.stringify(json) }],
          isError,
        });
      } catch (err) {
        logger.error("mcp_tool_call_failed", { tool: name, message: (err as Error).message?.slice(0, 200) });
        return rpcError(id, RPC.INTERNAL, "Tool dispatch failed.");
      }
    }

    default:
      return rpcError(id, RPC.METHOD_NOT_FOUND, `Unknown method '${msg.method}'.`);
  }
}

export function registerMcpRoutes(app: Hono, db: PostgresClient): void {
  // The outer guard runs the FULL existing requireApiKey sequence with
  // requireScope:"mcp", so by the time the handler runs we are already inside
  // runWithTenant(key.tenant_id). The handler holds no db client (design §4.1).
  const mcpGuard = requireApiKey(db, { requireScope: "mcp", rateLimit: true });

  app.post("/api/mcp", mcpGuard, async (c) => {
    let payload: unknown;
    try {
      payload = await c.req.json();
    } catch {
      return c.json(rpcError(null, RPC.PARSE_ERROR, "Invalid JSON."), 400);
    }

    // Batch or single. A batch over MAX_BATCH is rejected wholesale.
    if (Array.isArray(payload)) {
      if (payload.length === 0) return c.json(rpcError(null, RPC.INVALID_REQUEST, "Empty batch."), 400);
      if (payload.length > MAX_BATCH) {
        return c.json(rpcError(null, RPC.INVALID_REQUEST, `Batch too large (max ${MAX_BATCH}).`), 400);
      }
      const out: unknown[] = [];
      for (const m of payload) {
        const r = await handleRpc(app, c, m as JsonRpcRequest);
        if (r !== null) out.push(r);
      }
      return c.json(out);
    }

    const r = await handleRpc(app, c, payload as JsonRpcRequest);
    // A lone notification produces no response body.
    if (r === null) return c.body(null, 204);
    return c.json(r);
  });
}
