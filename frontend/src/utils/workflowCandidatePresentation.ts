import { candidateSuitabilityScore, type RankedNodeCandidate } from './workflowNodeUtils'

export function candidateTierLabel(tier: RankedNodeCandidate['tier']): string {
  return ['確定', '有力', 'クラス候補', 'パラメータ候補', 'その他'][tier]
}

export function candidateStageLabel(stageRank: RankedNodeCandidate['stageRank']): string {
  return stageRank === 0 ? '現在のステージに一致' : stageRank === 2 ? '別ステージに一致' : 'ステージ不明'
}

export function candidateConfidenceLabel(candidate: Pick<RankedNodeCandidate, 'tier' | 'stageRank' | 'score'>): string {
  return `${candidateSuitabilityScore(candidate)}%`
}

export function candidateReasonLabel(reason: string): string {
  return ({
    'class-and-title-exact': 'クラス・タイトル一致',
    'class-and-title-normalized': 'クラス・タイトル一致（表記ゆれ）',
    'class-match': 'クラス一致',
    'parameter-match': 'パラメータ一致',
    'all-nodes': 'その他のノード',
  } as Record<string, string>)[reason] ?? reason
}

export function candidateTierBadgeClass(tier: RankedNodeCandidate['tier']): string {
  return [
    'bg-emerald-950 text-emerald-200 ring-1 ring-emerald-700',
    'bg-emerald-950 text-emerald-200 ring-1 ring-emerald-700',
    'bg-sky-950 text-sky-200 ring-1 ring-sky-700',
    'bg-violet-950 text-violet-200 ring-1 ring-violet-700',
    'bg-zinc-800 text-zinc-200 ring-1 ring-zinc-600',
  ][tier]
}
