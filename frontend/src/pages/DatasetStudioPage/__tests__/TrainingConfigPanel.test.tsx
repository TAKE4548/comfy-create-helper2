import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import {
  TrainingConfigPanel,
  computeTrainingSchedule,
} from '../components/TrainingConfigPanel'
import { PARAM_TOOLTIPS, TrainingTooltip } from '../components/TrainingTooltip'
import { TelemetryLossChart } from '../components/TelemetryLossChart'
import { useStudioStore } from '../useStudioStore'
import { trainingApi } from '../../../api/client'
import type { DatasetProject, DatasetItem, LoraTrainingJob } from '../../../api/types'

vi.mock('../../../api/client', () => ({
  trainingApi: {
    createJob: vi.fn(),
    startJob: vi.fn(),
    stopJob: vi.fn(),
    getJobStatus: vi.fn(),
    getJob: vi.fn(),
  },
}))

describe('computeTrainingSchedule', () => {
  it('correctly calculates totalSteps and checkpointsCount according to spec', () => {
    // 20 items, 10 repeats, 1 batch, 10 epochs, saveInterval 2
    // stepsPerEpoch = (20 * 10) / 1 = 200
    // totalSteps = 200 * 10 = 2000
    // checkpointsCount = floor(10 / 2) = 5
    const schedule = computeTrainingSchedule(20, 10, 1, 10, 2)
    expect(schedule.stepsPerEpoch).toBe(200)
    expect(schedule.totalSteps).toBe(2000)
    expect(schedule.checkpointsCount).toBe(5)
  })

  it('handles batch size division rounding up', () => {
    // 20 items, 5 repeats, batchSize 3 -> ceil(100 / 3) = 34
    // 10 epochs -> 340 steps
    const schedule = computeTrainingSchedule(20, 5, 3, 10, 3)
    expect(schedule.stepsPerEpoch).toBe(34)
    expect(schedule.totalSteps).toBe(340)
    expect(schedule.checkpointsCount).toBe(3)
  })
})

describe('TrainingTooltip', () => {
  it('displays tooltip on hover with hardware recommendations', async () => {
    render(<TrainingTooltip paramKey="mixedPrecision" />)
    const trigger = screen.getByTestId('tooltip-trigger-mixedPrecision')
    expect(trigger).toBeDefined()
    expect(screen.queryByTestId('tooltip-content-mixedPrecision')).toBeNull()

    // Hover to reveal
    fireEvent.mouseEnter(trigger)
    const tooltip = screen.getByTestId('tooltip-content-mixedPrecision')
    expect(tooltip).toBeDefined()
    expect(tooltip.textContent).toContain('bf16')
    expect(tooltip.textContent).toContain('ROCm')

    // Leave to hide
    fireEvent.mouseLeave(trigger)
    expect(screen.queryByTestId('tooltip-content-mixedPrecision')).toBeNull()
  })

  it('contains explanations for all key hyperparameters', () => {
    expect(PARAM_TOOLTIPS.networkDim).toBeDefined()
    expect(PARAM_TOOLTIPS.networkAlpha).toBeDefined()
    expect(PARAM_TOOLTIPS.learningRate).toBeDefined()
    expect(PARAM_TOOLTIPS.textEncoderLr).toBeDefined()
    expect(PARAM_TOOLTIPS.mixedPrecision).toBeDefined()
    expect(PARAM_TOOLTIPS.gradientCheckpointing).toBeDefined()
    expect(PARAM_TOOLTIPS.noiseOffset).toBeDefined()
  })
})

describe('TelemetryLossChart', () => {
  it('renders SVG polyline and telemetry metrics correctly', () => {
    const mockData = [
      { step: 100, loss: 0.18 },
      { step: 200, loss: 0.12 },
      { step: 300, loss: 0.08 },
    ]
    render(<TelemetryLossChart data={mockData} currentVramGb={11.4} gpuTemp={68} totalVramGb={16} />)

    expect(screen.getByTestId('telemetry-loss-chart')).toBeDefined()
    expect(screen.getByRole('heading', { name: 'リアルタイム Loss 収束 & テレメトリ監視' }).querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByTestId('vram-indicator').textContent).toContain('11.4 GB')
    expect(screen.getByTestId('temp-indicator').textContent).toContain('68°C')

    const svg = screen.getByTestId('loss-svg')
    expect(svg).toBeDefined()
  })
})

