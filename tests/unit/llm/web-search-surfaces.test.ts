/**
 * B2 web-search surfaces — contract tests for the 3 probe adapters.
 *
 * The founder decision behind B2: the audit must measure the surface a real
 * consumer sees (ChatGPT with browsing, Claude with web search, Gemini with
 * Google Search grounding), not the models' parametric memory. These tests
 * assert:
 *   1. Request shape WITH search (default): OpenAI → Responses API +
 *      web_search tool; Anthropic → web_search_20250305 tool (haiku-4-5
 *      matrix); Gemini → google_search grounding tool.
 *   2. Rollback flag: GEO_WEB_SEARCH=0 → pre-B2 request shape, no tools.
 *   3. Response parsing keeps the gateway contract (rawText + mentioned +
 *      position + sources), and search citation metadata (url_citation /
 *      web_search_tool_result / groundingMetadata) is merged into sources.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { AnthropicProbeAdapter } from "../../../packages/llm/src/providers/anthropic";
import { OpenAIProbeAdapter } from "../../../packages/llm/src/providers/openai";
import { GeminiProbeAdapter } from "../../../packages/llm/src/providers/gemini";
import { webSearchEnabled, providerSurface } from "../../../packages/llm/src/providers/types";

const QUERY = { queryHash: "h", queryText: "best crm for smb", brandName: "Ozvor" };

const ENV_KEYS = [
  "GEO_WEB_SEARCH",
  "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY",
  "AUDIT_ANTHROPIC_MODEL", "ANTHROPIC_MODEL",
  "AUDIT_OPENAI_MODEL", "OPENAI_MODEL",
  "AUDIT_GEMINI_MODEL", "GEMINI_MODEL",
];

let saved: Record<string, string | undefined>;
let captured: { url: string; body: Record<string, unknown> }[];
/** Per-test response payload the fetch stub returns. */
let responsePayload: unknown;

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  captured = [];
  responsePayload = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL, init?: { body?: string }) => {
      captured.push({ url: String(url), body: init?.body ? JSON.parse(init.body) : {} });
      return new Response(JSON.stringify(responsePayload), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const [k, v] of Object.entries(saved)) {
    if (typeof v === "string") process.env[k] = v;
    else delete process.env[k];
  }
});

// ---------------------------------------------------------------------------
// Flag semantics
// ---------------------------------------------------------------------------

describe("GEO_WEB_SEARCH flag", () => {
  it("defaults ON (unset), any value except '0' is ON, '0' is OFF", () => {
    expect(webSearchEnabled()).toBe(true);
    process.env["GEO_WEB_SEARCH"] = "1";
    expect(webSearchEnabled()).toBe(true);
    process.env["GEO_WEB_SEARCH"] = "0";
    expect(webSearchEnabled()).toBe(false);
  });

  it("providerSurface reflects the flag for the 3 upgraded engines", () => {
    expect(providerSurface("openai")).toContain("web_search");
    expect(providerSurface("anthropic")).toContain("web search");
    expect(providerSurface("gemini")).toContain("Google Search grounding");
    process.env["GEO_WEB_SEARCH"] = "0";
    expect(providerSurface("openai")).toContain("no search");
    expect(providerSurface("anthropic")).toContain("no search");
    expect(providerSurface("gemini")).toContain("no grounding");
    // Search-native engines are flag-independent.
    expect(providerSurface("perplexity")).toContain("search-native");
    expect(providerSurface("serp")).toContain("search-native");
  });
});

// ---------------------------------------------------------------------------
// OpenAI — Responses API + web_search
// ---------------------------------------------------------------------------

