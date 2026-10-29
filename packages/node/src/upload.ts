import { randomUUID } from 'node:crypto';

export type FileType = 'png' | 'jpeg' | 'gif' | 'webp' | 'pdf' | 'zip' | 'mp4' | 'heic';

export interface DetectedType {
  type: FileType;
  mime: string;
  ext: string;
}

const ascii = (buf: Uint8Array, start: number, text: string) =>
  buf.length >= start + text.length && [...text].every((ch, i) => buf[start + i] === ch.charCodeAt(0));
const bytes = (buf: Uint8Array, start: number, sig: number[]) =>
  buf.length >= start + sig.length && sig.every((b, i) => buf[start + i] === b);

// SVG and HTML are deliberately absent: they can carry scripts.
const SIGNATURES: (DetectedType & { match: (b: Uint8Array) => boolean })[] = [
  { type: 'png', mime: 'image/png', ext: 'png', match: (b) => bytes(b, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
  { type: 'jpeg', mime: 'image/jpeg', ext: 'jpg', match: (b) => bytes(b, 0, [0xff, 0xd8, 0xff]) },
  { type: 'gif', mime: 'image/gif', ext: 'gif', match: (b) => ascii(b, 0, 'GIF87a') || ascii(b, 0, 'GIF89a') },
  { type: 'webp', mime: 'image/webp', ext: 'webp', match: (b) => ascii(b, 0, 'RIFF') && ascii(b, 8, 'WEBP') },
  { type: 'pdf', mime: 'application/pdf', ext: 'pdf', match: (b) => ascii(b, 0, '%PDF-') },
  { type: 'zip', mime: 'application/zip', ext: 'zip', match: (b) => bytes(b, 0, [0x50, 0x4b, 0x03, 0x04]) },
  {
    type: 'heic', mime: 'image/heic', ext: 'heic',
    match: (b) => ascii(b, 4, 'ftyp') && ['heic', 'heix', 'heim', 'heis', 'mif1'].some((brand) => ascii(b, 8, brand)),
  },
  { type: 'mp4', mime: 'video/mp4', ext: 'mp4', match: (b) => ascii(b, 4, 'ftyp') },
];

/** Identify a file by its content (magic bytes), never by name or client Content-Type. Control UPLOAD-C1. */
export function detectFileType(buf: Uint8Array): DetectedType | undefined {
  const found = SIGNATURES.find((s) => s.match(buf));
  return found && { type: found.type, mime: found.mime, ext: found.ext };
}

export class FileTypeError extends Error {
  override name = 'FileTypeError';
}

/** Throw unless the content is one of the allowed types; returns the detected type. Control UPLOAD-C1. */
export function assertFileType(buf: Uint8Array, allowed: FileType[]): DetectedType {
  const detected = detectFileType(buf);
  if (!detected || !allowed.includes(detected.type)) {
    throw new FileTypeError(`File type ${detected?.type ?? 'unknown'} is not allowed (allowed: ${allowed.join(', ')})`);
  }
  return detected;
}

/** Random storage name; pass the detected extension, never the client's file name. Control UPLOAD-C2. */
export function safeStorageName(ext?: string): string {
  const clean = ext?.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10);
  return clean ? `${randomUUID()}.${clean}` : randomUUID();
}
