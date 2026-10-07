import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import { BenchmarkGrid } from '../components/BenchmarkGrid'
import { BenchmarkCellModal } from '../components/BenchmarkCellModal'
import { SweetSpotCard } from '../components/SweetSpotCard'
import { benchmarkApi, comfyApi } from '../../../api/client'

vi.mock('../../../api/client', () => ({
  benchmarkApi: {
    generatePrompts: vi.fn(),
    evaluate: vi.fn(),
  },
  comfyApi: {
    queuePrompt: vi.fn(),
  },
}))

describe('SweetSpotCard', () => {
  it('renders recommended weight display and reason with highlight styling', () => {
    render(
      <SweetSpotCard
        recommendedWeightDisplay="0.75 〜 0.85"
        reason="衣装分離とプロンプト再現性のバランスが最適"
      />
    )

    expect(screen.getByTestId('sweet-spot-card')).toBeInTheDocument()
    expect(screen.getByTestId('sweet-spot-weight')).toHaveTextContent('0.75 〜 0.85')
    expect(screen.getByTestId('sweet-spot-reason')).toHaveTextContent(
      '衣装分離とプロンプト再現性のバランスが最適'
    )
  })
})

describe('BenchmarkCellModal', () => {
  it('renders cell details, image, prompt, and closes on button click', () => {
    const handleClose = vi.fn()
    const mockCell = {
      axisId: 'decoupling' as const,
      weight: 0.8 as const,
      imageUrl: '/outputs/benchmark_decoupling_0.8.png',
      status: 'PASS' as const,
      prompt: '<lora:my_model:0.8>, mychara, wearing red hoodie, blue denim jeans, standing',
      seed: 12345678,
    }

    const { rerender } = render(<BenchmarkCellModal cell={mockCell} onClose={handleClose} />)

    expect(screen.getByTestId('benchmark-cell-modal')).toBeInTheDocument()
    expect(screen.getByTestId('modal-prompt-text')).toHaveTextContent(
      '<lora:my_model:0.8>, mychara, wearing red hoodie'
    )
    expect(screen.getByTestId('modal-cell-image')).toHaveAttribute(
      'src',
      '/outputs/benchmark_decoupling_0.8.png'
    )

    fireEvent.click(screen.getByTestId('modal-close-btn'))
    expect(handleClose).toHaveBeenCalledTimes(1)

    rerender(<BenchmarkCellModal cell={null} onClose={handleClose} />)
    expect(screen.queryByTestId('benchmark-cell-modal')).not.toBeInTheDocument()
  })
})

