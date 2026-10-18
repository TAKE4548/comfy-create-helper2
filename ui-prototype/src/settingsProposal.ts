/** Settings mobile proposal only. React retains ownership of original controls. */
export function mountSettingsProposal() {
  if (document.documentElement.dataset.prototypeVariant !== 'proposal') return
  const sync = () => {
    if (!matchMedia('(max-width:767px)').matches) return
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
  new MutationObserver(sync).observe(document.body,{childList:true,subtree:true})
  sync()
}
