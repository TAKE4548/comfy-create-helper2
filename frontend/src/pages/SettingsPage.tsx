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
import { useSettingsMobile } from './SettingsPage/hooks/useSettingsMobile'
import { useSettingsSwipe } from './SettingsPage/hooks/useSettingsSwipe'
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
  const isMobile = useSettingsMobile()
  const swipeHandlers = useSettingsSwipe({ enabled: isMobile, activeTab, onSelect: selectTab })
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
      content: <div data-testid="settings-workflows-grid" className="grid grid-cols-1 items-start gap-6 xl:grid-cols-2 xl:grid-rows-[auto_1fr]">
        <div data-testid="settings-card-workflow" className="order-1 min-w-0 xl:col-start-1 xl:row-start-1">
        <WorkflowConnectionSection group="workflows" isExpandedLongPress={expandedSections.longPress} onToggleLongPress={() => toggleSection('longPress')} isExpandedWorkflows={expandedSections.workflows} onToggleWorkflows={() => toggleSection('workflows')} isExpandedConnections={expandedSections.connections} onToggleConnections={() => toggleSection('connections')} />
        </div>
        <div data-testid="settings-card-mapping" className="order-2 min-w-0 xl:col-start-2 xl:row-span-2 xl:row-start-1">
        <MappingMasterSection isExpanded={expandedSections.mappingMasters} onToggle={() => toggleSection('mappingMasters')} />
        </div>
        <div data-testid="settings-card-basemodel" className="order-3 min-w-0 settings-density-basemodel xl:col-start-1 xl:row-start-2">
        <section className="border border-[rgba(255,255,255,0.06)] bg-surface-2/20 rounded-xl overflow-hidden">
          <button type="button" onClick={() => toggleSection('baseModels')} className="w-full flex items-center justify-between px-4 py-3.5 bg-surface hover:bg-white/5 transition-colors text-left font-sans cursor-pointer select-none">
            <div className="flex items-center gap-2"><Layers size={15} className="text-[#7C6FDD]" /><h2 className="text-sm font-semibold text-zinc-300">Base Model Settings</h2><span className="text-xs text-zinc-600">— ベースモデルとチェックポイントの関連付け管理</span></div>
            <ChevronDown size={16} className={`text-zinc-500 transition-transform duration-200 ${expandedSections.baseModels ? 'rotate-180' : ''}`} />
          </button>
          {expandedSections.baseModels && <div className="border-t border-[rgba(255,255,255,0.06)] bg-surface/30 p-3 md:p-5"><BaseModelSection /></div>}
        </section>
        </div>
      </div>,
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
    <div data-testid="settings-page-shell" className="req314-settings req381-settings-density-root flex h-full min-w-0 flex-col gap-3 overflow-hidden md:gap-6">
      <PageHeader
        title="Settings"
        icon={Settings}
      />
      <SettingsTabBar activeTab={activeTab} onSelect={selectTab} />
      <div {...swipeHandlers} className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-3 pb-[calc(6rem+env(safe-area-inset-bottom))] touch-pan-y md:touch-auto md:p-5 md:pb-5">
        <div data-testid="settings-content-container" className="mx-auto w-full max-w-7xl">
        {panels.map(({ id, content }) => {
          const selected = activeTab === id
          return (
            <div key={id} id={`settings-panel-${id}`} role="tabpanel" aria-labelledby={`settings-tab-${id}`} hidden={!selected} tabIndex={selected ? 0 : -1} className="space-y-3 md:space-y-6">
              {content}
            </div>
          )
        })}
        </div>
      </div>
    </div>
  )
}
