import React, { useState, useEffect } from 'react'
import { Sparkles, RefreshCw, Send, CheckCircle, AlertCircle, Layers, Shirt } from 'lucide-react'
import { TagChipEditor } from '../../../components/TagChipEditor'
import { datasetApi, workflowsApi } from '../../../api/client'
import type { DatasetItem, Workflow } from '../../../api/types'
import { useStudioStore } from '../useStudioStore'
import { OutfitMasterModal, distributeAltOutfits } from './OutfitMasterModal'
import { OutfitPresetBadge } from './OutfitPresetBadge'

export interface MatrixGenerationStepProps {
  onDirectBatchSubmit?: (items: DatasetItem[], workflowPromptJson?: any) => Promise<void>
}

/**
 * Injects prompt and seed into a ComfyUI workflow JSON prompt payload.
 * Clones the workflow, searches for positive prompt node (CLIPTextEncode)
 * and seed node (KSampler), and injects raw_prompt and seed.
 */
export function injectPromptAndSeed(
  workflowPromptJson: Record<string, any> | undefined,
  rawPrompt: string,
  seed: number
): Record<string, any> {
  const payload = workflowPromptJson ? JSON.parse(JSON.stringify(workflowPromptJson)) : {}

  let promptInjected = false
  let seedInjected = false

  for (const nodeId of Object.keys(payload)) {
    const node = payload[nodeId]
    if (!node || typeof node !== 'object') continue

    // Positive text prompt node (CLIPTextEncode)
    if (!promptInjected && (node.class_type === 'CLIPTextEncode' || node.class_type?.includes('CLIPText'))) {
      if (node.inputs) {
        node.inputs.text = rawPrompt
        promptInjected = true
      }
    }

    // Sampler node (KSampler / KSamplerAdvanced)
    if (!seedInjected && (node.class_type === 'KSampler' || node.class_type === 'KSamplerAdvanced')) {
      if (node.inputs) {
        node.inputs.seed = seed
        seedInjected = true
      }
    }
  }

  // Fallback if no nodes matched: provide standard structure
  if (!promptInjected) {
    payload['6'] = {
      inputs: { text: rawPrompt },
      class_type: 'CLIPTextEncode',
    }
  }
  if (!seedInjected) {
    payload['3'] = {
      inputs: { seed },
      class_type: 'KSampler',
    }
  }

  return payload
}

