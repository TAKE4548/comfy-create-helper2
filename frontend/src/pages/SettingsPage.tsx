import { useState, useEffect } from 'react'
import { Settings, Layers, ChevronDown } from 'lucide-react'
import { LS_KEYS } from '../utils/localStorageKeys'
import { BaseModelSection } from './SettingsPage/components/BaseModelSection'
import { ThumbnailSettingsSection } from './SettingsPage/components/ThumbnailSettingsSection'
import { TranslationSettingsSection } from './SettingsPage/components/TranslationSettingsSection'
import { LlmSettingsSection } from './SettingsPage/components/LlmSettingsSection'
import { SpeechToneSection, SpeechTonePresetModal } from './SettingsPage/components/SpeechToneSection'
import { BubbleDetectionSection } from './SettingsPage/components/BubbleDetectionSection'
import { MappingMasterSection } from './SettingsPage/components/MappingMasterSection'
import { WorkflowConnectionSection } from './SettingsPage/components/WorkflowConnectionSection'
import { VramGuardSection } from './SettingsPage/components/VramGuardSection'

export { SpeechTonePresetModal }

export interface ExpandedSectionsState {
  prompts: boolean
  mappingMasters: boolean
  longPress: boolean
  workflows: boolean
  connections: boolean
  llmModel: boolean
  translation: boolean
  baseModels: boolean
  llmParams: boolean
  speechDraft: boolean
  bubbleDetection: boolean
  speechTones: boolean
  vramGuard: boolean
}

export function SettingsPage() {
  const [expandedSections, setExpandedSections] = useState<ExpandedSectionsState>(() => {
    const stored = localStorage.getItem(LS_KEYS.SETTINGS_SECTIONS_EXPANDED)
    return stored
      ? JSON.parse(stored)
      : {
          prompts: true,
          mappingMasters: true,
          longPress: true,
          workflows: true,
          connections: true,
          llmModel: true,
          translation: true,
          baseModels: true,
          llmParams: false,
          speechDraft: false,
          bubbleDetection: false,
          speechTones: false,
          vramGuard: true,
        }
  })

  useEffect(() => {
    localStorage.setItem(LS_KEYS.SETTINGS_SECTIONS_EXPANDED, JSON.stringify(expandedSections))
  }, [expandedSections])

  const toggleSection = (key: keyof ExpandedSectionsState) => {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-[rgba(255,255,255,0.06)]">
        <Settings size={17} className="text-zinc-400" />
        <h1 className="text-base font-semibold text-zinc-200">Settings</h1>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-6">
        {/* LLM Model, Prompts & Params */}
        <LlmSettingsSection
          isExpandedModel={expandedSections.llmModel}
          onToggleModel={() => toggleSection('llmModel')}
          isExpandedPrompts={expandedSections.prompts}
          onTogglePrompts={() => toggleSection('prompts')}
          isExpandedParams={expandedSections.llmParams}
          onToggleParams={() => toggleSection('llmParams')}
        />

        {/* Translation Settings */}
        <TranslationSettingsSection
          isExpanded={expandedSections.translation}
          onToggle={() => toggleSection('translation')}
        />

        {/* Bubble Detection Parameters */}
        <BubbleDetectionSection
          isExpanded={expandedSections.bubbleDetection}
          onToggle={() => toggleSection('bubbleDetection')}
        />

        {/* Speech Tone Presets */}
        <SpeechToneSection
          isExpanded={expandedSections.speechTones}
          onToggle={() => toggleSection('speechTones')}
        />

        {/* Mapping Masters */}
        <MappingMasterSection
          isExpanded={expandedSections.mappingMasters}
          onToggle={() => toggleSection('mappingMasters')}
        />

        {/* Thumbnail Aspect Ratio Settings */}
        <section className="border border-[rgba(255,255,255,0.06)] bg-surface-2/20 rounded-xl overflow-hidden">
          <ThumbnailSettingsSection />
        </section>

        {/* Base Model Settings */}
        <section className="border border-[rgba(255,255,255,0.06)] bg-surface-2/20 rounded-xl overflow-hidden">
          <button
            type="button"
            onClick={() => toggleSection('baseModels')}
            className="w-full flex items-center justify-between px-4 py-3.5 bg-surface hover:bg-white/5 transition-colors text-left font-sans cursor-pointer select-none"
          >
            <div className="flex items-center gap-2">
              <Layers size={15} className="text-[#7C6FDD]" />
              <h2 className="text-sm font-semibold text-zinc-300">Base Model Settings</h2>
              <span className="text-xs text-zinc-600">— ベースモデルとチェックポイントの関連付け管理</span>
            </div>
            <ChevronDown
              size={16}
              className={`text-zinc-500 transition-transform duration-200 ${
                expandedSections.baseModels ? 'rotate-180' : ''
              }`}
            />
          </button>
          {expandedSections.baseModels && (
            <div className="p-4 border-t border-[rgba(255,255,255,0.06)] bg-surface/30">
              <BaseModelSection />
            </div>
          )}
        </section>

        {/* VRAM Safety Guard */}
        <VramGuardSection
          isExpanded={expandedSections.vramGuard}
          onToggle={() => toggleSection('vramGuard')}
        />

        {/* Long Press, Workflows & Connections */}
        <WorkflowConnectionSection
          isExpandedLongPress={expandedSections.longPress}
          onToggleLongPress={() => toggleSection('longPress')}
          isExpandedWorkflows={expandedSections.workflows}
          onToggleWorkflows={() => toggleSection('workflows')}
          isExpandedConnections={expandedSections.connections}
          onToggleConnections={() => toggleSection('connections')}
        />
      </div>
    </div>
  )
}
