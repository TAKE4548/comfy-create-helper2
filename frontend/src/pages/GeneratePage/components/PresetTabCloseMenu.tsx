import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { BottomSheet } from '../../../components/common/BottomSheet'
import type { PresetTabCloseMode } from '../../../store/presetTabClose'

export type PresetTabCloseCounts = Record<PresetTabCloseMode, number>
interface Props {
  triggerId: string | number
  triggerName: string
  anchor: HTMLElement | null
  counts: PresetTabCloseCounts
  pending: boolean
  isOpen: boolean
  ignoreOpenReleaseClick?: boolean
  onClose: () => void
  onAction: (mode: PresetTabCloseMode) => void | Promise<void>
  restoreFocus: HTMLElement | null
}
const modes: PresetTabCloseMode[] = ['others', 'left', 'right']
const labels: Record<PresetTabCloseMode, string> = { others: '他のタブを閉じる', left: '左のタブをすべて閉じる', right: '右のタブをすべて閉じる' }

export function PresetTabCloseMenu({ triggerId, triggerName, anchor, counts, pending, isOpen, onClose, onAction, restoreFocus, ignoreOpenReleaseClick = false }: Props) {
  const [mobile, setMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768)
  const [position, setPosition] = useState({ left: 0, top: 0, maxHeight: 240 })
  const root = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const items = useRef<(HTMLButtonElement | null)[]>([])
  const enabled = modes.map((mode) => pending || counts[mode] === 0 ? null : modes.indexOf(mode)).filter((i): i is number => i !== null)
  const close = useCallback(() => { onClose(); requestAnimationFrame(() => (restoreFocus?.isConnected ? restoreFocus : document.querySelector<HTMLElement>('[data-preset-select][aria-current="true"]'))?.focus?.()) }, [onClose, restoreFocus])
  useEffect(() => {
    const resize = () => setMobile(window.innerWidth < 768)
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])
  useLayoutEffect(() => {
    if (!isOpen) return
    const update = () => {
      if (!anchor?.isConnected || mobile) return
      const rect = anchor.getBoundingClientRect()
      const width = 248, height = Math.min(240, window.innerHeight - 16)
      setPosition({ left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)), top: Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - height - 8)), maxHeight: height })
    }
    update(); window.addEventListener('resize', update); window.addEventListener('scroll', update, true)
    return () => { window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true) }
  }, [anchor, isOpen, mobile])
  useLayoutEffect(() => {
    if (!isOpen || !ignoreOpenReleaseClick) return
    let armed = true
    let ignoreClick = false
    const pointerUp = () => { if (armed) { ignoreClick = true; armed = false } }
    const pointerDown = () => { ignoreClick = false; armed = false }
    const click = (event: MouseEvent) => {
      if (!ignoreClick || event.detail === 0) return
      ignoreClick = false
      event.preventDefault()
      event.stopImmediatePropagation()
    }
    window.addEventListener('pointerup', pointerUp, true)
    window.addEventListener('pointerdown', pointerDown, true)
    window.addEventListener('click', click, true)
    return () => { window.removeEventListener('pointerup', pointerUp, true); window.removeEventListener('pointerdown', pointerDown, true); window.removeEventListener('click', click, true) }
  }, [ignoreOpenReleaseClick, isOpen])
  useEffect(() => {
    if (!isOpen) return
    const first = enabled[0]
    requestAnimationFrame(() => first === undefined ? closeRef.current?.focus() : items.current[first]?.focus())
  }, [isOpen, enabled.join(',')])
  useEffect(() => {
    if (!isOpen || mobile) return
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); close() }
    }
    window.addEventListener('keydown', escape)
    return () => window.removeEventListener('keydown', escape)
  }, [close, isOpen, mobile])
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') return
    if (mobile) {
      if (event.key === 'Tab') {
        const focusable = [...(root.current?.querySelectorAll<HTMLElement>('button:not(:disabled)') ?? [])]
        if (!focusable.length) return
        const index = focusable.indexOf(document.activeElement as HTMLElement)
        if (event.shiftKey && index <= 0) { event.preventDefault(); focusable[focusable.length - 1]?.focus() }
        else if (!event.shiftKey && index === focusable.length - 1) { event.preventDefault(); focusable[0].focus() }
      }
      return
    }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault()
      const current = items.current.findIndex((item) => item === document.activeElement)
      const from = enabled.indexOf(current)
      const next = event.key === 'Home' ? enabled[0] : event.key === 'End' ? enabled[enabled.length - 1] : enabled[(Math.max(0, from) + (event.key === 'ArrowDown' ? 1 : enabled.length - 1)) % enabled.length]
      if (next !== undefined) items.current[next]?.focus()
    }
  }
  if (!isOpen) return null
  const body = <div ref={root} onKeyDown={onKeyDown} aria-label={`${triggerName}のタブ操作`} className="w-[248px] max-w-[calc(100vw-16px)] overflow-y-auto rounded-xl border border-white/10 bg-zinc-900 p-2 shadow-2xl" style={{ maxHeight: mobile ? '70dvh' : position.maxHeight }}>
    <div className="mb-2 truncate px-2 py-1 text-sm font-semibold text-white">{triggerName}</div>
    {modes.map((mode, index) => <button key={mode} ref={(node) => { items.current[index] = node }} type="button" role={mobile ? undefined : 'menuitem'} disabled={pending || counts[mode] === 0} onClick={() => { void onAction(mode) }} className="block min-h-11 w-full truncate rounded px-3 text-left text-sm text-white hover:bg-white/10 disabled:opacity-40">{labels[mode]}</button>)}
    <button ref={closeRef} type="button" role={mobile ? undefined : 'menuitem'} onClick={close} className="mt-1 min-h-11 w-full rounded border border-white/10 text-sm text-white">閉じる</button>
  </div>
  const desktop = !mobile && createPortal(<div className="fixed inset-0 z-[1000]" onPointerDown={(event) => { if (event.target === event.currentTarget) { event.preventDefault(); close() } }} onClick={(event) => { if (event.target === event.currentTarget) close() }}>
    <div style={{ position: 'fixed', left: position.left, top: position.top }} role="menu" data-trigger-id={String(triggerId)}>{body}</div>
  </div>, document.body)
  if (!mobile) return desktop
  return createPortal(<div className="fixed inset-0 z-[1000] pointer-events-auto">
    <BottomSheet isOpen={isOpen} onClose={close} title={`${triggerName}のタブ操作`} closeOnBackdropClick className="overscroll-contain pb-[env(safe-area-inset-bottom)]">{body}</BottomSheet>
  </div>, document.body)
}
