/**
 * zip.ts — a minimal, dependency-free ZIP writer (STORE method, no compression).
 *
 * Ozvor Pages exports a handful of small text files (HTML/CSS/README); a stored
 * zip is tiny and avoids pulling a compression library into the API build (the
 * #248 lesson: fewer runtime deps in the worker/api = fewer stale-build traps).
 * Produces a standard .zip that macOS Finder, Windows Explorer, and `unzip` all
 * open. Deterministic (fixed timestamp) so output is testable byte-for-byte.
 */

export interface ZipEntry {
  /** File path inside the archive, e.g. "index.html" or "assets/styles.css". */
  path: string;
  content: string | Uint8Array;
}

// ---------------------------------------------------------------------------
// CRC-32 (IEEE 802.3) — required in every zip entry header.
// ---------------------------------------------------------------------------

const CRC_TABLE: Uint32Array = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

// Fixed DOS date/time (2026-01-01 00:00:00) — keeps output deterministic.
const DOS_TIME = 0;
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;

function utf8(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

/**
 * Build a ZIP archive (STORE / no compression) from a list of files.
 * Returns the raw bytes, ready to send as `application/zip`.
 */
/**
 * Reject any entry path that could escape the archive root when extracted:
 * absolute paths, Windows drive/backslash paths, or a `..`/`.` segment. This is
 * the archive-boundary backstop — callers should also sanitize their own names.
 */
function assertSafeEntryPath(path: string): void {
  if (!path || path.startsWith("/") || path.includes("\\") || /^[A-Za-z]:/.test(path)) {
    throw new Error(`Unsafe zip entry path: ${JSON.stringify(path)}`);
  }
  for (const seg of path.split("/")) {
    if (seg === ".." || seg === ".") {
      throw new Error(`Unsafe zip entry path: ${JSON.stringify(path)}`);
    }
  }
}

export function createZip(entries: ZipEntry[]): Uint8Array {
  const seen = new Set<string>();
  const files = entries.map((e) => {
    assertSafeEntryPath(e.path);
    const key = e.path.toLowerCase();
    if (seen.has(key)) throw new Error(`Duplicate zip entry path: ${JSON.stringify(e.path)}`);
    seen.add(key);
    const nameBytes = utf8(e.path);
    const data = typeof e.content === "string" ? utf8(e.content) : e.content;
    return { nameBytes, data, crc: crc32(data), offset: 0 };
  });

  const chunks: Uint8Array[] = [];
  let offset = 0;
  const push = (b: Uint8Array) => {
    chunks.push(b);
    offset += b.length;
  };

  // --- Local file headers + data ---
  for (const f of files) {
    f.offset = offset;
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); // local file header signature
    h.setUint16(4, 20, true); // version needed
    h.setUint16(6, 0x0800, true); // flags: bit 11 = UTF-8 filenames
    h.setUint16(8, 0, true); // method: 0 = stored
    h.setUint16(10, DOS_TIME, true);
    h.setUint16(12, DOS_DATE, true);
    h.setUint32(14, f.crc, true);
    h.setUint32(18, f.data.length, true); // compressed size
    h.setUint32(22, f.data.length, true); // uncompressed size
    h.setUint16(26, f.nameBytes.length, true);
    h.setUint16(28, 0, true); // extra len
    push(new Uint8Array(h.buffer));
    push(f.nameBytes);
    push(f.data);
  }

  // --- Central directory ---
  const cdStart = offset;
  for (const f of files) {
    const h = new DataView(new ArrayBuffer(46));
    h.setUint32(0, 0x02014b50, true); // central dir header signature
    h.setUint16(4, 20, true); // version made by
    h.setUint16(6, 20, true); // version needed
    h.setUint16(8, 0x0800, true); // flags: UTF-8
    h.setUint16(10, 0, true); // method: stored
    h.setUint16(12, DOS_TIME, true);
    h.setUint16(14, DOS_DATE, true);
    h.setUint32(16, f.crc, true);
    h.setUint32(20, f.data.length, true);
    h.setUint32(24, f.data.length, true);
    h.setUint16(28, f.nameBytes.length, true);
    h.setUint16(30, 0, true); // extra len
    h.setUint16(32, 0, true); // comment len
    h.setUint16(34, 0, true); // disk number start
    h.setUint16(36, 0, true); // internal attrs
    h.setUint32(38, 0, true); // external attrs
    h.setUint32(42, f.offset, true); // local header offset
    push(new Uint8Array(h.buffer));
    push(f.nameBytes);
  }
  const cdSize = offset - cdStart;

  // --- End of central directory ---
  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0, 0x06054b50, true);
  eocd.setUint16(4, 0, true); // disk num
  eocd.setUint16(6, 0, true); // disk with CD
  eocd.setUint16(8, files.length, true);
  eocd.setUint16(10, files.length, true);
  eocd.setUint32(12, cdSize, true);
  eocd.setUint32(16, cdStart, true);
  eocd.setUint16(20, 0, true); // comment len
  push(new Uint8Array(eocd.buffer));

  // Concatenate
  const total = offset;
  const out = new Uint8Array(total);
  let p = 0;
  for (const c of chunks) {
    out.set(c, p);
    p += c.length;
  }
  return out;
}
