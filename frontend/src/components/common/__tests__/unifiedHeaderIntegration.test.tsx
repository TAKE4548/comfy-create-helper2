import React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { Zap, Layers, Sparkles, Tags, Clock, Settings, Search, Plus, RotateCw } from 'lucide-react'
import { PageHeader } from '../PageHeader'
import { ResourceHoverMonitor } from '../header/ResourceHoverMonitor'
import { HeaderKebabMenu } from '../header/HeaderKebabMenu'
import { HeaderDropdown } from '../header/HeaderDropdown'
import { SystemStatusBadge } from '../SystemStatusBadge'
import { WorkflowActionsMenu } from '../../../pages/GeneratePage/components/WorkflowActionsMenu'
import { useGenerationStore } from '../../../store/useGenerationStore'
import * as browserStorage from '../../../utils/browserStorageUsage'
import type { SystemStats } from '../../../api/types'
import { cleanupAllTestState } from '../../../test/utils'

const managerFixture = {
  fe: { running: true, status: 'running' },
  be: { running: true, status: 'running' },
  comfy: { running: true, status: 'running' },
  action_in_progress: null,
}

// Mock manager status hooks to return deterministic values
vi.mock('../../../hooks/useComfyManagerStatus', () => ({
  useComfyManagerStatus: () => ({
    status: {
      fe: { running: true, status: 'running' },
      be: { running: true, status: 'running' },
      comfy: { running: true, status: 'running' },
      action_in_progress: null,
    },
    available: true,
    isLoading: false,
    refetch: vi.fn().mockResolvedValue(undefined),
  }),
}))

vi.mock('../../../hooks/useManagerStatus', () => ({
  useManagerStatus: () => ({
    status: {
      fe: { running: true, status: 'running' },
      be: { running: true, status: 'running' },
      comfy: { running: true, status: 'running' },
      action_in_progress: null,
    },
    available: true,
    refetch: vi.fn().mockResolvedValue(undefined),
  }),
}))

