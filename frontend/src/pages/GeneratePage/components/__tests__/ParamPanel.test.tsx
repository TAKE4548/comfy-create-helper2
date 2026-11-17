import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ParamPanel } from '../ParamPanel'
import { LS_KEYS } from '../../../../utils/localStorageKeys'
import { generationWorkflow } from '../../../../utils/workflowMappingState'
import { resetTestStore } from '../../../../test/utils/storeHelpers'
import { createTestQueryClient } from '../../../../test/utils/queryHelpers'

describe('ParamPanel Component - Section Collapse / Expand', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  const defaultProps = {
    paramMappings: [
      { id: 1, role: 'prompt', display_name: 'Prompt', input_type: 'string' },
      { id: 2, role: 'cfg', display_name: 'CFG Scale', input_type: 'float' },
      { id: 3, role: 'Sampler_Seed', display_name: 'Sampler Seed', input_type: 'int' },
    ],
    paramValues: { prompt: 'test prompt', cfg: '7.5', Sampler_Seed: '12345' },
    setParamValues: vi.fn(),
    batchSize: 1,
    setBatchSize: vi.fn(),
    seedMode: 'random' as const,
    setSeedMode: vi.fn(),
    seed: 12345,
    setSeed: vi.fn(),
    bypassProfiles: [
      { id: 1, name: 'Face Restore Bypass', is_enabled: false },
    ],
    onToggleBypass: vi.fn(),
    onOpenBypassSettings: vi.fn(),
    paramSyncGroups: [
      { id: 1, workflow_id: 1, name: 'Sampler Sync', is_enabled: true, master_role: 'sampler_1', slave_roles: [], created_at: '2026-08-01T00:00:00Z' },
    ],
    onToggleParamSync: vi.fn(),
    onOpenParamSyncSettings: vi.fn(),
  }

  it('renders nothing when paramMappings is empty', () => {
    const { container } = render(<ParamPanel {...defaultProps} paramMappings={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders all sections expanded by default', () => {
    render(<ParamPanel {...defaultProps} />)

    // Parameters section elements
    expect(screen.getByText('Prompt')).toBeInTheDocument()
    expect(screen.getByText('CFG Scale')).toBeInTheDocument()
    expect(screen.getByText('Batch Size')).toBeInTheDocument()
    expect(screen.getByText('Seed')).toBeInTheDocument()

    // Param Sync section elements
    expect(screen.getByText('Param Sync')).toBeInTheDocument()
    expect(screen.getByText('Sampler Sync')).toBeInTheDocument()

    // Bypasses section elements
    expect(screen.getByText('Bypasses')).toBeInTheDocument()
    expect(screen.getByText('Face Restore Bypass')).toBeInTheDocument()
  })

  it('renders a dedicated Seed control without adding a Seed toggle to CFG', () => {
    render(<ParamPanel {...defaultProps}
      paramMappings={[
        { id: 2, role: 'cfg', display_name: 'CFG Scale', input_type: 'float' },
        { id: 4, role: 'seed_main', display_name: 'Dedicated Seed', input_type: 'seed' },
      ]}
      paramValues={{ cfg: '7.5', seed_main: '12345' }} />)

    expect(screen.getByLabelText('Dedicated Seedの値')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'ランダムにする' })).toHaveLength(1)
    expect(screen.getByText('CFG Scale')).toBeInTheDocument()
  })

  it('[REQ-358/AC-25] hides the generation Seed control when its Sampler_Seed mapping is inactive', () => {
    render(<ParamPanel {...defaultProps}
      paramMappings={[{ id: 2, role: 'cfg', display_name: 'CFG Scale', input_type: 'float' }]}
      paramValues={{ cfg: '7.5' }} />)

    expect(screen.queryByLabelText('Seed')).not.toBeInTheDocument()
    expect(document.getElementById('seed-input')).not.toBeInTheDocument()
  })

  it('collapses and expands Parameters section on click and persists to localStorage', () => {
    render(<ParamPanel {...defaultProps} />)

    const toggleBtn = document.getElementById('parameters-section-toggle')
    expect(toggleBtn).toBeInTheDocument()

    // Collapse
    fireEvent.click(toggleBtn!)
    expect(screen.queryByText('CFG Scale')).not.toBeInTheDocument()
    expect(screen.queryByText('Batch Size')).not.toBeInTheDocument()

    let stored = JSON.parse(localStorage.getItem(LS_KEYS.GENERATE_SECTIONS_EXPANDED) || '{}')
    expect(stored.parameters).toBe(false)
    expect(stored.paramSync).toBe(true)
    expect(stored.bypass).toBe(true)

    // Expand
    fireEvent.click(toggleBtn!)
    expect(screen.getByText('CFG Scale')).toBeInTheDocument()
    expect(screen.getByText('Batch Size')).toBeInTheDocument()

    stored = JSON.parse(localStorage.getItem(LS_KEYS.GENERATE_SECTIONS_EXPANDED) || '{}')
    expect(stored.parameters).toBe(true)
  })

  it('collapses and expands Param Sync section on click while keeping settings button accessible', () => {
    render(<ParamPanel {...defaultProps} />)

    const toggleBtn = document.getElementById('paramsync-section-toggle')
    const settingsBtn = document.getElementById('param-sync-settings-btn')
    expect(toggleBtn).toBeInTheDocument()
    expect(settingsBtn).toBeInTheDocument()

    // Check content before collapse
    expect(screen.getByText('Sampler Sync')).toBeInTheDocument()

    // Collapse
    fireEvent.click(toggleBtn!)
    expect(screen.queryByText('Sampler Sync')).not.toBeInTheDocument()

    // Settings button is still clickable
    fireEvent.click(settingsBtn!)
    expect(defaultProps.onOpenParamSyncSettings).toHaveBeenCalled()

    const stored = JSON.parse(localStorage.getItem(LS_KEYS.GENERATE_SECTIONS_EXPANDED) || '{}')
    expect(stored.paramSync).toBe(false)
  })

  it('collapses and expands Bypass section on click while keeping settings button accessible', () => {
    render(<ParamPanel {...defaultProps} />)

    const toggleBtn = document.getElementById('bypass-section-toggle')
    const settingsBtn = document.getElementById('bypass-settings-btn')
    expect(toggleBtn).toBeInTheDocument()
    expect(settingsBtn).toBeInTheDocument()

    // Check content before collapse
    expect(screen.getByText('Face Restore Bypass')).toBeInTheDocument()

    // Collapse
    fireEvent.click(toggleBtn!)
    expect(screen.queryByText('Face Restore Bypass')).not.toBeInTheDocument()

    // Settings button is still clickable
    fireEvent.click(settingsBtn!)
    expect(defaultProps.onOpenBypassSettings).toHaveBeenCalled()

    const stored = JSON.parse(localStorage.getItem(LS_KEYS.GENERATE_SECTIONS_EXPANDED) || '{}')
    expect(stored.bypass).toBe(false)
  })

  it('initializes section states from localStorage if present', () => {
    localStorage.setItem(
      LS_KEYS.GENERATE_SECTIONS_EXPANDED,
      JSON.stringify({
        parameters: false,
        paramSync: false,
        bypass: true,
      })
    )

    render(<ParamPanel {...defaultProps} />)

    // Parameters collapsed
    expect(screen.queryByText('CFG Scale')).not.toBeInTheDocument()
    // Param sync collapsed
    expect(screen.queryByText('Sampler Sync')).not.toBeInTheDocument()
    // Bypass expanded
    expect(screen.getByText('Face Restore Bypass')).toBeInTheDocument()
  })

  it('handles mobile prop and applies mobile suffix to element ids', () => {
    render(<ParamPanel {...defaultProps} mobile={true} />)

    expect(document.getElementById('parameters-section-toggle-mobile')).toBeInTheDocument()
    expect(document.getElementById('paramsync-section-toggle-mobile')).toBeInTheDocument()
    expect(document.getElementById('bypass-section-toggle-mobile')).toBeInTheDocument()
    expect(document.getElementById('param-sync-settings-btn-mobile')).toBeInTheDocument()
    expect(document.getElementById('bypass-settings-btn-mobile')).toBeInTheDocument()
  })

  it('steps sampler parameters by their configured increment and precision', () => {
    const setParamValues = vi.fn()
    render(<ParamPanel
      {...defaultProps}
      paramMappings={[
        { id: 3, role: 'Sampler_Steps', param_name: 'steps', display_name: 'Steps', input_type: 'int' },
        { id: 4, role: 'Sampler_CFG', param_name: 'cfg', display_name: 'CFG', input_type: 'float' },
        { id: 5, role: 'Sampler_Denoise', param_name: 'denoise', display_name: 'Denoise', input_type: 'float' },
      ]}
      paramValues={{ Sampler_Steps: '20', Sampler_CFG: '7.5', Sampler_Denoise: '0.85' }}
      setParamValues={setParamValues}
      comfyObjectInfo={{ KSampler: { input: { required: {
        steps: ['INT', { min: 1, max: 100 }],
        cfg: ['FLOAT', { min: 1, max: 20 }],
        denoise: ['FLOAT', { min: 0, max: 1 }],
      } } } }}
    />)

    fireEvent.click(screen.getByRole('button', { name: 'Increase Steps' }))
    expect(setParamValues).toHaveBeenLastCalledWith({ Sampler_Steps: '21', Sampler_CFG: '7.5', Sampler_Denoise: '0.85' })
    fireEvent.click(screen.getByRole('button', { name: 'Increase CFG' }))
    expect(setParamValues).toHaveBeenLastCalledWith({ Sampler_Steps: '20', Sampler_CFG: '7.6', Sampler_Denoise: '0.85' })
    fireEvent.click(screen.getByRole('button', { name: 'Increase Denoise' }))
    expect(setParamValues).toHaveBeenLastCalledWith({ Sampler_Steps: '20', Sampler_CFG: '7.5', Sampler_Denoise: '0.86' })
  })

  it('clamps sampler steppers to available metadata and leaves missing bounds unspecified', () => {
    const setParamValues = vi.fn()
    const { rerender } = render(<ParamPanel
      {...defaultProps}
      paramMappings={[{ id: 3, role: 'Sampler_Denoise', param_name: 'denoise', display_name: 'Denoise', input_type: 'float' }]}
      paramValues={{ Sampler_Denoise: '1' }}
      setParamValues={setParamValues}
      comfyObjectInfo={{ KSamplerAdvanced: { input: { optional: { denoise: ['FLOAT', { min: 0, max: 1 }] } } } }}
    />)

    fireEvent.click(screen.getByRole('button', { name: 'Increase Denoise' }))
    expect(setParamValues).toHaveBeenCalledWith({ Sampler_Denoise: '1.00' })
    expect(document.getElementById('param-Sampler_Denoise')).toHaveAttribute('max', '1')

    rerender(<ParamPanel
      {...defaultProps}
      paramMappings={[{ id: 3, role: 'Sampler_Denoise', param_name: 'denoise', display_name: 'Denoise', input_type: 'float' }]}
      paramValues={{ Sampler_Denoise: '0.85' }}
      setParamValues={setParamValues}
    />)
    expect(document.getElementById('param-Sampler_Denoise')).not.toHaveAttribute('min')
    expect(document.getElementById('param-Sampler_Denoise')).not.toHaveAttribute('max')
  })

  it('groups visible parameters inside the external desktop scroll root when enabled', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } })
    queryClient.setQueryData(['stage-masters'], [
      { id: 1, key: 'main', name: 'Main', suffix: '', search_keywords: null, previous_suffixes: null, is_builtin: true, is_active: true, sort_order: 0 },
      { id: 2, key: 'rough', name: 'Rough', suffix: '_rough', search_keywords: null, previous_suffixes: null, is_builtin: true, is_active: true, sort_order: 1 },
    ])
    queryClient.setQueryData(['mapping-masters'], [{
      id: 10, group_id: null, base_key: 'cfg', name: 'CFG', param_name: 'cfg', input_type: 'float',
      expected_class_types: null, base_title_patterns: null, sort_order: 0,
      variants: [
        { id: 11, master_id: 10, stage_id: 1, stage_key: 'main', stage_name: 'Main', stage_suffix: '', custom_role_override: null, computed_role: 'cfg_main', extra_title_patterns: null, is_enabled: true },
        { id: 12, master_id: 10, stage_id: 2, stage_key: 'rough', stage_name: 'Rough', stage_suffix: '_rough', custom_role_override: null, computed_role: 'cfg_rough', extra_title_patterns: null, is_enabled: true },
      ],
    }])
    const mappings = [
      { id: 1, master_id: 10, variant_id: 11, role: 'cfg_main', param_name: 'cfg', input_type: 'float', display_name: 'Main CFG' },
      { id: 2, master_id: 10, variant_id: 12, role: 'cfg_rough', param_name: 'cfg', input_type: 'float', display_name: 'Rough CFG' },
      { id: 3, master_id: 99, role: 'Sampler_Seed', param_name: 'seed', input_type: 'int', display_name: 'Hidden alternate' },
    ]
    let currentParamValues = { cfg_main: '20', cfg_rough: '30' }
    const setParamValues = vi.fn((values: typeof currentParamValues) => { currentParamValues = values })
    let currentSeedMode: 'random' | 'fixed' = 'random'
    const setSeedMode = vi.fn((mode: 'random' | 'fixed') => { currentSeedMode = mode })
    const renderAt = (stageGrouping: boolean) => (
      <QueryClientProvider client={queryClient}>
        <div id="desktop-controls-scroll" data-stage-scroll-root="" className="stage-input-scroll-root">
          <ParamPanel {...defaultProps} stageGrouping={stageGrouping} paramMappings={mappings} paramValues={currentParamValues}
            setParamValues={setParamValues} seedMode={currentSeedMode} setSeedMode={setSeedMode} />
        </div>
      </QueryClientProvider>
    )
    const { container, rerender } = render(renderAt(false))
    expect(screen.queryByRole('heading', { name: 'Main (main)' })).not.toBeInTheDocument()
    expect(screen.getByDisplayValue('20')).toBeInTheDocument()
    rerender(renderAt(true))

    expect(screen.getByRole('heading', { name: 'Main (main)' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Rough (rough)' })).toBeInTheDocument()
    expect(screen.getByText('Main CFG')).toBeInTheDocument()
    expect(screen.getByText('Rough CFG')).toBeInTheDocument()
    expect(screen.queryByText('Hidden alternate')).not.toBeInTheDocument()
    expect(screen.getAllByText('Batch Size')).toHaveLength(1)
    expect(screen.getAllByText('Seed')).toHaveLength(1)

    const panel = container.querySelector('#desktop-controls-scroll > div')
    const section = screen.getByRole('heading', { name: 'Main (main)' }).closest('section')
    const control = document.getElementById('param-cfg_main')
    expect(panel).not.toHaveAttribute('data-stage-scroll-root')
    expect(section).not.toHaveAttribute('data-stage-scroll-root')
    expect(control.closest('[data-stage-scroll-root]')).toBe(container.querySelector('#desktop-controls-scroll'))
    fireEvent.change(document.getElementById('param-cfg_rough')!, { target: { value: '40' } })
    expect(setParamValues).toHaveBeenLastCalledWith({ cfg_main: '20', cfg_rough: '40' })
    fireEvent.click(document.getElementById('seed-toggle')!)
    expect(setSeedMode).toHaveBeenLastCalledWith('fixed')
    rerender(renderAt(false))
    expect(screen.queryByRole('heading', { name: 'Main (main)' })).not.toBeInTheDocument()
    expect(screen.getByDisplayValue('20')).toBeInTheDocument()
    expect(screen.getByDisplayValue('40')).toBeInTheDocument()
    expect(screen.getByDisplayValue('12345')).not.toBeDisabled()
    expect(screen.getAllByText('Batch Size')).toHaveLength(1)
    expect(screen.getAllByText('Seed')).toHaveLength(1)
  })

  it('keeps the legacy renderer by default for mobile callers', () => {
    render(<ParamPanel {...defaultProps} mobile />)
    expect(screen.getByText('CFG Scale')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /\(unknown\)/ })).not.toBeInTheDocument()
  })

  it('disables numeric stepper buttons for synchronized slave parameters', () => {
    render(<ParamPanel
      {...defaultProps}
      paramMappings={[
        { id: 3, role: 'Sampler_CFG', param_name: 'cfg', display_name: 'CFG', input_type: 'float' },
        { id: 4, role: 'master_cfg', param_name: 'cfg', display_name: 'Master CFG', input_type: 'float' },
      ]}
      paramSyncGroups={[{ ...defaultProps.paramSyncGroups[0], master_role: 'master_cfg', slave_roles: ['Sampler_CFG'] }]}
    />)
    expect(screen.getByRole('button', { name: 'Increase CFG' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Decrease CFG' })).toBeDisabled()
  })
  it('[REQ-363/AC-7] renders parameter steppers and selects in compact 1-row layout on mobile', () => {
    const { container } = render(
      <ParamPanel
        {...defaultProps}
        mobile={true}
        paramMappings={[
          { id: 10, role: 'Sampler_Steps', display_name: 'Steps', input_type: 'int' },
          { id: 11, role: 'Sampler_Sampler', display_name: 'Sampler Name', input_type: 'select_sampler' },
        ]}
      />
    )

    // Verify row uses gap-2 py-1 on mobile
    const rows = container.querySelectorAll('.flex.items-center.justify-between')
    expect(rows.length).toBeGreaterThan(0)
    expect(rows[0].className).toContain('gap-2')
    expect(rows[0].className).toContain('py-1')

    // Verify select width uses w-[125px] on mobile
    const select = container.querySelector('#param-mobile-Sampler_Sampler')
    expect(select).toHaveClass('w-[125px]')

    // Verify stepper row is kept on single row with shrink-0 and compact input
    const input = container.querySelector('#param-mobile-Sampler_Steps')
    expect(input).toHaveClass('w-20')
    expect(input?.parentElement).toHaveClass('shrink-0')
  })
})

describe('ParamPanel image input (REQ-427)', () => {
  const idOf = (c: string) => `${c.repeat(64)}.png`
  const tokenOf = (c: string) => `refimg:${idOf(c)}`
  const imageMapping = { id: 11, role: 'ref_image', display_name: 'Reference Image', input_type: 'image', master_id: 5, variant_id: null }
  const base = {
    paramMappings: [imageMapping] as any[],
    paramValues: {} as Record<string, string>,
    setParamValues: vi.fn(),
  }
  const wrap = (ui: React.ReactElement) => (
    <QueryClientProvider client={createTestQueryClient()}>{ui}</QueryClientProvider>
  )

  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    resetTestStore()
  })

  it('[REQ-427/AC-3] desktop shows label, two buttons, placeholder; token value shows thumbnail', () => {
    const { rerender } = render(wrap(<ParamPanel {...base} />))
    expect(screen.getByText('Reference Image')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '履歴/スナップショットから選択' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'アップロード' })).toBeInTheDocument()
    expect(screen.getByText('未指定')).toBeInTheDocument()
    rerender(wrap(<ParamPanel {...base} paramValues={{ ref_image: tokenOf('a') }} />))
    expect(screen.getByAltText('選択中の参照画像').getAttribute('src')).toBe(`/api/ref-images/${idOf('a')}/thumbnail`)
  })

  it('[REQ-427/AC-3] mobile shows same elements with 44px and touch-manipulation classes', () => {
    render(wrap(<ParamPanel {...base} mobile />))
    expect(screen.getByText('Reference Image')).toBeInTheDocument()
    const field = screen.getByTestId('image-param-ref_image')
    const btns = field.querySelectorAll('button')
    expect(btns.length).toBe(2)
    btns.forEach((b) => {
      expect(b.className).toMatch(/min-h-11|before:-inset-2/)
      expect(b.className).toContain('touch-manipulation')
    })
  })

  it('[REQ-427/AC-7] image field is hidden when its mapping slot is disabled and shown when enabled', () => {
    const raw = (state: boolean) => ({
      mappings: [imageMapping, { id: 12, role: 'cfg', display_name: 'CFG', input_type: 'float', master_id: 6, variant_id: null }],
      mapping_slot_states: { 'm:5': state },
    })
    const off = generationWorkflow(raw(false) as never, [])
    const { rerender } = render(wrap(<ParamPanel {...base} paramMappings={off.mappings as any[]} />))
    expect(screen.queryByTestId('image-param-ref_image')).not.toBeInTheDocument()
    expect(screen.getByText('CFG')).toBeInTheDocument()
    const on = generationWorkflow(raw(true) as never, [])
    rerender(wrap(<ParamPanel {...base} paramMappings={on.mappings as any[]} />))
    expect(screen.getByTestId('image-param-ref_image')).toBeInTheDocument()
  })

  it('[REQ-427/AC-8] thumbnail follows paramValues change', () => {
    const { rerender } = render(wrap(<ParamPanel {...base} paramValues={{ ref_image: tokenOf('a') }} />))
    expect(screen.getByAltText('選択中の参照画像').getAttribute('src')).toContain(idOf('a'))
    rerender(wrap(<ParamPanel {...base} paramValues={{ ref_image: tokenOf('b') }} />))
    expect(screen.getByAltText('選択中の参照画像').getAttribute('src')).toContain(idOf('b'))
  })

  it('[REQ-427/AC-8] thumbnail load error shows fallback text and keeps the value', () => {
    const setParamValues = vi.fn()
    render(wrap(<ParamPanel {...base} setParamValues={setParamValues} paramValues={{ ref_image: tokenOf('a') }} />))
    fireEvent.error(screen.getByAltText('選択中の参照画像'))
    expect(screen.getByText('プレビューを表示できません')).toBeInTheDocument()
    expect(setParamValues).not.toHaveBeenCalled()
  })

  it('[REQ-427/AC-3] ParamSync slave image role is disabled', () => {
    render(wrap(<ParamPanel {...base}
      paramMappings={[imageMapping, { id: 13, role: 'ref_master', display_name: 'M', input_type: 'image' }]}
      paramSyncGroups={[{ id: 1, workflow_id: 1, name: 'G', is_enabled: true, master_role: 'ref_master', slave_roles: ['ref_image'], created_at: '2026-01-01T00:00:00Z' }]} />))
    const field = screen.getByTestId('image-param-ref_image')
    field.querySelectorAll('button').forEach((b) => expect(b).toBeDisabled())
  })
})

