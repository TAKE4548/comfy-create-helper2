import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { server } from './mocks/server'
import { http, HttpResponse } from 'msw'

describe('MSW Setup & Mock Injection (AC-4)', () => {
  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'error' })
  })

  afterEach(() => {
    server.resetHandlers()
  })

  afterAll(() => {
    server.close()
  })

  it('should intercept API request and return mocked base models', async () => {
    const res = await fetch('/api/base-models')
    expect(res.ok).toBe(true)
    const data = await res.json()
    expect(data).toHaveLength(3)
    expect(data[0].name).toBe('SD 1.5')
  })

  it('should allow runtime handler override', async () => {
    server.use(
      http.get('/api/base-models', () => {
        return HttpResponse.json([{ id: 99, name: 'Custom Overridden Model', key: 'custom' }])
      })
    )

    const res = await fetch('/api/base-models')
    expect(res.ok).toBe(true)
    const data = await res.json()
    expect(data).toHaveLength(1)
    expect(data[0].name).toBe('Custom Overridden Model')
  })
})
