import React from 'react'
import { Sparkles, Layers, Sliders, CheckCircle } from 'lucide-react'
import { useStudioStore } from './useStudioStore'
import { MatrixGenerationStep } from './components/MatrixGenerationStep'
import { CuratorGrid } from './components/CuratorGrid'
import { BenchmarkGrid } from './components/BenchmarkGrid'

import { TrainingConfigPanel } from './components/TrainingConfigPanel'

const STEPS = [
  { step: 1, label: 'Step 1: 素材マトリクス', icon: Sparkles },
  { step: 2, label: 'Step 2: キュレーション', icon: Layers },
  { step: 3, label: 'Step 3: ローカル学習', icon: Sliders },
  { step: 4, label: 'Step 4: 4軸評価', icon: CheckCircle },
] as const

export const DatasetStudioPage: React.FC = () => {
  const { currentStep, setCurrentStep, activeProject } = useStudioStore()

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-zinc-100 overflow-y-auto">
      {/* Wizard Header Bar */}
      <header className="border-b border-zinc-800 bg-zinc-900/80 px-6 py-4 sticky top-0 z-10 backdrop-blur">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2 text-white">
              <Sparkles className="w-5 h-5 text-indigo-400" />
              LoRA Studio
            </h1>
            <p className="text-xs text-zinc-400 mt-0.5">
              直交計画マトリクス生成からローカル学習・4軸ストレステスト評価までの統合ワークフロー
            </p>
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
    </div>
  )
}
