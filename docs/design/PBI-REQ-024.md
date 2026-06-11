# 設計書 - REQ-024: スマホなどの外部デバイスからBEに接続できない問題の修正

## 1. 目的と概要
スマホなどの外部デバイス上のブラウザからホストPCのIPアドレス（例: `http://192.168.x.x:5173`）を使用してフロントエンド（FE）にアクセスした際、バックエンドAPI（FastAPI）やComfyUIへの接続が `localhost` や `127.0.0.1` に固定されてハードコードされているため、接続エラーが発生し機能しません。
本設計では、Vite開発サーバーのプロキシ機能を設定し、フロントエンドからのAPIおよびComfyUI（HTTPおよびWebSocket）へのリクエストをプロキシ経由で適切にホストPC内のバックエンドにルーティングします。これにより、外部デバイスからでもホストマシンのIPアドレスを介して正常に接続・画像生成ができるようにします。

## 2. アーキテクチャ設計

### 2.1 Vite開発サーバー設定の更新 (`frontend/vite.config.ts`)
Viteがすべてのネットワークインターフェース（0.0.0.0）でリスンするように `server.host: true` を設定し、バックエンドAPIとComfyUIへのプロキシ設定を追加します。

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // 外部デバイスからのアクセスを許可
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/comfy': {
        target: 'http://127.0.0.1:8188',
        changeOrigin: true,
        ws: true, // WebSocket プロキシを有効化
        rewrite: (path) => path.replace(/^\/comfy/, ''),
      },
    },
  },
})
```

### 2.2 APIクライアントの更新 (`frontend/src/api/client.ts`)
FastAPIバックエンドのベースURLを相対パス `/api` に変更し、Viteプロキシを経由するようにします。

```typescript
// 変更前: const BASE_URL = 'http://localhost:8000/api'
// 変更後:
const BASE_URL = '/api'
```

### 2.3 ComfyUI接続解決ロジックの更新 (`frontend/src/hooks/useComfyWebSocket.ts`)
`resolveComfyUrl` 関数において、ComfyUIへの接続URLが `localhost` または `127.0.0.1` の場合、Viteプロキシの `/comfy` パス（現在のオリジン基準）に置換する処理を追加します。これにより、ローカルホストからのアクセス時は `http://localhost:5173/comfy`、外部デバイスからのアクセス時は `http://192.168.x.x:5173/comfy` として処理され、WebSocketおよびHTTPリクエストがVite経由でプロキシされます。

```typescript
export function resolveComfyUrl(url: string | null): string {
  if (!url) {
    return typeof window !== 'undefined' ? `${window.location.origin}/comfy` : 'http://127.0.0.1:8188'
  }
  // URLがローカルループバック（localhost/127.0.0.1）を指す場合、Viteプロキシの `/comfy` を使用する
  if (url.includes('localhost') || url.includes('127.0.0.1')) {
    return typeof window !== 'undefined' ? `${window.location.origin}/comfy` : url.replace('localhost', '127.0.0.1')
  }
  return url
}
```

### 2.4 設定画面の接続チェックURLの更新 (`frontend/src/pages/SettingsPage.tsx`)
設定画面での接続テスト（Connection Status）において、FastAPI BackendのテストURLを現在のオリジンの `/health` パスに変更します。これにより、外部デバイスからでもプロキシ経由でヘルスチェックが実行可能になります。

```typescript
// 変更前: { label: 'FastAPI Backend', url: 'http://localhost:8000/health' }
// 変更後:
{ label: 'FastAPI Backend', url: typeof window !== 'undefined' ? `${window.location.origin}/health` : 'http://localhost:8000/health' }
```

## 3. UI/UX 仕様
- **ネットワークリスン**: `npm run dev` 起動時にコンソールに `Network: http://192.168.x.x:5173/` が表示され、ホストPC以外の端末からアクセス可能であることが視覚的に確認できるようになります。
- **エラー処理**: 外部デバイスからの接続失敗時、従来のハードコードされた `localhost` へのエラーはコンソールに出力されず、Viteプロキシへのリクエストがタイムアウトまたは接続拒否（BEが起動していない場合）する形になります。

## 4. 依存関係と影響範囲
- **フロントエンドのみの変更**: バックエンド（FastAPI）やComfyUI自体の動作設定に変更を加えることなく、外部接続の問題を解決します。
- **CORS設定との関係**: ブラウザからは同一オリジン（Vite開発サーバー）へのアクセスとなるため、CORSエラーは発生しなくなります。
