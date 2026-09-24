import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

const BRAND_HOST_SCRUB = `<script>
(function () {
  var ids = ['alteru-guest-banner', 'alteru-guest-login', 'alteru-guest-coupon', 'alteru-guest-coupon-claim'];
  function strip() {
    for (var i = 0; i < ids.length; i++) {
      var el = document.getElementById(ids[i]);
      if (el) el.remove();
    }
  }
  strip();
  var obs = new MutationObserver(strip);
  obs.observe(document.documentElement, { childList: true, subtree: true });
  setTimeout(function () { obs.disconnect(); }, 12000);
})();
</script>`;

/** Crazy Games rejects external login walls and brand chrome. Guest build only. */
function crazyGamesGuestHtml(): Plugin {
  return {
    name: 'crazygames-guest-html',
    apply: 'build',
    transformIndexHtml(html) {
      let out = html
        .replace(
          /\s*<script\b[^>]*\bsrc=["'][^"']*(?:images\.aiwaves\.tech\/alteru|alteru\.app)[^"']*["'][^>]*>\s*<\/script>/gi,
          '',
        )
        .replace(/<title>[^<]*<\/title>/i, '<title>Get Off My Grave</title>');
      if (!out.includes('alteru-guest-banner')) {
        out = out.replace('<div id="root">', `${BRAND_HOST_SCRUB}\n    <div id="root">`);
      }
      return out;
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
    ...(mode === 'crazygames' ? [crazyGamesGuestHtml()] : []),
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
