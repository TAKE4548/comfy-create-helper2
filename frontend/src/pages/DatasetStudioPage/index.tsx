import React, { useState, useEffect, useRef } from 'react'
import { Sparkles, Layers, Sliders, CheckCircle, Type, Plus } from 'lucide-react'
import { PageHeader } from '../../components/common/PageHeader'
import { useStudioStore } from './useStudioStore'
import { MatrixGenerationStep } from './components/MatrixGenerationStep'
import { CuratorGrid } from './components/CuratorGrid'
import { BenchmarkGrid } from './components/BenchmarkGrid'
import { TrainingConfigPanel } from './components/TrainingConfigPanel'
import { CaptionEditorCard } from './components/CaptionEditorCard'
import { CreateProjectModal } from './components/CreateProjectModal'
import { datasetApi, workflowsApi } from '../../api/client'
import type { DatasetProject, Workflow } from '../../api/types'
import { loadActiveProjectId, saveActiveProjectId } from './utils/studioDraftStorage'

const STEPS = [
  { step: 1, label: 'Step 1: 生成', icon: Sparkles },
  { step: 2, label: 'Step 2: 選別', icon: Layers },
  { step: 3, label: 'Step 3: キャプション', icon: Type },
  { step: 4, label: 'Step 4: 学習', icon: Sliders },
] as const

