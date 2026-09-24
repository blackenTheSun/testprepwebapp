import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

/**
 * KaTeX's stylesheet lists woff2, woff and ttf for every font. Every browser we target
 * supports woff2, so drop the other two before the fonts are inlined as data URIs.
 * This keeps the single-file output under ~1 MB.
 */
function katexWoff2Only(): Plugin {
  return {
    name: 'katex-woff2-only',
    enforce: 'pre',
    transform(code, id) {
      if (!/katex(\.min)?\.css/.test(id)) return null;
      return code.replace(/,\s*url\([^)]*\.woff\)\s*format\("woff"\)\s*,\s*url\([^)]*\.ttf\)\s*format\("truetype"\)/g, '');
    },
  };
}

/**
 * Build-only Content-Security-Policy: blocks every network request and eval, so the
 * delivered page provably runs offline and never executes code from a test file.
 * (Not applied to the dev server, which needs a websocket for hot reload.)
 */
function offlineCsp(): Plugin {
  const policy = [
    "default-src 'none'",
    "script-src 'unsafe-inline'",
    "style-src 'unsafe-inline'",
    'font-src data:',
    'img-src data: blob:',
    "connect-src 'none'",
  ].join('; ');
  return {
    name: 'offline-csp',
    apply: 'build',
    transformIndexHtml: (html) =>
      html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`),
  };
}

export default defineConfig({
  base: './',
  plugins: [katexWoff2Only(), offlineCsp(), react(), viteSingleFile({ removeViteModuleLoader: true })],
  build: {
    target: 'es2020',
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    cssCodeSplit: false,
    reportCompressedSize: false,
  },
});
