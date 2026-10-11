import { useEffect, useState } from 'react'
import { Settings, Layers, ChevronDown } from 'lucide-react'
import { LS_KEYS } from '../utils/localStorageKeys'
import { useSystemStats } from '../hooks/useSystemStats'
import { BaseModelSection } from './SettingsPage/components/BaseModelSection'
import { ThumbnailSettingsSection } from './SettingsPage/components/ThumbnailSettingsSection'
import { TranslationSettingsSection } from './SettingsPage/components/TranslationSettingsSection'
import { LlmSettingsSection } from './SettingsPage/components/LlmSettingsSection'
import { SpeechToneSection, SpeechTonePresetModal } from './SettingsPage/components/SpeechToneSection'
import { BubbleDetectionSection } from './SettingsPage/components/BubbleDetectionSection'
import { MappingMasterSection } from './SettingsPage/components/MappingMasterSection'
import { WorkflowConnectionSection } from './SettingsPage/components/WorkflowConnectionSection'
import { ServiceConnectionCard } from './SettingsPage/components/ServiceConnectionCard'
import { VramGuardSection } from './SettingsPage/components/VramGuardSection'
import { SettingsTabBar } from './SettingsPage/components/SettingsTabBar'
import { PageHeader } from '../components/common/PageHeader'
import { useSettingsTab, type SettingsTabId } from './SettingsPage/hooks/useSettingsTab'
import './SettingsPage/SettingsResponsive.css'

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

type DetailsState = { prompt: boolean; dialogue: boolean }

const DEFAULT_SECTIONS: ExpandedSectionsState = {
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
  speechTones: true,
  vramGuard: true,
}

function readObject(key: string): Record<string, unknown> | null {
  try {
    const value = localStorage.getItem(key)
    if (!value) return null
    const parsed: unknown = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null
  } catch {
    return null
  }
}

function readDetails(): DetailsState {
  const stored = readObject(LS_KEYS.SETTINGS_DETAILS_EXPANDED_V2)
  return {
    prompt: typeof stored?.prompt === 'boolean' ? stored.prompt : false,
    dialogue: typeof stored?.dialogue === 'boolean' ? stored.dialogue : false,
  }
}

export function SettingsPage() {
  const { activeTab, selectTab } = useSettingsTab()
  useSystemStats()
  const [expandedSections, setExpandedSections] = useState(DEFAULT_SECTIONS)
  const [details, setDetails] = useState(readDetails)

  useEffect(() => {
    try {
      localStorage.setItem(LS_KEYS.SETTINGS_DETAILS_EXPANDED_V2, JSON.stringify(details))
    } catch {
      // Detail disclosure state is still available for this page session.
    }
  }, [details])

  const toggleSection = (key: keyof ExpandedSectionsState) => {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }))
  }
  const toggleDetails = (key: keyof DetailsState) => {
    setDetails((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const panels: Array<{ id: SettingsTabId; content: React.ReactNode }> = [
    {
      id: 'workflows',
      content: <>
        <WorkflowConnectionSection group="workflows" isExpandedLongPress={expandedSections.longPress} onToggleLongPress={() => toggleSection('longPress')} isExpandedWorkflows={expandedSections.workflows} onToggleWorkflows={() => toggleSection('workflows')} isExpandedConnections={expandedSections.connections} onToggleConnections={() => toggleSection('connections')} />
        <MappingMasterSection isExpanded={expandedSections.mappingMasters} onToggle={() => toggleSection('mappingMasters')} />
        <section className="border border-[rgba(255,255,255,0.06)] bg-surface-2/20 rounded-xl overflow-hidden">
          <button type="button" onClick={() => toggleSection('baseModels')} className="w-full flex items-center justify-between px-4 py-3.5 bg-surface hover:bg-white/5 transition-colors text-left font-sans cursor-pointer select-none">
            <div className="flex items-center gap-2"><Layers size={15} className="text-[#7C6FDD]" /><h2 className="text-sm font-semibold text-zinc-300">Base Model Settings</h2><span className="text-xs text-zinc-600">— ベースモデルとチェックポイントの関連付け管理</span></div>
            <ChevronDown size={16} className={`text-zinc-500 transition-transform duration-200 ${expandedSections.baseModels ? 'rotate-180' : ''}`} />
          </button>
          {expandedSections.baseModels && <div className="p-4 border-t border-[rgba(255,255,255,0.06)] bg-surface/30"><BaseModelSection /></div>}
        </section>
      </>,
    },
    {
      id: 'prompt',
      content: <LlmSettingsSection group="prompt" isExpandedModel isExpandedPrompts={details.prompt} onTogglePrompts={() => toggleDetails('prompt')} isExpandedParams={false} onToggleModel={() => undefined} onToggleParams={() => undefined} />,
    },
    {
      id: 'dialogue',
      content: <>
        <SpeechToneSection isExpanded={expandedSections.speechTones} onToggle={() => toggleSection('speechTones')} />
        <LlmSettingsSection group="dialogue" modelFooter={<BubbleDetectionSection embedded isExpanded={expandedSections.bubbleDetection} onToggle={() => toggleSection('bubbleDetection')} />} isExpandedModel isExpandedPrompts={details.dialogue} onTogglePrompts={() => toggleDetails('dialogue')} isExpandedParams={false} onToggleModel={() => undefined} onToggleParams={() => undefined} />
      </>,
    },
    {
      id: 'translation',
      content: <TranslationSettingsSection isExpanded={expandedSections.translation} onToggle={() => toggleSection('translation')} />,
    },
    {
      id: 'system',
      content: <>
        <ServiceConnectionCard />
        <VramGuardSection isExpanded={expandedSections.vramGuard} onToggle={() => toggleSection('vramGuard')} />
        <section aria-labelledby="settings-display-operation-title" className="space-y-4">
          <h2 id="settings-display-operation-title" className="text-sm font-semibold text-zinc-300">表示と操作</h2>
          <ThumbnailSettingsSection />
          <WorkflowConnectionSection group="system" showConnections={false} isExpandedLongPress={expandedSections.longPress} onToggleLongPress={() => toggleSection('longPress')} isExpandedWorkflows={expandedSections.workflows} onToggleWorkflows={() => toggleSection('workflows')} isExpandedConnections={expandedSections.connections} onToggleConnections={() => toggleSection('connections')} />
        </section>
      </>,
    },
  ]

  return (
    <div className="req314-settings flex h-full min-w-0 flex-col overflow-hidden">
      <PageHeader
        title="Settings"
        icon={Settings}
      />
      <SettingsTabBar activeTab={activeTab} onSelect={selectTab} />
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-5 pb-[calc(6rem+env(safe-area-inset-bottom))] lg:pb-5">
        {panels.map(({ id, content }) => {
          const selected = activeTab === id
          return (
            <div key={id} id={`settings-panel-${id}`} role="tabpanel" aria-labelledby={`settings-tab-${id}`} hidden={!selected} tabIndex={selected ? 0 : -1} className="space-y-6">
              {content}
            </div>
          )
        })}
      </div>
    </div>
  )
}
