// Verifies that a file's real bytes ("magic number") match its declared MIME type,
// so a malicious file can't be disguised with a fake extension/content-type
// (e.g. an executable renamed to .pdf).
//
// Fail-open by design: types without a reliable signature (plain text, CSV, video)
// are always allowed, so legitimate uploads are never wrongly rejected. Only types
// with rock-solid, well-known signatures are enforced.

interface Signature {
  bytes: number[];
  offset?: number;
}

// Each MIME maps to a list of acceptable signatures (any one match passes).
const SIGNATURES: Record<string, Signature[]> = {
  'image/jpeg': [{ bytes: [0xff, 0xd8, 0xff] }],
  'image/png': [{ bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] }],
  'image/gif': [{ bytes: [0x47, 0x49, 0x46, 0x38] }], // "GIF8"
  'image/webp': [{ bytes: [0x57, 0x45, 0x42, 0x50], offset: 8 }], // "WEBP" after RIFF header
  'application/pdf': [{ bytes: [0x25, 0x50, 0x44, 0x46] }], // "%PDF"
  // Legacy OLE compound documents (.doc / .xls)
  'application/msword': [{ bytes: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1] }],
  'application/vnd.ms-excel': [{ bytes: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1] }],
  // ZIP-based Office Open XML (.docx / .xlsx) and plain zips — all start with "PK"
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ZIP(),
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ZIP(),
  'application/zip': ZIP(),
  'application/x-zip-compressed': ZIP(),
};

function ZIP(): Signature[] {
  return [
    { bytes: [0x50, 0x4b, 0x03, 0x04] },
    { bytes: [0x50, 0x4b, 0x05, 0x06] }, // empty archive
    { bytes: [0x50, 0x4b, 0x07, 0x08] }, // spanned archive
  ];
}

const matches = (buffer: Buffer, sig: Signature): boolean => {
  const offset = sig.offset ?? 0;
  if (buffer.length < offset + sig.bytes.length) return false;
  return sig.bytes.every((b, i) => buffer[offset + i] === b);
};

export const contentMatchesMime = (buffer: Buffer, mimeType: string): boolean => {
  const signatures = SIGNATURES[mimeType];
  if (!signatures) return true; // no known signature for this type → allow
  if (buffer.length < 4) return true; // too small to judge → allow
  return signatures.some((sig) => matches(buffer, sig));
};
