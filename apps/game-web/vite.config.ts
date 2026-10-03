import { defineConfig } from 'vite';

export default defineConfig({
  // Read VITE_* variables from the monorepo root .env.
  envDir: '../../',
  server: { port: 5173, strictPort: true },
  build: {
    target: 'es2022',
    sourcemap: true,
    chunkSizeWarningLimit: 6000,
    rollupOptions: {
      output: {
        // Keep the engine in its own long-cached chunk.
        manualChunks: (id) => (id.includes('@babylonjs') ? 'babylon' : undefined),
      },
    },
  },
});
