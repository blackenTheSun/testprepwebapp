// Prints the JSON block for embedding a local PNG or JPEG in a v2 test file.
//
//   npm run embed-image -- path/to/picture.png ["Alt text describing the picture"]
//
// Paste the output as an item's "visual" (or as one panel of a "pair"). Add "callouts" if the
// picture is used for diagram-label matching. Runs directly with Node 22.6+ (type stripping).
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { inspectRaster } from '../src/contract/imageInfo.ts';

const IMAGE_MAX_BYTES = 1.5 * 1024 * 1024;

const [file, altText] = process.argv.slice(2);
if (!file) {
  console.error('Usage: npm run embed-image -- <picture.png|picture.jpg> ["alt text"]');
  process.exit(1);
}

const bytes = new Uint8Array(readFileSync(file));
const info = inspectRaster(bytes);
if (!info) {
  console.error(`${basename(file)} is not a PNG or JPEG this app can read.`);
  process.exit(1);
}
if (info.bytes > IMAGE_MAX_BYTES) {
  console.error(`${basename(file)} is ${(info.bytes / 1024 / 1024).toFixed(1)} MB; the limit is 1.5 MB. Resize or compress it first.`);
  process.exit(1);
}

const block = {
  kind: 'image',
  mediaType: info.type,
  altText: altText ?? 'DESCRIBE THIS PICTURE FOR SOMEONE WHO CANNOT SEE IT',
  width: info.width,
  height: info.height,
  data: Buffer.from(bytes).toString('base64'),
};
console.log(JSON.stringify(block, null, 2));
console.error(`${basename(file)}: ${info.type}, ${info.width}×${info.height}, ${Math.round(info.bytes / 1024)} KB`);
