/** Isolated mobile collection overlay. Baseline and production are untouched. */
export function mountCollectionProposal() {
  if (document.documentElement.dataset.prototypeVariant !== 'proposal') return
  const mobile = () => matchMedia('(max-width:767px)').matches
  let openEditFromCard = false

  document.addEventListener('click', (event) => {
    if (!mobile()) return
    const target = event.target as HTMLElement
    const edit = target.closest<HTMLButtonElement>('button[id^="tagset-edit-"]')
    if (!edit) return
    const card = edit.closest<HTMLElement>('[id^="tagset-card-"]')
    if (!card) return
    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()
    openEditFromCard = true
    card.click()
  }, true)


  function renderCoverSummary(dialog: HTMLElement) {
    const galleryHost = dialog.querySelector<HTMLElement>(':scope > .grid > div:first-child')
    if (!galleryHost) return
    galleryHost.dataset.collectionGalleryHost = 'true'
    let summary = dialog.querySelector<HTMLButtonElement>('[data-collection-cover-summary]')
    const thumbnails = Array.from(galleryHost.querySelectorAll<HTMLImageElement>('img'))
      .filter(img => !!img.src && !img.closest('[data-collection-cover-summary]'))
    const unique = [...new Map(thumbnails.map(img => [img.src, img.src])).values()]
    const cover = galleryHost.querySelector<HTMLImageElement>('.bg-zinc-950 img')?.src ?? unique[0]
    if (!summary) {
      summary = document.createElement('button')
      summary.type = 'button'
      summary.dataset.collectionCoverSummary = 'true'
      summary.setAttribute('aria-label', 'Coverと関連Snapshotを表示')
      galleryHost.prepend(summary)
      summary.addEventListener('click', () => showGallery(dialog))
    }
    const signature = (cover ?? '') + '|' + unique.length
    if (summary.dataset.signature !== signature) {
      summary.dataset.signature = signature
      summary.replaceChildren()
      if (cover) {
        const image = document.createElement('img')
        image.src = cover
        image.alt = 'Cover'
        summary.appendChild(image)
      }
      const label = document.createElement('span')
      label.innerHTML = '<strong>Cover</strong><small>Snapshot ' + Math.max(0,unique.length - 1) + '件　›</small>'
      summary.appendChild(label)
    }
  }

  function showGallery(dialog: HTMLElement) {
    let overlay = dialog.querySelector<HTMLElement>('[data-collection-gallery]')
    if (overlay) { overlay.remove(); return }
    const host = dialog.querySelector<HTMLElement>('[data-collection-gallery-host]')
    if (!host) return
    const thumbButtons = Array.from(host.querySelectorAll<HTMLElement>('.overflow-y-auto button, .overflow-y-auto [role="button"]'))
    const coverImg = host.querySelector<HTMLImageElement>('.bg-zinc-950 img')
    const thumbImages = Array.from(host.querySelectorAll<HTMLImageElement>('.overflow-y-auto img'))
    const urls = [...new Set([coverImg?.src, ...thumbImages.map(img => img.src)].filter((s):s is string => !!s))]
    overlay = document.createElement('div')
    overlay.dataset.collectionGallery = 'true'
    overlay.setAttribute('role','dialog')
    overlay.setAttribute('aria-label','Snapshot一覧とCover設定')
    const header = document.createElement('div')
    header.className = 'collection-gallery-header'
    const title = document.createElement('strong')
    title.textContent = 'Snapshots · ' + urls.length + '枚'
    const close = document.createElement('button')
    close.type = 'button'
    close.textContent = '閉じる'
    close.addEventListener('click',()=>overlay?.remove())
    header.append(title, close)
    const grid = document.createElement('div')
    grid.className = 'collection-gallery-grid'
    urls.forEach((url, index) => {
      const item = document.createElement('button')
      item.type = 'button'
      item.className = 'collection-gallery-item'
      const img = document.createElement('img')
      img.src = url
      img.alt = 'Snapshot ' + (index+1)
      const label = document.createElement('span')
      label.textContent = index === 0 ? 'Cover' : 'Snapshot ' + index
      item.append(img,label)
      item.addEventListener('click',()=>{
        const buttonIndex = thumbImages.findIndex(image => image.src === url)
        if (buttonIndex >= 0) thumbButtons[buttonIndex]?.click()
        else if (index===0) thumbButtons[0]?.click()
        // Existing Cover mutation remains owned by React editing controls.
        const coverSet = Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find(b => /Set as Cover|Remove Cover/.test(b.textContent ?? ''))
        const footer = document.createElement('div')
        footer.className = 'collection-gallery-selected'
        const chosen = document.createElement('img')
        chosen.src = url
        chosen.alt = '選択中の画像'
        footer.appendChild(chosen)
        if (coverSet && /Set as Cover/.test(coverSet.textContent ?? '')) {
          const set = document.createElement('button')
          set.textContent = 'Coverに設定'
          set.addEventListener('click',()=>{coverSet.click(); overlay?.remove()})
          footer.appendChild(set)
        } else {
          const note = document.createElement('span')
          note.textContent = 'Cover変更は編集モードから行えます'
          footer.appendChild(note)
        }
        overlay?.querySelector('.collection-gallery-selected')?.remove()
        overlay?.appendChild(footer)
      })
      grid.appendChild(item)
    })
    overlay.append(header,grid)
    dialog.appendChild(overlay)
  }

  function sync() {
    if (!mobile()) return
    const dialog = document.querySelector<HTMLElement>('.modal-backdrop > .max-w-4xl, [data-testid="lora-detail-sheet"]')
    if (!dialog) return
    dialog.dataset.collectionSheet = 'true'
    // Tag Set card-edit and detail-edit now use the same TagSetDetailModal.
    if (openEditFromCard) {
      const edit = Array.from(dialog.querySelectorAll<HTMLButtonElement>('button')).find(b => b.textContent?.trim() === 'Edit')
      if (edit) {
        openEditFromCard = false
        edit.click()
      }
    }
    renderCoverSummary(dialog)
    const content = dialog.querySelector<HTMLElement>(':scope > .grid')
    const side = content?.lastElementChild as HTMLElement | null
    const inner = side?.firstElementChild as HTMLElement | null
    const original = inner?.lastElementChild as HTMLElement | null
    // Both detail screens place the read/edit action row at the end of the inner column.
    const actions = original?.querySelectorAll('button')
    if (!original || !actions?.length || original === inner?.firstElementChild) return
    original.dataset.collectionOriginalActions = 'true'
    let footer = dialog.querySelector<HTMLElement>('[data-collection-sheet-footer="true"]')
    if (!footer) {
      footer = document.createElement('div')
      footer.dataset.collectionSheetFooter = 'true'
      dialog.appendChild(footer)
    }
    const signature = Array.from(actions).map(b => (b.textContent?.trim() ?? '') + ':' + b.disabled).join('|')
    if (footer.dataset.actionsSignature === signature) return
    footer.dataset.actionsSignature = signature
    const ordered = Array.from(actions).sort((a,b) => {
      const primary = (el: HTMLButtonElement) => /^(Edit|Save Changes|Saving)/.test(el.textContent?.trim() ?? '') ? 1 : 0
      return primary(a)-primary(b)
    })
    footer.replaceChildren(...ordered.map(source => {
      const button = document.createElement('button')
      button.type = 'button'
      button.textContent = source.textContent?.trim() ?? 'Action'
      button.disabled = source.disabled
      button.addEventListener('click', () => source.click())
      return button
    }))
  }
  const observer = new MutationObserver(sync)
  observer.observe(document.body, { subtree:true, childList:true, attributes:true, attributeFilter:['disabled'] })
  sync()
}
