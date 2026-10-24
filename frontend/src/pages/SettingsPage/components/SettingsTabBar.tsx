import { useEffect, useRef } from 'react'
import type { KeyboardEvent } from 'react'
import { Languages, MessageCircle, MessageSquare, Settings, Workflow } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { SettingsTabId } from '../hooks/useSettingsTab'

export interface SettingsTabBarProps {
  activeTab: SettingsTabId
  onSelect: (id: SettingsTabId) => void
}

const TABS: ReadonlyArray<{ id: SettingsTabId; label: string; shortLabel: string; icon: LucideIcon }> = [
  { id: 'workflows', label: 'ワークフロー・モデル', shortLabel: '① モデル', icon: Workflow },
  { id: 'prompt', label: 'プロンプト支援', shortLabel: '② 呪文', icon: MessageSquare },
  { id: 'dialogue', label: 'セリフ支援', shortLabel: '③ セリフ', icon: MessageCircle },
  { id: 'translation', label: '翻訳', shortLabel: '④ 翻訳', icon: Languages },
  { id: 'system', label: 'システム・一般', shortLabel: '⑤ システム', icon: Settings },
]

export function SettingsTabBar({ activeTab, onSelect }: SettingsTabBarProps): React.JSX.Element {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])

  useEffect(() => {
    const activeIndex = TABS.findIndex((tab) => tab.id === activeTab)
    const activeButton = tabRefs.current[activeIndex]
    activeButton?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
    const tablist = activeButton?.closest<HTMLElement>('[role="tablist"]')
    if (!activeButton || !tablist) return

    const tablistRect = tablist.getBoundingClientRect()
    const visibleLeft = tablistRect.left + tablist.clientLeft
    const visibleRight = visibleLeft + tablist.clientWidth
    const buttonRect = activeButton.getBoundingClientRect()
    if (buttonRect.left < visibleLeft) {
      tablist.scrollLeft -= visibleLeft - buttonRect.left + 0.5
    } else if (buttonRect.right > visibleRight) {
      tablist.scrollLeft += buttonRect.right - visibleRight + 0.5
    }
  }, [activeTab])

  const selectAndFocus = (index: number) => {
    const tab = TABS[index]
    onSelect(tab.id)
    const button = tabRefs.current[index]
    button?.focus()
    button?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | undefined
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % TABS.length
    if (event.key === 'ArrowLeft') nextIndex = (index - 1 + TABS.length) % TABS.length
    if (event.key === 'Home') nextIndex = 0
    if (event.key === 'End') nextIndex = TABS.length - 1
    if (nextIndex !== undefined) {
      event.preventDefault()
      selectAndFocus(nextIndex)
    }
  }

  return (
    <div className="relative">
      <div role="tablist" aria-label="設定カテゴリー" aria-orientation="horizontal" data-settings-swipe-ignore="true" className="flex min-w-0 snap-x snap-mandatory overflow-x-auto pr-px md:pr-0 md:grid md:grid-cols-5">
        {TABS.map((tab, index) => {
          const selected = activeTab === tab.id
          return (
            <button
              key={tab.id}
              ref={(element) => { tabRefs.current[index] = element }}
              id={`settings-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-label={tab.label}
              aria-selected={selected}
              aria-controls={`settings-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => selectAndFocus(index)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              className="inline-flex min-h-11 h-11 min-w-max touch-manipulation snap-start items-center justify-center gap-1.5 px-3 md:min-w-0"
            >
              <tab.icon size={16} aria-hidden="true" />
              <span className="md:hidden">{tab.shortLabel}</span>
              <span className="hidden md:inline">{tab.label}</span>
            </button>
          )
        })}
      </div>
      <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-3 bg-gradient-to-r from-background to-transparent md:hidden" />
      <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 w-3 bg-gradient-to-l from-background to-transparent md:hidden" />
    </div>
  )
}
