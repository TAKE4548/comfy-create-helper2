/**
 * Date/time formatting utilities for Prompt Surgeon.
 */

/**
 * Format an ISO date string as `YYYY/MM/DD HH:mm:ss`.
 */
export function formatDateTime(dateStr: string): string {
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return dateStr
    const pad = (num: number) => String(num).padStart(2, '0')
    return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  } catch {
    return dateStr
  }
}

/**
 * Extract the first ~25 characters of the first positive prompt value
 * from a params record, for use as a display label.
 */
export function getPromptPrefix(params?: Record<string, any>): string {
  if (!params) return ''
  const posKey = Object.keys(params).find((key) => {
    const k = key.toLowerCase()
    return (k.includes('positive') || k.includes('prompt')) && !k.includes('negative')
  })
  if (!posKey) return ''
  const promptVal = String(params[posKey] || '')
  if (promptVal.length <= 25) return promptVal
  return promptVal.slice(0, 25) + '...'
}