describe('TrainingConfigPanel Component', () => {
  const mockProject: DatasetProject = {
    id: 1,
    name: 'Alice Project',
    character_trigger: 'alice',
    outfit_trigger: 'alice_outfit',
    workflow_id: 10,
    prompt_meta: 'masterpiece',
    prompt_physical: 'silver hair',
    prompt_exclusive_outfit: 'dress',
    selected_alt_outfits: '[]',
    created_at: '2026-10-07T00:00:00Z',
    updated_at: '2026-10-07T00:00:00Z',
  }

  const mockItems: DatasetItem[] = Array.from({ length: 20 }, (_, i) => ({
    id: i + 1,
    project_id: 1,
    slot_index: i,
    factors_json: JSON.stringify({ shot: 'Bust' }),
    raw_prompt: 'sample prompt',
    caption_text: 'sample caption',
    seed: 1234,
    status: 'APPROVED',
  }))

  beforeEach(() => {
    vi.clearAllMocks()
    useStudioStore.getState().resetStudio()
    useStudioStore.getState().setActiveProject(mockProject)
    useStudioStore.getState().setItems(mockItems)
  })

  it('renders schedule calculation dynamically reflecting input changes', () => {
    render(<TrainingConfigPanel />)

    // Initial: 20 items, 10 repeats, 10 epochs, 1 batch -> 2,000 steps
    const summary = screen.getByTestId('training-schedule-summary')
    expect(summary.textContent).toContain('2,000 steps')

    // Change epochs to 5
    const epochInput = screen.getByLabelText(/^Epochs$/i)
    fireEvent.change(epochInput, { target: { value: '5' } })

    // Recalculated: 20 * 10 * 5 = 1,000 steps
    expect(summary.textContent).toContain('1,000 steps')
  })

  it('handles training job creation and startup lifecycle', async () => {
    const mockCreatedJob: LoraTrainingJob = {
      id: 99,
      project_id: 1,
      lora_name: 'alice_lora',
      total_steps: 2000,
      epochs: 10,
      repeats: 10,
      batch_size: 1,
      network_dim: 32,
      network_alpha: 16,
      learning_rate: '1e-4',
      status: 'IDLE',
    }

    vi.mocked(trainingApi.createJob).mockResolvedValueOnce(mockCreatedJob)
    vi.mocked(trainingApi.startJob).mockResolvedValueOnce({ status: 'RUNNING', job_id: 99, pid: 12345 })

    render(<TrainingConfigPanel />)

    const startBtn = screen.getByTestId('btn-start-training')
    fireEvent.click(startBtn)

    await waitFor(() => {
      expect(trainingApi.createJob).toHaveBeenCalledTimes(1)
      expect(trainingApi.startJob).toHaveBeenCalledWith(99)
      expect(useStudioStore.getState().isTrainingActive).toBe(true)
    })

    // VRAM Guard banner is displayed while training is active
    expect(screen.getByTestId('vram-guard-alert')).toBeDefined()
    expect(screen.getByTestId('btn-stop-training')).toBeDefined()
  })

  it('handles stop training request', async () => {
    useStudioStore.getState().setIsTrainingActive(true)
    useStudioStore.getState().setActiveJob({
      id: 99,
      project_id: 1,
      lora_name: 'alice_lora',
      total_steps: 2000,
      epochs: 10,
      repeats: 10,
      batch_size: 1,
      network_dim: 32,
      network_alpha: 16,
      learning_rate: '1e-4',
      status: 'RUNNING',
    })

    vi.mocked(trainingApi.stopJob).mockResolvedValueOnce({ status: 'STOPPED', job_id: 99 })

    render(<TrainingConfigPanel />)

    const stopBtn = screen.getByTestId('btn-stop-training')
    fireEvent.click(stopBtn)

    await waitFor(() => {
      expect(trainingApi.stopJob).toHaveBeenCalledWith(99)
      expect(useStudioStore.getState().isTrainingActive).toBe(false)
    })
  })

  it('uses Step 4 semantic heading and decorative Lucide icons without changing training actions', () => {
    render(<TrainingConfigPanel />)

    expect(screen.getByRole('heading', { name: 'Step 4: ローカル学習設定 & リアルタイム監視' })).toBeInTheDocument()
    expect(screen.getByTestId('btn-start-training').querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.queryByText(/[🚀⚙️⚠️⏹️]/)).not.toBeInTheDocument()
  })
})
