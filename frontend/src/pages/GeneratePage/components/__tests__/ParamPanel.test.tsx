import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ParamPanel } from '../ParamPanel'
import { LS_KEYS } from '../../../../utils/localStorageKeys'

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
})
