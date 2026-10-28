// Source manifest: relative path -> sha256 of LF-normalized UTF-8 bytes.
// Usage:
//   node e2e/prod/support/srcManifest.mjs --out <json>
//   node e2e/prod/support/srcManifest.mjs --diff <a.json> <b.json>
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const frontendRoot = path.resolve(here, '..', '..', '..')
const repoRoot = path.resolve(frontendRoot, '..')

const ROOT_FILES = [
  'package.json',
  'package-lock.json',
  'vite.config.ts',
  'index.html',
  'tailwind.config.js',
  'postcss.config.js',
]

function walk(dir, out) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name)
    if (ent.isDirectory()) walk(full, out)
    else if (ent.isFile()) out.push(full)
  }
}

function hashFile(full) {
  const text = fs.readFileSync(full).toString('utf8').replace(/\r\n/g, '\n')
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

function toRel(full) {
  return path.relative(frontendRoot, full).split(path.sep).join('/')
}

function buildManifest() {
  const files = []
  const srcDir = path.join(frontendRoot, 'src')
  if (fs.existsSync(srcDir)) walk(srcDir, files)
  for (const name of ROOT_FILES) {
    const full = path.join(frontendRoot, name)
    if (fs.existsSync(full)) files.push(full)
  }
  for (const name of fs.readdirSync(frontendRoot)) {
    if (/^tsconfig.*\.json$/.test(name)) files.push(path.join(frontendRoot, name))
  }
  const entries = {}
  for (const full of files.sort()) entries[toRel(full)] = hashFile(full)
  const git = (args) => execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' })
  return {
    generatedAt: new Date().toISOString(),
    gitHead: git(['rev-parse', 'HEAD']).trim(),
    gitStatusFrontend: git(['status', '--porcelain', '--', 'frontend']).split('\n').filter(Boolean),
    fileCount: Object.keys(entries).length,
    files: entries,
  }
}

function diff(a, b) {
  const added = []
  const removed = []
  const changed = []
  for (const k of Object.keys(b.files)) {
    if (!(k in a.files)) added.push(k)
    else if (a.files[k] !== b.files[k]) changed.push(k)
  }
  for (const k of Object.keys(a.files)) if (!(k in b.files)) removed.push(k)
  return { added, removed, changed }
}

const argv = process.argv.slice(2)
if (argv[0] === '--out' && argv[1]) {
  const outPath = path.resolve(argv[1])
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, JSON.stringify(buildManifest(), null, 2) + '\n', { encoding: 'utf8' })
  console.log(`manifest written: ${outPath}`)
} else if (argv[0] === '--diff' && argv[1] && argv[2]) {
  const a = JSON.parse(fs.readFileSync(path.resolve(argv[1]), 'utf8'))
  const b = JSON.parse(fs.readFileSync(path.resolve(argv[2]), 'utf8'))
  process.stdout.write(JSON.stringify(diff(a, b), null, 2) + '\n')
} else {
  console.error('usage: srcManifest.mjs --out <json> | --diff <a.json> <b.json>')
  process.exit(2)
}
