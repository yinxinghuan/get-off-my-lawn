import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

/** Crazy Games rejects the AlterU guest-shell login wall. Drop it from that build only. */
function stripAlteruGuestShell(): Plugin {
  return {
    name: 'strip-alteru-guest-shell',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        /\s*<script\b[^>]*\bsrc=["']https:\/\/images\.aiwaves\.tech\/alteru\/guest-shell\.js["'][^>]*>\s*<\/script>/gi,
        '',
      );
    },
  };
}

export default defineConfig(({ mode }) => ({
  // Relative base so the bundle loads inside a Crazy Games (or Pages) iframe
  // regardless of the host path.
  base: './',
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@lab': path.resolve(__dirname, 'src/lab'),
    },
  },
  plugins: [
    react(),
    ...(mode === 'crazygames' ? [stripAlteruGuestShell()] : []),
  ],
  css: {
    preprocessorOptions: {
      less: { javascriptEnabled: true },
    },
  },
  build: {
    outDir: mode === 'crazygames' ? 'dist-crazygames' : 'dist',
    emptyOutDir: true,
  },
}));
