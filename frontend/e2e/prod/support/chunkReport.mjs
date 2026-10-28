// Chunk report for the production build (REQ-309 / T5).
// Usage:
//   node e2e/prod/support/chunkReport.mjs --manifest <dist-manifest/.vite/manifest.json> --dist <dist dir> --out <json>
// Output: { chunks, overLimit, map, initialGraph, violations }
// Exit 0 when the report is written (judgement is made by the spec files); exit 2 on usage/IO errors.
import fs from 'node:fs'
import path from 'node:path'

const LIMIT_BYTES = 500_000

const FORBIDDEN_LAZY_SOURCES = [
  // routes
  'src/pages/LoRAsPage.tsx',
  'src/pages/TagsPage.tsx',
  'src/pages/HistoryPage.tsx',
  'src/pages/SettingsPage.tsx',
  'src/pages/DatasetStudioPage/index.tsx',
  // modals
  'src/components/ProfileBulkEditModal.tsx',
  'src/components/RescanModal.tsx',
  'src/components/UploadWorkflowModal.tsx',
  'src/components/WorkflowManageModal.tsx',
  'src/components/PresetManagerPanel.tsx',
  'src/components/HistoryModalPreview.tsx',
  'src/components/JobManagementModal.tsx',
  'src/components/AddSnapshotToAlbumModal.tsx',
  'src/components/SceneGeneratorModal.tsx',
  'src/components/PresetConflictModal.tsx',
  'src/components/BypassSettingsModal.tsx',
  'src/components/ParamSyncModal.tsx',
  'src/pages/GeneratePage/components/PromptTranslationModal.tsx',
  'src/pages/GeneratePage/components/SaveAsTagSetModal.tsx',
]

const GENERATE_KEY = 'src/pages/GeneratePage.tsx'

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i += 2) {
    const k = argv[i]
    const v = argv[i + 1]
    if (!k?.startsWith('--') || v === undefined) throw new Error(`bad argument near ${k}`)
    out[k.slice(2)] = v
  }
  return out
}

function walkJs(dir, acc = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name)
    if (ent.isDirectory()) walkJs(full, acc)
    else if (ent.isFile() && ent.name.endsWith('.js')) acc.push(full)
  }
  return acc
}

function closure(manifest, startKeys) {
  const seen = new Set()
  const stack = [...startKeys]
  while (stack.length) {
    const key = stack.pop()
    if (seen.has(key)) continue
    seen.add(key)
    const entry = manifest[key]
    if (!entry) continue
    for (const imp of entry.imports ?? []) stack.push(imp)
  }
  return seen
}