describe("OpenAI adapter", () => {
  beforeEach(() => {
    process.env["OPENAI_API_KEY"] = "test-key";
  });

  it("search ON: calls /v1/responses with the web_search tool and parses output + url_citation sources", async () => {
    responsePayload = {
      output: [
        { type: "web_search_call", id: "ws_1", status: "completed" },
        {
          type: "message",
          content: [
            {
              type: "output_text",
              text: "Ozvor is a leading option. See https://inline.example/a.",
              annotations: [
                { type: "url_citation", url: "https://cited.example/review", title: "Review" },
              ],
            },
          ],
        },
      ],
    };
    const r = await new OpenAIProbeAdapter().probe(QUERY as never);

    expect(captured[0]?.url).toBe("https://api.openai.com/v1/responses");
    expect(captured[0]?.body["tools"]).toEqual([{ type: "web_search" }]);
    expect(captured[0]?.body["input"]).toBe(QUERY.queryText);
    expect(captured[0]?.body["model"]).toBe("gpt-4o-mini");
    expect(captured[0]?.body["max_output_tokens"]).toBe(1024);

    expect(r.mentioned).toBe(true);
    expect(r.rawText).toContain("Ozvor");
    // Inline URL (citation-parser) + url_citation annotation, deduped.
    expect(r.sources).toContain("https://inline.example/a");
    expect(r.sources).toContain("https://cited.example/review");
  });

  it("search OFF (GEO_WEB_SEARCH=0): legacy Chat Completions call without tools", async () => {
    process.env["GEO_WEB_SEARCH"] = "0";
    responsePayload = { choices: [{ message: { content: "Ozvor is a leading option." } }] };
    const r = await new OpenAIProbeAdapter().probe(QUERY as never);

    expect(captured[0]?.url).toBe("https://api.openai.com/v1/chat/completions");
    expect(captured[0]?.body["tools"]).toBeUndefined();
    expect(captured[0]?.body["messages"]).toEqual([{ role: "user", content: QUERY.queryText }]);
    expect(r.mentioned).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Anthropic — Messages API + web_search_20250305 (haiku-4-5 tool matrix)
// ---------------------------------------------------------------------------

describe("Anthropic adapter", () => {
  beforeEach(() => {
    process.env["ANTHROPIC_API_KEY"] = "test-key";
  });

  it("search ON: sends the web_search_20250305 tool (default model is haiku-4-5) and merges web_search_tool_result URLs", async () => {
    responsePayload = {
      content: [
        { type: "server_tool_use", id: "srvtoolu_1", name: "web_search", input: { query: "best crm" } },
        {
          type: "web_search_tool_result",
          tool_use_id: "srvtoolu_1",
          content: [
            { type: "web_search_result", url: "https://found.example/top-crm", title: "Top CRMs" },
            { type: "web_search_result", url: "https://found.example/ozvor", title: "Ozvor" },
          ],
        },
        { type: "text", text: "Ozvor is a leading option for SMBs." },
      ],
    };
    const r = await new AnthropicProbeAdapter().probe(QUERY as never);

    expect(captured[0]?.body["model"]).toBe("claude-haiku-4-5");
    expect(captured[0]?.body["tools"]).toEqual([
      { type: "web_search_20250305", name: "web_search", max_uses: 3 },
    ]);
    expect(r.mentioned).toBe(true);
    expect(r.rawText).toBe("Ozvor is a leading option for SMBs.");
    expect(r.sources).toContain("https://found.example/top-crm");
    expect(r.sources).toContain("https://found.example/ozvor");
  });

  it("search ON: a web_search_tool_result ERROR object (not array) does not crash and yields no sources", async () => {
    responsePayload = {
      content: [
        {
          type: "web_search_tool_result",
          tool_use_id: "srvtoolu_1",
          content: { type: "web_search_tool_result_error", error_code: "unavailable" },
        },
        { type: "text", text: "Ozvor is a leading option." },
      ],
    };
    const r = await new AnthropicProbeAdapter().probe(QUERY as never);
    expect(r.mentioned).toBe(true);
    expect(r.sources).toEqual([]);
  });

  it("search OFF (GEO_WEB_SEARCH=0): legacy request without tools", async () => {
    process.env["GEO_WEB_SEARCH"] = "0";
    responsePayload = { content: [{ type: "text", text: "Ozvor is a leading option." }] };
    const r = await new AnthropicProbeAdapter().probe(QUERY as never);

    expect(captured[0]?.body["tools"]).toBeUndefined();
    expect(r.mentioned).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Gemini — generateContent + google_search grounding
// ---------------------------------------------------------------------------

describe("Gemini adapter", () => {
  beforeEach(() => {
    process.env["GEMINI_API_KEY"] = "test-key";
  });

  it("search ON: sends tools [{ google_search: {} }] and merges groundingMetadata URIs into sources", async () => {
    responsePayload = {
      candidates: [
        {
          content: { parts: [{ text: "Ozvor is a well-regarded option." }] },
          groundingMetadata: {
            groundingChunks: [
              { web: { uri: "https://grounded.example/one" } },
              { web: { uri: "https://grounded.example/two" } },
              {}, // defensive: chunk without web.uri must be skipped
            ],
          },
        },
      ],
    };
    const r = await new GeminiProbeAdapter().probe(QUERY as never);

    expect(captured[0]?.url).toContain("/models/gemini-2.5-flash-lite:generateContent");
    expect(captured[0]?.body["tools"]).toEqual([{ google_search: {} }]);
    expect(r.mentioned).toBe(true);
    expect(r.sources).toEqual([
      "https://grounded.example/one",
      "https://grounded.example/two",
    ]);
  });

  it("search OFF (GEO_WEB_SEARCH=0): legacy request without tools", async () => {
    process.env["GEO_WEB_SEARCH"] = "0";
    responsePayload = {
      candidates: [{ content: { parts: [{ text: "Ozvor is a well-regarded option." }] } }],
    };
    const r = await new GeminiProbeAdapter().probe(QUERY as never);

    expect(captured[0]?.body["tools"]).toBeUndefined();
    expect(r.mentioned).toBe(true);
    expect(r.sources).toEqual([]);
  });
});