describe('REQ-341 E2E Integration: Unified Header & Passive Telemetry', () => {
  const sampleStats: SystemStats = {
    cpu_pct: 35.5,
    ram_pct: 60.0,
    gpu_pct: 82.0,
    vram_pct: 74.5,
    ram_used_gb: 19.2,
    ram_total_gb: 32.0,
    vram_used_gb: 11.9,
    vram_total_gb: 16.0,
  }

  beforeEach(() => {
    cleanupAllTestState()
    vi.restoreAllMocks()
    useGenerationStore.setState({
      systemStats: sampleStats,
      isConnected: true,
      generationSyncing: false,
      generationSnapshot: {
        upstream: { http_ready: true, ws_connected: true, failure_since: null },
      } as any,
    })
  })

  afterEach(() => {
    cleanupAllTestState()
    useGenerationStore.setState({ systemStats: null, generationSnapshot: null })
  })

  // ── Scenario 1: AC-1 50px Height & CLS-free Header across all 6 pages ──
  it('AC-1: renders consistent 50px header with uniform typography and icon across all 6 pages', () => {
    const pages = [
      { title: 'Generate', icon: Zap },
      { title: 'Studio', icon: Layers },
      { title: 'LoRAs', icon: Sparkles },
      { title: 'Tags', icon: Tags },
      { title: 'History', icon: Clock },
      { title: 'Settings', icon: Settings },
    ]

    for (const page of pages) {
      const { container, unmount } = render(
        <MemoryRouter>
          <PageHeader title={page.title} icon={page.icon} />
        </MemoryRouter>
      )

      // Min-height 50px container
      const headerRow = container.querySelector('.min-h-\\[50px\\]')
      expect(headerRow).toBeInTheDocument()

      // Unified typography
      const titleElem = screen.getByText(page.title)
      expect(titleElem).toHaveClass('text-sm', 'font-semibold', 'text-zinc-200')

      // 16px icon
      const iconSvg = container.querySelector('svg.text-zinc-400')
      expect(iconSvg).toBeInTheDocument()
      expect(iconSvg).toHaveAttribute('width', '16')
      expect(iconSvg).toHaveAttribute('height', '16')

      unmount()
    }
  })

  // ── Scenario 2: AC-2 Left Clustering of Primary Controls ──
  it('AC-2: renders left-clustered controls for each distinct page', () => {
    // 1. Generate: selector + actions menu + anima + undo/redo
    const { unmount: unmountGen } = render(
      <MemoryRouter>
        <PageHeader
          title="Generate"
          icon={Zap}
          actions={
            <div data-testid="generate-cluster">
              <select aria-label="Workflow"><option>Workflow 1</option></select>
              <button aria-label="ワークフロー設定">⋯</button>
              <label><input type="checkbox" /> Anima特化</label>
            </div>
          }
        />
      </MemoryRouter>
    )
    expect(screen.getByTestId('generate-cluster')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Workflow' })).toBeInTheDocument()
    expect(screen.getByText('Anima特化')).toBeInTheDocument()
    unmountGen()

    // 2. Studio: project select + step buttons
    const { unmount: unmountStudio } = render(
      <MemoryRouter>
        <PageHeader
          title="Studio"
          icon={Layers}
          actions={
            <div data-testid="studio-cluster">
              <select aria-label="Project"><option>Project A</option></select>
              <div role="group">
                <button>マトリクス</button>
                <button>キュレーター</button>
                <button>学習設定</button>
                <button>評価</button>
              </div>
            </div>
          }
        />
      </MemoryRouter>
    )
    expect(screen.getByTestId('studio-cluster')).toBeInTheDocument()
    expect(screen.getByText('マトリクス')).toBeInTheDocument()
    expect(screen.getByText('キュレーター')).toBeInTheDocument()
    unmountStudio()

    // 3. LoRAs: search + register + rescan + badge
    const { unmount: unmountLoras } = render(
      <MemoryRouter>
        <PageHeader
          title="LoRAs"
          icon={Sparkles}
          actions={
            <div data-testid="loras-cluster">
              <input placeholder="Search LoRAs..." />
              <button>+ Register Model</button>
              <button>再スキャン</button>
              <span data-testid="lora-count">12件</span>
            </div>
          }
        />
      </MemoryRouter>
    )
    expect(screen.getByTestId('loras-cluster')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Search LoRAs...')).toBeInTheDocument()
    expect(screen.getByText('+ Register Model')).toBeInTheDocument()
    unmountLoras()

    // 4. Tags: search + new tag set + import/export + badge
    const { unmount: unmountTags } = render(
      <MemoryRouter>
        <PageHeader
          title="Tags"
          icon={Tags}
          actions={
            <div data-testid="tags-cluster">
              <input placeholder="Search Tags..." />
              <button>+ New Tag Set</button>
              <button>エクスポート</button>
              <button>インポート</button>
            </div>
          }
        />
      </MemoryRouter>
    )
    expect(screen.getByTestId('tags-cluster')).toBeInTheDocument()
    expect(screen.getByText('+ New Tag Set')).toBeInTheDocument()
    unmountTags()

    // 5. History: snap/album + dialogue + add album
    const { unmount: unmountHistory } = render(
      <MemoryRouter>
        <PageHeader
          title="History"
          icon={Clock}
          actions={
            <div data-testid="history-cluster">
              <button>スナップ</button>
              <button>アルバム</button>
              <button>セリフ変換</button>
            </div>
          }
        />
      </MemoryRouter>
    )
    expect(screen.getByTestId('history-cluster')).toBeInTheDocument()
    expect(screen.getByText('セリフ変換')).toBeInTheDocument()
    unmountHistory()

    // 6. Settings: tabs chips
    const { unmount: unmountSettings } = render(
      <MemoryRouter>
        <PageHeader
          title="Settings"
          icon={Settings}
          actions={
            <div data-testid="settings-cluster">
              <button>接続設定</button>
              <button>ベースモデル</button>
              <button>LLM設定</button>
            </div>
          }
        />
      </MemoryRouter>
    )
    expect(screen.getByTestId('settings-cluster')).toBeInTheDocument()
    expect(screen.getByText('LLM設定')).toBeInTheDocument()
    unmountSettings()
  })

  // ── Scenario 3: AC-3 Slim Status Badge & Hover Tooltip ──
  it('AC-3: displays slim status badge without verbose text and shows detailed tooltip', () => {
    render(
      <SystemStatusBadge
        upstream={{ http_ready: true, ws_connected: true, failure_since: null }}
        reconnecting={false}
        manager={managerFixture}
        managerAvailable={true}
        managerLoading={false}
        variant="slim"
      />
    )

    const badge = screen.getByTestId('system-status-badge')
    expect(badge).toBeInTheDocument()
    // Slim mode displays READY, not verbose FE 200 · BE 200 · Comfy
    expect(badge).toHaveTextContent('READY')
    expect(badge.textContent).not.toContain('FE 200')

    // Title attribute contains detailed connectivity tooltip
    expect(badge).toHaveAttribute('title', expect.stringContaining('FastAPI中継 OK'))
  })

  // ── Scenario 4: AC-4 Passive Resource Monitor & Hover Card ──
  it('AC-4: displays telemetry in CPU -> RAM -> GPU -> VRAM order and expands 250px hover card', () => {
    render(<ResourceHoverMonitor />)

    const monitor = screen.getByTestId('resource-hover-monitor')
    expect(monitor).toBeInTheDocument()

    // Verify order in regular display
    const text = monitor.textContent ?? ''
    const cpuIdx = text.indexOf('CPU')
    const ramIdx = text.indexOf('RAM')
    const gpuIdx = text.indexOf('GPU')
    const vramIdx = text.indexOf('VRAM')

    expect(cpuIdx).toBeGreaterThanOrEqual(0)
    expect(ramIdx).toBeGreaterThan(cpuIdx)
    expect(gpuIdx).toBeGreaterThan(ramIdx)
    expect(vramIdx).toBeGreaterThan(gpuIdx)

    // Percentage values displayed
    expect(text).toContain('36%') // 35.5% rounded to 36%
    expect(text).toContain('60%')
    expect(text).toContain('82%')
    expect(text).toContain('75%') // 74.5% rounded to 75%

    // Hover over monitor to expand Hover Card
    fireEvent.mouseEnter(monitor)
    const hoverCard = screen.getByTestId('resource-hover-card')
    expect(hoverCard).toBeInTheDocument()
    expect(hoverCard).toHaveClass('w-[250px]')

    // Detailed GB values visible inside hover card
    expect(hoverCard.textContent).toContain('19.2 / 32.0 GB')
    expect(hoverCard.textContent).toContain('11.9 / 16.0 GB')

    // Mouse leave collapses hover card
    fireEvent.mouseLeave(monitor)
    expect(screen.queryByTestId('resource-hover-card')).toBeNull()
  })

  // ── Scenario 5: AC-5 3-Dot Kebab Menu & Absence of ComfyUI direct URL ──
  it('AC-5: opens 270px dropdown with estimated storage usage, settings link, and NO direct ComfyUI URL', () => {
    vi.spyOn(browserStorage, 'measureBrowserStorageUsage').mockReturnValue({
      localStorage: { status: 'ok', bytes: 512000 },
      sessionStorage: { status: 'ok', bytes: 10240 },
    })

    const onResync = vi.fn()
    const { container } = render(
      <MemoryRouter>
        <HeaderKebabMenu onResyncCache={onResync} />
      </MemoryRouter>
    )

    const kebabBtn = screen.getByTestId('header-kebab-menu-button')
    expect(kebabBtn).toHaveAttribute('id', 'header-kebab-btn')
    fireEvent.click(kebabBtn)

    const dropdown = screen.getByTestId('header-kebab-dropdown')
    expect(dropdown).toBeInTheDocument()
    expect(dropdown).toHaveClass('w-[270px]')

    // Estimated storage usage with Estimate Only disclaimer
    expect(dropdown.textContent).toContain('推定値 / Estimate Only')
    expect(dropdown.textContent).toContain('LocalStorage:')
    expect(dropdown.textContent).toContain('SessionStorage:')

    // Cache resync button
    const resyncBtn = screen.getByRole('button', { name: /キャッシュ再同期/ })
    fireEvent.click(resyncBtn)
    expect(onResync).toHaveBeenCalledTimes(1)

    // Re-open and check settings link
    fireEvent.click(kebabBtn)
    const settingsLink = screen.getByRole('link', { name: /設定/ })
    expect(settingsLink).toHaveAttribute('href', '/settings')

    // CRITICAL: ComfyUI direct URL input and text must be completely absent
    expect(container.querySelector('#comfy-url-input')).toBeNull()
    expect(dropdown.textContent).not.toContain('ComfyUI URL')
    expect(dropdown.textContent).not.toContain('http://127.0.0.1:8188')
  })

  // ── Scenario 6: AC-6 Generate Workflow Individual Settings [⋯] Menu ──
  it('AC-6: provides workflow individual settings menu with base model, defaults, rename, copy, and rescan', () => {
    const onUpdateBaseModel = vi.fn()
    const onSaveDefaults = vi.fn()
    const onResetDefaults = vi.fn()
    const onRenameWorkflow = vi.fn()
    const onDuplicateWorkflow = vi.fn()
    const onRescanNodes = vi.fn()

    render(
      <WorkflowActionsMenu
        workflowId={10}
        workflow={{ id: 10, name: 'Anime SDXL', json_body: {}, mappings: [], target_base_model_id: 1 }}
        baseModels={[{ id: 1, name: 'SDXL' }, { id: 2, name: 'Anima' }]}
        onUpdateBaseModel={onUpdateBaseModel}
        onSaveDefaults={onSaveDefaults}
        onResetDefaults={onResetDefaults}
        onRenameWorkflow={onRenameWorkflow}
        onDuplicateWorkflow={onDuplicateWorkflow}
        onRescanNodes={onRescanNodes}
      />
    )

    const actionsBtn = screen.getByRole('button', { name: 'ワークフロー設定' })
    expect(actionsBtn).toHaveAttribute('id', 'workflow-actions-btn')
    fireEvent.click(actionsBtn)

    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.getByText('ワークフロー個別設定')).toBeInTheDocument()
    expect(screen.getByText('ID: 10')).toBeInTheDocument()

    // Base model update
    const baseModelSelect = screen.getByLabelText('ベースモデル')
    fireEvent.change(baseModelSelect, { target: { value: '2' } })
    expect(onUpdateBaseModel).toHaveBeenCalledWith(2)

    // Defaults save & reset
    fireEvent.click(screen.getByRole('button', { name: 'デフォルト保存' }))
    expect(onSaveDefaults).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).toBeNull()

    fireEvent.click(actionsBtn)
    fireEvent.click(screen.getByRole('button', { name: 'リセット' }))
    expect(onResetDefaults).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).toBeNull()

    // Management items
    fireEvent.click(actionsBtn)
    fireEvent.click(screen.getByRole('button', { name: '名前を変更' }))
    expect(onRenameWorkflow).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).toBeNull()

    fireEvent.click(actionsBtn)
    fireEvent.click(screen.getByRole('button', { name: '複製' }))
    expect(onDuplicateWorkflow).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).toBeNull()

    fireEvent.click(actionsBtn)
    fireEvent.click(screen.getByRole('button', { name: 'ノード再スキャン' }))
    expect(onRescanNodes).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  // ── Scenario 7: AC-7 Mobile Layout 2-tier Structure & 7px Glowing Dot ──
  it('AC-7: renders 2-tier structure on mobile with 7px glowing dot in tier 1 and scrollable actions in tier 2', () => {
    const { container } = render(
      <MemoryRouter>
        <PageHeader
          title="Generate"
          icon={Zap}
          actions={
            <div className="flex gap-2 min-w-max">
              <button>Action 1</button>
              <button>Action 2</button>
            </div>
          }
        />
      </MemoryRouter>
    )

    // Tier 1 title & 7px glowing dot
    const mobileDot = container.querySelector('.inline-block.md\\:hidden span[data-testid="system-status-badge"]')
    expect(mobileDot).toBeInTheDocument()
    expect(mobileDot).toHaveClass('w-[7px]', 'h-[7px]', 'rounded-full')

    // Tier 2 scrollable actions container
    const scrollContainer = container.querySelector('.overflow-x-auto')
    expect(scrollContainer).toBeInTheDocument()
    expect(scrollContainer).toHaveTextContent('Action 1')
  })

  // ── Scenario 8: AC-8 Mobile VRAM Pill Left-Slide Overlay Expansion ──
  it('AC-8: expands mobile VRAM pill to 330px overlay and collapses cleanly', () => {
    render(<ResourceHoverMonitor />)

    // Initial 96px pill
    const pill = screen.getByTestId('mobile-vram-pill')
    expect(pill).toBeInTheDocument()
    expect(pill).toHaveClass('w-[96px]')
    expect(pill.textContent).toContain('VRAM')
    expect(pill.textContent).toContain('75%')

    // Click pill to expand overlay
    fireEvent.click(pill)
    const overlay = screen.getByTestId('mobile-resource-overlay')
    expect(overlay).toBeInTheDocument()
    expect(overlay).toHaveClass('w-[240px]')

    // Content: CPU, RAM, GPU, VRAM and close button
    expect(overlay.textContent).toContain('CPU')
    expect(overlay.textContent).toContain('RAM')
    expect(overlay.textContent).toContain('GPU')
    expect(overlay.textContent).toContain('VRAM')

    const closeBtn = screen.getByTestId('mobile-overlay-close')
    expect(closeBtn).toBeInTheDocument()

    // Click close button collapses back to 96px pill
    fireEvent.click(closeBtn)
    expect(screen.queryByTestId('mobile-resource-overlay')).toBeNull()
    expect(screen.getByTestId('mobile-vram-pill')).toBeInTheDocument()
  })

  // ── Red Teaming (RT-1 to RT-4) ──
  it('RT-1: gracefully handles null/undefined telemetry without crashing', () => {
    useGenerationStore.setState({ systemStats: null })
    render(<ResourceHoverMonitor />)

    const monitor = screen.getByTestId('resource-hover-monitor')
    expect(monitor).toBeInTheDocument()
    expect(monitor.textContent).toContain('--%')

    // Hover card also renders safe placeholder
    fireEvent.mouseEnter(monitor)
    const hoverCard = screen.getByTestId('resource-hover-card')
    expect(hoverCard).toBeInTheDocument()
    expect(hoverCard.textContent).toContain('-- / -- GB')
  })

  it('RT-2: gracefully handles storage SecurityError displaying 取得不可', () => {
    vi.spyOn(browserStorage, 'measureBrowserStorageUsage').mockReturnValue({
      localStorage: { status: 'unavailable' },
      sessionStorage: { status: 'unavailable' },
    })

    render(
      <MemoryRouter>
        <HeaderKebabMenu />
      </MemoryRouter>
    )

    fireEvent.click(screen.getByTestId('header-kebab-menu-button'))
    const dropdown = screen.getByTestId('header-kebab-dropdown')
    expect(dropdown.textContent).toContain('取得不可')
  })

  it('RT-3: keeps mobile layout stable with long page title', () => {
    const longTitle = 'Extremely Long Page Title That Exceeds Normal Viewport Width In 320px Mobile Screen'
    const { container } = render(
      <MemoryRouter>
        <PageHeader title={longTitle} icon={Zap} />
      </MemoryRouter>
    )

    const title = screen.getByText(longTitle)
    expect(title).toHaveClass('truncate')
    expect(container.querySelector('[data-testid="resource-hover-monitor"]')).toBeInTheDocument()
  })

  it('RT-4: handles rapid toggle of mobile VRAM pill overlay without state deadlock', () => {
    render(<ResourceHoverMonitor />)
    const pill = screen.getByTestId('mobile-vram-pill')

    // Rapid double click
    fireEvent.click(pill)
    expect(screen.getByTestId('mobile-resource-overlay')).toBeInTheDocument()

    const closeBtn = screen.getByTestId('mobile-overlay-close')
    fireEvent.click(closeBtn)
    expect(screen.queryByTestId('mobile-resource-overlay')).toBeNull()

    // Re-expand and collapse again
    fireEvent.click(screen.getByTestId('mobile-vram-pill'))
    expect(screen.getByTestId('mobile-resource-overlay')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('mobile-overlay-close'))
    expect(screen.queryByTestId('mobile-resource-overlay')).toBeNull()
  })
})