describe('ParamPanel Component - Toggle Switch Standardization [REQ-433]', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('[REQ-433/AC-3][REQ-433/AC-4] renders all 4 ON/OFF toggles with role="switch", aria-checked, aria-label, data-radius-exempt, data-tap-target-exempt, touch-manipulation, and hit-slop classes', () => {
    const setParamValues = vi.fn()
    const onToggleParamSync = vi.fn()
    const onToggleBypass = vi.fn()

    render(
      <ParamPanel
        paramMappings={[
          { id: 1, role: 'use_hires', display_name: 'Hires Fix', input_type: 'boolean' },
          { id: 2, role: 'custom_flag', display_name: 'Custom Flag', input_type: 'my_bool' },
          { id: 3, role: 'Sampler_Seed', display_name: 'Sampler Seed', input_type: 'int' },
        ]}
        paramTypeMasters={[
          { id: 1, name: 'my_bool', display_name: 'My Bool', widget_type: 'boolean' } as any,
        ]}
        paramValues={{ use_hires: 'true', custom_flag: 'false', Sampler_Seed: '123' }}
        setParamValues={setParamValues}
        batchSize={1}
        setBatchSize={vi.fn()}
        seedMode="random"
        setSeedMode={vi.fn()}
        seed={123}
        setSeed={vi.fn()}
        paramSyncGroups={[
          { id: 10, workflow_id: 1, name: 'Sampler Sync', is_enabled: true, master_role: 'a', slave_roles: [], created_at: '2026-08-01T00:00:00Z' },
        ]}
        onToggleParamSync={onToggleParamSync}
        bypassProfiles={[
          { id: 20, name: 'Face Restore Bypass', is_enabled: false },
        ]}
        onToggleBypass={onToggleBypass}
      />,
    )

    const switches = screen.getAllByRole('switch')
    expect(switches).toHaveLength(4)

    const hiresSwitch = screen.getByRole('switch', { name: 'Hires Fix' })
    expect(hiresSwitch).toHaveAttribute('aria-checked', 'true')
    expect(hiresSwitch).toHaveAttribute('data-radius-exempt')
    expect(hiresSwitch).toHaveAttribute('data-tap-target-exempt')
    expect(hiresSwitch.className).toContain('touch-manipulation')
    expect(hiresSwitch.className).toContain('before:-inset-x-2')
    expect(hiresSwitch.className).toContain('before:-inset-y-3.5')
    expect(hiresSwitch.querySelector('span')).toHaveAttribute('data-radius-exempt')

    const customSwitch = screen.getByRole('switch', { name: 'Custom Flag' })
    expect(customSwitch).toHaveAttribute('aria-checked', 'false')
    expect(customSwitch).toHaveAttribute('data-radius-exempt')
    expect(customSwitch).toHaveAttribute('data-tap-target-exempt')
    expect(customSwitch.className).toContain('touch-manipulation')
    expect(customSwitch.className).toContain('before:-inset-x-2')
    expect(customSwitch.className).toContain('before:-inset-y-3.5')
    expect(customSwitch.querySelector('span')).toHaveAttribute('data-radius-exempt')

    const syncSwitch = screen.getByRole('switch', { name: 'Sampler Sync' })
    expect(syncSwitch).toHaveAttribute('aria-checked', 'true')
    expect(syncSwitch).toHaveAttribute('data-radius-exempt')
    expect(syncSwitch).toHaveAttribute('data-tap-target-exempt')
    expect(syncSwitch.className).toContain('touch-manipulation')
    expect(syncSwitch.className).toContain('before:-inset-x-2')
    expect(syncSwitch.className).toContain('before:-inset-y-3.5')
    expect(syncSwitch.querySelector('span')).toHaveAttribute('data-radius-exempt')

    const bypassSwitch = screen.getByRole('switch', { name: 'Face Restore Bypass' })
    expect(bypassSwitch).toHaveAttribute('aria-checked', 'false')
    expect(bypassSwitch).toHaveAttribute('data-radius-exempt')
    expect(bypassSwitch).toHaveAttribute('data-tap-target-exempt')
    expect(bypassSwitch.className).toContain('touch-manipulation')
    expect(bypassSwitch.className).toContain('before:-inset-x-2')
    expect(bypassSwitch.className).toContain('before:-inset-y-3.5')
    expect(bypassSwitch.querySelector('span')).toHaveAttribute('data-radius-exempt')

    // Push-button toggle (#seed-toggle) must remain a normal button, not role="switch"
    const seedToggle = document.getElementById('seed-toggle')
    expect(seedToggle).toBeInTheDocument()
    expect(seedToggle).not.toHaveAttribute('role', 'switch')

    // Interactions
    fireEvent.click(hiresSwitch)
    expect(setParamValues).toHaveBeenCalledWith(expect.objectContaining({ use_hires: 'false' }))
    fireEvent.click(syncSwitch)
    expect(onToggleParamSync).toHaveBeenCalledWith(10, false)
    fireEvent.click(bypassSwitch)
    expect(onToggleBypass).toHaveBeenCalledWith(20, true)
  })
})
