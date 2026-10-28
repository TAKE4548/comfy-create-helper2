import fs from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'

// Before/after comparison of the initial JS transfer (REQ-309 AC-1).
// Reads the T0 measurement artifacts for baseline and candidate; no browser needed.
const LOG_DIR = path.resolve(process.cwd(), process.env.REQ309_LOG_DIR ?? '../docs/logs/REQ-309')
const CAND = path.join(LOG_DIR, 'candidate')
const VIEWPORTS = ['desktop', 'mobile'] as const

interface JsRequest {
  url: string
  encodedBytes: number
  partialBytes: number
  finished: boolean
}
interface Snapshot {
  finishedBytes: number
  inFlightPartialBytes: number
  totalBytes: number
  requests: JsRequest[]
}
interface Measure {
  label: string
  viewport: string
  viewportSize: { width: number; height: number }
  runs: Array<{ atEditable: Snapshot; settled: Snapshot; editableMs: number; quietReached: boolean; pageErrors: string[] }>
  medianEditableTotal: number
  medianSettledTotal: number
  env: { chromium: string; serverSha256: string }
}

const read = (file: string): Measure => JSON.parse(fs.readFileSync(file, 'utf8'))

/** Vite display values (e.g. "1,780.43 kB") parsed from the candidate build log, keyed by asset file name. */
function viteDisplayValues(): Map<string, string> {
  const log = fs.readFileSync(path.join(CAND, 'build.log'), 'utf8')
  const map = new Map<string, string>()
  for (const m of log.matchAll(/assets\/([^\s]+\.js)\s+([\d,.]+ kB)/g)) map.set(m[1], m[2])
  return map
}

function fileBytes(rel: string): number | null {
  const p = path.join(CAND, 'dist', rel)
  return fs.existsSync(p) ? fs.statSync(p).size : null
}

for (const vp of VIEWPORTS) {
  test(`[REQ-309/AC-1] compare-before-after-${vp}`, {
    annotation: [
      { type: 'ac', description: 'REQ-309/AC-1' },
      { type: 'layer', description: 'e2e' },
      { type: 'caseId', description: `compare-before-after-${vp}` },
    ],
  }, async ({ }, testInfo) => {
    const base = read(path.join(LOG_DIR, `measure-baseline-${vp}.json`))
    const cand = read(path.join(CAND, '..', `measure-candidate-${vp}.json`))

    expect(base.runs.length).toBe(5)
    expect(cand.runs.length).toBe(5)
    expect(cand.env.chromium).toBe(base.env.chromium)
    expect(cand.env.serverSha256).toBe(base.env.serverSha256)
    expect(cand.viewportSize).toEqual(base.viewportSize)
    for (const r of [...base.runs, ...cand.runs]) expect(r.pageErrors).toEqual([])

    expect(cand.medianEditableTotal).toBeLessThan(base.medianEditableTotal)
    expect(cand.medianSettledTotal).toBeLessThan(base.medianSettledTotal)

    const vite = viteDisplayValues()
    const urls = new Map<string, { baseBytes: number; candBytes: number }>()
    const collect = (m: Measure, key: 'baseBytes' | 'candBytes') => {
      for (const req of m.runs[0].settled.requests) {
        const name = path.basename(new URL(req.url).pathname)
        const cur = urls.get(name) ?? { baseBytes: 0, candBytes: 0 }
        cur[key] = req.encodedBytes
        urls.set(name, cur)
      }
    }
    collect(base, 'baseBytes')
    collect(cand, 'candBytes')

    const lines = [
      `# initial JS transfer (${vp}, viewport ${cand.viewportSize.width}x${cand.viewportSize.height})`,
      '',
      `| metric | baseline | candidate |`,
      `| --- | ---: | ---: |`,
      `| median editable JS bytes | ${base.medianEditableTotal} | ${cand.medianEditableTotal} |`,
      `| median settled JS bytes | ${base.medianSettledTotal} | ${cand.medianSettledTotal} |`,
      `| median editable ms | ${median(base.runs.map((r) => r.editableMs))} | ${median(cand.runs.map((r) => r.editableMs))} |`,
      '',
      `| asset | baseline encoded bytes (settled, run 1) | candidate encoded bytes (settled, run 1) | file bytes (candidate dist) | Vite display (candidate build) |`,
      `| --- | ---: | ---: | ---: | --- |`,
      ...[...urls.entries()].map(([name, v]) => `| ${name} | ${v.baseBytes} | ${v.candBytes} | ${fileBytes(`assets/${name}`) ?? 'n/a'} | ${vite.get(name) ?? 'n/a'} |`),
    ]
    await testInfo.attach(`compare-${vp}.md`, { body: lines.join('\n') + '\n', contentType: 'text/markdown' })
  })
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}