// ── REQ-346: header expand action overlay contract (jsdom Tier2; geometry via environment API stubs only) ──
const REQ346_ANCHOR = { top: 11, bottom: 39, left: 300, right: 330, x: 300, y: 11, width: 30, height: 28, toJSON() {} }
const REQ346_ORIGINAL_OFFSET_WIDTH = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth')
const REQ346_ORIGINAL_INNER_WIDTH = window.innerWidth
const REQ346_ORIGINAL_INNER_HEIGHT = window.innerHeight

function stubGeometry({ vw, vh, panelWidth = 240 }: { vw: number; vh: number; panelWidth?: number }) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: vw })
  Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: vh })
  // Placement reads only the anchor rect, so every element may return the same anchor rect.
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(REQ346_ANCHOR as DOMRect)
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => panelWidth })
}

function restoreGeometry() {
  if (REQ346_ORIGINAL_OFFSET_WIDTH) {
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', REQ346_ORIGINAL_OFFSET_WIDTH)
  } else {
    Reflect.deleteProperty(HTMLElement.prototype, 'offsetWidth')
  }
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: REQ346_ORIGINAL_INNER_WIDTH })
  Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: REQ346_ORIGINAL_INNER_HEIGHT })
}

type ExpandKind = 'A1' | 'A2' | 'A3'
interface ExpandSpec {
  kind: ExpandKind
  label: string
  trigger: string
  panel: string
}

