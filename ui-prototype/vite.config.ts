import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// Only the isolated Pages build gets a router basename. Production App.tsx is unchanged.
function pagesRouterBasename(): Plugin {
  return {
    name: 'prototype-pages-router-basename',
    enforce: 'pre',
    transform(source, id) {
      if (process.env.PROTOTYPE_PAGES !== '1' || !id.replaceAll('\\', '/').endsWith('/frontend/src/App.tsx')) return
      if (!source.includes('<BrowserRouter>')) throw new Error('Expected production BrowserRouter not found')
      return source.replace('<BrowserRouter>', '<BrowserRouter basename={import.meta.env.BASE_URL}>')
    },
  }
}

export default defineConfig({
  base: process.env.PROTOTYPE_PAGES === '1' ? '/comfy-create-helper2/' : '/',
  plugins: [pagesRouterBasename(), react()],
  resolve: { dedupe: ['react', 'react-dom'] },
  server: {
    host: '0.0.0.0',
    port: 5391,
    strictPort: true,
    fs: { allow: [path.resolve(__dirname, '..')] },
    // No backend proxy: the baseline prototype must not contact production services.
  },
})
