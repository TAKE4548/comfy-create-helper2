/** Settings mobile proposal only. React retains ownership of original controls. */
export function mountSettingsProposal() {
  if (document.documentElement.dataset.prototypeVariant !== 'proposal') return
  const sync = () => {
    if (!matchMedia('(max-width:767px)').matches) return
    // Design-only save control comparison. Keep production handlers unchanged.
    // A review marker explicitly says autosave is NOT functional in this mock.
    const previewAutoSave=(button:HTMLButtonElement|null)=>{
      if(!button || button.dataset.settingsSavePreview==='true')return
      const row=button.parentElement
      if(!row)return
      button.dataset.settingsSavePreview='true'
      const note=document.createElement('span')
      note.dataset.settingsAutoSavePreview='true'
      note.textContent='自動保存（案）'
      note.title='表示比較のみ。自動保存は未実装です'
      row.insertBefore(note,button)
    }
    // Explicit saves for long-form prompts, service credentials and data editing remain visible.
    document.querySelectorAll<HTMLElement>('.req314-settings #settings-panel-dialogue h3, .req314-settings #settings-panel-prompt h3').forEach(h=>{
      if(!/パラメータ設定|パラメータ/.test(h.textContent??''))return
      const row=h.parentElement
      previewAutoSave(row?.querySelector<HTMLButtonElement>('button:has(svg.lucide-save)')??null)
    })
    previewAutoSave(document.querySelector<HTMLButtonElement>('.req314-settings #settings-panel-system button[aria-label="VRAM安全ガード設定を保存"]'))
    document.querySelectorAll<HTMLElement>('.req314-settings #settings-panel-dialogue h3').forEach(h=>{
      if(!/画像処理フィルタパラメータ/.test(h.textContent??''))return
      previewAutoSave(h.parentElement?.querySelector<HTMLButtonElement>('button:has(svg.lucide-save)')??null)
    })
    // Convert only explanatory copy, never status/error/field labels.
    const notes = document.querySelectorAll<HTMLElement>([
      '#settings-panel-dialogue section > div:first-child span.text-zinc-600',
      '#settings-panel-dialogue section > button:first-child span.text-zinc-600',
      '#settings-panel-system section > div:first-child span.text-zinc-600',
      '#settings-panel-system section > button:first-child span.text-zinc-600',
      '#settings-panel-system [data-testid="thumbnail-settings-section"] p.text-zinc-400'
    ].join(','))
    notes.forEach(note => {
      if(note.dataset.settingsInfoSource==='true') return
      const content=note.textContent?.trim()
      if(!content || content.length<8 || note.closest('[role="alert"],[role="status"]')) return
      const host=note.parentElement
      if(!host) return
      note.dataset.settingsInfoSource='true'
      const wrapper=document.createElement('span')
      wrapper.dataset.settingsInfo='true'
      const button=document.createElement('button')
      button.type='button'
      button.className='settings-info-trigger'
      button.textContent='ⓘ'
      button.setAttribute('aria-label','説明を表示')
      button.setAttribute('aria-expanded','false')
      const detail=document.createElement('span')
      detail.className='settings-info-detail'
      detail.textContent=content.replace(/^—\s*/,'')
      detail.hidden=true
      const closeInfo=()=>{
        detail.hidden=true
        button.setAttribute('aria-expanded','false')
      }
      button.addEventListener('click',event=>{
        event.preventDefault();event.stopPropagation()
        const opening=detail.hidden
        document.querySelectorAll<HTMLElement>('.settings-info-detail:not([hidden])').forEach(el=>{
          el.hidden=true
          el.parentElement?.querySelector('button')?.setAttribute('aria-expanded','false')
        })
        if(!opening) return
        detail.hidden=false
        button.setAttribute('aria-expanded','true')
        // Fixed viewport positioning avoids clipping by scroll panels and cards.
        const rect=button.getBoundingClientRect()
        const width=Math.min(300,window.innerWidth-24)
        const left=Math.max(12,Math.min(rect.left,window.innerWidth-width-12))
        detail.style.width=width+'px'
        detail.style.left=left+'px'
        detail.style.right='auto'
        detail.style.top='12px'
        const height=detail.getBoundingClientRect().height
        const below=rect.bottom+8
        const above=rect.top-height-8
        detail.style.top=(below+height<=window.innerHeight-12?below:above>=12?above:Math.max(12,window.innerHeight-height-12))+'px'
      })
      document.addEventListener('pointerdown',event=>{
        if(!wrapper.contains(event.target as Node))closeInfo()
      })
      document.addEventListener('keydown',event=>{
        if(event.key==='Escape')closeInfo()
      })
      window.addEventListener('scroll',closeInfo,true)
      window.addEventListener('resize',closeInfo)
      wrapper.append(button,detail)
      host.insertBefore(wrapper,note.nextSibling)
    })
    // Disclose detailed image-filter guidance on demand, preserving labels and errors.
    document.querySelectorAll<HTMLElement>('#settings-panel-dialogue p.text-\\[10px\\]').forEach(note=>{
      if(note.dataset.settingsInfoSource==='true' || !note.closest('div.space-y-1'))return
      const label=note.parentElement?.querySelector('span.text-zinc-400')
      if(!label || !note.textContent?.trim())return
      note.dataset.settingsInfoSource='true'
      const info=document.createElement('button')
      info.type='button'
      info.dataset.settingsInlineInfo='true'
      info.textContent='ⓘ'
      info.setAttribute('aria-label',label.textContent?.trim()+'の説明')
      info.setAttribute('aria-expanded','false')
      note.parentElement?.insertBefore(info,note)
      info.addEventListener('click',event=>{
        event.preventDefault();event.stopPropagation()
        const open=note.dataset.settingsInlineOpen!=='true'
        note.dataset.settingsInlineOpen=String(open)
        info.setAttribute('aria-expanded',String(open))
      })
    })
    const section = document.querySelector<HTMLElement>('.req314-settings [data-testid="settings-card-mapping"] > section')
    const header = section?.firstElementChild as HTMLElement | null
    if (!header) return
    const actions = header.children.item(1) as HTMLElement | null
    if (!actions) return
    const originalButtons = Array.from(actions.querySelectorAll<HTMLButtonElement>(':scope > button'))
    if (originalButtons.length < 3) return
    header.dataset.settingsMappingMenu = 'true'
    let wrapper = header.querySelector<HTMLElement>('[data-settings-management-menu]')
    if (!wrapper) {
      wrapper = document.createElement('div')
      wrapper.dataset.settingsManagementMenu = 'true'
      wrapper.className = 'settings-management-menu'
      const trigger = document.createElement('button')
      trigger.type = 'button'
      trigger.textContent = '管理 ⋯'
      trigger.setAttribute('aria-label','マッピング管理メニュー')
      trigger.setAttribute('aria-expanded','false')
      const list = document.createElement('div')
      list.className = 'settings-management-list'
      list.hidden = true
      const close = () => {list.hidden = true; trigger.setAttribute('aria-expanded','false')}
      trigger.addEventListener('click',(event) => {
        event.stopPropagation()
        const next = !list.hidden
        list.hidden = next
        trigger.setAttribute('aria-expanded',String(!next))
      })
      for (const source of originalButtons.slice(0,2)) {
        const proxy = document.createElement('button')
        proxy.type = 'button'
        proxy.textContent = source.textContent?.trim() ?? '管理'
        proxy.addEventListener('click',(event) => {
          event.stopPropagation()
          close()
          source.click()
        })
        list.append(proxy)
      }
      wrapper.append(trigger,list)
      header.append(wrapper)
      document.addEventListener('pointerdown',(event) => {
        if (!wrapper?.contains(event.target as Node)) close()
      })
    }
  }
  // Horizontal gestures on Settings content change tabs; native controls keep priority.
  let start: {x:number;y:number;tab:string}|null=null
  document.addEventListener('touchstart',event=>{
    const target=event.target as HTMLElement
    if(!matchMedia('(max-width:767px)').matches || !target.closest('.req314-settings [role="tabpanel"]') || target.closest('input,textarea,select,button,a,[role="slider"],[role="tablist"],[role="dialog"],[data-drag-handle],.overflow-x-auto,[contenteditable]'))return
    const panel=target.closest<HTMLElement>('[role="tabpanel"]')
    const pt=event.touches[0]
    if(pt && panel)start={x:pt.clientX,y:pt.clientY,tab:panel.id.replace('settings-panel-','')}
  },{passive:true})
  document.addEventListener('touchend',event=>{
    if(!start)return
    const origin=start
    start=null
    if((event.target as HTMLElement).closest('[role="dialog"]'))return
    const pt=event.changedTouches[0]
    if(!pt)return
    const dx=pt.clientX-origin.x,dy=pt.clientY-origin.y
    if(Math.abs(dx)<65 || Math.abs(dx)<Math.abs(dy)*1.5)return
    const ids=['workflows','prompt','dialogue','translation','system']
    const index=ids.indexOf(origin.tab)
    const next=index+(dx<0?1:-1)
    if(index<0 || next<0 || next>=ids.length)return
    document.querySelector<HTMLButtonElement>('#settings-tab-'+ids[next])?.click()
  },{passive:true})
  new MutationObserver(sync).observe(document.body,{childList:true,subtree:true})
  sync()
}
