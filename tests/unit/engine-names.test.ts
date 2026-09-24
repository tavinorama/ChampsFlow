import { describe, it, expect } from "vitest";
import { toDriftEngine, toDriftEngines, engineLabel, DRIFT_ENGINES } from "../../packages/shared/src/engine-names";

describe("engine-names — one identity per engine (B4, D23)", () => {
  it("maps the audit's database names onto the drift battery's ids", () => {
    expect(toDriftEngine("google")).toBe("gemini");
    expect(toDriftEngine("dataforseo")).toBe("serp");
    expect(toDriftEngine("openai")).toBe("openai");
    expect(toDriftEngine(" Perplexity ")).toBe("perplexity");
    expect(toDriftEngine("something-new")).toBe("something-new");
  });
  it("the 21/09 audit's five providers become the five drift ids, no duplicates", () => {
    expect(toDriftEngines(["openai", "anthropic", "perplexity", "google", "dataforseo"])).toEqual([
      "openai", "anthropic", "perplexity", "gemini", "serp",
    ]);
    expect(toDriftEngines(["google", "gemini"])).toEqual(["gemini"]);
    for (const e of DRIFT_ENGINES) expect(toDriftEngine(e)).toBe(e);
  });
  it("labels accept either dialect", () => {
    expect(engineLabel("google")).toBe("Gemini");
    expect(engineLabel("serp")).toBe("Google AI Overviews");
    expect(engineLabel("dataforseo")).toBe("Google AI Overviews");
    expect(engineLabel("mystery")).toBe("mystery");
  });
});
