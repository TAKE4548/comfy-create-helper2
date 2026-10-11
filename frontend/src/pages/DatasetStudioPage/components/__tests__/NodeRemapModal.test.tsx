import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { NodeRemapModal, isStudioAllowedRole } from '../NodeRemapModal'
import { workflowsApi, mappingMastersApi } from '../../../../api/client'
import type { Workflow } from '../../../../api/types'

vi.mock('../../../../api/client', () => ({
  workflowsApi: {
    update: vi.fn().mockResolvedValue({ id: 1 }),
    get: vi.fn(),
  },
  mappingMastersApi: {
    list: vi.fn().mockResolvedValue([]),
  },
}))

describe('NodeRemapModal & isStudioAllowedRole (REQ-331-T3)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('isStudioAllowedRole pure function', () => {
    it('allows non-textarea roles regardless of role name', () => {
      expect(isStudioAllowedRole({ input_type: 'int', role: 'steps' })).toBe(true)
      expect(isStudioAllowedRole({ input_type: 'float', role: 'cfg' })).toBe(true)
      expect(isStudioAllowedRole({ input_type: 'select_sampler', role: 'sampler_name' })).toBe(true)
      expect(isStudioAllowedRole({ input_type: 'select_scheduler', role: 'scheduler' })).toBe(true)
      expect(isStudioAllowedRole({ input_type: 'lora_stack', role: 'loras' })).toBe(true)
      expect(isStudioAllowedRole({ input_type: 'boolean', role: 'enable_refiner' })).toBe(true)
    })

    it('allows positive and negative textarea prompt roles', () => {
      expect(isStudioAllowedRole({ input_type: 'textarea', role: 'Main_Positive_Prompt' })).toBe(true)
      expect(isStudioAllowedRole({ input_type: 'textarea', role: 'Negative_Prompt' })).toBe(true)
      expect(isStudioAllowedRole({ input_type: 'textarea', role: 'clip_positive' })).toBe(true)
      expect(isStudioAllowedRole({ input_type: 'textarea', role: 'clip_negative' })).toBe(true)
    })

    it('excludes generic textarea roles that collide with matrix factors', () => {
      expect(isStudioAllowedRole({ input_type: 'textarea', role: 'Custom_Prompt_Text' })).toBe(false)
      expect(isStudioAllowedRole({ input_type: 'textarea', role: 'Character_Description' })).toBe(false)
      expect(isStudioAllowedRole({ input_type: 'textarea', role: 'Scene_Details' })).toBe(false)
    })
  })

  describe('NodeRemapModal component', () => {
    const mockWorkflow: Workflow = {
      id: 1,
      name: 'Test Workflow',
      description: 'A test workflow',
      is_default: true,
      json_body: {
        '10': { class_type: 'CLIPTextEncode', inputs: { text: '' }, _meta: { title: 'Positive Prompt' } },
        '11': { class_type: 'CLIPTextEncode', inputs: { text: '' }, _meta: { title: 'Negative Prompt' } },
        '12': { class_type: 'KSampler', inputs: { steps: 20, cfg: 7.0 }, _meta: { title: 'Main Sampler' } },
      },
      mappings: [
        {
          id: 1,
          workflow_id: 1,
          master_id: 101,
          node_id: '10',
          role: 'Main_Positive_Prompt',
          display_name: 'Positive Prompt',
          input_type: 'textarea',
          default_value: '',
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
        {
          id: 2,
          workflow_id: 1,
          master_id: 102,
          node_id: '11',
          role: 'Negative_Prompt',
          display_name: 'Negative Prompt',
          input_type: 'textarea',
          default_value: '',
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
        {
          id: 3,
          workflow_id: 1,
          master_id: 103,
          node_id: '12',
          role: 'steps',
          display_name: 'Sampling Steps',
          input_type: 'int',
          default_value: '20',
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
        {
          id: 4,
          workflow_id: 1,
          master_id: 104,
          node_id: '99',
          role: 'Generic_Text',
          display_name: 'Excluded Generic Prompt',
          input_type: 'textarea',
          default_value: '',
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
      ],
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
    }

    it('renders positive/negative prompts and allowed parameter mappings while filtering out generic textarea roles', () => {
      render(
        <NodeRemapModal
          workflow={mockWorkflow}
          onClose={vi.fn()}
          onSaved={vi.fn()}
        />
      )

      expect(screen.getByTestId('remap-positive-select')).toBeInTheDocument()
      expect(screen.getByTestId('remap-negative-select')).toBeInTheDocument()

      // Parameter mappings rendered
      expect(screen.getByTestId('remap-select-steps')).toBeInTheDocument()
      expect(screen.getByText('Sampling Steps')).toBeInTheDocument()

      // Excluded generic textarea mapping must NOT be rendered in parameter list
      expect(screen.queryByTestId('remap-select-Generic_Text')).not.toBeInTheDocument()
      expect(screen.queryByText('Excluded Generic Prompt')).not.toBeInTheDocument()
    })

    it('TC-COMP-03: renders candidate node options in parameter dropdown using unified format (REQ-342)', () => {
      render(
        <NodeRemapModal
          workflow={mockWorkflow}
          onClose={vi.fn()}
          onSaved={vi.fn()}
        />
      )

      const stepsSelect = screen.getByTestId('remap-select-steps')
      const options = Array.from(stepsSelect.querySelectorAll('option')).map((opt) => opt.textContent)

      expect(options).toContain('10 - [Positive Prompt] (CLIPTextEncode)')
      expect(options).toContain('11 - [Negative Prompt] (CLIPTextEncode)')
      expect(options).toContain('12 - [Main Sampler] (KSampler)')
    })

    it('updates parameter mapping and saves successfully', async () => {
      const onSavedMock = vi.fn()
      const onCloseMock = vi.fn()
      vi.mocked(workflowsApi.get).mockResolvedValueOnce(mockWorkflow)

      render(
        <NodeRemapModal
          workflow={mockWorkflow}
          onClose={onCloseMock}
          onSaved={onSavedMock}
        />
      )

      // Change steps mapping from '12' to '10'
      const stepsSelect = screen.getByTestId('remap-select-steps')
      fireEvent.change(stepsSelect, { target: { value: '10' } })

      // Click save
      const saveBtn = screen.getByTestId('save-remap-button')
      fireEvent.click(saveBtn)

      await waitFor(() => {
        expect(workflowsApi.update).toHaveBeenCalledWith(1, {
          mappings: [
            { master_id: 101, node_id: '10' },
            { master_id: 102, node_id: '11' },
            { master_id: 103, node_id: '10' },
            { master_id: 104, node_id: '99' },
          ],
        })
        expect(onSavedMock).toHaveBeenCalledWith(mockWorkflow)
        expect(onCloseMock).toHaveBeenCalled()
      })
    })
  })
})