export const DatasetStudioPage: React.FC = () => {
  const {
    currentStep,
    setCurrentStep,
    evaluationView,
    setEvaluationView,
    activeProject,
    setActiveProject,
    saveStatus,
    items,
    updateItemCaption,
    projectsList,
    setProjectsList,
  } = useStudioStore()

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [itemsLoadError, setItemsLoadError] = useState<string | null>(null)
  const itemsLoadRequestRef = useRef(0)
  const itemProjectIdRef = useRef<number | null>(activeProject?.id ?? null)

  useEffect(() => {
    let isMounted = true

    datasetApi
      .getProjects()
      .then((projects) => {
        if (!isMounted) return
        setProjectsList(projects)
        if (projects.length > 0) {
          const savedId = activeProject?.id || loadActiveProjectId()
          const matched = savedId ? projects.find((p) => p.id === savedId) : null
          const target = matched || projects[0]
          setActiveProject(target)
          saveActiveProjectId(target.id)
        }
      })
      .catch((err) => {
        console.warn('[DatasetStudioPage] Failed to fetch projects:', err)
      })

    workflowsApi
      .list()
      .then((wfList) => {
        if (isMounted) {
          setWorkflows(Array.isArray(wfList) ? (wfList as Workflow[]) : [])
        }
      })
      .catch((err) => {
        console.warn('[DatasetStudioPage] Failed to fetch workflows:', err)
      })

    return () => {
      isMounted = false
    }
  }, [setActiveProject, setProjectsList])

  useEffect(() => {
    const requestId = ++itemsLoadRequestRef.current
    const projectId = activeProject?.id ?? null
    setItemsLoadError(null)

    if (projectId === null) {
      itemProjectIdRef.current = null
      useStudioStore.setState({ items: [] })
      return () => {
        if (itemsLoadRequestRef.current === requestId) itemsLoadRequestRef.current += 1
      }
    }

    if (itemProjectIdRef.current !== projectId) {
      useStudioStore.setState({ items: [] })
    }
    itemProjectIdRef.current = projectId

    const itemsAtRequest = useStudioStore.getState().items
    if (itemsAtRequest.length > 0) {
      return () => {
        if (itemsLoadRequestRef.current === requestId) itemsLoadRequestRef.current += 1
      }
    }

    datasetApi.getItems(projectId)
      .then((savedItems) => {
        const currentState = useStudioStore.getState()
        if (
          itemsLoadRequestRef.current !== requestId ||
          currentState.activeProject?.id !== projectId ||
          currentState.items !== itemsAtRequest
        ) return
        useStudioStore.setState({ items: savedItems })
      })
      .catch((error) => {
        const currentState = useStudioStore.getState()
        if (
          itemsLoadRequestRef.current !== requestId ||
          currentState.activeProject?.id !== projectId ||
          currentState.items !== itemsAtRequest
        ) return
        console.warn(`[DatasetStudioPage] Failed to fetch items for project ${projectId}:`, error)
        setItemsLoadError('保存済みの素材を読み込めませんでした。')
      })

    return () => {
      if (itemsLoadRequestRef.current === requestId) itemsLoadRequestRef.current += 1
    }
  }, [activeProject?.id])

  const handleProjectSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedId = Number(e.target.value)
    const target = projectsList.find((p) => p.id === selectedId) || null
    if (target?.id !== activeProject?.id) {
      itemsLoadRequestRef.current += 1
      itemProjectIdRef.current = target?.id ?? null
      useStudioStore.setState({ items: [] })
      setItemsLoadError(null)
    }
    setActiveProject(target)
    if (target) {
      saveActiveProjectId(target.id)
    }
  }

  const handleProjectCreated = (newProject: DatasetProject) => {
    setProjectsList([...projectsList, newProject])
    itemsLoadRequestRef.current += 1
    itemProjectIdRef.current = newProject.id
    useStudioStore.setState({ items: [] })
    setItemsLoadError(null)
    setActiveProject(newProject)
    saveActiveProjectId(newProject.id)
    setIsCreateModalOpen(false)
  }

  const renderSaveStatusBadge = () => {
    switch (saveStatus) {
      case 'saving':
        return (
          <span
            data-testid="autosave-status"
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-950/60 text-amber-300 border border-amber-800/80"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            変更を保存中...
          </span>
        )
      case 'unsaved':
      case 'idle':
        return (
          <span
            data-testid="autosave-status"
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-950/60 text-indigo-300 border border-indigo-800/80"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
            未保存（下書き保持）
          </span>
        )
      case 'error':
        return (
          <span
            data-testid="autosave-status"
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-950/60 text-rose-300 border border-rose-800/80"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
            保存失敗（下書き保持中）
          </span>
        )
      case 'saved':
        return (
          <span
            data-testid="autosave-status"
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-950/60 text-emerald-300 border border-emerald-800/80"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            自動保存済み
          </span>
        )
      default:
        return (
          <span data-testid="autosave-status" className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-950/60 text-indigo-300 border border-indigo-800/80">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
            未保存（下書き保持）
          </span>
        )
    }
  }

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-zinc-100 overflow-y-auto">
      {/* Header */}
      <PageHeader
        title="LoRA Studio"
        icon={Sparkles}
        actions={
          <div className="flex items-center gap-2.5">
            <select
              data-testid="project-selector"
              value={activeProject?.id || ''}
              onChange={handleProjectSelect}
              className="bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500 max-w-[200px]"
            >
              {projectsList.length === 0 && <option value="">プロジェクトなし</option>}
              {projectsList.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>

            <button
              type="button"
              data-testid="open-create-project-modal-btn"
              onClick={() => setIsCreateModalOpen(true)}
              className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium transition-colors flex items-center gap-1 shadow-sm flex-shrink-0"
            >
              <Plus size={14} aria-hidden="true" />
              <span>新規プロジェクト</span>
            </button>

            {renderSaveStatusBadge()}

            {/* Stepper Navigation */}
            <nav className="flex items-center gap-1.5 bg-zinc-950/60 p-1 rounded-lg border border-zinc-800">
              {STEPS.map(({ step, label, icon: Icon }) => {
                const isActive = currentStep === step
                return (
                  <button
                    key={step}
                    type="button"
                    data-testid={`studio-step-tab-${step}`}
                    onClick={() => setCurrentStep(step)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                      isActive
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{label}</span>
                  </button>
                )
              })}
              <button
                type="button"
                data-testid="open-post-training-evaluation"
                aria-pressed={evaluationView}
                onClick={() => setEvaluationView(!evaluationView)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  evaluationView
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
                }`}
              >
                <CheckCircle className="w-3.5 h-3.5" />
                <span>学習後評価</span>
              </button>
            </nav>
          </div>
        }
      />

      {/* Main Step Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6">
        {itemsLoadError && (
          <p role="alert" data-testid="studio-items-load-error" className="mb-4 text-sm text-red-300">
            {itemsLoadError}
          </p>
        )}
        {evaluationView ? (
          <BenchmarkGrid
            loraName={activeProject?.name || 'my_lora'}
            characterTrigger={activeProject?.character_trigger || 'mychara'}
            outfitTrigger={activeProject?.outfit_trigger || 'mychara_outfit'}
          />
        ) : (
          <>
            {currentStep === 1 && <MatrixGenerationStep />}
            {currentStep === 2 && <CuratorGrid />}
            {currentStep === 3 && (
              <section aria-labelledby="studio-caption-heading" className="space-y-4">
                <h2 id="studio-caption-heading" className="text-lg font-semibold text-white">キャプション</h2>
                {items.filter((item) => item.status === 'APPROVED').length > 0 ? (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {items.filter((item) => item.status === 'APPROVED').map((item) => (
                      <CaptionEditorCard key={item.id} itemId={item.id} slotIndex={item.slot_index} caption={item.caption_text}
                        onChange={(caption) => updateItemCaption(item.id, caption)} />
                    ))}
                  </div>
                ) : <p className="text-sm text-zinc-400">選別済みの素材がありません。</p>}
            </section>
            )}
            {currentStep === 4 && <TrainingConfigPanel />}
          </>
        )}
      </main>

      {/* Create Project Modal */}
      <CreateProjectModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreated={handleProjectCreated}
        workflows={workflows}
      />
    </div>
  )
}
