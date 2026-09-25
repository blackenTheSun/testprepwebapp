// Renders the generic placeholder pictures used by the v0.3 placeholder fixture and tests.
//   node scripts/make-placeholder-images.mjs
// Output: tests/fixtures/images/shapes-lineup.png, shaded-ball.jpg
// These are deliberately generic shapes, not course content.
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const out = resolve(dirname(fileURLToPath(import.meta.url)), '../tests/fixtures/images');
mkdirSync(out, { recursive: true });

const shapes = `
<svg xmlns="http://www.w3.org/2000/svg" width="400" height="160" viewBox="0 0 400 160">
  <rect width="400" height="160" fill="#ffffff"/>
  <circle cx="40" cy="80" r="26" fill="#2f6fd0"/>
  <rect x="96" y="54" width="52" height="52" fill="#e08a1e"/>
  <polygon points="200,52 228,106 172,106" fill="#2e9d57"/>
  <polygon points="280,80 267,57 241,57 228,80 241,103 267,103" transform="translate(12,0)" fill="#7b4bc4"/>
  <polygon points="360,52 367,72 388,72 371,85 377,106 360,93 343,106 349,85 332,72 353,72" fill="#c73737"/>
</svg>`;

const ball = `
<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
  <defs>
    <radialGradient id="g" cx="38%" cy="35%" r="65%">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="35%" stop-color="#8fb0e0"/>
      <stop offset="100%" stop-color="#1d3f78"/>
    </radialGradient>
  </defs>
  <rect width="200" height="200" fill="#e9e4da"/>
  <ellipse cx="104" cy="172" rx="62" ry="12" fill="#c9c2b4"/>
  <circle cx="100" cy="96" r="70" fill="url(#g)"/>
</svg>`;

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const [name, svg, width, height, type] of [
  ['shapes-lineup.png', shapes, 400, 160, 'png'],
  ['shaded-ball.jpg', ball, 200, 200, 'jpeg'],
]) {
  await page.setViewportSize({ width, height });
  await page.setContent(`<html><body style="margin:0">${svg}</body></html>`);
  await page.screenshot({ path: resolve(out, name), type, quality: type === 'jpeg' ? 80 : undefined, clip: { x: 0, y: 0, width, height } });
  console.log(`wrote ${name}`);
}
await browser.close();
