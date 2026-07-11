/**
 * jsonb.ts — safe handoff of values to/from Postgres jsonb columns when the
 * query runs through postgres.js `sql.unsafe(text, params)` (the db.query
 * wrapper in apps/api/src/db/client.ts).
 *
 * THE TRAP: postgres.js decides the wire type of each param from its JS type.
 * A JS OBJECT bound to a jsonb column is serialized once (correct). A JS
 * STRING is serialized AGAIN — so a pre-stringified `JSON.stringify(obj)`
 * lands as a jsonb STRING SCALAR (`"{\"name\":\"Ozvor\"...}"`) instead of a
 * jsonb object, and `col->>'name'` then returns NULL. This silently broke
 * Ozvor Pages generation (every site skipped as "no_business_name").
 *
 * Rule: never hand `JSON.stringify(x)` to db.query for a jsonb column — hand
 * the object/array itself, via `jsonbParam`. `parseJsonbValue` is the read-
 * side counterpart that recovers any legacy double-encoded rows in flight.
 */

/**
 * Normalize a value about to be written to a jsonb column. Objects/arrays pass
 * through untouched (postgres.js serializes them correctly). A string that is
 * itself JSON is parsed back to its value so it is not double-encoded; a plain
 * (non-JSON) string is returned unchanged.
 */
export function jsonbParam(value: unknown): unknown {
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}

/**
 * Recover a jsonb value that may have been stored (or read back) as a JSON
 * string instead of an object — the legacy double-encode signature. Parses up
 * to `maxDepth` string layers, then returns a plain object (or `{}` when the
 * value is unusable / not an object).
 */
export function parseJsonbObject(
  value: unknown,
  maxDepth = 2
): Record<string, unknown> {
  let v = value;
  for (let i = 0; i < maxDepth && typeof v === "string"; i++) {
    try {
      v = JSON.parse(v);
    } catch {
      return {};
    }
  }
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}
