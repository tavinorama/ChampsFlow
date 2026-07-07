/**
 * Content Studio — Gemini default model contract.
 *
 * Added per Hermes review on the audit-cost PR: the Gemini fallback moved from
 * gemini-1.5-flash (RETIRED by Google for new projects — returns HTTP 404, seen
 * live in production on the audit path) to gemini-2.5-flash. Content Studio is
 * client-facing so it stays on full flash (not the audit tier flash-lite), and
 * GEMINI_MODEL still overrides.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { generateContent } from "../../../packages/llm/src/content-studio";

const REQ = {
  brandName: "Ozvor",
  contentType: "blog",
  topic: "AI search visibility",
} as never;

let savedModel: string | undefined;
let urls: string[];

beforeEach(() => {
  savedModel = process.env["GEMINI_MODEL"];
  delete process.env["GEMINI_MODEL"];
  urls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL) => {
      urls.push(String(url));
      return new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: "# Draft\n\nGenerated body." }] } }],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (typeof savedModel === "string") process.env["GEMINI_MODEL"] = savedModel;
  else delete process.env["GEMINI_MODEL"];
});

describe("content studio gemini model", () => {
  it("defaults to gemini-2.5-flash (1.5 is retired) and honors GEMINI_MODEL", async () => {
    await generateContent(REQ, { apiKey: "client-key", provider: "gemini" });
    expect(urls[0]).toContain("/models/gemini-2.5-flash:");

    urls = [];
    process.env["GEMINI_MODEL"] = "gemini-2.5-pro";
    await generateContent(REQ, { apiKey: "client-key", provider: "gemini" });
    expect(urls[0]).toContain("/models/gemini-2.5-pro:");
  });
});
