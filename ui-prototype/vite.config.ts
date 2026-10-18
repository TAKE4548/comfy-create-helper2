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

// Inject offline review data ONLY into the proposal render of Studio evaluation.
function studioEvaluationFixtures(): Plugin {
  return {
    name: 'prototype-studio-evaluation-fixtures',
    enforce: 'pre',
    transform(source,id){
      if(!id.replaceAll('\\','/').endsWith('/frontend/src/pages/DatasetStudioPage/index.tsx'))return
      const anchor='<BenchmarkGrid'
      if(!source.includes(anchor))throw new Error('Studio evaluation component changed')
      const imported="import { studioBenchmarkCells, studioBenchmarkSweetSpot } from '../../../../ui-prototype/src/studioFixtures'\n"
      return imported+source.replace(anchor,
        "<BenchmarkGrid initialCells={studioBenchmarkCells} initialSweetSpot={studioBenchmarkSweetSpot}")
    }
  }
}


// Studio caption visual review: production component remains untouched.
function studioCaptionProposal(): Plugin {
  return {
    name:'prototype-studio-caption-proposal',
    enforce:'pre',
    transform(source,id){
      if(!id.replaceAll('\\\\','/').endsWith('/frontend/src/pages/DatasetStudioPage/components/CaptionEditorCard.tsx'))return
      const anchor='  return ('
      if(!source.includes(anchor))throw new Error('Studio caption component changed')
      const imports="import { TagChipInput } from '../../../components/TagChipInput'\nimport { useStudioStore } from '../useStudioStore'\n"
      const setup=`  const proposal = document.documentElement.dataset.prototypeVariant === 'proposal'
  const step = useStudioStore(s => s.currentStep)
  const image = useStudioStore(s => s.items.find(item => item.id === itemId)?.image_path)
  const [chipMode, setChipMode] = React.useState(true)
  if (proposal && step === 3) {
    return (
      <div data-studio-caption-card="" className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-2 flex gap-3 min-w-0">
        <div className="w-[92px] flex-shrink-0">
          <div className="text-[11px] text-zinc-400 mb-1">#{slotIndex + 1}</div>
          {image ? <img src={image} alt={\`素材 #\${slotIndex + 1}\`} className="w-full aspect-[3/4] object-cover rounded-md" /> : <div className="aspect-[3/4] rounded-md bg-zinc-800 flex items-center justify-center text-xs text-zinc-400">画像なし</div>}
        </div>
        <div className="flex-1 min-w-0 flex flex-col gap-2">
          <div className="flex justify-between items-center gap-2">
            <span className="text-xs font-semibold text-zinc-200">キャプション</span>
            <button type="button" data-testid={\`caption-mode-toggle-\${itemId}\`} aria-pressed={chipMode} onClick={() => setChipMode(v=>!v)} className="text-[11px] border border-zinc-700 rounded px-2 py-1 text-indigo-300">{chipMode ? 'テキスト入力へ' : 'チップ入力へ'}</button>
          </div>
          {chipMode ? <div data-testid={\`caption-chip-editor-\${itemId}\`}><TagChipInput value={caption} onChange={onChange} placeholder="タグを追加…" variant="neutral" /></div> :
            <textarea data-testid={\`caption-editor-\${itemId}\`} value={caption} onChange={e=>onChange(e.target.value)} className="w-full min-h-[90px] bg-zinc-950 border border-zinc-700 rounded p-2 text-xs text-zinc-200 resize-y" placeholder="カンマ区切りのキャプション…" />}
        </div>
      </div>
    )
  }
`
      return imports+source.replace(anchor,setup+anchor)
    }
  }
}

export default defineConfig({
  base: process.env.PROTOTYPE_PAGES === '1' ? '/comfy-create-helper2/' : '/',
  plugins: [pagesRouterBasename(), offlineFixtureGalleryInteraction(), studioEvaluationFixtures(), studioCaptionProposal(), react()],
  resolve: { dedupe: ['react', 'react-dom'] },
  server: {
    host: '0.0.0.0',
    port: 5391,
    strictPort: true,
    fs: { allow: [path.resolve(__dirname, '..')] },
    // No backend proxy: the baseline prototype must not contact production services.
  },
})
