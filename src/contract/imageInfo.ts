/**
 * Minimal, dependency-free inspection of embedded raster images: base64 decoding, format
 * detection by magic number, and pixel dimensions. Used by the v2 asset validation rule and by
 * `scripts/embed-image.ts` (run directly by Node, so this file has no imports).
 */

export type RasterType = 'image/png' | 'image/jpeg';

export interface RasterInfo {
  type: RasterType;
  width: number;
  height: number;
  bytes: number;
}

/** Decoded byte count of a base64 string without decoding it. */
export function base64ByteLength(data: string): number {
  const padding = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0;
  return Math.floor((data.length * 3) / 4) - padding;
}

export function decodeBase64(data: string): Uint8Array {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function detectRasterType(bytes: Uint8Array): RasterType | undefined {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  return undefined;
}

function pngSize(bytes: Uint8Array): { width: number; height: number } | undefined {
  // Signature (8) + IHDR length (4) + "IHDR" (4), then width and height as big-endian uint32.
  if (bytes.length < 24) return undefined;
  const read = (o: number) => ((bytes[o] << 24) | (bytes[o + 1] << 16) | (bytes[o + 2] << 8) | bytes[o + 3]) >>> 0;
  return { width: read(16), height: read(20) };
}

function jpegSize(bytes: Uint8Array): { width: number; height: number } | undefined {
  // Walk segments until a start-of-frame marker (SOF0–SOF15 except DHT/JPG/DAC).
  let o = 2;
  while (o + 9 < bytes.length) {
    if (bytes[o] !== 0xff) return undefined;
    const marker = bytes[o + 1];
    const length = (bytes[o + 2] << 8) | bytes[o + 3];
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) return { height: (bytes[o + 5] << 8) | bytes[o + 6], width: (bytes[o + 7] << 8) | bytes[o + 8] };
    o += 2 + length;
  }
  return undefined;
}

/** Returns format and size, or undefined when the bytes are not a PNG/JPEG this app can read. */
export function inspectRaster(bytes: Uint8Array): RasterInfo | undefined {
  const type = detectRasterType(bytes);
  if (!type) return undefined;
  const size = type === 'image/png' ? pngSize(bytes) : jpegSize(bytes);
  if (!size || size.width === 0 || size.height === 0) return undefined;
  return { type, ...size, bytes: bytes.length };
}
