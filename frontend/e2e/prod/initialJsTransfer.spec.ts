import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import { installApiStub } from './support/apiStub'
import { startJsTransferRecorder, type JsSnapshot } from './support/jsTransfer'
import { promptChipInput, promptChipInputSelector, type Vp } from './support/promptInput'

const LABEL = process.env.PROD_LABEL ?? ''
if (!LABEL) throw new Error('PROD_LABEL is required (e.g. baseline)')

const RUNS = 5
const QUIET_MS = 500
const QUIET_MAX_MS = 15_000
const REPO_LOGS = path.resolve(process.cwd(), '..', 'docs', 'logs', 'REQ-309')

const VIEWPORTS: Record<Vp, { width: number; height: number }> = {
  desktop: { width: 1280, height: 800 },
  mobile: { width: 375, height: 667 },
}

interface RunResult {
  atEditable: JsSnapshot
  settled: JsSnapshot
  editableMs: number
  quietReached: boolean
  pageErrors: string[]
  apiPaths: string[]
}

function sha256File(file: string): string {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

for (const vp of Object.keys(VIEWPORTS) as Vp[]) {
  const viewport = VIEWPORTS[vp]
  const caseId = `measure-initial-js-${LABEL}-${vp}`

  test(`[REQ-309/AC-1] ${caseId}`, { annotation: [
    { type: 'ac', description: 'REQ-309/AC-1' },
    { type: 'layer', description: 'e2e' },
    { type: 'caseId', description: caseId },
  ] }, async ({ browser }) => {
    const runs: RunResult[] = []
    const startedAt = new Date().toISOString()

    for (let i = 0; i < RUNS; i++) {
      const context = await browser.newContext({ viewport })
      try {
        const page = await context.newPage()
        const pageErrors: string[] = []
        const apiPaths = new Set<string>()
        page.on('pageerror', (e) => pageErrors.push(String(e)))
        await installApiStub(page, {
          observe: (r) => apiPaths.add(`${r.method} ${r.path}`),
        })
        const rec = await startJsTransferRecorder(context, page)

        const t0 = Date.now()
        await page.goto('/', { waitUntil: 'commit' })
        const prompt = promptChipInput(page, vp)
        await expect(prompt).toBeEditable()
        const editableMs = Date.now() - t0
        const atEditable = rec.snapshot()

        await prompt.fill('probe')
        await expect(prompt).toHaveValue('probe')

        const deadline = Date.now() + QUIET_MAX_MS
        while (Date.now() - rec.lastActivityMs() < QUIET_MS && Date.now() < deadline) {
          await page.waitForTimeout(100)
        }
        const quietReached = Date.now() - rec.lastActivityMs() >= QUIET_MS
        const settled = rec.snapshot()

        await expect(page.getByText('システムエラーが発生しました')).toHaveCount(0)
        expect(pageErrors).toEqual([])

        runs.push({
          atEditable,
          settled,
          editableMs,
          quietReached,
          pageErrors: [...pageErrors],
          apiPaths: [...apiPaths].sort(),
        })
      } finally {
        await context.close()
      }
    }

    const distDir = path.resolve(process.cwd(), process.env.PROD_DIST_DIR ?? '')
    const distManifest = path.join(distDir, '..', 'dist-manifest.json')
    const serverFile = path.resolve(process.cwd(), 'e2e', 'prod', 'support', 'serveDist.mjs')
    const browserVersion = browser.version()

    const result = {
      label: LABEL,
      viewport: vp,
      viewportSize: viewport,
      judgment: { selector: promptChipInputSelector(vp), mode: 'chips-input' },
      runs,
      medianEditableTotal: median(runs.map((r) => r.atEditable.totalBytes)),
      medianSettledTotal: median(runs.map((r) => r.settled.totalBytes)),
      env: {
        chromium: browserVersion,
        os: `${os.platform()} ${os.release()}`,
        node: process.version,
        serverSha256: sha256File(serverFile),
        distSha256Manifest: fs.existsSync(distManifest) ? sha256File(distManifest) : null,
        startedAt,
      },
    }

    fs.mkdirSync(REPO_LOGS, { recursive: true })
    const out = path.join(REPO_LOGS, `measure-${LABEL}-${vp}.json`)
    fs.writeFileSync(out, JSON.stringify(result, null, 2) + '\n', { encoding: 'utf8' })
  })
}
