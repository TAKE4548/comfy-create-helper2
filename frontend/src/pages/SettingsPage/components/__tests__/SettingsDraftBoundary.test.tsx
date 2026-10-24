import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { createMemoryRouter, RouterProvider, useLocation, useNavigate } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { SettingsDraftBoundary } from '../SettingsDraftBoundary'
import { useSettingsDraftRegistration, type SettingsDraftRisk } from '../../context/SettingsDraftContext'

const clean: SettingsDraftRisk = { dirty: false, invalid: false, failed: false, queued: false, inFlight: false }

function SettingsProbe({ risk = { ...clean, dirty: true }, controls = { cancelQueued: () => {}, discardLocal: () => {} } }: {
  risk?: SettingsDraftRisk
  controls?: { cancelQueued: () => void; discardLocal: () => void }
}) {
  const navigate = useNavigate()
  const registration = useSettingsDraftRegistration('prompt', controls)
  const [draft, setDraft] = useState('original')
  return <>
    <output data-testid="draft">{draft}</output>
    <button onClick={() => { setDraft('changed'); registration.update(risk) }}>edit</button>
    <button onClick={() => registration.update(risk)}>set risk</button>
    <button onClick={() => { registration.update({ ...clean, dirty: true }); navigate('/other') }}>edit and leave same turn</button>
    <button onClick={() => navigate('/other')}>leave route</button>
    <button onClick={() => navigate('/other?latest=1', { replace: true })}>replace route</button>
    <button onClick={() => navigate(-1)}>back</button>
    <button onClick={() => navigate('/settings/?tab=advanced#vram')}>same settings</button>
    <button onClick={() => registration.update({ ...clean })}>save finished</button>
    <button onClick={() => registration.update({ ...clean, failed: true })}>save failed</button>
  </>
}

function OtherRoute() {
  const location = useLocation()
  return <div>other route {location.search}</div>
}

function renderRouter({ initialEntries = ['/settings'], risk, controls }: {
  initialEntries?: string[]
  risk?: SettingsDraftRisk
  controls?: { cancelQueued: () => void; discardLocal: () => void }
} = {}) {
  const router = createMemoryRouter([
    { path: '/settings', element: <SettingsDraftBoundary><SettingsProbe risk={risk} controls={controls} /></SettingsDraftBoundary> },
    { path: '/other', element: <OtherRoute /> },
  ], { initialEntries })
  return render(<RouterProvider router={router} />)
}

describe('SettingsDraftBoundary', () => {
  it('[REQ-381/AC-7] blocks a dirty route exit and Cancel preserves the current Settings screen', async () => {
    renderRouter()
    fireEvent.click(screen.getByText('edit'))
    fireEvent.click(screen.getByText('leave route'))

    expect(await screen.findByText('設定に未保存の変更があります')).toBeTruthy()
    fireEvent.click(screen.getByText('キャンセル'))
    await waitFor(() => expect(screen.queryByText('other route')).toBeNull())
    expect(screen.getByText('edit')).toBeTruthy()
    expect(screen.getByTestId('draft').textContent).toBe('changed')
  })

  it.each(['dirty', 'invalid', 'failed', 'queued', 'inFlight'] as const)('[REQ-381/AC-7] blocks when %s is set', async (flag) => {
    renderRouter({ risk: { ...clean, [flag]: true } })
    fireEvent.click(screen.getByText('set risk'))
    fireEvent.click(screen.getByText('leave route'))
    expect(await screen.findByText('設定に未保存の変更があります')).toBeTruthy()
  })

  it('[REQ-381/AC-7] allows same Settings hash/query navigation and clean exits', async () => {
    const { unmount } = renderRouter()
    fireEvent.click(screen.getByText('same settings'))
    expect(screen.queryByText('設定に未保存の変更があります')).toBeNull()
    unmount()
    renderRouter({ risk: clean })
    fireEvent.click(screen.getByText('leave route'))
    expect(await screen.findByText('other route')).toBeTruthy()
  })

  it.each(['save finished', 'save failed'])('[REQ-381/AC-7] keeps Leave disabled during persistence and does not auto-navigate after %s', async (settleAction) => {
    renderRouter({ risk: { ...clean, inFlight: true } })
    fireEvent.click(screen.getByText('set risk'))
    fireEvent.click(screen.getByText('leave route'))
    const leave = await screen.findByText('変更を破棄して移動') as HTMLButtonElement
    expect(leave.disabled).toBe(true)
    expect(screen.getByText('保存処理の完了を待っています')).toBeTruthy()
    fireEvent.click(screen.getByText(settleAction))
    await waitFor(() => expect(leave.disabled).toBe(false))
    expect(screen.queryByText('other route')).toBeNull()
    fireEvent.click(leave)
    expect(await screen.findByText('other route')).toBeTruthy()
  })

  it.each(['leave route', 'replace route', 'back'])('[REQ-381/AC-7] blocks %s navigation', async (action) => {
    renderRouter({ initialEntries: action === 'back' ? ['/other', '/settings'] : ['/settings'] })
    fireEvent.click(screen.getByText('edit'))
    fireEvent.click(screen.getByText(action))
    expect(await screen.findByText('設定に未保存の変更があります')).toBeTruthy()
  })

  it('[REQ-381/AC-7] blocks navigation when draft update and navigate happen in the same event', async () => {
    renderRouter()
    fireEvent.click(screen.getByText('edit and leave same turn'))
    expect(await screen.findByText('設定に未保存の変更があります')).toBeTruthy()
  })

  it('[REQ-381/AC-7] invokes queue cancellation and local discard once on explicit Leave', async () => {
    const controls = { cancelQueued: vi.fn(), discardLocal: vi.fn() }
    renderRouter({ risk: { ...clean, queued: true }, controls })
    fireEvent.click(screen.getByText('set risk'))
    fireEvent.click(screen.getByText('leave route'))
    fireEvent.click(await screen.findByText('変更を破棄して移動'))
    expect(await screen.findByText('other route')).toBeTruthy()
    expect(controls.cancelQueued).toHaveBeenCalledTimes(1)
    expect(controls.discardLocal).toHaveBeenCalledTimes(1)
  })

  it('[REQ-381/AC-7] registers beforeunload only while risky and removes it on unmount', () => {
    const { unmount } = renderRouter({ risk: { ...clean, dirty: true } })
    fireEvent.click(screen.getByText('set risk'))
    const activeEvent = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(activeEvent)
    expect(activeEvent.defaultPrevented).toBe(true)
    unmount()
    const removedEvent = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(removedEvent)
    expect(removedEvent.defaultPrevented).toBe(false)
  })

  it('[REQ-381/AC-7] treats a trailing-slash Settings route as protected', async () => {
    renderRouter({ initialEntries: ['/settings/'] })
    fireEvent.click(screen.getByText('edit'))
    fireEvent.click(screen.getByText('leave route'))
    expect(await screen.findByText('設定に未保存の変更があります')).toBeTruthy()
  })

  it('[REQ-381/AC-7] preserves the draft and uses the latest destination after repeated navigation', async () => {
    renderRouter()
    fireEvent.click(screen.getByText('edit'))
    fireEvent.click(screen.getByText('leave route'))
    expect(await screen.findByText('設定に未保存の変更があります')).toBeTruthy()
    fireEvent.click(screen.getByText('replace route'))
    expect(screen.getByTestId('draft').textContent).toBe('changed')
    fireEvent.click(screen.getByText('変更を破棄して移動'))
    expect(await screen.findByText('other route ?latest=1')).toBeTruthy()
  })
})
