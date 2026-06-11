# インシデント調査報告書 (Incident Report)

## 概要
スマートフォンなどの外部デバイスからフロントエンド（FE）にアクセスした際、バックエンド（BE）および ComfyUI の API / WebSocket への接続が失敗する事象が発生しています。

## 再現手順
1. フロントエンド（Vite 開発サーバー）をホストPCで起動する。
2. ホストPCと同一ネットワーク上のスマートフォンから、ホストPCのIPアドレス（例: `http://192.168.x.x:5173`）を使用してフロントエンドにアクセスする。
3. 画面は表示されるが、APIリクエスト（ワークフロー一覧の取得など）や WebSocket 接続（ComfyUI への接続）がすべて失敗する。

## 発生原因の特定
調査の結果、フロントエンドのコードにおいて、接続先が `localhost` または `127.0.0.1` に固定されている箇所が複数確認されました。

### 1. APIクライアントの固定値
* **対象ファイル**: [client.ts](file:///frontend/src/api/client.ts#L5)
* **該当コード**:
  ```typescript
  const BASE_URL = 'http://localhost:8000/api'
  ```
* **影響**: クライアントブラウザ（スマホ）から見て自分自身（localhost）のポート 8000 に対してリクエストを送信するため、エラーとなります。

### 2. ComfyUI 接続先URLの解決処理
* **対象ファイル**: [useComfyWebSocket.ts](file:///frontend/src/hooks/useComfyWebSocket.ts#L26-29)
* **該当コード**:
  ```typescript
  export function resolveComfyUrl(url: string | null): string {
    if (!url) return 'http://127.0.0.1:8188'
    return url.replace('localhost', '127.0.0.1')
  }
  ```
* **対象ファイル**: [useComfyWebSocket.ts](file:///frontend/src/hooks/useComfyWebSocket.ts#L50)
* **対象ファイル**: [useGenerationStore.ts](file:///frontend/src/store/useGenerationStore.ts#L270)
* **影響**: フォールバック値として `http://localhost:8188` が使用され、さらに `resolveComfyUrl` によって `127.0.0.1` に置換されます。スマホ側のブラウザからはローカルホスト（スマホ自体）への接続となり、ComfyUIに接続できません。

### 3. Vite 開発サーバーの設定不足
* **対象ファイル**: [vite.config.ts](file:///frontend/vite.config.ts)
* **影響**: 現在の Vite 設定ファイルには `server` プロパティが存在せず、デフォルトのローカルホスト接続のみを受け付ける状態になっています。また、バックエンドへのリクエストを中継するためのプロキシ（proxy）設定も存在しません。

## 障害分類
* **分類**: `Type A: Implementation Bug` (実装上のバグ・考慮漏れ)
* **理由**: 外部接続を想定したプロキシ設定やホスト名の動的解決が実装されておらず、開発環境用の `localhost` に固定された状態のままであるため。