export const MatrixGenerationStep: React.FC<MatrixGenerationStepProps> = ({
  onDirectBatchSubmit,
}) => {
  const {
    activeProject,
    setActiveProject,
    items,
    setItems,
    setCurrentStep,
    selectedAltOutfits,
    setSelectedAltOutfits,
  } = useStudioStore()

  // Project Configuration state
  const [projectName, setProjectName] = useState<string>(activeProject?.name || 'My New Chara LoRA')
  const [characterTrigger, setCharacterTrigger] = useState<string>(activeProject?.character_trigger || 'mychara')
  const [outfitTrigger, setOutfitTrigger] = useState<string>(activeProject?.outfit_trigger || 'mychara_outfit')
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<number>(activeProject?.workflow_id || 1)

  // 3-way tag inputs
  const [metaTags, setMetaTags] = useState<string>(
    activeProject?.prompt_meta || '1girl, solo, anime style, masterpiece, best quality'
  )
  const [physicalTags, setPhysicalTags] = useState<string>(
    activeProject?.prompt_physical || 'long silver hair, red eyes, ahoge, cat ears'
  )
  const [exclusiveOutfitTags, setExclusiveOutfitTags] = useState<string>(
    activeProject?.prompt_exclusive_outfit || 'black gothic dress, lace collar, gold trim, ribbon'
  )

  // Workflows list
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [isLoadingWorkflows, setIsLoadingWorkflows] = useState(false)

  // Modal state
  const [isOutfitModalOpen, setIsOutfitModalOpen] = useState(false)

  // Operations state
  const [isCalculating, setIsCalculating] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [batchProgress, setBatchProgress] = useState<number>(0)
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Fetch available workflows
  useEffect(() => {
    let isMounted = true
    setIsLoadingWorkflows(true)
    workflowsApi
      .list()
      .then((data) => {
        if (isMounted) {
          const list = Array.isArray(data) ? (data as Workflow[]) : []
          setWorkflows(list)
          if (list.length > 0 && !activeProject?.workflow_id) {
            setSelectedWorkflowId(list[0].id)
          }
        }
      })
      .catch(() => {
        // Fallback mock workflows if API is not loaded or during testing
        if (isMounted) {
          setWorkflows([{ id: 1, name: 'Default Anima 2B Generator' } as Workflow])
        }
      })
      .finally(() => {
        if (isMounted) setIsLoadingWorkflows(false)
      })
    return () => {
      isMounted = false
    }
  }, [activeProject?.workflow_id])

  // Character trigger sync logic: keep outfitTrigger ending with _outfit if using default pattern
  const handleCharacterTriggerChange = (newCharTrigger: string) => {
    setCharacterTrigger(newCharTrigger)
    if (!outfitTrigger || outfitTrigger === `${characterTrigger}_outfit`) {
      setOutfitTrigger(`${newCharTrigger}_outfit`)
    }
  }

  // Calculate DOE Orthogonal Matrix
  const handleCalculateMatrix = async () => {
    setIsCalculating(true)
    setStatusMessage(null)
    try {
      let project = activeProject
      const altOutfitsPayload = JSON.stringify(
        selectedAltOutfits.map((o) => ({
          id: o.id,
          name: o.name,
          prompt_tags: o.prompt_tags,
        }))
      )

      // If active project does not exist yet or needs to be saved, create or update
      if (!project) {
        project = await datasetApi.createProject({
          name: projectName,
          character_trigger: characterTrigger,
          outfit_trigger: outfitTrigger,
          workflow_id: selectedWorkflowId,
          prompt_meta: metaTags,
          prompt_physical: physicalTags,
          prompt_exclusive_outfit: exclusiveOutfitTags,
          selected_alt_outfits: altOutfitsPayload,
        })
        setActiveProject(project)
      } else {
        project = await datasetApi.updateProject(project.id, {
          name: projectName,
          character_trigger: characterTrigger,
          outfit_trigger: outfitTrigger,
          workflow_id: selectedWorkflowId,
          prompt_meta: metaTags,
          prompt_physical: physicalTags,
          prompt_exclusive_outfit: exclusiveOutfitTags,
          selected_alt_outfits: altOutfitsPayload,
        })
        setActiveProject(project)
      }

      const generatedItems = await datasetApi.calculateMatrix(project.id)
      setItems(generatedItems)
      setStatusMessage({
        type: 'success',
        text: `直交計画マトリクス (${generatedItems.length}件) の生成が完了しました`,
      })
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: `マトリクス算出エラー: ${err.message || 'Unknown error'}`,
      })
    } finally {
      setIsCalculating(false)
    }
  };

  // Submit direct 20 items batch to ComfyUI (Port 8188)
  const handleSubmitBatch = async () => {
    if (items.length === 0) {
      setStatusMessage({
        type: 'error',
        text: 'マトリクスアイテムが生成されていません。先に「直交マトリクス再計算」を実行してください。',
      })
      return
    }

    setIsSubmitting(true)
    setBatchProgress(0)
    setStatusMessage(null)

    try {
      if (onDirectBatchSubmit) {
        await onDirectBatchSubmit(items)
        setBatchProgress(100)
      } else {
        // Direct ComfyUI submission to port 8188
        const comfyUrl = 'http://127.0.0.1:8188'
        const clientId = 'lora-studio-' + Math.random().toString(36).slice(2, 9)

        // Fetch selected workflow JSON body if available
        let workflowPromptJson: Record<string, any> = {}
        try {
          const wf = await workflowsApi.get(selectedWorkflowId)
          workflowPromptJson = wf?.json_body || {}
        } catch {
          workflowPromptJson = {}
        }

        for (let i = 0; i < items.length; i++) {
          const item = items[i]
          const payload = injectPromptAndSeed(workflowPromptJson, item.raw_prompt, item.seed)

          await fetch(`${comfyUrl}/prompt`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: payload, client_id: clientId }),
          })

          setBatchProgress(Math.round(((i + 1) / items.length) * 100))
        }
      }

      setStatusMessage({
        type: 'success',
        text: `ComfyUIへの${items.length}件の直接バッチ投入が完了しました！`,
      })
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: `ComfyUI直接投入エラー: ${err.message || '接続に失敗しました'}`,
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-6" data-testid="matrix-generation-step">
      {/* Top Configuration Card */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-sm">
        <h2 className="text-base font-semibold text-zinc-100 flex items-center gap-2 mb-4">
          <Sparkles className="w-4 h-4 text-indigo-400" />
          プロジェクト & トリガー連動設定
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">
              プロジェクト名
            </label>
            <input
              type="text"
              data-testid="project-name-input"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-indigo-500"
              placeholder="例: Alice Character LoRA"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">
              キャラトリガー名
            </label>
            <input
              type="text"
              data-testid="character-trigger-input"
              value={characterTrigger}
              onChange={(e) => handleCharacterTriggerChange(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-indigo-500"
              placeholder="mychara"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">
              本命衣装トリガー名
            </label>
            <input
              type="text"
              data-testid="outfit-trigger-input"
              value={outfitTrigger}
              onChange={(e) => setOutfitTrigger(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-indigo-500"
              placeholder="mychara_outfit"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">
              ComfyUI ワークフロー
            </label>
            <select
              data-testid="workflow-select"
              value={selectedWorkflowId}
              onChange={(e) => setSelectedWorkflowId(Number(e.target.value))}
              disabled={isLoadingWorkflows}
              className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-indigo-500"
            >
              {workflows.map((wf) => (
                <option key={wf.id} value={wf.id}>
                  {wf.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* 3-Section Tag Inputs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* 1. Meta / Quality */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-zinc-200">① メタ情報 (Meta & Quality)</h3>
              <span className="text-[10px] bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded">共通維持</span>
            </div>
            <p className="text-xs text-zinc-400 mb-3">
              画風、基本クオリティ、共通設定タグ
            </p>
            <div data-testid="meta-tag-editor" className="min-h-[110px] bg-zinc-950/60 p-2 rounded-lg border border-zinc-800">
              <TagChipEditor
                id="meta-tag-editor"
                value={metaTags}
                onChange={setMetaTags}
                placeholder="1girl, solo, anime style, masterpiece..."
              />
            </div>
          </div>
          <div className="mt-3 text-[11px] text-zinc-500">
            ※ トリガー置換は行われず、全スロットの先頭に維持されます
          </div>
        </div>

        {/* 2. Physical & Face */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-zinc-200">② 身体的特徴・顔 (Face & Body)</h3>
              <span className="text-[10px] bg-indigo-950 text-indigo-300 border border-indigo-800 px-2 py-0.5 rounded">
                連動: {characterTrigger}
              </span>
            </div>
            <p className="text-xs text-zinc-400 mb-3">
              髪型、髪色、瞳の色、ケモ耳などの固定身体特徴
            </p>
            <div data-testid="physical-tag-editor" className="min-h-[110px] bg-zinc-950/60 p-2 rounded-lg border border-zinc-800">
              <TagChipEditor
                id="physical-tag-editor"
                value={physicalTags}
                onChange={setPhysicalTags}
                placeholder="long silver hair, red eyes, cat ears..."
              />
            </div>
          </div>
          <div className="mt-3 text-[11px] text-indigo-400/80">
            ※ キャプション生成時に完全消去され、キャラトリガーに置換されます
          </div>
        </div>

        {/* 3. Exclusive Outfit */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-zinc-200">③ 専用の服装 (Default Outfit)</h3>
              <span className="text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-800 px-2 py-0.5 rounded">
                連動: {outfitTrigger}
              </span>
            </div>
            <p className="text-xs text-zinc-400 mb-3">
              本命衣装の固有装飾、ドレス、リボン等の装飾タグ
            </p>
            <div data-testid="exclusive-outfit-editor" className="min-h-[110px] bg-zinc-950/60 p-2 rounded-lg border border-zinc-800">
              <TagChipEditor
                id="exclusive-outfit-editor"
                value={exclusiveOutfitTags}
                onChange={setExclusiveOutfitTags}
                placeholder="black gothic dress, lace collar, gold trim..."
              />
            </div>
          </div>
          <div className="mt-3 text-[11px] text-emerald-400/80">
            ※ 本命枠（15件）のみ消去・置換。別衣装枠（5件）には混入しません
          </div>
        </div>
      </div>

      {/* 4. Alt Outfits Library Integration */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Shirt className="w-4 h-4 text-indigo-400" />
              <h3 className="text-sm font-semibold text-zinc-200">
                別衣装ライブラリ (Alt Outfits: 25% / 5枠)
              </h3>
            </div>
            <p className="text-xs text-zinc-400 mt-1">
              本命衣装と対照的な衣装を選択し、直交マトリクス5枠に均等配分（過学習防止）
            </p>
          </div>

          <button
            type="button"
            data-testid="open-outfit-library-button"
            onClick={() => setIsOutfitModalOpen(true)}
            className="flex items-center gap-2 px-3.5 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white rounded-lg text-xs font-medium border border-zinc-700 transition-colors w-fit"
          >
            <Shirt className="w-3.5 h-3.5 text-indigo-400" />
            別衣装ライブラリから選択
          </button>
        </div>

        {/* Selected Badges & Summary */}
        <div className="bg-zinc-950/60 border border-zinc-800/80 rounded-lg p-3">
          {selectedAltOutfits.length === 0 ? (
            <div
              data-testid="alt-outfits-empty-state"
              className="text-xs text-zinc-500 py-2 flex items-center justify-between"
            >
              <span>別衣装が選択されていません（全20枠が本命衣装として生成されます）</span>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2" data-testid="alt-outfit-badges-container">
                {selectedAltOutfits.map((outfit) => {
                  const distributed = distributeAltOutfits(selectedAltOutfits, 5)
                  const slotCount = distributed.filter((o) => o.id === outfit.id).length
                  return (
                    <OutfitPresetBadge
                      key={outfit.id}
                      outfit={outfit}
                      count={slotCount}
                      onRemove={(id) => {
                        setSelectedAltOutfits(selectedAltOutfits.filter((o) => o.id !== id))
                      }}
                    />
                  )
                })}
              </div>

              {/* Distribution Summary */}
              <div
                data-testid="alt-outfit-distribution-summary"
                className="text-xs text-zinc-400 pt-2 border-t border-zinc-800/60 flex items-center gap-2 font-mono"
              >
                <span className="text-indigo-400 font-semibold">配分サマリー:</span>
                <span>
                  5枠中:{' '}
                  {(() => {
                    const distributed = distributeAltOutfits(selectedAltOutfits, 5)
                    const counts = selectedAltOutfits.map((o) => {
                      const c = distributed.filter((d) => d.id === o.id).length
                      return `${o.name} ${c}件`
                    })
                    return counts.join(', ')
                  })()}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      <OutfitMasterModal
        isOpen={isOutfitModalOpen}
        onClose={() => setIsOutfitModalOpen(false)}
        selectedOutfitIds={selectedAltOutfits.map((o) => o.id)}
        onSelectOutfits={(outfits) => setSelectedAltOutfits(outfits)}
      />

      {/* Action Buttons & Status Notification */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <button
            type="button"
            data-testid="calculate-matrix-button"
            disabled={isCalculating || isSubmitting}
            onClick={handleCalculateMatrix}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${isCalculating ? 'animate-spin' : ''}`} />
            直交マトリクス再計算 (DOE)
          </button>

          <button
            type="button"
            data-testid="submit-batch-button"
            disabled={isSubmitting || isCalculating || items.length === 0}
            onClick={handleSubmitBatch}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Send className="w-4 h-4" />
            ComfyUIに20件直接投入 (Port 8188)
          </button>
        </div>

        {items.length > 0 && (
          <button
            type="button"
            data-testid="proceed-to-curation-button"
            onClick={() => setCurrentStep(2)}
            className="flex items-center gap-2 text-xs text-indigo-400 hover:text-indigo-300 font-medium px-3 py-2 border border-indigo-900 rounded-lg hover:bg-indigo-950/40 transition-colors"
          >
            <Layers className="w-4 h-4" />
            Step 2 キュレーションへ進む ({items.length}件)
          </button>
        )}
      </div>

      {/* Batch Progress Bar */}
      {isSubmitting && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2" data-testid="batch-progress-container">
          <div className="flex justify-between text-xs text-zinc-300 font-medium">
            <span>ComfyUI直接バッチ投入中...</span>
            <span data-testid="batch-progress-text">{batchProgress}%</span>
          </div>
          <div className="w-full bg-zinc-950 rounded-full h-2 overflow-hidden border border-zinc-800">
            <div
              className="bg-emerald-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${batchProgress}%` }}
              data-testid="batch-progress-bar"
            />
          </div>
        </div>
      )}

      {/* Status Alert Message */}
      {statusMessage && (
        <div
          data-testid="status-message"
          className={`flex items-center gap-2.5 p-4 rounded-xl border text-sm ${
            statusMessage.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-800/80 text-emerald-300'
              : 'bg-rose-950/40 border-rose-800/80 text-rose-300'
          }`}
        >
          {statusMessage.type === 'success' ? (
            <CheckCircle className="w-5 h-5 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* Generated Items Preview List */}
      {items.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-zinc-200">
              生成マトリクスプレビュー ({items.length}件)
            </h3>
            <span className="text-xs text-zinc-400">
              本命衣装: 15件 (75%) / 別衣装: 5件 (25%)
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {items.slice(0, 8).map((item) => (
              <div
                key={item.id}
                className="bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-xs space-y-1.5"
                data-testid={`matrix-item-card-${item.slot_index}`}
              >
                <div className="flex justify-between items-center text-zinc-400 font-mono text-[11px]">
                  <span>Slot #{item.slot_index + 1}</span>
                  <span className="text-zinc-500">Seed: {item.seed}</span>
                </div>
                <p className="text-zinc-300 line-clamp-2 text-[11px] leading-relaxed">
                  {item.raw_prompt}
                </p>
              </div>
            ))}
          </div>
          {items.length > 8 && (
            <div className="text-center text-xs text-zinc-500 mt-3">
              他 {items.length - 8} 件省略...
            </div>
          )}
        </div>
      )}
    </div>
  )
}
