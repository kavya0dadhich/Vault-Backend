// Verifies that a file's real bytes ("magic number") match its declared MIME type,
// so a malicious file can't be disguised with a fake extension/content-type
// (e.g. an executable renamed to .pdf).
//
// Types without a reliable fixed signature (plain text, CSV) get a content-shape
// check instead of a blanket pass — see looksLikeSafeText() (security audit
// VULN-05: these previously fell all the way through to an unconditional allow).

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
  // ISO base media containers (.mp4 / .mov) share the "ftyp" box at offset 4.
  'video/mp4': [{ bytes: [0x66, 0x74, 0x79, 0x70], offset: 4 }],
  'video/quicktime': [{ bytes: [0x66, 0x74, 0x79, 0x70], offset: 4 }],
  'video/webm': [{ bytes: [0x1a, 0x45, 0xdf, 0xa3] }], // EBML header
};

// Executable magic bytes that must never be accepted under a text/* label,
// regardless of what the client's Content-Type claimed.
const EXECUTABLE_SIGNATURES: Signature[] = [
  { bytes: [0x4d, 0x5a] }, // MZ — Windows PE/EXE
  { bytes: [0x7f, 0x45, 0x4c, 0x46] }, // ELF
  { bytes: [0xca, 0xfe, 0xba, 0xbe] }, // Mach-O (32-bit)
  { bytes: [0xfe, 0xed, 0xfa, 0xce] }, // Mach-O (32-bit, reverse)
  { bytes: [0xfe, 0xed, 0xfa, 0xcf] }, // Mach-O (64-bit)
  { bytes: [0xcf, 0xfa, 0xed, 0xfe] }, // Mach-O (64-bit, reverse)
];

const TEXT_LIKE_MIME_TYPES = new Set(['text/plain', 'text/csv']);

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

// text/plain and text/csv have no fixed magic number, so instead of allowing
// anything, reject content that clearly isn't text: embedded NUL bytes (binary
// data), known executable headers, or an HTML/script document opening — the
// app streams these back and previews them inline, so a mislabeled HTML file
// would otherwise be a stored-content risk even with `nosniff` in place.
const looksLikeSafeText = (buffer: Buffer): boolean => {
  const sample = buffer.subarray(0, Math.min(buffer.length, 4096));
  if (sample.includes(0)) return false;
  if (EXECUTABLE_SIGNATURES.some((sig) => matches(sample, sig))) return false;

  const head = sample.subarray(0, 512).toString('utf8').trimStart().toLowerCase();
  if (head.startsWith('<!doctype html') || head.startsWith('<html') || head.includes('<script')) {
    return false;
  }
  return true;
};

export const contentMatchesMime = (buffer: Buffer, mimeType: string): boolean => {
  if (TEXT_LIKE_MIME_TYPES.has(mimeType)) return looksLikeSafeText(buffer);
  const signatures = SIGNATURES[mimeType];
  if (!signatures) return true; // no known signature for this type → allow
  if (buffer.length < 4) return true; // too small to judge → allow
  return signatures.some((sig) => matches(buffer, sig));
};
