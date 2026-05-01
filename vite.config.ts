import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

const base = process.env.GHP_BASE ?? '/';

export default defineConfig({
  base,
  plugins: [react()],
  resolve: {
    alias: [
      { find: '@/pages',      replacement: path.resolve(__dirname, '.') },
      { find: '@/components', replacement: path.resolve(__dirname, '.') },
      { find: '@/lib',        replacement: path.resolve(__dirname, '.') },
      { find: '@',            replacement: path.resolve(__dirname, '.') },
    ],
  },
});
