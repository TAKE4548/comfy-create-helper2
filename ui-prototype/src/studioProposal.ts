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
  // Step 1: retain project fields but tuck them behind an explicit edit action.
  const projectTitle=Array.from(root.querySelectorAll<HTMLElement>('h2')).find(x=>x.textContent?.includes('プロジェクト & トリガー連動設定'))
  const projectCard=projectTitle?.parentElement
  if(projectCard && !projectCard.dataset.studioProjectCompact){
    projectCard.dataset.studioProjectCompact='true'
    const edit=document.createElement('button')
    edit.type='button'
    edit.textContent='編集する'
    edit.dataset.studioProjectEdit='true'
    edit.setAttribute('aria-expanded','false')
    edit.addEventListener('click',()=>{
      const open=projectCard.dataset.studioProjectExpanded!=='true'
      projectCard.dataset.studioProjectExpanded=String(open)
      edit.setAttribute('aria-expanded',String(open))
      edit.textContent=open?'閉じる':'編集する'
    })
    projectTitle.after(edit)
  }
  // The existing remap action is inside project editing. Hide the duplicate section.
  const duplicateSection=root.querySelector<HTMLElement>('#bypass-mapping-section')
  if(duplicateSection)duplicateSection.dataset.studioDuplicateSection='true'

  // Read generated factor data where available; no inferred quality/success score.
  const matrixTitle=Array.from(root.querySelectorAll<HTMLElement>('h3')).find(x=>x.textContent?.includes('生成マトリクスプレビュー'))
  const matrixCard=matrixTitle?.parentElement?.parentElement
  if(matrixTitle && matrixCard){
    matrixCard.dataset.studioMatrixReview='true'
    const cards=Array.from(matrixCard.querySelectorAll<HTMLElement>('[data-testid^="matrix-item-card-"]'))
    const summary=matrixCard.querySelector<HTMLElement>('[data-studio-matrix-summary]')
    if(summary)summary.remove()
    let overview=matrixCard.querySelector<HTMLElement>('[data-studio-matrix-overview]')
    if(!overview){
      overview=document.createElement('div')
      overview.dataset.studioMatrixOverview='true'
      matrixTitle.parentElement?.after(overview)
    }
    // Preview card nodes are limited to eight; use the full in-memory Studio dataset for distribution.
    const factorItems=(window as any).__studioReviewItems as Array<{factors_json:string}> | undefined
    const values=(factorItems?.length?factorItems:cards.map(card=>({factors_json:card.dataset.factorsJson??''}))).map(item=>{
      try{return JSON.parse(item.factors_json) as Record<string,string>}catch{return null}
    }).filter((v):v is Record<string,string>=>!!v)
    const dims:[string,string][]=[['outfit_type','衣装'],['expression','表情'],['shot','構図（ショット）'],['angle','アングル'],['pose','ポーズ']]
    const signature=JSON.stringify(values)
    if(overview.dataset.signature!==signature){
      overview.dataset.signature=signature
      overview.replaceChildren()
      if(!values.length){
        overview.textContent='構成比を算出できる素材データがありません。'
      }else{
        const heading=document.createElement('div')
        heading.className='studio-matrix-headline'
        heading.textContent='構成バランス · '+values.length+'件（表示データから集計）'
        overview.append(heading)
        const palette=['#818cf8','#2dd4bf','#fbbf24','#f472b6','#94a3b8','#c084fc']
        for(const [key,label] of dims){
          const counts=new Map<string,number>()
          for(const data of values){
            const value=String(data[key]??'未設定')
            counts.set(value,(counts.get(value)??0)+1)
          }
          const row=document.createElement('div')
          row.className='studio-matrix-factor'
          const title=document.createElement('div')
          title.className='studio-matrix-factor-label'
          title.textContent=label
          const bar=document.createElement('div')
          bar.className='studio-matrix-bar'
          bar.setAttribute('role','img')
          bar.setAttribute('aria-label',label+': '+[...counts].map(([name,n])=>name+' '+n+'件').join('、'))
          const legend=document.createElement('div')
          legend.className='studio-matrix-legend'
          Array.from(counts).sort((a,b)=>b[1]-a[1]).forEach(([name,n],i)=>{
            const piece=document.createElement('span')
            piece.style.width=(100*n/values.length)+'%'
            piece.style.background=palette[i%palette.length]
            bar.append(piece)
            const labelEl=document.createElement('span')
            const swatch=document.createElement('i')
            swatch.style.background=palette[i%palette.length]
            labelEl.append(swatch,document.createTextNode((key==='outfit_type'?(name==='default'?'本命衣装':name==='alt'?'別衣装':name):name)+' '+n+'件'))
            legend.append(labelEl)
          })
          row.append(title,bar,legend)
          overview.append(row)
        }
        const foot=document.createElement('p')
        foot.className='studio-matrix-footnote'
        foot.textContent='選択内容の分布表示です。良否の自動判定ではありません。未設定もそのまま表示します。'
        overview.append(foot)
      }
    }
    if(!matrixCard.querySelector('[data-studio-matrix-details]')){
      const original=matrixCard.querySelector<HTMLElement>('.grid')
      if(original){
        const details=document.createElement('details')
        details.dataset.studioMatrixDetails='true'
        const label=document.createElement('summary')
        label.textContent='各スロットのプロンプトを見る'
        original.before(details)
        details.append(label,original)
        const ellipsis=matrixCard.querySelector<HTMLElement>('.text-center.text-xs')
        if(ellipsis)details.append(ellipsis)
      }
    }
  }
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
    const current=tabs[4]?.getAttribute('aria-pressed')==='true' ? 4 : tabs.findIndex(t=>t.classList.contains('bg-indigo-600'))
    if(current<0)return
    const next=current+(dx<0?1:-1)
    if(tabs[next])tabs[next].click()
  },{passive:true})
 }
 new MutationObserver(sync).observe(document.body,{subtree:true,childList:true})
 sync()
}