describe('BenchmarkGrid', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders 4x3 comparison matrix with all 12 cells in initial pending state', () => {
    render(
      <BenchmarkGrid
        loraName="test_char_lora"
        characterTrigger="mychara"
        outfitTrigger="mychara_outfit"
      />
    )

    expect(screen.getByTestId('benchmark-matrix-table')).toBeInTheDocument()
    const axes = ['decoupling', 'bake_in', 'pose', 'angle']
    const weights = [0.6, 0.8, 1.0]

    axes.forEach((axis) => {
      weights.forEach((w) => {
        expect(screen.getByTestId(`benchmark-cell-${axis}-${w}`)).toBeInTheDocument()
      })
    })
  })

  it('triggers stress test execution, queues to ComfyUI, and displays sweet spot card', async () => {
    const mockPrompts = [
      { axis_id: 'decoupling', axis_title: '衣装分離', weight: 0.6, prompt: 'prompt 1', seed: 12345678 },
      { axis_id: 'decoupling', axis_title: '衣装分離', weight: 0.8, prompt: 'prompt 2', seed: 12345678 },
      { axis_id: 'decoupling', axis_title: '衣装分離', weight: 1.0, prompt: 'prompt 3', seed: 12345678 },
      { axis_id: 'bake_in', axis_title: '衣装再現', weight: 0.6, prompt: 'prompt 4', seed: 12345678 },
      { axis_id: 'bake_in', axis_title: '衣装再現', weight: 0.8, prompt: 'prompt 5', seed: 12345678 },
      { axis_id: 'bake_in', axis_title: '衣装再現', weight: 1.0, prompt: 'prompt 6', seed: 12345678 },
      { axis_id: 'pose', axis_title: 'ポーズ追従', weight: 0.6, prompt: 'prompt 7', seed: 12345678 },
      { axis_id: 'pose', axis_title: 'ポーズ追従', weight: 0.8, prompt: 'prompt 8', seed: 12345678 },
      { axis_id: 'pose', axis_title: 'ポーズ追従', weight: 1.0, prompt: 'prompt 9', seed: 12345678 },
      { axis_id: 'angle', axis_title: 'アングル追従', weight: 0.6, prompt: 'prompt 10', seed: 12345678 },
      { axis_id: 'angle', axis_title: 'アングル追従', weight: 0.8, prompt: 'prompt 11', seed: 12345678 },
      { axis_id: 'angle', axis_title: 'アングル追従', weight: 1.0, prompt: 'prompt 12', seed: 12345678 },
    ]

    vi.mocked(benchmarkApi.generatePrompts).mockResolvedValueOnce({
      prompts: mockPrompts,
      total: 12,
    })

    vi.mocked(comfyApi.queuePrompt).mockResolvedValue({
      prompt_id: 'mock-prompt-id',
    })

    vi.mocked(benchmarkApi.evaluate).mockResolvedValueOnce({
      sweet_spot: {
        recommended_weight_min: 0.75,
        recommended_weight_max: 0.85,
        recommended_weight_display: '0.75 〜 0.85',
        reason: '過学習なく衣装分離に最も優れたスイートスポットです',
      },
      results: [],
    })

    const onComplete = vi.fn()

    render(
      <BenchmarkGrid
        loraName="test_char_lora"
        characterTrigger="mychara"
        outfitTrigger="mychara_outfit"
        onBenchmarkComplete={onComplete}
      />
    )

    const runBtn = screen.getByTestId('run-benchmark-btn')
    fireEvent.click(runBtn)

    await waitFor(() => {
      expect(benchmarkApi.generatePrompts).toHaveBeenCalledWith({
        lora_name: 'test_char_lora',
        character_trigger: 'mychara',
        outfit_trigger: 'mychara_outfit',
      })
    })

    await waitFor(() => {
      expect(comfyApi.queuePrompt).toHaveBeenCalledTimes(12)
    })

    await waitFor(() => {
      expect(benchmarkApi.evaluate).toHaveBeenCalledTimes(1)
    })

    await waitFor(() => {
      expect(screen.getByTestId('sweet-spot-card')).toBeInTheDocument()
      expect(screen.getByTestId('sweet-spot-weight')).toHaveTextContent('0.75 〜 0.85')
      expect(screen.getByTestId('sweet-spot-reason')).toHaveTextContent(
        '過学習なく衣装分離に最も優れたスイートスポットです'
      )
    })

    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('opens modal when a cell is clicked', () => {
    const initialCells = [
      {
        axisId: 'decoupling' as const,
        weight: 0.8 as const,
        imageUrl: '/test.png',
        status: 'PASS' as const,
        prompt: 'test prompt for decoupling',
        seed: 12345678,
      },
    ]

    render(
      <BenchmarkGrid
        loraName="test_char_lora"
        characterTrigger="mychara"
        outfitTrigger="mychara_outfit"
        initialCells={initialCells}
      />
    )

    const cell = screen.getByTestId('benchmark-cell-decoupling-0.8')
    fireEvent.click(cell)

    expect(screen.getByTestId('benchmark-cell-modal')).toBeInTheDocument()
    expect(screen.getByTestId('modal-prompt-text')).toHaveTextContent('test prompt for decoupling')
  })
})
