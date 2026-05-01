import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// `base` controls the public path used for assets at build time.
// For GitHub Pages, set GHP_BASE to "/<repo-name>/" via env (the GitHub Action below sets it for you).
// For Vercel / Netlify / custom domain, leave it as "/".
const base = process.env.GHP_BASE ?? '/';

export default defineConfig({
  base,
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: { port: 5173, host: true },
  build: {
    outDir: 'dist',
    sourcemap: true,
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-leaflet': ['leaflet', 'react-leaflet'],
          'vendor-charts': ['chart.js', 'react-chartjs-2'],
          'vendor-xlsx': ['xlsx-js-style', 'papaparse', 'file-saver'],
        },
      },
    },
  },
});
