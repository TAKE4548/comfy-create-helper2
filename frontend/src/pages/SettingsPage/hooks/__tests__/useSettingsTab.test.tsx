import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BrowserRouter } from 'react-router-dom'
import { LS_KEYS } from '../../../../utils/localStorageKeys'
import { SettingsTabId, useSettingsTab } from '../useSettingsTab'

function Harness() {
  const { activeTab, selectTab } = useSettingsTab()
  return (
    <>
      <output data-testid="active">{activeTab}</output>
      {(['workflows', 'prompt', 'dialogue', 'translation', 'system'] as SettingsTabId[]).map((tab) => (
        <button key={tab} onClick={() => selectTab(tab)}>{tab}</button>
      ))}
    </>
  )
}

function mountAt(hash = '', search = '') {
  window.history.replaceState({}, '', `/settings${search}${hash}`)
  return render(<BrowserRouter><Harness /></BrowserRouter>)
}

afterEach(() => {
  window.localStorage.clear()
  vi.restoreAllMocks()
})

describe('useSettingsTab', () => {
  it.each(['workflows', 'prompt', 'dialogue', 'translation', 'system'] as const)(
    'uses a valid initial hash: #%s', async (tab) => {
      mountAt(`#${tab}`, '?mode=advanced')
      await waitFor(() => expect(screen.getByTestId('active').textContent).toBe(tab))
      expect(window.location.hash).toBe(`#${tab}`)
      expect(window.location.search).toBe('?mode=advanced')
      expect(window.localStorage.getItem(LS_KEYS.SETTINGS_ACTIVE_TAB)).toBe(tab)
    },
  )

  it('prefers the hash over saved state and normalizes an invalid hash', async () => {
    window.localStorage.setItem(LS_KEYS.SETTINGS_ACTIVE_TAB, 'prompt')
    mountAt('#unknown', '?keep=1')
    await waitFor(() => expect(window.location.hash).toBe('#prompt'))
    expect(window.location.search).toBe('?keep=1')
    expect(screen.getByTestId('active').textContent).toBe('prompt')
  })

  it('uses saved state for an empty initial hash', async () => {
    window.localStorage.setItem(LS_KEYS.SETTINGS_ACTIVE_TAB, 'system')
    mountAt()
    await waitFor(() => expect(window.location.hash).toBe('#system'))
    expect(screen.getByTestId('active').textContent).toBe('system')
  })

  it('defaults to workflows when the initial hash and saved value are invalid', async () => {
    window.localStorage.setItem(LS_KEYS.SETTINGS_ACTIVE_TAB, 'not-a-tab')
    mountAt()
    await waitFor(() => expect(window.location.hash).toBe('#workflows'))
    expect(screen.getByTestId('active').textContent).toBe('workflows')
  })

  it('pushes different selections, avoids duplicate selection, and retains search', async () => {
    mountAt('#workflows', '?x=1')
    await waitFor(() => expect(screen.getByTestId('active').textContent).toBe('workflows'))
    const initialLength = window.history.length
    fireEvent.click(screen.getByRole('button', { name: 'workflows' }))
    expect(window.history.length).toBe(initialLength)
    fireEvent.click(screen.getByRole('button', { name: 'prompt' }))
    await waitFor(() => expect(window.location.hash).toBe('#prompt'))
    expect(window.location.search).toBe('?x=1')
    window.history.back()
    await waitFor(() => expect(window.location.hash).toBe('#workflows'))
    expect(window.localStorage.getItem(LS_KEYS.SETTINGS_ACTIVE_TAB)).toBe('workflows')
  })

  it('keeps URL behavior working when localStorage throws', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('blocked', 'SecurityError') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('blocked', 'SecurityError') })
    mountAt('#dialogue')
    await waitFor(() => expect(screen.getByTestId('active').textContent).toBe('dialogue'))
    fireEvent.click(screen.getByRole('button', { name: 'translation' }))
    await waitFor(() => expect(window.location.hash).toBe('#translation'))
  })

  it('replaces an empty hash after initial navigation with workflows', async () => {
    mountAt('#system')
    await waitFor(() => expect(screen.getByTestId('active').textContent).toBe('system'))
    act(() => {
      window.history.replaceState({}, '', '/settings?keep=2')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    await waitFor(() => expect(window.location.hash).toBe('#workflows'))
    expect(window.location.search).toBe('?keep=2')
  })
})
