# 設計書 - REQ-089: useComfyWebSocket.ts主要イベントテストの追加

## 1. 目的と概要
`useComfyWebSocket.ts` は ComfyUI との WebSocket 通信およびプロンプトの送受信やプレビュー画像取得を司る重要なカスタムフックです。現在、`useComfyWebSocket.test.ts` 内の主要テストケースがスキップされているため、これらを有効化し、以下の主要シナリオを検証するユニットテストを実装してフックの堅牢性を保証します。
1. WebSocket の接続ライフサイクル（接続開始、クローズ、エラー時の接続状態の変化）
2. progress, execution_start, executed, execution_complete, execution_error などの各種メッセージイベント受信時のフック内部状態・伝播の検証
3. バイナリデータ（Blob / ArrayBuffer）受信時の画像オブジェクトURL生成処理の検証
4. queuePrompt および cancelGeneration 呼び出し時の正しいパラメータによる API リクエスト送信およびフック状態の更新検証

## 2. 対象コンポーネントと設計

### 2.1 テスト対象
- **ファイル**: `frontend/src/hooks/useComfyWebSocket.ts`
- **テストファイル**: `frontend/src/hooks/__tests__/useComfyWebSocket.test.ts`

### 2.2 テストで使用するモック設計
Vitest環境（jsdom）で動作させるため、以下のモックを用意します。

#### A. WebSocketモッククラス (MockWebSocket)
標準 of WebSocket API を模倣するモッククラスをテスト内で定義し、`globalThis.WebSocket` にスタブします。
```typescript
class MockWebSocket {
  url: string;
  binaryType: string = 'blob';
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  close = vi.fn();

  constructor(url: string) {
    this.url = url;
    // テスト制御のため、自動的または明示的に接続完了イベントをトリガーできるようにする
    setTimeout(() => {
      if (this.onopen) this.onopen();
    }, 0);
  }

  // テスト用ユーティリティ: メッセージイベントのトリガー
  triggerMessage(data: any) {
    if (this.onmessage) {
      this.onmessage(new MessageEvent('message', { data }));
    }
  }

  // テスト用ユーティリティ: クローズイベントのトリガー
  triggerClose() {
    if (this.onclose) this.onclose();
  }

  // テスト用ユーティリティ: エラーイベントのトリガー
  triggerError() {
    if (this.onerror) this.onerror();
  }
}
```

#### B. API と URL.createObjectURL のモック
- `configApi.get`: 適切な設定値（`{ comfy_url: 'http://localhost:8188' }`）を返すようにモック（既存モックを活用）
- `URL.createObjectURL`: Blob画像受信時に呼び出されるため、ダミーURL文字列（例: `'blob:http://localhost:8000/mock-uuid'`）を返すように `vi.stubGlobal('URL', { createObjectURL: vi.fn() })` などでスタブします。
- `globalThis.fetch`: `queuePrompt` (POST `/prompt`) と `cancelGeneration` (POST `/interrupt`) が fetch を使用するため、呼び出しパラメータの検証用モックを定義します。

## 3. テストケース構成

### 3.1 WebSocket接続ライフサイクル (AC-1)
- **概要**: configApi 読み込み完了後に WebSocket インスタンスが作られ、接続成功時に `isConnected` が true になること、切断またはエラー時に false になることを確認します。
- **検証**:
  - `ws.onopen()` トリガー後: `isConnected` が `true`
  - `ws.onclose()` トリガー後: `isConnected` が `false`
  - `ws.onerror()` トリガー後: `isConnected` が `false`

### 3.2 各種 JSON メッセージ受信時の状態更新 (AC-2, AC-4)
- **概要**: `onmessage` を通じて受信した JSON メッセージ（progress, execution_start, executed, execution_complete, execution_error）によって、状態変数が期待通りに更新されることを確認します。
- **各イベントと期待状態**:
  - `execution_start` (data.prompt_id = `'p1'`):
    - `isGenerating` が `true`
    - `progress` が `null`
    - `currentPromptId` が `'p1'`
  - `progress` (value: 2, max: 10):
    - `isGenerating` が `true`
    - `progress` が `{ value: 2, max: 10, percentage: 20 }`
  - `executed` (output.images 内に `{ filename: 'a.png', subfolder: '', type: 'output' }`):
    - `isGenerating` が `false`
    - `progress` が `{ value: 1, max: 1, percentage: 100 }`
    - `previewImage` に構築された view URL が格納されること
  - `execution_complete`:
    - `isGenerating` が `false`
    - `progress` が `{ value: 1, max: 1, percentage: 100 }`
  - `execution_error`:
    - `isGenerating` が `false`
    - `progress` が `null`

### 3.3 バイナリメッセージ受信テスト (AC-3)
- **概要**: `onmessage` で Blob または ArrayBuffer データを受信した際、`URL.createObjectURL` が呼ばれ、戻り値が `previewImage` にセットされることを確認します。
- **検証**:
  - Blob データ送信時、および ArrayBuffer データ送信時、それぞれのプレビューURL生成処理を確認します。

### 3.4 queuePrompt / cancelGeneration の検証 (AC-5)
- **概要**: フックのメソッド `queuePrompt` および `cancelGeneration` が正しいエンドポイント（`/prompt` / `/interrupt`）へ適切なメソッドとパラメータで fetch リクエストを送信することを確認します。
- **検証**:
  - `queuePrompt` 実行時:
    - `fetch` が `POST /prompt` 宛てに `{ prompt: workflow, client_id: clientId }` を送ること
    - 成功時 `isGenerating` が `true` となり、プレビュー画像と進行状況が初期化されること
  - `cancelGeneration` 実行時:
    - `fetch` が `POST /interrupt` 宛てにリクエストを送ること
    - 成功時 `isGenerating` が `false` になること
