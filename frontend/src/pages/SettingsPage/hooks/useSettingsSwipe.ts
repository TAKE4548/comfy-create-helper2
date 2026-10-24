import { useRef } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { SettingsTabId } from './useSettingsTab'

const SETTINGS_TABS: readonly SettingsTabId[] = ['workflows', 'prompt', 'dialogue', 'translation', 'system']
const INTERACTIVE_TARGET = [
  'input',
  'textarea',
  'select',
  'button',
  'a',
  '[contenteditable="true"]',
  '[role="tablist"]',
  '[role="slider"]',
  '[data-settings-swipe-ignore]',
  '[data-settings-horizontal-scroll]',
  '[role="dialog"]',
  '[role="menu"]',
  '[role="popover"]',
].join(',')

export interface SettingsSwipeDecisionInput {
  activeTab: SettingsTabId
  dx: number
  dy: number
  pointerType: string
  isPrimary: boolean
  verticalFirst: boolean
  interactiveTarget: boolean
  horizontalScroll: boolean
  overlayOpen: boolean
}

export function resolveSettingsSwipeTarget(input: SettingsSwipeDecisionInput): SettingsTabId | null {
  const {
    activeTab,
    dx,
    dy,
    pointerType,
    isPrimary,
    verticalFirst,
    interactiveTarget,
    horizontalScroll,
    overlayOpen,
  } = input
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null
  if (!isPrimary || (pointerType !== 'touch' && pointerType !== 'pen')) return null
  if (verticalFirst || interactiveTarget || horizontalScroll || overlayOpen) return null
  if (Math.abs(dx) < 48 || Math.abs(dx) <= 1.5 * Math.abs(dy)) return null

  const currentIndex = SETTINGS_TABS.indexOf(activeTab)
  const nextIndex = dx < 0 ? currentIndex + 1 : currentIndex - 1
  return SETTINGS_TABS[nextIndex] ?? null
}

interface ActivePointer {
  id: number
  x: number
  y: number
  verticalFirst: boolean
  interactiveTarget: boolean
  horizontalScroll: boolean
}

function targetIsInteractive(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  if (target.closest(INTERACTIVE_TARGET)) return true

  let current: Element | null = target
  while (current) {
    const style = window.getComputedStyle(current)
    const canScrollHorizontally = /(auto|scroll|overlay)/.test(style.overflowX)
    if (canScrollHorizontally && current.scrollWidth > current.clientWidth) return true
    current = current.parentElement
  }
  return false
}

function hasOpenOverlay(): boolean {
  return Array.from(document.querySelectorAll('[role="dialog"], [role="menu"], [role="popover"]')).some((overlay) => {
    if (overlay.closest('[hidden], [aria-hidden="true"]')) return false
    const style = window.getComputedStyle(overlay)
    return style.display !== 'none' && style.visibility !== 'hidden'
  })
}

function isSupportedPointer(event: ReactPointerEvent<HTMLElement>): boolean {
  return event.isPrimary && (event.pointerType === 'touch' || event.pointerType === 'pen')
}

export interface UseSettingsSwipeOptions {
  enabled: boolean
  activeTab: SettingsTabId
  onSelect: (id: SettingsTabId) => void
}

export function useSettingsSwipe({ enabled, activeTab, onSelect }: UseSettingsSwipeOptions) {
  const pointer = useRef<ActivePointer | null>(null)

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (!enabled || !isSupportedPointer(event)) {
      pointer.current = null
      return
    }

    const interactiveTarget = targetIsInteractive(event.target)
    const horizontalScroll = interactiveTarget && event.target instanceof Element && Boolean(
      event.target.closest('[data-settings-horizontal-scroll]'),
    )
    if (interactiveTarget || horizontalScroll || hasOpenOverlay()) {
      pointer.current = null
      return
    }

    pointer.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      verticalFirst: false,
      interactiveTarget,
      horizontalScroll,
    }
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const active = pointer.current
    if (!active) return
    if (!event.isPrimary || event.pointerId !== active.id) {
      pointer.current = null
      return
    }
    const dx = event.clientX - active.x
    const dy = event.clientY - active.y
    if (Math.abs(dy) >= 12 && Math.abs(dy) > Math.abs(dx)) active.verticalFirst = true
  }

  const onPointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    const active = pointer.current
    pointer.current = null
    if (!enabled || !active || !event.isPrimary || event.pointerId !== active.id) return

    const target = resolveSettingsSwipeTarget({
      activeTab,
      dx: event.clientX - active.x,
      dy: event.clientY - active.y,
      pointerType: event.pointerType,
      isPrimary: event.isPrimary,
      verticalFirst: active.verticalFirst,
      interactiveTarget: active.interactiveTarget,
      horizontalScroll: active.horizontalScroll,
      overlayOpen: hasOpenOverlay(),
    })
    if (target) onSelect(target)
  }

  const onPointerCancel = (event: ReactPointerEvent<HTMLElement>) => {
    if (!pointer.current || event.pointerId === pointer.current.id) pointer.current = null
  }

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel }
}
