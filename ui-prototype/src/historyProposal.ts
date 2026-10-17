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
    if (overlay.dataset.historyActionHost !== 'true') overlay.dataset.historyActionHost = 'true'
    const actions = Array.from(overlay.querySelectorAll<HTMLElement>('button[id],a[id]'))
    if (!actions.length) return
    for (const action of actions) if (action.dataset.historyOriginalAction !== 'true') action.dataset.historyOriginalAction = 'true'
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
      if (date && date.dataset.historyDate !== 'true') date.dataset.historyDate='true'
    }
  }

  function syncFilters() {
    const filter=document.querySelector<HTMLElement>('#history-workflow-filter')?.closest<HTMLElement>('.flex.flex-wrap.items-center')
    const bars=Array.from(document.querySelectorAll<HTMLElement>('[data-history-filter-bar]'))
    if (!filter || !mobile()) {
      bars.forEach(bar=>bar.remove())
      return
    }
    // React can replace the filter node on view changes. Never leave an orphan
    // and never create multiple toolbar instances for one filter.
    let bar=bars.find(el=>el.dataset.historyFilterOwner==='snapshots')
    for(const other of bars) if(other!==bar) other.remove()
    if(!bar) {
      bar=document.createElement('div')
      bar.dataset.historyFilterBar='true'
      bar.dataset.historyFilterOwner='snapshots'
    }
    if(bar.nextElementSibling!==filter) filter.before(bar)
    // Mirror the existing React-owned bulk speech action in the compact row.
    // Original stays mounted so React event handlers and status remain authoritative.
    const speechSource=document.querySelector<HTMLButtonElement>('#open-batch-speech-modal-btn')
    let speechAction=bar.querySelector<HTMLButtonElement>('[data-history-bulk-speech]')
    if(speechSource && !speechAction){
      speechAction=document.createElement('button')
      speechAction.type='button'
      speechAction.dataset.historyBulkSpeech='true'
      speechAction.textContent='セリフ一括変換'
      speechAction.addEventListener('click',()=>speechSource.click())
      bar.append(speechAction)
    }
    if(speechSource) speechSource.dataset.historySpeechMoved='true'

    if (filter.dataset.historyFilterEnhanced !== 'true') filter.dataset.historyFilterEnhanced='true'
    let toggle=bar.querySelector<HTMLButtonElement>('[data-history-filter-toggle]')
    if(!toggle){
      toggle=document.createElement('button')
      toggle.type='button';toggle.dataset.historyFilterToggle='true'
      toggle.addEventListener('click',()=>{
        filter.dataset.historyExpanded=String(filter.dataset.historyExpanded!=='true')
        toggle!.setAttribute('aria-expanded',String(filter.dataset.historyExpanded==='true'))
        toggle!.textContent=filter.dataset.historyExpanded==='true'?'フィルターを閉じる':'フィルター'
      })
      bar.append(toggle)
    }
    const toggleLabel=filter.dataset.historyExpanded==='true'?'フィルターを閉じる':'フィルター'
    if(toggle.textContent!==toggleLabel) toggle.textContent=toggleLabel
    const expanded=String(filter.dataset.historyExpanded==='true')
    if(toggle.getAttribute('aria-expanded')!==expanded) toggle.setAttribute('aria-expanded',expanded)
    let count=bar.querySelector<HTMLElement>('[data-history-filter-count]')
    if(!count){count=document.createElement('span');count.dataset.historyFilterCount='true';bar.append(count)}
    const n=['history-workflow-filter','history-lora-filter','history-tagset-filter'].filter(id=>!!(document.getElementById(id) as HTMLSelectElement|null)?.value).length
    const countLabel=n?'適用中 '+n+'件':''
    if(count.textContent!==countLabel) count.textContent=countLabel
    let sort=bar.querySelector<HTMLElement>('[data-history-sort-controls]')
    if(!sort){
      sort=document.createElement('div');sort.dataset.historySortControls='true'
      for(const [order,label,icon] of [['desc','新しい順','↓'],['asc','古い順','↑']]){
        const button=document.createElement('button')
        button.type='button';button.textContent=icon;button.title=label;button.setAttribute('aria-label',label)
        button.dataset.historySortOrder=order
        button.addEventListener('click',()=>{
          const buttons=Array.from(filter.querySelectorAll<HTMLButtonElement>('button'))
          buttons.find(b=>b.textContent?.trim()===label)?.click()
        })
        sort.append(button)
      }
      bar.append(sort)
    }
  }
  function syncSelection() {
    const isHistory = location.pathname.endsWith('/history') || location.pathname.endsWith('/history/')
    const toolbars = isHistory ? Array.from(document.querySelectorAll<HTMLElement>('div.animate-slide-down'))
      .filter(el=>el.textContent?.includes('複数選択モード')) : []
    // Remove detached bottom bars when React exits selection mode or changes views.
    document.querySelectorAll<HTMLElement>('[data-history-selection-dock]').forEach(dock=>{
      if(!toolbars.some(toolbar=>toolbar.dataset.historySelectionId===dock.dataset.historySelectionId)){
        dock.remove()
      }
    })
    for(const toolbar of toolbars){
      if(toolbar.dataset.historySelectionToolbar!=='true') toolbar.dataset.historySelectionToolbar='true'
      if(!toolbar.dataset.historySelectionId) toolbar.dataset.historySelectionId='history-selection-'+(toolbar.querySelector('#save-album-btn')?'snapshots':'album')
      const id=toolbar.dataset.historySelectionId
      let dock=document.querySelector<HTMLElement>('[data-history-selection-dock][data-history-selection-id="'+id+'"]')
      if(!dock){
        dock=document.createElement('div')
        dock.dataset.historySelectionDock='true'
        dock.dataset.historySelectionId=id
        document.body.append(dock)
      }
      const actions=toolbar.querySelector<HTMLElement>('#bulk-download-btn')?.parentElement
      if(!actions) continue
      const sourceButtons=Array.from(actions.querySelectorAll<HTMLButtonElement>('button[id]'))
      for(const button of sourceButtons){
        const label=button.id==='bulk-download-btn'?'ダウンロード':button.id==='save-album-btn'?'アルバムへ追加':'削除'
        let proxy=dock.querySelector<HTMLButtonElement>('[data-history-proxy-for="'+button.id+'"]')
        if(!proxy){
          proxy=document.createElement('button')
          proxy.type='button'
          proxy.dataset.historyProxyFor=button.id
          proxy.addEventListener('click',()=>button.click())
          dock.append(proxy)
        }
        if(proxy.textContent!==label)proxy.textContent=label
        if(proxy.disabled!==button.disabled)proxy.disabled=button.disabled
        proxy.dataset.destructive=button.id.includes('delete')?'true':'false'
      }
      for(const proxy of Array.from(dock.querySelectorAll<HTMLButtonElement>('[data-history-proxy-for]'))){
        if(!sourceButtons.some(button=>button.id===proxy.dataset.historyProxyFor))proxy.remove()
      }
      const exitSource=toolbar.querySelector<HTMLButtonElement>('button[title="選択モード終了"]')
      if(exitSource){
        let exit=toolbar.querySelector<HTMLButtonElement>('[data-history-selection-exit]')
        if(!exit){
          exit=document.createElement('button')
          exit.type='button'
          exit.dataset.historySelectionExit='true'
          exit.setAttribute('aria-label','選択モード終了')
          exit.textContent='×'
          exit.addEventListener('click',()=>exitSource.click())
          toolbar.querySelector(':scope > div:first-child')?.append(exit)
        }
      }
      const count=toolbar.querySelector<HTMLElement>('span.text-gray-300')
      if(count && count.dataset.historySelectionCount!=='true')count.dataset.historySelectionCount='true'
    }
  }
  function syncGenerateSelection() {
    const panel=document.querySelector<HTMLElement>('#mobile-history-panel')
    if(!panel) return
    const original=panel.querySelector<HTMLButtonElement>('button[aria-label="選択モード終了"]')
    if(!original){document.querySelector('[data-generate-selection-dock]')?.remove();return}
    const bar=original.closest<HTMLElement>('div.flex.flex-col.gap-2')
    if(!bar) return
    if(bar.dataset.generateSelectionCompact!=='true')bar.dataset.generateSelectionCompact='true'
    const firstRow=bar.firstElementChild as HTMLElement|null
    if(!firstRow)return
    let close=firstRow.querySelector<HTMLButtonElement>('[data-generate-selection-close]')
    if(!close){
      close=document.createElement('button')
      close.type='button'
      close.dataset.generateSelectionClose='true'
      close.setAttribute('aria-label','選択モード終了')
      close.textContent='×'
      close.addEventListener('click',e=>{e.stopPropagation();original.click()})
      firstRow.append(close)
    }
    const count=firstRow.firstElementChild as HTMLElement|null
    if(count&&count.dataset.generateSelectionCount!=='true')count.dataset.generateSelectionCount='true'
    let dock=document.querySelector<HTMLElement>('[data-generate-selection-dock]')
    if(!dock){
      dock=document.createElement('div')
      dock.dataset.generateSelectionDock='true'
      document.body.append(dock)
    }
    let save=dock.querySelector<HTMLButtonElement>('button')
    if(!save){
      save=document.createElement('button')
      save.type='button'
      save.textContent='スナップショットに保存'
      dock.append(save)
    }
    const sourceSave=bar.querySelector<HTMLButtonElement>(':scope > div:last-child button:not([aria-label="選択モード終了"])')
    if(sourceSave){
      save.onclick=()=>sourceSave.click()
      if(save.disabled!==sourceSave.disabled)save.disabled=sourceSave.disabled
    }
  }
  function sync() {
    if(!mobile()){closeMenu();return}
    syncFilters()
    syncSelection()
    syncGenerateSelection()
    document.querySelectorAll<HTMLElement>('[id^="snap-card-"]').forEach(c=>syncCard(c,false))
    document.querySelectorAll<HTMLElement>('[id^="album-item-card-"]').forEach(c=>syncCard(c,true))
  }
  const observer=new MutationObserver(sync)
  observer.observe(document.body,{subtree:true,childList:true})
  sync()
}
