/**
 * competitor-detect.test.ts — word-boundary-safe competitor mention detection.
 * GEO-A2: detection runs over the model's OWN answer text; competitor names are
 * never sent to providers.
 */
import { describe, it, expect } from "vitest";
import { detectCompetitors } from "../../../packages/llm/src/competitor-detect";

describe("detectCompetitors", () => {
  it("finds competitors mentioned in the answer text", () => {
    const text = "For CRM, HubSpot and Salesforce are popular choices.";
    expect(detectCompetitors(text, ["HubSpot", "Salesforce", "Pipedrive"]).sort()).toEqual(["HubSpot", "Salesforce"]);
  });

  it("is case-insensitive", () => {
    expect(detectCompetitors("i love hubspot", ["HubSpot"])).toEqual(["HubSpot"]);
  });

  it("does not match substrings across word boundaries", () => {
    // "Sap" must not match inside "Salesforce".
    expect(detectCompetitors("Salesforce is great", ["Sap"])).toEqual([]);
  });

  it("returns an empty array when no competitor is mentioned", () => {
    expect(detectCompetitors("Acme CRM is the only option here", ["HubSpot"])).toEqual([]);
  });

  it("returns an empty array for empty inputs", () => {
    expect(detectCompetitors("", ["HubSpot"])).toEqual([]);
    expect(detectCompetitors("HubSpot rules", [])).toEqual([]);
  });

  it("does not duplicate a competitor mentioned multiple times", () => {
    expect(detectCompetitors("HubSpot, and again HubSpot", ["HubSpot"])).toEqual(["HubSpot"]);
  });

  it("handles competitor names with punctuation/spaces", () => {
    expect(detectCompetitors("We compared Acme Corp. to others", ["Acme Corp"])).toEqual(["Acme Corp"]);
  });
});
