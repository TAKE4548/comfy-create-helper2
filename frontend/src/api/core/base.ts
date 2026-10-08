export const BASE_URL = '/api'

export async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = { ...options.headers as Record<string, string>}
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
  }
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  })
  if (!res.ok) {
    const text = typeof res.text === 'function' ? await res.text() : ''
    throw new Error(`API error ${res.status}: ${text}`)
  }
  if (res.status === 204) return undefined as T
  if (typeof res.text === 'function') {
    const text = await res.text()
    if (!text || text.trim() === '') return undefined as T
    return JSON.parse(text)
  }
  if (typeof res.json === 'function') {
    return res.json()
  }
  return undefined as T
}
