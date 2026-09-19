/**
 * publish-receipt.test.ts — "published" carries something that can be looked up.
 * The id is the SCHEDULER's (Postiz), never presented as the platform permalink.
 */
import { describe, it, expect } from "vitest";
import { publishReceipt } from "../../apps/api/src/lib/graph-runner";

describe("publishReceipt", () => {
  it("reads the id from the shapes Postiz returns", () => {
    expect(publishReceipt('[{"postId":"cm1abc123","integration":"x1"}]')).toBe(" postiz_id=cm1abc123");
    expect(publishReceipt('{"id":"p_9f8e7d","status":"scheduled"}')).toBe(" postiz_id=p_9f8e7d");
    expect(publishReceipt('{"posts":[{"id":12345}]}')).toBe(" postiz_id=12345");
  });

  it("survives a body cut at 500 chars, and never lets a strange id break the summary", () => {
    expect(publishReceipt('[{"postId":"cm1abc123","content":"a very long text that was cut')).toBe(" postiz_id=cm1abc123");
    expect(publishReceipt('{"id":"abc def\\n; DROP"}')).toBe(" postiz_id=abcdefDROP");
  });

  it("no id is SAID, not hidden: the row still starts with 'published via' and ends with postiz_id=none", () => {
    expect(publishReceipt('{"ok":true}')).toBe(" postiz_id=none");
    expect(publishReceipt("")).toBe(" postiz_id=none");
    expect(publishReceipt(null)).toBe(" postiz_id=none");
  });
});
