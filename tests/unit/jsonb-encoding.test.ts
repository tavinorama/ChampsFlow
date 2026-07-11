/**
 * jsonb-encoding.test.ts — locks the fix for the Ozvor Pages "no_business_name"
 * bug. The API writes jsonb through postgres.js `sql.unsafe`, which re-encodes
 * a string param bound to a jsonb column. Passing `JSON.stringify(obj)` stored
 * a jsonb STRING SCALAR (`"{\"name\":\"Ozvor\"...}"`) instead of an object, so
 * `business->>'name'` was null and every affected site was skipped.
 *
 * jsonbParam is the write-side guard (never hand a pre-stringified string to
 * db.query); parseJsonbObject is the read-side recovery for legacy rows.
 */
import { describe, it, expect } from "vitest";
import { jsonbParam, parseJsonbObject } from "../../packages/shared/src/jsonb";

const business = { name: "Ozvor", category: "Saas", website: "https://ozvor.com/" };

describe("jsonbParam (write-side)", () => {
  it("passes an object through unchanged (postgres.js serializes it once)", () => {
    expect(jsonbParam(business)).toEqual(business);
  });

  it("passes an array through unchanged", () => {
    const sections = [{ type: "hero" }, { type: "faq" }];
    expect(jsonbParam(sections)).toEqual(sections);
  });

  it("un-stringifies a pre-encoded JSON string so it is NOT double-encoded", () => {
    // The exact shape the buggy call sites produced: JSON.stringify(obj).
    expect(jsonbParam(JSON.stringify(business))).toEqual(business);
  });

  it("leaves a plain (non-JSON) string alone", () => {
    expect(jsonbParam("bold")).toBe("bold");
  });

  it("passes null/undefined through untouched", () => {
    expect(jsonbParam(null)).toBeNull();
    expect(jsonbParam(undefined)).toBeUndefined();
  });
});

describe("parseJsonbObject (read-side recovery)", () => {
  it("returns a real object untouched", () => {
    expect(parseJsonbObject(business)).toEqual(business);
  });

  it("recovers a single-encoded string (the legacy double-encode signature)", () => {
    // What postgres.js returns for a jsonb string scalar: a JS string.
    expect(parseJsonbObject(JSON.stringify(business))).toEqual(business);
    expect(parseJsonbObject(JSON.stringify(business)).name).toBe("Ozvor");
  });

  it("recovers a doubly-encoded string defensively", () => {
    expect(parseJsonbObject(JSON.stringify(JSON.stringify(business)))).toEqual(business);
  });

  it("returns {} for unusable values (non-JSON string, array, primitive, null)", () => {
    expect(parseJsonbObject("not json")).toEqual({});
    expect(parseJsonbObject(JSON.stringify([1, 2, 3]))).toEqual({});
    expect(parseJsonbObject(42)).toEqual({});
    expect(parseJsonbObject(null)).toEqual({});
    expect(parseJsonbObject(undefined)).toEqual({});
  });
});
