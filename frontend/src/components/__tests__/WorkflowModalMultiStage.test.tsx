import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { UploadWorkflowModal } from '../UploadWorkflowModal'
import { RescanModal } from '../RescanModal'
import { mappingMastersApi, workflowsApi } from '../../api/client'
import type { MappingMasterV2, ScanResult } from '../../api/types'

vi.mock('../../api/client', () => ({
  mappingMastersApi: {
    list: vi.fn(),
  },
  workflowsApi: {
    scan: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
}))

const mockMultiStageMasters: MappingMasterV2[] = [
  {
    id: 1,
    base_key: 'steps',
    name: 'Steps Master',
    role: 'steps',
    display_name: 'Steps',
    param_name: 'steps',
    input_type: 'int',
    expected_class_types: ['KSampler'],
    base_title_patterns: ['steps'],
    sort_order: 1,
    group_id: null,
    variants: [
      {
        id: 101,
        master_id: 1,
        stage_id: 1,
        stage_name: 'Main',
        stage_key: 'main',
        stage_suffix: '',
        custom_role_override: null,
        computed_role: 'steps',
        extra_title_patterns: ['main'],
        is_enabled: true,
      },
      {
        id: 102,
        master_id: 1,
        stage_id: 2,
        stage_name: 'Rough',
        stage_key: 'rough',
        stage_suffix: '_rough',
        custom_role_override: null,
        computed_role: 'steps_rough',
        extra_title_patterns: ['rough'],
        is_enabled: true,
      },
    ],
  },
]

const mockScanResult: ScanResult = {
  matched: [
    {
      master_id: 1,
      variant_id: 101,
      stage_id: 1,
      stage_key: 'main',
      node_id: '10',
      node_title: 'KSampler Main',
    },
    {
      master_id: 1,
      variant_id: 102,
      stage_id: 2,
      stage_key: 'rough',
      node_id: '20',
      node_title: 'KSampler Rough',
    },
  ],
  warnings: [],
}

const mockWorkflowJson = {
  '10': {
    class_type: 'KSampler',
    _meta: { title: 'KSampler Main' },
    inputs: { steps: 20 },
  },
  '20': {
    class_type: 'KSampler',
    _meta: { title: 'KSampler Rough' },
    inputs: { steps: 10 },
  },
}

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

describe('WorkflowModalMultiStage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(mappingMastersApi.list).mockResolvedValue(mockMultiStageMasters)
    vi.mocked(workflowsApi.scan).mockResolvedValue(mockScanResult)
  })

  describe('UploadWorkflowModal multi-stage slots', () => {
    it('renders separate stage slots for Main and Rough and saves mapped nodes', async () => {
      vi.mocked(workflowsApi.create).mockResolvedValue({ id: 99, name: 'New MultiStage Workflow' })
      const onSaved = vi.fn()
      const onClose = vi.fn()

      renderWithClient(
        <UploadWorkflowModal
          initialName="New MultiStage Workflow"
          workflowJson={mockWorkflowJson}
          onClose={onClose}
          onSaved={onSaved}
        />
      )

      await waitFor(() => {
        expect(screen.getByText('Steps')).toBeInTheDocument()
      })

      // Both stage badges should be visible
      expect(screen.getByText('Main')).toBeInTheDocument()
      expect(screen.getByText('Rough')).toBeInTheDocument()

      // Select dropdowns for both slots
      const mainSelect = screen.getByTestId('slot-select-v_101') as HTMLSelectElement
      const roughSelect = screen.getByTestId('slot-select-v_102') as HTMLSelectElement

      expect(mainSelect.value).toBe('10')
      expect(roughSelect.value).toBe('20')

      // Recommended node option label format
      expect(screen.getAllByText(/★.*\[推奨\]/).length).toBeGreaterThan(0)

      // Submit modal
      const confirmBtn = screen.getByRole('button', { name: /登録/i })
      fireEvent.click(confirmBtn)

      await waitFor(() => {
        expect(workflowsApi.create).toHaveBeenCalledWith({
          name: 'New MultiStage Workflow',
          json_body: mockWorkflowJson,
          mappings: [
            { master_id: 1, variant_id: 101, node_id: '10' },
            { master_id: 1, variant_id: 102, node_id: '20' },
          ],
        })
        expect(onSaved).toHaveBeenCalledWith(99)
        expect(onClose).toHaveBeenCalled()
      })
    })

    it('clears Rough stage slot via clear button and excludes it from saved mappings', async () => {
      vi.mocked(workflowsApi.create).mockResolvedValue({ id: 100, name: 'Single Stage Mapped' })
      const onSaved = vi.fn()
      const onClose = vi.fn()

      renderWithClient(
        <UploadWorkflowModal
          initialName="Single Stage Mapped"
          workflowJson={mockWorkflowJson}
          onClose={onClose}
          onSaved={onSaved}
        />
      )

      await waitFor(() => {
        expect(screen.getByText('Steps')).toBeInTheDocument()
      })

      const roughSelect = screen.getByTestId('slot-select-v_102') as HTMLSelectElement
      expect(roughSelect.value).toBe('20')

      // Click clear button for Rough slot
      const clearRoughBtn = screen.getByTestId('clear-slot-v_102')
      fireEvent.click(clearRoughBtn)

      // Rough slot should now be unassigned ("")
      expect(roughSelect.value).toBe('')

      // Submit modal
      const confirmBtn = screen.getByRole('button', { name: /登録/i })
      fireEvent.click(confirmBtn)

      await waitFor(() => {
        expect(workflowsApi.create).toHaveBeenCalledWith({
          name: 'Single Stage Mapped',
          json_body: mockWorkflowJson,
          mappings: [
            { master_id: 1, variant_id: 101, node_id: '10' },
          ],
        })
        expect(onSaved).toHaveBeenCalledWith(100)
      })
    })

    it('handles all slots cleared (Red Team: 0 mappings safety)', async () => {
      vi.mocked(workflowsApi.create).mockResolvedValue({ id: 101, name: 'Empty Mappings' })
      const onSaved = vi.fn()
      const onClose = vi.fn()

      renderWithClient(
        <UploadWorkflowModal
          initialName="Empty Mappings"
          workflowJson={mockWorkflowJson}
          onClose={onClose}
          onSaved={onSaved}
        />
      )

      await waitFor(() => {
        expect(screen.getByText('Steps')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByTestId('clear-slot-v_101'))
      fireEvent.click(screen.getByTestId('clear-slot-v_102'))

      const confirmBtn = screen.getByRole('button', { name: /登録/i })
      fireEvent.click(confirmBtn)

      await waitFor(() => {
        expect(workflowsApi.create).toHaveBeenCalledWith({
          name: 'Empty Mappings',
          json_body: mockWorkflowJson,
          mappings: [],
        })
        expect(onSaved).toHaveBeenCalledWith(101)
      })
    })
  })

  describe('RescanModal multi-stage slots', () => {
    it('renders multi-stage slots and updates mappings with opt-out exclusion', async () => {
      vi.mocked(workflowsApi.update).mockResolvedValue({ id: 1 } as any)
      const onSaved = vi.fn()
      const onClose = vi.fn()

      renderWithClient(
        <RescanModal
          workflowId={1}
          workflowJson={mockWorkflowJson}
          existingMappings={[
            { master_id: 1, variant_id: 101, node_id: '10' },
            { master_id: 1, variant_id: 102, node_id: '20' },
          ]}
          onClose={onClose}
          onSaved={onSaved}
        />
      )

      await waitFor(() => {
        expect(screen.getByText('Steps')).toBeInTheDocument()
      })

      expect(screen.getByText('Main')).toBeInTheDocument()
      expect(screen.getByText('Rough')).toBeInTheDocument()

      const mainSelect = screen.getByTestId('slot-select-v_101') as HTMLSelectElement
      const roughSelect = screen.getByTestId('slot-select-v_102') as HTMLSelectElement
      expect(mainSelect.value).toBe('10')
      expect(roughSelect.value).toBe('20')

      // Opt out rough slot via dropdown "未設定"
      fireEvent.change(roughSelect, { target: { value: '' } })
      expect(roughSelect.value).toBe('')

      // Submit rescan modal
      const confirmBtn = screen.getByRole('button', { name: /適用・保存/i })
      fireEvent.click(confirmBtn)

      await waitFor(() => {
        expect(workflowsApi.update).toHaveBeenCalledWith(1, {
          mappings: [
            { master_id: 1, variant_id: 101, node_id: '10' },
          ],
        })
        expect(onSaved).toHaveBeenCalled()
        expect(onClose).toHaveBeenCalled()
      })
    })

    it('clears all slots via clear buttons in RescanModal and safely submits empty mappings', async () => {
      vi.mocked(workflowsApi.update).mockResolvedValue({ id: 1 } as any)
      const onSaved = vi.fn()
      const onClose = vi.fn()

      renderWithClient(
        <RescanModal
          workflowId={1}
          workflowJson={mockWorkflowJson}
          existingMappings={[
            { master_id: 1, variant_id: 101, node_id: '10' },
            { master_id: 1, variant_id: 102, node_id: '20' },
          ]}
          onClose={onClose}
          onSaved={onSaved}
        />
      )

      await waitFor(() => {
        expect(screen.getByText('Steps')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByTestId('clear-slot-v_101'))
      fireEvent.click(screen.getByTestId('clear-slot-v_102'))

      const confirmBtn = screen.getByRole('button', { name: /適用・保存/i })
      fireEvent.click(confirmBtn)

      await waitFor(() => {
        expect(workflowsApi.update).toHaveBeenCalledWith(1, {
          mappings: [],
        })
        expect(onSaved).toHaveBeenCalled()
      })
    })
  })
})