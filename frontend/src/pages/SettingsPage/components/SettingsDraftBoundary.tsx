import { useCallback, useRef } from 'react'
import { useBlocker, useBeforeUnload } from 'react-router-dom'
import type { BlockerFunction } from 'react-router'
import { Modal } from '../../../components/common/Modal'
import { SettingsDraftProvider, useLatestSettingsDraftSnapshot, useSettingsDraftSnapshot } from '../context/SettingsDraftContext'

function SettingsDraftGuard({ children }: { children: React.ReactNode }): React.JSX.Element {
  const snapshot = useSettingsDraftSnapshot()
  const getLatestSnapshot = useLatestSettingsDraftSnapshot()
  const normalizePath = useCallback((pathname: string) => pathname.toLowerCase().replace(/\/+$/, ''), [])
  const isSettingsPath = useCallback((pathname: string) => normalizePath(pathname) === '/settings', [normalizePath])
  const shouldBlock = useCallback<BlockerFunction>(({ currentLocation, nextLocation }) =>
    isSettingsPath(currentLocation.pathname) && normalizePath(nextLocation.pathname) !== normalizePath(currentLocation.pathname) &&
      Object.values(getLatestSnapshot().risk).some(Boolean),
  [getLatestSnapshot, isSettingsPath, normalizePath])
  const blocker = useBlocker(shouldBlock)
  const leavingRef = useRef(false)

  useBeforeUnload(useCallback((event) => {
    if (!Object.values(getLatestSnapshot().risk).some(Boolean)) return
    event.preventDefault()
    event.returnValue = ''
  }, [getLatestSnapshot]))

  const handleLeave = () => {
    if (leavingRef.current || blocker.state !== 'blocked') return
    const latest = getLatestSnapshot()
    if (latest.risk.inFlight) return
    leavingRef.current = true
    for (const entry of latest.entries) entry.controls.cancelQueued()
    for (const entry of latest.entries) entry.controls.discardLocal()
    blocker.proceed()
  }
  const handleCancel = () => {
    leavingRef.current = false
    if (blocker.state === 'blocked') blocker.reset()
  }

  return <>
    {children}
    <Modal
      isOpen={blocker.state === 'blocked'}
      onClose={handleCancel}
      ariaLabel="未保存の設定"
    >
      <div className="space-y-4 p-4">
        <p>設定に未保存の変更があります</p>
        {snapshot.risk.inFlight && <p>保存処理の完了を待っています</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={handleCancel}>キャンセル</button>
          <button type="button" onClick={handleLeave} disabled={snapshot.risk.inFlight || leavingRef.current}>
            変更を破棄して移動
          </button>
        </div>
      </div>
    </Modal>
  </>
}

export function SettingsDraftBoundary({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <SettingsDraftProvider><SettingsDraftGuard>{children}</SettingsDraftGuard></SettingsDraftProvider>
}
