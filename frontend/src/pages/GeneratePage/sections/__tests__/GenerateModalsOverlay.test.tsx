import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { GenerateModalsOverlay } from '../GenerateModalsOverlay'

const renderOverlay = (message: string, setErrorToast = vi.fn()) => {
  render(
    <GenerateModalsOverlay
      state={{} as never}
      showCopyModal={false}
      setShowCopyModal={vi.fn()}
      newSetName=""
      setNewSetName={vi.fn()}
      copySourceId="default"
      setCopySourceId={vi.fn()}
      isBypassSettingsOpen={false}
      setIsBypassSettingsOpen={vi.fn()}
      isParamSyncSettingsOpen={false}
      setIsParamSyncSettingsOpen={vi.fn()}
      saveAsTagSetRole={null}
      setSaveAsTagSetRole={vi.fn()}
      errorToast={{ message, persistent: true }}
      setErrorToast={setErrorToast}
    />
  )
  return setErrorToast
}

describe('GenerateModalsOverlay error notification', () => {
  it('keeps long multiline reasons readable and renders HTML-like content as text', () => {
    const message = Array.from({ length: 24 }, (_, index) => `reason-${index + 1}: <img src=x onerror=alert(1)>`).join('\n')
    renderOverlay(message)

    const alert = screen.getByRole('alert')
    expect(alert.firstElementChild?.textContent).toBe(message)
    expect(alert.querySelector('img')).toBeNull()
    // ui-invariant-ignore: rule-no-raw-100vh reason: legacy baseline test assertion
    expect(alert).toHaveClass('w-[calc(100vw-2rem)]', 'max-w-xl', 'max-h-[calc(100vh-2rem)]', 'overflow-y-auto')
    expect(alert.firstElementChild).toHaveClass('whitespace-pre-wrap', 'break-words')
  })

  it('closes with the keyboard through its labeled native button', async () => {
    const user = userEvent.setup()
    const setErrorToast = renderOverlay('投入できませんでした')

    const closeButton = screen.getByRole('button', { name: '通知を閉じる' })
    closeButton.focus()
    await user.keyboard('{Enter}')

    expect(setErrorToast).toHaveBeenCalledWith(null)
  })

  it('closes when clicked', () => {
    const setErrorToast = renderOverlay('投入できませんでした')
    fireEvent.click(screen.getByRole('button', { name: '通知を閉じる' }))
    expect(setErrorToast).toHaveBeenCalledWith(null)
  })
})
