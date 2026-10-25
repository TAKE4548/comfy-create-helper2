/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * Windows環境で発生する .vite/deps ディレクトリの Read-Only 属性および
 * _metadata.json 欠落時の EPERM rmdir クラッシュを自律解消する事前サニタイズ処理。
 */
function cleanBrokenViteDeps(cacheDir: string): void {
  try {
    if (!fs.existsSync(cacheDir)) {
      return
    }

    const depsDir = path.join(cacheDir, 'deps')
    if (fs.existsSync(depsDir)) {
      try {
        // Windows NTFS の Read-Only (attrib +r) 属性を解除
        fs.chmodSync(depsDir, 0o777)
      } catch {
        // 権限エラー等は安全に無視
      }

      const metadataFile = path.join(depsDir, '_metadata.json')
      if (!fs.existsSync(metadataFile)) {
        // キャッシュメタデータが存在しない空洞化・破損フォルダは事前に削除し、
        // Vite 内部の fsp.rm による EPERM 例外を回避
        try {
          fs.rmSync(depsDir, { recursive: true, force: true })
        } catch {
          // 削除失敗時も起動処理自体はブロックしない
        }
      }
    }

    // 過去の破損リネームで残留した deps_temp_* 一時フォルダ群を一掃
    const entries = fs.readdirSync(cacheDir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.startsWith('deps_temp_')) {
        const tempPath = path.join(cacheDir, entry.name)
        try {
          fs.chmodSync(tempPath, 0o777)
          fs.rmSync(tempPath, { recursive: true, force: true })
        } catch {}
      }
    }
  } catch {
    // ディレクトリアクセス例外等で Vite 本体の起動を阻害しないようハンドリング
  }
}

// 設定評価前にキャッシュチェック・自律修復を実行
cleanBrokenViteDeps(path.resolve(__dirname, 'node_modules/.vite'))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    pool: 'forks',
    // REQ-394: keep isolate:true. isolate:false hung the run (cross-file state leak, endless refetch
    // logging) and vmThreads/vmForks break msw/location. Files that need no DOM opt in to the node
    // environment with a "// @vitest-environment node" first line; everything else stays on jsdom.
    poolOptions: { forks: { isolate: true } },
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**'],
  },
  server: {
    host: true, // Listen on all local IP addresses
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        // Preserve the browser Host and Origin so the backend's exact same-origin WS check works on LAN.
        changeOrigin: false,
        ws: true,
      },
      '/health': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
})
