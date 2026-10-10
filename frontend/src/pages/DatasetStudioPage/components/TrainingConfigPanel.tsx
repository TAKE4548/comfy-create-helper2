import React, { useState, useEffect, useRef } from 'react'
import { AlertTriangle, Rocket, Settings2, Square } from 'lucide-react'
import { useStudioStore } from '../useStudioStore'
import { trainingApi } from '../../../api/client'
import { TrainingTooltip } from './TrainingTooltip'
import { TelemetryLossChart } from './TelemetryLossChart'
import type { LoraTrainingJobCreate } from '../../../api/types'

export function computeTrainingSchedule(
  itemCount: number,
  repeats: number,
  batchSize: number,
  epochs: number,
  saveInterval: number
) {
  const safeBatch = Math.max(batchSize, 1)
  const stepsPerEpoch = Math.ceil((itemCount * repeats) / safeBatch)
  const totalSteps = stepsPerEpoch * epochs
  const checkpointsCount = saveInterval > 0 ? Math.floor(epochs / saveInterval) : 0
  return { stepsPerEpoch, totalSteps, checkpointsCount }
}

export const TrainingConfigPanel: React.FC = () => {
  const {
    activeProject,
    items,
    activeJob,
    setActiveJob,
    isTrainingActive,
    setIsTrainingActive,
    telemetryLogs,
    addTelemetryLog,
    clearTelemetryLogs,
    lossHistory,
    clearLossHistory,
    handleTelemetryMessage,
  } = useStudioStore()

  // Training Parameters
  const [loraName, setLoraName] = useState(
    activeProject ? `${activeProject.character_trigger}_lora` : 'my_character_lora'
  )
  const [epochs, setEpochs] = useState<number>(10)
  const [repeats, setRepeats] = useState<number>(10)
  const [batchSize, setBatchSize] = useState<number>(1)
  const [saveInterval, setSaveInterval] = useState<number>(2)

  // Hyperparameters
  const [networkDim, setNetworkDim] = useState<number>(32)
  const [networkAlpha, setNetworkAlpha] = useState<number>(16)
  const [learningRate, setLearningRate] = useState<string>('1e-4')
  const [textEncoderLr, setTextEncoderLr] = useState<string>('0')
  const [mixedPrecision, setMixedPrecision] = useState<'bf16' | 'fp16'>('bf16')
  const [gradientCheckpointing, setGradientCheckpointing] = useState<boolean>(true)
  const [noiseOffset, setNoiseOffset] = useState<number>(0.05)

  // Telemetry real-time state
  const [currentVramGb, setCurrentVramGb] = useState<number>(0)
  const [gpuTemp, setGpuTemp] = useState<number>(0)
  const [isStarting, setIsStarting] = useState<boolean>(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const approvedCount = items.filter((it) => it.status === 'APPROVED').length
  const effectiveCount = approvedCount > 0 ? approvedCount : items.length || 20

  const schedule = computeTrainingSchedule(effectiveCount, repeats, batchSize, epochs, saveInterval)

  const wsRef = useRef<WebSocket | null>(null)

  // Sync loraName when activeProject changes
  useEffect(() => {
    if (activeProject?.character_trigger) {
      setLoraName(`${activeProject.character_trigger}_lora`)
    }
  }, [activeProject?.character_trigger])

  // WebSocket Subscription for Job Telemetry
  useEffect(() => {
    if (!activeJob || !isTrainingActive) {
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
      return
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.host}/api/training/ws/${activeJob.id}`
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        handleTelemetryMessage(msg)
        if (typeof msg.vram_used_gb === 'number') {
          setCurrentVramGb(msg.vram_used_gb)
        }
        if (typeof msg.gpu_temp === 'number') {
          setGpuTemp(msg.gpu_temp)
        }
      } catch (e) {
        console.error('Failed to parse telemetry message', e)
      }
    }

    ws.onerror = (err) => {
      console.error('Telemetry WebSocket error:', err)
    }

    ws.onclose = () => {
      wsRef.current = null
    }

    return () => {
      ws.close()
      wsRef.current = null
    }
  }, [activeJob?.id, isTrainingActive, handleTelemetryMessage])

  const handleStartTraining = async () => {
    if (!activeProject) {
      setErrorMessage('アクティブなプロジェクトが選択されていません。')
      return
    }
    setErrorMessage(null)
    setIsStarting(true)
    clearLossHistory()
    clearTelemetryLogs()

    try {
      const configTomlContent = `[model]
name = "${loraName}"
dim = ${networkDim}
alpha = ${networkAlpha}
lr = "${learningRate}"
text_encoder_lr = "${textEncoderLr}"
mixed_precision = "${mixedPrecision}"
gradient_checkpointing = ${gradientCheckpointing}
noise_offset = ${noiseOffset}
`
      const jobData: LoraTrainingJobCreate = {
        project_id: activeProject.id,
        lora_name: loraName,
        config_toml_content: configTomlContent,
        epochs,
        repeats,
        batch_size: batchSize,
        total_steps: schedule.totalSteps,
        network_dim: networkDim,
        network_alpha: networkAlpha,
        learning_rate: learningRate,
      }

      const createdJob = await trainingApi.createJob(jobData)
      setActiveJob(createdJob)

      const startRes = await trainingApi.startJob(createdJob.id)
      setIsTrainingActive(true)
      addTelemetryLog(`学習プロセスを起動しました (PID: ${startRes.pid || 'N/A'})`)
    } catch (err: any) {
      setErrorMessage(`学習プロセスの起動に失敗しました: ${err.message || 'エラー'}`)
      setIsTrainingActive(false)
    } finally {
      setIsStarting(false)
    }
  }

  const handleStopTraining = async () => {
    if (!activeJob) return
    try {
      await trainingApi.stopJob(activeJob.id)
      setIsTrainingActive(false)
      addTelemetryLog('学習プロセスの中断リクエストを送信しました。')
    } catch (err: any) {
      setErrorMessage(`学習停止に失敗しました: ${err.message || 'エラー'}`)
    }
  }

  return (
    <div className="flex flex-col gap-6 p-6 max-w-5xl mx-auto" data-testid="training-config-panel">
      {/* Header and VRAM Guard Warning */}
      <div className="flex flex-col gap-2">
        <h2 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
          <Settings2 aria-hidden="true" className="h-5 w-5" /> Step 4: ローカル学習設定 & リアルタイム監視
        </h2>
        <p className="text-sm text-zinc-400">
          LoRA学習パラメータを設定し、WSL2上の学習プロセスを非同期起動します。AMD ROCm / RX 9070 XT に最適化されたパラメータを推奨しています。
        </p>

        {isTrainingActive && (
          <div
            className="bg-amber-950/40 border border-amber-600/60 rounded-lg p-3 text-amber-300 text-sm flex items-center gap-2"
            data-testid="vram-guard-alert"
          >
            <AlertTriangle aria-hidden="true" className="h-4 w-4 shrink-0" />
            <span>
              <strong>VRAMガード発動中:</strong> 現在学習プロセスがGPUを排他利用しているため、他画面での画像生成キュー投入はブロックされています。
            </span>
          </div>
        )}

        {errorMessage && (
          <div className="bg-rose-950/40 border border-rose-600/60 rounded-lg p-3 text-rose-300 text-sm">
            {errorMessage}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left Column: Form Controls */}
        <div className="flex flex-col gap-4 bg-zinc-900 border border-zinc-800 rounded-lg p-5">
          <h3 className="font-semibold text-sm text-zinc-200 border-b border-zinc-800 pb-2">
            学習ハイパーパラメータ設定
          </h3>

          {/* LoRA Name */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-zinc-300 font-medium flex items-center">
              LoRA出力名
            </label>
            <input
              type="text"
              className="px-3 py-1.5 text-sm bg-zinc-950 border border-zinc-700 rounded text-zinc-100 focus:outline-none focus:border-indigo-500"
              value={loraName}
              onChange={(e) => setLoraName(e.target.value)}
              disabled={isTrainingActive}
            />
          </div>

          {/* Schedule Settings: Epochs & Repeats */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="input-epochs" className="text-xs text-zinc-300 font-medium flex items-center">
                Epochs
              </label>
              <input
                id="input-epochs"
                type="number"
                min={1}
                max={100}
                className="px-3 py-1.5 text-sm bg-zinc-950 border border-zinc-700 rounded text-zinc-100 focus:outline-none focus:border-indigo-500"
                value={epochs}
                onChange={(e) => setEpochs(Number(e.target.value) || 1)}
                disabled={isTrainingActive}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="input-repeats" className="text-xs text-zinc-300 font-medium flex items-center">
                Dataset Repeats
              </label>
              <input
                id="input-repeats"
                type="number"
                min={1}
                max={50}
                className="px-3 py-1.5 text-sm bg-zinc-950 border border-zinc-700 rounded text-zinc-100 focus:outline-none focus:border-indigo-500"
                value={repeats}
                onChange={(e) => setRepeats(Number(e.target.value) || 1)}
                disabled={isTrainingActive}
              />
            </div>
          </div>

          {/* Batch Size & Save Interval */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="input-batch-size" className="text-xs text-zinc-300 font-medium flex items-center">
                Batch Size
              </label>
              <input
                id="input-batch-size"
                type="number"
                min={1}
                max={8}
                className="px-3 py-1.5 text-sm bg-zinc-950 border border-zinc-700 rounded text-zinc-100 focus:outline-none focus:border-indigo-500"
                value={batchSize}
                onChange={(e) => setBatchSize(Number(e.target.value) || 1)}
                disabled={isTrainingActive}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="input-save-interval" className="text-xs text-zinc-300 font-medium flex items-center">
                Save Interval (Epochs)
              </label>
              <input
                id="input-save-interval"
                type="number"
                min={1}
                max={50}
                className="px-3 py-1.5 text-sm bg-zinc-950 border border-zinc-700 rounded text-zinc-100 focus:outline-none focus:border-indigo-500"
                value={saveInterval}
                onChange={(e) => setSaveInterval(Number(e.target.value) || 1)}
                disabled={isTrainingActive}
              />
            </div>
          </div>

          {/* Schedule Dynamic Calculation Display */}
          <div
            className="bg-indigo-950/30 border border-indigo-700/50 rounded-lg p-3 flex justify-between items-center text-xs text-zinc-300"
            data-testid="training-schedule-summary"
          >
            <div>
              <span className="text-zinc-400">素材数:</span>{' '}
              <strong className="text-zinc-100">{effectiveCount} 枚</strong>
              <span className="mx-2 text-zinc-600">|</span>
              <span className="text-zinc-400">1Epochあたり:</span>{' '}
              <strong className="text-zinc-100">{schedule.stepsPerEpoch} steps</strong>
            </div>
            <div className="text-right">
              <span className="text-zinc-400">総ステップ数:</span>{' '}
              <strong className="text-indigo-300 text-sm font-mono">
                {schedule.totalSteps.toLocaleString()} steps
              </strong>
              <div className="text-[10px] text-zinc-500">
                (保存チェックポイント: {schedule.checkpointsCount} 個)
              </div>
            </div>
          </div>

          {/* Hyperparameters with Tooltips */}
          <div className="flex flex-col gap-3 pt-2 border-t border-zinc-800">
            {/* Network Dim & Alpha */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-zinc-300 font-medium flex items-center">
                  Network Dim (Rank)
                  <TrainingTooltip paramKey="networkDim" />
                </label>
                <input
                  type="number"
                  className="px-3 py-1.5 text-sm bg-zinc-950 border border-zinc-700 rounded text-zinc-100 focus:outline-none focus:border-indigo-500"
                  value={networkDim}
                  onChange={(e) => setNetworkDim(Number(e.target.value) || 1)}
                  disabled={isTrainingActive}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-zinc-300 font-medium flex items-center">
                  Network Alpha
                  <TrainingTooltip paramKey="networkAlpha" />
                </label>
                <input
                  type="number"
                  className="px-3 py-1.5 text-sm bg-zinc-950 border border-zinc-700 rounded text-zinc-100 focus:outline-none focus:border-indigo-500"
                  value={networkAlpha}
                  onChange={(e) => setNetworkAlpha(Number(e.target.value) || 1)}
                  disabled={isTrainingActive}
                />
              </div>
            </div>

            {/* Learning Rate & Text Encoder LR */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-zinc-300 font-medium flex items-center">
                  Learning Rate
                  <TrainingTooltip paramKey="learningRate" />
                </label>
                <input
                  type="text"
                  className="px-3 py-1.5 text-sm bg-zinc-950 border border-zinc-700 rounded text-zinc-100 focus:outline-none focus:border-indigo-500 font-mono"
                  value={learningRate}
                  onChange={(e) => setLearningRate(e.target.value)}
                  disabled={isTrainingActive}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-zinc-300 font-medium flex items-center">
                  Text Encoder LR
                  <TrainingTooltip paramKey="textEncoderLr" />
                </label>
                <input
                  type="text"
                  className="px-3 py-1.5 text-sm bg-zinc-950 border border-zinc-700 rounded text-zinc-100 focus:outline-none focus:border-indigo-500 font-mono"
                  value={textEncoderLr}
                  onChange={(e) => setTextEncoderLr(e.target.value)}
                  disabled={isTrainingActive}
                />
              </div>
            </div>

            {/* Mixed Precision & Noise Offset */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-zinc-300 font-medium flex items-center">
                  Mixed Precision
                  <TrainingTooltip paramKey="mixedPrecision" />
                </label>
                <select
                  className="px-3 py-1.5 text-sm bg-zinc-950 border border-zinc-700 rounded text-zinc-100 focus:outline-none focus:border-indigo-500"
                  value={mixedPrecision}
                  onChange={(e) => setMixedPrecision(e.target.value as any)}
                  disabled={isTrainingActive}
                >
                  <option value="bf16">bf16 (推奨 / ROCm必須)</option>
                  <option value="fp16">fp16</option>
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-zinc-300 font-medium flex items-center">
                  Noise Offset
                  <TrainingTooltip paramKey="noiseOffset" />
                </label>
                <input
                  type="number"
                  step={0.01}
                  className="px-3 py-1.5 text-sm bg-zinc-950 border border-zinc-700 rounded text-zinc-100 focus:outline-none focus:border-indigo-500 font-mono"
                  value={noiseOffset}
                  onChange={(e) => setNoiseOffset(Number(e.target.value) || 0)}
                  disabled={isTrainingActive}
                />
              </div>
            </div>

            {/* Gradient Checkpointing Checkbox */}
            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="grad-chk"
                checked={gradientCheckpointing}
                onChange={(e) => setGradientCheckpointing(e.target.checked)}
                disabled={isTrainingActive}
                className="rounded bg-zinc-950 border-zinc-700 text-indigo-600 focus:ring-0"
              />
              <label htmlFor="grad-chk" className="text-xs text-zinc-300 flex items-center cursor-pointer select-none">
                Gradient Checkpointing を有効化
                <TrainingTooltip paramKey="gradientCheckpointing" />
              </label>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-3 pt-3 border-t border-zinc-800">
            {!isTrainingActive ? (
              <button
                type="button"
                onClick={handleStartTraining}
                disabled={isStarting || !activeProject}
                data-testid="btn-start-training"
                className="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-lg shadow transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Rocket aria-hidden="true" className="h-4 w-4" />
                <span>{isStarting ? '起動中...' : '学習プロセス起動'}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleStopTraining}
                data-testid="btn-stop-training"
                className="flex-1 px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-medium rounded-lg shadow transition-colors flex items-center justify-center gap-2"
              >
                <Square aria-hidden="true" className="h-4 w-4" />
                <span>安全停止</span>
              </button>
            )}
          </div>
        </div>

        {/* Right Column: Real-time Telemetry & Logs */}
        <div className="flex flex-col gap-4">
          <TelemetryLossChart
            data={lossHistory}
            currentVramGb={currentVramGb}
            gpuTemp={gpuTemp}
            totalVramGb={16}
          />

          {/* Telemetry Output Logs */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 flex flex-col gap-2">
            <div className="flex justify-between items-center text-xs text-zinc-400 border-b border-zinc-800 pb-2">
              <span className="font-medium text-zinc-200">ターミナルログ</span>
              <span>{telemetryLogs.length} 行</span>
            </div>
            <div
              className="bg-zinc-950 rounded p-3 text-xs font-mono text-zinc-300 h-48 overflow-y-auto flex flex-col gap-1 border border-zinc-800"
              data-testid="telemetry-log-viewer"
            >
              {telemetryLogs.length === 0 ? (
                <span className="text-zinc-600 italic">ログ待機中...</span>
              ) : (
                telemetryLogs.map((log, idx) => (
                  <div key={idx} className="whitespace-pre-wrap break-all">
                    {log}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
