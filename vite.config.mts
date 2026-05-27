import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import preprocess from 'svelte-preprocess';

export default defineConfig({
  plugins: [svelte({
    preprocess: preprocess(),
    onwarn(warning, defaultHandler) {
      // Suppress a11y warnings (won't block CI builds)
      if (warning.code.startsWith('a11y-')) return;
      defaultHandler(warning);
    },
  })],
  base: '/ui/',
  publicDir: false,
  build: {
    outDir: 'public',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/health': 'http://localhost:3847',
      '/api':    'http://localhost:3847',
      // Proxy root POST (JSON-RPC) — only POST, not GET (which would intercept Vite's index.html)
      '^/$': {
        target: 'http://localhost:3847',
        changeOrigin: true,
        bypass(req) {
          if (req.method === 'GET') return req.url; // let Vite serve index.html
        },
      },
    },
  },
});
