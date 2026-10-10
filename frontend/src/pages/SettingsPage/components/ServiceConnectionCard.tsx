import { useEffect, useState } from 'react'
import { ManagerActionOutcomeUnknownError, systemManagerApi } from '../../../api/domains/systemManager'
import type { ManagerServiceName, ManagedServiceName } from '../../../api/domains/systemManager'
import { useConfig } from '../../../hooks/useConfig'
import { useManagerStatus } from '../../../hooks/useManagerStatus'

const LOG_SERVICES: ManagerServiceName[] = ['backend', 'frontend', 'comfy', 'manager']

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
  const { data: config } = useConfig()
  const { status, available, refetch } = useManagerStatus()
  const [actionPending, setActionPending] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState('')
  const [logService, setLogService] = useState<ManagerServiceName>('backend')
  const [logContent, setLogContent] = useState('')
  const [logFilename, setLogFilename] = useState('')
  const [logMessage, setLogMessage] = useState('')
  const [loadingLogs, setLoadingLogs] = useState(false)

  const managerAvailable = available && status !== null
  const busy = actionPending !== null || status?.action_in_progress != null

  useEffect(() => {
    if (!managerAvailable) {
      setLogContent('')
      setLogFilename('')
      setLogMessage('ログ表示は利用できません。')
    }
  }, [managerAvailable])

  const runAction = async (action: 'start' | 'stop' | 'restart', service: ManagedServiceName): Promise<void> => {
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
      setActionPending(null)
    }
  }

  const loadLogs = async (service: ManagerServiceName): Promise<void> => {
    setLoadingLogs(true)
    setLogMessage('ログを取得中…')
    try {
      const logs = await systemManagerApi.logs(service, 200)
      setLogFilename(logs.filename)
      setLogContent(logs.content || logs.lines.join('\n'))
      setLogMessage(logs.exists ? '' : 'ログファイルがありません。')
    } catch (error) {
      setLogFilename('')
      setLogContent('')
      setLogMessage(`ログを取得できませんでした: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setLoadingLogs(false)
    }
  }

  const emergencyUrl = `http://${window.location.hostname}:8899`
  const processStatus = (running: boolean, label: string): string => `${label}: ${running ? '稼働中' : '停止中'}`

  return (
    <section aria-labelledby="service-connections-title" className="space-y-4 rounded-lg border border-[rgba(255,255,255,0.06)] bg-surface p-4 text-zinc-200">
      <h2 id="service-connections-title" className="text-lg font-semibold text-zinc-100">サービス管理</h2>
      <div className="space-y-1 text-sm text-zinc-300" aria-live="polite">
        <p>{managerAvailable ? processStatus(status.fe.running, 'Frontend') : 'Frontend: Manager状態を取得できません'}</p>
        <p>{managerAvailable ? processStatus(status.be.running, 'Backend') : 'Backend: Manager状態を取得できません'}</p>
        <p>{managerAvailable ? processStatus(status.comfy.running, 'ComfyUI') : 'ComfyUI: Manager状態を取得できません'}</p>
        {status?.action_in_progress && <p role="status">{serviceLabel(status.action_in_progress.service)} の {status.action_in_progress.action} を実行中です。</p>}
      </div>

      {!managerAvailable && <p role="status" className="text-sm text-amber-300">Managerに接続できません。8899が復旧すると操作とログを利用できます。</p>}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap" aria-label="サービス操作">
        <button type="button" onClick={() => void runAction('start', 'comfy')} disabled={!managerAvailable || busy} className="min-h-[44px] rounded-md bg-green-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-green-400 disabled:cursor-not-allowed disabled:opacity-50">ComfyUIを起動</button>
        <button type="button" onClick={() => void runAction('stop', 'comfy')} disabled={!managerAvailable || busy} className="min-h-[44px] rounded-md border border-[rgba(255,255,255,0.12)] px-4 py-2 text-sm hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50">ComfyUIを停止</button>
        <button type="button" onClick={() => void runAction('restart', 'comfy')} disabled={!managerAvailable || busy} className="min-h-[44px] rounded-md border border-[rgba(255,255,255,0.12)] px-4 py-2 text-sm hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50">ComfyUIを再起動</button>
        <button type="button" onClick={() => void runAction('restart', 'backend')} disabled={!managerAvailable || busy} className="min-h-[44px] rounded-md border border-[rgba(255,255,255,0.12)] px-4 py-2 text-sm hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50">Backendを再起動</button>
      </div>
      <p role="status" aria-live="polite" className="text-sm text-zinc-200">{actionMessage}</p>
      <p className="text-sm text-zinc-400">Backend再起動中はポート8000の復帰を待ち、復帰後にこのページを手動で再読み込みしてください。復帰中も読み込み済みの画面を保ったまま、<a className="underline" href={emergencyUrl} target="_blank" rel="noreferrer">Managerの緊急画面（8899）</a>を利用できます。</p>

      <div className="space-y-2 border-t border-[rgba(255,255,255,0.06)] pt-4">
        <p className="text-sm font-medium text-zinc-200">接続先</p>
        <p className="text-sm text-zinc-300">ComfyUI URL（Backend設定）: <code className="break-all">{config?.comfy_url ?? '読み込み中…'}</code></p>
        <p className="text-sm text-zinc-400">ComfyUI接続先はBackend設定で管理されます。この画面からは変更できません。</p>
      </div>

      <div className="space-y-3 border-t border-[rgba(255,255,255,0.06)] pt-4">
        <label htmlFor="manager-log-service" className="block text-sm font-medium text-zinc-200">サービスログ</label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <select id="manager-log-service" value={logService} onChange={(event) => setLogService(event.target.value as ManagerServiceName)} disabled={!managerAvailable || loadingLogs} className="min-h-[44px] flex-1 rounded-md border border-[rgba(255,255,255,0.1)] bg-surface-2 px-3 py-2 text-sm disabled:opacity-50">
            {LOG_SERVICES.map((service) => <option key={service} value={service}>{serviceLabel(service)}</option>)}
          </select>
          <button type="button" onClick={() => void loadLogs(logService)} disabled={!managerAvailable || loadingLogs} className="min-h-[44px] rounded-md border border-[rgba(255,255,255,0.12)] px-4 py-2 text-sm hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50">{loadingLogs ? '取得中…' : '最新ログを表示'}</button>
        </div>
        {logFilename && <p className="break-all text-xs text-zinc-400">{logFilename}</p>}
        {logMessage && <p role="status" className="text-sm text-zinc-300">{logMessage}</p>}
        <pre aria-label="サービスログ内容" className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md bg-black/30 p-3 text-xs text-zinc-300">{logContent || 'ログは未取得です。'}</pre>
      </div>
    </section>
  )
}
