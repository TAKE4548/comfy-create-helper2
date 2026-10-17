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
      const normalized = id.replaceAll('\\', '/')
      if (normalized.endsWith('/frontend/src/pages/GeneratePage/hooks/useGenerateDisplayState.ts')) {
        const first = ['    getLongPressHandlers,','    isSelected,','    exitMultiSelectMode,'].join('\n')
        const second = ['    handleItemClick,','    getLongPressHandlers,','    isSelected,','    exitMultiSelectMode,','    selectAll,','    clearSelection,','    snapshotIdsForDisplay,'].join('\n')
        if (!source.includes(first) || !source.includes(second)) throw new Error('Selection hook structure changed')
        return source.replace(first, first.replace('    isSelected,', '    enterMultiSelectMode,\n    isSelected,'))
          .replace(second, second.replace('    isSelected,', '    enterMultiSelectMode,\n    isSelected,'))
      }
      if (!normalized.endsWith('/frontend/src/pages/GeneratePage/sections/GenerationGallerySection.tsx')) return
      const expectedProps = '{...(canInteract ? itemProps : {})}'
      const expectedDisabled = 'disabled={!canInteract}'
      if (!source.includes(expectedProps) || !source.includes(expectedDisabled)) {
        throw new Error('Expected Generate gallery interaction guards not found')
      }
      return source
        .replace('  const [thumbnailErrors,', '  const offlinePressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)\n  const offlinePressOrigin = useRef<[number,number] | null>(null)\n  const [thumbnailErrors,')
        .replace('    selectedIds,\n    selectAll,', '    selectedIds,\n    enterMultiSelectMode,\n    selectAll,')
        .replace('                  style={{ WebkitTouchCallout:', "                  onTouchStartCapture={isMobile && img.startsWith('data:image/svg+xml') && document.documentElement.dataset.prototypeVariant === 'proposal' ? (event) => {\n                    const point=event.touches[0]\n                    offlinePressOrigin.current=[point.clientX,point.clientY]\n                    if(offlinePressTimer.current)clearTimeout(offlinePressTimer.current)\n                    offlinePressTimer.current=setTimeout(()=>{offlinePressTimer.current=null;enterMultiSelectMode(img)},650)\n                  } : undefined}\n                  onTouchMoveCapture={isMobile && img.startsWith('data:image/svg+xml') ? (event) => {\n                    const point=event.touches[0],origin=offlinePressOrigin.current\n                    if(origin && Math.hypot(point.clientX-origin[0],point.clientY-origin[1])>12){\n                      if(offlinePressTimer.current)clearTimeout(offlinePressTimer.current)\n                      offlinePressTimer.current=null;offlinePressOrigin.current=null\n                    }\n                  } : undefined}\n                  onTouchEndCapture={() => {\n                    if(offlinePressTimer.current)clearTimeout(offlinePressTimer.current)\n                    offlinePressTimer.current=null;offlinePressOrigin.current=null\n                  }}\n                  style={{ WebkitTouchCallout:")
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
