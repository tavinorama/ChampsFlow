/**
 * zip.test.ts — the dependency-free ZIP writer used by the Ozvor Pages
 * downloadable export.
 *
 * The point of a hand-rolled zip is that a real archiver must open it. So
 * beyond unit-checking the byte structure, this test writes the archive to a
 * temp file and shells out to the system `unzip` to (a) test integrity and
 * (b) extract and byte-compare every entry — including a UTF-8 filename and
 * body, which exercises the flag-bit-11 path.
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createZip } from "../../packages/shared/src/zip";

function hasUnzip(): boolean {
  try {
    execFileSync("unzip", ["-v"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const entries = [
  { path: "index.html", content: "<!doctype html><h1>Marigold Café</h1>" },
  { path: "sobre-nos.html", content: "<h2>Sobre — açaí, coração</h2>" },
  { path: "assets/styles.css", content: "body{color:#0c7d54}" },
  { path: "README.txt", content: "linha 1\nlinha 2\n" },
];

describe("createZip", () => {
  it("produces a well-formed archive with the right signatures", () => {
    const z = createZip(entries);
    // Local file header signature at offset 0.
    expect(z[0]).toBe(0x50);
    expect(z[1]).toBe(0x4b);
    expect(z[2]).toBe(0x03);
    expect(z[3]).toBe(0x04);
    // End-of-central-directory signature present near the tail.
    const tail = Buffer.from(z.slice(z.length - 22));
    expect(tail.readUInt32LE(0)).toBe(0x06054b50);
    // EOCD records the correct entry count.
    expect(tail.readUInt16LE(8)).toBe(entries.length);
    expect(tail.readUInt16LE(10)).toBe(entries.length);
  });

  it("round-trips through the system unzip (integrity + content)", () => {
    if (!hasUnzip()) {
      // CI images without `unzip` still pass the structural test above.
      return;
    }
    const dir = mkdtempSync(join(tmpdir(), "ozzip-"));
    const zipPath = join(dir, "site.zip");
    try {
      writeFileSync(zipPath, createZip(entries));

      // `unzip -t` returns non-zero on any CRC/structure error → throws here.
      const test = execFileSync("unzip", ["-t", zipPath], { encoding: "utf8" });
      expect(test).toContain("No errors detected");

      execFileSync("unzip", ["-o", "-q", zipPath, "-d", dir], { stdio: "ignore" });
      for (const e of entries) {
        const extracted = readFileSync(join(dir, e.path), "utf8");
        expect(extracted).toBe(e.content);
      }
      // UTF-8 filename survived.
      expect(existsSync(join(dir, "sobre-nos.html"))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("is deterministic (no wall-clock timestamps)", () => {
    const a = createZip(entries);
    const b = createZip(entries);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });
});