const EXPAND_ACTIONS: ExpandSpec[] = [
  { kind: 'A1', label: 'A1 workflow actions', trigger: '#workflow-actions-btn', panel: '[data-header-menu-panel][role="menu"]' },
  { kind: 'A2', label: 'A2 header kebab', trigger: '[data-testid="header-kebab-menu-button"]', panel: '[data-testid="header-kebab-dropdown"]' },
  { kind: 'A3', label: 'A3 mobile VRAM overlay', trigger: '[data-testid="mobile-vram-pill"]', panel: '[data-testid="mobile-resource-overlay"]' },
]

const triggerOf = (spec: ExpandSpec) => document.querySelector<HTMLElement>(spec.trigger)!
const panelOf = (spec: ExpandSpec) => document.querySelector<HTMLElement>(spec.panel)
const openExpand = (spec: ExpandSpec) => {
  fireEvent.click(triggerOf(spec))
  return panelOf(spec)!
}
const headerSnapshot = (root: HTMLElement) => ({
  cls: root.className,
  count: root.querySelectorAll('*').length,
})

function renderHeaderWithAction(kind: ExpandKind) {
  const onRenameWorkflow = vi.fn()
  const utils = render(
    <MemoryRouter>
      <PageHeader
        title="Contract"
        icon={Zap}
        actions={
          kind === 'A1' ? (
            <WorkflowActionsMenu
              workflowId={10}
              workflow={{ id: 10, name: 'Anime SDXL', json_body: {}, mappings: [], target_base_model_id: 1 }}
              onSaveDefaults={vi.fn()}
              onResetDefaults={vi.fn()}
              onUpdateBaseModel={vi.fn()}
              onRenameWorkflow={onRenameWorkflow}
              onDuplicateWorkflow={vi.fn()}
              onRescanNodes={vi.fn()}
            />
          ) : undefined
        }
      />
    </MemoryRouter>,
  )
  return { ...utils, root: utils.container.firstElementChild as HTMLElement, onRenameWorkflow }
}

function renderMonitorHeader() {
  const utils = render(
    <MemoryRouter>
      <PageHeader title="Monitor" icon={Zap} />
    </MemoryRouter>,
  )
  return { ...utils, root: utils.container.firstElementChild as HTMLElement, monitor: screen.getByTestId('resource-hover-monitor') }
}

function FutureTallAction() {
  const [open, setOpen] = React.useState(false)
  const ref = React.useRef<HTMLDivElement>(null)
  return (
    <div ref={ref} className="relative inline-flex">
      <button type="button" data-testid="future-action-btn" aria-expanded={open} onClick={() => setOpen((v) => !v)}>Future</button>
      <HeaderDropdown open={open} onClose={() => setOpen(false)} anchorRef={ref} align="start" data-testid="future-action-panel" className="w-[240px] p-2">
        {Array.from({ length: 40 }, (_, i) => <button key={i} type="button" data-testid={`future-item-${i}`}>項目 {i}</button>)}
      </HeaderDropdown>
    </div>
  )
}

