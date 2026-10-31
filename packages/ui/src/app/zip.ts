// A small, bounded ZIP reader for the hosted app. It reads the archive's central directory to list the
// files, then inflates only the few small files detection needs, with the browser's DecompressionStream.
// The archive is read here, in the browser, and never uploaded. Limits on archive size, entry count and
// inflated size apply before and during decompression, whatever the archive headers claim (UPLOAD-C3).

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_END = 0x06054b50;
const SIG_END64 = 0x06064b50;
const SIG_END64_LOCATOR = 0x07064b50;
const U32_MAX = 0xffffffff;

/** Largest archive accepted. Only its index and a few small files are ever read into memory. */
export const MAX_ZIP_BYTES = 2 * 1024 ** 3;
const MAX_ENTRIES = 500_000;
const MAX_CENTRAL_DIRECTORY = 128 * 1024 ** 2;

export interface ZipEntry {
  path: string;
  /** Uncompressed size as recorded in the archive (not trusted when inflating). */
  size: number;
  compressedSize: number;
  method: number;
  encrypted: boolean;
  dir: boolean;
  offset: number;
}

export class ZipError extends Error {}

const DAMAGED = 'That .zip file is damaged or incomplete. Create it again, or pick the folder instead.';

async function bytes(blob: Blob, start: number, end: number): Promise<Uint8Array> {
  return new Uint8Array(await blob.slice(start, end).arrayBuffer());
}

function view(b: Uint8Array): DataView {
  return new DataView(b.buffer, b.byteOffset, b.byteLength);
}

/** Checks the file's first bytes, not its name or type (UPLOAD-C1). */
export async function isZip(file: Blob): Promise<boolean> {
  const b = await bytes(file, 0, 4);
  return b.length === 4 && b[0] === 0x50 && b[1] === 0x4b && ((b[2] === 3 && b[3] === 4) || (b[2] === 5 && b[3] === 6));
}

/** List every entry in the archive. */
export async function listZip(file: Blob): Promise<ZipEntry[]> {
  if (file.size > MAX_ZIP_BYTES) throw new ZipError('That .zip is larger than 2 GB. Leave out node_modules, build output and media, or pick the folder instead.');
  if (!(await isZip(file))) throw new ZipError('That file is not a .zip archive.');

  // The end-of-central-directory record sits in the last 22 bytes plus an optional comment of up to 64 KB.
  const tailStart = Math.max(0, file.size - 22 - 0xffff);
  const tail = await bytes(file, tailStart, file.size);
  const tv = view(tail);
  let end = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tv.getUint32(i, true) === SIG_END) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new ZipError(DAMAGED);
  let count = tv.getUint16(end + 10, true);
  let cdSize = tv.getUint32(end + 12, true);
  let cdOffset = tv.getUint32(end + 16, true);
  if (count === 0xffff || cdSize === U32_MAX || cdOffset === U32_MAX) {
    // ZIP64 archive: the real values are in the ZIP64 end record, found through the locator just before.
    const loc = end - 20;
    if (loc < 0 || tv.getUint32(loc, true) !== SIG_END64_LOCATOR) throw new ZipError(DAMAGED);
    const recordAt = Number(tv.getBigUint64(loc + 8, true));
    const rv = view(await bytes(file, recordAt, recordAt + 56));
    if (rv.byteLength < 56 || rv.getUint32(0, true) !== SIG_END64) throw new ZipError(DAMAGED);
    count = Number(rv.getBigUint64(32, true));
    cdSize = Number(rv.getBigUint64(40, true));
    cdOffset = Number(rv.getBigUint64(48, true));
  }
  if (count > MAX_ENTRIES || cdSize > MAX_CENTRAL_DIRECTORY) {
    throw new ZipError('That .zip has too many files. Leave out node_modules and build output, or pick the folder instead.');
  }
  if (cdOffset + cdSize > file.size) throw new ZipError(DAMAGED);

  const cd = await bytes(file, cdOffset, cdOffset + cdSize);
  const v = view(cd);
  const decoder = new TextDecoder();
  const entries: ZipEntry[] = [];
  let p = 0;
  for (let i = 0; i < count; i++) {
    if (p + 46 > cd.length || v.getUint32(p, true) !== SIG_CENTRAL) throw new ZipError(DAMAGED);
    const flags = v.getUint16(p + 8, true);
    const method = v.getUint16(p + 10, true);
    let compressedSize = v.getUint32(p + 20, true);
    let size = v.getUint32(p + 24, true);
    const nameLen = v.getUint16(p + 28, true);
    const extraLen = v.getUint16(p + 30, true);
    const commentLen = v.getUint16(p + 32, true);
    let offset = v.getUint32(p + 42, true);
    if (p + 46 + nameLen + extraLen > cd.length) throw new ZipError(DAMAGED);
    const path = decoder.decode(cd.subarray(p + 46, p + 46 + nameLen));
    if (size === U32_MAX || compressedSize === U32_MAX || offset === U32_MAX) {
      // ZIP64 extra field (id 1) holds the 64-bit values, in this order, for those set to 0xffffffff.
      for (let e = p + 46 + nameLen, stop = e + extraLen; e + 4 <= stop; ) {
        const id = v.getUint16(e, true);
        const len = v.getUint16(e + 2, true);
        if (id === 1) {
          let q = e + 4;
          const next = () => {
            const n = q + 8 <= e + 4 + len ? Number(v.getBigUint64(q, true)) : U32_MAX;
            q += 8;
            return n;
          };
          if (size === U32_MAX) size = next();
          if (compressedSize === U32_MAX) compressedSize = next();
          if (offset === U32_MAX) offset = next();
          break;
        }
        e += 4 + len;
      }
    }
    entries.push({ path, size, compressedSize, method, encrypted: (flags & 1) !== 0, dir: path.endsWith('/'), offset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/**
 * Inflate one entry as UTF-8 text. Returns null for entries that cannot or should not be read (encrypted,
 * unsupported compression, or larger than `limit` bytes once inflated — checked while inflating).
 */
export async function readZipText(file: Blob, entry: ZipEntry, limit: number): Promise<string | null> {
  if (entry.dir || entry.encrypted || entry.size > limit || (entry.method !== 0 && entry.method !== 8)) return null;
  const head = view(await bytes(file, entry.offset, entry.offset + 30));
  if (head.byteLength < 30 || head.getUint32(0, true) !== SIG_LOCAL) throw new ZipError(DAMAGED);
  const start = entry.offset + 30 + head.getUint16(26, true) + head.getUint16(28, true);
  const raw = file.slice(start, start + entry.compressedSize);
  if (entry.method === 0) return raw.size > limit ? null : new TextDecoder().decode(await raw.arrayBuffer());

  const reader = raw.stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } catch {
    return null;
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return new TextDecoder().decode(out);
}
