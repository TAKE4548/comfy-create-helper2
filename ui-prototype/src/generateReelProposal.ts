import { fixtureHistoryImages } from './fixtureData'

/**
 * Desktop Generate proposal: replace paged preview navigation with a continuous
 * horizontal reel. Latest stays at the left edge. The production component and
 * baseline remain untouched; this layer exists only in ?ui=proposal.
 */
export function mountGenerateReelProposal() {
  if (document.documentElement.dataset.prototypeVariant !== 'proposal') return

  const isDesktop = () => matchMedia('(min-width:768px)').matches
  let mountedFor: HTMLElement | null = null

  const sync = () => {
    if (!isDesktop()) return
    const preview = document.querySelector<HTMLElement>('[data-testid="generate-parallel-preview"]')
    if (!preview || preview === mountedFor || preview.dataset.generateReelEnhanced === 'true') return

    const galleryToggle = document.querySelector<HTMLElement>('#preview-autofollow-toggle-desktop')
    const galleryRoot = galleryToggle?.closest<HTMLElement>('.w-full.h-full.bg-surface')
    const secondPane = galleryRoot?.parentElement as HTMLElement | null
    const split = secondPane?.parentElement as HTMLElement | null
    const separator = split?.querySelector<HTMLElement>(':scope > [role="separator"]')
    const firstPane = split?.firstElementChild as HTMLElement | null

    if (!galleryRoot || !secondPane || !split || !separator || !firstPane) return

    mountedFor = preview
    preview.dataset.generateReelEnhanced = 'true'
    split.dataset.generateReelSplit = 'true'
    split.dataset.historyExpanded = 'false'
    firstPane.dataset.generateReelPreviewPane = 'true'
    separator.dataset.generateReelSeparator = 'true'
    secondPane.dataset.generateReelHistoryPane = 'true'

    Array.from(preview.children).forEach((child) => {
      ;(child as HTMLElement).dataset.generateReelOriginal = 'true'
    })

    const reel = document.createElement('div')
    reel.dataset.generateReelProposal = 'true'
    reel.tabIndex = 0
    reel.setAttribute('role', 'listbox')
    reel.setAttribute('aria-label', '生成画像の連続プレビュー。左端が最新です')

    let selectedIndex = 0
    const tiles: HTMLButtonElement[] = []

    const layoutTiles = () => {
      const style = getComputedStyle(reel)
      const availableHeight = Math.max(
        80,
        reel.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom),
      )
      const availableWidth = Math.max(
        120,
        reel.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
      )
      tiles.forEach((tile) => {
        const [rawW, rawH] = (tile.dataset.aspect ?? '').split('x').map(Number)
        if (!rawW || !rawH) return
        const ar = rawW / rawH
        const widthFromHeight = availableHeight * ar
        const width = Math.min(widthFromHeight, availableWidth)
        const height = Math.min(availableHeight, width / ar)
        tile.style.width = `${Math.max(80, width)}px`
        tile.style.height = `${Math.max(80, height)}px`
        tile.style.aspectRatio = 'auto'
      })
    }

    fixtureHistoryImages.forEach((image, index) => {
      const tile = document.createElement('button')
      tile.type = 'button'
      tile.dataset.generateReelTile = 'true'
      tile.dataset.index = String(index)
      tile.setAttribute('role', 'option')
      tile.setAttribute('aria-label', index === 0 ? '最新の生成画像' : `${index + 1}枚前の生成画像`)
      tile.setAttribute('aria-selected', String(index === selectedIndex))

      const img = document.createElement('img')
      img.src = image
      img.alt = index === 0 ? '最新の生成画像' : `生成画像 ${index + 1}`
      img.draggable = false
      img.addEventListener('load', () => {
        if (img.naturalWidth > 0 && img.naturalHeight > 0) {
          tile.dataset.aspect = `${img.naturalWidth}x${img.naturalHeight}`
          layoutTiles()
        }
      })
      tile.append(img)

      const meta = document.createElement('span')
      meta.dataset.generateReelMeta = 'true'
      meta.textContent = index === 0 ? 'LATEST' : `−${index}`
      tile.append(meta)

      tile.addEventListener('click', () => {
        selectedIndex = index
        tiles.forEach((item, itemIndex) => item.setAttribute('aria-selected', String(itemIndex === selectedIndex)))
        const thumb = document.getElementById(`thumb-${index}`) as HTMLButtonElement | null
        thumb?.click()

        // Let React update the production preview to the selected image, then
        // invoke its original image button so the existing modal/open behavior
        // remains authoritative.
        requestAnimationFrame(() => requestAnimationFrame(() => {
          const originalButton = Array.from(
            preview.querySelectorAll<HTMLButtonElement>('button'),
          ).find((button) =>
            !button.closest('[data-generate-reel-proposal="true"]') &&
            !button.closest('[data-generate-reel-toolbar="true"]') &&
            Array.from(button.querySelectorAll<HTMLImageElement>('img')).some((node) => node.src === image),
          )
          originalButton?.click()
        }))
      })

      tiles.push(tile)
      reel.append(tile)
    })

    const latestButton = document.createElement('button')
    latestButton.type = 'button'
    latestButton.dataset.generateReelLatest = 'true'
    latestButton.setAttribute('aria-label', '最新の生成画像へ戻る')
    latestButton.textContent = '← 最新へ'
    latestButton.hidden = true

    const historyButton = document.createElement('button')
    historyButton.type = 'button'
    historyButton.dataset.generateReelHistoryToggle = 'true'
    historyButton.setAttribute('aria-expanded', 'false')
    historyButton.textContent = '履歴を展開'

    const toolbar = document.createElement('div')
    toolbar.dataset.generateReelToolbar = 'true'
    toolbar.append(historyButton, latestButton)

    const updateLatestButton = () => {
      latestButton.hidden = reel.scrollLeft < 72
    }

    reel.addEventListener('scroll', updateLatestButton, { passive: true })
    let pendingWheel = 0
    let wheelFrame = 0
    reel.addEventListener('wheel', (event) => {
      event.preventDefault()
      const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 18
        : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? reel.clientWidth
        : 1
      const dominantDelta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
      const multiplier = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? 1 : 2.15
      pendingWheel += dominantDelta * unit * multiplier
      if (wheelFrame) return
      wheelFrame = requestAnimationFrame(() => {
        reel.scrollLeft += pendingWheel
        pendingWheel = 0
        wheelFrame = 0
      })
    }, { passive: false })

    reel.addEventListener('keydown', (event) => {
      const stride = Math.max(220, Math.round(reel.clientWidth * 0.55))
      if (event.key === 'Home') {
        event.preventDefault()
        reel.scrollTo({ left: 0, behavior: 'smooth' })
      } else if (event.key === 'End') {
        event.preventDefault()
        reel.scrollTo({ left: reel.scrollWidth, behavior: 'smooth' })
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault()
        reel.scrollBy({ left: -stride, behavior: 'smooth' })
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        reel.scrollBy({ left: stride, behavior: 'smooth' })
      }
    })

    latestButton.addEventListener('click', () => {
      reel.scrollTo({ left: 0, behavior: 'smooth' })
      reel.focus({ preventScroll: true })
    })

    historyButton.addEventListener('click', () => {
      const expanded = split.dataset.historyExpanded !== 'true'
      split.dataset.historyExpanded = String(expanded)
      historyButton.setAttribute('aria-expanded', String(expanded))
      historyButton.textContent = expanded ? '履歴を閉じる' : '履歴を展開'
      requestAnimationFrame(() => {
        window.dispatchEvent(new Event('resize'))
        layoutTiles()
      })
    })

    preview.append(reel, toolbar)
    const resizeObserver = new ResizeObserver(layoutTiles)
    resizeObserver.observe(reel)
    layoutTiles()
    updateLatestButton()
  }

  const observer = new MutationObserver(sync)
  observer.observe(document.body, { subtree: true, childList: true })
  window.addEventListener('resize', sync)
  sync()
}
