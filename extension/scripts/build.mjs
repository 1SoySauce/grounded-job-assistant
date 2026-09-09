import { build as bundle } from 'esbuild';
import { build as buildVite } from 'vite';
import { cp } from 'node:fs/promises';

await buildVite();
for (const directory of ['standard_fonts', 'cmaps']) {
  await cp(
    `node_modules/pdfjs-dist/${directory}`,
    `dist/pdf-assets/${directory}`,
    { recursive: true },
  );
}

await Promise.all([
  bundle({
    entryPoints: ['src/background/index.ts'],
    outfile: 'dist/background.js',
    bundle: true,
    format: 'esm',
    minify: true,
    sourcemap: true,
    target: 'chrome120',
  }),
  bundle({
    entryPoints: ['src/content/index.ts'],
    outfile: 'dist/content.js',
    bundle: true,
    format: 'iife',
    minify: true,
    sourcemap: true,
    target: 'chrome120',
  }),
]);

await import('./verify-dist.mjs');
