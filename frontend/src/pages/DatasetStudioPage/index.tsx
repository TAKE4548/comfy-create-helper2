import React, { useState, useEffect } from 'react'
import { Sparkles, Layers, Sliders, CheckCircle } from 'lucide-react'
import { useStudioStore } from './useStudioStore'
import { MatrixGenerationStep } from './components/MatrixGenerationStep'
import { CuratorGrid } from './components/CuratorGrid'
import { BenchmarkGrid } from './components/BenchmarkGrid'
import { TrainingConfigPanel } from './components/TrainingConfigPanel'
import { CreateProjectModal } from './components/CreateProjectModal'
import { datasetApi, workflowsApi } from '../../api/client'
import type { DatasetProject, Workflow } from '../../api/types'
import { loadActiveProjectId, saveActiveProjectId } from './utils/studioDraftStorage'

const STEPS = [
  { step: 1, label: 'Step 1: 素材マトリクス', icon: Sparkles },
  { step: 2, label: 'Step 2: キュレーション', icon: Layers },
  { step: 3, label: 'Step 3: ローカル学習', icon: Sliders },
  { step: 4, label: 'Step 4: 4軸評価', icon: CheckCircle },
] as const

export const DatasetStudioPage: React.FC = () => {
  const {
    currentStep,
    setCurrentStep,
    activeProject,
    setActiveProject,
    saveStatus,
    projectsList,
    setProjectsList,
  } = useStudioStore()

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [workflows, setWorkflows] = useState<Workflow[]>([])

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

  const handleProjectSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedId = Number(e.target.value)
    const target = projectsList.find((p) => p.id === selectedId) || null
    setActiveProject(target)
    if (target) {
      saveActiveProjectId(target.id)
    }
  }

  const handleProjectCreated = (newProject: DatasetProject) => {
    setProjectsList([...projectsList, newProject])
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
      default:
        return (
          <span
            data-testid="autosave-status"
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-950/60 text-emerald-300 border border-emerald-800/80"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            保存完了
          </span>
        )
    }
  }

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-zinc-100 overflow-y-auto">
      {/* Wizard Header Bar */}
      <header className="border-b border-zinc-800 bg-zinc-900/80 px-6 py-4 sticky top-0 z-10 backdrop-blur">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div>
              <h1 className="text-xl font-bold flex items-center gap-2 text-white">
                <Sparkles className="w-5 h-5 text-indigo-400" />
                LoRA Studio
              </h1>
              <p className="text-xs text-zinc-400 mt-0.5">
                直交計画マトリクス生成からローカル学習・4軸ストレステスト評価までの統合ワークフロー
              </p>
            </div>

            {/* Project Selector & Actions */}
            <div className="flex items-center gap-2.5 pt-1 sm:pt-0">
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
                <span>＋ 新規プロジェクト</span>
              </button>

              {renderSaveStatusBadge()}
            </div>
          </div>

          {/* Stepper Navigation */}
          <nav className="flex items-center gap-2 bg-zinc-950/60 p-1.5 rounded-lg border border-zinc-800">
            {STEPS.map(({ step, label, icon: Icon }) => {
              const isActive = currentStep === step
              return (
                <button
                  key={step}
                  type="button"
                  data-testid={`studio-step-tab-${step}`}
                  onClick={() => setCurrentStep(step)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
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
          </nav>
        </div>
      </header>

      {/* Main Step Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6">
        {currentStep === 1 && <MatrixGenerationStep />}
        {currentStep === 2 && <CuratorGrid />}
        {currentStep === 3 && <TrainingConfigPanel />}
        {currentStep === 4 && (
          <BenchmarkGrid
            loraName={activeProject?.name || 'my_lora'}
            characterTrigger={activeProject?.character_trigger || 'mychara'}
            outfitTrigger={activeProject?.outfit_trigger || 'mychara_outfit'}
          />
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