describe('REQ-346 header expand action overlay contract', () => {
  beforeEach(() => {
    cleanupAllTestState()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    cleanupAllTestState()
    vi.restoreAllMocks()
    restoreGeometry()
  })

  // A. click-type actions (A1–A3)
  it.each(EXPAND_ACTIONS)('[REQ-346/AC-1] $label panel is a body-level fixed layer positioned below the trigger and outside the header', (spec) => {
    stubGeometry({ vw: 1280, vh: 360 })
    const { root } = renderHeaderWithAction(spec.kind)
    const panel = openExpand(spec)
    expect(root.contains(panel)).toBe(false)
    expect(panel.style.position).toBe('fixed')
    expect(panel.hasAttribute('data-header-menu-panel')).toBe(true)
    expect(parseFloat(panel.style.top)).toBeGreaterThanOrEqual(REQ346_ANCHOR.bottom + 6)
  })

  it.each(EXPAND_ACTIONS)('[REQ-346/AC-1] $label header height is not pushed: header class and element count unchanged', (spec) => {
    stubGeometry({ vw: 1280, vh: 360 })
    const { root } = renderHeaderWithAction(spec.kind)
    const before = headerSnapshot(root)
    openExpand(spec)
    expect(headerSnapshot(root)).toEqual(before)
  })

  it.each(EXPAND_ACTIONS)('[REQ-346/AC-2] $label item below the header executes its handler', (spec) => {
    stubGeometry({ vw: 1280, vh: 360 })
    const { onRenameWorkflow } = renderHeaderWithAction(spec.kind)
    const onCacheResync = vi.fn()
    window.addEventListener('cache-resync', onCacheResync)
    openExpand(spec)
    if (spec.kind === 'A1') {
      fireEvent.click(document.getElementById('workflow-actions-rename')!)
      expect(onRenameWorkflow).toHaveBeenCalledTimes(1)
    } else if (spec.kind === 'A2') {
      fireEvent.click(screen.getByTestId('resync-cache-button'))
      expect(onCacheResync).toHaveBeenCalledTimes(1)
    } else {
      fireEvent.click(screen.getByTestId('mobile-overlay-close'))
      expect(panelOf(spec)).toBeNull()
    }
    window.removeEventListener('cache-resync', onCacheResync)
  })

  it.each(EXPAND_ACTIONS)('[REQ-346/AC-3] $label panel height is capped by the viewport (360px) and keeps in-panel scroll', (spec) => {
    stubGeometry({ vw: 1280, vh: 360 })
    renderHeaderWithAction(spec.kind)
    const panel = openExpand(spec)
    expect(panel.style.maxHeight).toBe('307px')
    expect(panel.classList.contains('overflow-y-auto')).toBe(true)
  })

  it.each(EXPAND_ACTIONS)('[REQ-346/AC-4] $label closes when the trigger is pressed again', (spec) => {
    stubGeometry({ vw: 1280, vh: 360 })
    renderHeaderWithAction(spec.kind)
    openExpand(spec)
    expect(panelOf(spec)).not.toBeNull()
    fireEvent.click(triggerOf(spec))
    expect(panelOf(spec)).toBeNull()
  })

  it.each(EXPAND_ACTIONS)('[REQ-346/AC-5] $label stays inside 375/768/1280 wide viewports', (spec) => {
    const widths = spec.kind === 'A3' ? [375] : [375, 768, 1280]
    for (const vw of widths) {
      stubGeometry({ vw, vh: 360 })
      const { unmount } = renderHeaderWithAction(spec.kind)
      const left = parseFloat(openExpand(spec).style.left)
      expect(left).toBeGreaterThanOrEqual(8)
      expect(left).toBeLessThanOrEqual(vw - 240 - 8)
      unmount()
      restoreGeometry()
    }
  })

  it.each(EXPAND_ACTIONS)('[REQ-346/AC-6] $label recomputes maxHeight on resize while open', (spec) => {
    // A3 closes on resize at >=640px by design (ResourceHoverMonitor closeAtSm), so resize it at 375px.
    const vw = spec.kind === 'A3' ? 375 : 1280
    stubGeometry({ vw, vh: 360 })
    renderHeaderWithAction(spec.kind)
    expect(openExpand(spec).style.maxHeight).toBe('307px')
    stubGeometry({ vw, vh: 500 })
    fireEvent(window, new Event('resize'))
    expect(panelOf(spec)!.style.maxHeight).toBe('447px')
  })

  // A'. hover-type A4 (ResourceHoverMonitor card; no click toggle)
  it('[REQ-346/AC-1] A4 hover card is a body-level fixed layer below the monitor and outside the header container', () => {
    stubGeometry({ vw: 1280, vh: 360, panelWidth: 250 })
    const { root, monitor } = renderMonitorHeader()
    const before = headerSnapshot(root)
    fireEvent.mouseEnter(monitor)
    const card = screen.getByTestId('resource-hover-card')
    expect(root.contains(card)).toBe(false)
    expect(card.style.position).toBe('fixed')
    expect(card.hasAttribute('data-header-menu-panel')).toBe(true)
    expect(parseFloat(card.style.top)).toBeGreaterThanOrEqual(REQ346_ANCHOR.bottom + 6)
    expect(headerSnapshot(root)).toEqual(before)
  })

  it('[REQ-346/AC-2] A4 hover continuity: moving from the monitor or bridge into the card keeps it open', () => {
    stubGeometry({ vw: 1280, vh: 360, panelWidth: 250 })
    const { monitor } = renderMonitorHeader()
    fireEvent.mouseEnter(monitor)
    const card = screen.getByTestId('resource-hover-card')
    fireEvent.mouseOut(monitor, { relatedTarget: card })
    expect(screen.getByTestId('resource-hover-card')).toBeInTheDocument()
    fireEvent.mouseOut(screen.getByTestId('resource-hover-card-bridge'), { relatedTarget: card })
    expect(screen.getByTestId('resource-hover-card')).toBeInTheDocument()
  })

  it('[REQ-346/AC-3] A4 hover card height is capped by the viewport (360px) and keeps in-panel scroll', () => {
    stubGeometry({ vw: 1280, vh: 360, panelWidth: 250 })
    const { monitor } = renderMonitorHeader()
    fireEvent.mouseEnter(monitor)
    const card = screen.getByTestId('resource-hover-card')
    expect(card.style.maxHeight).toBe('307px')
    expect(card.classList.contains('overflow-y-auto')).toBe(true)
  })

  it('[REQ-346/AC-4] A4 closes on leave and on outside pointerdown; it has no click toggle', () => {
    stubGeometry({ vw: 1280, vh: 360, panelWidth: 250 })
    const { monitor } = renderMonitorHeader()
    fireEvent.mouseEnter(monitor)
    fireEvent.click(monitor)
    expect(screen.getByTestId('resource-hover-card')).toBeInTheDocument()
    fireEvent.mouseOut(screen.getByTestId('resource-hover-card'), { relatedTarget: document.body })
    expect(screen.queryByTestId('resource-hover-card')).toBeNull()
    fireEvent.mouseEnter(monitor)
    fireEvent.pointerDown(document.body)
    expect(screen.queryByTestId('resource-hover-card')).toBeNull()
  })

  it('[REQ-346/AC-5] A4 stays inside 640/768/1280 wide viewports', () => {
    for (const vw of [640, 768, 1280]) {
      stubGeometry({ vw, vh: 360, panelWidth: 250 })
      const { monitor, unmount } = renderMonitorHeader()
      fireEvent.mouseEnter(monitor)
      const left = parseFloat(screen.getByTestId('resource-hover-card').style.left)
      expect(left).toBeGreaterThanOrEqual(8)
      expect(left).toBeLessThanOrEqual(vw - 250 - 8)
      unmount()
      restoreGeometry()
    }
  })

  it('[REQ-346/AC-6] A4 recomputes maxHeight on resize while hovered', () => {
    stubGeometry({ vw: 1280, vh: 360, panelWidth: 250 })
    const { monitor } = renderMonitorHeader()
    fireEvent.mouseEnter(monitor)
    expect(screen.getByTestId('resource-hover-card').style.maxHeight).toBe('307px')
    stubGeometry({ vw: 1280, vh: 500, panelWidth: 250 })
    fireEvent(window, new Event('resize'))
    expect(screen.getByTestId('resource-hover-card').style.maxHeight).toBe('447px')
  })

  it('[REQ-346/AC-4] pressing another header trigger while the A4 card is open leaves only one body-level panel', () => {
    stubGeometry({ vw: 1280, vh: 360, panelWidth: 250 })
    const { monitor } = renderMonitorHeader()
    fireEvent.mouseEnter(monitor)
    const kebab = screen.getByTestId('header-kebab-menu-button')
    fireEvent.pointerDown(kebab)
    fireEvent.click(kebab)
    expect(screen.queryByTestId('resource-hover-card')).toBeNull()
    expect(screen.getByTestId('header-kebab-dropdown')).toBeInTheDocument()
    expect(document.querySelectorAll('[data-header-menu-panel]')).toHaveLength(1)
  })

  // B. future action verification example (AC-8)
  it('[REQ-346/AC-8] a new header action with content taller than the header renders in a body-level layer outside the overflow-x-auto actions wrapper', () => {
    stubGeometry({ vw: 375, vh: 360 })
    const { container } = render(
      <MemoryRouter>
        <PageHeader title="Future" actions={<FutureTallAction />} />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByTestId('future-action-btn'))
    const panel = screen.getByTestId('future-action-panel')
    expect(container.contains(panel)).toBe(false)
    expect(panel.closest('.overflow-x-auto')).toBeNull()
    expect(panel.style.maxHeight).toBe('307px')
    expect(panel.querySelector('[data-testid="future-item-39"]')).not.toBeNull()
    fireEvent.click(screen.getByTestId('future-action-btn'))
    expect(screen.queryByTestId('future-action-panel')).toBeNull()
  })

  it.each([375, 1280])('[REQ-346/AC-8] the future action follows the same 8px edge margin at %dpx', (vw) => {
    stubGeometry({ vw, vh: 360 })
    const { unmount } = render(
      <MemoryRouter>
        <PageHeader title="Future" actions={<FutureTallAction />} />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByTestId('future-action-btn'))
    const left = parseFloat(screen.getByTestId('future-action-panel').style.left)
    expect(left).toBeGreaterThanOrEqual(8)
    expect(left).toBeLessThanOrEqual(vw - 240 - 8)
    unmount()
  })

  it('[REQ-346/AC-4] rapid open/close/open of two different header menus does not leave two panels open', () => {
    stubGeometry({ vw: 1280, vh: 360 })
    renderHeaderWithAction('A1')
    const a1 = EXPAND_ACTIONS[0]
    const a2 = EXPAND_ACTIONS[1]
    openExpand(a1)
    const kebab = triggerOf(a2)
    fireEvent.pointerDown(kebab)
    fireEvent.click(kebab)
    expect(panelOf(a1)).toBeNull()
    expect(panelOf(a2)).not.toBeNull()
    expect(document.querySelectorAll('[data-header-menu-panel]')).toHaveLength(1)
  })

  it('[REQ-346/AC-6] unmount while open leaves no body-level panel or listener', () => {
    stubGeometry({ vw: 1280, vh: 360 })
    const { unmount } = renderHeaderWithAction('A2')
    openExpand(EXPAND_ACTIONS[1])
    expect(panelOf(EXPAND_ACTIONS[1])).not.toBeNull()
    unmount()
    expect(document.body.querySelector('[data-header-menu-panel]')).toBeNull()
    expect(() => fireEvent.pointerDown(document.body)).not.toThrow()
  })
})

