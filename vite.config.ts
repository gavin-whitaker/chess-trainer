import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png', 'icons/*.svg', 'engine/*'],
      manifest: {
        name: 'Chess Trainer',
        short_name: 'Chess Trainer',
        description: 'Openings, puzzles and analysis — offline chess training',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#302e2b',
        theme_color: '#262421',
        orientation: 'portrait',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,wasm}', 'data/openings.json', 'data/puzzles/index.json'],
        globIgnores: ['data/puzzles/r*.json'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/data/puzzles/'),
            handler: 'CacheFirst',
            options: { cacheName: 'puzzle-shards', expiration: { maxEntries: 200 } },
          },
        ],
      },
    }),
  ],
});
