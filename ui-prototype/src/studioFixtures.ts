import type { DatasetProject, DatasetItem } from '../../frontend/src/api/types'
export const studioProject: DatasetProject = {
 id:93101,name:'UI Review / Sample LoRA',character_trigger:'reviewchar',outfit_trigger:'reviewoutfit',
 workflow_id:91001,prompt_meta:'solo, illustration',prompt_physical:'blue eyes, short hair',
 prompt_exclusive_outfit:'casual jacket',selected_alt_outfits:'[]',prompt_negative:'low quality',
 created_at:'2026-10-01T09:00:00Z',updated_at:'2026-10-01T09:00:00Z'
}
export const studioItems: DatasetItem[] = Array.from({length:20},(_,i)=>{
 const hue=(i*43+210)%360
 const svg='<svg xmlns="http://www.w3.org/2000/svg" width="480" height="640" viewBox="0 0 480 640"><rect width="480" height="640" fill="hsl('+hue+',27%,23%)"/><circle cx="240" cy="235" r="108" fill="hsl('+hue+',32%,52%)"/><path d="M130 540Q125 355 240 360Q355 355 350 540Z" fill="hsl('+hue+',44%,39%)"/><text x="240" y="591" text-anchor="middle" font-family="sans-serif" font-size="24" fill="white">UI SAMPLE '+String(i+1).padStart(2,'0')+'</text></svg>'
 return {id:93200+i,project_id:studioProject.id,slot_index:i,
 factors_json:JSON.stringify({shot:i%2?'upper body':'portrait',angle:'front',expression:i%3?'smile':'neutral',pose:'standing',outfit_type:'default'}),
 raw_prompt:'reviewchar, portrait, studio sample '+(i+1),
 caption_text:'reviewchar, blue eyes, short hair, sample pose '+(i+1),
 image_path:'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg),
 seed:30001+i,status:i<14?'APPROVED':'REJECTED'}
})

export const studioBenchmarkCells = (['decoupling','bake_in','pose','angle'] as const).flatMap((axisId,axisIndex) =>
  ([0.6,0.8,1.0] as const).map((weight,weightIndex)=>({
    axisId,weight,
    status: weightIndex===2 ? 'WARN' as const : 'PASS' as const,
    imageUrl:studioItems[(axisIndex*3+weightIndex)%studioItems.length].image_path ?? undefined,
    prompt:'Offline review sample: '+axisId+' at '+weight,
    seed:40200+axisIndex*3+weightIndex,
  }))
)
export const studioBenchmarkSweetSpot = {
  recommended_weight_min:0.75,recommended_weight_max:0.85,
  recommended_weight_display:'0.75〜0.85',
  reason:'UI確認用の架空の評価結果です（学習・測定は行っていません）。',
}
