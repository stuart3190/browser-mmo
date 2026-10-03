import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  envDir: '../../',
  server: { port: 5174, strictPort: true },
  build: { target: 'es2022', sourcemap: true },
});
