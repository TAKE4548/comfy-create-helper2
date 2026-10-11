import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { WorkflowMappingPreview } from '../WorkflowMappingPreview'
import { workflowsApi } from '../../api/domains/workflows'

vi.mock('../../api/domains/workflows', () => ({
  workflowsApi: {
    list: vi.fn(),
    get: vi.fn(),
  },
}))

describe('WorkflowMappingPreview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders selector and handles registered workflow selection', async () => {
    vi.mocked(workflowsApi.list).mockResolvedValue([
      { id: 1, name: 'Default Workflow', is_default: true, created_at: '', updated_at: '' },
    ])
    vi.mocked(workflowsApi.get).mockResolvedValue({
      id: 1,
      name: 'Default Workflow',
      is_default: true,
      created_at: '',
      updated_at: '',
      json_body: {
        '10': {
          class_type: 'KSampler',
          _meta: { title: 'KSampler Latent' },
          inputs: { noise_seed: 555, steps: 20 },
        },
      },
    })

    render(
      <WorkflowMappingPreview
        expectedClassTypes={['KSampler']}
        titlePatterns={['Latent']}
        primaryParamName="seed"
        fallbackParams={["noise_seed"]}
        onOpenNodePicker={vi.fn()}
      />
    )

    await waitFor(() => {
      expect(screen.getByText('Default Workflow')).toBeInTheDocument()
    })

    const select = screen.getByLabelText('登録済みワークフロー選択')
    fireEvent.change(select, { target: { value: '1' } })

    await waitFor(() => {
      expect(screen.getByText('KSampler Latent')).toBeInTheDocument()
      expect(screen.getByText(/noise_seed/)).toBeInTheDocument()
      expect(screen.getByText(/noise_seed/)).toBeInTheDocument()
    })
  })

  it('rejects files larger than 10MB', () => {
    render(
      <WorkflowMappingPreview
        expectedClassTypes={[]}
        titlePatterns={[]}
        primaryParamName=""
        fallbackParams={[]}
        onOpenNodePicker={vi.fn()}
      />
    )

    const file = new File(['a'.repeat(100)], 'huge.json', { type: 'application/json' })
    Object.defineProperty(file, 'size', { value: 11 * 1024 * 1024 })

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [file] } })

    expect(screen.getByText('ファイルサイズが上限（10MB）を超えています')).toBeInTheDocument()
  })
})