function main() {
  let args
  try {
    args = parseArgs(process.argv.slice(2))
  } catch (e) {
    console.error(String(e))
    process.exit(2)
  }
  const { manifest: manifestPath, dist: distArg, out: outPath } = args
  if (!manifestPath || !distArg || !outPath) {
    console.error('usage: chunkReport.mjs --manifest <manifest.json> --dist <dir> --out <json>')
    process.exit(2)
  }

  const manifest = JSON.parse(fs.readFileSync(path.resolve(manifestPath), 'utf8'))
  const distDir = path.resolve(distArg)
  const violations = []

  // dist (served) vs dist-manifest (analysis build): asset filename sets must match.
  const distJs = walkJs(distDir).map((f) => path.relative(distDir, f).split(path.sep).join('/'))
  const analysisDir = path.dirname(path.dirname(path.resolve(manifestPath)))
  const analysisJs = walkJs(analysisDir).map((f) => path.relative(analysisDir, f).split(path.sep).join('/'))
  const distSet = new Set(distJs)
  const analysisSet = new Set(analysisJs)
  for (const f of distSet) if (!analysisSet.has(f)) violations.push(`asset-set-mismatch: only in dist: ${f}`)
  for (const f of analysisSet) if (!distSet.has(f)) violations.push(`asset-set-mismatch: only in dist-manifest: ${f}`)

  const chunks = distJs
    .map((rel) => ({ file: rel, bytes: fs.statSync(path.join(distDir, rel)).size }))
    .sort((a, b) => b.bytes - a.bytes)
  const overLimit = chunks.filter((c) => c.bytes > LIMIT_BYTES).map((c) => c.file)

  const map = {}
  for (const [key, entry] of Object.entries(manifest)) map[key] = entry.file

  // Vite sets `src` only on facade chunks. Some dynamic-entry chunks (e.g. LoRAsPage, GeneratePage,
  // HistoryModalPreview, AddSnapshotToAlbumModal) carry no `src` key; they are resolved here by the
  // chunk name `_<basename>-<hash>.js` restricted to isDynamicEntry chunks. Each such mapping is listed
  // in `mappingNotes` so that the reviewer can see it was not a direct source-key hit.
  const mappingNotes = []
  const resolveSource = (src) => {
    if (manifest[src]) return { entry: manifest[src], mappedBy: 'src-key' }
    const base = path.basename(src).replace(/\.tsx?$/, '')
    const folder = path.basename(path.dirname(src))
    const candidates = Object.entries(manifest).filter(([k, e]) => {
      if (!e.isDynamicEntry || e.src) return false
      const name = path.basename(k)
      return name.startsWith(`_${base}-`) || (base === 'index' && name.startsWith(`_${folder}-`))
    })
    if (candidates.length === 1) {
      mappingNotes.push(`${src} -> ${candidates[0][1].file} (mapped by chunk name ${candidates[0][0]}; no src key)`)
      return { entry: candidates[0][1], mappedBy: 'chunk-name' }
    }
    return null
  }

  const entryKeys = Object.entries(manifest)
    .filter(([, e]) => e.isEntry)
    .map(([k]) => k)
  const startKeys = [...entryKeys]
  const generateResolved = resolveSource(GENERATE_KEY)
  if (generateResolved && !map[GENERATE_KEY]) map[GENERATE_KEY] = generateResolved.entry.file
  if (generateResolved) startKeys.push(generateResolved.entry === manifest[GENERATE_KEY] ? GENERATE_KEY : Object.keys(manifest).find((k) => manifest[k] === generateResolved.entry))
  else violations.push(`missing-generate-entry: ${GENERATE_KEY}`)
  const closureKeys = closure(manifest, startKeys)
  const initialGraphSet = new Set([...closureKeys].map((k) => manifest[k]?.file).filter(Boolean))
  const initialGraph = [...initialGraphSet].sort()

  for (const src of FORBIDDEN_LAZY_SOURCES) {
    const resolved = resolveSource(src)
    if (!resolved) {
      violations.push(`not-lazy-split (no manifest key or unique chunk name): ${src}`)
      continue
    }
    const file = resolved.entry.file
    if (!map[src]) map[src] = file
    if (!resolved.entry.isDynamicEntry) violations.push(`not-dynamic-entry: ${src} -> ${file}`)
    if (initialGraphSet.has(file)) violations.push(`lazy-boundary-in-initial-graph: ${src} -> ${file}`)
  }

  const report = {
    chunks,
    overLimit,
    map,
    initialGraph,
    violations,
    mappingNotes,
    summary: {
      chunkCount: chunks.length,
      largestChunk: chunks[0] ?? null,
      limitBytes: LIMIT_BYTES,
      initialGraphBytes: initialGraph.reduce((sum, f) => {
        const c = chunks.find((x) => x.file === f)
        return sum + (c ? c.bytes : 0)
      }, 0),
      forbiddenChecked: FORBIDDEN_LAZY_SOURCES.length,
    },
  }

  const out = path.resolve(outPath)
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n', { encoding: 'utf8' })
  console.log(`chunk report written: ${out} chunks=${chunks.length} overLimit=${overLimit.length} violations=${violations.length}`)
}

main()
