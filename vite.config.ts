import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  base: './',
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@lab': path.resolve(__dirname, 'src/lab'),
    },
  },
  plugins: [react()],
  css: {
    preprocessorOptions: {
      less: { javascriptEnabled: true },
    },
  },
});
