import { useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { workflowsApi } from '../../api/domains/workflows'
import { mappingMastersApi } from '../../api/domains/mappingMasters'
import type {
  ScanPreviewRequest,
  ScanPreviewResponse,
  ScanPreviewVariantResult,
  ScanPreviewCandidate,
} from '../../api/types'
import { STAGE_LABELS } from './variantDraft'

export interface ScanPreviewPanelProps {
  /** 実行時点の下書きから要求を作る。null を返したら実行しない（例: 検証エラー）。 */
  buildRequest: (workflowId: number) => ScanPreviewRequest | null
  /** client_key -> 行の表示名（例: "Rough / steps_rough"） */
  rowLabels: Record<string, string>
  disabledReason?: string | null
}

const BTN = 'min-h-[44px] md:min-h-0 touch-manipulation'
const BADGE = 'shrink-0 whitespace-nowrap rounded px-1.5 py-0.5 text-[11px]'

function errorSummary(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  if (/API error 404/.test(msg)) return 'ワークフローが見つかりません'
  return msg
}

function CandidateText({ c }: { c: ScanPreviewCandidate }) {
  return (
    <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 min-w-0 text-xs">
      <span className="break-all min-w-0">ノードID: {c.node_id}</span>
      <span className="break-words min-w-0">{c.node_title}</span>
      <span className="break-all min-w-0">{c.class_type}</span>
      <span className="break-all min-w-0">{c.input_name}</span>
      <span className={`${BADGE} border border-gray-300`}>{STAGE_LABELS[c.stage_label]}</span>
    </span>
  )
}

function ResultBlock({ r, label }: { r: ScanPreviewVariantResult; label: string }) {
  return (
    <div
      data-testid={`scan-preview-result-${r.client_key}`}
      className="rounded border border-gray-200 p-2 space-y-1 min-w-0"
    >
      <div className="text-sm font-medium break-words min-w-0">{label}</div>
      {r.status === 'disabled' ? (
        <div className="text-xs text-gray-500">無効（判定対象外）</div>
      ) : (
        <>
          {r.confirmed && (
            <div className="text-xs space-y-0.5 min-w-0">
              <div className="font-medium">確定</div>
              <CandidateText c={r.confirmed} />
            </div>
          )}
          {r.status === 'duplicated' && (
            <div className="inline-block rounded bg-yellow-100 px-1.5 py-0.5 text-[11px] text-yellow-800 break-words">
              duplicated: 候補が複数あり確定できません
            </div>
          )}
          {r.status === 'not_found' && (
            <div className="inline-block rounded bg-red-100 px-1.5 py-0.5 text-[11px] text-red-800 break-words">
              not_found: 候補がありません
            </div>
          )}
          {r.candidates.length === 0 ? (
            <div className="text-xs text-gray-500">候補なし</div>
          ) : (
            <ul className="list-disc pl-4 space-y-0.5">
              {r.candidates.map((c, i) => (
                <li key={`${c.node_id}-${c.input_name}-${i}`} className="min-w-0">
                  <CandidateText c={c} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}

export function ScanPreviewPanel({ buildRequest, rowLabels, disabledReason }: ScanPreviewPanelProps) {
  const { data: workflows = [] } = useQuery({ queryKey: ['workflows'], queryFn: workflowsApi.list })
  const [workflowId, setWorkflowId] = useState<number | ''>('')
  const [result, setResult] = useState<ScanPreviewResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const seq = useRef(0)

  const selected: number | undefined = workflowId === '' ? workflows[0]?.id : workflowId
  const noWorkflows = workflows.length === 0

  const handleSelect = (v: string) => {
    seq.current += 1 // discard in-flight responses
    setWorkflowId(Number(v))
    setResult(null)
    setError(null)
    setRunning(false)
  }

  const run = async () => {
    if (selected === undefined) return
    const req = buildRequest(selected)
    if (!req) return
    const my = ++seq.current
    setRunning(true)
    setError(null)
    setResult(null)
    try {
      const res = await mappingMastersApi.scanPreview(req)
      if (my !== seq.current) return
      setResult(res)
    } catch (e) {
      if (my !== seq.current) return
      setError(errorSummary(e))
    } finally {
      if (my === seq.current) setRunning(false)
    }
  }

  return (
    <section className="space-y-2 min-w-0">
      <h3 className="text-sm font-semibold">判定プレビュー</h3>
      <p className="text-xs text-gray-600">保存前の内容で判定します。保存済みデータは変更しません。</p>
      <div className="flex flex-wrap items-center gap-2 min-w-0">
        <select
          aria-label="プレビュー対象ワークフロー"
          className={`${BTN} min-w-0 max-w-full rounded border border-gray-300 px-2 text-sm`}
          value={selected ?? ''}
          disabled={noWorkflows}
          onChange={(e) => handleSelect(e.target.value)}
        >
          {workflows.map((w) => (
            <option key={w.id} value={w.id}>{w.name}</option>
          ))}
        </select>
        <button
          type="button"
          className={`${BTN} shrink-0 whitespace-nowrap rounded border border-gray-300 px-3 text-sm disabled:opacity-50`}
          disabled={running || noWorkflows || !!disabledReason}
          onClick={run}
        >
          {running ? '判定中...' : 'プレビュー実行'}
        </button>
      </div>
      {noWorkflows && <div className="text-xs text-gray-500">登録済みワークフローがありません</div>}
      {disabledReason && <div className="text-xs text-gray-500 break-words">{disabledReason}</div>}
      {error && (
        <div role="alert" className="text-xs text-red-700 break-words">
          プレビューに失敗しました（{error}）
        </div>
      )}
      {result && (
        <div className="space-y-2">
          {result.results.map((r) => (
            <ResultBlock key={r.client_key} r={r} label={rowLabels[r.client_key] ?? r.role} />
          ))}
        </div>
      )}
    </section>
  )
}