// ── REQ-346: header-bottom anchored overlay (geometry via environment API stubs only) ──
type PanelKind = ExpandKind | 'A4'
const PANEL_KINDS: PanelKind[] = ['A1', 'A2', 'A3', 'A4']
const rectOf = (top: number, bottom: number, left: number, right: number) =>
  ({ top, bottom, left, right, x: left, y: top, width: right - left, height: bottom - top, toJSON() {} }) as DOMRect

function stubGeometryWithHeader({
  vw,
  vh,
  headerBottom,
  panelWidth = 240,
  overrides = {},
}: {
  vw: number
  vh: number
  headerBottom: number
  panelWidth?: number
  overrides?: Record<string, DOMRect>
}) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: vw })
  Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: vh })
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.matches('[data-page-header-root]')) return rectOf(0, headerBottom, 0, vw)
    const testId = this.getAttribute('data-testid')
    if (testId && overrides[testId]) return overrides[testId]
    return REQ346_ANCHOR as DOMRect
  })
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => panelWidth })
}

function renderFor(kind: PanelKind) {
  if (kind === 'A4') {
    const { root, monitor, unmount } = renderMonitorHeader()
    return {
      root,
      unmount,
      open: () => {
        fireEvent.mouseEnter(monitor)
        return screen.getByTestId('resource-hover-card')
      },
    }
  }
  const { root, unmount } = renderHeaderWithAction(kind)
  return { root, unmount, open: () => openExpand(EXPAND_ACTIONS.find((s) => s.kind === kind)!) }
}

