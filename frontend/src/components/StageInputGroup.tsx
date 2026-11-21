import { useId, useRef, type FocusEvent, type ReactNode } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import './StageInputGroup.css'

export interface StageInputGroupProps {
  groupKey: string
  stageName: string
  stageKey: string
  collapsible?: boolean
  collapsed?: boolean
  onToggleCollapse?: () => void
  children: ReactNode
}

export default function StageInputGroup({
  groupKey,
  stageName,
  stageKey,
  collapsible = false,
  collapsed = false,
  onToggleCollapse,
  children,
}: StageInputGroupProps): React.JSX.Element {
  const resolvedName = stageName.trim() ? stageName : stageKey.trim() ? stageKey : 'ステージ不明'
  const accessibleKey = stageKey || groupKey
  const sectionRef = useRef<HTMLElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const headingId = useId()
  const bodyId = useId()
  const isCollapsed = Boolean(collapsible && collapsed)

  const exposeFocusedControl = (event: FocusEvent<HTMLElement>) => {
    const target = event.target
    const section = sectionRef.current
    if (!(target instanceof HTMLElement) || !section?.contains(target)) return

    const root = target.closest('[data-stage-scroll-root]')
    const heading = headingRef.current
    if (!(root instanceof HTMLElement) || !heading || !root.contains(section)) return

    const targetRect = target.getBoundingClientRect()
    const rootRect = root.getBoundingClientRect()
    const headingRect = heading.getBoundingClientRect()
    if (targetRect.height <= 0 || targetRect.width <= 0) return

    const viewportTop = rootRect.top + root.clientTop
    const viewportBottom = viewportTop + root.clientHeight
    const visibleHeaderTop = Math.max(viewportTop, headingRect.top)
    const visibleHeaderBottom = Math.min(viewportBottom, headingRect.bottom)
    if (visibleHeaderBottom <= visibleHeaderTop) return

    const overlapsHeader = targetRect.top < visibleHeaderBottom && targetRect.bottom > visibleHeaderTop
    if (overlapsHeader) {
      root.scrollBy({ top: targetRect.top - (visibleHeaderBottom + 8), behavior: 'auto' })
    }
  }

  return (
    <section
      ref={sectionRef}
      className="stage-input-group"
      data-group-key={groupKey}
      data-stage-key={stageKey}
      aria-labelledby={headingId}
      onFocusCapture={exposeFocusedControl}
    >
      <h3
        ref={headingRef}
        id={headingId}
        className={collapsible ? 'stage-input-group__heading stage-input-group__heading--collapsible' : 'stage-input-group__heading'}
        title={resolvedName}
        aria-label={`${resolvedName} (${accessibleKey})`}
      >
        {collapsible ? (
          <button
            type="button"
            data-tap-target-exempt
            className="stage-input-group__toggle"
            aria-expanded={!isCollapsed}
            aria-controls={bodyId}
            aria-label={`${resolvedName} (${accessibleKey})`}
            onClick={onToggleCollapse}
          >
            {isCollapsed ? (
              <ChevronRight aria-hidden="true" size={14} className="stage-input-group__chevron" />
            ) : (
              <ChevronDown aria-hidden="true" size={14} className="stage-input-group__chevron" />
            )}
            <span className="stage-input-group__name">{resolvedName}</span>
            <span className="sr-only">{isCollapsed ? '折り畳み中' : '展開中'}</span>
          </button>
        ) : (
          <span className="stage-input-group__name">{resolvedName}</span>
        )}
      </h3>
      <div
        id={collapsible ? bodyId : undefined}
        className="stage-input-group__body"
        hidden={isCollapsed}
      >
        {children}
      </div>
    </section>
  )
}
