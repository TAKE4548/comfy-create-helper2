import { createRoot } from 'react-dom/client'
import { useRef, useState } from 'react'
import { Zap } from 'lucide-react'
import '../../src/index.css'
import { PageHeader } from '../../src/components/common/PageHeader'
import { WorkflowActionsMenu } from '../../src/pages/GeneratePage/components/WorkflowActionsMenu'
import { HeaderDropdown } from '../../src/components/common/header/HeaderDropdown'

const events: string[] = []
;(window as unknown as { __events: string[] }).__events = events
window.addEventListener('cache-resync', () => events.push('cache-resync'))
document.addEventListener('click', (e) => { if ((e.target as Element).closest('a')) e.preventDefault() })  // /settings へ遷移させない

function FutureTallAction() {            // AC-8: ヘッダーより高い内容(40項目)を持つ将来アクションの検証例
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  return (
    <div ref={ref} className="relative inline-flex">
      <button type="button" data-testid="future-action-btn" aria-expanded={open} onClick={() => setOpen((v) => !v)}
        className="px-2 py-1 text-xs border border-zinc-700 rounded">Future</button>
      <HeaderDropdown open={open} onClose={() => setOpen(false)} anchorRef={ref} align="start" data-testid="future-action-panel" className="w-[240px] p-2 bg-surface-2 border border-zinc-700 rounded-lg">
        {Array.from({ length: 40 }, (_, i) => (
          <button key={i} type="button" data-testid={`future-item-${i}`} onClick={() => events.push(`future-${i}`)} className="block w-full text-left text-xs px-2 py-2">項目 {i}</button>
        ))}
      </HeaderDropdown>
    </div>
  )
}

const workflow = { id: 1, name: 'W', json_body: {}, mappings: [], target_base_model_id: null, created_at: '2026-01-01T00:00:00Z' } as never

createRoot(document.getElementById('root')!).render(
  <div data-testid="harness-root" className="flex flex-col h-[100dvh] overflow-hidden w-full relative">
    <div data-testid="harness-header">
      <PageHeader
        title="Harness"
        icon={Zap}
        actions={
          <div className="flex items-center gap-2">
            <WorkflowActionsMenu
              workflowId={1}
              workflow={workflow}
              baseModels={[{ id: 1, name: 'SD' } as never]}
              onSaveDefaults={() => events.push('save')}
              onResetDefaults={() => events.push('reset')}
              onUpdateBaseModel={() => {}}
              onRenameWorkflow={() => events.push('rename')}
              onDuplicateWorkflow={() => events.push('copy')}
              onRescanNodes={() => events.push('rescan')}
            />
            <FutureTallAction />
          </div>
        }
      />
    </div>
    <div data-testid="harness-tabs" className="relative z-10 h-8 bg-surface-2/40">tabs</div>
    <div data-testid="harness-progress" className="sticky top-0 z-40 h-6 bg-surface-2/95">progress</div>
    <main data-testid="harness-main" className="flex-1 overflow-y-auto">
      {Array.from({ length: 80 }, (_, i) => (
        <p key={i} className="text-xs px-4 py-1">背景テキスト {i}</p>
      ))}
      <button type="button" className="px-4 py-2 text-xs border border-zinc-700 rounded">背景ボタン</button>
    </main>
  </div>,
)
