/*
 * The real app built on a stand-in backend, for looking at how screens appear (tools/ui/run.ts).
 * Firebase and the service worker are swapped for the files in fake/; everything else is the
 * app's own code. Never deployed.
 */
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url))

export default defineConfig({
  root: here('../..'),
  base: '/',
  define: { __APP_VERSION__: JSON.stringify('ui-test') },
  plugins: [react()],
  resolve: {
    alias: {
      'firebase/app': here('./fake/app.ts'),
      'firebase/auth': here('./fake/auth.ts'),
      'firebase/firestore': here('./fake/firestore.ts'),
      'virtual:pwa-register/react': here('./fake/pwa.ts'),
    },
  },
  build: { outDir: here('./dist'), emptyOutDir: true },
  preview: { port: 4179, strictPort: true },
})
