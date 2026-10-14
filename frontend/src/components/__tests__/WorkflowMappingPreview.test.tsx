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

  it('[REQ-358/AC-7] ranks candidates and keeps non-recommended nodes selectable', async () => {
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
        '10': { class_type: 'KSampler', _meta: { title: 'Latent' }, inputs: { seed: 1 } },
        '11': { class_type: 'KSampler', _meta: { title: 'latent' }, inputs: { noise_seed: 2 } },
        '12': { class_type: 'KSampler', _meta: { title: 'Other' }, inputs: { steps: 20 } },
        '13': { class_type: 'Other', _meta: { title: 'Other' }, inputs: { seed: 2 } },
        '14': { class_type: 'Other', _meta: { title: 'Unrelated' }, inputs: {} },
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
      expect(screen.getByText('Latent')).toBeInTheDocument()
      expect(screen.getAllByLabelText('適合スコア 80%')).toHaveLength(2)
      expect(screen.getByLabelText('適合スコア 55%')).toBeInTheDocument()
      expect(screen.getByLabelText('適合スコア 26%')).toBeInTheDocument()
      expect(screen.getByLabelText('適合スコア 4%')).toBeInTheDocument()
      expect(screen.getByTestId('candidate-reasons-10')).toHaveTextContent('推奨')
      expect(screen.getByTestId('candidate-reasons-11')).toHaveTextContent('推奨')
      expect(screen.getByTestId('candidate-reasons-12')).toHaveTextContent('非推奨')
      expect(screen.getByTestId('candidate-reasons-13')).toHaveTextContent('非推奨')
      expect(screen.getByTestId('candidate-reasons-14')).toHaveTextContent('非推奨')
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
