/** Studio mobile visual proposal: no production code or real backend writes. */
export function mountStudioProposal(){
 if(document.documentElement.dataset.prototypeVariant!=='proposal')return
 let mounted=false
 const sync=()=>{
  if(!matchMedia('(max-width:767px)').matches)return
  const root=document.querySelector<HTMLElement>('[data-studio-proposal]')??document.querySelector<HTMLElement>('.bg-zinc-950.text-zinc-100:has([data-testid="project-selector"])')
  if(!root)return
  root.dataset.studioProposal='true'
  const selector=root.querySelector<HTMLElement>('[data-testid="project-selector"]')
  const create=root.querySelector<HTMLElement>('[data-testid="open-create-project-modal-btn"]')
  const status=root.querySelector<HTMLElement>('[data-testid="autosave-status"]')
  const nav=root.querySelector<HTMLElement>('nav:has([data-testid="studio-step-tab-1"])')
  if(!nav||!selector||!create||!status)return
  const actions=selector.parentElement
  if(!actions)return
  actions.dataset.studioActions='true'
  nav.dataset.studioTabs='true'
  const header=nav.closest<HTMLElement>('[data-page-header-root]')
  if(header)header.dataset.studioHeader='true'
  if(mounted)return
  mounted=true
  let start:{x:number;y:number}|null=null
  root.addEventListener('touchstart',event=>{
    const el=event.target as HTMLElement
    if(!el.closest('main')||el.closest('button,input,select,textarea,[role="dialog"],[role="slider"],.overflow-x-auto,[contenteditable]'))return
    const p=event.touches[0]
    if(p)start={x:p.clientX,y:p.clientY}
  },{passive:true})
  root.addEventListener('touchend',event=>{
    if(!start)return
    const p=event.changedTouches[0],origin=start
    start=null
    if(!p)return
    const dx=p.clientX-origin.x,dy=p.clientY-origin.y
    if(Math.abs(dx)<65||Math.abs(dx)<Math.abs(dy)*1.5)return
    const tabs=Array.from(root.querySelectorAll<HTMLButtonElement>('[data-testid^="studio-step-tab-"],[data-testid="open-post-training-evaluation"]'))
    const current=tabs.findIndex(t=>t.classList.contains('bg-indigo-600'))
    if(current<0)return
    const next=current+(dx<0?1:-1)
    if(tabs[next])tabs[next].click()
  },{passive:true})
 }
 new MutationObserver(sync).observe(document.body,{subtree:true,childList:true})
 sync()
}
