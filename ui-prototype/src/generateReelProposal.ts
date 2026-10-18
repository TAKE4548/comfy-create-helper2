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
      const viewportWidth = Math.max(120, reel.clientWidth)
      tiles.forEach((tile) => {
        const [rawW, rawH] = (tile.dataset.aspect ?? '').split('x').map(Number)
        if (!rawW || !rawH) return
        const ar = rawW / rawH
        const targetHeight = availableHeight
        const maxWidth = viewportWidth * 0.86
        const widthFromHeight = targetHeight * ar
        const widthConstrained = widthFromHeight > maxWidth
        const width = Math.min(widthFromHeight, maxWidth)
        const height = widthConstrained ? width / ar : targetHeight
        tile.dataset.widthConstrained = String(widthConstrained)
        tile.style.width = `${Math.max(80, width)}px`
        tile.style.height = `${Math.max(80, height)}px`
        tile.style.aspectRatio = 'auto'
      })

      const firstTile = tiles[0]
      const lastTile = tiles[tiles.length - 1]
      if (firstTile && lastTile) {
        const style = getComputedStyle(reel)
        const paddingLeft = parseFloat(style.paddingLeft)
        const paddingRight = parseFloat(style.paddingRight)
        const firstWidth = firstTile.getBoundingClientRect().width
        const lastWidth = lastTile.getBoundingClientRect().width

        // Keep the reel content box stable. Edge breathing room belongs to the
        // edge tiles, not the scroll container padding; changing container
        // padding shrinks the flex content box and can collapse tile widths.
        firstTile.style.marginLeft = `${Math.max(0, viewportWidth / 2 - firstWidth / 2 - paddingLeft)}px`
        lastTile.style.marginRight = `${Math.max(0, viewportWidth / 2 - lastWidth / 2 - paddingRight)}px`
      }
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

    const oldestButton = document.createElement('button')
    oldestButton.type = 'button'
    oldestButton.dataset.generateReelOldest = 'true'
    oldestButton.setAttribute('aria-label', '最古の生成画像へ移動')
    oldestButton.textContent = '最古へ →'

    const autoFollowButton = document.createElement('button')
    autoFollowButton.type = 'button'
    autoFollowButton.dataset.generateReelAutoFollow = 'true'

    const sessionButton = document.createElement('button')
    sessionButton.type = 'button'
    sessionButton.dataset.generateReelSessionFilter = 'true'

    const historyCloseButton = document.createElement('button')
    historyCloseButton.type = 'button'
    historyCloseButton.dataset.generateReelHistoryClose = 'true'
    historyCloseButton.textContent = '⌄ 履歴を閉じる'
    historyCloseButton.hidden = true

    const historyButton = document.createElement('button')
    historyButton.type = 'button'
    historyButton.dataset.generateReelHistoryToggle = 'true'
    historyButton.setAttribute('aria-expanded', 'false')
    historyButton.textContent = '履歴を展開'

    const toolbar = document.createElement('div')
    toolbar.dataset.generateReelToolbar = 'true'
    toolbar.append(autoFollowButton, sessionButton, oldestButton, historyButton, latestButton)

    const sourceAutoFollow = galleryRoot.querySelector<HTMLButtonElement>('#preview-autofollow-toggle-desktop')
    const sourceSessionFilter = galleryRoot.querySelector<HTMLInputElement>('#session-filter-toggle')
    const sortButtons = Array.from(galleryRoot.querySelectorAll<HTMLButtonElement>('button'))
      .filter((button) => button.textContent?.trim() === '新しい順' || button.textContent?.trim() === '古い順')
    const sortControl = sortButtons[0]?.parentElement as HTMLElement | null
    if (sortControl) sortControl.dataset.generateReelSortControl = 'true'

    const syncSharedControls = () => {
      if (sourceAutoFollow) {
        const following = sourceAutoFollow.getAttribute('aria-label')?.includes('自動追従中') ?? false
        autoFollowButton.dataset.active = String(following)
        autoFollowButton.setAttribute('aria-pressed', String(following))
        autoFollowButton.textContent = following ? '● 最新追従' : '○ 最新追従'
        autoFollowButton.title = sourceAutoFollow.getAttribute('aria-label') ?? '最新画像の自動追従'
      } else {
        autoFollowButton.hidden = true
      }

      if (sourceSessionFilter) {
        sessionButton.dataset.active = String(sourceSessionFilter.checked)
        sessionButton.setAttribute('aria-pressed', String(sourceSessionFilter.checked))
        sessionButton.textContent = sourceSessionFilter.checked ? '✓ 自セッション' : '自セッション'
      } else {
        sessionButton.hidden = true
      }
    }

    const updateLatestButton = () => {
      latestButton.hidden = reel.scrollLeft < 72
    }

    reel.addEventListener('scroll', updateLatestButton, { passive: true })

    const centerTile = (tile: HTMLElement, behavior: ScrollBehavior = 'smooth') => {
      const target = tile === tiles[0] ? 0 : tile.offsetLeft + tile.offsetWidth / 2 - reel.clientWidth / 2
      reel.scrollTo({ left: Math.max(0, target), behavior })
    }

    const centerNearestTile = () => {
      if (tiles.length === 0) return
      const viewportCenter = reel.scrollLeft + reel.clientWidth / 2
      let nearest = tiles[0]
      let nearestDistance = Number.POSITIVE_INFINITY
      tiles.forEach((tile) => {
        const center = tile.offsetLeft + tile.offsetWidth / 2
        const distance = Math.abs(center - viewportCenter)
        if (distance < nearestDistance) {
          nearest = tile
          nearestDistance = distance
        }
      })
      centerTile(nearest)
    }

    let velocity = 0
    let inertiaFrame = 0
    const runInertia = () => {
      const before = reel.scrollLeft
      reel.scrollLeft += velocity
      const after = reel.scrollLeft

      if (after === before && Math.abs(velocity) > 0.1) {
        velocity = 0
      } else {
        velocity *= 0.89
      }

      if (Math.abs(velocity) < 0.35) {
        velocity = 0
        inertiaFrame = 0
        centerNearestTile()
        return
      }
      inertiaFrame = requestAnimationFrame(runInertia)
    }

    reel.addEventListener('wheel', (event) => {
      event.preventDefault()
      const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 18
        : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? reel.clientWidth
        : 1
      const horizontalInput = Math.abs(event.deltaX) > Math.abs(event.deltaY)
      const dominantDelta = horizontalInput ? event.deltaX : event.deltaY
      const impulse = dominantDelta * unit * (horizontalInput ? 0.28 : 0.38)
      const maxVelocity = Math.max(28, reel.clientWidth * 0.08)
      velocity = Math.max(-maxVelocity, Math.min(maxVelocity, velocity + impulse))
      if (!inertiaFrame) inertiaFrame = requestAnimationFrame(runInertia)
    }, { passive: false })

    reel.addEventListener('keydown', (event) => {
      const stride = Math.max(220, Math.round(reel.clientWidth * 0.55))
      if (event.key === 'Home') {
        event.preventDefault()
        stopInertia()
        if (tiles[0]) centerTile(tiles[0])
      } else if (event.key === 'End') {
        stopInertia()
        event.preventDefault()
        if (tiles.length > 0) centerTile(tiles[tiles.length - 1])
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault()
        stopInertia()
        reel.scrollBy({ left: -stride, behavior: 'smooth' })
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        stopInertia()
        reel.scrollBy({ left: stride, behavior: 'smooth' })
      }
    })

    const stopInertia = () => {
      velocity = 0
      if (inertiaFrame) cancelAnimationFrame(inertiaFrame)
      inertiaFrame = 0
    }

    latestButton.addEventListener('click', () => {
      stopInertia()
      if (tiles[0]) centerTile(tiles[0])
      reel.focus({ preventScroll: true })
    })

    oldestButton.addEventListener('click', () => {
      stopInertia()
      if (tiles.length > 0) centerTile(tiles[tiles.length - 1])
      reel.focus({ preventScroll: true })
    })

    autoFollowButton.addEventListener('click', () => {
      sourceAutoFollow?.click()
      requestAnimationFrame(syncSharedControls)
    })

    sessionButton.addEventListener('click', () => {
      sourceSessionFilter?.click()
      requestAnimationFrame(syncSharedControls)
    })

    const setHistoryExpanded = (expanded: boolean) => {
      split.dataset.historyExpanded = String(expanded)
      historyButton.setAttribute('aria-expanded', String(expanded))
      historyButton.textContent = expanded ? '履歴を閉じる' : '履歴を展開'
      historyCloseButton.hidden = !expanded
      requestAnimationFrame(() => {
        window.dispatchEvent(new Event('resize'))
        layoutTiles()
      })
    }

    historyButton.addEventListener('click', () => {
      setHistoryExpanded(split.dataset.historyExpanded !== 'true')
    })

    historyCloseButton.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      setHistoryExpanded(false)
    })

    // History and reel are two views of the same newest-first sequence.
    // A normal history click recenters the matching reel image; multi-select
    // intentionally keeps the preview stationary.
    galleryRoot.addEventListener('click', (event) => {
      const mouseEvent = event as MouseEvent
      const target = event.target as HTMLElement | null
      const thumb = target?.closest<HTMLButtonElement>('button[id^="thumb-"]')
      if (!thumb || mouseEvent.ctrlKey || mouseEvent.metaKey || mouseEvent.shiftKey) return
      if (galleryRoot.querySelector('button[aria-label="選択モード終了"]')) return
      const match = thumb.id.match(/^thumb-(\d+)$/)
      const index = match ? Number(match[1]) : -1
      if (index < 0 || !tiles[index]) return
      requestAnimationFrame(() => {
        stopInertia()
        selectedIndex = index
        tiles.forEach((tile, tileIndex) => tile.setAttribute('aria-selected', String(tileIndex === index)))
        centerTile(tiles[index])
      })
    })

    separator.append(historyCloseButton)
    syncSharedControls()
    const sharedControlObserver = new MutationObserver(syncSharedControls)
    if (sourceAutoFollow) sharedControlObserver.observe(sourceAutoFollow, { attributes: true, attributeFilter: ['aria-label', 'class'] })
    if (sourceSessionFilter) sharedControlObserver.observe(sourceSessionFilter, { attributes: true, attributeFilter: ['checked'] })
    sourceSessionFilter?.addEventListener('change', syncSharedControls)

    preview.append(reel, toolbar)
    const resizeObserver = new ResizeObserver(layoutTiles)
    resizeObserver.observe(reel)
    layoutTiles()
    requestAnimationFrame(() => {
      if (tiles[0]) centerTile(tiles[0], 'auto')
    })
    updateLatestButton()
  }

  const observer = new MutationObserver(sync)
  observer.observe(document.body, { subtree: true, childList: true })
  window.addEventListener('resize', sync)
  sync()
}
