import { defineConfig } from 'tsup';

// Production bundle: dist/index.js with the shared package inlined.
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  noExternal: ['@shani/shared'],
});