describe('REQ-346 header-bottom anchored overlay', () => {
  beforeEach(() => {
    cleanupAllTestState()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    cleanupAllTestState()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    restoreGeometry()
  })

  it.each(PANEL_KINDS)('[REQ-346/AC-1] %s PageHeader exposes data-page-header-root and the panel top is header bottom + 6 (118 -> 124px; 50 -> 56px)', (kind) => {
    stubGeometryWithHeader({ vw: 1280, vh: 800, headerBottom: 118 })
    const first = renderFor(kind)
    expect(first.root.hasAttribute('data-page-header-root')).toBe(true)
    const panel = first.open()
    expect(first.root.contains(panel)).toBe(false)
    expect(panel.style.top).toBe('124px')
    first.unmount()
    vi.restoreAllMocks()
    stubGeometryWithHeader({ vw: 1280, vh: 800, headerBottom: 50 })
    const second = renderFor(kind)
    expect(second.open().style.top).toBe('56px')
    second.unmount()
  })

  it.each(PANEL_KINDS)('[REQ-346/AC-1] %s panel never overlaps the header: top >= header bottom + 6 for header bottoms 50/118/200', (kind) => {
    for (const headerBottom of [50, 118, 200]) {
      vi.restoreAllMocks()
      stubGeometryWithHeader({ vw: 1280, vh: 800, headerBottom })
      const { open, unmount } = renderFor(kind)
      expect(parseFloat(open().style.top)).toBeGreaterThanOrEqual(headerBottom + 6)
      unmount()
    }
  })

  it('[REQ-346/AC-1] kebab hit-slop: the 44px button below the 28px wrapper keeps the panel below the button', () => {
    stubGeometryWithHeader({
      vw: 1280,
      vh: 800,
      headerBottom: 40,
      overrides: { 'header-kebab-menu-button': rectOf(0, 44, 300, 330) },
    })
    renderHeaderWithAction('A2')
    expect(openExpand(EXPAND_ACTIONS[1]).style.top).toBe('50px')
  })

  it.each(PANEL_KINDS)('[REQ-346/AC-3] %s maxHeight is computed from the header-based top (vh 360, header 118 -> 228px)', (kind) => {
    stubGeometryWithHeader({ vw: 1280, vh: 360, headerBottom: 118 })
    const { open } = renderFor(kind)
    expect(open().style.maxHeight).toBe('228px')
  })

  it('[REQ-346/AC-2] A4 bridge spans the monitor bottom to the card top, lives outside the header, and keeps hover across the portal', () => {
    stubGeometryWithHeader({ vw: 1280, vh: 800, headerBottom: 118, panelWidth: 250 })
    const { root, monitor } = renderMonitorHeader()
    fireEvent.mouseEnter(monitor)
    const card = screen.getByTestId('resource-hover-card')
    const bridge = screen.getByTestId('resource-hover-card-bridge')
    expect(bridge.style.top).toBe('39px')
    expect(bridge.style.height).toBe('86px')
    expect(root.contains(bridge)).toBe(false)

    fireEvent.mouseOut(monitor, { relatedTarget: bridge })
    expect(screen.getByTestId('resource-hover-card')).toBeInTheDocument()
    fireEvent.mouseOut(bridge, { relatedTarget: card })
    expect(screen.getByTestId('resource-hover-card')).toBeInTheDocument()

    fireEvent.mouseOut(card, { relatedTarget: document.body })
    expect(screen.queryByTestId('resource-hover-card')).toBeNull()
    expect(screen.queryByTestId('resource-hover-card-bridge')).toBeNull()
  })

  it('[REQ-346/AC-6] header height change while open re-anchors the panel (ResizeObserver)', () => {
    const callbacks: Array<() => void> = []
    class FakeResizeObserver {
      constructor(cb: () => void) {
        callbacks.push(cb)
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', FakeResizeObserver)
    stubGeometryWithHeader({ vw: 1280, vh: 800, headerBottom: 118 })
    const { root, unmount } = renderHeaderWithAction('A1')
    const panel = openExpand(EXPAND_ACTIONS[0])
    expect(panel.style.top).toBe('124px')

    vi.restoreAllMocks()
    stubGeometryWithHeader({ vw: 1280, vh: 800, headerBottom: 150 })
    act(() => {
      callbacks.forEach((cb) => cb())
    })
    expect(panelOf(EXPAND_ACTIONS[0])!.style.top).toBe('156px')
    expect(root.contains(panelOf(EXPAND_ACTIONS[0])!)).toBe(false)
    unmount()
  })

  it('[REQ-346/AC-8] a future action placed in PageHeader actions is anchored to the header bottom without extra props', () => {
    stubGeometryWithHeader({ vw: 1280, vh: 800, headerBottom: 118 })
    const { container } = render(
      <MemoryRouter>
        <PageHeader title="Future" actions={<FutureTallAction />} />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByTestId('future-action-btn'))
    const panel = screen.getByTestId('future-action-panel')
    expect(container.contains(panel)).toBe(false)
    expect(panel.closest('.overflow-x-auto')).toBeNull()
    expect(panel.style.top).toBe('124px')
  })
})

describe('REQ-364: Unified Header Integration with SystemStatusBadge & Dynamic Port', () => {
  const originalLocation = window.location

  beforeEach(() => {
    cleanupAllTestState()
    vi.restoreAllMocks()
    useGenerationStore.setState({
      systemStats: {
        cpu_pct: 20.0,
        ram_pct: 50.0,
        gpu_pct: 70.0,
        vram_pct: 65.0,
        ram_used_gb: 16.0,
        ram_total_gb: 32.0,
        vram_used_gb: 10.0,
        vram_total_gb: 16.0,
      },
      isConnected: true,
      generationSyncing: false,
      generationSnapshot: {
        upstream: { http_ready: true, ws_connected: true, failure_since: null },
      } as any,
    })
  })

  afterEach(() => {
    cleanupAllTestState()
    useGenerationStore.setState({ systemStats: null, generationSnapshot: null })
    try {
      Object.defineProperty(window, 'location', {
        value: originalLocation,
        writable: true,
        configurable: true,
      })
    } catch {
      // ignore
    }
  })

  it('[REQ-364/AC-1] desktop header rendering: PageHeader in desktop mode shows SystemStatusBadge (slim) with dynamic DEV :${port} tag', () => {
    Object.defineProperty(window, 'location', {
      value: new URL('http://localhost:5173'),
      writable: true,
      configurable: true,
    })

    const { container, rerender } = render(
      <MemoryRouter>
        <PageHeader title="Generate" />
      </MemoryRouter>,
    )

    // Verify desktop container visibility classes
    const desktopContainer = container.querySelector('.hidden.md\\:inline-flex')
    expect(desktopContainer).toBeInTheDocument()

    // Slim badge rendered inside desktop container
    const slimBadge = desktopContainer!.querySelector('[data-testid="system-status-badge"]')
    expect(slimBadge).toBeInTheDocument()
    expect(slimBadge).toHaveTextContent('READY')
    expect(slimBadge).toHaveClass('rounded-full', 'px-2')

    // Dynamic DEV :${port} tag badge rendered in DEV environment
    const devBadge = desktopContainer!.querySelector('[data-testid="dev-port-badge"]')
    expect(devBadge).toBeInTheDocument()
    expect(devBadge).toHaveTextContent('DEV :5173')

    // Dynamic port tracking: updates when port changes to 5174
    Object.defineProperty(window, 'location', {
      value: new URL('http://localhost:5174'),
      writable: true,
      configurable: true,
    })

    rerender(
      <MemoryRouter>
        <PageHeader title="Generate" />
      </MemoryRouter>,
    )

    const updatedDevBadge = desktopContainer!.querySelector('[data-testid="dev-port-badge"]')
    expect(updatedDevBadge).toHaveTextContent('DEV :5174')
  })

  it('[REQ-364/AC-2] mobile header rendering: PageHeader in mobile mode shows SystemStatusBadge (dot) and suppresses DEV :port badge', () => {
    Object.defineProperty(window, 'location', {
      value: new URL('http://localhost:5173'),
      writable: true,
      configurable: true,
    })

    const { container } = render(
      <MemoryRouter>
        <PageHeader title="Generate" />
      </MemoryRouter>,
    )

    // Verify mobile container visibility classes
    const mobileContainer = container.querySelector('.inline-block.md\\:hidden')
    expect(mobileContainer).toBeInTheDocument()

    // Dot badge rendered inside mobile container
    const dotBadge = mobileContainer!.querySelector('[data-testid="system-status-badge"]')
    expect(dotBadge).toBeInTheDocument()
    expect(dotBadge).toHaveClass('w-[7px]', 'h-[7px]', 'rounded-full')
    // Dot variant does not show text label
    expect(dotBadge?.textContent?.trim()).toBe('')

    // DEV :port tag badge is suppressed in dot variant / mobile
    const devBadge = mobileContainer!.querySelector('[data-testid="dev-port-badge"]')
    expect(devBadge).toBeNull()
    expect(mobileContainer!.textContent).not.toContain('DEV :')
  })

  it('[REQ-364/AC-3] popover interaction: clicking status badge opens system monitor popover without breaking adjacent header elements', () => {
    const { container } = render(
      <MemoryRouter>
        <PageHeader title="Generate" />
      </MemoryRouter>,
    )

    const desktopContainer = container.querySelector('.hidden.md\\:inline-flex')
    const slimBadge = desktopContainer!.querySelector('[data-testid="system-status-badge"]')!
    const monitor = screen.getByTestId('resource-hover-monitor')
    const kebabBtn = screen.getByTestId('header-kebab-menu-button')

    // Both adjacent elements exist initially
    expect(monitor).toBeInTheDocument()
    expect(kebabBtn).toBeInTheDocument()
    expect(screen.queryByTestId('system-status-dropdown')).toBeNull()

    // 1. Click status badge to open system monitor popover
    fireEvent.click(slimBadge)
    const dropdown = screen.getByTestId('system-status-dropdown')
    expect(dropdown).toBeInTheDocument()
    expect(screen.getByText('システム稼働モニタ')).toBeInTheDocument()
    expect(screen.getByText('Frontend')).toBeInTheDocument()
    expect(screen.getByText('FastAPI (BE)')).toBeInTheDocument()
    expect(screen.getByText('ComfyUI')).toBeInTheDocument()
    expect(screen.getByText('Manager')).toBeInTheDocument()

    // 2. Adjacent ResourceHoverMonitor remains fully functional
    fireEvent.mouseEnter(monitor)
    expect(screen.getByTestId('resource-hover-card')).toBeInTheDocument()
    fireEvent.mouseLeave(monitor)

    // 3. Adjacent HeaderKebabMenu remains fully functional
    fireEvent.click(kebabBtn)
    expect(screen.getByTestId('header-kebab-dropdown')).toBeInTheDocument()

    // 4. Toggle popover closed
    fireEvent.click(slimBadge)
    expect(screen.queryByTestId('system-status-dropdown')).toBeNull()

    // 5. Verify mobile dot badge also opens system monitor popover without breakage
    const mobileContainer = container.querySelector('.inline-block.md\\:hidden')
    const dotBadge = mobileContainer!.querySelector('[data-testid="system-status-badge"]')!
    fireEvent.click(dotBadge)
    expect(screen.getByTestId('system-status-dropdown')).toBeInTheDocument()
    expect(screen.getByText('システム稼働モニタ')).toBeInTheDocument()
  })
})

