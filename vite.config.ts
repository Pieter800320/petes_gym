import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import pkg from './package.json' with { type: 'json' }

// Served from https://pieter800320.github.io/petes_gym/ — must match the GitHub repo name.
const BASE = '/petes_gym/'

export default defineConfig({
  base: BASE,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    react(),
    VitePWA({
      // New builds wait until Pete taps Reload (UpdateBanner), so a running app never loses the
      // lazily loaded files it was built with.
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: "Pete's Gym",
        short_name: "Pete's Gym",
        description: 'Programmes, training and client notes for Pete.',
        theme_color: '#121212',
        background_color: '#121212',
        display: 'standalone',
        start_url: BASE,
        scope: BASE,
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // App shell + fonts precached so the app opens with no signal in the gym.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Workbox silently leaves out files over 2 MB, and the main script is 1.5 MB and growing:
        // without it the app would not open offline. Keep the limit well above it.
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
      },
    }),
  ],
})
