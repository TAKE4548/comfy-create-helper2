import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { MappingMasterEditModal } from '../../../../components/MappingMasterEditModal'
import { workflowsApi } from '../../../../api/domains/workflows'
import type { MappingMaster, MappingGroupMaster, StageMaster } from '../../../../api/types'

vi.mock('../../../../api/domains/workflows', () => ({
  workflowsApi: {
    list: vi.fn(),
    get: vi.fn(),
  },
}))

describe('MappingMasterSection Fallbacks Integration', () => {
  const dummyGroups: MappingGroupMaster[] = [
    { id: 1, key: 'sampler', name: 'サンプラー系', sort_order: 1, is_builtin: true, is_active: true },
  ]

  const dummyStages: StageMaster[] = [
    { id: 1, key: 'main', name: '通常 (Main)', suffix: '', is_builtin: true, is_active: true, sort_order: 1 },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(workflowsApi.list).mockResolvedValue([])
  })

  it('submits updated fallback_param_names, pattern chips, and fields on save', async () => {
    const onSave = vi.fn()
    const onClose = vi.fn()

    const initialMaster: MappingMaster = {
      id: 10,
      group_id: 1,
      base_key: 'seed',
      name: 'Seed',
      param_name: 'seed',
      input_type: 'int',
      expected_class_types: ['KSampler'],
      base_title_patterns: ['KSampler'],
      fallback_param_names: ['noise_seed'],
      sort_order: 1,
      variants: [
        {
          id: 101,
          master_id: 10,
          stage_id: 1,
          stage_key: 'main',
          stage_name: '通常 (Main)',
          stage_suffix: '',
          computed_role: 'seed',
          custom_role_override: null,
          extra_title_patterns: null,
          is_enabled: true,
          sort_order: 1,
        },
      ],
    }

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <MappingMasterEditModal
          isOpen={true}
          master={initialMaster}
          groups={dummyGroups}
          stages={dummyStages}
          paramTypeMasters={[]}
          onClose={onClose}
          onSave={onSave}
        />
      </QueryClientProvider>
    )

    // Verify initial values render
    expect(screen.getByDisplayValue('Seed')).toBeInTheDocument()
    expect(screen.getByDisplayValue('seed')).toBeInTheDocument()
    expect(screen.getByText('noise_seed')).toBeInTheDocument()
    expect(screen.getAllByText('KSampler').length).toBeGreaterThan(0)

    // Add a new fallback parameter
    const fallbackInput = screen.getByPlaceholderText('表記ゆれ追加 (例: noise_seed, random_seed)...')
    fireEvent.change(fallbackInput, { target: { value: 'random_seed' } })
    fireEvent.keyDown(fallbackInput, { key: 'Enter' })

    expect(screen.getByText('random_seed')).toBeInTheDocument()

    // Add a new pattern chip
    const patternInput = screen.getByPlaceholderText('パターン追加...')
    fireEvent.change(patternInput, { target: { value: 'sampler_custom' } })
    fireEvent.keyDown(patternInput, { key: 'Enter' })

    expect(screen.getByText('sampler_custom')).toBeInTheDocument()

    // Save
    fireEvent.click(screen.getByText('マスターを保存'))

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Seed',
        param_name: 'seed',
        expected_class_types: ['KSampler'],
        base_title_patterns: ['KSampler', 'sampler_custom'],
        fallback_param_names: ['noise_seed', 'random_seed'],
      })
    )
  })
})
