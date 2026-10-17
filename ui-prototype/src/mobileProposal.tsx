import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'

// Offline-only proposal interaction layer. Production sources are not modified.
function ProposalSheet() {
  const [image, setImage] = useState<string | null>(null)
  const [full, setFull] = useState(false)
  useEffect(() => {
    let start: { x: number; y: number; target: EventTarget | null } | null = null
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return
      start = { x: e.touches[0].clientX, y: e.touches[0].clientY, target: e.target }
    }
    const onTouchEnd = (e: TouchEvent) => {
      if (!start || e.changedTouches.length !== 1 || image) { start = null; return }
      const dx = e.changedTouches[0].clientX - start.x
      const dy = e.changedTouches[0].clientY - start.y
      const target = start.target instanceof Element ? start.target : null
      start = null
      if (Math.abs(dx) < 65 || Math.abs(dx) < Math.abs(dy) * 1.35) return
      // Do not steal text input, sliders, horizontal scrolling or thumbnail gestures.
      if (!target || target.closest('input,textarea,select,[contenteditable="true"],button,[role="slider"],.overflow-x-auto,.custom-scrollbar')) return
      const panel = target.closest('#mobile-history-panel,#mobile-prompt-panel,#mobile-parameters-panel')
      if (!panel) return
      const order = ['prompt', 'parameters', 'history']
      const current = order.findIndex(id => panel.id === 'mobile-' + id + '-panel')
      const next = current + (dx < 0 ? 1 : -1)
      if (next < 0 || next >= order.length) return
      const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('button[aria-controls^="mobile-"]'))
      buttons.find(b => b.getAttribute('aria-controls') === 'mobile-' + order[next] + '-panel')?.click()
    }
    const onCaptureClick = (e: MouseEvent) => {
      const el = e.target instanceof Element ? e.target : null
      const thumb = el?.closest<HTMLButtonElement>('button[id^="thumb-mobile-"]')
      if (!thumb || thumb.disabled || document.querySelector('[id="mobile-history-panel"] button[aria-label="選択モード終了"]')) return
      const img = thumb.querySelector('img')
      if (!img?.src) return
      e.preventDefault()
      e.stopPropagation()
      e.stopImmediatePropagation()
      setFull(false)
      setImage(img.src)
    }
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') { setFull(false); setImage(null) } }
    document.addEventListener('touchstart', onTouchStart, { passive: true })
    document.addEventListener('touchend', onTouchEnd, { passive: true })
    document.addEventListener('click', onCaptureClick, true)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('touchstart', onTouchStart)
      document.removeEventListener('touchend', onTouchEnd)
      document.removeEventListener('click', onCaptureClick, true)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [image])
  if (!image) return null
  return <div className={'proposal-sheet-backdrop ' + (full ? 'proposal-sheet-full' : '')} role="presentation" onClick={() => { setImage(null); setFull(false) }}>
    <section role="dialog" aria-modal="true" aria-label={full ? '画像全画面表示' : '画像プレビュー'} className="proposal-sheet" onClick={e => e.stopPropagation()}>
      <div className="proposal-sheet-handle" />
      <header className="proposal-sheet-header">
        <strong>{full ? '画像全画面表示' : '生成画像プレビュー'}</strong>
        <button type="button" onClick={() => {setImage(null);setFull(false)}} aria-label="プレビューを閉じる">✕</button>
      </header>
      <button type="button" className="proposal-sheet-image" aria-label={full ? 'ボトムシートに戻る' : '画像を全画面表示'} onClick={() => setFull(v => !v)}>
        <img src={image} alt="選択した生成画像" />
      </button>
      <footer>{full ? '画像をタップして戻る' : '画像をタップして全画面で確認'}</footer>
    </section>
  </div>
}

export function mountMobileProposal() {
  if (document.documentElement.dataset.prototypeVariant !== 'proposal') return
  const root = document.createElement('div')
  root.id = 'mobile-proposal-layer'
  document.body.appendChild(root)
  createRoot(root).render(<ProposalSheet />)
}
