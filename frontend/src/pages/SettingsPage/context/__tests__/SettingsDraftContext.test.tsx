import { fireEvent, render, screen } from '@testing-library/react'
import { StrictMode } from 'react'
import { describe, expect, it } from 'vitest'
import {
  SettingsDraftProvider,
  useSettingsDraftRegistration,
  useSettingsDraftSnapshot,
  type SettingsDraftRisk,
} from '../SettingsDraftContext'

const clean: SettingsDraftRisk = { dirty: false, invalid: false, failed: false, queued: false, inFlight: false }

function DraftProbe({ resourceId }: { resourceId: string }) {
  const registration = useSettingsDraftRegistration(resourceId, {
    cancelQueued: () => {},
    discardLocal: () => {},
  })
  return (
    <>
      <button onClick={() => registration.update({ ...clean, dirty: true })}>dirty {resourceId}</button>
      <button onClick={() => registration.clear()}>clear {resourceId}</button>
    </>
  )
}

function Snapshot() {
  const snapshot = useSettingsDraftSnapshot()
  return <output data-testid="risk">{Object.values(snapshot.risk).map(String).join(':')}:{snapshot.entries.length}</output>
}

describe('SettingsDraftProvider', () => {
  it('[REQ-381/AC-7] aggregates registered draft risk without retaining values', () => {
    render(
      <StrictMode><SettingsDraftProvider>
        <DraftProbe resourceId="first" />
        <DraftProbe resourceId="second" />
        <Snapshot />
      </SettingsDraftProvider></StrictMode>,
    )

    expect(screen.getByTestId('risk').textContent).toBe('false:false:false:false:false:2')
    fireEvent.click(screen.getByText('dirty first'))
    expect(screen.getByTestId('risk').textContent).toBe('true:false:false:false:false:2')
    fireEvent.click(screen.getByText('clear first'))
    expect(screen.getByTestId('risk').textContent).toBe('false:false:false:false:false:2')
    fireEvent.click(screen.getByText('dirty first'))
    expect(screen.getByTestId('risk').textContent).toBe('true:false:false:false:false:2')
  })
})
