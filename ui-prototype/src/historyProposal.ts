/** History mobile proposal only. No changes to production React or baseline. */
export function mountHistoryProposal() {
  if (document.documentElement.dataset.prototypeVariant !== 'proposal') return
  const mobile = () => matchMedia('(max-width:767px)').matches
  const actionName = (node: HTMLElement) => node.getAttribute('aria-label') || node.getAttribute('title') || node.textContent?.trim() || '操作'
  let openMenu: HTMLElement | null = null
  let openTrigger: HTMLButtonElement | null = null

  function closeMenu() {
    openMenu?.remove()
    openMenu = null
    openTrigger?.setAttribute('aria-expanded','false')
    openTrigger = null
  }
  document.addEventListener('pointerdown', e => {
    if (openMenu && !openMenu.contains(e.target as Node) && !(e.target as HTMLElement).closest('[data-history-menu-trigger]')) closeMenu()
  },true)
  document.addEventListener('keydown',e=>{if(e.key==='Escape') closeMenu()})

  function syncCard(card: HTMLElement, album: boolean) {
    const overlay = album
      ? card.querySelector<HTMLElement>('div.absolute.top-2.right-2')
      : card.querySelector<HTMLElement>('[data-testid^="snapshot-overlay-"]')
    if (!overlay) return
    overlay.dataset.historyActionHost = 'true'
    const actions = Array.from(overlay.querySelectorAll<HTMLElement>('button[id],a[id]'))
    if (!actions.length) return
    for (const action of actions) action.dataset.historyOriginalAction = 'true'
    let trigger = card.querySelector<HTMLButtonElement>('[data-history-menu-trigger]')
    if (!trigger) {
      trigger = document.createElement('button')
      trigger.type='button'
      trigger.dataset.historyMenuTrigger='true'
      trigger.textContent='⋯'
      trigger.setAttribute('aria-label','画像操作メニュー')
      trigger.setAttribute('aria-haspopup','menu')
      trigger.setAttribute('aria-expanded','false')
      trigger.addEventListener('click',e=>{
        e.stopPropagation()
        if(openTrigger===trigger){closeMenu();return}
        closeMenu()
        const menu=document.createElement('div')
        menu.dataset.historyActionMenu='true'
        menu.setAttribute('role','menu')
        for (const action of actions) {
          const item=document.createElement('button')
          item.type='button'
          item.setAttribute('role','menuitem')
          item.textContent=actionName(action)
          if (/delete|削除/i.test(item.textContent ?? '')) item.dataset.destructive='true'
          item.addEventListener('click',ev=>{
            ev.stopPropagation()
            closeMenu()
            action.click()
          })
          menu.append(item)
        }
        card.append(menu)
        openMenu=menu;openTrigger=trigger
        trigger.setAttribute('aria-expanded','true')
      })
      card.append(trigger)
    }
    if (!album) {
      const date=overlay.querySelector<HTMLElement>('p')
      if (date) date.dataset.historyDate='true'
    }
  }

  function syncFilters() {
    const filter=document.querySelector<HTMLElement>('#history-workflow-filter')?.closest<HTMLElement>('.flex.flex-wrap.items-center')
    if (!filter || filter.dataset.historyFilterEnhanced==='true') return
    filter.dataset.historyFilterEnhanced='true'
    const summary=document.createElement('div')
    summary.dataset.historyFilterBar='true'
    const toggle=document.createElement('button')
    toggle.type='button'
    toggle.textContent='フィルター'
    toggle.setAttribute('aria-expanded','false')
    const count=document.createElement('span')
    count.dataset.historyFilterCount='true'
    const update=()=>{
      const ids=['history-workflow-filter','history-lora-filter','history-tagset-filter']
      const n=ids.filter(id=>!!(document.getElementById(id) as HTMLSelectElement|null)?.value).length
      count.textContent=n?'適用中 '+n+'件':''
    }
    toggle.addEventListener('click',()=>{
      const expanded=filter.dataset.historyExpanded!=='true'
      filter.dataset.historyExpanded=String(expanded)
      toggle.setAttribute('aria-expanded',String(expanded))
      toggle.textContent=expanded?'フィルターを閉じる':'フィルター'
    })
    filter.addEventListener('change',update)
    summary.append(toggle,count)
    filter.parentElement?.insertBefore(summary,filter)
    update()
  }
  function sync() {
    if(!mobile()){closeMenu();return}
    syncFilters()
    document.querySelectorAll<HTMLElement>('[id^="snap-card-"]').forEach(c=>syncCard(c,false))
    document.querySelectorAll<HTMLElement>('[id^="album-item-card-"]').forEach(c=>syncCard(c,true))
  }
  const observer=new MutationObserver(sync)
  observer.observe(document.body,{subtree:true,childList:true})
  sync()
}
