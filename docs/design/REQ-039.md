# 設計書: REQ-039 生成ジョブのキャンセル機能

## 1. 概要
ユーザーが生成処理を開始した後にパラメータの編集漏れ等に気づいた際、無駄なリソース消費を防ぐため、実行中およびキュー待機中の生成ジョブを個別に、または一括でキャンセルできるようにします。

## 2. 影響範囲と依存関係
- **frontend**:
  - `frontend/src/store/useGenerationStore.ts`:
    - 単一ジョブをキャンセルするための `cancelJob` アクションを追加。
    - 全ジョブを一括キャンセルするための `cancelAllJobs` アクションを追加。
    - キャンセル処理の成功時に自動でキュー情報を再取得し状態を更新する。
  - `frontend/src/pages/GeneratePage.tsx`:
    - 「Queue: {totalQueueCount}」のラベル部分をインタラクティブなボタン（`cursor-pointer hover:text-white transition-colors`など）に変更し、クリック時にジョブ管理モーダルを開くようにする。
    - 新しい `JobManagementModal` を配置し、表示状態をコントロールする `isJobModalOpen` ステートを追加。
  - `frontend/src/components/JobManagementModal.tsx` [NEW]:
    - 実行中ジョブ（1件）と待機中ジョブ（複数件）を一覧表示するモーダルコンポーネント。
    - 個別キャンセルボタンおよび一括キャンセルボタンを提供。
    - `filterOwnSession` に応じて表示対象ジョブをフィルタリングする。

## 3. 詳細設計

### 3.1. API通信ロジックの追加 (`useGenerationStore.ts`)
以下のメソッドを追加または更新します：
- **`cancelJob(promptId: string)`**:
  - 対象の `promptId` が現在実行中のジョブであるか確認する。
    - 実行中の場合：`/interrupt` (POST) を呼んで処理を中断する。
    - 待機中の場合：`/queue` (POST) に対して `{"delete": [promptId]}` を送信してキューから削除する。
  - キャンセルされたジョブが履歴に残ることを防ぐため、`/history` (POST) に対して `{"delete": [promptId]}` を送信し履歴から抹消する。
  - 現在生成中のジョブが自クライアントの ID と一致している場合、`isGenerating`, `currentPromptId`, `activeClientId` などのステートをクリアし、`localStorage` から `LS_KEYS.CURRENT_PROMPT_ID` を削除する。
  - 最後に `fetchQueue()` を呼び出して、即座に状態を同期する。

- **`cancelAllJobs()`**:
  - キュー内の全てのジョブ（実行中・待機中）の ID リストを取得する。
  - `/interrupt` (POST) で実行中ジョブを中断。
  - `/queue` (POST) に `{"clear": true}` を送信して全ての待機中ジョブを消去。
  - 収集した ID リストを `/history` (POST) の `{"delete": [...]}` に投げて履歴を削除。
  - 自クライアントの生成中ステートをクリア。
  - 最後に `fetchQueue()` を呼び出して同期する。

### 3.2. ジョブ管理モーダルUI (`JobManagementModal.tsx`)
- テーブルまたはリスト形式でジョブを表示。
- **実行中ジョブ**:
  - `queueRunning` の最初の要素（フィルタリング後）を表示。「実行中 (Running)」ステータスと、プロンプトID（先頭8文字など）および自セッションであるかどうかのバッジを表示。
  - 個別キャンセルボタン（ゴミ箱 or バツ印アイコン）を設置。
- **待機中ジョブ一覧**:
  - `queuePending`（フィルタリング後）の一覧をループ表示。
  - キュー順（Pending #1, Pending #2...）とプロンプトIDを表示。
  - 個別キャンセルボタンを設置。
- **一括キャンセルボタン**:
  - モーダル下部または上部に配置。クリック時に確認ダイアログ（または即時）で一括キャンセルを呼び出す。
- **レイアウト**:
  - レスポンシブ設計で、上限を超えた場合は縦スクロール (`max-h-[60vh] overflow-y-auto`)。
  - ComfyUI接続状態やキューが空である場合のプレースホルダー表示。

### 3.3. モーダル表示イベントのトリガー (`GeneratePage.tsx`)
- `Queue: {totalQueueCount}` の表示箇所を `<button>` もしくは `<span>` (インタラクティブ) にし、クリックすると `setIsJobModalOpen(true)` が呼ばれる。

---

## 4. トレードオフ・リスク (Trade-off Disclosure)

### 4.1. 他クライアントや外部ユーザーのジョブ削除リスク
一括キャンセル (`{"clear": true}`) または他ユーザーの待機中ジョブを削除する場合、ComfyUIはマルチユーザーを考慮したパーミッション制御がデフォルトではないため、同じComfyUIサーバーを共用している他のユーザーのジョブも削除されてしまいます。
- **対策**: モーダル内に「自セッションのジョブのみ表示/操作する」制御（`filterOwnSession` によるフィルタリング）と連動させることを基本とします。ただし、ComfyUIの `clear` APIは全削除となるため、一括キャンセルの実行時は注意喚起をするか、あるいは自セッションのジョブのみを個別ループで削除するかという選択肢があります。
- **設計決定**: ComfyUI API の制限として `clear` はキュー全体の全クリアになります。一括キャンセルがクリックされた場合、`filterOwnSession` が有効な場合は自セッションのジョブIDのみを特定して個別に `delete` アレイを `/queue` に送ることで、他人のジョブを誤って削除しないように制御します（自セッションのみ一括削除）。`filterOwnSession` が無効（全表示）の場合は、キュー全体をクリア (`{"clear": true}`) します。これにより安全性を高めます。
