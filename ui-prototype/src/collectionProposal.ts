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
    footer.replaceChildren(...Array.from(actions).map(source => {
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
