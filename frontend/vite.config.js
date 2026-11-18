import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    VitePWA({
      disable: mode === 'android',
      registerType: 'prompt',
      injectRegister: false,
      manifest: {
        id: '/',
        name: 'SRGOP — Gestão de Ocorrências',
        short_name: 'SRGOP',
        description: 'Sistema de Recebimento e Gerenciamento de Ocorrências Policiais.',
        lang: 'pt-BR',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        theme_color: '#132d4d',
        background_color: '#132d4d',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api(?:\/|$)/, /^\/downloads(?:\/|$)/],
        cleanupOutdatedCaches: true,
        runtimeCaching: [],
        // Web Push handlers (public/push-sw.js) run inside the generated service worker.
        importScripts: ['push-sw.js'],
      },
    }),
  ],
  server: { port: 5173, strictPort: true },
  build: {
    rollupOptions: {
      output: { manualChunks: { map: ['leaflet', 'react-leaflet'], icons: ['lucide-react'] } },
    },
  },
}));
