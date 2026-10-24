import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ManagerActionOutcomeUnknownError, systemManagerApi } from '../../../api/domains/systemManager'
import type { ManagerServiceName, ManagedServiceName } from '../../../api/domains/systemManager'
import { useConfig } from '../../../hooks/useConfig'
import { useManagerStatus } from '../../../hooks/useManagerStatus'

type LogPanel = { open: boolean; loading: boolean; filename: string; content: string; message: string }
const emptyPanel: LogPanel = { open: false, loading: false, filename: '', content: '', message: '' }
const initialPanels = (): Record<ManagerServiceName, LogPanel> => ({ backend: emptyPanel, frontend: emptyPanel, comfy: emptyPanel, manager: emptyPanel })

function serviceLabel(service: string): string {
  const normalized = ({
    backend: 'backend', be: 'backend',
    frontend: 'frontend', fe: 'frontend',
    comfy: 'comfy', wsl: 'comfy',
    manager: 'manager', all: 'all',
  } as Record<string, string>)[service.toLowerCase()]
  return ({ backend: 'Backend', frontend: 'Frontend', comfy: 'ComfyUI', manager: 'Manager', all: '全体' } as Record<string, string>)[normalized] ?? service
}

export function ServiceConnectionCard(): React.JSX.Element {
  const queryClient = useQueryClient()
  const { data: config } = useConfig()
  const { status, available, refetch } = useManagerStatus()
  const [actionPending, setActionPending] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState('')
  const [logPanels, setLogPanels] = useState<Record<ManagerServiceName, LogPanel>>(initialPanels)
  const [confirmAction, setConfirmAction] = useState<{ action: 'stop' | 'restart'; service: ManagedServiceName } | null>(null)
  const busyRef = useRef(false)

  const managerAvailable = available && status !== null
  const busy = actionPending !== null || status?.action_in_progress != null
  const comfy = managerAvailable ? status.comfy : undefined
  const freeMemoryEnabled = Boolean(managerAvailable && !busy && !busyRef.current && comfy?.status === 'LISTEN' &&
    comfy.execution_state === 'idle' && comfy.queue_running === 0 && comfy.queue_pending === 0)
  const freeMemoryReason = !managerAvailable ? 'Manager状態を確認できません。' : busy ? '別のサービス操作中です。' :
    comfy?.status !== 'LISTEN' ? 'ComfyUIが停止中または状態不明です。' :
    comfy.execution_state === 'executing' ? 'ComfyUIで生成中です。' :
    comfy.execution_state === 'queued' || comfy.queue_running !== 0 || comfy.queue_pending !== 0 ? 'ComfyUIのキューが空ではありません。' :
    !freeMemoryEnabled ? 'ComfyUIの実行状態が不明です。' : ''

  const runFreeMemory = async (): Promise<void> => {
    if (!freeMemoryEnabled || busyRef.current) return
    busyRef.current = true
    setActionPending('comfy:free-memory')
    setActionMessage('解放要求を送信中')
    try {
      await systemManagerApi.freeMemory()
      setActionMessage('解放要求を受け付けました。空き容量は監視値で確認してください')
      await queryClient.invalidateQueries({ queryKey: ['settings-vram'] })
    } catch (error) {
      setActionMessage(error instanceof ManagerActionOutcomeUnknownError
        ? '解放要求の結果を確認できません。状態を再取得します。操作は再送しません。'
        : `解放要求に失敗しました: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      try {
        await refetch()
        await refetch()
      } finally {
        busyRef.current = false
        setActionPending(null)
      }
    }
  }

  const runAction = async (action: 'start' | 'stop' | 'restart', service: ManagedServiceName): Promise<void> => {
    if (!managerAvailable || busyRef.current || busy) return
    busyRef.current = true
    const key = `${service}:${action}`
    setActionPending(key)
    setActionMessage(`${service === 'backend' ? 'Backend' : 'ComfyUI'} の ${action} をManagerに要求中です。`)
    try {
      const result = await systemManagerApi.action(action, service)
      setActionMessage(`${service === 'backend' ? 'Backend' : 'ComfyUI'} の ${action} 要求を受け付けました。状態を再確認しています。`)
      await refetch()
      if (result.output) {
        setActionMessage((message) => `${message} ${String(result.output)}`)
      }
    } catch (error) {
      if (error instanceof ManagerActionOutcomeUnknownError) {
        setActionMessage(`${service === 'backend' ? 'Backend' : 'ComfyUI'} の ${action} 要求結果未確認です。Manager状態を再取得します。操作は再送しません。`)
      } else {
        setActionMessage(`操作に失敗しました: ${error instanceof Error ? error.message : String(error)}`)
      }
      await refetch()
    } finally {
      busyRef.current = false
      setActionPending(null)
    }
  }

  const patchPanel = (service: ManagerServiceName, patch: Partial<LogPanel>): void => {
    setLogPanels((panels) => ({ ...panels, [service]: { ...panels[service], ...patch } }))
  }

  const loadLogs = async (service: ManagerServiceName): Promise<void> => {
    patchPanel(service, { loading: true, message: 'ログを取得中…' })
    try {
      const logs = await systemManagerApi.logs(service, 200)
      patchPanel(service, {
        loading: false,
        filename: logs.filename,
        content: logs.content || (Array.isArray(logs.lines) ? logs.lines.join('\n') : ''),
        message: logs.exists ? '' : 'ログファイルがありません。',
      })
    } catch (error) {
      patchPanel(service, {
        loading: false,
        filename: '',
        content: '',
        message: `ログを取得できませんでした: ${error instanceof Error ? error.message : String(error)}`,
      })
    }
  }

  const toggleLog = (service: ManagerServiceName): void => {
    const opening = !logPanels[service].open
    patchPanel(service, { open: opening })
    if (opening) void loadLogs(service)
  }

  const emergencyUrl = `http://${window.location.hostname}:8899`
  const processStatus = (running: boolean | undefined, label: string): string => `${label}: ${running === undefined ? '不明' : running ? '稼働中' : '停止中'}`

  const serviceRows: { service: ManagerServiceName; ariaLabel: string; label: string; text: string; running: boolean | undefined }[] = [
    { service: 'manager', ariaLabel: 'Supervisor', label: 'Supervisor', text: managerAvailable ? '接続中' : '不明', running: managerAvailable ? true : undefined },
    { service: 'backend', ariaLabel: 'Windows Backend', label: 'Windows Backend', text: processStatus(managerAvailable ? status.be?.running : undefined, 'Backend'), running: managerAvailable ? status.be?.running : undefined },
    { service: 'comfy', ariaLabel: 'ComfyUI', label: 'ComfyUI', text: processStatus(managerAvailable ? status.comfy?.running : undefined, 'ComfyUI'), running: managerAvailable ? status.comfy?.running : undefined },
    { service: 'frontend', ariaLabel: 'Frontend', label: 'Frontend', text: processStatus(managerAvailable ? status.fe?.running : undefined, 'Frontend'), running: managerAvailable ? status.fe?.running : undefined },
  ]

  return (
    <section aria-labelledby="service-connections-title" className="space-y-4 rounded-lg border border-[rgba(255,255,255,0.06)] bg-surface p-4 text-zinc-200">
      <h2 id="service-connections-title" className="text-lg font-semibold text-zinc-100">サービス管理</h2>
      <ul className="space-y-2" aria-label="サービス状態">
        {serviceRows.map(({ service, ariaLabel, label, text, running }) => {
          const panel = logPanels[service]
          const lamp = running === undefined ? 'bg-zinc-500' : running ? 'bg-emerald-400' : 'bg-rose-400'
          const lampState = running === undefined ? '不明' : running ? '稼働中' : '停止中'
          return (
            <li key={service} aria-label={ariaLabel} className="rounded-lg border border-[rgba(255,255,255,0.08)] bg-surface-2 p-3">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 md:flex md:gap-2">
                <span role="img" aria-label={`死活: ${lampState}`} className={`row-start-1 col-start-1 h-2.5 w-2.5 shrink-0 rounded-full ${lamp}`} />
                <span className="col-start-2 row-start-1 min-w-0 break-words text-sm md:flex-1 md:truncate" title={ariaLabel}>{ariaLabel}</span>
                <span className="col-start-2 row-start-2 min-w-0 break-words text-xs text-zinc-300 md:shrink-0 md:whitespace-nowrap">{text}</span>
                <button type="button" aria-expanded={panel.open} aria-controls={`service-log-${service}`} disabled={!managerAvailable} onClick={() => toggleLog(service)} className="col-span-2 row-start-3 min-h-[44px] min-w-[44px] w-full touch-manipulation whitespace-nowrap rounded-md px-2 text-xs text-zinc-200 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50 md:col-auto md:ml-auto md:w-auto">ログ {panel.open ? '▲' : '▼'}</button>
              </div>
              {panel.open && (
                <div id={`service-log-${service}`} role="region" aria-label={`${label} のログ`} className="mt-2 space-y-2">
                  <div className="flex items-center gap-2">
                    {panel.filename && <p className="min-w-0 flex-1 break-all text-xs text-zinc-400">{panel.filename}</p>}
                    <button type="button" aria-label={`${label} のログを再取得`} onClick={() => void loadLogs(service)} disabled={!managerAvailable || panel.loading} className="relative min-h-11 min-w-11 touch-manipulation rounded-md px-2 text-xs text-zinc-200 before:absolute before:-inset-2 before:content-[''] hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50">{panel.loading ? '取得中…' : '再取得'}</button>
                  </div>
                  {!managerAvailable ? <p role="status" className="break-words text-sm text-zinc-300">ログ表示は利用できません。</p> : panel.message && <p role="status" className="break-words text-sm text-zinc-300">{panel.message}</p>}
                  <pre aria-label={`${label} のログ内容`} className="max-h-64 overflow-auto overscroll-contain whitespace-pre-wrap break-words rounded-md bg-black/30 p-3 text-xs text-zinc-300">{panel.content || 'ログは未取得です。'}</pre>
                </div>
              )}
            </li>
          )
        })}
      </ul>
      <div className="space-y-1 text-sm text-zinc-300" aria-live="polite">
        {status?.action_in_progress && <p role="status">{serviceLabel(status.action_in_progress.service)} の {status.action_in_progress.action} を実行中です。</p>}
      </div>

      {!managerAvailable && <p role="status" className="text-sm text-amber-300">Managerに接続できません。8899が復旧すると操作とログを利用できます。</p>}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap" aria-label="サービス操作">
        <button type="button" onClick={() => void runAction('start', 'comfy')} disabled={!managerAvailable || busy} className="min-h-[44px] rounded-md bg-green-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-green-400 disabled:cursor-not-allowed disabled:opacity-50">ComfyUIを起動</button>
        <button type="button" onClick={() => setConfirmAction({ action: 'stop', service: 'comfy' })} disabled={!managerAvailable || busy} className="min-h-[44px] rounded-md border border-[rgba(255,255,255,0.12)] px-4 py-2 text-sm hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50">ComfyUIを停止</button>
        <button type="button" onClick={() => setConfirmAction({ action: 'restart', service: 'comfy' })} disabled={!managerAvailable || busy} className="min-h-[44px] rounded-md border border-[rgba(255,255,255,0.12)] px-4 py-2 text-sm hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50">ComfyUIを再起動</button>
        <button type="button" onClick={() => setConfirmAction({ action: 'restart', service: 'backend' })} disabled={!managerAvailable || busy} className="min-h-[44px] rounded-md border border-[rgba(255,255,255,0.12)] px-4 py-2 text-sm hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50">Backendを再起動</button>
        <button type="button" onClick={() => void runFreeMemory()} disabled={!freeMemoryEnabled} className="min-h-[44px] touch-manipulation rounded-md border border-[rgba(255,255,255,0.12)] px-4 py-2 text-sm hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50">ComfyUIのメモリ解放</button>
      </div>
      {!freeMemoryEnabled && <p className="break-words text-sm text-zinc-400">{freeMemoryReason}</p>}
      {confirmAction && <div role="alertdialog" aria-label="サービス操作の確認" className="space-y-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm"><p>{serviceLabel(confirmAction.service)}を{confirmAction.action === 'stop' ? '停止' : '再起動'}します。対象サービスを一時的に利用できなくなります。</p><div className="flex gap-2"><button type="button" onClick={() => setConfirmAction(null)} className="min-h-[44px] rounded px-3">キャンセル</button><button type="button" onClick={() => { const pending = confirmAction; setConfirmAction(null); void runAction(pending.action, pending.service) }} disabled={!managerAvailable || busy} className="min-h-[44px] rounded bg-amber-500/20 px-3">確認して実行</button></div></div>}
      <p role="status" aria-live="polite" className="text-sm text-zinc-200">{actionMessage}</p>
      <p className="text-sm text-zinc-400">Backend再起動中はポート8000の復帰を待ち、復帰後にこのページを手動で再読み込みしてください。復帰中も読み込み済みの画面を保ったまま、<a className="underline" href={emergencyUrl} target="_blank" rel="noreferrer">Managerの緊急画面（8899）</a>を利用できます。</p>

      <div className="space-y-2 border-t border-[rgba(255,255,255,0.06)] pt-4">
        <p className="text-sm font-medium text-zinc-200">接続先</p>
        <p className="text-sm text-zinc-300">ComfyUI URL（Backend設定）: <code className="break-all">{config?.comfy_url ?? '読み込み中…'}</code></p>
        <p className="text-sm text-zinc-400">ComfyUI接続先はBackend設定で管理されます。この画面からは変更できません。</p>
      </div>
    </section>
  )
}
