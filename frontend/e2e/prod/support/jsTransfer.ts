import type { BrowserContext, Page } from '@playwright/test'

export interface JsRequest {
  url: string
  encodedBytes: number
  partialBytes: number
  finished: boolean
}

export interface JsSnapshot {
  finishedBytes: number
  inFlightPartialBytes: number
  totalBytes: number
  requests: JsRequest[]
}

interface ResponseReceivedParams {
  requestId: string
  type?: string
  response: { url: string; mimeType?: string }
}
interface DataReceivedParams {
  requestId: string
  encodedDataLength: number
}
interface LoadingFinishedParams {
  requestId: string
  encodedDataLength: number
}
interface RequestWillBeSentParams {
  requestId: string
}
interface LoadingFailedParams {
  requestId: string
}

interface Tracked {
  url: string
  partial: number
  encoded: number
  finished: boolean
}

const JS_URL = /\.m?js(\?|$)/

export async function startJsTransferRecorder(
  context: BrowserContext,
  page: Page,
): Promise<{ snapshot(): JsSnapshot; lastActivityMs(): number }> {
  const session = await context.newCDPSession(page)
  await session.send('Network.enable')

  const tracked = new Map<string, Tracked>()
  let lastActivity = Date.now()

  session.on('Network.requestWillBeSent', (_p: RequestWillBeSentParams) => {
    lastActivity = Date.now()
  })

  session.on('Network.responseReceived', (p: ResponseReceivedParams) => {
    lastActivity = Date.now()
    const isScript = p.type === 'Script' || JS_URL.test(p.response.url)
    if (!isScript) return
    tracked.set(p.requestId, { url: p.response.url, partial: 0, encoded: 0, finished: false })
  })

  session.on('Network.dataReceived', (p: DataReceivedParams) => {
    lastActivity = Date.now()
    const t = tracked.get(p.requestId)
    if (t) t.partial += p.encodedDataLength
  })

  session.on('Network.loadingFinished', (p: LoadingFinishedParams) => {
    lastActivity = Date.now()
    const t = tracked.get(p.requestId)
    if (!t) return
    t.encoded = p.encodedDataLength
    t.finished = true
  })

  session.on('Network.loadingFailed', (_p: LoadingFailedParams) => {
    lastActivity = Date.now()
  })

  return {
    snapshot(): JsSnapshot {
      const requests: JsRequest[] = []
      let finishedBytes = 0
      let inFlightPartialBytes = 0
      for (const t of tracked.values()) {
        requests.push({
          url: t.url,
          encodedBytes: t.finished ? t.encoded : 0,
          partialBytes: t.partial,
          finished: t.finished,
        })
        if (t.finished) finishedBytes += t.encoded
        else inFlightPartialBytes += t.partial
      }
      return {
        finishedBytes,
        inFlightPartialBytes,
        totalBytes: finishedBytes + inFlightPartialBytes,
        requests,
      }
    },
    lastActivityMs(): number {
      return lastActivity
    },
  }
}
