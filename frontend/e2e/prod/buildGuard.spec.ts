import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'

// Build-level acceptance (REQ-309 AC-1 / AC-2). Reads the candidate build artifacts; no browser needed.
const LOG_DIR = path.resolve(process.cwd(), process.env.REQ309_LOG_DIR ?? '../docs/logs/REQ-309')
const CAND = path.join(LOG_DIR, 'candidate')
const BASE = path.join(LOG_DIR, 'baseline')
const FRONTEND = path.resolve(process.cwd())
const LIMIT = 500_000

const annotate = (caseId: string, ac: string) => [
  { type: 'ac', description: ac },
  { type: 'layer', description: 'e2e' },
  { type: 'caseId', description: caseId },
]

function normalizedSha256(file: string): string {
  const text = fs.readFileSync(file).toString('utf8').replace(/\r\n/g, '\n')
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

function walkJs(dir: string, acc: string[] = []): string[] {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name)
    if (ent.isDirectory()) walkJs(full, acc)
    else if (ent.isFile() && ent.name.endsWith('.js')) acc.push(full)
  }
  return acc
}

test('[REQ-309/AC-2] build-log-has-no-large-chunk-warning', { annotation: annotate('build-log-has-no-large-chunk-warning', 'REQ-309/AC-2') }, () => {
  const log = fs.readFileSync(path.join(CAND, 'build.log'), 'utf8')
  expect(log).not.toContain('larger than 500 kB')
  expect(log).toContain('built in')
})

test('[REQ-309/AC-2] config-has-no-suppression', { annotation: annotate('config-has-no-suppression', 'REQ-309/AC-2') }, () => {
  const baseline = JSON.parse(fs.readFileSync(path.join(BASE, 'src-manifest.json'), 'utf8')).files as Record<string, string>
  for (const rel of ['vite.config.ts', 'package.json']) {
    const live = normalizedSha256(path.join(FRONTEND, rel))
    expect(live, `${rel} live sha256 vs baseline`).toBe(baseline[rel])
  }
  const vite = fs.readFileSync(path.join(FRONTEND, 'vite.config.ts'), 'utf8')
  expect(vite).not.toMatch(/chunkSizeWarningLimit|onwarn|logLevel|manualChunks/)
})

test('[REQ-309/AC-2] all-js-chunks-below-limit', { annotation: annotate('all-js-chunks-below-limit', 'REQ-309/AC-2') }, () => {
  const report = JSON.parse(fs.readFileSync(path.join(CAND, 'chunk-report.json'), 'utf8'))
  expect(report.overLimit).toEqual([])
  const dist = path.join(CAND, 'dist')
  const files = walkJs(dist)
  expect(files.length).toBeGreaterThan(0)
  for (const f of files) {
    expect(fs.statSync(f).size, path.relative(dist, f)).toBeLessThanOrEqual(LIMIT)
  }
})

test('[REQ-309/AC-1] initial-graph-excludes-lazy-boundaries', { annotation: annotate('initial-graph-excludes-lazy-boundaries', 'REQ-309/AC-1') }, () => {
  const report = JSON.parse(fs.readFileSync(path.join(CAND, 'chunk-report.json'), 'utf8'))
  expect(report.violations).toEqual([])
  const distNames = walkJs(path.join(CAND, 'dist')).map((f) => path.basename(f)).sort()
  const analysisNames = walkJs(path.join(CAND, 'dist-manifest')).map((f) => path.basename(f)).sort()
  expect(analysisNames).toEqual(distNames)
})
