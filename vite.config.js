import { defineConfig } from 'vite';

export default defineConfig({
  base: './', // Relative base path essential for CrazyGames CDN / iframe hosting
  build: {
    target: 'es2020',
    outDir: 'dist',
    assetsDir: 'assets',
    chunkSizeWarningLimit: 1200,
  },
  server: {
    host: true,
    port: 5173,
  },
});
