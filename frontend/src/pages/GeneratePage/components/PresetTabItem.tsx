import { memo, useEffect, useRef } from 'react'
import { MoreHorizontal, X } from 'lucide-react'

export interface PresetTabItemProps {
  id: string | number
  name: string
  checked: boolean
  isActive: boolean
  onSelect: () => void
  onToggleCheck: () => void
  onRemove: () => void
  onOpenMenu: (anchor: HTMLButtonElement, fromLongPress?: boolean) => void
  pending?: boolean
}

export const PresetTabItem = memo(function PresetTabItem({
  id, name, checked, isActive, onSelect, onToggleCheck, onRemove, onOpenMenu,
}: PresetTabItemProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const suppressReset = useRef<ReturnType<typeof setTimeout> | null>(null)
  const start = useRef<{ x: number; y: number; pointerId: number } | null>(null)
  const suppressClick = useRef(false)
  const activePointers = useRef(new Set<number>())
  const cancelledGesture = useRef(false)
  const clear = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; start.current = null }
  useEffect(() => {
    const pointerDown = (event: PointerEvent) => {
      if (activePointers.current.size > 0) { cancelledGesture.current = true; clear() }
      else if (suppressClick.current) {
        suppressClick.current = false
        if (suppressReset.current) clearTimeout(suppressReset.current)
      }
      activePointers.current.add(event.pointerId)
    }
    const pointerEnd = (event: PointerEvent) => {
      activePointers.current.delete(event.pointerId)
      if (!activePointers.current.size) cancelledGesture.current = false
    }
    window.addEventListener('pointerdown', pointerDown, true)
    window.addEventListener('pointerup', pointerEnd, true)
    window.addEventListener('pointercancel', pointerEnd, true)
    window.addEventListener('scroll', clear, true)
    return () => { clear(); if (suppressReset.current) clearTimeout(suppressReset.current); window.removeEventListener('pointerdown', pointerDown, true); window.removeEventListener('pointerup', pointerEnd, true); window.removeEventListener('pointercancel', pointerEnd, true); window.removeEventListener('scroll', clear, true) }
  }, [])
  const consumeSuppressedClick = () => {
    if (!suppressClick.current) return false
    suppressClick.current = false
    if (suppressReset.current) clearTimeout(suppressReset.current)
    return true
  }
  const cancelClick = (event: React.MouseEvent) => { event.stopPropagation() }
  return <div
    ref={rootRef}
    data-preset-id={String(id)}
    onClick={() => { if (suppressClick.current) { suppressClick.current = false; return } onSelect() }}
    onPointerDown={(event) => {
      if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return
      if (cancelledGesture.current) return
      const target = event.target as Element
      if (target.closest('[data-preset-gesture-exclude],input,[role="checkbox"]')) return
      if (start.current) { clear(); return }
      clear(); start.current = { x: event.clientX, y: event.clientY, pointerId: event.pointerId }
      timer.current = setTimeout(() => {
        const anchor = rootRef.current?.querySelector<HTMLButtonElement>('[data-preset-menu-trigger]')
        if (anchor) {
          suppressClick.current = true
          if (suppressReset.current) clearTimeout(suppressReset.current)
          suppressReset.current = setTimeout(() => { suppressClick.current = false }, 800)
          onOpenMenu(anchor, true)
        }
        timer.current = null
      }, 500)
    }}
    onPointerMove={(event) => {
      if (!start.current || start.current.pointerId !== event.pointerId) return
      if (Math.hypot(event.clientX - start.current.x, event.clientY - start.current.y) > 8) clear()
    }}
    onPointerUp={clear}
    onPointerCancel={clear}
    onScrollCapture={clear}
    onContextMenu={(event) => {
      if ((event.target as Element).closest('[data-preset-gesture-exclude],input,[role="checkbox"]')) return
      event.preventDefault()
      if (suppressClick.current) return
      const anchor = rootRef.current?.querySelector<HTMLButtonElement>('[data-preset-menu-trigger]')
      if (anchor) onOpenMenu(anchor)
    }}
    className={`flex min-w-0 shrink-0 items-center gap-1 rounded-lg border px-2 py-1 text-xs font-semibold ${isActive ? 'bg-accent-green/10 border-accent-green/40 text-accent-green' : 'bg-surface-2 border-transparent text-zinc-400'}`}
    style={{ touchAction: 'pan-x pan-y' }}
  >
    <button type="button" data-preset-select onClick={(event) => { cancelClick(event); if (!consumeSuppressedClick()) onSelect() }} aria-current={isActive ? 'true' : undefined} aria-label={`${name}を選択`} className="min-h-11 min-w-11 max-w-[140px] truncate text-left">{name}</button>
    <label data-preset-gesture-exclude onClick={cancelClick} onPointerDown={(e) => e.stopPropagation()} className="inline-flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center"><input type="checkbox" checked={checked} onChange={onToggleCheck} aria-label={`${name}を選択対象にする`} className="h-4 w-4 accent-accent-green" /></label>
    <button type="button" data-preset-gesture-exclude onClick={(e) => { cancelClick(e); onRemove() }} onPointerDown={(e) => e.stopPropagation()} title="タブを閉じる (DBからは削除されません)" aria-label={`${name}のタブを閉じる`} className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center text-zinc-500 hover:text-red-400"><X size={14} aria-hidden="true" /></button>
    <button type="button" data-preset-gesture-exclude data-preset-menu-trigger onClick={(e) => { cancelClick(e); onOpenMenu(e.currentTarget) }} onPointerDown={(e) => e.stopPropagation()} aria-label={`${name}のタブ操作`} className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center"><MoreHorizontal size={16} aria-hidden="true" /></button>
  </div>
})
