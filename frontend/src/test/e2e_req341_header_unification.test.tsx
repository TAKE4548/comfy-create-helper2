import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { Zap, Layers, Sparkles, Tags, Clock, Settings, Search, Plus, RotateCw } from 'lucide-react'
import { PageHeader } from '../components/common/PageHeader'
import { ResourceHoverMonitor } from '../components/common/header/ResourceHoverMonitor'
import { HeaderKebabMenu } from '../components/common/header/HeaderKebabMenu'
import { SystemStatusBadge } from '../components/common/SystemStatusBadge'
import { WorkflowActionsMenu } from '../pages/GeneratePage/components/WorkflowActionsMenu'
import { useGenerationStore } from '../store/useGenerationStore'
import * as browserStorage from '../utils/browserStorageUsage'
import type { SystemStats } from '../api/types'

const managerFixture = {
  fe: { running: true, status: 'running' },
  be: { running: true, status: 'running' },
  comfy: { running: true, status: 'running' },
  action_in_progress: null,
}

// Mock manager status hook to return deterministic values
vi.mock('../hooks/useComfyManagerStatus', () => ({
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
    expect(overlay).toHaveClass('w-[330px]')

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

