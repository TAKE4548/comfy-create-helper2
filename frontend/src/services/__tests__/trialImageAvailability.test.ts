import { describe, expect, it, vi } from 'vitest'
import { createTrialAvailabilityController } from '../trialImageAvailability'

const url = (filename: string, extra = '') => `/view?filename=${filename}${extra}`
const present = { availability: 'present' as const }
const missing = { availability: 'missing' as const }
const unknown = { availability: 'unknown' as const }

describe('trial image availability controller', () => {
  it('extracts only view identity fields and rejects invalid URLs', () => {
    const c = createTrialAvailabilityController(vi.fn().mockResolvedValue(present))
    expect(c.getIdentity('/view?filename=a&host=secret&t=preview')).toEqual({ key: '["a","","output"]', request: { filename: 'a', subfolder: '', type: 'output' } })
    expect(c.getIdentity('/view?filename=a&subfolder=nested&type=input&t=old')).toEqual(
      c.getIdentity(`${window.location.origin}/api/comfy/view?filename=a&subfolder=nested&type=input&t=new&host=ignored`)
    )
    expect(c.getIdentity('/view?filename=%20%20')).toBeNull()
    expect(c.getIdentity('/other?filename=a')).toBeNull()
    expect(c.getIdentity('/api/comfy/other?filename=a')).toBeNull()
    expect(c.getIdentity('/view')).toBeNull()
    expect(c.getIdentity('https://elsewhere.test/view?filename=a')).toBeNull()
    expect(c.check('/view')).resolves.toBe('unknown')
    c.dispose()
  })

  it('shares a probe across same-origin /view and /api/comfy/view identities', async () => {
    const probe = vi.fn().mockResolvedValue(present)
    const c = createTrialAvailabilityController(probe)
    const view = '/view?filename=shared&subfolder=nested&type=input&t=old'
    const apiView = `${window.location.origin}/api/comfy/view?filename=shared&subfolder=nested&type=input&t=new&host=ignored`

    expect(c.getIdentity(view)).toEqual(c.getIdentity(apiView))
    await Promise.all([c.check(view), c.check(apiView)])

    expect(probe).toHaveBeenCalledTimes(1)
    expect(probe).toHaveBeenCalledWith({ filename: 'shared', subfolder: 'nested', type: 'input' })
    c.dispose()
  })

  it('shares identity requests, limits concurrency to two, and releases owners', async () => {
    let active = 0; let maximum = 0
    const probe = vi.fn(async () => {
      active++; maximum = Math.max(maximum, active)
      await new Promise(resolve => setTimeout(resolve, 0))
      active--; return present
    })
    const c = createTrialAvailabilityController(probe), owner = {}
    c.observe(url('a'), owner); void c.check(url('a&host=ignored'))
    c.releaseOwner(owner); c.observe(url('a'), owner)
    await Promise.all([c.check(url('a')), c.check(url('b')), c.check(url('c'))])
    expect(probe).toHaveBeenCalledTimes(3); expect(maximum).toBeLessThanOrEqual(2)
    expect(c.getIdentity(url('a')).key).not.toBe(c.getIdentity(url('b')).key)
    c.releaseOwner(owner); c.refreshVisible(); expect(probe).toHaveBeenCalledTimes(3)
    c.observe(url('a'), owner); c.refreshVisible(); await c.check(url('a'))
    expect(probe).toHaveBeenCalledTimes(4); c.dispose()
  })

  it('retries unknown only on request and never retries missing', async () => {
    const probe = vi.fn().mockResolvedValueOnce(unknown).mockResolvedValueOnce(present).mockResolvedValue(missing)
    const c = createTrialAvailabilityController(probe)
    expect(await c.check(url('a'))).toBe('unknown')
    expect(await c.check(url('a'))).toBe('unknown'); expect(probe).toHaveBeenCalledTimes(1)
    expect(await c.check(url('a'), { retry: true })).toBe('present')
    expect(await c.check(url('b'))).toBe('missing')
    expect(await c.check(url('b'), { retry: true })).toBe('missing')
    expect(probe).toHaveBeenCalledTimes(3); c.dispose()
  })

  it('adopts BE results and keeps adopted missing through late present', async () => {
    const probe = vi.fn().mockResolvedValue(present), c = createTrialAvailabilityController(probe)
    c.adopt(url('a'), 'present'); c.observe(url('a'), {})
    expect(await c.check(url('a'))).toBe('present'); expect(probe).not.toHaveBeenCalled()
    c.adopt(url('b'), 'missing'); c.adopt(url('b'), 'present'); c.observe(url('b'), {})
    expect(await c.check(url('b', '&cache=1'))).toBe('missing'); expect(probe).not.toHaveBeenCalled()
    c.dispose()
  })

  it('settles queued work as unknown on dispose and stops notifications', async () => {
    const releases: Array<(value: typeof present) => void> = []
    const probe = vi.fn(() => new Promise<typeof present>(resolve => { releases.push(resolve) }))
    const c = createTrialAvailabilityController(probe), listener = vi.fn()
    c.subscribe(listener)
    const first = c.check(url('a')), second = c.check(url('b')), queued = c.check(url('c'))
    const beforeDispose = listener.mock.calls.length
    c.dispose()
    await expect(queued).resolves.toBe('unknown')
    releases.forEach(resolve => resolve(present)); await Promise.all([first, second])
    expect(listener).toHaveBeenCalledTimes(beforeDispose)
  })
})
