import { defineConfig } from 'tsup';

// Bundles workspace packages (@mmo/*, which ship TypeScript source) into one ESM file.
// Every npm dependency stays external, so each runtime dependency reached through an @mmo/*
// package must also be declared in this service's package.json (pnpm is strict).
export default defineConfig({
  entry: ['src/main.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  skipNodeModulesBundle: true,
  noExternal: [/^@mmo\//],
});
