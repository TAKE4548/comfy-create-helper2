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

// Offline SVGs are valid UI fixtures but have no ComfyUI image identity.
// The production gallery correctly omits React interaction handlers for them.
// Enable existing handlers only for known in-memory SVG fixtures in this mock.
function offlineFixtureGalleryInteraction(): Plugin {
  return {
    name: 'prototype-offline-gallery-interaction',
    enforce: 'pre',
    transform(source, id) {
      if (!id.replaceAll('\\', '/').endsWith('/frontend/src/pages/GeneratePage/sections/GenerationGallerySection.tsx')) return
      const expectedProps = '{...(canInteract ? itemProps : {})}'
      const expectedDisabled = 'disabled={!canInteract}'
      if (!source.includes(expectedProps) || !source.includes(expectedDisabled)) {
        throw new Error('Expected Generate gallery interaction guards not found')
      }
      return source
        .replace(expectedProps, "{...(canInteract || img.startsWith('data:image/svg+xml') ? itemProps : {})}")
        .replace(expectedDisabled, "disabled={!canInteract && !img.startsWith('data:image/svg+xml')}")
    },
  }
}

export default defineConfig({
  base: process.env.PROTOTYPE_PAGES === '1' ? '/comfy-create-helper2/' : '/',
  plugins: [pagesRouterBasename(), offlineFixtureGalleryInteraction(), react()],
  resolve: { dedupe: ['react', 'react-dom'] },
  server: {
    host: '0.0.0.0',
    port: 5391,
    strictPort: true,
    fs: { allow: [path.resolve(__dirname, '..')] },
    // No backend proxy: the baseline prototype must not contact production services.
  },
})
