import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { WorkflowDiffReplaceModal } from '../WorkflowDiffReplaceModal'
import type { DiffAnalyzeResponse } from '../../api/types'

const MOCK_DIFF_RESULT: DiffAnalyzeResponse = {
  summary: {
    ok: 1,
    reindexed: 1,
    renamed: 0,
    substituted: 0,
    false_reuse: 0,
    not_found: 0,
    total: 2,
  },
  role_migrations: [
    {
      master_id: 1,
      role: 'positive',
      display_name: 'Positive Prompt',
      old_node_id: '6',
      new_node_id: '6',
      confidence: 100.0,
      reason: '完全一致 (100.0点)',
      status: 'ok',
      candidates: [
        { node_id: '6', title: 'Positive Prompt', class_type: 'CLIPTextEncode', score: 100.0 },
      ],
      old_topology: {
        node_id: '6',
        title: 'Positive Prompt',
        class_type: 'CLIPTextEncode',
        inputs: [{ slot: 'clip', source_node_id: '4', source_class: 'CheckpointLoaderSimple' }],
        outputs: [{ slot: 'positive', target_node_id: '3', target_class: 'KSampler' }],
      },
      new_topology: {
        node_id: '6',
        title: 'Positive Prompt',
        class_type: 'CLIPTextEncode',
        inputs: [{ slot: 'clip', source_node_id: '4', source_class: 'CheckpointLoaderSimple' }],
        outputs: [{ slot: 'positive', target_node_id: '3', target_class: 'KSampler' }],
      },
    },
    {
      master_id: 2,
      role: 'sampler',
      display_name: 'KSampler Master',
      old_node_id: '3',
      new_node_id: '30',
      confidence: 95.0,
      reason: 'ID変更検出 (旧ID:3 -> 新ID:30)',
      status: 'reindexed',
      candidates: [
        { node_id: '30', title: 'KSampler', class_type: 'KSampler', score: 95.0 },
      ],
      old_topology: {
        node_id: '3',
        title: 'KSampler',
        class_type: 'KSampler',
        inputs: [{ slot: 'model', source_node_id: '4', source_class: 'CheckpointLoaderSimple' }],
        outputs: [{ slot: 'samples', target_node_id: '8', target_class: 'VAEDecode' }],
      },
      new_topology: {
        node_id: '30',
        title: 'KSampler',
        class_type: 'KSampler',
        inputs: [{ slot: 'model', source_node_id: '4', source_class: 'CheckpointLoaderSimple' }],
        outputs: [{ slot: 'samples', target_node_id: '8', target_class: 'VAEDecode' }],
      },
    },
  ],
  bypass_warnings: [],
  unmapped_new_nodes: [
    { node_id: '99', title: 'Extra Node', class_type: 'Note' },
  ],
}

describe('WorkflowDiffReplaceModal', () => {
  it('renders master table and switches detail inspector on row click (AC-3)', () => {
    const handleClose = vi.fn()
    const handleConfirm = vi.fn()

    render(
      <WorkflowDiffReplaceModal
        isOpen={true}
        onClose={handleClose}
        workflowId={10}
        workflowName="My Test Workflow"
        diffResult={MOCK_DIFF_RESULT}
        onConfirm={handleConfirm}
      />
    )

    // Verify modal header and workflow name
    expect(screen.getByText('ワークフロー置換の差分レビュー')).toBeInTheDocument()
    expect(screen.getByText('My Test Workflow')).toBeInTheDocument()

    // Verify master table has roles
    expect(screen.getAllByText('Positive Prompt').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('KSampler Master')).toBeInTheDocument()

    // Initial detail inspector should display row 0 (Positive Prompt)
    expect(screen.getAllByText(/Positive Prompt/).length).toBeGreaterThan(1)

    // Click on row 2 (KSampler Master)
    const ksamplerRow = screen.getByText('KSampler Master').closest('tr')
    expect(ksamplerRow).not.toBeNull()
    fireEvent.click(ksamplerRow!)

    // Detail inspector now switches to KSampler Master
    expect(screen.getByText(/トポロジー詳細インスペクター:/)).toBeInTheDocument()
    expect(screen.getByText(/KSampler Master \(#3 → #30\)/)).toBeInTheDocument()
  })

  it('disables submit button if any required role is unmapped (AC-5)', () => {
    const handleClose = vi.fn()
    const handleConfirm = vi.fn()

    const unmappedDiffResult: DiffAnalyzeResponse = {
      ...MOCK_DIFF_RESULT,
      role_migrations: [
        {
          ...MOCK_DIFF_RESULT.role_migrations[0],
          new_node_id: null,
          status: 'not_found',
          confidence: 0,
        },
      ],
    }

    render(
      <WorkflowDiffReplaceModal
        isOpen={true}
        onClose={handleClose}
        workflowId={10}
        workflowName="Unmapped Test"
        diffResult={unmappedDiffResult}
        onConfirm={handleConfirm}
      />
    )

    const confirmBtn = screen.getByRole('button', { name: /確定して置換を実行/i })
    expect(confirmBtn).toBeDisabled()
    expect(screen.getByText(/未割当の役割が存在します/)).toBeInTheDocument()

    fireEvent.click(confirmBtn)
    expect(handleConfirm).not.toHaveBeenCalled()
  })

  it('allows manual node re-assignment via dropdown and submits updated mappings', () => {
    const handleClose = vi.fn()
    const handleConfirm = vi.fn()

    render(
      <WorkflowDiffReplaceModal
        isOpen={true}
        onClose={handleClose}
        workflowId={10}
        workflowName="Dropdown Test"
        diffResult={MOCK_DIFF_RESULT}
        onConfirm={handleConfirm}
      />
    )

    const confirmBtn = screen.getByRole('button', { name: /確定して置換を実行/i })
    expect(confirmBtn).not.toBeDisabled()

    // Find the select dropdowns for the rows
    const selects = screen.getAllByRole('combobox')
    expect(selects.length).toBe(2)

    // Change the second select to another node (Extra Node: 99)
    fireEvent.change(selects[1], { target: { value: '99' } })

    // Click confirm
    fireEvent.click(confirmBtn)

    expect(handleConfirm).toHaveBeenCalledTimes(1)
    expect(handleConfirm).toHaveBeenCalledWith([
      { master_id: 1, node_id: '6' },
      { master_id: 2, node_id: '99' },
    ])
  })
})
