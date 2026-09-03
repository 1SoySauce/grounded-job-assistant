import { build as bundle } from 'esbuild';
import { build as buildVite } from 'vite';

await buildVite();

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
